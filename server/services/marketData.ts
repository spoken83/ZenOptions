import axios, { AxiosInstance } from 'axios';
import { trackApiCall } from './api-usage-tracker';

interface QuoteData {
  price: number;
  volume: number;
}

interface HistoricalData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OptionChain {
  strike: number;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  delta?: number;
  iv?: number; // Implied Volatility from Polygon greeks
  expiry: Date;
}

// Cache daily historical bars — only update once per trading day (4-hour TTL)
const historicalCache = new Map<string, { data: HistoricalData[]; expiresAt: number }>();
const HISTORICAL_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export class MarketDataService {
  private apiKey: string;
  private polygonClient: AxiosInstance;

  constructor() {
    this.apiKey = process.env.POLYGON_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('POLYGON_API_KEY is required');
    }
    
    this.polygonClient = axios.create({
      baseURL: 'https://api.polygon.io',
      timeout: 10000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
    
    console.log('Market Data Service: Using Polygon for stocks and options');
  }

  private async trackedPolygonGet<T>(endpoint: string, url: string, params?: any): Promise<T> {
    return trackApiCall('polygon', endpoint, async () => {
      const response = await this.polygonClient.get(url, params ? { params } : undefined);
      return response as T;
    });
  }

  async getQuote(symbol: string): Promise<QuoteData> {
    // VIX uses FRED API (free, daily closing values)
    if (symbol === 'VIX') {
      try {
        const fredApiKey = process.env.FRED_API_KEY;
        if (!fredApiKey) {
          console.warn('FRED_API_KEY not set - VIX data unavailable');
          throw new Error('FRED_API_KEY not configured');
        }
        
        // Get latest VIX closing value from FRED
        const response = await trackApiCall('fred', 'getVIX', async () => {
          return axios.get('https://api.stlouisfed.org/fred/series/observations', {
            params: {
              series_id: 'VIXCLS',
              api_key: fredApiKey,
              file_type: 'json',
              sort_order: 'desc',
              limit: 1
            }
          });
        });
        
        if (response.data.observations && response.data.observations.length > 0) {
          const vixValue = parseFloat(response.data.observations[0].value);
          return {
            price: vixValue,
            volume: 0 // VIX doesn't have volume
          };
        }
        
        throw new Error('No VIX data from FRED');
      } catch (error: any) {
        console.error('Error fetching VIX from FRED:', error.message);
        throw new Error('Unable to fetch VIX data from FRED');
      }
    }
    
    const response = await this.trackedPolygonGet<any>('getQuote', `/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`);
    
    const ticker = response.data.ticker;
    if (!ticker || !ticker.day) {
      throw new Error('Invalid Polygon snapshot response');
    }
    
    return {
      price: ticker.day.c || ticker.prevDay?.c || 0,
      volume: ticker.day.v || 0
    };
  }

  async getHistoricalData(symbol: string, days: number = 100): Promise<HistoricalData[]> {
    const cacheKey = `${symbol}-${days}`;
    const cached = historicalCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const to = new Date();
    
    // Adjust 'to' date to last Friday if today is weekend
    const dayOfWeek = to.getDay();
    if (dayOfWeek === 0) { // Sunday
      to.setDate(to.getDate() - 2);
    } else if (dayOfWeek === 6) { // Saturday
      to.setDate(to.getDate() - 1);
    }
    
    // Calculate 'from' after adjusting 'to' date
    const from = new Date(to);
    from.setDate(from.getDate() - days);

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const response = await this.trackedPolygonGet<any>(
      'getHistoricalData',
      `/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}`,
      { adjusted: true, sort: 'asc', limit: 50000 }
    );

    if (!response.data.results || response.data.results.length === 0) {
      console.error(`❌ ${symbol} returned no results. Full response:`, JSON.stringify(response.data));
      throw new Error('No historical data from Polygon');
    }

    const result = response.data.results.map((bar: any) => ({
      date: new Date(bar.t),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v
    }));

    historicalCache.set(cacheKey, { data: result, expiresAt: Date.now() + HISTORICAL_CACHE_TTL_MS });
    return result;
  }

  async getOptionChain(symbol: string, expiryDate: Date): Promise<OptionChain[]> {
    const expiryStr = expiryDate.toISOString().split('T')[0];
    let allResults: any[] = [];
    let nextUrl: string | undefined = `/v3/snapshot/options/${symbol}?expiration_date=${expiryStr}&limit=250`;
    
    console.log(`🔍 Fetching option chain for ${symbol} expiring ${expiryStr}...`);
    
    while (nextUrl) {
      const resp: any = await this.trackedPolygonGet<any>('getOptionChain', nextUrl);
      
      if (resp.data.results && resp.data.results.length > 0) {
        allResults = allResults.concat(resp.data.results);
      }
      
      nextUrl = resp.data.next_url ? resp.data.next_url.replace('https://api.polygon.io', '') : undefined;
      
      if (allResults.length >= 1000) break;
    }
    
    console.log(`   Primary fetch: ${allResults.length} options found`);

    // Fallback 1: Query without expiration filter and then filter client-side
    if (allResults.length === 0) {
      console.log(`   Fallback 1: Fetching all options without expiry filter...`);
      let tmpResults: any[] = [];
      nextUrl = `/v3/snapshot/options/${symbol}?limit=250`;
      while (nextUrl) {
        const resp: any = await this.trackedPolygonGet<any>('getOptionChain', nextUrl);
        if (resp.data.results && resp.data.results.length > 0) {
          tmpResults = tmpResults.concat(resp.data.results);
        }
        nextUrl = resp.data.next_url ? resp.data.next_url.replace('https://api.polygon.io', '') : undefined;
        if (tmpResults.length >= 2000) break;
      }
      console.log(`   Fallback 1: ${tmpResults.length} total options, filtering for ${expiryStr}...`);
      if (tmpResults.length > 0) {
        allResults = tmpResults.filter((opt: any) => opt?.details?.expiration_date === expiryStr);
        console.log(`   Fallback 1: ${allResults.length} options match expiry ${expiryStr}`);
      }
    }

    // Fallback 2: If still empty, find nearest available expiry and retry
    if (allResults.length === 0) {
      try {
        const expiries = await this.getAvailableExpiries(symbol);
        const target = new Date(expiryStr + 'T00:00:00Z');
        let nearest: Date | null = null;
        let minDiff = Number.POSITIVE_INFINITY;
        for (const e of expiries) {
          const diff = Math.abs(e.getTime() - target.getTime());
          if (diff < minDiff) {
            minDiff = diff;
            nearest = e;
          }
        }
        if (nearest) {
          const nearStr = nearest.toISOString().split('T')[0];
          let tmp: any[] = [];
          let url: string | undefined = `/v3/snapshot/options/${symbol}?expiration_date=${nearStr}&limit=250`;
          while (url) {
            const resp: any = await this.trackedPolygonGet<any>('getOptionChain', url);
            if (resp.data.results && resp.data.results.length > 0) tmp = tmp.concat(resp.data.results);
            url = resp.data.next_url ? resp.data.next_url.replace('https://api.polygon.io', '') : undefined;
            if (tmp.length >= 1000) break;
          }
          if (tmp.length > 0) allResults = tmp;
        }
      } catch {
        // ignore
      }
    }

    if (allResults.length === 0) {
      throw new Error('No option chain data from Polygon');
    }

    // Debug: Log first option structure
    if (allResults.length > 0) {
      console.log('\n🔍 DEBUG: First option from Polygon API:');
      console.log(JSON.stringify(allResults[0], null, 2));
    }

    return allResults.map((opt: any) => {
      const details = opt.details;
      const greeks = opt.greeks || {};
      const last_quote = opt.last_quote || {};
      const day = opt.day || {};
      
      // Use last_quote if available (requires Options subscription)
      // Otherwise fall back to day.close data (delayed but available with Stocks plan)
      let bid = last_quote.bid || 0;
      let ask = last_quote.ask || 0;
      let last = opt.last_trade?.price || last_quote.midpoint || 0;
      
      // Fallback: Use day.close and estimate bid/ask spread from daily range
      if (!bid && !ask && day.close) {
        const close = day.close;
        const high = day.high || close;
        const low = day.low || close;
        const spread = (high - low) / 4; // Estimate 25% of daily range as half-spread
        
        bid = Math.max(0, close - spread);
        ask = close + spread;
        last = close;
      }
      
      // IV is at top level of snapshot, fallback to greeks.implied_volatility
      const iv = opt.implied_volatility ?? greeks.implied_volatility ?? null;
      
      return {
        strike: details.strike_price,
        type: details.contract_type.toLowerCase() as 'call' | 'put',
        bid,
        ask,
        last,
        volume: day.volume || 0,
        openInterest: opt.open_interest || 0,
        delta: greeks.delta,
        iv, // Implied Volatility from Polygon snapshot
        expiry: expiryDate
      };
    });
  }

  async getAvailableExpiries(symbol: string): Promise<Date[]> {
    const expirySet = new Set<string>();
    let nextUrl: string | undefined = `/v3/reference/options/contracts?underlying_ticker=${symbol}&expired=false&limit=1000&order=asc`;
    let pageCount = 0;
    let totalContracts = 0;
    
    // Fetch multiple pages to get all available expiries
    while (nextUrl && pageCount < 10) {
      const resp: any = await this.trackedPolygonGet<any>('getAvailableExpiries', nextUrl);
      pageCount++;
      
      if (resp.data.results && resp.data.results.length > 0) {
        totalContracts += resp.data.results.length;
        resp.data.results.forEach((contract: any) => {
          expirySet.add(contract.expiration_date);
        });
      }
      
      nextUrl = resp.data.next_url ? resp.data.next_url.replace('https://api.polygon.io', '') : undefined;
      
      // Continue fetching until we have enough expiries or no more pages
      if (expirySet.size >= 500 || !nextUrl) break;
    }

    if (expirySet.size === 0) {
      throw new Error('No expiries from Polygon');
    }

    const sortedExpiries = Array.from(expirySet)
      .map(dateStr => new Date(dateStr + 'T00:00:00Z'))
      .sort((a, b) => a.getTime() - b.getTime());
    
    // Log ALL expiries to help debug the gap
    console.log(`   📋 Total: ${totalContracts} contracts, ${sortedExpiries.length} unique expiries`);
    console.log(`   📅 All expiries: ${sortedExpiries.map(e => e.toISOString().split('T')[0]).join(', ')}`);
    
    return sortedExpiries;
  }

  async findNearestExpiry(symbol: string, targetDTE: number, tolerance: number = 7): Promise<Date | null> {
    const minDTE = targetDTE - tolerance;
    const maxDTE = targetDTE + tolerance;
    
    const expiries = await this.getAvailableExpiries(symbol);
    
    // Use start of day in UTC for consistent DTE calculation
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    
    console.log(`📅 Looking for ${symbol} expiry near ${targetDTE} DTE (±${tolerance} days)`);
    console.log(`   Target range: ${minDTE} to ${maxDTE} DTE`);
    
    // Log all available expiries
    const allExpiryDTEs = expiries.slice(0, 15).map(e => {
      const dte = Math.floor((e.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return `${e.toISOString().split('T')[0]} (${dte}d)`;
    });
    console.log(`   Available: ${allExpiryDTEs.join(', ')}${expiries.length > 15 ? '...' : ''}`);
    
    // Find the closest expiry within tolerance
    let bestMatch: Date | null = null;
    let bestDiff = Infinity;
    
    for (const expiry of expiries) {
      const dte = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const diff = Math.abs(dte - targetDTE);
      
      // Only consider expiries within tolerance
      if (diff <= tolerance && diff < bestDiff) {
        bestDiff = diff;
        bestMatch = expiry;
      }
    }
    
    if (bestMatch) {
      const dte = Math.floor((bestMatch.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`   ✅ Found match: ${bestMatch.toISOString().split('T')[0]} (${dte} DTE, diff: ${bestDiff}d)`);
      return bestMatch;
    }
    
    console.log(`   ❌ No expiry found within ${tolerance} days of ${targetDTE} DTE`);
    console.log(`   ⚠️  WARNING: This may indicate a Polygon API issue or unusual data gap`);
    console.log(`   ⚠️  Please verify option availability for ${symbol} in your trading system`);
    console.log(`   💡 Note: Options typically expire on Fridays - unusual gaps may be API-related`);
    return null;
  }

  /**
   * Find ALL expiries within the specified DTE range
   * Unlike findNearestExpiry which returns only the closest one,
   * this returns all valid expiries for multi-expiry analysis
   */
  async findAllExpiriesInRange(symbol: string, targetDTE: number, tolerance: number = 7): Promise<Date[]> {
    const minDTE = targetDTE - tolerance;
    const maxDTE = targetDTE + tolerance;
    
    const expiries = await this.getAvailableExpiries(symbol);
    
    // Use start of day in UTC for consistent DTE calculation
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    
    // Find ALL expiries within the DTE range
    const validExpiries: Date[] = [];
    
    for (const expiry of expiries) {
      const dte = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Include all expiries within the min-max range
      if (dte >= minDTE && dte <= maxDTE) {
        validExpiries.push(expiry);
      }
    }
    
    // Sort by DTE (closest to target first for better UX)
    validExpiries.sort((a, b) => {
      const dteA = Math.floor((a.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const dteB = Math.floor((b.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return Math.abs(dteA - targetDTE) - Math.abs(dteB - targetDTE);
    });
    
    console.log(`📅 Found ${validExpiries.length} expiries for ${symbol} in ${minDTE}-${maxDTE} DTE range`);
    if (validExpiries.length > 0) {
      const expiryInfo = validExpiries.map(e => {
        const dte = Math.floor((e.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return `${e.toISOString().split('T')[0]} (${dte}d)`;
      });
      console.log(`   📋 Expiries to analyze: ${expiryInfo.join(', ')}`);
    }
    
    return validExpiries;
  }

  // Search tickers by symbol or company name
  // Prioritizes: 1) Exact ticker match, 2) Tickers starting with query, 3) Name matches
  async searchTickers(query: string, limit: number = 10): Promise<Array<{ symbol: string; name: string; type: string }>> {
    if (!query || query.length < 1) {
      return [];
    }

    const upperQuery = query.toUpperCase().trim();

    try {
      // Run two searches in parallel:
      // 1. Exact ticker lookup (using ticker parameter for exact match)
      // 2. General search (for company name matches)
      const [exactResponse, searchResponse] = await Promise.all([
        this.trackedPolygonGet<any>(
          'searchTickers',
          '/v3/reference/tickers',
          { ticker: upperQuery, active: true, market: 'stocks', limit: 1 }
        ).catch(() => ({ data: { results: [] } })),
        this.trackedPolygonGet<any>(
          'searchTickers',
          '/v3/reference/tickers',
          { search: query, active: true, market: 'stocks', limit: limit + 10, sort: 'ticker' }
        ).catch(() => ({ data: { results: [] } }))
      ]);

      const allResults: Array<{ symbol: string; name: string; type: string; priority: number }> = [];
      const seenSymbols = new Set<string>();

      // Add exact ticker match with highest priority
      if (exactResponse.data.results && exactResponse.data.results.length > 0) {
        for (const ticker of exactResponse.data.results) {
          if (!seenSymbols.has(ticker.ticker)) {
            seenSymbols.add(ticker.ticker);
            allResults.push({
              symbol: ticker.ticker,
              name: ticker.name || ticker.ticker,
              type: ticker.type || 'CS',
              priority: 0 // Highest priority for exact match
            });
          }
        }
      }

      // Process search results with prioritization
      if (searchResponse.data.results && searchResponse.data.results.length > 0) {
        for (const ticker of searchResponse.data.results) {
          if (!seenSymbols.has(ticker.ticker)) {
            seenSymbols.add(ticker.ticker);
            
            let priority = 3; // Default: name match only
            const tickerUpper = ticker.ticker.toUpperCase();
            
            if (tickerUpper === upperQuery) {
              priority = 0; // Exact ticker match
            } else if (tickerUpper.startsWith(upperQuery)) {
              priority = 1; // Ticker starts with query
            } else if (tickerUpper.includes(upperQuery)) {
              priority = 2; // Ticker contains query
            }
            
            allResults.push({
              symbol: ticker.ticker,
              name: ticker.name || ticker.ticker,
              type: ticker.type || 'CS',
              priority
            });
          }
        }
      }

      // Sort by priority, then alphabetically by symbol
      allResults.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.symbol.localeCompare(b.symbol);
      });

      // Return top results without the priority field
      return allResults.slice(0, limit).map(({ symbol, name, type }) => ({
        symbol,
        name,
        type
      }));
    } catch (error: any) {
      console.error('Error searching tickers:', error.message);
      return [];
    }
  }

  /**
   * Get ATM (At-The-Money) IV and calculate 30-day Expected Move
   * Returns null if unable to fetch data
   */
  async getAtmIVAndExpectedMove(symbol: string, currentPrice: number): Promise<{ atmIv: number | null; expectedMove30d: number | null }> {
    try {
      // Find an expiry around 30 days out
      const expiry = await this.findNearestExpiry(symbol, 30, 10);
      if (!expiry) {
        console.log(`   ⚠️ No suitable expiry found for ${symbol} ATM IV`);
        return { atmIv: null, expectedMove30d: null };
      }

      // Get option chain for that expiry
      const chain = await this.getOptionChain(symbol, expiry);
      if (!chain || chain.length === 0) {
        console.log(`   ⚠️ No option chain for ${symbol} at expiry`);
        return { atmIv: null, expectedMove30d: null };
      }

      // Find ATM options (closest to current price)
      // We'll use PUT options since they tend to have better liquidity for this purpose
      const putOptions = chain.filter(opt => opt.type === 'put' && opt.iv && opt.iv > 0);
      const callOptions = chain.filter(opt => opt.type === 'call' && opt.iv && opt.iv > 0);
      
      if (putOptions.length === 0 && callOptions.length === 0) {
        console.log(`   ⚠️ No options with IV data for ${symbol}`);
        return { atmIv: null, expectedMove30d: null };
      }

      // Find ATM option (closest strike to current price)
      const allOptionsWithIV = [...putOptions, ...callOptions];
      const atmOption = allOptionsWithIV.reduce((closest, opt) => {
        const closestDiff = Math.abs(closest.strike - currentPrice);
        const optDiff = Math.abs(opt.strike - currentPrice);
        return optDiff < closestDiff ? opt : closest;
      });

      const atmIv = atmOption.iv || null;
      
      // Calculate 30-day expected move: Price × IV × √(30/365)
      let expectedMove30d: number | null = null;
      if (atmIv && currentPrice > 0) {
        expectedMove30d = currentPrice * atmIv * Math.sqrt(30 / 365);
      }

      console.log(`   📊 ${symbol} ATM IV: ${atmIv ? (atmIv * 100).toFixed(1) + '%' : 'N/A'}, 30d EM: ${expectedMove30d ? '±$' + expectedMove30d.toFixed(2) : 'N/A'}`);
      
      return { atmIv, expectedMove30d };
    } catch (error: any) {
      console.error(`   ❌ Error fetching ATM IV for ${symbol}:`, error.message);
      return { atmIv: null, expectedMove30d: null };
    }
  }

  // Intraday bars via Polygon (for trigger analysis)
  async getIntradayData(symbol: string, interval: '30min' | '1hour' = '30min', days: number = 5): Promise<HistoricalData[]> {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const response = await this.trackedPolygonGet<any>(
      'getIntradayData',
      `/v2/aggs/ticker/${symbol}/range/${interval}/1/${fromStr}/${toStr}`,
      { adjusted: true, sort: 'asc', limit: 50000 }
    );

    if (!response.data.results || response.data.results.length === 0) {
      throw new Error('No intraday data from Polygon');
    }

    return response.data.results.map((bar: any) => ({
      date: new Date(bar.t),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v
    }));
  }
}

export const marketDataService = new MarketDataService();
