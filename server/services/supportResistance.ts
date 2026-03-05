import { db } from '../db';
import { tickers, watchlist } from '@shared/schema';
import type { SRLevel, SRMetadata } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import OpenAI from 'openai';

interface OHLCBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TechnicalLevel {
  value: number;
  method: 'pivot' | 'consolidation' | 'volume' | 'round';
  touches: number;
  strength: number; // 0-100 score based on # of touches and time spent
}

interface DetectedLevels {
  support: SRLevel[];
  resistance: SRLevel[];
  metadata?: SRMetadata;
}

/**
 * Support/Resistance Auto-Detection Service
 * 
 * Uses hybrid approach:
 * 1. Technical analysis to detect levels (pivot points, consolidation zones, volume clusters, round numbers)
 * 2. LLM validation to rank and provide context
 * 3. ATH/ATL detection for special handling
 */
export class SupportResistanceService {
  private openai: OpenAI | null = null;
  private polygonApiKey: string | null = null;
  private enabled: boolean = false;

  // Service-wide rate limit state
  private rateLimitCooldownUntil: number = 0; // Unix timestamp
  private rateLimitBackoffSeconds: number = 0; // Current backoff duration

  constructor() {
    const polygonKey = process.env.POLYGON_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // Polygon is the only hard requirement now
    if (!polygonKey) {
      console.warn('⚠️  S/R auto-detection disabled: POLYGON_API_KEY not set');
      return;
    }

    this.polygonApiKey = polygonKey;
    this.enabled = true;

    // OpenAI is optional — used to add context strings if available
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      console.log('✅ S/R auto-detection service enabled (with LLM context enrichment)');
    } else {
      console.log('✅ S/R auto-detection service enabled (deterministic mode, no LLM)');
    }
  }

  /**
   * Check if service is enabled (requires only POLYGON_API_KEY)
   */
  private checkEnabled(): void {
    if (!this.enabled || !this.polygonApiKey) {
      throw new Error('S/R auto-detection not available (missing POLYGON_API_KEY)');
    }
  }

  /**
   * Check if service is in rate limit cooldown
   */
  private isInCooldown(): { cooling: boolean, remainingSeconds: number } {
    const now = Date.now();
    if (now < this.rateLimitCooldownUntil) {
      const remainingSeconds = Math.ceil((this.rateLimitCooldownUntil - now) / 1000);
      return { cooling: true, remainingSeconds };
    }
    return { cooling: false, remainingSeconds: 0 };
  }

  /**
   * Set service-wide rate limit cooldown
   */
  private setCooldown(seconds: number): void {
    this.rateLimitBackoffSeconds = seconds;
    this.rateLimitCooldownUntil = Date.now() + (seconds * 1000);
    console.log(`🚦 Service-wide rate limit cooldown: ${seconds}s`);
  }

  /**
   * Reset cooldown and backoff on successful API call
   */
  private resetCooldown(): void {
    // Only reset if we've successfully completed a full cycle
    if (this.rateLimitBackoffSeconds > 0) {
      console.log(`✅ Rate limit cooldown cleared`);
    }
    this.rateLimitBackoffSeconds = 0;
    this.rateLimitCooldownUntil = 0;
  }

  /**
   * Fetch historical daily OHLC data from Polygon (with service-wide rate limit handling)
   */
  async fetchHistoricalData(symbol: string, months: number = 6): Promise<OHLCBar[]> {
    // CRITICAL: Check enabled before making any API calls
    this.checkEnabled();

    // Check service-wide cooldown before making any API calls
    const cooldownCheck = this.isInCooldown();
    if (cooldownCheck.cooling) {
      const error = new Error(`RATE_LIMIT: Service in cooldown, retry after ${cooldownCheck.remainingSeconds}s`) as any;
      error.retryAfterSeconds = cooldownCheck.remainingSeconds;
      error.code = 'RATE_LIMIT';
      throw error;
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`📊 Fetching ${symbol} historical data: ${startDateStr} to ${endDateStr}`);

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDateStr}/${endDateStr}?adjusted=true&sort=asc&apiKey=${this.polygonApiKey}`;
    
    const response = await fetch(url);
    
    // Handle Polygon rate limiting (HTTP 429) - set service-wide cooldown
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitSeconds = retryAfter ? parseInt(retryAfter) : 60;
      
      // Implement exponential backoff: max(retryAfter, currentBackoff * 2), capped at 300s
      const newBackoff = Math.max(
        waitSeconds,
        this.rateLimitBackoffSeconds > 0 ? this.rateLimitBackoffSeconds * 2 : waitSeconds
      );
      const cappedBackoff = Math.min(newBackoff, 300);
      
      this.setCooldown(cappedBackoff);
      
      const error = new Error(`RATE_LIMIT: Retry after ${cappedBackoff}s`) as any;
      error.retryAfterSeconds = cappedBackoff;
      error.code = 'RATE_LIMIT';
      throw error;
    }

    if (!response.ok) {
      throw new Error(`Polygon API error (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      throw new Error(`No historical data available for ${symbol}`);
    }

    console.log(`   Retrieved ${data.results.length} daily bars`);

    return data.results.map((bar: any) => ({
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v
    }));
  }

  /**
   * Detect pivot points (local maxima and minima with multiple touches)
   */
  private detectPivotPoints(bars: OHLCBar[], type: 'support' | 'resistance'): TechnicalLevel[] {
    const levels: Map<number, { touches: number; firstTouch: number }> = new Map();
    const tolerance = 0.02; // 2% price tolerance for "same level"

    // Find local extrema
    for (let i = 2; i < bars.length - 2; i++) {
      const price = type === 'support' ? bars[i].low : bars[i].high;
      const prev2 = type === 'support' ? bars[i - 2].low : bars[i - 2].high;
      const prev1 = type === 'support' ? bars[i - 1].low : bars[i - 1].high;
      const next1 = type === 'support' ? bars[i + 1].low : bars[i + 1].high;
      const next2 = type === 'support' ? bars[i + 2].low : bars[i + 2].high;

      // Check if it's a local minimum (support) or maximum (resistance)
      const isExtremum = type === 'support'
        ? price <= prev2 && price <= prev1 && price <= next1 && price <= next2
        : price >= prev2 && price >= prev1 && price >= next1 && price >= next2;

      if (!isExtremum) continue;

      // Group similar price levels together
      let foundCluster = false;
      for (const [level, data] of levels.entries()) {
        if (Math.abs(price - level) / level < tolerance) {
          levels.set(level, { 
            touches: data.touches + 1, 
            firstTouch: Math.min(data.firstTouch, bars[i].timestamp) 
          });
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        levels.set(price, { touches: 1, firstTouch: bars[i].timestamp });
      }
    }

    // Filter for levels with 3+ touches and calculate strength
    const entries = Array.from(levels.entries());
    return entries
      .filter(([_, data]) => data.touches >= 3)
      .map(([value, data]) => ({
        value: Math.round(value * 100) / 100,
        method: 'pivot' as const,
        touches: data.touches,
        strength: Math.min(100, data.touches * 20) // Max 100
      }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5); // Top 5 levels
  }

  /**
   * Detect consolidation zones (price ranges with high time spent)
   */
  private detectConsolidationZones(bars: OHLCBar[], type: 'support' | 'resistance'): TechnicalLevel[] {
    const priceRanges: Map<number, number> = new Map(); // price level -> bars spent there
    const tolerance = 0.015; // 1.5% price tolerance

    for (const bar of bars) {
      const price = type === 'support' ? bar.low : bar.high;

      // Find or create price cluster
      let foundCluster = false;
      for (const [level, count] of priceRanges.entries()) {
        if (Math.abs(price - level) / level < tolerance) {
          priceRanges.set(level, count + 1);
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        priceRanges.set(price, 1);
      }
    }

    // Filter for zones with significant time spent (10%+ of total bars)
    const minBars = Math.floor(bars.length * 0.10);
    const rangeEntries = Array.from(priceRanges.entries());
    
    return rangeEntries
      .filter(([_, count]) => count >= minBars)
      .map(([value, count]) => ({
        value: Math.round(value * 100) / 100,
        method: 'consolidation' as const,
        touches: count,
        strength: Math.min(100, (count / bars.length) * 200) // Normalize to 0-100
      }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3); // Top 3 zones
  }

  /**
   * Detect volume-weighted levels (price points with significant volume)
   */
  private detectVolumeLevels(bars: OHLCBar[], type: 'support' | 'resistance'): TechnicalLevel[] {
    const volumeByPrice: Map<number, number> = new Map();
    const tolerance = 0.02; // 2% tolerance

    for (const bar of bars) {
      const price = type === 'support' ? bar.low : bar.high;

      // Cluster by price
      let foundCluster = false;
      for (const [level, volume] of volumeByPrice.entries()) {
        if (Math.abs(price - level) / level < tolerance) {
          volumeByPrice.set(level, volume + bar.volume);
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        volumeByPrice.set(price, bar.volume);
      }
    }

    const avgVolume = bars.reduce((sum, bar) => sum + bar.volume, 0) / bars.length;
    const threshold = avgVolume * bars.length * 0.15; // 15% of total volume
    const volumeEntries = Array.from(volumeByPrice.entries());

    return volumeEntries
      .filter(([_, volume]) => volume >= threshold)
      .map(([value, volume]) => ({
        value: Math.round(value * 100) / 100,
        method: 'volume' as const,
        touches: Math.floor(volume / avgVolume),
        strength: Math.min(100, (volume / (avgVolume * bars.length)) * 300)
      }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3); // Top 3 levels
  }

  /**
   * Detect psychological round number levels ($100, $150, $200, etc.)
   */
  private detectRoundNumbers(currentPrice: number, type: 'support' | 'resistance'): TechnicalLevel[] {
    const roundLevels: TechnicalLevel[] = [];
    
    // Determine appropriate round number increments based on price
    let increment: number;
    if (currentPrice < 50) increment = 5;
    else if (currentPrice < 200) increment = 10;
    else if (currentPrice < 500) increment = 25;
    else increment = 50;

    // Find nearest round numbers above and below current price
    const baseLevel = Math.floor(currentPrice / increment) * increment;
    
    if (type === 'support') {
      // Look for round numbers below current price
      for (let i = 0; i < 3; i++) {
        const level = baseLevel - (i * increment);
        if (level > 0 && level < currentPrice * 0.95) { // Within 5% below
          roundLevels.push({
            value: level,
            method: 'round',
            touches: 0,
            strength: 60 - (i * 10) // Closer = stronger
          });
        }
      }
    } else {
      // Look for round numbers above current price
      for (let i = 1; i <= 3; i++) {
        const level = baseLevel + (i * increment);
        if (level > currentPrice * 1.05) { // Within 5% above
          roundLevels.push({
            value: level,
            method: 'round',
            touches: 0,
            strength: 60 - (i * 10)
          });
        }
      }
    }

    return roundLevels;
  }

  /**
   * Combine all technical analysis methods
   */
  async detectTechnicalLevels(symbol: string, bars: OHLCBar[]): Promise<{support: TechnicalLevel[], resistance: TechnicalLevel[]}> {
    console.log(`🔍 Running technical analysis for ${symbol}...`);

    const currentPrice = bars[bars.length - 1].close;

    // Detect support levels
    const pivotSupport = this.detectPivotPoints(bars, 'support');
    const consolidationSupport = this.detectConsolidationZones(bars, 'support');
    const volumeSupport = this.detectVolumeLevels(bars, 'support');
    const roundSupport = this.detectRoundNumbers(currentPrice, 'support');

    // Detect resistance levels
    const pivotResistance = this.detectPivotPoints(bars, 'resistance');
    const consolidationResistance = this.detectConsolidationZones(bars, 'resistance');
    const volumeResistance = this.detectVolumeLevels(bars, 'resistance');
    const roundResistance = this.detectRoundNumbers(currentPrice, 'resistance');

    // Combine and deduplicate
    const allSupport = [...pivotSupport, ...consolidationSupport, ...volumeSupport, ...roundSupport];
    const allResistance = [...pivotResistance, ...consolidationResistance, ...volumeResistance, ...roundResistance];

    // CRITICAL FIX: Filter by current price position
    // Support must be BELOW current price, resistance must be ABOVE
    const filteredSupport = allSupport.filter(level => level.value < currentPrice);
    const filteredResistance = allResistance.filter(level => level.value > currentPrice);

    // Deduplicate levels within 1% of each other, keeping the stronger one
    const dedupeSupport = this.deduplicateLevels(filteredSupport);
    const dedupeResistance = this.deduplicateLevels(filteredResistance);

    console.log(`   Found ${dedupeSupport.length} support levels, ${dedupeResistance.length} resistance levels`);

    return {
      support: dedupeSupport.slice(0, 5), // Top 5
      resistance: dedupeResistance.slice(0, 5) // Top 5
    };
  }

  /**
   * Deduplicate levels that are within 1% of each other
   */
  private deduplicateLevels(levels: TechnicalLevel[]): TechnicalLevel[] {
    const deduplicated: TechnicalLevel[] = [];
    const tolerance = 0.01; // 1%

    for (const level of levels) {
      const existing = deduplicated.find(l => 
        Math.abs(level.value - l.value) / l.value < tolerance
      );

      if (existing) {
        // Keep the stronger level
        if (level.strength > existing.strength) {
          deduplicated[deduplicated.indexOf(existing)] = level;
        }
      } else {
        deduplicated.push(level);
      }
    }

    return deduplicated.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Detect ATH/ATL conditions
   */
  private detectATHATL(bars: OHLCBar[], currentPrice: number): SRMetadata {
    const historicalHigh = Math.max(...bars.map(b => b.high));
    const historicalLow = Math.min(...bars.map(b => b.low));

    const isNearATH = currentPrice >= historicalHigh * 0.98; // Within 2% of ATH
    const isNearATL = currentPrice <= historicalLow * 1.02; // Within 2% of ATL

    return {
      atAllTimeHigh: isNearATH,
      atAllTimeLow: isNearATL,
      historicalHigh,
      historicalLow,
      dataRangeMonths: 6
    };
  }

  /**
   * Generate a human-readable context string from the detection method and touches count.
   * Deterministic — no LLM needed.
   */
  private getLevelContext(level: TechnicalLevel, type: 'support' | 'resistance'): string {
    switch (level.method) {
      case 'pivot':
        return `${level.touches}-touch pivot ${type} (price reversed here ${level.touches}x)`;
      case 'consolidation':
        return `Consolidation zone — price spent significant time at this level`;
      case 'volume':
        return `High-volume ${type} — ${level.touches}x average volume traded here`;
      case 'round':
        return `Psychological round number ${type}`;
      default:
        return `${type.charAt(0).toUpperCase() + type.slice(1)} level`;
    }
  }

  /**
   * Rank and convert detected technical levels to SRLevel format deterministically.
   * Optionally enriches context strings with LLM if OpenAI is available.
   */
  private rankAndEnrichLevels(
    technicalLevels: { support: TechnicalLevel[], resistance: TechnicalLevel[] }
  ): { support: SRLevel[], resistance: SRLevel[] } {
    const toSRLevel = (levels: TechnicalLevel[], type: 'support' | 'resistance'): SRLevel[] =>
      levels
        .slice(0, 5)
        .map(t => ({
          value: t.value,
          confidence: Math.min(100, t.strength),
          method: t.method,
          touches: t.touches,
          context: this.getLevelContext(t, type),
          source: 'auto' as const
        }))
        .sort((a, b) => b.confidence - a.confidence);

    return {
      support: toSRLevel(technicalLevels.support, 'support'),
      resistance: toSRLevel(technicalLevels.resistance, 'resistance'),
    };
  }

  /**
   * Update ticker S/R levels in database (CRITICAL: scoped by userId AND symbol for multi-tenant safety)
   */
  async updateTickerLevels(userId: string, symbol: string, levels: DetectedLevels): Promise<void> {
    console.log(`💾 Saving S/R levels for ${symbol} (user: ${userId})...`);

    // CRITICAL: Filter by BOTH userId AND symbol to ensure multi-tenant data isolation
    const result = await db.update(tickers)
      .set({
        supportLevels: levels.support,
        resistanceLevels: levels.resistance,
        support: levels.support[0]?.value || null, // Backward compatibility
        resistance: levels.resistance[0]?.value || null, // Backward compatibility
        srLastUpdated: new Date(),
        srSource: 'auto'
      })
      .where(sql`${tickers.userId} = ${userId} AND ${tickers.symbol} = ${symbol}`)
      .returning({ id: tickers.id });

    if (!result || result.length === 0) {
      throw new Error(`Ticker not found for user ${userId}: ${symbol}`);
    }

    console.log(`   ✅ Updated ${symbol}`);
  }

  /**
   * Analyze and update S/R levels for a single ticker
   */
  async analyzeTicker(userId: string, symbol: string): Promise<DetectedLevels> {
    this.checkEnabled();
    
    console.log(`\n🔍 Analyzing S/R levels for ${symbol}...`);

    try {
      // 1. Fetch 6 months of historical data
      const bars = await this.fetchHistoricalData(symbol, 6);
      const currentPrice = bars[bars.length - 1].close;

      // 2. Check for ATH/ATL
      const metadata = this.detectATHATL(bars, currentPrice);

      // 3. Run technical analysis
      const technicalLevels = await this.detectTechnicalLevels(symbol, bars);

      // 4. Handle ATH/ATL special cases
      let support: SRLevel[] = [];
      let resistance: SRLevel[] = [];

      if (metadata.atAllTimeHigh) {
        console.log(`   🚀 ${symbol} at ATH - no resistance levels`);
        const ranked = this.rankAndEnrichLevels({ support: technicalLevels.support, resistance: [] });
        support = ranked.support;
        resistance = [];
        metadata.note = "Testing all-time highs - no resistance levels available";
      } else if (metadata.atAllTimeLow) {
        console.log(`   📉 ${symbol} at ATL - no support levels`);
        const ranked = this.rankAndEnrichLevels({ support: [], resistance: technicalLevels.resistance });
        support = [];
        resistance = ranked.resistance;
        metadata.note = "Testing all-time lows - no support levels available";
      } else {
        const ranked = this.rankAndEnrichLevels(technicalLevels);
        support = ranked.support;
        resistance = ranked.resistance;
      }
      console.log(`   Detected ${support.length} support, ${resistance.length} resistance levels (deterministic)`);

      const result: DetectedLevels = {
        support,
        resistance,
        metadata
      };

      // 5. Save to database
      await this.updateTickerLevels(userId, symbol, result);

      return result;
    } catch (error: any) {
      console.error(`   ❌ Error analyzing ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Batch process all unique tickers from all watchlists with service-wide rate limit enforcement
   */
  async analyzeAllWatchlistTickers(): Promise<{ success: number, errors: number, details: string[], skipped: number }> {
    this.checkEnabled();
    console.log('🔄 Starting batch S/R analysis for all watchlist tickers...');

    try {
      // Get all unique ticker symbols from all watchlists with proper multi-tenant scoping
      const uniqueTickers = await db
        .selectDistinct({ symbol: watchlist.symbol, userId: watchlist.userId })
        .from(watchlist)
        .where(eq(watchlist.active, true));

      console.log(`   Found ${uniqueTickers.length} unique user-ticker combinations to analyze`);

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      const errorDetails: string[] = [];

      // Process tickers with bounded cooldown-aware retry loop (max 10 min per ticker)
      for (const { symbol, userId } of uniqueTickers) {
        if (!userId) {
          console.log(`   ⚠️  Skipping ${symbol} (no user ID)`);
          skippedCount++;
          errorDetails.push(`${symbol}: No user ID`);
          continue;
        }

        const tickerStartTime = Date.now();
        const MAX_WAIT_PER_TICKER_MS = 10 * 60 * 1000; // 10 minutes
        let retryAttempt = 0;
        let tickerCompleted = false;
        let lastWasCooldown = false;
        
        while (!tickerCompleted) {
          try {
            await this.analyzeTicker(userId, symbol);
            successCount++;
            tickerCompleted = true;
            
            // Success - reset service-wide cooldown
            if (this.rateLimitBackoffSeconds > 0) {
              this.resetCooldown();
            }

            // Standard rate limiting: Polygon allows 5 calls/min on free tier, so 12s is safe
            await new Promise(resolve => setTimeout(resolve, 12000));

          } catch (error: any) {
            // Check if this is a rate limit error
            if (error.code === 'RATE_LIMIT' && error.retryAfterSeconds) {
              const waitSeconds = error.retryAfterSeconds;
              const elapsedMs = Date.now() - tickerStartTime;
              
              // Check if waiting would exceed timeout AND we haven't attempted post-cooldown yet
              if (elapsedMs + (waitSeconds * 1000) >= MAX_WAIT_PER_TICKER_MS && !lastWasCooldown) {
                console.warn(`   ⚠️  Timeout: ${symbol} would exceed 10 min wait window. Skipping.`);
                skippedCount++;
                errorDetails.push(`${symbol} (user ${userId}): Would timeout waiting ${waitSeconds}s (elapsed: ${Math.round(elapsedMs/1000)}s)`);
                tickerCompleted = true;
                continue;
              }
              
              console.warn(`   ⚠️  Rate limit on ${symbol}. Pausing batch for ${waitSeconds}s (attempt ${retryAttempt + 1})...`);
              
              // Wait for the full cooldown period (blocks entire batch)
              await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
              
              // Mark that we just completed a cooldown - guarantee one post-cooldown attempt
              lastWasCooldown = true;
              retryAttempt++;
              continue; // Retry same ticker after cooldown
              
            } else {
              // Regular error - log and move to next ticker
              console.error(`   ❌ Failed to analyze ${symbol} for user ${userId}:`, error.message);
              errorCount++;
              errorDetails.push(`${symbol} (user ${userId}): ${error.message}`);
              
              // Shorter delay on non-rate-limit errors
              await new Promise(resolve => setTimeout(resolve, 5000));
              tickerCompleted = true; // Don't retry non-rate-limit errors
            }
            
            // Reset cooldown flag after any non-rate-limit path
            if (error.code !== 'RATE_LIMIT') {
              lastWasCooldown = false;
            }
          }
        }
      }

      console.log(`\n✅ Batch analysis complete: ${successCount} successful, ${errorCount} errors, ${skippedCount} skipped`);
      
      if (errorDetails.length > 0) {
        console.log(`\n⚠️  Error summary:`);
        errorDetails.slice(0, 10).forEach(detail => console.log(`   - ${detail}`));
        if (errorDetails.length > 10) {
          console.log(`   ... and ${errorDetails.length - 10} more errors`);
        }
      }

      return {
        success: successCount,
        errors: errorCount,
        details: errorDetails,
        skipped: skippedCount
      };

    } catch (error: any) {
      console.error('❌ Batch analysis fatal error:', error);
      throw error;
    }
  }

  /**
   * Manual refresh for a specific ticker (called from API)
   * Returns rate limit metadata if service is in cooldown
   */
  async refreshTicker(tickerId: string, userId: string): Promise<{ 
    success: boolean, 
    levels?: DetectedLevels, 
    retryAfterSeconds?: number, 
    error?: string 
  }> {
    try {
      this.checkEnabled();

      // Get ticker symbol
      const ticker = await db.query.tickers.findFirst({
        where: sql`${tickers.id} = ${tickerId} AND ${tickers.userId} = ${userId}`
      });

      if (!ticker) {
        throw new Error(`Ticker not found: ${tickerId}`);
      }

      const levels = await this.analyzeTicker(userId, ticker.symbol);
      return { success: true, levels };
      
    } catch (error: any) {
      // Bubble up rate limit metadata to API callers
      if (error.code === 'RATE_LIMIT' && error.retryAfterSeconds) {
        return {
          success: false,
          retryAfterSeconds: error.retryAfterSeconds,
          error: `Service is rate limited. Please retry after ${error.retryAfterSeconds} seconds.`
        };
      }
      
      // Other errors
      return {
        success: false,
        error: error.message || 'Unknown error during S/R refresh'
      };
    }
  }
}

export const supportResistanceService = new SupportResistanceService();
