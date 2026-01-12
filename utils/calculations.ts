/**
 * Financial Calculations Module
 * 
 * Provides mathematically rigorous financial metrics for DCA backtesting.
 * All formulas follow industry-standard definitions.
 */

import { MarketDataPoint, DcaTransaction } from '../types';

// ============================================================================
// BASIC METRICS
// ============================================================================

/**
 * Calculate Compound Annual Growth Rate (CAGR)
 * 
 * Formula: CAGR = (Vf/Vi)^(1/n) - 1
 * 
 * @param startValue - Initial value (Vi)
 * @param endValue - Final value (Vf)
 * @param years - Number of years (n)
 * @returns CAGR as a percentage
 */
export const calculateCAGR = (startValue: number, endValue: number, years: number): number => {
  if (startValue <= 0 || years <= 0) return 0;
  if (endValue <= 0) return -100;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
};

/**
 * Calculate total return percentage
 * 
 * Formula: Return = (Vf - Vi) / Vi * 100
 */
export const calculateTotalReturn = (startValue: number, endValue: number): number => {
  if (startValue <= 0) return 0;
  return ((endValue - startValue) / startValue) * 100;
};

// ============================================================================
// XIRR (Extended Internal Rate of Return)
// ============================================================================

interface CashFlow {
  date: Date;
  amount: number; // Negative for investments, positive for returns
}

/**
 * Calculate XIRR using Newton-Raphson method
 * 
 * XIRR is the discount rate r that satisfies:
 * Σ(CFi / (1+r)^((ti - t0)/365)) = 0
 * 
 * This is the TRUE annualized return for irregular cash flows.
 * 
 * @param cashFlows - Array of {date, amount} where negative = outflow, positive = inflow
 * @param guess - Initial guess for rate (default 0.1 = 10%)
 * @returns XIRR as a percentage, or NaN if no solution
 */
export const calculateXIRR = (cashFlows: CashFlow[], guess: number = 0.1): number => {
  if (cashFlows.length < 2) return 0;

  const dates = cashFlows.map(cf => cf.date.getTime());
  const amounts = cashFlows.map(cf => cf.amount);
  const minDate = Math.min(...dates);

  // Convert dates to years from first date
  const years = dates.map(d => (d - minDate) / (365.25 * 24 * 60 * 60 * 1000));

  // Newton-Raphson iteration
  let rate = guess;
  const maxIterations = 100;
  const tolerance = 1e-7;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0; // derivative

    for (let j = 0; j < amounts.length; j++) {
      const factor = Math.pow(1 + rate, years[j]);
      npv += amounts[j] / factor;
      dnpv -= (years[j] * amounts[j]) / (factor * (1 + rate));
    }

    if (Math.abs(dnpv) < 1e-10) break; // Avoid division by zero

    const newRate = rate - npv / dnpv;

    if (Math.abs(newRate - rate) < tolerance) {
      return newRate * 100; // Convert to percentage
    }

    rate = newRate;

    // Guard against divergence
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10; // 1000% max
  }

  return rate * 100;
};

/**
 * Build cash flow array from DCA transactions for XIRR calculation
 */
export const buildCashFlowsFromTransactions = (
  transactions: DcaTransaction[],
  finalValue: number
): CashFlow[] => {
  const cashFlows: CashFlow[] = transactions.map(tx => ({
    date: new Date(tx.date),
    amount: -tx.investedAmount, // Outflows are negative
  }));

  // Add final value as positive inflow
  if (transactions.length > 0) {
    const lastTx = transactions[transactions.length - 1];
    cashFlows.push({
      date: new Date(lastTx.date),
      amount: finalValue,
    });
  }

  return cashFlows;
};

// ============================================================================
// RISK METRICS
// ============================================================================

/**
 * Calculate daily returns from price series
 * 
 * Formula: Ri = (Pi - Pi-1) / Pi-1
 */
export const calculateDailyReturns = (prices: number[]): number[] => {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] !== 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  return returns;
};

/**
 * Calculate annualized volatility (standard deviation)
 * 
 * Formula: σ_annual = σ_daily × √252
 * 
 * Where 252 is the typical number of trading days per year
 * 
 * @param prices - Array of prices
 * @returns Annualized volatility as a percentage
 */
