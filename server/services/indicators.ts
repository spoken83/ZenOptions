interface PriceData {
  close: number;
  high: number;
  low: number;
}

export class IndicatorService {
  calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) {
      throw new Error('Not enough data for RSI calculation');
    }

    const changes = prices.slice(1).map((price, i) => price - prices[i]);
    
    let avgGain = 0;
    let avgLoss = 0;

    // Initial averages
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) {
        avgGain += changes[i];
      } else {
        avgLoss += Math.abs(changes[i]);
      }
    }
    avgGain /= period;
    avgLoss /= period;

    // Smooth the averages
    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      if (change > 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
      }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateStochRSI(rsiValues: number[], kPeriod: number = 3, dPeriod: number = 3, rsiPeriod: number = 14): { k: number; d: number } {
    if (rsiValues.length < rsiPeriod + kPeriod + dPeriod - 2) {
      throw new Error('Not enough RSI data for StochRSI calculation');
    }

    // Calculate raw stochRSI values for the last kPeriod bars
    const rawStochRSI: number[] = [];
    
    // We need enough data to calculate kPeriod smoothed %K values, then dPeriod smoothed %D
    const startIndex = rsiValues.length - rsiPeriod - kPeriod - dPeriod + 2;
    
    for (let i = Math.max(0, startIndex); i < rsiValues.length; i++) {
      const window = rsiValues.slice(Math.max(0, i - rsiPeriod + 1), i + 1);
      if (window.length < rsiPeriod) continue;
      
      const maxRSI = Math.max(...window);
      const minRSI = Math.min(...window);
      const currentRSI = rsiValues[i];

      let stochRSI: number;
      if (maxRSI === minRSI) {
        stochRSI = 0.5; // Neutral when no movement
      } else {
        stochRSI = (currentRSI - minRSI) / (maxRSI - minRSI);
      }
      
      rawStochRSI.push(Math.max(0, Math.min(1, stochRSI)) * 100);
    }

    if (rawStochRSI.length < kPeriod) {
      throw new Error('Not enough stochRSI values for smoothing');
    }

    // Calculate %K as kPeriod-SMA of raw stochRSI
    const kValues: number[] = [];
    for (let i = kPeriod - 1; i < rawStochRSI.length; i++) {
      const window = rawStochRSI.slice(i - kPeriod + 1, i + 1);
      const k = window.reduce((sum, val) => sum + val, 0) / kPeriod;
      kValues.push(k);
    }

    if (kValues.length < dPeriod) {
      throw new Error('Not enough %K values for %D calculation');
    }

    // Calculate %D as dPeriod-SMA of %K
    const recentK = kValues.slice(-dPeriod);
    const d = recentK.reduce((sum, val) => sum + val, 0) / dPeriod;
    const k = kValues[kValues.length - 1];

    return { k, d };
  }

  calculateATR(data: PriceData[], period: number = 14): number {
    if (data.length < period + 1) {
      throw new Error('Not enough data for ATR calculation');
    }

    const trueRanges: number[] = [];

    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // Calculate initial ATR (simple average)
    let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;

    // Smooth the ATR using Wilder's smoothing method
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
    }

    return atr;
  }

  isOversold(rsi: number, threshold: number = 30): boolean {
    return rsi < threshold;
  }

  isOverbought(rsi: number, threshold: number = 70): boolean {
    return rsi > threshold;
  }

  isBullishStochCross(stochK: number, threshold: number = 20): boolean {
    return stochK > threshold && stochK < 30; // Simplified cross detection
  }

  isBearishStochCross(stochK: number, threshold: number = 80): boolean {
    return stochK < threshold && stochK > 70; // Simplified cross detection
  }

  /**
   * Simple Moving Average over the last `period` prices.
   * Returns null if not enough data.
   */
  calculateSMA(prices: number[], period: number): number | null {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((sum, p) => sum + p, 0) / period;
  }

  /**
   * Exponential Moving Average — full series, used internally for MACD.
   */
  private calculateEMAFull(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const ema: number[] = [];
    // Seed with SMA of first `period` values
    const seed = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
    ema.push(seed);
    for (let i = period; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[ema.length - 1] * (1 - k));
    }
    return ema;
  }

  /**
   * MACD line, signal line, and histogram.
   * Standard params: fast=12, slow=26, signal=9.
   * Returns null if not enough data.
   */
  calculateMACD(
    prices: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): { macd: number; signal: number; histogram: number } | null {
    if (prices.length < slowPeriod + signalPeriod) return null;

    const fastEMA = this.calculateEMAFull(prices, fastPeriod);
    const slowEMA = this.calculateEMAFull(prices, slowPeriod);

    // Align the two EMA series (slow is shorter by slowPeriod - fastPeriod bars)
    const offset = slowPeriod - fastPeriod;
    const macdLine: number[] = [];
    for (let i = 0; i < slowEMA.length; i++) {
      macdLine.push(fastEMA[i + offset] - slowEMA[i]);
    }

    if (macdLine.length < signalPeriod) return null;

    const signalEMAFull = this.calculateEMAFull(macdLine, signalPeriod);
    if (signalEMAFull.length === 0) return null;

    const macd = macdLine[macdLine.length - 1];
    const signal = signalEMAFull[signalEMAFull.length - 1];
    return { macd, signal, histogram: macd - signal };
  }

  /**
   * Return SMA trend status: 'above_both', 'above_50', 'below_both', 'inverted'
   */
  getSMATrend(price: number, sma50: number | null, sma200: number | null): string {
    if (sma50 === null && sma200 === null) return 'unknown';
    if (sma50 !== null && sma200 !== null) {
      if (price > sma50 && price > sma200) return 'above_both';
      if (price < sma50 && price < sma200) return 'below_both';
      if (price > sma50 && price < sma200) return 'above_50_below_200';
      return 'below_50_above_200';
    }
    if (sma50 !== null) return price > sma50 ? 'above_50' : 'below_50';
    return price > sma200! ? 'above_200' : 'below_200';
  }

  /**
   * Unified StochRSI calculation that can be used by both watchlist and scanner
   * This ensures consistency across the application
   */
  async calculateUnifiedStochRSI(symbol: string, historicalData?: any[]): Promise<{ k: number; d: number; status: string }> {
    try {
      // Get historical data if not provided
      let data = historicalData;
      if (!data) {
        const { marketDataService } = await import('./marketData');
        data = await marketDataService.getHistoricalData(symbol, 100);
      }

      if (data.length < 28) {
        throw new Error('Not enough historical data for StochRSI calculation');
      }

      const closePrices = data.map(d => d.close);
      
      // Calculate RSI values for StochRSI (need at least 14 RSI values)
      const rsiValues: number[] = [];
      for (let j = 14; j < closePrices.length; j++) {
        const window = closePrices.slice(0, j + 1);
        rsiValues.push(this.calculateRSI(window));
      }
      
      if (rsiValues.length < 14) {
        throw new Error('Not enough RSI values for StochRSI calculation');
      }

      const stochRSI = this.calculateStochRSI(rsiValues);
      
      // Determine status based on StochRSI K value
      let status: string;
      if (stochRSI.k > 80) {
        status = 'overbought';
      } else if (stochRSI.k < 20) {
        status = 'oversold';
      } else {
        status = 'neutral';
      }

      return {
        k: stochRSI.k,
        d: stochRSI.d,
        status
      };
    } catch (error) {
      console.error(`Error calculating unified StochRSI for ${symbol}:`, error);
      return {
        k: 0,
        d: 0,
        status: 'unknown'
      };
    }
  }
}

export const indicatorService = new IndicatorService();
