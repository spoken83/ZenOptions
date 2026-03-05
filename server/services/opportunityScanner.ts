import { storage } from '../storage';

interface TradeSetup {
  id: string;
  symbol: string;
  strategyType: 'IRON_CONDOR' | 'CREDIT_SPREAD' | 'LEAPS';
  direction?: 'BULLISH' | 'BEARISH';
  score: number;
  rating: number;
  vixSuitability: 'IDEAL' | 'GOOD' | 'MODERATE' | 'POOR';
  vixSuitabilityScore: number;
  whyItWorks: string[];
  whyVixSupports: string[];
  vixRiskManagement: {
    entry: string;
    monitor: string;
    exit: string;
  };
  tradeDetails: {
    symbol: string;
    strikes?: string;
    credit?: number;
    debit?: number;
    roi?: number;
    pop?: number;
    maxLoss?: number;
    maxProfit?: number;
    dte: number;
  };
  managementRules: string[];
  similarTickers: string[];
}

class OpportunityScannerService {
  async getTopSetups(vix: number, vvix: number, limit: number = 4): Promise<TradeSetup[]> {
    try {
      // Get latest scan results
      const scanResults = await storage.getLatestScanResults();
      
      if (!scanResults || scanResults.length === 0) {
        return [];
      }

      // Get watchlist for similar tickers
      const watchlist = await storage.getWatchlist();

      // Convert scan results to trade setups with VIX scoring
      const setups: TradeSetup[] = [];

      for (const result of scanResults) {
        // Only process qualified results with strikes
        if (result.status === 'QUALIFIED' && result.shortStrike && result.longStrike) {
          const setup = this.createTradeSetup(result, vix, vvix, watchlist);
          if (setup) {
            setups.push(setup);
          }
        }
      }

      // Sort by combined score (descending)
      setups.sort((a, b) => b.score - a.score);

      // Return top N
      return setups.slice(0, limit);
    } catch (error) {
      console.error('Error in opportunity scanner:', error);
      return [];
    }
  }

  private createTradeSetup(scanResult: any, vix: number, vvix: number, watchlist: any[]): TradeSetup | null {
    try {
      const symbol = scanResult.symbol;

      // Calculate VIX suitability
      const vixSuitability = this.calculateVixSuitability(vix, vvix);
      const vixSuitabilityScore = this.getVixSuitabilityScore(vixSuitability.level);

      // Technical quality score (0-100)
      const technicalScore = this.calculateTechnicalScore(scanResult);

      // Risk/reward score (0-100)
      const rrScore = this.calculateRRScore(scanResult);

      // Combined score
      const score = Math.round(
        technicalScore * 0.5 + 
        vixSuitabilityScore * 0.3 + 
        rrScore * 0.2
      );

      // Rating (1-3 stars)
      const rating = score >= 80 ? 3 : score >= 65 ? 2 : 1;

      // Determine strategy type and direction
      const { strategyType, direction } = this.determineStrategy(scanResult);

      // Parse analysis log for details
      const analysisData = this.parseAnalysisLog(scanResult.analysisLog || '{}');

      // Build setup
      const setup: TradeSetup = {
        id: `${symbol}-${Date.now()}`,
        symbol,
        strategyType,
        direction,
        score,
        rating,
        vixSuitability: vixSuitability.level,
        vixSuitabilityScore,
        whyItWorks: this.generateWhyItWorks(scanResult, vix),
        whyVixSupports: this.generateWhyVixSupports(vix, vvix, strategyType),
        vixRiskManagement: this.generateVixRiskManagement(vix, strategyType),
        tradeDetails: {
          symbol,
          strikes: `${scanResult.shortStrike}/${scanResult.longStrike}`,
          credit: scanResult.credit || 0,
          roi: scanResult.returnOnRisk ? scanResult.returnOnRisk * 100 : undefined,
          pop: scanResult.pop || undefined,
          maxLoss: scanResult.maxLoss || undefined,
          maxProfit: scanResult.credit || 0,
          dte: 45, // Default DTE from scanner
        },
        managementRules: this.generateManagementRules(strategyType),
        similarTickers: this.findSimilarTickers(symbol, watchlist),
      };

      return setup;
    } catch (error) {
      console.error(`Error creating setup for ${scanResult.symbol}:`, error);
      return null;
    }
  }

  private parseAnalysisLog(log: string): any {
    try {
      return JSON.parse(log);
    } catch {
      return {};
    }
  }

  private calculateVixSuitability(vix: number, vvix: number): { level: 'IDEAL' | 'GOOD' | 'MODERATE' | 'POOR'; description: string } {
    // VIX/VVIX divergence warning
    if (vix < 20 && vvix > 100) {
      return { level: 'MODERATE', description: 'VIX/VVIX divergence - reduce sizes' };
    }

    if (vix < 15) {
      return { level: 'IDEAL', description: 'Low volatility - all strategies excellent' };
    } else if (vix < 20) {
      return { level: 'GOOD', description: 'Normal volatility - all strategies viable' };
    } else if (vix < 25) {
      return { level: 'MODERATE', description: 'Elevated volatility - spreads only' };
    } else {
      return { level: 'POOR', description: 'High volatility - defensive only' };
    }
  }

  private getVixSuitabilityScore(level: string): number {
    switch (level) {
      case 'IDEAL': return 100;
      case 'GOOD': return 80;
      case 'MODERATE': return 50;
      case 'POOR': return 20;
      default: return 50;
    }
  }

