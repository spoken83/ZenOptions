import { storage } from '../storage';
import { marketDataService } from './marketData';
import { indicatorService } from './indicators';
import { marketContextService } from './marketContext';
import type { InsertScanResult, SRLevel } from '@shared/schema';

interface ScanCandidate {
  shortStrike: number;
  longStrike: number;
  width: number;
  delta: number;
  creditMidCents: number;
  dte: number;
  rr: number;
  maxLossCents: number;
  oi: number;
  baCents: number;
  iv: number | null; // Implied Volatility from short strike option (decimal, e.g., 0.32 = 32%)
  score: number;
}

// Iron Condor candidate (both PUT and CALL spreads)
interface IronCondorCandidate {
  // PUT side (credit put spread)
  putShortStrike: number;
  putLongStrike: number;
  putDelta: number;
  putCreditCents: number;
  putIv: number | null; // IV from PUT short strike
  putShortOI: number; // Open Interest for PUT short
  putLongOI: number; // Open Interest for PUT long
  // CALL side (credit call spread)
  callShortStrike: number;
  callLongStrike: number;
  callDelta: number;
  callCreditCents: number;
  callIv: number | null; // IV from CALL short strike
  callShortOI: number; // Open Interest for CALL short
  callLongOI: number; // Open Interest for CALL long
  // Combined metrics
  width: number; // Same width on both sides ($10)
  totalCreditCents: number;
  dte: number;
  rr: number; // Combined risk:reward
  maxLossCents: number;
  avgIv: number | null; // Average IV of both short strikes
  score: number;
}

// Logger class for capturing console output
class LogCapture {
  private logs: string[] = [];
  
  log(...args: any[]) {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    this.logs.push(message);
    console.log(...args); // Also print to actual console
  }
  
  getLog(): string {
    return this.logs.join('\n');
  }
  
  clear() {
    this.logs = [];
  }
}

export class ScannerService {
  private currentBatchId: string | null = null;
  
  // Iron Condor scan settings (separate from Credit Spread settings)
  private readonly IC_SETTINGS = {
    deltaMin: 0.15,
    deltaMax: 0.21,
    width: 10, // $10 wide spreads
    targetRR: 2.5, // 1:2.5 risk:reward
    rrMin: 2.0, // Allow slightly better
    rrMax: 3.5, // Allow slightly worse
  };

  /**
   * Detect if price is "ranging" over the last 3 months
   * Ranging = price staying within a bounded range, not trending strongly up or down
   * Returns: { isRanging: boolean, rangingScore: number (0-100), reason: string }
   */
  private async detectRangingPrice(symbol: string, logger?: LogCapture): Promise<{ isRanging: boolean; rangingScore: number; reason: string; priceRange?: { high: number; low: number; current: number; midpoint: number } }> {
    try {
      // Fetch 90 days of historical data (3 months)
      const historicalData = await marketDataService.getHistoricalData(symbol, 90);
      
      if (historicalData.length < 60) {
        return { isRanging: false, rangingScore: 0, reason: 'Insufficient historical data (need 60+ days)' };
      }

      const closes = historicalData.map(d => d.close);
      const highs = historicalData.map(d => d.high);
      const lows = historicalData.map(d => d.low);
      
      const currentPrice = closes[closes.length - 1];
      const periodHigh = Math.max(...highs);
      const periodLow = Math.min(...lows);
      const priceRange = periodHigh - periodLow;
      const midpoint = (periodHigh + periodLow) / 2;
      
      // Calculate price position within range (0 = at low, 1 = at high)
      const pricePosition = (currentPrice - periodLow) / priceRange;
      
      // Calculate trend using linear regression
      const n = closes.length;
      const xSum = (n * (n - 1)) / 2;
      const xSqSum = (n * (n - 1) * (2 * n - 1)) / 6;
      const ySum = closes.reduce((a, b) => a + b, 0);
      const xySum = closes.reduce((sum, y, i) => sum + i * y, 0);
      
      const slope = (n * xySum - xSum * ySum) / (n * xSqSum - xSum * xSum);
      const avgPrice = ySum / n;
      
      // Normalize slope as percentage of average price per day
      const dailyTrendPercent = (slope / avgPrice) * 100;
      const totalTrendPercent = dailyTrendPercent * n;
      
      // Calculate volatility (standard deviation of daily returns)
      const returns = [];
      for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const dailyVolatility = Math.sqrt(variance) * 100;
      
      // Ranging criteria:
      // 1. Total trend should be < 15% (not strongly trending)
      // 2. Price should be in the middle 60% of the range (not at extremes)
      // 3. Range should be reasonable (5-25% of price)
      
      const rangePercent = (priceRange / avgPrice) * 100;
      const isMidRange = pricePosition >= 0.20 && pricePosition <= 0.80;
      const isLowTrend = Math.abs(totalTrendPercent) < 15;
      const isReasonableRange = rangePercent >= 5 && rangePercent <= 30;
      
      // Calculate ranging score (0-100)
      let rangingScore = 0;
      
      // Trend score (40%): Lower trend = higher score
      const trendScore = Math.max(0, 100 - Math.abs(totalTrendPercent) * 5);
      rangingScore += trendScore * 0.40;
      
      // Position score (30%): Closer to middle = higher score
      const positionFromMid = Math.abs(pricePosition - 0.5);
      const positionScore = Math.max(0, 100 - positionFromMid * 200);
      rangingScore += positionScore * 0.30;
      
      // Range score (30%): Reasonable range = higher score
      let rangeScore = 0;
      if (rangePercent >= 8 && rangePercent <= 20) {
        rangeScore = 100;
      } else if (rangePercent < 8) {
        rangeScore = Math.max(0, rangePercent * 12.5);
      } else {
        rangeScore = Math.max(0, 100 - (rangePercent - 20) * 5);
      }
      rangingScore += rangeScore * 0.30;
      
      const isRanging = rangingScore >= 50 && isLowTrend && isMidRange;
      
      (logger || console).log(`\n📊 RANGING DETECTION FOR ${symbol}:`);
      (logger || console).log(`   • 3-Month High: $${periodHigh.toFixed(2)}`);
      (logger || console).log(`   • 3-Month Low: $${periodLow.toFixed(2)}`);
      (logger || console).log(`   • Range: $${priceRange.toFixed(2)} (${rangePercent.toFixed(1)}%)`);
      (logger || console).log(`   • Current Price: $${currentPrice.toFixed(2)} (${(pricePosition * 100).toFixed(0)}% of range)`);
      (logger || console).log(`   • Trend: ${totalTrendPercent >= 0 ? '+' : ''}${totalTrendPercent.toFixed(1)}% over period`);
      (logger || console).log(`   • Daily Volatility: ${dailyVolatility.toFixed(2)}%`);
      (logger || console).log(`   • Ranging Score: ${rangingScore.toFixed(0)}/100`);
      (logger || console).log(`   • Is Ranging: ${isRanging ? '✅ YES' : '❌ NO'}`);
      
      let reason = '';
      if (!isLowTrend) {
        reason = `Strong trend detected (${totalTrendPercent.toFixed(1)}%)`;
      } else if (!isMidRange) {
        reason = `Price at range extreme (${(pricePosition * 100).toFixed(0)}% position)`;
      } else if (rangingScore < 50) {
        reason = `Low ranging score (${rangingScore.toFixed(0)}/100)`;
      } else {
        reason = `Price ranging in $${periodLow.toFixed(2)}-$${periodHigh.toFixed(2)} range`;
      }
      
      return { 
        isRanging, 
        rangingScore, 
        reason,
        priceRange: { high: periodHigh, low: periodLow, current: currentPrice, midpoint }
      };
    } catch (error) {
      (logger || console).log(`   ⚠️  Error detecting ranging: ${(error as Error).message}`);
      return { isRanging: false, rangingScore: 0, reason: `Error: ${(error as Error).message}` };
    }
  }

