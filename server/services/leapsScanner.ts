import { storage } from '../storage';
import { marketDataService } from './marketData';
import { priceCacheService } from './priceCache';
import { fundamentalsService, type UnderlyingQualityScore } from './fundamentals';
import { marketContextService } from './marketContext';
import type { InsertScanResult } from '@shared/schema';

interface LeapsCandidate {
  symbol: string;
  expiry: Date;
  strike: number;
  dte: number;
  delta: number;
  premiumCents: number;
  bidCents: number;
  askCents: number;
  intrinsicCents: number;
  extrinsicCents: number;
  extrinsicPercent: number;
  ivPercentile: number;
  itmPercent: number;
  oi: number;
  baCents: number;
  zlviScore: number;
  zlviStars: number;
  liquidityFlag: 'excellent' | 'good' | 'caution' | 'illiquid';
  reasonTag: string;
  extrinsicRating: 'excellent' | 'good' | 'overpriced' | 'avoid';
  ivRating: 'low' | 'moderate' | 'high';
  // Interpretive insights for user-friendly display
  extrinsicInsight: string;
  ivInsight: string;
  liquidityInsight: string;
  overallGuidance: string;
  whyThisOption: string;
  // Underlying Quality Score (UQS) - fundamental analysis
  uqsScore: number;
  uqsRating: 'STRONG' | 'FAIR' | 'WEAK';
  uqsInsight: string;
  uqsComponents: {
    trendStrength: number;
    cashFlowHealth: number;
    stability: number;
    earnings: number;
  };
  uqsRawData: {
    marketCap: number | null;
    freeCashFlow: number | null;
    netMargin: number | null;
    beta: number | null;
    epsGrowth5Y: number | null;
    roe: number | null;
    peRatio: number | null;
    priceVs52WeekHigh: number | null;
    dataSource: string;
    fetchedAt: string;
  };
  // Market Context from AI analysis
  marketSentiment: 'bullish' | 'bearish' | 'neutral' | null;
  leapsConfidence: number | null;
  marketInsight: string | null;
}

interface LeapsScanResult {
  symbol: string;
  status: 'qualified' | 'no_leaps_available' | 'no_qualified_options' | 'error';
  reason: string | null;
  candidates: LeapsCandidate[];
  analysisLog: string;
}

interface LeapsFilterOptions {
  minDTE?: number;
  maxDTE?: number;
  minDelta?: number;
  maxDelta?: number;
  minITM?: number;
  maxITM?: number;
}

class LogCapture {
  private logs: string[] = [];
  
  log(...args: any[]) {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    this.logs.push(message);
    console.log(...args);
  }
  
  getLog(): string {
    return this.logs.join('\n');
  }
  
  clear() {
    this.logs = [];
  }
}

export class LeapsScannerService {
  private currentBatchId: string | null = null;

  private readonly DEFAULT_FILTERS: LeapsFilterOptions = {
    minDTE: 365,
    maxDTE: 900,
    minDelta: 0.70,
    maxDelta: 0.90,
    minITM: 10,
    maxITM: 20,
  };

  async calculateIVPercentile(symbol: string): Promise<number> {
    try {
      // Step 1: Get the current ATM IV from the options chain (real implied volatility)
      const priceData = await priceCacheService.getPrice(symbol);
      let currentIVPercent: number | null = null;

      if (priceData && priceData.price > 0) {
        const ivData = await marketDataService.getAtmIVAndExpectedMove(symbol, priceData.price);
        if (ivData.atmIv && ivData.atmIv > 0) {
          currentIVPercent = ivData.atmIv * 100; // Convert to percentage (e.g. 0.25 → 25%)
        }
      }

      // Step 2: Build 252-day historical realized vol distribution (log-return based, annualized)
      const historicalData = await marketDataService.getHistoricalData(symbol, 252);
      if (historicalData.length < 30) return 50;

      const HV_WINDOW = 21; // ~1 month of trading days
      const hvValues: number[] = [];

      for (let i = HV_WINDOW; i < historicalData.length; i++) {
        const slice = historicalData.slice(i - HV_WINDOW, i + 1);
        const logReturns = slice.slice(1).map((d, idx) =>
          Math.log(d.close / slice[idx].close)
        );
        const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
        const variance = logReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / logReturns.length;
        const hv = Math.sqrt(variance * 252) * 100; // Annualized HV in percent
        hvValues.push(hv);
      }

      if (hvValues.length === 0) return 50;

      // Step 3: Rank current value against historical distribution
      // Use real ATM IV if available; otherwise fall back to most recent realized vol
      const currentValue = currentIVPercent ?? hvValues[hvValues.length - 1];
      const sorted = [...hvValues].sort((a, b) => a - b);

      let rank = 0;
      for (let i = 0; i < sorted.length; i++) {
        if (currentValue >= sorted[i]) rank = i + 1;
      }

      return Math.round(Math.max(0, Math.min(100, (rank / sorted.length) * 100)));
    } catch (error) {
      console.error(`Error calculating IV percentile for ${symbol}:`, error);
      return 50;
    }
  }

