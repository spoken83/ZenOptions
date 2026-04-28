import { MarketDataService } from './marketData';
import { toZonedTime, format } from 'date-fns-tz';

interface CachedPrice {
  price: number;
  previousClose: number | null;
  changePercent: number | null;
  lastUpdate: Date;
}

interface CachedIV {
  atmIv: number | null;
  expectedMove30d: number | null;
  lastUpdate: Date;
}

interface CachedOptionChain {
  chain: any[];
  lastUpdate: Date;
}

class PriceCacheService {
  private cache: Map<string, CachedPrice> = new Map();
  private ivCache: Map<string, CachedIV> = new Map();
  private optionChainCache: Map<string, CachedOptionChain> = new Map();
  private marketDataService: MarketDataService;
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 seconds
  private readonly IV_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for IV data (less frequent updates)
  private readonly OPTION_CHAIN_TTL_MS = 5 * 60 * 1000; // 5 minutes for option chains
  private readonly MARKET_TICKERS = ['SPY', 'QQQ', 'DIA', 'VIX', 'GLD', 'IWM', 'XLK', 'XLV', 'XLF'];

  constructor(marketDataService: MarketDataService) {
    this.marketDataService = marketDataService;
  }
  
  private async getYahooFinanceService() {
    const { yahooFinanceService } = await import('./yahooFinance');
    return yahooFinanceService;
  }

  start() {
    if (this.refreshInterval) {
      return;
    }

    console.log('🔄 Starting price cache service with 60s refresh interval');
    
    this.refreshMarketTickers();
    
    this.refreshInterval = setInterval(() => {
      this.refreshMarketTickers();
    }, this.CACHE_TTL_MS);
  }

