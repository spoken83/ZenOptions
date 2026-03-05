import { marketDataService } from "./marketData";

interface RegimeData {
  regime: 'DEFENSIVE' | 'RISK_ON' | 'TRANSITIONING';
  confidence: number;
  score: number;
  signals: {
    xlpXlyRatio: { value: number; signal: 'DEFENSIVE' | 'RISK_ON' | 'NEUTRAL'; weight: number };
    techVsBroad: { value: number; signal: 'DEFENSIVE' | 'RISK_ON' | 'NEUTRAL'; weight: number };
    healthcare: { value: number; signal: 'DEFENSIVE' | 'RISK_ON' | 'NEUTRAL'; weight: number };
    financials: { value: number; signal: 'DEFENSIVE' | 'RISK_ON' | 'NEUTRAL'; weight: number };
  };
  leaders: Array<{ sector: string; performance: number }>;
  laggards: Array<{ sector: string; performance: number }>;
  duration: number;
  vixContext: string;
}

export class RegimeDetectionService {
  async detectRegime(vix: number): Promise<RegimeData> {
    try {
      // Fetch sector performance data
      const [xlp, xly, qqq, spy, xlv, xlf] = await Promise.all([
        this.getSectorPerformance('XLP'), // Consumer Staples
        this.getSectorPerformance('XLY'), // Consumer Discretionary
        this.getSectorPerformance('QQQ'), // Tech-heavy
        this.getSectorPerformance('SPY'), // Broad market
        this.getSectorPerformance('XLV'), // Healthcare
        this.getSectorPerformance('XLF'), // Financials
      ]);

      // Calculate signals
      const xlpXlyRatio = this.calculateXLPXLYSignal(xlp, xly);
      const techVsBroad = this.calculateTechVsBroadSignal(qqq, spy);
      const healthcare = this.calculateSectorSignal(xlv, 'XLV');
      const financials = this.calculateSectorSignal(xlf, 'XLF');

      // Calculate weighted score (defensive = negative, risk-on = positive)
      const totalScore =
        xlpXlyRatio.weight * (xlpXlyRatio.signal === 'DEFENSIVE' ? -1 : xlpXlyRatio.signal === 'RISK_ON' ? 1 : 0) +
        techVsBroad.weight * (techVsBroad.signal === 'DEFENSIVE' ? -1 : techVsBroad.signal === 'RISK_ON' ? 1 : 0) +
        healthcare.weight * (healthcare.signal === 'DEFENSIVE' ? -1 : healthcare.signal === 'RISK_ON' ? 1 : 0) +
        financials.weight * (financials.signal === 'DEFENSIVE' ? -1 : financials.signal === 'RISK_ON' ? 1 : 0);

      // Determine regime
      let regime: 'DEFENSIVE' | 'RISK_ON' | 'TRANSITIONING';
      let confidence: number;

      if (totalScore <= -2) {
        regime = 'DEFENSIVE';
        confidence = Math.min(100, Math.abs(totalScore) * 20);
      } else if (totalScore >= 2) {
        regime = 'RISK_ON';
        confidence = Math.min(100, Math.abs(totalScore) * 20);
      } else {
        regime = 'TRANSITIONING';
        confidence = 50 - Math.abs(totalScore) * 10;
      }

      // Get all sector performances for leaders/laggards
      const allSectors = [
        { sector: 'Consumer Staples (XLP)', performance: xlp },
        { sector: 'Consumer Discretionary (XLY)', performance: xly },
        { sector: 'Technology (QQQ)', performance: qqq },
        { sector: 'Healthcare (XLV)', performance: xlv },
        { sector: 'Financials (XLF)', performance: xlf },
      ];

      // Sort by performance
      allSectors.sort((a, b) => b.performance - a.performance);
      const leaders = allSectors.slice(0, 3);
      const laggards = allSectors.slice(-3).reverse();

      // VIX context
      const vixContext = this.getVixContext(regime, vix);

      // Duration (simplified - would need database tracking for real duration)
      const duration = 5; // Placeholder - in real implementation, track regime changes

      return {
        regime,
        confidence: Math.round(confidence),
        score: totalScore,
        signals: {
          xlpXlyRatio,
          techVsBroad,
          healthcare,
          financials,
        },
        leaders,
        laggards,
        duration,
        vixContext,
      };
    } catch (error) {
      console.error('Error detecting regime:', error);
      // Return default transitioning regime on error
      return {
        regime: 'TRANSITIONING',
        confidence: 0,
        score: 0,
        signals: {
          xlpXlyRatio: { value: 0, signal: 'NEUTRAL', weight: 2 },
          techVsBroad: { value: 0, signal: 'NEUTRAL', weight: 2 },
          healthcare: { value: 0, signal: 'NEUTRAL', weight: 1.5 },
          financials: { value: 0, signal: 'NEUTRAL', weight: 1.5 },
        },
        leaders: [],
        laggards: [],
        duration: 0,
        vixContext: 'Data unavailable',
      };
    }
  }