  /**
   * Classify an expiry date by liquidity tier:
   * - 'quarterly': 3rd Friday of Jan/Apr/Jul/Oct (highest liquidity)
   * - 'monthly':   3rd Friday of any other month
   * - 'weekly':    anything else (lowest liquidity)
   * Returns a sort priority (lower = prefer first).
   */
  classifyExpiry(date: Date): { type: 'quarterly' | 'monthly' | 'weekly'; priority: number } {
    const month = date.getUTCMonth(); // 0-indexed
    const dayOfWeek = date.getUTCDay(); // 0=Sun, 5=Fri
    const day = date.getUTCDate();

    const isFriday = dayOfWeek === 5;
    const isThirdFriday = isFriday && day >= 15 && day <= 21;
    const isQuarterlyMonth = [0, 3, 6, 9].includes(month); // Jan, Apr, Jul, Oct

    if (isThirdFriday && isQuarterlyMonth) return { type: 'quarterly', priority: 0 };
    if (isThirdFriday) return { type: 'monthly', priority: 1 };
    return { type: 'weekly', priority: 2 };
  }

  calculateZLVI(extrinsicPercent: number, ivPercentile: number, delta: number): number {
    // ZLVI formula: 0.50*(1-Extrinsic%) + 0.30*(1-IVpercentile) + 0.20*Delta
    // All inputs should be in 0-1 range for the formula to work correctly
    const extrinsicNormalized = extrinsicPercent / 100; // Convert percent to 0-1
    const ivNormalized = ivPercentile / 100; // Convert percent to 0-1
    const deltaNormalized = Math.abs(delta); // Delta is already 0-1
    
    const extrinsicComponent = 0.50 * (1 - extrinsicNormalized);
    const ivComponent = 0.30 * (1 - ivNormalized);
    const deltaComponent = 0.20 * deltaNormalized;
    
    // Sum is between 0 and 1, multiply by 100 to get 0-100 score
    const zlvi = (extrinsicComponent + ivComponent + deltaComponent) * 100;
    return Math.round(Math.max(0, Math.min(100, zlvi)));
  }

  zlviToStars(zlviScore: number): number {
    if (zlviScore >= 80) return 5;
    if (zlviScore >= 65) return 4;
    if (zlviScore >= 50) return 3;
    if (zlviScore >= 35) return 2;
    return 1;
  }

  getExtrinsicRating(extrinsicPercent: number): 'excellent' | 'good' | 'overpriced' | 'avoid' {
    if (extrinsicPercent < 15) return 'excellent';
    if (extrinsicPercent < 30) return 'good';
    if (extrinsicPercent < 50) return 'overpriced';
    return 'avoid';
  }

  getIVRating(ivPercentile: number): 'low' | 'moderate' | 'high' {
    if (ivPercentile < 25) return 'low';
    if (ivPercentile < 60) return 'moderate';
    return 'high';
  }

  getLiquidityFlag(oi: number, baCents: number, premiumCents: number): 'excellent' | 'good' | 'caution' | 'illiquid' {
    const spreadPercent = premiumCents > 0 ? (baCents / premiumCents) * 100 : 100;
    
    if (oi >= 1000 && spreadPercent < 3) return 'excellent';
    if (oi >= 500 && spreadPercent < 5) return 'good';
    if (oi >= 100 && spreadPercent < 10) return 'caution';
    return 'illiquid';
  }

