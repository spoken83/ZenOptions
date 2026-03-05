/**
 * Fundamental Data Service
 * Fetches company fundamentals from Finnhub API for LEAPS quality assessment
 * Key metrics: Market Cap, Free Cash Flow, Earnings stability, Price trend
 */

import { marketDataService } from './marketData';
import * as fs from 'fs';
import * as path from 'path';

interface FundamentalMetrics {
  symbol: string;
  marketCap: number | null;           // in millions
  freeCashFlowTTM: number | null;     // in millions
  epsGrowth5Y: number | null;         // percentage
  revenueGrowth5Y: number | null;     // percentage
  peRatio: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  roe: number | null;                 // Return on Equity
  grossMargin: number | null;
  netMargin: number | null;
  beta: number | null;
  week52High: number | null;
  week52Low: number | null;
  currentPrice: number | null;
  priceVs52WeekHigh: number | null;   // percentage below 52-week high
  fetchedAt: Date;
}

interface UnderlyingQualityScore {
  score: number;              // 0-100
  rating: 'STRONG' | 'FAIR' | 'WEAK';
  components: {
    trendStrength: number;    // 0-25 based on price trend
    cashFlowHealth: number;   // 0-25 based on FCF
    stability: number;        // 0-25 based on market cap & beta
    earnings: number;         // 0-25 based on earnings consistency
  };
  insights: {
    trend: string;
    cashFlow: string;
    stability: string;
    earnings: string;
    overall: string;
  };
  rawData: {
    marketCap: number | null;       // in millions
    freeCashFlow: number | null;    // in millions (TTM)
    netMargin: number | null;       // percentage
    beta: number | null;
    epsGrowth5Y: number | null;     // percentage
    roe: number | null;             // percentage
    peRatio: number | null;
    priceVs52WeekHigh: number | null; // percentage
    dataSource: string;
    fetchedAt: string;
  };
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

// Known index ETFs - these don't have traditional fundamentals like stocks
// Includes major index ETFs, sector ETFs, leveraged/inverse variants
const INDEX_ETFS = new Set([
  // S&P 500
  'SPY', 'SPX', 'VOO', 'IVV', 'SPLG', 'SPXL', 'SPXS', 'SH', 'SDS', 'UPRO',
  // Nasdaq 100
  'QQQ', 'QQQM', 'TQQQ', 'SQQQ', 'PSQ', 'QLD',
  // Russell 2000
  'IWM', 'URTY', 'TNA', 'TZA', 'RWM', 'UWM',
  // Dow Jones
  'DIA', 'DDM', 'DOG', 'DXD', 'UDOW', 'SDOW',
  // Total US Market
  'VTI', 'ITOT', 'SPTM', 'SCHB',
  // Value/Growth
  'VTV', 'IVE', 'VUG', 'IVW', 'IWF', 'IWD', 'SPYV', 'SPYG',
  // International
  'VEA', 'VWO', 'EFA', 'EEM', 'IEMG', 'VEU', 'VXUS', 'IXUS',
  // Volatility
  'VXX', 'UVXY', 'SVXY', 'VIXY',
  // Commodities
  'GLD', 'SLV', 'GDX', 'GDXJ', 'USO', 'UNG', 'IAU',
  // Bonds
  'TLT', 'IEF', 'BND', 'AGG', 'LQD', 'HYG', 'TIP', 'SHY', 'TMF', 'TMV',
  // Sector SPDRs
  'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLC', 'XLY', 'XLP', 'XLB', 'XLU', 'XLRE',
  // Other sector ETFs
  'VGT', 'VHT', 'VNQ', 'VNQI', 'VFH', 'VDE', 'VAW', 'VCR', 'VDC', 'VIS', 'VOX', 'VPU',
  // Thematic
  'ARKK', 'ARKG', 'ARKW', 'ARKF', 'ARKQ',
]);

function isIndexETF(symbol: string): boolean {
  return INDEX_ETFS.has(symbol.toUpperCase());
}

class FundamentalsService {
  private cache: Map<string, { data: FundamentalMetrics; expiresAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
  private readonly CACHE_FILE = path.join(process.cwd(), '.fundamentals_cache.json');

  constructor() {
    this.loadCacheFromDisk();
  }

  private loadCacheFromDisk(): void {
    try {
      if (!fs.existsSync(this.CACHE_FILE)) return;
      const raw = fs.readFileSync(this.CACHE_FILE, 'utf8');
      const entries: Array<[string, { data: FundamentalMetrics; expiresAt: number }]> = JSON.parse(raw);
      const now = Date.now();
      let loaded = 0;
      for (const [key, entry] of entries) {
        if (entry.expiresAt > now) {
          // Restore fetchedAt as Date object
          entry.data.fetchedAt = new Date(entry.data.fetchedAt);
          this.cache.set(key, entry);
          loaded++;
        }
      }
      if (loaded > 0) console.log(`📊 Fundamentals cache loaded from disk: ${loaded} entries`);
    } catch (e) {
      console.warn('📊 Could not load fundamentals cache from disk:', e);
    }
  }

  private persistCacheToDisk(): void {
    try {
      const entries = Array.from(this.cache.entries());
      fs.writeFileSync(this.CACHE_FILE, JSON.stringify(entries), 'utf8');
    } catch (e) {
      console.warn('📊 Could not persist fundamentals cache to disk:', e);
    }
  }

  async getBasicFinancials(symbol: string): Promise<FundamentalMetrics | null> {
    const cacheKey = symbol.toUpperCase();
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`📊 Fundamentals cache hit for ${symbol}`);
      return cached.data;
    }