export const calculateVolatility = (prices: number[]): number => {
  const returns = calculateDailyReturns(prices);
  if (returns.length < 2) return 0;

  // Calculate mean
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  // Calculate variance
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);

  // Standard deviation
  const dailyStdDev = Math.sqrt(variance);

  // Annualize: multiply by sqrt(252)
  const annualizedVol = dailyStdDev * Math.sqrt(252);

  return annualizedVol * 100; // Convert to percentage
};

/**
 * Calculate Sharpe Ratio
 * 
 * Formula: Sharpe = (Rp - Rf) / σp
 * 
 * Where:
 * - Rp = Portfolio return (annualized)
 * - Rf = Risk-free rate (annualized)
 * - σp = Portfolio volatility (annualized)
 * 
 * @param annualizedReturn - Portfolio annual return (as decimal, e.g., 0.15 for 15%)
 * @param annualizedVolatility - Portfolio volatility (as decimal)
 * @param riskFreeRate - Annual risk-free rate (default 0.02 = 2%)
 * @returns Sharpe ratio
 */
export const calculateSharpeRatio = (
  annualizedReturn: number,
  annualizedVolatility: number,
  riskFreeRate: number = 0.02
): number => {
  if (annualizedVolatility === 0) return 0;
  return (annualizedReturn - riskFreeRate) / annualizedVolatility;
};

/**
 * Calculate Sharpe Ratio directly from price series
 * 
 * @param prices - Array of prices
 * @param riskFreeRate - Annual risk-free rate (as percentage, e.g., 2 for 2%)
 * @returns Sharpe ratio
 */
export const calculateSharpeFromPrices = (
  prices: number[],
  riskFreeRate: number = 2
): number => {
  if (prices.length < 2) return 0;

  const returns = calculateDailyReturns(prices);
  if (returns.length === 0) return 0;

  // Annualized return
  const dailyMeanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const annualizedReturn = dailyMeanReturn * 252;

  // Annualized volatility
  const mean = dailyMeanReturn;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const dailyStdDev = Math.sqrt(variance);
  const annualizedVol = dailyStdDev * Math.sqrt(252);

  if (annualizedVol === 0) return 0;

  return (annualizedReturn - riskFreeRate / 100) / annualizedVol;
};

// ============================================================================
// DRAWDOWN ANALYSIS
// ============================================================================

export interface DrawdownResult {
  maxDrawdown: number; // As positive percentage
  maxDrawdownPeakDate: string;
  maxDrawdownTroughDate: string;
  currentDrawdown: number;
  drawdownSeries: Array<{ date: string; drawdown: number }>;
}

/**
 * Calculate Maximum Drawdown
 * 
 * Formula: MaxDD = max((Peak - Trough) / Peak)
 * 
 * Maximum Drawdown measures the largest peak-to-trough decline
 * 
 * @param portfolioValues - Array of {date, value}
 * @returns DrawdownResult with max drawdown and dates
 */
export const calculateMaxDrawdown = (
  portfolioValues: Array<{ date: string; value: number }>
): DrawdownResult => {
  if (portfolioValues.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownPeakDate: '',
      maxDrawdownTroughDate: '',
      currentDrawdown: 0,
      drawdownSeries: [],
    };
  }

  let peak = portfolioValues[0].value;
  let peakDate = portfolioValues[0].date;
  let maxDrawdown = 0;
  let maxDrawdownPeakDate = peakDate;
  let maxDrawdownTroughDate = peakDate;

  const drawdownSeries: Array<{ date: string; drawdown: number }> = [];

  for (const { date, value } of portfolioValues) {
    if (value > peak) {
      peak = value;
      peakDate = date;
    }

    const drawdown = (peak - value) / peak;
    drawdownSeries.push({ date, drawdown: drawdown * 100 });

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPeakDate = peakDate;
      maxDrawdownTroughDate = date;
    }
  }

  const lastValue = portfolioValues[portfolioValues.length - 1].value;
  const currentDrawdown = (peak - lastValue) / peak;

  return {
    maxDrawdown: maxDrawdown * 100, // Convert to percentage
    maxDrawdownPeakDate,
    maxDrawdownTroughDate,
    currentDrawdown: currentDrawdown * 100,
    drawdownSeries,
  };
};

// ============================================================================
// MOVING AVERAGES
// ============================================================================

