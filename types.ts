// --- DCA & Finance Types ---
export interface MarketDataPoint {
  date: string;
  price: number;
  sma20?: number;
  sma50?: number;
  sma100?: number;
  sma200?: number;
  rsiWeekly?: number;
  vix?: number;
}

export interface DcaTransaction {
  date: string;
  price: number;
  investedAmount: number;
  sharesBought: number;
  accumulatedShares: number;
  portfolioValue: number;
  multiplierApplied: number;
  reason?: string;
}

export interface DcaSummary {
  totalInvested: number;
  currentValue: number;
  profitPercent: number;
  cagr: number;
  shares: number;
}

export interface DcaExtendedSummary extends DcaSummary {
  xirr: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPeakDate: string;
  maxDrawdownTroughDate: string;
  volatility: number;
  avgBuyPrice: number;
  bestMonth: { date: string; return: number };
  worstMonth: { date: string; return: number };
  dataSource: 'coingecko' | 'yahoo' | 'simulated';
}

export type DcaFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface PortfolioPosition {
  ticker: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  type: 'crypto' | 'stock' | 'etf';
}

// --- Running Types ---
export interface RunnerProfile {
  vma: number; // km/h
  name: string;
  goal: string;
}

export interface Workout {
  id: string;
  title: string;
  type: 'EF' | 'VMA' | 'Tempo' | 'Long' | 'Recovery';
  durationMin: number;
  description: string;
  intensityLabel: string;
}

export interface WeekPlanDay {
  day: string;
  workout: Workout | null; // null means Rest
}