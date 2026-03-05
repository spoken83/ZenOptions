export interface VixAlertStatus {
  level: string;
  color: 'green' | 'yellow' | 'orange' | 'red';
  interpretation: string;
  strategyImpact: string;
  divergence: boolean;
}

export function calculateVixAlertStatus(
  vix: number,
  vvix: number
): VixAlertStatus {
  let status: VixAlertStatus = {
    level: '',
    color: 'yellow',
    interpretation: '',
    strategyImpact: '',
    divergence: false,
  };

  // Determine VIX level
  if (vix < 12) {
    status.level = 'COMPLACENT';
    status.color = 'green';
    status.interpretation = 'Extreme calm - watch for complacency spike';
    status.strategyImpact = 'BEST for LEAPS, ICs with thin premium';
  } else if (vix < 15) {
    status.level = 'LOW';
    status.color = 'green';
    status.interpretation = 'Low volatility environment';
    status.strategyImpact = 'Good for ICs and LEAPS';
  } else if (vix < 20) {
    status.level = 'NORMAL';
    status.color = 'yellow';
    status.interpretation = 'Normal market conditions';
    status.strategyImpact = 'All strategies viable';
  } else if (vix < 25) {
    status.level = 'ELEVATED';
    status.color = 'orange';
    status.interpretation = 'Uncertainty rising';
    status.strategyImpact = 'Close ICs, tighter credit spreads';
  } else if (vix < 30) {
    status.level = 'HIGH';
    status.color = 'orange';
    status.interpretation = 'Significant uncertainty';
    status.strategyImpact = 'Reduce exposure 70%, defensive only';
  } else {
    status.level = 'CRISIS';
    status.color = 'red';
    status.interpretation = 'Panic mode - wild swings expected';
    status.strategyImpact = 'Close all risk, preserve capital';
  }

  // Check for VIX/VVIX divergence
  if (vix < 20 && vvix > 100) {
    status.divergence = true;
    status.interpretation = 'Market calm but institutions nervous';
    status.strategyImpact = 'ICs favorable, but size positions 70%';
  }

  return status;
}

export interface StrategySuitability {
  score: number;
  rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  icon: string;
  reasons: string[];
}

export function calculateStrategySuitability(
  vix: number,
  vvix: number
): {
  ironCondor: StrategySuitability;
  creditSpreads: StrategySuitability;
  leaps: StrategySuitability;
} {
  // Iron Condor Scoring
  const icScore = vix < 15 ? 90 : vix < 20 ? 75 : vix < 25 ? 40 : 20;
  const icReasons: string[] = [];
  if (vix < 20) {
    icReasons.push('VIX < 20: Low volatility environment');
    icReasons.push('Stable range trading likely');
    icReasons.push('Theta decay works best in calm markets');
  } else if (vix < 25) {
    icReasons.push('VIX elevated: Reduce exposure');
  } else {
    icReasons.push('VIX too high: Avoid ICs');
  }
  if (vvix > 100) {
    icReasons.push('⚠️ VVIX elevated: Size positions 70%');
  }

  // Credit Spreads Scoring  
  const csScore = vix < 15 ? 70 : vix < 20 ? 80 : vix < 25 ? 85 : vix < 30 ? 60 : 30;
  const csReasons: string[] = [];
  if (vix >= 15 && vix <= 25) {
    csReasons.push(`VIX ${vix.toFixed(2)}: Fair premium for collection`);
    csReasons.push('Probability setups work in this environment');
  }
  if (vvix > 100) {
    csReasons.push('VVIX elevated: Reduce position sizes to 70%');
  }

  // LEAPS Scoring
  const leapsScore = vix < 15 ? 95 : vix < 20 ? 80 : vix < 30 ? 50 : 30;
  const leapsReasons: string[] = [];
  if (vix < 15) {
    leapsReasons.push('VIX < 15: Cheap to buy volatility');
    leapsReasons.push('EXCELLENT entry for LEAPS');
  } else if (vix < 20) {
    leapsReasons.push(`VIX ${vix.toFixed(2)}: Fair price to buy volatility`);
    leapsReasons.push('Long timeframe absorbs short-term vol spikes');
  } else if (vix < 30) {
    leapsReasons.push('VIX elevated: Wait for pullback for best entry');
  } else {
    leapsReasons.push('VIX > 30: Too expensive, wait for VIX < 20');
  }

  const getRating = (score: number): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' => {
    if (score >= 80) return 'EXCELLENT';
    if (score >= 65) return 'GOOD';
    if (score >= 40) return 'FAIR';
    return 'POOR';
  };

  return {
    ironCondor: {
      score: icScore,
      rating: getRating(icScore),
      icon: icScore >= 80 ? '✅✅✅' : icScore >= 65 ? '✅✅' : icScore >= 40 ? '⚠️' : '❌',
      reasons: icReasons,
    },
    creditSpreads: {
      score: csScore,
      rating: getRating(csScore),
      icon: csScore >= 80 ? '✅✅✅' : csScore >= 65 ? '✅✅' : csScore >= 40 ? '⚠️' : '❌',
      reasons: csReasons,
    },
    leaps: {
      score: leapsScore,
      rating: getRating(leapsScore),
      icon: leapsScore >= 80 ? '✅✅✅' : leapsScore >= 65 ? '✅✅' : leapsScore >= 40 ? '⚠️' : '❌',
      reasons: leapsReasons,
    },
  };
}

export function getVixColorClass(color: 'green' | 'yellow' | 'orange' | 'red'): string {
  switch (color) {
    case 'green':
      return 'bg-success/15 dark:bg-success/20 text-success dark:text-emerald-400 border-success/40 dark:border-success/50';
    case 'yellow':
      return 'bg-warning/15 dark:bg-warning/20 text-warning dark:text-amber-400 border-warning/40 dark:border-warning/50';
    case 'orange':
      return 'bg-orange-500/15 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/40 dark:border-orange-500/50';
    case 'red':
      return 'bg-destructive/15 dark:bg-destructive/20 text-destructive dark:text-red-400 border-destructive/40 dark:border-destructive/50';
  }
}