  stop() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('🛑 Price cache service stopped');
    }
  }

  private async refreshMarketTickers() {
    try {
      const now = new Date();
      // Use US Eastern time for trading day boundaries (U.S. equities)
      const nowET = toZonedTime(now, 'America/New_York');
      const todayDateET = format(nowET, 'yyyy-MM-dd', { timeZone: 'America/New_York' });
      
      const promises = this.MARKET_TICKERS.map(async (symbol) => {
        try {
          // VIX uses Yahoo Finance for real-time intraday data
          if (symbol === 'VIX') {
            const yahooService = await this.getYahooFinanceService();
            const vixQuote = await yahooService.getQuote('^VIX');
            this.cache.set(symbol, {
              price: vixQuote.price,
              previousClose: vixQuote.price - (vixQuote.change || 0),
              changePercent: vixQuote.changePercent,
              lastUpdate: now,
            });
            return;
          }
          
          const quote = await this.marketDataService.getQuote(symbol);
          const existing = this.cache.get(symbol);
          
          // Check if we need to refresh previousClose:
          // 1. No existing cache (first run)
          // 2. Cache is from a different trading day (after market close/overnight)
          const existingET = existing ? toZonedTime(existing.lastUpdate, 'America/New_York') : null;
          const existingDateET = existingET ? format(existingET, 'yyyy-MM-dd', { timeZone: 'America/New_York' }) : null;
          const needsPreviousCloseRefresh = !existing || existingDateET !== todayDateET;
          
          let previousClose: number | null = existing?.previousClose ?? null;
          
          if (needsPreviousCloseRefresh) {
            try {
              // Get historical data to find previous day's close
              const historical = await this.marketDataService.getHistoricalData(symbol, 7);
              if (historical.length >= 2) {
                // Check if most recent bar is from today (ET trading day)
                const mostRecentBar = historical[historical.length - 1];
                const mostRecentDateET = toZonedTime(mostRecentBar.date, 'America/New_York');
                const mostRecentBarDate = format(mostRecentDateET, 'yyyy-MM-dd', { timeZone: 'America/New_York' });
                
                if (mostRecentBarDate === todayDateET) {
                  // Today's bar exists, use yesterday's close (second-to-last)
                  previousClose = historical[historical.length - 2].close;
                } else {
                  // Markets closed - show last trading day's change (compare Friday close to Thursday close)
                  previousClose = historical[historical.length - 2].close;
                }
              } else if (historical.length === 1) {
                // Only one bar available, use it as baseline
                previousClose = historical[0].close;
              }
              // If no historical data available, preserve existing previousClose (don't set to current price)
            } catch (error) {
              console.error(`Error fetching historical data for ${symbol}:`, error);
              // If historical fetch fails, preserve existing previousClose or use current price
              previousClose = existing?.previousClose ?? quote.price;
            }
          }
          
          const changePercent = previousClose 
            ? ((quote.price - previousClose) / previousClose) * 100
            : null;

          this.cache.set(symbol, {
            price: quote.price,
            previousClose,
            changePercent,
            lastUpdate: now,
          });
        } catch (error: any) {
          console.error(`Error refreshing ${symbol}:`, error.message);
        }
      });

      await Promise.all(promises);
      console.log(`✅ Refreshed ${this.MARKET_TICKERS.length} market ticker prices`);
    } catch (error: any) {
      console.error('Error refreshing market tickers:', error.message);
    }
  }

  async getPrice(symbol: string, ttlMs: number = this.CACHE_TTL_MS): Promise<CachedPrice | null> {
    const cached = this.cache.get(symbol);
    
    if (cached) {
      const age = Date.now() - cached.lastUpdate.getTime();
      if (age < ttlMs) {
        return cached;
      }
    }

    try {
      const now = new Date();
      
      // VIX uses Yahoo Finance for real-time intraday data
      if (symbol === 'VIX') {
        const yahooService = await this.getYahooFinanceService();
        const vixQuote = await yahooService.getQuote('^VIX');
        const newCache: CachedPrice = {
          price: vixQuote.price,
          previousClose: vixQuote.price - (vixQuote.change || 0),
          changePercent: vixQuote.changePercent,
          lastUpdate: now,
        };
        this.cache.set(symbol, newCache);
        return newCache;
      }
      
      const quote = await this.marketDataService.getQuote(symbol);
      const existing = this.cache.get(symbol);
      
      const nowET = toZonedTime(now, 'America/New_York');
      const todayDateET = format(nowET, 'yyyy-MM-dd', { timeZone: 'America/New_York' });
      const existingET = existing ? toZonedTime(existing.lastUpdate, 'America/New_York') : null;
      const existingDateET = existingET ? format(existingET, 'yyyy-MM-dd', { timeZone: 'America/New_York' }) : null;
      const needsPreviousCloseRefresh = !existing || existingDateET !== todayDateET;
      
      let previousClose: number | null = existing?.previousClose ?? null;
      
      if (needsPreviousCloseRefresh) {
        try {
          const historical = await this.marketDataService.getHistoricalData(symbol, 7);
          if (historical.length >= 2) {
            // Check if most recent bar is from today (ET trading day)
            const mostRecentBar = historical[historical.length - 1];
            const mostRecentDateET = toZonedTime(mostRecentBar.date, 'America/New_York');
            const mostRecentBarDate = format(mostRecentDateET, 'yyyy-MM-dd', { timeZone: 'America/New_York' });
            
            if (mostRecentBarDate === todayDateET) {
              // Today's bar exists, use yesterday's close (second-to-last)
              previousClose = historical[historical.length - 2].close;
            } else {
              // Markets closed - show last trading day's change (compare Friday close to Thursday close)
              previousClose = historical[historical.length - 2].close;
            }
          } else if (historical.length === 1) {
            // Only one bar available, use it as baseline
            previousClose = historical[0].close;
          }
          // If no historical data available, preserve existing previousClose (don't set to current price)
        } catch (error) {
          previousClose = existing?.previousClose ?? quote.price;
        }
      }
      
      const changePercent = previousClose 
        ? ((quote.price - previousClose) / previousClose) * 100
        : null;

      const newCache: CachedPrice = {
        price: quote.price,
        previousClose,
        changePercent,
        lastUpdate: now,
      };

      this.cache.set(symbol, newCache);
      return newCache;
    } catch (error: any) {
      console.error(`Error fetching price for ${symbol}:`, error.message);
      return cached || null;
    }
  }

  async getPrices(symbols: string[], ttlMs: number = this.CACHE_TTL_MS): Promise<Map<string, number | null>> {
    const results = new Map<string, number | null>();
    
    const promises = symbols.map(async (symbol) => {
      const cached = await this.getPrice(symbol, ttlMs);
      results.set(symbol, cached?.price ?? null);
    });

    await Promise.all(promises);
    return results;
  }

  getCachedMarketData(): Array<{ symbol: string; price: number; changePercent: number | null }> {
    return this.MARKET_TICKERS.map((symbol) => {
      const cached = this.cache.get(symbol);
      return {
        symbol,
        price: cached?.price ?? 0,
        changePercent: cached?.changePercent ?? null,
      };
    }).filter(item => item.price > 0);
  }

  /**
   * Get ATM IV and 30-day Expected Move for a symbol with caching
   * Uses a 5-minute TTL to reduce API calls
   */
  async getAtmIV(symbol: string): Promise<CachedIV | null> {
    const cached = this.ivCache.get(symbol);
    
    if (cached) {
      const age = Date.now() - cached.lastUpdate.getTime();
      if (age < this.IV_CACHE_TTL_MS) {
        return cached;
      }
    }

    try {
      // First get current price for the symbol
      const priceData = await this.getPrice(symbol);
      if (!priceData || priceData.price <= 0) {
        console.log(`   ⚠️ Cannot get ATM IV for ${symbol} - no price data`);
        return cached || null;
      }

      // Fetch ATM IV and expected move
      const ivData = await this.marketDataService.getAtmIVAndExpectedMove(symbol, priceData.price);
      
      const newCache: CachedIV = {
        atmIv: ivData.atmIv,
        expectedMove30d: ivData.expectedMove30d,
        lastUpdate: new Date(),
      };

      this.ivCache.set(symbol, newCache);
      return newCache;
    } catch (error: any) {
      console.error(`Error fetching ATM IV for ${symbol}:`, error.message);
      return cached || null;
    }
  }

  /**
   * Get ATM IV for multiple symbols in parallel
   * Prioritizes cached data, only fetches fresh data for stale entries
   */
  async getAtmIVBatch(symbols: string[]): Promise<Map<string, CachedIV | null>> {
    const results = new Map<string, CachedIV | null>();
    const symbolsToFetch: string[] = [];
    
    // First pass: return cached data for symbols that are still fresh
    for (const symbol of symbols) {
      const cached = this.ivCache.get(symbol);
      if (cached) {
        const age = Date.now() - cached.lastUpdate.getTime();
        if (age < this.IV_CACHE_TTL_MS) {
          results.set(symbol, cached);
          continue;
        }
      }
      symbolsToFetch.push(symbol);
    }
    
    console.log(`📊 IV Batch: ${symbols.length} symbols, ${results.size} from cache, ${symbolsToFetch.length} to fetch`);
    
    // Second pass: fetch fresh data for stale symbols with rate limiting
    const BATCH_SIZE = 2; // Smaller batch to avoid rate limits
    const BATCH_DELAY_MS = 500; // 500ms delay between batches
    
    for (let i = 0; i < symbolsToFetch.length; i += BATCH_SIZE) {
      const batch = symbolsToFetch.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (symbol) => {
        try {
          const data = await this.getAtmIV(symbol);
          results.set(symbol, data);
        } catch (error: any) {
          console.error(`   ⚠️ Failed to get IV for ${symbol}:`, error.message);
          // Set null but don't throw - allow other symbols to continue
          results.set(symbol, null);
        }
      });
      await Promise.all(promises);
      
      // Add delay between batches (except for the last batch)
      if (i + BATCH_SIZE < symbolsToFetch.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
    
    return results;
  }
  /**
   * Get option chain for a (symbol, expiry) pair with 5-minute caching.
   * Prevents repeated Polygon API calls on every P&L page load.
   */
  async getOptionChain(symbol: string, expiryDate: Date, ttlMs: number = this.OPTION_CHAIN_TTL_MS): Promise<any[]> {
    const key = `${symbol}_${expiryDate.toISOString().split('T')[0]}`;
    const cached = this.optionChainCache.get(key);

    if (cached) {
      const age = Date.now() - cached.lastUpdate.getTime();
      if (age < ttlMs) {
        return cached.chain;
      }
    }

    try {
      const chain = await this.marketDataService.getOptionChain(symbol, expiryDate);
      this.optionChainCache.set(key, { chain, lastUpdate: new Date() });
      return chain;
    } catch (error: any) {
      console.error(`Error fetching option chain for ${symbol}:`, error.message);
      return cached?.chain ?? [];
    }
  }
}

export const priceCacheService = new PriceCacheService(new MarketDataService());