  /**
   * Check Iron Condor entry signal
   * Criteria: Neutral RSI (40-60), price mid-range between S/R, ranging price history, no StochRSI extremes
   */
  private checkIronCondorSignal(
    indicators: any, 
    config: any, 
    rangingResult: { isRanging: boolean; rangingScore: number; reason: string; priceRange?: { high: number; low: number; current: number; midpoint: number } },
    logger?: LogCapture
  ): { isValid: boolean; reason: string; details?: any } {
    const rsi = indicators.rsi14;
    const stochRSI_K = indicators.stochK ?? indicators.stochRSI_K ?? 50; // Use stochK (stored field) or fallback
    const price = indicators.price;
    const support = config.support;
    const resistance = config.resistance;

    (logger || console).log(`\n🦅 IRON CONDOR SIGNAL CHECK FOR ${config.symbol || 'TICKER'}:`);
    
    // Check 1: Neutral RSI (40-60)
    const isNeutralRSI = rsi >= 40 && rsi <= 60;
    (logger || console).log(`   • RSI Neutral (40-60)? ${isNeutralRSI ? '✅ YES' : '❌ NO'} (${rsi.toFixed(2)})`);
    
    // Check 2: StochRSI NOT at extremes (momentum filter)
    // If StochRSI < 20 (oversold) or > 80 (overbought), reject IC - directional signal takes priority
    const isStochRSIOversold = stochRSI_K < 20;
    const isStochRSIOverbought = stochRSI_K > 80;
    const hasNoStochRSIExtremes = !isStochRSIOversold && !isStochRSIOverbought;
    (logger || console).log(`   • StochRSI K: ${stochRSI_K.toFixed(2)}`);
    (logger || console).log(`   • StochRSI Not Extreme (20-80)? ${hasNoStochRSIExtremes ? '✅ YES' : '❌ NO'} ${isStochRSIOversold ? '(OVERSOLD - CS priority)' : isStochRSIOverbought ? '(OVERBOUGHT - CS priority)' : ''}`);
    
    // Check 3: Price mid-range between S/R
    let isPriceMidRange = false;
    let pricePositionInSR = 0;
    
    if (support && resistance && resistance > support) {
      const srRange = resistance - support;
      pricePositionInSR = (price - support) / srRange;
      isPriceMidRange = pricePositionInSR >= 0.30 && pricePositionInSR <= 0.70;
      (logger || console).log(`   • S/R Range: $${support.toFixed(2)} - $${resistance.toFixed(2)}`);
      (logger || console).log(`   • Price Position in S/R: ${(pricePositionInSR * 100).toFixed(0)}%`);
      (logger || console).log(`   • Price Mid-Range (30-70%)? ${isPriceMidRange ? '✅ YES' : '❌ NO'}`);
    } else {
      (logger || console).log(`   • Price Mid-Range: ❌ NO (Missing S/R levels)`);
    }
    
    // Check 4: Ranging price history
    const isRanging = rangingResult.isRanging;
    (logger || console).log(`   • Ranging History? ${isRanging ? '✅ YES' : '❌ NO'} (Score: ${rangingResult.rangingScore.toFixed(0)}/100)`);
    
    // All four conditions must be met
    const isValid = isNeutralRSI && hasNoStochRSIExtremes && isPriceMidRange && isRanging;
    
    if (isValid) {
      (logger || console).log(`   🎯 IRON CONDOR SIGNAL TRIGGERED!`);
      return {
        isValid: true,
        reason: 'Neutral RSI, no momentum extremes, price mid-range, and ranging history detected',
        details: {
          rsi,
          stochRSI_K,
          price,
          support,
          resistance,
          pricePositionInSR,
          rangingScore: rangingResult.rangingScore,
          priceRange: rangingResult.priceRange
        }
      };
    } else {
      let reason = '';
      if (!isNeutralRSI) reason = `RSI not neutral (${rsi.toFixed(2)})`;
      else if (!hasNoStochRSIExtremes) reason = `StochRSI at extreme (${stochRSI_K.toFixed(2)}) - CS takes priority`;
      else if (!isPriceMidRange) reason = `Price not mid-range in S/R`;
      else if (!isRanging) reason = rangingResult.reason;
      
      (logger || console).log(`   ❌ NO IRON CONDOR SIGNAL: ${reason}`);
      return { isValid: false, reason };
    }
  }

  /**
   * Find best Iron Condor spread (both PUT and CALL sides)
   */
  private findBestIronCondor(
    chain: any[], 
    price: number, 
    config: any, 
    expiry: Date, 
    logger?: LogCapture
  ): IronCondorCandidate | null {
    const now = new Date();
    const dte = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Use configurable IC settings from user preferences, with fallback to defaults
    const icSettings = config.icSettings || {
      deltaMin: this.IC_SETTINGS.deltaMin,
      deltaMax: this.IC_SETTINGS.deltaMax,
      width: this.IC_SETTINGS.width,
      targetRR: this.IC_SETTINGS.targetRR,
      rrMin: this.IC_SETTINGS.rrMin,
      rrMax: this.IC_SETTINGS.rrMax,
    };
    
    const width = icSettings.width;
    const deltaMin = icSettings.deltaMin;
    const deltaMax = icSettings.deltaMax;
    const targetRR = icSettings.targetRR;
    const rrMin = icSettings.rrMin;
    const rrMax = icSettings.rrMax;

    // Get minOI from config
    const minOI = config.minOI || 100;
    
    (logger || console).log(`\n🦅 IRON CONDOR OPTIONS ANALYSIS FOR ${config.symbol || 'TICKER'}`);
    (logger || console).log(`📅 Expiry: ${expiry.toISOString().split('T')[0]} (${dte} DTE)`);
    (logger || console).log(`💰 Current Price: $${price.toFixed(2)}`);
    (logger || console).log(`📊 Option Chain: ${chain.length} strikes available`);
    (logger || console).log(`🎯 Target: ${deltaMin}-${deltaMax} delta, $${width} wide, 1:${targetRR} R:R`);
    (logger || console).log(`📈 Minimum OI Required: ${minOI}`);

    // Filter PUT options (below current price, for credit put spread)
    const putOptions = chain.filter(opt => opt.type === 'put');
    // Filter CALL options (above current price, for credit call spread)
    const callOptions = chain.filter(opt => opt.type === 'call');

    (logger || console).log(`🔍 PUT Options: ${putOptions.length} strikes`);
    (logger || console).log(`🔍 CALL Options: ${callOptions.length} strikes`);

    // Track OI rejections for logging
    let putShortsSkippedOI = 0;
    let callShortsSkippedOI = 0;

    // Find PUT short strikes in delta range, below support, with sufficient OI
    const putShorts = putOptions.filter(opt => {
      const delta = Math.abs(opt.delta || 0);
      const strike = opt.strike;
      const oi = opt.openInterest || 0;
      
      // Check OI first
      if (oi < minOI) {
        if (delta >= deltaMin && delta <= deltaMax) {
          putShortsSkippedOI++;
        }
        return false;
      }
      
      // Short strike must be below support
      if (config.support && strike >= config.support) {
        return false;
      }
      
      return delta >= deltaMin && delta <= deltaMax;
    });

    // Find CALL short strikes in delta range, above resistance, with sufficient OI
    const callShorts = callOptions.filter(opt => {
      const delta = Math.abs(opt.delta || 0);
      const strike = opt.strike;
      const oi = opt.openInterest || 0;
      
      // Check OI first
      if (oi < minOI) {
        if (delta >= deltaMin && delta <= deltaMax) {
          callShortsSkippedOI++;
        }
        return false;
      }
      
      // Short strike must be above resistance
      if (config.resistance && strike <= config.resistance) {
        return false;
      }
      
      return delta >= deltaMin && delta <= deltaMax;
    });

    (logger || console).log(`🔍 Qualifying PUT shorts (delta ${deltaMin}-${deltaMax}, below support, OI≥${minOI}): ${putShorts.length}`);
    if (putShortsSkippedOI > 0) {
      (logger || console).log(`   ⚠️  ${putShortsSkippedOI} PUT strikes skipped due to OI < ${minOI}`);
    }
    (logger || console).log(`🔍 Qualifying CALL shorts (delta ${deltaMin}-${deltaMax}, above resistance, OI≥${minOI}): ${callShorts.length}`);
    if (callShortsSkippedOI > 0) {
      (logger || console).log(`   ⚠️  ${callShortsSkippedOI} CALL strikes skipped due to OI < ${minOI}`);
    }

    if (putShorts.length === 0 || callShorts.length === 0) {
      (logger || console).log(`❌ Cannot form Iron Condor - missing ${putShorts.length === 0 ? 'PUT' : 'CALL'} short strikes`);
      return null;
    }

    let bestIC: IronCondorCandidate | null = null;
    let bestScore = -1;
    let longsSkippedOI = 0;

    // Test combinations
    for (const putShort of putShorts) {
      const putLongStrike = putShort.strike - width;
      const putLong = putOptions.find(opt => opt.strike === putLongStrike);
      
      if (!putLong) continue;
      
      // Check OI on put long leg
      const putLongOI = putLong.openInterest || 0;
      if (putLongOI < minOI) {
        longsSkippedOI++;
        continue;
      }

      for (const callShort of callShorts) {
        const callLongStrike = callShort.strike + width;
        const callLong = callOptions.find(opt => opt.strike === callLongStrike);
        
        if (!callLong) continue;
        
        // Check OI on call long leg
        const callLongOI = callLong.openInterest || 0;
        if (callLongOI < minOI) {
          longsSkippedOI++;
          continue;
        }

        // Calculate credits
        const putShortMid = (putShort.bid + putShort.ask) / 2;
        const putLongMid = (putLong.bid + putLong.ask) / 2;
        const putCredit = putShortMid - putLongMid;

        const callShortMid = (callShort.bid + callShort.ask) / 2;
        const callLongMid = (callLong.bid + callLong.ask) / 2;
        const callCredit = callShortMid - callLongMid;

        if (putCredit <= 0 || callCredit <= 0) continue;

        const totalCredit = putCredit + callCredit;
        const totalCreditCents = Math.round(totalCredit * 100);
        
        // Max loss = width - total credit (per contract, multiplied by 100)
        const maxLossPerContract = (width - totalCredit) * 100;
        const rr = maxLossPerContract / (totalCredit * 100);

        // Check R:R constraint
        if (rr < rrMin || rr > rrMax) continue;

        // Calculate score (favor balanced premiums and better R:R)
        const premiumBalance = Math.min(putCredit, callCredit) / Math.max(putCredit, callCredit);
        const rrScore = Math.max(0, 100 - Math.abs(rr - targetRR) * 30);
        const balanceScore = premiumBalance * 100;
        const deltaAvg = (Math.abs(putShort.delta || 0) + Math.abs(callShort.delta || 0)) / 2;
        // Delta score uses midpoint of configured range
        const deltaMidpoint = (deltaMin + deltaMax) / 2;
        const deltaScore = deltaAvg >= deltaMin && deltaAvg <= deltaMax ? 100 : Math.max(0, 100 - Math.abs(deltaAvg - deltaMidpoint) * 500);
        
        const score = rrScore * 0.40 + balanceScore * 0.30 + deltaScore * 0.30;

        if (score > bestScore) {
          bestScore = score;
          // Extract IV from short strikes
          const putIv = putShort.iv || null;
          const callIv = callShort.iv || null;
          const avgIv = (putIv && callIv) ? (putIv + callIv) / 2 : (putIv || callIv);
          
          bestIC = {
            putShortStrike: putShort.strike,
            putLongStrike: putLong.strike,
            putDelta: Math.abs(putShort.delta || 0),
            putCreditCents: Math.round(putCredit * 100),
            putIv,
            putShortOI: putShort.openInterest || 0,
            putLongOI: putLong.openInterest || 0,
            callShortStrike: callShort.strike,
            callLongStrike: callLong.strike,
            callDelta: Math.abs(callShort.delta || 0),
            callCreditCents: Math.round(callCredit * 100),
            callIv,
            callShortOI: callShort.openInterest || 0,
            callLongOI: callLong.openInterest || 0,
            width,
            totalCreditCents,
            dte,
            rr,
            maxLossCents: Math.round(maxLossPerContract * 100),
            avgIv,
            score
          };
        }
      }
    }

    if (longsSkippedOI > 0) {
      (logger || console).log(`   ⚠️  ${longsSkippedOI} spread combinations skipped due to long leg OI < ${minOI}`);
    }
    
    if (bestIC) {
      (logger || console).log(`\n🏆 BEST IRON CONDOR FOUND:`);
      (logger || console).log(`   PUT SPREAD: ${bestIC.putShortStrike}/${bestIC.putLongStrike} (δ ${bestIC.putDelta.toFixed(3)}) = $${(bestIC.putCreditCents/100).toFixed(2)} credit`);
      (logger || console).log(`      OI: Short=${bestIC.putShortOI.toLocaleString()}, Long=${bestIC.putLongOI.toLocaleString()}`);
      (logger || console).log(`   CALL SPREAD: ${bestIC.callShortStrike}/${bestIC.callLongStrike} (δ ${bestIC.callDelta.toFixed(3)}) = $${(bestIC.callCreditCents/100).toFixed(2)} credit`);
      (logger || console).log(`      OI: Short=${bestIC.callShortOI.toLocaleString()}, Long=${bestIC.callLongOI.toLocaleString()}`);
      (logger || console).log(`   TOTAL CREDIT: $${(bestIC.totalCreditCents/100).toFixed(2)}`);
      (logger || console).log(`   MAX LOSS: $${(bestIC.maxLossCents/100).toFixed(2)}`);
      (logger || console).log(`   R:R: 1:${bestIC.rr.toFixed(2)}`);
      (logger || console).log(`   SCORE: ${bestIC.score.toFixed(2)}`);
    } else {
      (logger || console).log(`\n❌ NO VALID IRON CONDOR FOUND`);
    }

    return bestIC;
  }