  generateReasonTag(candidate: Partial<LeapsCandidate>): string {
    const tags: string[] = [];
    
    if (candidate.extrinsicRating === 'excellent') {
      tags.push('High intrinsic value');
    }
    if (candidate.ivRating === 'low') {
      tags.push('Low IV environment');
    }
    if (candidate.liquidityFlag === 'illiquid' || candidate.liquidityFlag === 'caution') {
      tags.push('Wide spread — caution');
    }
    if ((candidate.delta || 0) >= 0.85) {
      tags.push('Deep ITM');
    }
    if ((candidate.dte || 0) >= 540) {
      tags.push('Extended duration');
    }
    
    if (tags.length === 0) {
      if ((candidate.zlviScore || 0) >= 70) {
        tags.push('Strong value');
      } else if ((candidate.zlviScore || 0) >= 50) {
        tags.push('Fair value');
      } else {
        tags.push('Review metrics');
      }
    }
    
    return tags[0];
  }

  // Generate interpretive insight for extrinsic value
  generateExtrinsicInsight(extrinsicPercent: number, extrinsicRating: string): string {
    if (extrinsicRating === 'excellent') {
      return `Only ${extrinsicPercent.toFixed(1)}% of your premium is time value. This is excellent — most of what you're paying for is real, intrinsic value that won't decay.`;
    } else if (extrinsicRating === 'good') {
      return `${extrinsicPercent.toFixed(1)}% time value is reasonable for LEAPS. You're getting solid intrinsic value with manageable time decay.`;
    } else if (extrinsicRating === 'overpriced') {
      return `${extrinsicPercent.toFixed(1)}% time value is on the high side. A significant portion of your premium will decay over time — consider waiting for better pricing.`;
    }
    return `${extrinsicPercent.toFixed(1)}% time value is too high. Most of your premium is extrinsic and will erode — not ideal for LEAPS.`;
  }

  // Generate interpretive insight for IV percentile
  generateIVInsight(ivPercentile: number, ivRating: string): string {
    if (ivRating === 'low') {
      return `IV is in the ${ivPercentile}th percentile — options are relatively cheap right now. Good time to buy LEAPS as premiums are favorable.`;
    } else if (ivRating === 'moderate') {
      return `IV is at the ${ivPercentile}th percentile — middle of the range. Options are fairly priced, neither cheap nor expensive.`;
    }
    return `IV is elevated at the ${ivPercentile}th percentile — options are expensive. Consider waiting for IV to cool down before buying.`;
  }

  // Generate interpretive insight for liquidity
  generateLiquidityInsight(oi: number, baCents: number, premiumCents: number, liquidityFlag: string): string {
    const spreadPercent = premiumCents > 0 ? (baCents / premiumCents) * 100 : 100;
    
    if (liquidityFlag === 'excellent') {
      return `Strong liquidity with ${oi.toLocaleString()} open interest and tight ${spreadPercent.toFixed(1)}% spread. You'll get fair fills and can exit easily.`;
    } else if (liquidityFlag === 'good') {
      return `Adequate liquidity (${oi.toLocaleString()} OI, ${spreadPercent.toFixed(1)}% spread). Use limit orders for better fills.`;
    } else if (liquidityFlag === 'caution') {
      return `Limited liquidity (${oi.toLocaleString()} OI, ${spreadPercent.toFixed(1)}% spread). Be patient with limit orders — wide spreads can cost you.`;
    }
    return `Poor liquidity warning. The wide spread could significantly impact your entry and exit prices.`;
  }

