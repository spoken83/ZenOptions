import { marketDataService } from "./marketData";
import { indicatorService } from "./indicators";
import { storage } from "../storage";

interface SectorData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  mtdPerformance: number;
  wtdPerformance: number;
  weekPerformance: number;
  ivRank: number;
  trend: 'UP' | 'DOWN' | 'RANGE';
  strategies: string[];
  suitability: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR';
  watchlistTickers: string[];
}

const SECTOR_ETFS = [
  { symbol: 'XLK', name: 'Technology' },
  { symbol: 'XLF', name: 'Financials' },
  { symbol: 'XLV', name: 'Healthcare' },
  { symbol: 'XLP', name: 'Consumer Staples' },
  { symbol: 'XLY', name: 'Consumer Discretionary' },
  { symbol: 'XLE', name: 'Energy' },
];

const SECTOR_TICKER_MAP: Record<string, string[]> = {
  'XLV': ['UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'PFE', 'BMY'],
  'XLF': ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'AXP', 'USB'],
  'XLP': ['PG', 'COST', 'WMT', 'KO', 'PEP', 'PM', 'MO', 'CL', 'MDLZ', 'KMB'],
  'XLE': ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'HAL'],
  'XLY': ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'TJX', 'BKNG'],
  'XLK': ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'CSCO', 'ACN', 'ADBE', 'AMD'],
};

export class SectorAnalysisService {
  async getSectorRotation(vix: number): Promise<SectorData[]> {
    const sectorData = await Promise.all(
      SECTOR_ETFS.map(sector => this.analyzeSector(sector.symbol, sector.name, vix))
    );
    return sectorData;
  }

  private async analyzeSector(symbol: string, name: string, vix: number): Promise<SectorData> {
    try {
      // Get current quote
      const quote = await marketDataService.getQuote(symbol);
      
      // Get historical data for performance calculations
      const historicalData = await marketDataService.getHistoricalData(symbol, 30);
      
      if (historicalData.length < 5) {
        throw new Error(`Insufficient historical data for ${symbol}`);
      }

      // Calculate MTD performance (approximation using last 20 trading days)
      const mtdStart = historicalData[Math.max(0, historicalData.length - 20)].close;
      const mtdPerformance = ((quote.price - mtdStart) / mtdStart) * 100;

      // Calculate WTD performance (last 5 trading days)
      const wtdStart = historicalData[Math.max(0, historicalData.length - 5)].close;
      const wtdPerformance = ((quote.price - wtdStart) / wtdStart) * 100;

      // Calculate 1-week performance
      const weekStart = historicalData[Math.max(0, historicalData.length - 5)].close;
      const weekPerformance = ((quote.price - weekStart) / weekStart) * 100;

      // Calculate percentage change from previous day
      const previousClose = historicalData.length >= 2 
        ? historicalData[historicalData.length - 2].close 
        : quote.price;
      const change = quote.price - previousClose;
      const changePercent = ((change / previousClose) * 100);

      // Calculate IV Rank (simplified - using ATR as proxy for volatility)
      const ivRank = await this.calculateIVRank(symbol);

      // Determine trend
      const trend = this.determineTrend(quote.price, historicalData);

      // Generate strategy overlay
      const { strategies, suitability } = this.generateStrategyOverlay(
        mtdPerformance,
        trend,
        ivRank,
        vix
      );

      // Get watchlist tickers in this sector
      const watchlistTickers = await this.getWatchlistTickersInSector(symbol);

      return {
        symbol,
        name,
        price: quote.price,
        change,
        changePercent,
        mtdPerformance,
        wtdPerformance,
        weekPerformance,
        ivRank,
        trend,
        strategies,
        suitability,
        watchlistTickers,
      };
    } catch (error) {
      console.error(`Error analyzing sector ${symbol}:`, error);
      // Return default data on error
      return {
        symbol,
        name,
        price: 0,
        change: 0,
        changePercent: 0,
        mtdPerformance: 0,
        wtdPerformance: 0,
        weekPerformance: 0,
        ivRank: 0,
        trend: 'RANGE',
        strategies: ['Data unavailable'],
        suitability: 'POOR',
        watchlistTickers: [],
      };
    }
  }