/**
 * Calculate Simple Moving Average
 * 
 * Formula: SMA(n) = (P1 + P2 + ... + Pn) / n
 * 
 * @param prices - Array of prices
 * @param period - Number of periods (default 100)
 * @returns Array of SMA values (same length as prices)
 */
export const calculateSMA = (prices: number[], period: number = 100): number[] => {
  const sma: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      // Not enough data, use available average
      const slice = prices.slice(0, i + 1);
      const avg = slice.reduce((sum, p) => sum + p, 0) / slice.length;
      sma.push(avg);
    } else {
      // Full SMA
      const slice = prices.slice(i - period + 1, i + 1);
      const avg = slice.reduce((sum, p) => sum + p, 0) / period;
      sma.push(avg);
    }
  }

  return sma;
};

/**
 * Calculate Exponential Moving Average
 * 
 * Formula: EMA = Price × k + EMA_prev × (1 - k)
 * Where k = 2 / (period + 1)
 */
export const calculateEMA = (prices: number[], period: number): number[] => {
  const ema: number[] = [];
  const k = 2 / (period + 1);

  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      ema.push(prices[0]);
    } else {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
  }

  return ema;
};

/**
 * Calculate Relative Strength Index (RSI)
 * 
 * Formula: RSI = 100 - (100 / (1 + RS))
 * Where RS = Average Gain / Average Loss (using Wilder's smoothing)
 * 
 * @param prices - Array of closing prices
 * @param period - RSI period (default 14)
 * @returns Array of RSI values (same length as prices, first values are 0)
 */
export const calculateRSI = (prices: number[], period: number = 14): number[] => {
  if (prices.length < period + 1) {
    return prices.map(() => 50); // Default neutral RSI
  }

  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // First RSI value uses simple average
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Fill initial values with neutral RSI
  for (let i = 0; i < period; i++) {
    rsi.push(50);
  }

  // Calculate RSI using Wilder's smoothing
  for (let i = period; i < prices.length; i++) {
    if (i > period) {
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
    }

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsiValue = 100 - (100 / (1 + rs));
    rsi.push(rsiValue);
  }

  return rsi;
};

/**
 * Resample daily prices to weekly (using Friday close)
 * Returns array of weekly closing prices with their dates
 */
export const resampleToWeekly = (dailyPrices: Array<{ date: string; price: number }>): Array<{ date: string; price: number }> => {
  const weeklyData: Array<{ date: string; price: number }> = [];

  let currentWeek = '';
  let lastPrice = { date: '', price: 0 };

  for (const { date, price } of dailyPrices) {
    const d = new Date(date);
    // Get ISO week
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay() + 1); // Monday
    const weekKey = weekStart.toISOString().split('T')[0];

    if (weekKey !== currentWeek && currentWeek !== '') {
      // Save last week's closing price
      weeklyData.push(lastPrice);
    }

    currentWeek = weekKey;
    lastPrice = { date, price };
  }

  // Add last week
  if (lastPrice.date) {
    weeklyData.push(lastPrice);
  }

  return weeklyData;
};

/**
 * Resample daily prices to monthly (using last day of month close)
 * Returns array of monthly closing prices with their dates
 */
export const resampleToMonthly = (dailyPrices: Array<{ date: string; price: number }>): Array<{ date: string; price: number }> => {
  const monthlyData: Array<{ date: string; price: number }> = [];

  let currentMonth = '';
  let lastPrice = { date: '', price: 0 };

  for (const { date, price } of dailyPrices) {
    const monthKey = date.substring(0, 7); // YYYY-MM

    if (monthKey !== currentMonth && currentMonth !== '') {
      // Save last month's closing price
      monthlyData.push(lastPrice);
    }

    currentMonth = monthKey;
    lastPrice = { date, price };
  }

  // Add last month
  if (lastPrice.date) {
    monthlyData.push(lastPrice);
  }

  return monthlyData;
};

// ============================================================================
// DCA-SPECIFIC CALCULATIONS
// ============================================================================

/**
 * Calculate average purchase price (cost basis per share)
 */