  private async getSectorPerformance(symbol: string): Promise<number> {
    try {
      // Get 1-week performance
      const historicalData = await marketDataService.getHistoricalData(symbol, 7);
      
      if (historicalData.length < 2) {
        return 0;
      }

      const currentPrice = historicalData[historicalData.length - 1].close;
      const weekAgoPrice = historicalData[0].close;
      
      return ((currentPrice - weekAgoPrice) / weekAgoPrice) * 100;
    } catch (error) {
      console.error(`Error getting performance for ${symbol}:`, error);
      return 0;
    }
  }

  private calculateXLPXLYSignal(xlp: number, xly: number): {
    value: number;
    signal: 'DEFENSIVE' | 'RISK_ON' | 'NEUTRAL';
    weight: number;
  } {
    const ratio = xlp - xly; // Positive = staples outperforming = defensive
    
    let signal: 'DEFENSIVE' | 'RISK_ON' | 'NEUTRAL';
    if (ratio > 2) {
      signal = 'DEFENSIVE';
    } else if (ratio < -2) {
      signal = 'RISK_ON';
    } else {
      signal = 'NEUTRAL';
    }

    return {
      value: ratio,
      signal,
      weight: 2,
    };
  }

  private calculateTechVsBroadSignal(qqq: number, spy: number): {
    value: number;
    signal: 'DEFENSIVE' | 'RISK_ON' | 'NEUTRAL';
    weight: number;
  } {
    const divergence = qqq - spy; // Positive = tech outperforming = risk-on
    
    let signal: 'DEFENSIVE' | 'RISK_ON' | 'NEUTRAL';
    if (divergence > 1.5) {
      signal = 'RISK_ON';
    } else if (divergence < -1.5) {
      signal = 'DEFENSIVE';
    } else {
      signal = 'NEUTRAL';
    }

    return {
      value: divergence,
      signal,
      weight: 2,
    };
  }

  private calculateSectorSignal(performance: number, sector: string): {
    value: number;
    signal: 'DEFENSIVE' | 'RISK_ON' | 'NEUTRAL';
    weight: number;
  } {
    let signal: 'DEFENSIVE' | 'RISK_ON' | 'NEUTRAL';
    
    if (sector === 'XLV') {
      // Healthcare: strong performance = defensive
      if (performance > 2) {
        signal = 'DEFENSIVE';
      } else if (performance < -1) {
        signal = 'RISK_ON';
      } else {
        signal = 'NEUTRAL';
      }
    } else {
      // Financials: strong performance = risk-on
      if (performance > 2) {
        signal = 'RISK_ON';
      } else if (performance < -1) {
        signal = 'DEFENSIVE';
      } else {
        signal = 'NEUTRAL';
      }
    }

    return {
      value: performance,
      signal,
      weight: 1.5,
    };
  }

  private getVixContext(regime: string, vix: number): string {
    if (regime === 'DEFENSIVE' && vix < 20) {
      return 'Defensive rotation without VIX spike - early warning signal';
    } else if (regime === 'DEFENSIVE' && vix >= 20) {
      return 'Defensive rotation confirmed by elevated VIX - risk-off environment';
    } else if (regime === 'RISK_ON' && vix < 15) {
      return 'Risk-on rotation with low VIX - ideal growth environment';
    } else if (regime === 'RISK_ON' && vix >= 15) {
      return 'Risk-on rotation despite elevated VIX - monitor for divergence';
    } else {
      return 'Mixed signals - transitioning between regimes';
    }
  }
}

export const regimeDetectionService = new RegimeDetectionService();