    if (!FINNHUB_API_KEY) {
      console.warn('⚠️ FINNHUB_API_KEY not configured, skipping fundamentals fetch');
      return null;
    }

    try {
      console.log(`📊 Fetching fundamentals for ${symbol} from Finnhub...`);
      
      const response = await fetch(
        `${FINNHUB_BASE_URL}/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_API_KEY}`
      );

      if (!response.ok) {
        console.error(`Finnhub API error for ${symbol}: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const metrics = data.metric || {};

      // Get current price from our market data service
      let currentPrice: number | null = null;
      try {
        const quote = await marketDataService.getQuote(symbol);
        currentPrice = quote.price;
      } catch (e) {
        console.warn(`Could not get current price for ${symbol}`);
      }

      const fundamentals: FundamentalMetrics = {
        symbol: cacheKey,
        marketCap: metrics.marketCapitalization || null,
        freeCashFlowTTM: metrics.freeCashFlowTTM || metrics.freeCashFlowPerShareTTM || null,
        epsGrowth5Y: metrics.epsGrowth5Y || null,
        revenueGrowth5Y: metrics.revenueGrowth5Y || null,
        peRatio: metrics.peBasicExclExtraTTM || metrics.peTTM || null,
        debtToEquity: metrics.totalDebtToEquity || null,
        currentRatio: metrics.currentRatioQuarterly || null,
        roe: metrics.roeTTM || null,
        grossMargin: metrics.grossMarginTTM || null,
        netMargin: metrics.netProfitMarginTTM || null,
        beta: metrics.beta || null,
        week52High: metrics['52WeekHigh'] || null,
        week52Low: metrics['52WeekLow'] || null,
        currentPrice,
        priceVs52WeekHigh: null,
        fetchedAt: new Date(),
      };

      // Calculate price vs 52-week high
      if (currentPrice && fundamentals.week52High) {
        fundamentals.priceVs52WeekHigh = ((fundamentals.week52High - currentPrice) / fundamentals.week52High) * 100;
      }

      // Cache the result in memory and on disk
      this.cache.set(cacheKey, {
        data: fundamentals,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      this.persistCacheToDisk();

      console.log(`✅ Fetched fundamentals for ${symbol}: MCap=${fundamentals.marketCap}M, FCF=${fundamentals.freeCashFlowTTM}M`);
      return fundamentals;
    } catch (error) {
      console.error(`Error fetching fundamentals for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Calculate Underlying Quality Score (UQS) for LEAPS
   * Based on 4 components: Trend Strength, Cash Flow Health, Stability, Earnings
   */
  async calculateUnderlyingQualityScore(symbol: string): Promise<UnderlyingQualityScore> {
    // Special handling for Index ETFs - they don't have traditional fundamentals
    if (isIndexETF(symbol)) {
      return this.getETFQualityScore(symbol);
    }

    const fundamentals = await this.getBasicFinancials(symbol);
    
    const components = {
      trendStrength: 0,
      cashFlowHealth: 0,
      stability: 0,
      earnings: 0,
    };

    const insights = {
      trend: 'No data',
      cashFlow: 'No data',
      stability: 'No data',
      earnings: 'No data',
      overall: 'Insufficient data for quality assessment',
    };

    if (!fundamentals) {
      return {
        score: 50,
        rating: 'FAIR',
        components,
        insights,
        rawData: {
          marketCap: null,
          freeCashFlow: null,
          netMargin: null,
          beta: null,
          epsGrowth5Y: null,
          roe: null,
          peRatio: null,
          priceVs52WeekHigh: null,
          dataSource: 'Finnhub',
          fetchedAt: new Date().toISOString(),
        },
      };
    }

    // 1. TREND STRENGTH (0-25 points)
    // Based on position relative to 52-week range
    if (fundamentals.priceVs52WeekHigh !== null && fundamentals.week52High && fundamentals.week52Low) {
      const range = fundamentals.week52High - fundamentals.week52Low;
      const currentPos = fundamentals.currentPrice 
        ? (fundamentals.currentPrice - fundamentals.week52Low) / range 
        : 0.5;
      
      if (currentPos >= 0.8) {
        components.trendStrength = 25;
        insights.trend = 'Strong uptrend, near 52-week high';
      } else if (currentPos >= 0.6) {
        components.trendStrength = 20;
        insights.trend = 'Healthy uptrend, upper half of range';
      } else if (currentPos >= 0.4) {
        components.trendStrength = 15;
        insights.trend = 'Neutral trend, mid-range';
      } else if (currentPos >= 0.2) {
        components.trendStrength = 8;
        insights.trend = 'Weak trend, lower half of range';
      } else {
        components.trendStrength = 3;
        insights.trend = 'Downtrend, near 52-week low';
      }
    }

    // 2. CASH FLOW HEALTH (0-25 points)
    // Based on free cash flow and margins
    if (fundamentals.freeCashFlowTTM !== null) {
      if (fundamentals.freeCashFlowTTM > 0) {
        // Positive FCF
        if (fundamentals.netMargin && fundamentals.netMargin > 15) {
          components.cashFlowHealth = 25;
          insights.cashFlow = `Strong FCF with ${fundamentals.netMargin.toFixed(1)}% net margin`;
        } else if (fundamentals.netMargin && fundamentals.netMargin > 8) {
          components.cashFlowHealth = 20;
          insights.cashFlow = `Positive FCF with healthy ${fundamentals.netMargin.toFixed(1)}% margin`;
        } else {
          components.cashFlowHealth = 15;
          insights.cashFlow = 'Positive FCF, moderate margins';
        }
      } else {
        components.cashFlowHealth = 5;
        insights.cashFlow = 'Negative free cash flow - caution';
      }
    } else if (fundamentals.netMargin !== null) {
      // Fallback to net margin if FCF not available
      if (fundamentals.netMargin > 15) {
        components.cashFlowHealth = 18;
        insights.cashFlow = `High profit margin: ${fundamentals.netMargin.toFixed(1)}%`;
      } else if (fundamentals.netMargin > 5) {
        components.cashFlowHealth = 12;
        insights.cashFlow = `Moderate margin: ${fundamentals.netMargin.toFixed(1)}%`;
      } else {
        components.cashFlowHealth = 5;
        insights.cashFlow = 'Low or negative margins';
      }
    }

    // 3. STABILITY (0-25 points)
    // Based on market cap (large-cap = stable) and beta
    if (fundamentals.marketCap !== null) {
      // Market cap thresholds (in millions)
      if (fundamentals.marketCap >= 200000) {
        // Mega-cap ($200B+)
        components.stability = 20;
        insights.stability = 'Mega-cap, highly stable';
      } else if (fundamentals.marketCap >= 10000) {
        // Large-cap ($10B+)
        components.stability = 18;
        insights.stability = 'Large-cap, stable';
      } else if (fundamentals.marketCap >= 2000) {
        // Mid-cap ($2B+)
        components.stability = 12;
        insights.stability = 'Mid-cap, moderate stability';
      } else {
        // Small-cap
        components.stability = 6;
        insights.stability = 'Small-cap, higher volatility risk';
      }

      // Adjust for beta
      if (fundamentals.beta !== null) {
        if (fundamentals.beta <= 0.8) {
          components.stability += 5;
          insights.stability += ', low beta';
        } else if (fundamentals.beta >= 1.5) {
          components.stability = Math.max(0, components.stability - 5);
          insights.stability += ', high beta caution';
        }
      }
      
      // Cap at 25
      components.stability = Math.min(25, components.stability);
    }

    // 4. EARNINGS (0-25 points)
    // Based on EPS growth and P/E reasonableness
    let earningsScore = 0;
    const earningsNotes: string[] = [];

    if (fundamentals.epsGrowth5Y !== null) {
      if (fundamentals.epsGrowth5Y >= 15) {
        earningsScore += 12;
        earningsNotes.push(`Strong 5Y EPS growth: ${fundamentals.epsGrowth5Y.toFixed(1)}%`);
      } else if (fundamentals.epsGrowth5Y >= 5) {
        earningsScore += 8;
        earningsNotes.push(`Moderate 5Y EPS growth: ${fundamentals.epsGrowth5Y.toFixed(1)}%`);
      } else if (fundamentals.epsGrowth5Y >= 0) {
        earningsScore += 4;
        earningsNotes.push('Flat EPS growth');
      } else {
        earningsNotes.push('Declining EPS');
      }
    }

    if (fundamentals.roe !== null) {
      if (fundamentals.roe >= 20) {
        earningsScore += 8;
        earningsNotes.push(`High ROE: ${fundamentals.roe.toFixed(1)}%`);
      } else if (fundamentals.roe >= 10) {
        earningsScore += 5;
        earningsNotes.push(`Solid ROE: ${fundamentals.roe.toFixed(1)}%`);
      } else if (fundamentals.roe >= 0) {
        earningsScore += 2;
      }
    }

    // Reasonable P/E bonus
    if (fundamentals.peRatio !== null && fundamentals.peRatio > 0) {
      if (fundamentals.peRatio <= 25) {
        earningsScore += 5;
        earningsNotes.push(`Reasonable P/E: ${fundamentals.peRatio.toFixed(1)}`);
      } else if (fundamentals.peRatio <= 40) {
        earningsScore += 2;
      }
    }

    components.earnings = Math.min(25, earningsScore);
    insights.earnings = earningsNotes.length > 0 ? earningsNotes.join(', ') : 'No earnings data';

    // Calculate total score
    const totalScore = components.trendStrength + components.cashFlowHealth + components.stability + components.earnings;
    
    // Determine rating
    let rating: 'STRONG' | 'FAIR' | 'WEAK';
    if (totalScore >= 65) {
      rating = 'STRONG';
      insights.overall = 'High-quality underlying with strong fundamentals';
    } else if (totalScore >= 40) {
      rating = 'FAIR';
      insights.overall = 'Acceptable underlying with mixed fundamentals';
    } else {
      rating = 'WEAK';
      insights.overall = 'Underlying quality concerns - exercise caution';
    }

    return {
      score: totalScore,
      rating,
      components,
      insights,
      rawData: {
        marketCap: fundamentals.marketCap,
        freeCashFlow: fundamentals.freeCashFlowTTM,
        netMargin: fundamentals.netMargin,
        beta: fundamentals.beta,
        epsGrowth5Y: fundamentals.epsGrowth5Y,
        roe: fundamentals.roe,
        peRatio: fundamentals.peRatio,
        priceVs52WeekHigh: fundamentals.priceVs52WeekHigh,
        dataSource: 'Finnhub',
        fetchedAt: fundamentals.fetchedAt.toISOString(),
      },
    };
  }

  /**
   * Special scoring for Index ETFs
   * Index ETFs don't have traditional fundamentals - they're inherently diversified
   * and represent market/sector baskets, not individual companies
   * 
   * Scoring logic:
   * - Trend: Data-driven from 52-week range (0-25 pts)
   * - Cash Flow: Fixed 20 pts (diversified holdings pooled)
   * - Stability: Fixed 25 pts (inherent diversification benefit)
   * - Earnings: Fixed 15 pts (represents basket of companies)
   * 
   * Rating: Based on actual score (STRONG ≥65, FAIR ≥40, WEAK <40)
   * This ensures ETFs in severe downtrends still get appropriate caution ratings
   */
  private async getETFQualityScore(symbol: string): Promise<UnderlyingQualityScore> {
    console.log(`📊 ETF detected: ${symbol} - applying ETF-specific scoring`);
    
    // Try to get basic metrics from Finnhub for 52-week data
    const fundamentals = await this.getBasicFinancials(symbol);
    
    let priceVs52WeekHigh: number | null = fundamentals?.priceVs52WeekHigh ?? null;
    let trendStrength = 15; // Default to mid-range if no data
    let trendInsight = 'No 52-week data available';
    let beta = fundamentals?.beta ?? null;

    // Calculate trend if we have 52-week data
    if (fundamentals?.week52High && fundamentals?.week52Low && fundamentals?.currentPrice) {
      const range = fundamentals.week52High - fundamentals.week52Low;
      if (range > 0) {
        const currentPos = (fundamentals.currentPrice - fundamentals.week52Low) / range;
        
        if (currentPos >= 0.8) {
          trendStrength = 25;
          trendInsight = `Strong uptrend, near 52-week high (-${priceVs52WeekHigh?.toFixed(1) ?? '?'}%)`;
        } else if (currentPos >= 0.6) {
          trendStrength = 20;
          trendInsight = `Healthy trend, upper half of range (-${priceVs52WeekHigh?.toFixed(1) ?? '?'}%)`;
        } else if (currentPos >= 0.4) {
          trendStrength = 15;
          trendInsight = `Neutral trend, mid-range (-${priceVs52WeekHigh?.toFixed(1) ?? '?'}%)`;
        } else if (currentPos >= 0.2) {
          trendStrength = 8;
          trendInsight = `Weak trend, lower range (-${priceVs52WeekHigh?.toFixed(1) ?? '?'}%)`;
        } else {
          trendStrength = 3;
          trendInsight = `Severe downtrend, near 52-week low (-${priceVs52WeekHigh?.toFixed(1) ?? '?'}%)`;
        }
      }
    }

    // ETFs get inherent scores for metrics that don't apply to them
    // But these are transparent fixed values, not inflated "magic numbers"
    const components = {
      trendStrength,
      cashFlowHealth: 20,  // Fixed: ETFs have pooled cash flows from holdings
      stability: 25,       // Fixed: Max stability due to diversification
      earnings: 15,        // Fixed: Represents aggregate earnings of holdings
    };

    const totalScore = components.trendStrength + components.cashFlowHealth + components.stability + components.earnings;

    // Rating is still data-driven - severe downtrends can result in FAIR rating
    let rating: 'STRONG' | 'FAIR' | 'WEAK';
    let overallInsight: string;
    
    if (totalScore >= 65) {
      rating = 'STRONG';
      overallInsight = `Index ETF with strong trend. Diversification provides inherent stability.`;
    } else if (totalScore >= 40) {
      rating = 'FAIR';
      overallInsight = `Index ETF in ${trendStrength <= 8 ? 'downtrend' : 'neutral trend'}. Monitor price action.`;
    } else {
      rating = 'FAIR'; // ETFs rarely get WEAK due to inherent diversification benefit
      overallInsight = `Index ETF showing weakness. Consider market conditions.`;
    }

    return {
      score: totalScore,
      rating,
      components,
      insights: {
        trend: trendInsight,
        cashFlow: 'ETF - diversified holdings (fixed 20 pts)',
        stability: 'Index ETF - inherent diversification (fixed 25 pts)',
        earnings: 'Basket of companies (fixed 15 pts)',
        overall: overallInsight,
      },
      rawData: {
        marketCap: null,
        freeCashFlow: null,
        netMargin: null,
        beta,
        epsGrowth5Y: null,
        roe: null,
        peRatio: null,
        priceVs52WeekHigh,
        dataSource: 'Index ETF',
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  clearCache() {
    this.cache.clear();
    try { fs.unlinkSync(this.CACHE_FILE); } catch (_) {}
    console.log('📊 Fundamentals cache cleared');
  }
}

export const fundamentalsService = new FundamentalsService();
export type { FundamentalMetrics, UnderlyingQualityScore };
