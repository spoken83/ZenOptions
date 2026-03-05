export interface Stats {
  activePositions: number;
  candidates: number;
  unrealizedPL: number;
  pendingAlerts: number;
}

export interface PositionWithAlert {
  id: string;
  symbol: string;
  type: string;
  shortStrike: number;
  longStrike: number;
  expiry: Date;
  entryCreditCents: number;
  currentMidCents?: number;
  dte?: number;
  profitLoss?: number;
  profitLossPercent?: number;
  alertType?: string;
}