  // Generate overall guidance for the candidate
  generateOverallGuidance(candidate: Partial<LeapsCandidate>): string {
    const zlviScore = candidate.zlviScore || 0;
    const extrinsicRating = candidate.extrinsicRating;
    const ivRating = candidate.ivRating;
    const liquidityFlag = candidate.liquidityFlag;
    
    // Build guidance based on the combination of factors
    if (zlviScore >= 70 && liquidityFlag !== 'illiquid' && liquidityFlag !== 'caution') {
      if (ivRating === 'low') {
        return 'Strong buy opportunity. Low IV, good value, and solid liquidity make this an ideal LEAPS entry.';
      }
      return 'Good value proposition with favorable metrics. Consider entering on your next green day.';
    } else if (zlviScore >= 50) {
      if (liquidityFlag === 'caution' || liquidityFlag === 'illiquid') {
        return 'Decent value but liquidity concerns. Use limit orders and be patient, or wait for better liquidity.';
      }
      if (ivRating === 'high') {
        return 'Fair value but elevated IV. Consider waiting for a volatility pullback before entering.';
      }
      return 'Acceptable entry point. Not the best value, but workable if you have conviction on the underlying.';
    } else {
      if (extrinsicRating === 'overpriced' || extrinsicRating === 'avoid') {
        return 'Expensive premium with high time value. Consider waiting for better pricing or a different strike.';
      }
      return 'Below-average value. Review the metrics carefully before committing capital here.';
    }
  }

  // Generate "why this option" explanation
  generateWhyThisOption(candidate: Partial<LeapsCandidate>, allCandidates: Partial<LeapsCandidate>[]): string {
    const reasons: string[] = [];
    
    // Best ZLVI score
    if (allCandidates.length > 1 && candidate.zlviScore === Math.max(...allCandidates.map(c => c.zlviScore || 0))) {
      reasons.push('highest value score among all candidates');
    }
    
    // Good delta
    const delta = candidate.delta || 0;
    if (delta >= 0.80 && delta <= 0.85) {
      reasons.push('optimal delta range for stock replacement');
    } else if (delta >= 0.85) {
      reasons.push('deep ITM for maximum stock-like behavior');
    }
    
    // Low extrinsic
    if (candidate.extrinsicRating === 'excellent') {
      reasons.push('minimal time decay exposure');
    }
    
    // Good liquidity
    if (candidate.liquidityFlag === 'excellent') {
      reasons.push('excellent liquidity for easy entry/exit');
    }
    
    // Good IV
    if (candidate.ivRating === 'low') {
      reasons.push('buying at favorable volatility levels');
    }
    
    if (reasons.length === 0) {
      return 'Best available option based on your filter criteria.';
    }
    
    return 'Selected because: ' + reasons.join(', ') + '.';
  }