export const calculateAveragePurchasePrice = (transactions: DcaTransaction[]): number => {
  if (transactions.length === 0) return 0;
  const lastTx = transactions[transactions.length - 1];
  if (lastTx.accumulatedShares === 0) return 0;

  const totalInvested = transactions.reduce((sum, tx) => sum + tx.investedAmount, 0);
  return totalInvested / lastTx.accumulatedShares;
};

/**
 * Calculate best and worst months
 */
export const calculateBestWorstMonths = (
  transactions: DcaTransaction[]
): { best: { date: string; return: number }; worst: { date: string; return: number } } => {
  if (transactions.length < 2) {
    return {
      best: { date: '', return: 0 },
      worst: { date: '', return: 0 },
    };
  }

  // Group by month and calculate monthly returns
  const monthlyReturns: Array<{ month: string; return: number }> = [];
  let prevMonthValue = transactions[0].portfolioValue;
  let currentMonth = transactions[0].date.substring(0, 7);

  for (let i = 1; i < transactions.length; i++) {
    const txMonth = transactions[i].date.substring(0, 7);

    if (txMonth !== currentMonth) {
      const monthReturn = (transactions[i - 1].portfolioValue - prevMonthValue) / prevMonthValue;
      monthlyReturns.push({ month: currentMonth, return: monthReturn * 100 });
      prevMonthValue = transactions[i - 1].portfolioValue;
      currentMonth = txMonth;
    }
  }

  // Add last month
  const lastTx = transactions[transactions.length - 1];
  const lastReturn = (lastTx.portfolioValue - prevMonthValue) / prevMonthValue;
  monthlyReturns.push({ month: currentMonth, return: lastReturn * 100 });

  if (monthlyReturns.length === 0) {
    return {
      best: { date: '', return: 0 },
      worst: { date: '', return: 0 },
    };
  }

  const sorted = [...monthlyReturns].sort((a, b) => b.return - a.return);

  return {
    best: { date: sorted[0].month, return: sorted[0].return },
    worst: { date: sorted[sorted.length - 1].month, return: sorted[sorted.length - 1].return },
  };
};

// ============================================================================
// LEGACY EXPORTS (for compatibility)
// ============================================================================

// Generates simulated realistic market data (Brownian motion with trend)
// DEPRECATED: Use fetchMarketData from services/api.ts instead
export const generateSimulatedData = (ticker: string, startDateStr: string, years: number = 4): MarketDataPoint[] => {
  console.warn('generateSimulatedData is deprecated. Use fetchMarketData from services/api.ts for real data.');

  const data: MarketDataPoint[] = [];
  const startPrice = ticker.includes('BTC') ? 7000 : 150;
  const volatility = ticker.includes('BTC') ? 0.04 : 0.015;
  const trend = ticker.includes('BTC') ? 0.001 : 0.0005;

  let currentPrice = startPrice;
  const startDate = new Date(startDateStr);
  const now = new Date();

  let currentDate = new Date(startDate);

  while (currentDate <= now) {
    const changePercent = trend + (Math.random() - 0.5) * 2 * volatility;
    currentPrice = currentPrice * (1 + changePercent);
    if (currentPrice < 0.1) currentPrice = 0.1;

    const isPanic = Math.random() > 0.98;
    let vix = 15 + Math.random() * 10;
    if (changePercent < -0.03) vix += 10;
    if (isPanic) vix = 40 + Math.random() * 20;

    data.push({
      date: currentDate.toISOString().split('T')[0],
      price: currentPrice,
      vix: vix,
      sma100: 0
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Calculate SMA 100
  const prices = data.map(d => d.price);
  const smaValues = calculateSMA(prices, 100);
  for (let i = 0; i < data.length; i++) {
    data[i].sma100 = smaValues[i];
  }

  return data;
};

// --- Running Utils ---

export const paceToMinKm = (speedKmh: number): string => {
  if (speedKmh <= 0) return "0:00";
  const minPerKm = 60 / speedKmh;
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}'${secs.toString().padStart(2, '0')}"`;
};

export const calculateZones = (vma: number) => {
  return {
    ef: { min: vma * 0.65, max: vma * 0.75, label: "Endurance Fondamentale (65-75%)" },
    seuil: { min: vma * 0.85, max: vma * 0.90, label: "Seuil Anaérobie (85-90%)" },
    vma: { min: vma * 0.95, max: vma * 1.05, label: "VMA (95-105%)" }
  };
};