  /**
   * Scan a ticker for Iron Condor opportunity
   */
  async scanTickerForIC(userId: string, symbol: string): Promise<any> {
    const logger = new LogCapture();
    
    try {
      logger.log(`\n🦅 ========== IRON CONDOR SCAN: ${symbol} ==========`);
      
      const ticker = await storage.getTicker(userId, symbol);
      const indicators = await storage.getLatestIndicators(userId, symbol);
      
      if (!ticker || !indicators) {
        return {
          symbol,
          strategyType: 'IRON_CONDOR',
          status: 'no_signal',
          reason: 'Missing config or indicators',
          batchId: this.currentBatchId || 'manual',
          analysisLog: logger.getLog(),
        };
      }

      // Load user's scan settings
      const scanSettings = await this.loadScanSettings(userId);

      const supportLevels = (ticker.supportLevels as SRLevel[]) || [];
      const resistanceLevels = (ticker.resistanceLevels as SRLevel[]) || [];
      
      // Get minOI from ticker config or scan settings
      const effectiveMinOI = ticker.minOI ?? scanSettings.minOi;
      
      const config = {
        symbol,
        support: supportLevels[0]?.value,
        resistance: resistanceLevels[0]?.value,
        minOI: effectiveMinOI,
        // Pass IC settings from user config
        icSettings: {
          deltaMin: scanSettings.icDeltaMin,
          deltaMax: scanSettings.icDeltaMax,
          width: scanSettings.icWidth,
          targetRR: 2.5, // Fixed target
          rrMin: 2.0,
          rrMax: 3.5,
        },
      };

      // Step 1: Detect ranging price
      const rangingResult = await this.detectRangingPrice(symbol, logger);
      
      // Step 2: Check IC entry signal
      const signal = this.checkIronCondorSignal(indicators, config, rangingResult, logger);
      
      if (!signal.isValid) {
        return {
          symbol,
          strategyType: 'IRON_CONDOR',
          status: 'no_signal',
          reason: signal.reason,
          batchId: this.currentBatchId || 'manual',
          analysisLog: logger.getLog(),
        };
      }

      // Step 3: Find ALL option expiries in DTE range (MULTI-EXPIRY ANALYSIS)
      const dteTarget = scanSettings.dteTarget;
      const dteBuffer = scanSettings.dteBuffer;
      const dteMin = dteTarget - dteBuffer;
      const dteMax = dteTarget + dteBuffer;
      
      const expiries = await marketDataService.findAllExpiriesInRange(symbol, dteTarget, dteBuffer);
      logger.log(`\n📅 MULTI-EXPIRY ANALYSIS for ${symbol} (Iron Condor):`);
      logger.log(`   Target: ${dteTarget} DTE ±${dteBuffer} (${dteMin}-${dteMax} DTE range)`);
      logger.log(`   Found: ${expiries.length} expiries to analyze`);
      
      if (expiries.length === 0) {
        return {
          symbol,
          strategyType: 'IRON_CONDOR',
          status: 'no_qualified_spread',
          reason: `No suitable option expiry found in ${dteMin}-${dteMax} DTE range`,
          batchId: this.currentBatchId || 'manual',
          analysisLog: logger.getLog(),
        };
      }

      // Step 4: Analyze EACH expiry and find the best Iron Condor across all of them
      const price = indicators.price || 0;
      let bestOverallIC: IronCondorCandidate | null = null;
      let bestOverallExpiry: Date | null = null;
      let expiriesAnalyzed = 0;
      let expiriesWithICs = 0;
      
      for (const expiry of expiries) {
        const dte = Math.floor((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        logger.log(`\n🔍 Analyzing expiry: ${expiry.toISOString().split('T')[0]} (${dte} DTE)`);
        
        const chain = await marketDataService.getOptionChain(symbol, expiry);
        expiriesAnalyzed++;
        
        if (chain.length === 0) {
          logger.log(`   ❌ No option chain data for this expiry`);
          continue;
        }
        
        const candidateIC = this.findBestIronCondor(chain, price, config, expiry, logger);
        
        if (candidateIC) {
          expiriesWithICs++;
          logger.log(`   ✅ Found qualifying Iron Condor with score: ${candidateIC.score.toFixed(2)}`);
          
          // Keep the best IC across all expiries (highest score wins)
          if (!bestOverallIC || candidateIC.score > bestOverallIC.score) {
            bestOverallIC = candidateIC;
            bestOverallExpiry = expiry;
            logger.log(`   🏆 NEW BEST IRON CONDOR (score: ${candidateIC.score.toFixed(2)})`);
          }
        } else {
          logger.log(`   ❌ No qualifying Iron Condor for this expiry`);
        }
      }
      
      // Summary of multi-expiry analysis
      logger.log(`\n📊 MULTI-EXPIRY SUMMARY for ${symbol} (Iron Condor):`);
      logger.log(`   Expiries analyzed: ${expiriesAnalyzed}`);
      logger.log(`   Expiries with qualifying ICs: ${expiriesWithICs}`);

      if (!bestOverallIC || !bestOverallExpiry) {
        logger.log(`   ❌ No qualifying Iron Condors found across any expiry`);
        return {
          symbol,
          strategyType: 'IRON_CONDOR',
          status: 'no_qualified_spread',
          reason: 'Iron Condor signal but no spread meets criteria across any expiry',
          signal: 'IC SETUP CANDIDATE',
          batchId: this.currentBatchId || 'manual',
          analysisLog: logger.getLog(),
        };
      }

      // Calculate Expected Move for the best Iron Condor
      const stockPrice = indicators.price || 0;
      const avgIv = bestOverallIC.avgIv;
      let expectedMove: number | null = null;
      
      if (avgIv && stockPrice > 0 && bestOverallIC.dte > 0) {
        expectedMove = stockPrice * avgIv * Math.sqrt(bestOverallIC.dte / 365);
        logger.log(`📈 Expected Move: ±$${expectedMove.toFixed(2)} (Avg IV: ${(avgIv * 100).toFixed(1)}%, ${bestOverallIC.dte} DTE)`);
      }
      
      logger.log(`   🏆 BEST OVERALL: ${bestOverallExpiry.toISOString().split('T')[0]} (${bestOverallIC.dte} DTE), score: ${bestOverallIC.score.toFixed(2)}`);
      
      // Return qualified Iron Condor
      return {
        symbol,
        strategyType: 'IRON_CONDOR',
        status: 'qualified',
        reason: 'Iron Condor opportunity found',
        expiry: bestOverallExpiry,
        // PUT side uses existing fields
        shortStrike: bestOverallIC.putShortStrike,
        longStrike: bestOverallIC.putLongStrike,
        delta: bestOverallIC.putDelta,
        putDelta: bestOverallIC.putDelta,
        // CALL side uses new fields
        callShortStrike: bestOverallIC.callShortStrike,
        callLongStrike: bestOverallIC.callLongStrike,
        callDelta: bestOverallIC.callDelta,
        // Combined metrics
        width: bestOverallIC.width,
        creditMidCents: bestOverallIC.totalCreditCents,
        dte: bestOverallIC.dte,
        rr: bestOverallIC.rr,
        maxLossCents: bestOverallIC.maxLossCents,
        iv: avgIv,
        expectedMove: expectedMove,
        score: bestOverallIC.score,
        signal: 'IRON CONDOR TRADE',
        batchId: this.currentBatchId || 'manual',
        analysisLog: logger.getLog(),
      };
    } catch (error) {
      logger.log(`❌ Error scanning ${symbol} for IC: ${(error as Error).message}`);
      return {
        symbol,
        strategyType: 'IRON_CONDOR',
        status: 'error',
        reason: (error as Error).message,
        batchId: this.currentBatchId || 'manual',
        analysisLog: logger.getLog(),
      };
    }
  }

  // Load scan settings from database
  private async loadScanSettings(userId: string) {
    const [
      deltaMin, deltaMax, minCredit, rrMin, rrMax, maxLoss, maxLossBuffer,
      dteTarget, dteBuffer, icDeltaMin, icDeltaMax, icWidth, minOi
    ] = await Promise.all([
      // Credit Spread settings
      storage.getSetting(userId, 'scan_delta_min'),
      storage.getSetting(userId, 'scan_delta_max'),
      storage.getSetting(userId, 'scan_min_credit'),
      storage.getSetting(userId, 'scan_rr_min'),
      storage.getSetting(userId, 'scan_rr_max'),
      storage.getSetting(userId, 'scan_max_loss'),
      storage.getSetting(userId, 'scan_max_loss_buffer'),
      // DTE settings
      storage.getSetting(userId, 'scan_dte_target'),
      storage.getSetting(userId, 'scan_dte_buffer'),
      // Iron Condor settings
      storage.getSetting(userId, 'scan_ic_delta_min'),
      storage.getSetting(userId, 'scan_ic_delta_max'),
      storage.getSetting(userId, 'scan_ic_width'),
      // Global settings
      storage.getSetting(userId, 'scan_min_oi'),
    ]);
    
    return {
      // Credit Spread delta range
      deltaMin: parseFloat(deltaMin?.value || '0.25'),
      deltaMax: parseFloat(deltaMax?.value || '0.30'),
      minCredit: parseFloat(minCredit?.value || '1.20'),
      rrMin: parseFloat(rrMin?.value || '1.5'),
      rrMax: parseFloat(rrMax?.value || '3.5'),
      maxLoss: parseFloat(maxLoss?.value || '500'),
      maxLossBuffer: parseFloat(maxLossBuffer?.value || '0.25'),
      // DTE settings
      dteTarget: parseInt(dteTarget?.value || '45'),
      dteBuffer: parseInt(dteBuffer?.value || '5'),
      // Iron Condor settings
      icDeltaMin: parseFloat(icDeltaMin?.value || '0.15'),
      icDeltaMax: parseFloat(icDeltaMax?.value || '0.20'),
      icWidth: parseInt(icWidth?.value || '10'),
      // Global settings (does NOT apply to LEAPs)
      minOi: parseInt(minOi?.value || '50'),
    };
  }
  
  // Evaluate candidate state using latest indicators
  async evaluateCandidate(userId: string, symbol: string, logger?: LogCapture): Promise<any> {
    const ticker = await storage.getTicker(userId, symbol);
    const indicators = await storage.getLatestIndicators(userId, symbol);
    if (!ticker || !indicators) {
      return { symbol, state: 'NONE', side: null, reason: 'Missing config or indicators' };
    }

    // Check if this is an index ticker
    const watchlistEntry = await storage.getWatchlistItem(userId, symbol);
    const isIndex = watchlistEntry?.type === 'index';

    // Load scan settings
    const scanSettings = await this.loadScanSettings(userId);

    // Create config object for checkEntrySignal
    // Note: S/R arrays are guaranteed to be sorted by confidence (highest first) by supportResistance service
    const supportLevels = (ticker.supportLevels as SRLevel[]) || [];
    const resistanceLevels = (ticker.resistanceLevels as SRLevel[]) || [];
    
    const config = {
      symbol,
      support: supportLevels[0]?.value, // Use highest-confidence support (handles ATH/ATL empty arrays)
      resistance: resistanceLevels[0]?.value, // Use highest-confidence resistance (handles ATH/ATL empty arrays)
      isIndex, // Pass index flag
    };

    // Check entry signal with detailed logging
    const signal = this.checkEntrySignal(indicators, config, logger);
    
    // Extract indicator values for later use
    const rsi = indicators.rsi14 || 0;
    const stochK = indicators.stochK || 0;
    const stochD = indicators.stochD || 0;
    const price = indicators.price || 0;
    
    let state: 'NONE' | 'SETUP' | 'TRIGGER' | 'TRADE' = 'NONE';
    let side: 'PUT' | 'CALL' | null = null;
    let reason = signal.reason;
    
    if (signal.isValid && signal.type) {
      state = 'SETUP';
      side = signal.type;
    }

    // Options analysis if setup - use findBestSpread to respect ticker config
    // MULTI-EXPIRY ANALYSIS: Analyze ALL expiries in the DTE range, not just the nearest one
    let options: any = null;
    let noExpiryFound = false;
    if (state === 'SETUP') {
      // Use DTE settings from user config
      const dteTarget = scanSettings.dteTarget;
      const dteBuffer = scanSettings.dteBuffer;
      const dteMin = dteTarget - dteBuffer;
      const dteMax = dteTarget + dteBuffer;
      
      // Get ALL expiries in the DTE range
      const expiries = await marketDataService.findAllExpiriesInRange(symbol, dteTarget, dteBuffer);
      (logger || console).log(`\n📅 MULTI-EXPIRY ANALYSIS for ${symbol}:`);
      (logger || console).log(`   Target: ${dteTarget} DTE ±${dteBuffer} (${dteMin}-${dteMax} DTE range)`);
      (logger || console).log(`   Found: ${expiries.length} expiries to analyze`);
      
      if (expiries.length === 0) {
        noExpiryFound = true;
        (logger || console).log(`⚠️  WARNING: No suitable expiry found for ${symbol} in ${dteMin}-${dteMax} DTE range`);
        (logger || console).log(`⚠️  This may indicate a Polygon API issue or data gap`);
        (logger || console).log(`⚠️  Please verify option availability in your trading system`);
        reason = `No suitable option expiry found in ${dteMin}-${dteMax} DTE range`;
      } else {
        // Analyze EACH expiry and track the best spread across all of them
        let bestOverallSpread: ScanCandidate | null = null;
        let bestOverallExpiry: Date | null = null;
        let bestOverallDte: number = 0;
        let expiriesAnalyzed = 0;
        let expiriesWithSpreads = 0;
        
        // Get ATR from latest indicators for strike selection
        const atr = indicators.atr14 || 10.0;
        // Create config object with ticker params and scan settings
        const effectiveMinOI = ticker.minOI ?? scanSettings.minOi;
        const spreadConfig = {
          symbol,
          support: supportLevels[0]?.value,
          resistance: resistanceLevels[0]?.value,
          minCredit: scanSettings.minCredit,
          maxLossCents: scanSettings.maxLoss * 100,
          minOI: effectiveMinOI,
          maxBidAskCents: ticker.maxBidAskCents,
          scanSettings,
          isIndex,
        };
        
        for (const expiry of expiries) {
          const dte = Math.floor((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          (logger || console).log(`\n🔍 Analyzing expiry: ${expiry.toISOString().split('T')[0]} (${dte} DTE)`);
          
          const chain = await marketDataService.getOptionChain(symbol, expiry);
          expiriesAnalyzed++;
          
          if (chain.length === 0) {
            (logger || console).log(`   ❌ No option chain data for this expiry`);
            continue;
          }
          
          const candidateSpread = this.findBestSpread(chain, side || 'PUT', price, atr, spreadConfig, expiry, logger);
          
          if (candidateSpread) {
            expiriesWithSpreads++;
            (logger || console).log(`   ✅ Found qualifying spread with score: ${candidateSpread.score.toFixed(2)}`);
            
            // Keep the best spread across all expiries (highest score wins)
            if (!bestOverallSpread || candidateSpread.score > bestOverallSpread.score) {
              bestOverallSpread = candidateSpread;
              bestOverallExpiry = expiry;
              bestOverallDte = dte;
              (logger || console).log(`   🏆 NEW BEST SPREAD (score: ${candidateSpread.score.toFixed(2)})`);
            }
          } else {
            (logger || console).log(`   ❌ No qualifying spread for this expiry`);
          }
        }
        
        // Summary of multi-expiry analysis
        (logger || console).log(`\n📊 MULTI-EXPIRY SUMMARY for ${symbol}:`);
        (logger || console).log(`   Expiries analyzed: ${expiriesAnalyzed}`);
        (logger || console).log(`   Expiries with qualifying spreads: ${expiriesWithSpreads}`);
        
        if (bestOverallSpread && bestOverallExpiry) {
          options = { expiry: bestOverallExpiry, dte: bestOverallDte, best: bestOverallSpread };
          state = 'TRADE';
          reason = `${side} spread qualifies`;
          (logger || console).log(`   🏆 BEST OVERALL: ${bestOverallExpiry.toISOString().split('T')[0]} (${bestOverallDte} DTE), score: ${bestOverallSpread.score.toFixed(2)}`);
        } else {
          (logger || console).log(`   ❌ No qualifying spreads found across any expiry`);
        }
      }
    }

    return { symbol, state, side, reason, technical: { rsi, stochK, stochD, price, support: supportLevels[0]?.value, resistance: resistanceLevels[0]?.value }, options, noExpiryFound };
  }

  async scanTicker(userId: string, symbol: string): Promise<InsertScanResult> {
    try {
      const logger = new LogCapture();
      
      // Fetch latest market context analysis
      let marketContext = null;
      try {
        marketContext = await marketContextService.getLatestAnalysis();
        if (marketContext) {
          logger.log(`📊 Market Context: ${marketContext.marketRegime.toUpperCase()} regime, VIX ${marketContext.vixLevel.toFixed(2)}`);
        }
      } catch (error) {
        logger.log(`⚠️  Market context unavailable: ${(error as Error).message}`);
      }
      
      // Use the new candidate evaluation
      const candidate = await this.evaluateCandidate(userId, symbol, logger);
      
      // Convert candidate state to scan result format
      if (candidate.state === 'NONE') {
        return {
          symbol,
          strategyType: 'CREDIT_SPREAD',
          status: 'no_signal',
          reason: candidate.reason,
          expiry: null,
          shortStrike: null,
          longStrike: null,
          width: null,
          delta: null,
          creditMidCents: null,
          dte: null,
          rr: null,
          maxLossCents: null,
          oi: null,
          baCents: null,
          iv: null,
          expectedMove: null,
          score: null,
          signal: null,
          batchId: this.currentBatchId || 'manual',
          analysisLog: logger.getLog(),
        };
      }
      
      if (candidate.state === 'SETUP' || candidate.state === 'TRIGGER') {
        // For setup/trigger without valid spread
        const reason = candidate.noExpiryFound 
          ? candidate.reason  // Use the detailed reason about Polygon API issue
          : `${candidate.side} signal detected but no spread meets criteria`;
        
        return {
          symbol,
          strategyType: 'CREDIT_SPREAD',
          status: 'no_qualified_spread',
          reason,
          expiry: candidate.options?.expiry || null,
          shortStrike: candidate.options?.best?.shortStrike || null,
          longStrike: candidate.options?.best?.longStrike || null,
          width: candidate.options?.best?.width || null,
          delta: candidate.options?.best?.delta || null,
          creditMidCents: candidate.options?.best?.creditMidCents || null,
          dte: candidate.options?.dte || null,
          rr: candidate.options?.best?.rr || null,
          maxLossCents: candidate.options?.best?.maxLossCents || null,
          oi: candidate.options?.best?.oi || null,
          baCents: candidate.options?.best?.baCents || null,
          iv: candidate.options?.best?.iv || null,
          expectedMove: null,
          score: candidate.options?.best?.score || null,
          signal: `${candidate.side} ${candidate.state} CANDIDATE`,
          batchId: this.currentBatchId || 'manual',
          analysisLog: logger.getLog(),
        };
      }
      
      if (candidate.state === 'TRADE') {
        // Valid trade candidate - apply market context scoring adjustment
        let adjustedScore = candidate.options?.best?.score || null;
        let marketAlignment: 'aligned' | 'misaligned' | 'neutral' = 'neutral';
        
        if (marketContext && adjustedScore !== null) {
          // Normalize symbol to uppercase for consistent lookup
          const normalizedSymbol = symbol.toUpperCase();
          const tickerSentiment = marketContext.tickerAnalysis[normalizedSymbol];
          
          if (tickerSentiment) {
            // Credit Spread direction: PUT spread = bullish (profit if stock stays UP)
            //                          CALL spread = bearish (profit if stock stays DOWN)
            const tradeSentiment = candidate.side === 'PUT' ? 'bullish' : 'bearish';
            
            // Check alignment
            if (tickerSentiment.sentiment === tradeSentiment) {
              // Trade aligns with market sentiment - boost score
              adjustedScore = adjustedScore * 1.15; // +15%
              marketAlignment = 'aligned';
              logger.log(`✅ Market Alignment: ${candidate.side} spread (${tradeSentiment.toUpperCase()}) matches ${tickerSentiment.sentiment.toUpperCase()} sentiment → Score boosted +15%`);
            } else if (
              (tradeSentiment === 'bearish' && tickerSentiment.sentiment === 'bullish') ||
              (tradeSentiment === 'bullish' && tickerSentiment.sentiment === 'bearish')
            ) {
              // Trade opposes market sentiment - downrank score
              adjustedScore = adjustedScore * 0.70; // -30%
              marketAlignment = 'misaligned';
              logger.log(`⚠️  Market Misalignment: ${candidate.side} spread (${tradeSentiment.toUpperCase()}) opposes ${tickerSentiment.sentiment.toUpperCase()} sentiment → Score reduced -30%`);
            }
          } else {
            logger.log(`ℹ️  No ticker-specific sentiment available for ${symbol}`);
          }
        }
        
        // Calculate Expected Move: Stock Price × IV × √(DTE/365)
        const stockPrice = candidate.technical?.price || 0;
        const iv = candidate.options?.best?.iv || null;
        const dte = candidate.options?.dte || 0;
        let expectedMove: number | null = null;
        
        if (iv && stockPrice > 0 && dte > 0) {
          expectedMove = stockPrice * iv * Math.sqrt(dte / 365);
          logger.log(`📈 Expected Move: ±$${expectedMove.toFixed(2)} (IV: ${(iv * 100).toFixed(1)}%, ${dte} DTE)`);
        }
        
      return {
        symbol,
        strategyType: 'CREDIT_SPREAD',
        status: 'qualified',
        reason: marketAlignment === 'misaligned' ? `⚠️ Misaligned with market sentiment` : null,
          expiry: candidate.options?.expiry || null,
          shortStrike: candidate.options?.best?.shortStrike || null,
          longStrike: candidate.options?.best?.longStrike || null,
          width: candidate.options?.best?.width || null,
          delta: candidate.options?.best?.delta || null,
          creditMidCents: candidate.options?.best?.creditMidCents || null,
          dte: candidate.options?.dte || null,
          rr: candidate.options?.best?.rr || null,
          maxLossCents: candidate.options?.best?.maxLossCents || null,
          oi: candidate.options?.best?.oi || null,
          baCents: candidate.options?.best?.baCents || null,
          iv: iv,
          expectedMove: expectedMove,
          score: adjustedScore,
          signal: `${candidate.side} TRADE CANDIDATE - ${candidate.reason}${marketAlignment === 'aligned' ? ' ✅' : marketAlignment === 'misaligned' ? ' ⚠️' : ''}`,
          batchId: this.currentBatchId || 'manual',
          analysisLog: logger.getLog(),
        };
      }
      
      return {
        symbol,
        strategyType: 'CREDIT_SPREAD',
        status: 'error',
        reason: 'Unknown candidate state',
        expiry: null,
        shortStrike: null,
        longStrike: null,
        width: null,
        delta: null,
        creditMidCents: null,
        dte: null,
        rr: null,
        maxLossCents: null,
        oi: null,
        baCents: null,
        iv: null,
        expectedMove: null,
        score: null,
        signal: null,
        batchId: this.currentBatchId || 'manual',
        analysisLog: logger.getLog(),
      };
    } catch (error) {
      console.error(`Error scanning ${symbol}:`, error);
      return {
        symbol,
        strategyType: 'CREDIT_SPREAD',
        status: 'error',
        reason: (error as Error).message,
        expiry: null,
        shortStrike: null,
        longStrike: null,
        width: null,
        delta: null,
        creditMidCents: null,
        dte: null,
        rr: null,
        maxLossCents: null,
        oi: null,
        baCents: null,
        iv: null,
        expectedMove: null,
        score: null,
        signal: null,
        batchId: this.currentBatchId || 'manual',
        analysisLog: null,
      };
    }
  }

  private checkEntrySignal(indicators: any, config: any, logger?: LogCapture): { isValid: boolean; type?: 'PUT' | 'CALL'; reason: string; details?: any } {
    const rsi = indicators.rsi14;
    const stochK = indicators.stochK;
    const stochD = indicators.stochD;
    const price = indicators.price;
    const isIndex = config.isIndex || false;

    (logger || console).log(`\n🔍 TECHNICAL ANALYSIS FOR ${config.symbol || 'TICKER'}`);
    (logger || console).log(`📊 Current Indicators:`);
    (logger || console).log(`   • RSI(14): ${rsi.toFixed(2)}`);
    (logger || console).log(`   • StochRSI K: ${stochK.toFixed(2)}`);
    (logger || console).log(`   • StochRSI D: ${stochD.toFixed(2)}`);
    (logger || console).log(`   • Current Price: $${price.toFixed(2)}`);
    if (isIndex) {
      (logger || console).log(`   • Type: Index (support/resistance not applicable)`);
    } else {
      (logger || console).log(`   • Support Level: ${config.support ? `$${config.support}` : 'Not set (ATH/ATL or pending S/R analysis)'}`);
      (logger || console).log(`   • Resistance Level: ${config.resistance ? `$${config.resistance}` : 'Not set (ATH/ATL or pending S/R analysis)'}`);
    }

    // Check for PUT setup (oversold, bullish reversal)
    (logger || console).log(`\n📈 PUT SPREAD SETUP CHECK:`);
    const rsiOversold = rsi < 30;
    const rsiBounce = rsi > 30; // RSI crossed above 30 (bounce from oversold)
    const stochOversold = stochK < 20;
    const stochCrossUp = stochK > 20 && stochK > stochD; // StochRSI crossed above 20 and K > D
    
    (logger || console).log(`   • RSI Oversold (<30)? ${rsiOversold ? '✅ YES' : '❌ NO'} (${rsi.toFixed(2)})`);
    (logger || console).log(`   • RSI Bounce (>30)? ${rsiBounce ? '✅ YES' : '❌ NO'} (${rsi.toFixed(2)})`);
    (logger || console).log(`   • StochRSI Oversold (<20)? ${stochOversold ? '✅ YES' : '❌ NO'} (${stochK.toFixed(2)})`);
    (logger || console).log(`   • StochRSI Cross-Up (>20 & K>D)? ${stochCrossUp ? '✅ YES' : '❌ NO'} (K:${stochK.toFixed(2)}, D:${stochD.toFixed(2)})`);
    
    // PUT signal: StochRSI oversold (<20) is MANDATORY
    // Then check: (RSI oversold OR RSI bounce) AND (StochRSI cross-up OR just oversold)
    const putSetup = stochOversold && (rsiOversold || rsiBounce);
    
    if (putSetup) {
      // For indexes, skip support/resistance check
      if (isIndex) {
        (logger || console).log(`   ✅ Index ticker - support check skipped`);
        (logger || console).log(`   🎯 PUT SIGNAL TRIGGERED!`);
        (logger || console).log(`   📋 Reason: StochRSI oversold (<20) with RSI confirmation (Index)`);
        return { 
          isValid: true, 
          type: 'PUT', 
          reason: 'StochRSI oversold (<20) with RSI confirmation (Index)',
          details: {
            rsi,
            stochK,
            stochD,
            price,
            support: null,
            analysis: 'Mandatory StochRSI oversold condition met with RSI confirmation (Index - no S/R check)'
          }
        };
      }
      
      (logger || console).log(`   • Price > Support: ${config.support && price > config.support ? '✅ YES' : '❌ NO'}`);
      if (config.support && price > config.support) {
        (logger || console).log(`   🎯 PUT SIGNAL TRIGGERED!`);
        (logger || console).log(`   📋 Reason: StochRSI oversold (<20) with RSI confirmation and price above support`);
        return { 
          isValid: true, 
          type: 'PUT', 
          reason: 'StochRSI oversold (<20) with RSI confirmation',
          details: {
            rsi,
            stochK,
            stochD,
            price,
            support: config.support,
            analysis: 'Mandatory StochRSI oversold condition met with RSI confirmation'
          }
        };
      } else {
        (logger || console).log(`   ❌ PUT signal failed - Price below support or no support set`);
        (logger || console).log(`   📋 Result: StochRSI oversold but waiting for price above support`);
      }
    } else {
      if (stochOversold) {
        (logger || console).log(`   📋 Result: StochRSI oversold but RSI confirmation missing`);
      } else {
        (logger || console).log(`   📋 Result: No StochRSI oversold (<20) - MANDATORY condition not met`);
      }
    }

    // Check for CALL setup (overbought, bearish reversal)
    (logger || console).log(`\n📉 CALL SPREAD SETUP CHECK:`);
    const rsiOverbought = rsi > 70;
    const rsiReversal = rsi < 70; // RSI crossed below 70 (reversal from overbought)
    const stochOverbought = stochK > 80;
    const stochCrossDown = stochK < 80 && stochK < stochD; // StochRSI crossed below 80 and K < D
    
    (logger || console).log(`   • RSI Overbought (>70)? ${rsiOverbought ? '✅ YES' : '❌ NO'} (${rsi.toFixed(2)})`);
    (logger || console).log(`   • RSI Reversal (<70)? ${rsiReversal ? '✅ YES' : '❌ NO'} (${rsi.toFixed(2)})`);
    (logger || console).log(`   • StochRSI Overbought (>80)? ${stochOverbought ? '✅ YES' : '❌ NO'} (${stochK.toFixed(2)})`);
    (logger || console).log(`   • StochRSI Cross-Down (<80 & K<D)? ${stochCrossDown ? '✅ YES' : '❌ NO'} (K:${stochK.toFixed(2)}, D:${stochD.toFixed(2)})`);
    
    // CALL signal: StochRSI overbought (>80) is MANDATORY
    // Then check: (RSI overbought OR RSI reversal) AND (StochRSI cross-down OR just overbought)
    const callSetup = stochOverbought && (rsiOverbought || rsiReversal);
    
    if (callSetup) {
      // For indexes, skip support/resistance check
      if (isIndex) {
        (logger || console).log(`   ✅ Index ticker - resistance check skipped`);
        (logger || console).log(`   🎯 CALL SIGNAL TRIGGERED!`);
        (logger || console).log(`   📋 Reason: StochRSI overbought (>80) with RSI confirmation (Index)`);
        return { 
          isValid: true, 
          type: 'CALL', 
          reason: 'StochRSI overbought (>80) with RSI confirmation (Index)',
          details: {
            rsi,
            stochK,
            stochD,
            price,
            resistance: null,
            analysis: 'Mandatory StochRSI overbought condition met with RSI confirmation (Index - no S/R check)'
          }
        };
      }
      
      (logger || console).log(`   • Price < Resistance: ${config.resistance && price < config.resistance ? '✅ YES' : '❌ NO'}`);
      if (config.resistance && price < config.resistance) {
        (logger || console).log(`   🎯 CALL SIGNAL TRIGGERED!`);
        (logger || console).log(`   📋 Reason: StochRSI overbought (>80) with RSI confirmation and price below resistance`);
        return { 
          isValid: true, 
          type: 'CALL', 
          reason: 'StochRSI overbought (>80) with RSI confirmation',
          details: {
            rsi,
            stochK,
            stochD,
            price,
            resistance: config.resistance,
            analysis: 'Mandatory StochRSI overbought condition met with RSI confirmation'
          }
        };
      } else {
        (logger || console).log(`   ❌ CALL signal failed - Price above resistance or no resistance set`);
        (logger || console).log(`   📋 Result: StochRSI overbought but waiting for price below resistance`);
      }
    } else {
      if (stochOverbought) {
        (logger || console).log(`   📋 Result: StochRSI overbought but RSI confirmation missing`);
      } else {
        (logger || console).log(`   📋 Result: No StochRSI overbought (>80) - MANDATORY condition not met`);
      }
    }

    (logger || console).log(`\n❌ NO SIGNAL DETECTED`);
    (logger || console).log(`📋 Summary: No valid setup or trigger conditions met`);
    return { 
      isValid: false, 
      reason: 'No entry signal',
      details: {
        rsi,
        stochK,
        stochD,
        price,
        support: config.support,
        resistance: config.resistance,
        analysis: 'No valid oversold/overbought setup or reversal trigger detected'
      }
    };
  }

  private findBestSpread(chain: any[], type: 'PUT' | 'CALL', price: number, atr: number, config: any, expiry: Date, logger?: LogCapture): ScanCandidate | null {
    const now = new Date();
    const dte = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isIndex = config.isIndex || false;

    (logger || console).log(`\n🎯 OPTIONS ANALYSIS FOR ${config.symbol || 'TICKER'}`);
    (logger || console).log(`📅 Expiry: ${expiry.toISOString().split('T')[0]} (${dte} DTE)`);
    (logger || console).log(`💰 Current Price: $${price.toFixed(2)}`);
    (logger || console).log(`📊 Option Chain: ${chain.length} strikes available`);

    // Filter options by type
    const options = chain.filter(opt => opt.type === type.toLowerCase());
    (logger || console).log(`🔍 ${type} Options: ${options.length} strikes`);

    // Show support/resistance context
    if (!isIndex) {
      if (type === 'PUT' && config.support) {
        (logger || console).log(`🛡️  Support Level: $${config.support} (short strikes must be BELOW this)`);
      }
      if (type === 'CALL' && config.resistance) {
        (logger || console).log(`🛡️  Resistance Level: $${config.resistance} (short strikes must be ABOVE this)`);
      }
    } else {
      (logger || console).log(`📊 Index ticker - support/resistance checks skipped`);
    }

    // Get scan settings from config (passed from evaluateCandidate)
    const settings = config.scanSettings || { deltaMin: 0.20, deltaMax: 0.35 };
    const minOI = config.minOI || settings.minOi || 50;
    
    // Log minimum OI requirement
    (logger || console).log(`📈 Minimum OI Required: ${minOI}`);
    
    // Track options filtered out by OI
    let lowOICount = 0;
    
    // Find short strikes: For stocks, filter by S/R first; for indexes, only filter by delta
    const shorts = options.filter(opt => {
      const delta = Math.abs(opt.delta || 0);
      const strike = opt.strike;
      const oi = opt.openInterest || 0;
      
      // Check OI first
      if (oi < minOI) {
        lowOICount++;
        return false; // Skip options with insufficient open interest
      }
      
      // For indexes, skip support/resistance checks
      if (!isIndex) {
        // For PUT spreads: short strike must be BELOW support (safe zone)
        if (type === 'PUT') {
          if (config.support && strike >= config.support) {
            return false; // Strike is at or above support - too risky
          }
        }
        
        // For CALL spreads: short strike must be ABOVE resistance (safe zone)
        if (type === 'CALL') {
          if (config.resistance && strike <= config.resistance) {
            return false; // Strike is at or below resistance - too risky
          }
        }
      }
      
      // Then check delta range from settings
      return delta >= settings.deltaMin && delta <= settings.deltaMax;
    });

    const filterDesc = isIndex ? 'OI + Delta Filter' : 'OI + Support/Resistance + Delta Filter';
    (logger || console).log(`🔍 ${filterDesc} (OI≥${minOI}, Delta ${settings.deltaMin.toFixed(2)}-${settings.deltaMax.toFixed(2)}): ${shorts.length} strikes`);
    if (lowOICount > 0) {
      (logger || console).log(`   ⚠️  ${lowOICount} strikes skipped due to OI < ${minOI}`);
    }
    if (shorts.length === 0) {
      (logger || console).log(`❌ No options passed filters (OI≥${minOI}, Delta ${settings.deltaMin.toFixed(2)}-${settings.deltaMax.toFixed(2)})`);
      return null;
    }

    (logger || console).log(`\n📋 CONSTRAINTS:`);
    (logger || console).log(`   • Minimum OI: ${minOI}`);
    (logger || console).log(`   • Minimum Credit: $${config.minCredit || settings.minCredit}+`);
    (logger || console).log(`   • Risk:Reward Ratio: ${settings.rrMin.toFixed(1)}:1 to ${settings.rrMax.toFixed(1)}:1`);
    const bufferPercent = (settings.maxLossBuffer * 100).toFixed(0);
    (logger || console).log(`   • Max Loss: ${config.maxLossCents ? `≤$${(config.maxLossCents/100).toFixed(2)}` : 'No limit'} (Allow ${bufferPercent}% bigger if RR maintained)`);

    let bestSpread: ScanCandidate | null = null;
    let bestScore = -1;
    let testedSpreads = 0;

    (logger || console).log(`\n🔍 TESTING SPREAD COMBINATIONS:`);

    // Try different spreads
    for (const shortOpt of shorts) {
      const shortOI = shortOpt.openInterest || 0;
      (logger || console).log(`\n📊 Testing short strike ${shortOpt.strike} (Delta: ${shortOpt.delta?.toFixed(3) || 'N/A'}, OI: ${shortOI}):`);
      
      for (let width = 5; width <= 10; width++) {
        const longStrike = type === 'PUT' 
          ? shortOpt.strike - width 
          : shortOpt.strike + width;

        const longOpt = options.find(opt => opt.strike === longStrike);
        if (!longOpt) {
          (logger || console).log(`   ❌ No long option at strike ${longStrike}`);
          continue;
        }

        const longOI = longOpt.openInterest || 0;
        testedSpreads++;
        (logger || console).log(`   📏 Testing ${width}-point spread ${shortOpt.strike}/${longStrike}:`);

        // Show raw option prices and OI
        (logger || console).log(`      📊 Short ${shortOpt.strike}: bid=$${shortOpt.bid.toFixed(2)} ask=$${shortOpt.ask.toFixed(2)} mid=$${((shortOpt.bid + shortOpt.ask) / 2).toFixed(2)} OI=${shortOI}`);
        (logger || console).log(`      📊 Long ${longStrike}: bid=$${longOpt.bid.toFixed(2)} ask=$${longOpt.ask.toFixed(2)} mid=$${((longOpt.bid + longOpt.ask) / 2).toFixed(2)} OI=${longOI}`);

        // Calculate spread metrics
        const shortMid = (shortOpt.bid + shortOpt.ask) / 2;
        const longMid = (longOpt.bid + longOpt.ask) / 2;
        const creditMid = shortMid - longMid;
        
        // Skip spreads with zero or negative credit
        if (creditMid <= 0) {
          (logger || console).log(`      ⚠️  SKIPPED: Credit is $${creditMid.toFixed(2)} (must be positive)`);
          continue;
        }

        // Convert to per-contract dollars (multiply by 100 shares)
        const maxGainPerContract = creditMid * 100;
        const maxLossPerContract = (width - creditMid) * 100;
        const rr = maxLossPerContract / maxGainPerContract;
        const bidAsk = (shortOpt.ask - shortOpt.bid) + (longOpt.ask - longOpt.bid);

        (logger || console).log(`      💰 Credit: $${creditMid.toFixed(2)} per share ($${maxGainPerContract.toFixed(2)} per contract)`);
        (logger || console).log(`      📈 Max Gain: $${maxGainPerContract.toFixed(2)}`);
        (logger || console).log(`      📉 Max Loss: $${maxLossPerContract.toFixed(2)}`);
        (logger || console).log(`      ⚖️  Risk:Reward: ${rr.toFixed(2)}:1`);

        // Apply constraints using settings
        const minCredit = config.minCredit || settings.minCredit;
        const maxLossCents = config.maxLossCents ? config.maxLossCents * (1 + settings.maxLossBuffer) : Infinity;
        
        const constraints = {
          credit: creditMid >= minCredit,
          riskReward: rr >= settings.rrMin && rr <= settings.rrMax,
          maxLoss: maxLossPerContract * 100 <= maxLossCents // Convert dollars to cents
        };

        (logger || console).log(`      🔍 Constraints Check:`);
        (logger || console).log(`         • Credit: $${creditMid.toFixed(2)} ≥ $${minCredit.toFixed(2)} → ${constraints.credit ? '✅' : '❌'}`);
        (logger || console).log(`         • R:R: ${rr.toFixed(2)} in [${settings.rrMin.toFixed(1)}, ${settings.rrMax.toFixed(1)}] → ${constraints.riskReward ? '✅' : '❌'}`);
        const maxLossLimit = maxLossCents === Infinity ? 'No limit' : `$${(maxLossCents/100).toFixed(2)}`;
        (logger || console).log(`         • Max Loss: $${maxLossPerContract.toFixed(2)} ≤ ${maxLossLimit} → ${constraints.maxLoss ? '✅' : '❌'}`);

        if (constraints.credit && constraints.riskReward && constraints.maxLoss) {
          // Calculate score with enhanced scoring model
          const candidateForScore = {
            shortStrike: shortOpt.strike,
            longStrike: longOpt.strike,
            width,
            delta: Math.abs(shortOpt.delta || 0),
            creditMidCents: Math.round(creditMid * 100),
            dte,
            rr,
            maxLossCents: Math.round(maxLossPerContract * 100),
            oi: shortOI, // Track OI from short strike
            baCents: Math.round(bidAsk * 100),
            iv: shortOpt.iv || null,
            score: 0
          };
          
          const score = this.calculateScore(
            candidateForScore,
            type,
            price,
            atr,
            config.support || null,
            config.resistance || null,
            isIndex
          );
          
          // Log detailed score breakdown
          this.logScoreBreakdown(candidateForScore, type, price, atr, config.support, config.resistance, score, isIndex, logger);

          if (score > bestScore) {
            bestScore = score;
            bestSpread = {
              shortStrike: shortOpt.strike,
              longStrike: longOpt.strike,
              width,
              delta: Math.abs(shortOpt.delta || 0),
              creditMidCents: Math.round(creditMid * 100),
              dte,
              rr,
              maxLossCents: Math.round(maxLossPerContract * 100),
              oi: shortOI, // Track OI from short strike
              baCents: Math.round(bidAsk * 100),
              iv: shortOpt.iv || null, // Extract IV from short strike option
              score
            };
            (logger || console).log(`      🏆 NEW BEST SPREAD!`);
          }
        } else {
          (logger || console).log(`      ❌ Failed constraints`);
        }
      }
    }

    (logger || console).log(`\n📊 ANALYSIS SUMMARY:`);
    (logger || console).log(`   • Total spreads tested: ${testedSpreads}`);
    (logger || console).log(`   • Valid spreads found: ${bestSpread ? '1' : '0'}`);
    
    if (bestSpread) {
      (logger || console).log(`\n🏆 BEST SPREAD FOUND:`);
      (logger || console).log(`   • Strike: ${bestSpread.shortStrike}/${bestSpread.longStrike}`);
      (logger || console).log(`   • Width: ${bestSpread.width} points`);
      (logger || console).log(`   • Delta: ${bestSpread.delta.toFixed(3)}`);
      (logger || console).log(`   • OI: ${bestSpread.oi}`);
      (logger || console).log(`   • Credit: $${(bestSpread.creditMidCents/100).toFixed(2)}`);
      (logger || console).log(`   • Max Loss: $${(bestSpread.maxLossCents/100).toFixed(2)}`);
      (logger || console).log(`   • Risk:Reward: ${bestSpread.rr.toFixed(2)}:1`);
      (logger || console).log(`   • Score: ${bestSpread.score.toFixed(2)}`);
    } else {
      (logger || console).log(`\n❌ NO VALID SPREADS FOUND`);
      (logger || console).log(`   • All spreads failed the updated constraints`);
    }

    return bestSpread;
  }

  private calculateScore(
    candidate: ScanCandidate, 
    type: 'PUT' | 'CALL',
    price: number,
    atr: number,
    support: number | null,
    resistance: number | null,
    isIndex: boolean = false
  ): number {
    // Enhanced 4-factor scoring model
    let totalScore = 0;

    // 1. Risk/Reward Ratio Score (40%)
    // Target: 1.8-2.2 range gets full score
    let rrScore = 0;
    if (candidate.rr >= 1.8 && candidate.rr <= 2.2) {
      rrScore = 100; // Perfect score in ideal range
    } else if (candidate.rr < 1.8) {
      // Too favorable (unlikely), taper down
      rrScore = Math.max(0, 100 - (1.8 - candidate.rr) * 100);
    } else {
      // Above 2.2, taper down
      rrScore = Math.max(0, 100 - (candidate.rr - 2.2) * 50);
    }
    totalScore += rrScore * 0.40;

    // 2. Credit Efficiency Score (30%)
    // Higher credit per unit width is better
    const creditPerWidth = (candidate.creditMidCents / 100) / candidate.width;
    // Normalize: Typical range is 0.20-0.50, target ~0.35
    // Scale so 0.35+ gets 100, tapering down
    const creditEfficiencyScore = Math.min(100, Math.max(0, (creditPerWidth / 0.35) * 100));
    totalScore += creditEfficiencyScore * 0.30;

    // 3. Delta Precision Score (20%)
    // Target: 0.25-0.30 gets full score
    let deltaScore = 0;
    if (candidate.delta >= 0.25 && candidate.delta <= 0.30) {
      deltaScore = 100;
    } else if (candidate.delta < 0.25) {
      // Below target, taper down
      deltaScore = Math.max(0, 100 - ((0.25 - candidate.delta) / 0.05) * 100);
    } else {
      // Above target, taper down
      deltaScore = Math.max(0, 100 - ((candidate.delta - 0.30) / 0.05) * 100);
    }
    totalScore += deltaScore * 0.20;

    // 4. Distance from Support/Resistance Score (10%)
    let distanceScore = 50; // Default if no support/resistance set
    
    // For indexes, give full score (no S/R applicable)
    if (isIndex) {
      distanceScore = 100;
    } else if (type === 'PUT' && support !== null) {
      const distanceFromSupport = price - support;
      const atrMultiple = distanceFromSupport / atr;
      
      // Ideal: 1-2 ATR away
      if (atrMultiple >= 1.0 && atrMultiple <= 2.0) {
        distanceScore = 100;
      } else if (atrMultiple < 0.5) {
        // Too close to support, risky
        distanceScore = Math.max(0, atrMultiple * 100);
      } else if (atrMultiple > 3.0) {
        // Too far, edge weakens
        distanceScore = Math.max(0, 100 - (atrMultiple - 3.0) * 25);
      } else {
        // Between 0.5-1.0 or 2.0-3.0, decent but not ideal
        if (atrMultiple < 1.0) {
          distanceScore = 50 + (atrMultiple - 0.5) * 100;
        } else {
          distanceScore = 100 - (atrMultiple - 2.0) * 25;
        }
      }
    } else if (type === 'CALL' && resistance !== null) {
      const distanceFromResistance = resistance - price;
      const atrMultiple = distanceFromResistance / atr;
      
      // Ideal: 1-2 ATR away
      if (atrMultiple >= 1.0 && atrMultiple <= 2.0) {
        distanceScore = 100;
      } else if (atrMultiple < 0.5) {
        // Too close to resistance, risky
        distanceScore = Math.max(0, atrMultiple * 100);
      } else if (atrMultiple > 3.0) {
        // Too far, edge weakens
        distanceScore = Math.max(0, 100 - (atrMultiple - 3.0) * 25);
      } else {
        // Between 0.5-1.0 or 2.0-3.0, decent but not ideal
        if (atrMultiple < 1.0) {
          distanceScore = 50 + (atrMultiple - 0.5) * 100;
        } else {
          distanceScore = 100 - (atrMultiple - 2.0) * 25;
        }
      }
    }
    totalScore += distanceScore * 0.10;

    return totalScore;
  }

  private logScoreBreakdown(
    candidate: ScanCandidate,
    type: 'PUT' | 'CALL',
    price: number,
    atr: number,
    support: number | null | undefined,
    resistance: number | null | undefined,
    totalScore: number,
    isIndex: boolean = false,
    logger?: LogCapture
  ): void {
    (logger || console).log(`      🎯 VALID SPREAD! Total Score: ${totalScore.toFixed(2)}`);
    
    // Calculate individual scores for display
    const creditPerWidth = (candidate.creditMidCents / 100) / candidate.width;
    
    // R:R Score
    let rrScore = 0;
    if (candidate.rr >= 1.8 && candidate.rr <= 2.2) {
      rrScore = 100;
    } else if (candidate.rr < 1.8) {
      rrScore = Math.max(0, 100 - (1.8 - candidate.rr) * 100);
    } else {
      rrScore = Math.max(0, 100 - (candidate.rr - 2.2) * 50);
    }
    
    // Credit Efficiency Score
    const creditEfficiencyScore = Math.min(100, Math.max(0, (creditPerWidth / 0.35) * 100));
    
    // Delta Score
    let deltaScore = 0;
    if (candidate.delta >= 0.25 && candidate.delta <= 0.30) {
      deltaScore = 100;
    } else if (candidate.delta < 0.25) {
      deltaScore = Math.max(0, 100 - ((0.25 - candidate.delta) / 0.05) * 100);
    } else {
      deltaScore = Math.max(0, 100 - ((candidate.delta - 0.30) / 0.05) * 100);
    }
    
    // Distance Score
    let distanceScore = 50;
    let atrMultiple = 0;
    
    // For indexes, give full score (no S/R applicable)
    if (isIndex) {
      distanceScore = 100;
    } else if (type === 'PUT' && support !== null && support !== undefined) {
      atrMultiple = (price - support) / atr;
      if (atrMultiple >= 1.0 && atrMultiple <= 2.0) {
        distanceScore = 100;
      } else if (atrMultiple < 0.5) {
        distanceScore = Math.max(0, atrMultiple * 100);
      } else if (atrMultiple > 3.0) {
        distanceScore = Math.max(0, 100 - (atrMultiple - 3.0) * 25);
      } else {
        if (atrMultiple < 1.0) {
          distanceScore = 50 + (atrMultiple - 0.5) * 100;
        } else {
          distanceScore = 100 - (atrMultiple - 2.0) * 25;
        }
      }
    } else if (type === 'CALL' && resistance !== null && resistance !== undefined) {
      atrMultiple = (resistance - price) / atr;
      if (atrMultiple >= 1.0 && atrMultiple <= 2.0) {
        distanceScore = 100;
      } else if (atrMultiple < 0.5) {
        distanceScore = Math.max(0, atrMultiple * 100);
      } else if (atrMultiple > 3.0) {
        distanceScore = Math.max(0, 100 - (atrMultiple - 3.0) * 25);
      } else {
        if (atrMultiple < 1.0) {
          distanceScore = 50 + (atrMultiple - 0.5) * 100;
        } else {
          distanceScore = 100 - (atrMultiple - 2.0) * 25;
        }
      }
    }
    
    (logger || console).log(`      📊 Score Breakdown:`);
    (logger || console).log(`         • R:R (40%): ${rrScore.toFixed(1)}/100 → ${(rrScore * 0.40).toFixed(1)} pts`);
    (logger || console).log(`         • Credit/Width (30%): ${creditEfficiencyScore.toFixed(1)}/100 (${creditPerWidth.toFixed(2)}) → ${(creditEfficiencyScore * 0.30).toFixed(1)} pts`);
    (logger || console).log(`         • Delta (20%): ${deltaScore.toFixed(1)}/100 → ${(deltaScore * 0.20).toFixed(1)} pts`);
    if (isIndex) {
      (logger || console).log(`         • Distance (10%): ${distanceScore.toFixed(1)}/100 (Index - S/R not applicable) → ${(distanceScore * 0.10).toFixed(1)} pts`);
    } else {
      (logger || console).log(`         • Distance (10%): ${distanceScore.toFixed(1)}/100 (${atrMultiple.toFixed(2)} ATR) → ${(distanceScore * 0.10).toFixed(1)} pts`);
    }
  }

  async runDailyScan(userId: string): Promise<void> {
    console.log(`Starting daily scan for user ${userId}...`);
    // Generate a batch id for this run
    this.currentBatchId = `${new Date().toISOString()}`;
    
    const watchlist = await storage.getWatchlist(userId);
    const activeSymbols = watchlist.filter(w => w.active).map(w => w.symbol);

    for (let i = 0; i < activeSymbols.length; i++) {
      const symbol = activeSymbols[i];
      try {
        // Calculate and save indicators — fetch 220 days for SMA50/200
        const historicalData = await marketDataService.getHistoricalData(symbol, 220);
        const closePrices = historicalData.map(d => d.close);

        const rsi = indicatorService.calculateRSI(closePrices);

        // Use unified StochRSI calculation
        const stochResult = await indicatorService.calculateUnifiedStochRSI(symbol, historicalData);
        const stochK = stochResult.k;
        const stochD = stochResult.d;

        const atr = indicatorService.calculateATR(historicalData);

        // Moving averages and MACD
        const sma50 = indicatorService.calculateSMA(closePrices, 50);
        const sma200 = indicatorService.calculateSMA(closePrices, 200);
        const macd = indicatorService.calculateMACD(closePrices);

        await storage.saveIndicators(userId, {
          symbol,
          date: new Date(),
          rsi14: rsi,
          stochK: stochK,
          stochD: stochD,
          atr14: atr,
          price: closePrices[closePrices.length - 1],
          sma50: sma50 ?? undefined,
          sma200: sma200 ?? undefined,
          macdLine: macd?.macd ?? undefined,
          macdSignal: macd?.signal ?? undefined,
          macdHistogram: macd?.histogram ?? undefined,
        });

        // PRIORITY SYSTEM: IC > CS
        // Iron Condor is evaluated first. If IC qualifies, skip Credit Spread.
        // This prevents conflicting signals (e.g., both IC and CS triggering for same ticker)
        
        const watchlistItem = await storage.getWatchlistItem(userId, symbol);
        let icTriggered = false;
        
        // Step 1: Evaluate Iron Condor first (only for non-index tickers)
        if (watchlistItem?.type !== 'index') {
          const icResult = await this.scanTickerForIC(userId, symbol);
          await storage.saveScanResult(userId, icResult);
          console.log(`IC Scan ${symbol}: ${icResult.status}`);
          
          // If IC qualified, skip CS scan for this ticker
          if (icResult.status === 'qualified') {
            icTriggered = true;
            console.log(`   ⚡ IC PRIORITY: Skipping CS scan for ${symbol} (IC takes priority)`);
          }
        }
        
        // Step 2: Only run Credit Spread scan if IC did NOT qualify
        if (!icTriggered) {
          const csResult = await this.scanTicker(userId, symbol);
          await storage.saveScanResult(userId, csResult);
          console.log(`CS Scan ${symbol}: ${csResult.status}`);
        }
        
        // Add delay between symbols for API stability
        if (i < activeSymbols.length - 1) {
          console.log(`Waiting 5 seconds before next symbol...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.error(`Error scanning ${symbol}:`, error);
        // Save error scan result when an error occurs
        const errorResult = {
          symbol,
          strategyType: 'CREDIT_SPREAD',
          status: 'error',
          reason: (error as Error).message,
          expiry: null,
          shortStrike: null,
          longStrike: null,
          width: null,
          delta: null,
          creditMidCents: null,
          dte: null,
          rr: null,
          maxLossCents: null,
          oi: null,
          baCents: null,
          score: null,
          signal: null,
          batchId: this.currentBatchId || 'manual',
        };
        await storage.saveScanResult(userId, errorResult);
        
        // Add delay even on error for API stability
        if (i < activeSymbols.length - 1) {
          console.log(`Waiting 5 seconds before next symbol...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    console.log('Daily scan completed');
    // Clear batch id after run completes
    this.currentBatchId = null;
  }
}

export const scannerService = new ScannerService();