  async scanSymbol(
    symbol: string, 
    filters: LeapsFilterOptions = {},
    logger?: LogCapture
  ): Promise<LeapsScanResult> {
    const log = logger || new LogCapture();
    const mergedFilters = { ...this.DEFAULT_FILTERS, ...filters };
    
    log.log(`\n🎯 ========== LEAPS SCAN: ${symbol} ==========`);
    log.log(`📋 Filters: DTE ${mergedFilters.minDTE}-${mergedFilters.maxDTE}, Delta ${mergedFilters.minDelta}-${mergedFilters.maxDelta}, ITM ${mergedFilters.minITM}-${mergedFilters.maxITM}%`);
    
    try {
      const quote = await marketDataService.getQuote(symbol);
      const currentPrice = quote.price;
      log.log(`💰 Current Price: $${currentPrice.toFixed(2)}`);
      
      const ivPercentile = await this.calculateIVPercentile(symbol);
      log.log(`📊 IV Percentile: ${ivPercentile}% (${this.getIVRating(ivPercentile)})`);
      
      // Fetch Underlying Quality Score (UQS) from fundamentals
      log.log(`📈 Fetching Underlying Quality Score...`);
      const uqs = await fundamentalsService.calculateUnderlyingQualityScore(symbol);
      log.log(`   UQS: ${uqs.score}/100 (${uqs.rating}) - ${uqs.insights.overall}`);
      
      // Fetch Market Context (AI sentiment)
      let marketSentiment: 'bullish' | 'bearish' | 'neutral' | null = null;
      let leapsConfidence: number | null = null;
      let marketInsight: string | null = null;
      try {
        const marketContext = await marketContextService.getLatestAnalysis();
        if (marketContext) {
          marketSentiment = marketContext.marketRegime as 'bullish' | 'bearish' | 'neutral';
          leapsConfidence = marketContext.recommendations?.leaps?.confidence || null;
          marketInsight = marketContext.recommendations?.leaps?.reasoning || null;
          log.log(`🌍 Market Context: ${marketSentiment} (LEAPS confidence: ${leapsConfidence || 'N/A'})`);
        }
      } catch (e) {
        log.log(`   ⚠️ Market context not available`);
      }
      
      const expiries = await marketDataService.getAvailableExpiries(symbol);
      
      const now = new Date();
      now.setUTCHours(0, 0, 0, 0);
      
      const leapsExpiries = expiries
        .filter(e => {
          const dte = Math.floor((e.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return dte >= mergedFilters.minDTE! && dte <= mergedFilters.maxDTE!;
        })
        .sort((a, b) => {
          const pa = this.classifyExpiry(a).priority;
          const pb = this.classifyExpiry(b).priority;
          if (pa !== pb) return pa - pb; // quarterly first, then monthly, then weekly
          return a.getTime() - b.getTime(); // within same tier, prefer nearer date
        });

      log.log(`📅 LEAPS Expiries Found: ${leapsExpiries.length}`);
      
      if (leapsExpiries.length === 0) {
        log.log(`❌ No LEAPS expiries available (DTE >= ${mergedFilters.minDTE})`);
        return {
          symbol,
          status: 'no_leaps_available',
          reason: `No expiries with DTE >= ${mergedFilters.minDTE}`,
          candidates: [],
          analysisLog: log.getLog(),
        };
      }
      
      const allCandidates: LeapsCandidate[] = [];
      
      for (const expiry of leapsExpiries.slice(0, 3)) {
        const dte = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const { type: expiryType } = this.classifyExpiry(expiry);
        log.log(`\n📅 Scanning expiry: ${expiry.toISOString().split('T')[0]} (${dte} DTE, ${expiryType})`);
        
        try {
          const optionChain = await marketDataService.getOptionChain(symbol, expiry);
          
          const calls = optionChain.filter(o => o.type === 'call');
          log.log(`   🔍 CALL options found: ${calls.length}`);
          
          const itmCalls = calls.filter(o => {
            const itmPercent = ((currentPrice - o.strike) / currentPrice) * 100;
            return itmPercent >= mergedFilters.minITM! && itmPercent <= mergedFilters.maxITM!;
          });
          
          log.log(`   🎯 ITM Calls (${mergedFilters.minITM}-${mergedFilters.maxITM}%): ${itmCalls.length}`);
          
          const deltaFiltered = itmCalls.filter(o => {
            const delta = Math.abs(o.delta || 0);
            return delta >= mergedFilters.minDelta! && delta <= mergedFilters.maxDelta!;
          });
          
          log.log(`   📊 Delta Filtered (${mergedFilters.minDelta}-${mergedFilters.maxDelta}): ${deltaFiltered.length}`);
          
          for (const option of deltaFiltered) {
            const midPrice = (option.bid + option.ask) / 2;
            const premiumCents = Math.round(midPrice * 100);
            const bidCents = Math.round(option.bid * 100);
            const askCents = Math.round(option.ask * 100);
            const baCents = askCents - bidCents;
            
            const intrinsicValue = Math.max(0, currentPrice - option.strike);
            const intrinsicCents = Math.round(intrinsicValue * 100);
            const extrinsicCents = premiumCents - intrinsicCents;
            const extrinsicPercent = premiumCents > 0 ? (extrinsicCents / premiumCents) * 100 : 100;
            
            const itmPercent = ((currentPrice - option.strike) / currentPrice) * 100;
            
            const delta = Math.abs(option.delta || 0);
            const zlviScore = this.calculateZLVI(extrinsicPercent, ivPercentile, delta);
            
            const liquidityFlag = this.getLiquidityFlag(option.openInterest, baCents, premiumCents);
            
            const extrinsicRating = this.getExtrinsicRating(extrinsicPercent);
            const ivRating = this.getIVRating(ivPercentile);
            const roundedExtrinsicPercent = Math.round(extrinsicPercent * 10) / 10;
            
            const candidate: LeapsCandidate = {
              symbol,
              expiry,
              strike: option.strike,
              dte,
              delta,
              premiumCents,
              bidCents,
              askCents,
              intrinsicCents,
              extrinsicCents,
              extrinsicPercent: roundedExtrinsicPercent,
              ivPercentile,
              itmPercent: Math.round(itmPercent * 10) / 10,
              oi: option.openInterest,
              baCents,
              zlviScore,
              zlviStars: this.zlviToStars(zlviScore),
              liquidityFlag,
              extrinsicRating,
              ivRating,
              reasonTag: '',
              extrinsicInsight: this.generateExtrinsicInsight(roundedExtrinsicPercent, extrinsicRating),
              ivInsight: this.generateIVInsight(ivPercentile, ivRating),
              liquidityInsight: this.generateLiquidityInsight(option.openInterest, baCents, premiumCents, liquidityFlag),
              overallGuidance: '',
              whyThisOption: '',
              // Underlying Quality Score
              uqsScore: uqs.score,
              uqsRating: uqs.rating,
              uqsInsight: uqs.insights.overall,
              uqsComponents: uqs.components,
              uqsRawData: uqs.rawData,
              // Market Context
              marketSentiment,
              leapsConfidence,
              marketInsight,
            };
            
            candidate.reasonTag = this.generateReasonTag(candidate);
            candidate.overallGuidance = this.generateOverallGuidance(candidate);
            
            if (liquidityFlag !== 'illiquid') {
              allCandidates.push(candidate);
            }
          }
        } catch (error) {
          log.log(`   ⚠️ Error fetching options for ${expiry.toISOString().split('T')[0]}: ${(error as Error).message}`);
        }
      }
      
      allCandidates.sort((a, b) => b.zlviScore - a.zlviScore);
      
      log.log(`\n📊 Total LEAPS Candidates Found: ${allCandidates.length}`);
      
      // Generate "why this option" for each candidate now that we have the full list
      for (const candidate of allCandidates) {
        candidate.whyThisOption = this.generateWhyThisOption(candidate, allCandidates);
      }
      
      if (allCandidates.length > 0) {
        log.log(`\n🏆 Top 3 Candidates:`);
        allCandidates.slice(0, 3).forEach((c, i) => {
          log.log(`   ${i + 1}. $${c.strike} ${c.expiry.toISOString().split('T')[0]} | Delta: ${c.delta.toFixed(2)} | ZLVI: ${c.zlviScore} (${'⭐'.repeat(c.zlviStars)}) | ${c.reasonTag}`);
        });
        
        // Select only the BEST candidate (highest ZLVI score)
        const bestCandidate = allCandidates[0];
        log.log(`\n🥇 BEST PICK: $${bestCandidate.strike} ${bestCandidate.expiry.toISOString().split('T')[0]}`);
        log.log(`   ${bestCandidate.whyThisOption}`);
        
        return {
          symbol,
          status: 'qualified',
          reason: null,
          candidates: [bestCandidate], // Return only the best candidate
          analysisLog: log.getLog(),
        };
      }
      
      return {
        symbol,
        status: 'no_qualified_options',
        reason: 'No options meet filter criteria',
        candidates: [],
        analysisLog: log.getLog(),
      };
      
    } catch (error) {
      log.log(`❌ Error scanning ${symbol}: ${(error as Error).message}`);
      return {
        symbol,
        status: 'error',
        reason: (error as Error).message,
        candidates: [],
        analysisLog: log.getLog(),
      };
    }
  }

  async runScan(
    userId: string,
    symbols: string[],
    filters: LeapsFilterOptions = {}
  ): Promise<void> {
    this.currentBatchId = `leaps-${Date.now()}`;
    console.log(`\n🚀 Starting LEAPS scan for ${symbols.length} symbols...`);
    console.log(`📋 Batch ID: ${this.currentBatchId}`);
    
    for (const symbol of symbols) {
      const result = await this.scanSymbol(symbol, filters);
      
      if (result.candidates.length > 0) {
        // Only save the BEST candidate (first one after sorting by ZLVI)
        const candidate = result.candidates[0];
        const scanResult: InsertScanResult = {
          userId,
          batchId: this.currentBatchId,
          symbol,
          strategyType: 'LEAPS_LONG_CALL',
          status: 'qualified',
          reason: candidate.reasonTag,
          expiry: candidate.expiry,
          shortStrike: candidate.strike,
          longStrike: null,
          width: null,
          delta: candidate.delta,
          creditMidCents: null,
          dte: candidate.dte,
          rr: null,
          maxLossCents: candidate.premiumCents,
          oi: candidate.oi,
          baCents: candidate.baCents,
          score: candidate.zlviScore,
          signal: `LEAPS CALL $${candidate.strike} | ${candidate.zlviStars}⭐`,
          analysisLog: result.analysisLog,
          premiumCents: candidate.premiumCents,
          intrinsicCents: candidate.intrinsicCents,
          extrinsicCents: candidate.extrinsicCents,
          extrinsicPercent: candidate.extrinsicPercent,
          ivPercentile: candidate.ivPercentile,
          zlviScore: candidate.zlviScore,
          itmPercent: candidate.itmPercent,
          liquidityFlag: candidate.liquidityFlag,
          reasonTag: candidate.reasonTag,
          bidCents: candidate.bidCents,
          askCents: candidate.askCents,
          // Interpretive insights
          extrinsicInsight: candidate.extrinsicInsight,
          ivInsight: candidate.ivInsight,
          liquidityInsight: candidate.liquidityInsight,
          overallGuidance: candidate.overallGuidance,
          whyThisOption: candidate.whyThisOption,
          // Underlying Quality Score
          uqsScore: candidate.uqsScore,
          uqsRating: candidate.uqsRating,
          uqsInsight: candidate.uqsInsight,
          uqsComponents: candidate.uqsComponents,
          uqsRawData: candidate.uqsRawData,
          // Market Context
          marketSentiment: candidate.marketSentiment,
          leapsConfidence: candidate.leapsConfidence,
          marketInsight: candidate.marketInsight,
        };
        
        await storage.saveScanResult(userId, scanResult);
      } else {
        // Save non-qualified results with reason tag for user feedback
        const reasonTag = result.status === 'no_leaps_available' 
          ? 'No LEAPS expiries available'
          : result.status === 'no_qualified_options'
          ? 'No options meet filter criteria'
          : 'Error scanning symbol';
          
        const scanResult: InsertScanResult = {
          userId,
          batchId: this.currentBatchId,
          symbol,
          strategyType: 'LEAPS_LONG_CALL',
          status: result.status,
          reason: result.reason,
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
          signal: `LEAPS: ${reasonTag}`,
          analysisLog: result.analysisLog,
          reasonTag: reasonTag,
        };
        
        await storage.saveScanResult(userId, scanResult);
      }
      
      if (symbols.indexOf(symbol) < symbols.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`\n✅ LEAPS scan completed for ${symbols.length} symbols`);
  }

  async getLatestResults(userId: string, limit: number = 50): Promise<any[]> {
    // Use getRecentScanResults to get LEAPS results from the last 7 days
    // This fixes the issue where CS/IC scans would "hide" LEAPS results
    // because getLatestScanResults only returns the most recent batch
    const allResults = await storage.getRecentScanResults(userId, 7);
    
    // Filter for LEAPS results only
    const leapsResults = allResults.filter(r => r.strategyType === 'LEAPS_LONG_CALL');
    
    // Group by symbol and keep only the most recent result per symbol
    const latestBySymbol = new Map<string, any>();
    for (const result of leapsResults) {
      const existing = latestBySymbol.get(result.symbol);
      if (!existing || new Date(result.asof) > new Date(existing.asof)) {
        latestBySymbol.set(result.symbol, result);
      }
    }
    
    // Sort by score descending and limit
    return Array.from(latestBySymbol.values())
      .sort((a, b) => (b.zlviScore ?? 0) - (a.zlviScore ?? 0))
      .slice(0, limit);
  }
}

export const leapsScannerService = new LeapsScannerService();