  private async calculateIVRank(symbol: string): Promise<number> {
    try {
      // Get 52-week historical data for volatility range
      const historicalData = await marketDataService.getHistoricalData(symbol, 252);
      
      if (historicalData.length < 20) {
        return 50; // Default middle value
      }

      // Calculate daily ATR values (True Range)
      const atrValues: number[] = [];
      for (let i = 1; i < historicalData.length; i++) {
        const high = historicalData[i].high;
        const low = historicalData[i].low;
        const prevClose = historicalData[i - 1].close;
        const tr = Math.max(
          high - low,
          Math.abs(high - prevClose),
          Math.abs(low - prevClose)
        );
        atrValues.push(tr);
      }

      if (atrValues.length === 0) {
        return 50;
      }

      // Calculate current ATR (14-day average)
      const currentATR = atrValues.slice(-14).reduce((sum, val) => sum + val, 0) / 14;
      
      // Find min/max ATR over the period
      const minATR = Math.min(...atrValues);
      const maxATR = Math.max(...atrValues);

      if (maxATR === minATR) {
        return 50;
      }

      // Calculate IV Rank
      const ivRank = ((currentATR - minATR) / (maxATR - minATR)) * 100;
      return Math.round(Math.max(0, Math.min(100, ivRank)));
    } catch (error) {
      console.error(`Error calculating IV Rank for ${symbol}:`, error);
      return 50;
    }
  }

  private determineTrend(currentPrice: number, historicalData: any[]): 'UP' | 'DOWN' | 'RANGE' {
    if (historicalData.length < 50) {
      return 'RANGE';
    }

    // Calculate MA50
    const last50 = historicalData.slice(-50);
    const ma50 = last50.reduce((sum, d) => sum + d.close, 0) / last50.length;

    // Calculate MA200 if available
    let ma200 = null;
    if (historicalData.length >= 200) {
      const last200 = historicalData.slice(-200);
      ma200 = last200.reduce((sum, d) => sum + d.close, 0) / last200.length;
    }

    // Determine trend
    const priceAboveMA50 = currentPrice > ma50;
    const ma50AboveMA200 = ma200 ? ma50 > ma200 : null;

    if (priceAboveMA50 && (ma50AboveMA200 === null || ma50AboveMA200)) {
      return 'UP';
    } else if (!priceAboveMA50 && (ma50AboveMA200 === null || !ma50AboveMA200)) {
      return 'DOWN';
    } else {
      return 'RANGE';
    }
  }

  private generateStrategyOverlay(
    performance: number,
    trend: 'UP' | 'DOWN' | 'RANGE',
    ivRank: number,
    vix: number
  ): { strategies: string[]; suitability: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' } {
    const strategies: string[] = [];
    let suitability: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' = 'POOR';

    if (performance > 3 && trend === 'UP' && ivRank < 35) {
      strategies.push('LEAPS Calls', 'Bullish PUT Spreads');
      suitability = 'EXCELLENT';
    } else if (performance > 3 && trend === 'UP') {
      strategies.push('Bullish PUT Spreads');
      suitability = 'GOOD';
    } else if (Math.abs(performance) < 2 && trend === 'RANGE' && vix < 20) {
      strategies.push('Iron Condor');
      suitability = 'GOOD';
    } else if (performance < -2 && trend === 'DOWN') {
      strategies.push('Bearish CALL Spreads');
      suitability = 'GOOD';
    } else if (Math.abs(performance) < 2) {
      strategies.push('Monitor - No clear setup');
      suitability = 'MODERATE';
    } else {
      strategies.push('Avoid - Unclear signals');
      suitability = 'POOR';
    }

    return { strategies, suitability };
  }

  private async getWatchlistTickersInSector(sectorSymbol: string): Promise<string[]> {
    try {
      const watchlist = await storage.getWatchlist();
      const sectorTickers = SECTOR_TICKER_MAP[sectorSymbol] || [];
      
      // Filter watchlist to only include tickers in this sector
      const matchingTickers = watchlist
        .map(w => w.symbol)
        .filter(symbol => sectorTickers.includes(symbol))
        .slice(0, 3); // Limit to 3 tickers

      return matchingTickers;
    } catch (error) {
      console.error(`Error getting watchlist tickers for sector ${sectorSymbol}:`, error);
      return [];
    }
  }
}

export const sectorAnalysisService = new SectorAnalysisService();
