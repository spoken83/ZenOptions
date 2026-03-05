import { marketDataService } from './marketData';

interface VixHistoricalContext {
  current: number;
  weekHigh: number;
  weekLow: number;
  monthHigh: number;
  monthLow: number;
  yearHigh: number;
  yearLow: number;
  percentile52Week: number;
  daysAbove20: number;
  daysAbove25: number;
  daysAbove30: number;
  totalDays: number;
  spikeHistory: VixSpike[];
  averageLevel: number;
  interpretation: string;
}

interface VixSpike {
  date: string;
  level: number;
  change: number;
  trigger: string;
}

class AdvancedVixAnalysisService {
  async getVixAnalysis(currentVix: number): Promise<VixHistoricalContext> {
    try {
      // Fetch VIX historical data (252 trading days)
      const historicalData = await marketDataService.getHistoricalData('^VIX', 252);
      
      if (historicalData.length < 20) {
        return this.getFallbackAnalysis(currentVix);
      }

      // Calculate metrics
      const vixLevels = historicalData.map(d => d.close);
      
      // Week metrics (5 days)
      const weekData = vixLevels.slice(-5);
      const weekHigh = Math.max(...weekData);
      const weekLow = Math.min(...weekData);

      // Month metrics (21 days)
      const monthData = vixLevels.slice(-21);
      const monthHigh = Math.max(...monthData);
      const monthLow = Math.min(...monthData);

      // Year metrics (252 days)
      const yearHigh = Math.max(...vixLevels);
      const yearLow = Math.min(...vixLevels);

      // Percentile calculation
      const sortedLevels = [...vixLevels].sort((a, b) => a - b);
      const percentile52Week = this.calculatePercentile(currentVix, sortedLevels);

      // Days above thresholds
      const daysAbove20 = vixLevels.filter(v => v > 20).length;
      const daysAbove25 = vixLevels.filter(v => v > 25).length;
      const daysAbove30 = vixLevels.filter(v => v > 30).length;
      const totalDays = vixLevels.length;

      // Average level
      const averageLevel = vixLevels.reduce((sum, v) => sum + v, 0) / vixLevels.length;

      // Detect spikes
      const spikeHistory = this.detectSpikes(historicalData);

      // Generate interpretation
      const interpretation = this.generateInterpretation(
        currentVix,
        percentile52Week,
        averageLevel,
        yearHigh,
        yearLow
      );

      return {
        current: currentVix,
        weekHigh,
        weekLow,
        monthHigh,
        monthLow,
        yearHigh,
        yearLow,
        percentile52Week,
        daysAbove20,
        daysAbove25,
        daysAbove30,
        totalDays,
        spikeHistory: spikeHistory.slice(0, 5), // Last 5 spikes
        averageLevel,
        interpretation,
      };
    } catch (error) {
      console.error('Error in advanced VIX analysis:', error);
      return this.getFallbackAnalysis(currentVix);
    }
  }

  private calculatePercentile(value: number, sortedValues: number[]): number {
    const index = sortedValues.findIndex(v => v >= value);
    if (index === -1) {
      return 100;
    }
    return Math.round((index / sortedValues.length) * 100);
  }

  private detectSpikes(historicalData: any[]): VixSpike[] {
    const spikes: VixSpike[] = [];

    for (let i = 1; i < historicalData.length; i++) {
      const prev = historicalData[i - 1].close;
      const curr = historicalData[i].close;
      const change = curr - prev;
      const changePercent = (change / prev) * 100;

      // Spike definition: VIX jumps 20%+ in a day OR crosses above 25
      if (changePercent >= 20 || (prev < 25 && curr >= 25)) {
        spikes.push({
          date: historicalData[i].date,
          level: curr,
          change: changePercent,
          trigger: changePercent >= 20 ? `${changePercent.toFixed(1)}% spike` : 'Crossed 25',
        });
      }
    }

    return spikes.reverse(); // Most recent first
  }

  private generateInterpretation(
    current: number,
    percentile: number,
    average: number,
    yearHigh: number,
    yearLow: number
  ): string {
    if (current < 12) {
      return `VIX at ${current.toFixed(1)} is extremely low (${percentile}th percentile). Market complacency elevated - best environment for LEAPS. Watch for mean reversion.`;
    } else if (current < 15) {
      return `VIX at ${current.toFixed(1)} is low (${percentile}th percentile). Favorable for all strategies. Premium collection viable with normal position sizing.`;
    } else if (current < 20) {
      return `VIX at ${current.toFixed(1)} is normal (${percentile}th percentile). Balanced environment - all strategies acceptable. Monitor for regime changes.`;
    } else if (current < 25) {
      return `VIX at ${current.toFixed(1)} is elevated (${percentile}th percentile). Uncertainty rising. Close Iron Condors, reduce exposure. Watch for spikes above 25.`;
    } else if (current < 30) {
      return `VIX at ${current.toFixed(1)} is high (${percentile}th percentile). Significant market stress. Defensive positioning only. Reduce to 30% of normal exposure.`;
    } else {
      return `VIX at ${current.toFixed(1)} is in crisis mode (${percentile}th percentile). Extreme uncertainty. Preserve capital - no new positions. Close all ICs immediately.`;
    }
  }

  private getFallbackAnalysis(currentVix: number): VixHistoricalContext {
    return {
      current: currentVix,
      weekHigh: currentVix + 2,
      weekLow: currentVix - 2,
      monthHigh: currentVix + 5,
      monthLow: currentVix - 5,
      yearHigh: 35,
      yearLow: 12,
      percentile52Week: 50,
      daysAbove20: 60,
      daysAbove25: 30,
      daysAbove30: 10,
      totalDays: 252,
      spikeHistory: [],
      averageLevel: 16,
      interpretation: 'Historical data unavailable - using current VIX level only.',
    };
  }
}

export const advancedVixAnalysisService = new AdvancedVixAnalysisService();