  private calculateTechnicalScore(scanResult: any): number {
    let score = 0;

    const analysis = this.parseAnalysisLog(scanResult.analysisLog || '{}');

    // RSI signal
    if (analysis.rsi && analysis.rsi < 35) {
      score += 25;
    }

    // StochRSI signal
    if (analysis.stochRsi && analysis.stochRsi < 20) {
      score += 25;
    }

    // Price vs support/resistance
    if (analysis.priceVsSupport) {
      const distance = Math.abs(analysis.priceVsSupport);
      if (distance > 3 && distance < 7) {
        score += 25;
      }
    }

    // Spread quality
    if (scanResult.credit && scanResult.credit >= 1.5) {
      score += 25;
    }

    return Math.min(100, score);
  }

  private calculateRRScore(scanResult: any): number {
    if (!scanResult.returnOnRisk) {
      return 50;
    }

    const rr = scanResult.returnOnRisk;
    
    if (rr >= 2.5) return 100;
    if (rr >= 2.0) return 85;
    if (rr >= 1.8) return 70;
    if (rr >= 1.5) return 50;
    return 30;
  }

  private determineStrategy(scanResult: any): { strategyType: 'IRON_CONDOR' | 'CREDIT_SPREAD' | 'LEAPS'; direction?: 'BULLISH' | 'BEARISH' } {
    // For now, assume all scanner results are PUT credit spreads (bullish)
    // Scanner currently only produces PUT credit spreads
    return {
      strategyType: 'CREDIT_SPREAD',
      direction: 'BULLISH',
    };
  }

  private generateWhyItWorks(scanResult: any, vix: number): string[] {
    const reasons: string[] = [];
    const analysis = this.parseAnalysisLog(scanResult.analysisLog || '{}');

    if (analysis.rsi && analysis.rsi < 35) {
      reasons.push(`RSI ${analysis.rsi.toFixed(1)} - oversold bounce candidate`);
    }

    if (analysis.stochRsi && analysis.stochRsi < 20) {
      reasons.push(`StochRSI ${analysis.stochRsi.toFixed(1)} - bullish reversal signal`);
    }

    if (analysis.priceVsSupport && analysis.priceVsSupport > 3) {
      reasons.push(`${analysis.priceVsSupport.toFixed(1)}% above support - strong floor`);
    }

    if (scanResult.returnOnRisk && scanResult.returnOnRisk >= 2.0) {
      reasons.push(`${(scanResult.returnOnRisk * 100).toFixed(0)}% ROI - excellent risk/reward`);
    }

    if (vix < 20) {
      reasons.push('Premium environment favorable for this setup');
    }

    return reasons;
  }

  private generateWhyVixSupports(vix: number, vvix: number, strategyType: string): string[] {
    const reasons: string[] = [];

    if (vix < 15) {
      reasons.push('VIX < 15 - market calm, all strategies viable');
      reasons.push('Low volatility ideal for credit collection');
    } else if (vix < 20) {
      reasons.push('VIX 15-20 - normal environment, favorable conditions');
      reasons.push('Moderate premium without excessive risk');
    } else if (vix < 25) {
      reasons.push('VIX 20-25 - elevated premium for credit strategies');
      reasons.push('Monitor closely - approach DTE management early');
    } else {
      reasons.push('VIX > 25 - defensive positioning only');
      reasons.push('High uncertainty requires smaller sizes');
    }

    if (vvix > 100) {
      reasons.push('⚠️ VVIX elevated - reduce position size 30%');
    }

    return reasons;
  }

  private generateVixRiskManagement(vix: number, strategyType: string): {
    entry: string;
    monitor: string;
    exit: string;
  } {
    if (vix < 15) {
      return {
        entry: 'Normal position sizing - VIX supports entry',
        monitor: 'Alert if VIX crosses 18 - early warning',
        exit: 'Exit at 50% profit OR if VIX > 20',
      };
    } else if (vix < 20) {
      return {
        entry: 'Full position size acceptable',
        monitor: 'Alert if VIX crosses 22 - regime change warning',
        exit: 'Exit at 50% profit OR if VIX > 25',
      };
    } else if (vix < 25) {
      return {
        entry: 'Reduce to 70% of normal size',
        monitor: 'Daily monitoring - volatility unstable',
        exit: 'Exit immediately if VIX > 28',
      };
    } else {
      return {
        entry: 'Avoid new positions - VIX too high',
        monitor: 'Wait for VIX < 20 to re-enter',
        exit: 'Close existing positions now',
      };
    }
  }

  private generateManagementRules(strategyType: string): string[] {
    if (strategyType === 'CREDIT_SPREAD') {
      return [
        'Take profit at 50% of max credit',
        'Stop loss at 2x entry credit',
        'Roll at 21 DTE if still profitable',
        'Avoid holding through earnings',
        'Monitor VIX - exit if crosses trigger levels',
      ];
    } else if (strategyType === 'IRON_CONDOR') {
      return [
        'Take profit at 50% of max credit',
        'Close if one side breaches short strike',
        'Roll untested side at 21 DTE',
        'Exit entire position if VIX > 20',
        'Never hold through major events',
      ];
    } else {
      return [
        'LEAPS are long-term - hold through volatility',
        'Target 365 DTE, 0.60-0.70 delta',
        'Take profit at 100-200% gain',
        'Best entry when VIX < 15',
        'Avoid buying when VIX > 25',
      ];
    }
  }

  private findSimilarTickers(symbol: string, watchlist: any[]): string[] {
    // Simple implementation - return 2-3 random watchlist tickers
    const filtered = watchlist
      .filter(w => w.symbol !== symbol && w.type === 'stock')
      .map(w => w.symbol);
    
    return filtered.slice(0, 3);
  }
}

export const opportunityScannerService = new OpportunityScannerService();
