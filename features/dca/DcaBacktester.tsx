import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, ComposedChart, Bar, ReferenceLine, ReferenceDot, Brush
} from 'recharts';
import { MarketDataPoint, DcaTransaction, DcaExtendedSummary, DcaFrequency } from '../../types';
import {
  calculateCAGR,
  calculateXIRR,
  buildCashFlowsFromTransactions,
  calculateMaxDrawdown,
  calculateVolatility,
  calculateSharpeFromPrices,
  calculateAveragePurchasePrice,
  calculateBestWorstMonths,
  calculateSMA,
  calculateRSI,
  resampleToWeekly,
  resampleToMonthly
} from '../../utils/calculations';

const BACKEND_URL = 'http://localhost:3001';

// ============================================================================
// API FUNCTIONS
// ============================================================================

interface PricePoint {
  date: string;
  price: number;
}

interface ApiTransaction {
  id: number;
  date: string;
  type: string;
  ticker: string;
  quantity: number;
  price: number;
  fees: number;
  invested_amount: number;
}

const fetchMarketData = async (ticker: string, startDate: string): Promise<PricePoint[]> => {
  const fromTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const toTimestamp = Math.floor(Date.now() / 1000);

  // Determine if crypto or stock - expanded mappings
  const cryptoTickers: Record<string, string> = {
    'BTC': 'bitcoin', 'BTC-USD': 'bitcoin',
    'ETH': 'ethereum', 'ETH-USD': 'ethereum',
    'SOL': 'solana', 'SOL-USD': 'solana',
    'ADA': 'cardano', 'ADA-USD': 'cardano',
    'TAO': 'bittensor', 'TAO-USD': 'bittensor',
    'SUI': 'sui', 'SUI-USD': 'sui',
    'ONDO': 'ondo-finance', 'ONDO-USD': 'ondo-finance',
    'LINK': 'chainlink', 'LINK-USD': 'chainlink',
    'AAVE': 'aave', 'AAVE-USD': 'aave',
    'RNDR': 'render-token', 'RNDR-USD': 'render-token',
  };

  const upperTicker = ticker.toUpperCase();
  const coinId = cryptoTickers[upperTicker] || cryptoTickers[upperTicker.replace('-USD', '')];

  let url: string;
  if (coinId) {
    url = `${BACKEND_URL}/api/crypto/${coinId}?from=${fromTimestamp}&to=${toTimestamp}`;
  } else {
    url = `${BACKEND_URL}/api/stock/${upperTicker}?period1=${fromTimestamp}&period2=${toTimestamp}`;
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const data = await response.json();
  return data.prices || [];
};

// Fetch VIX (^VIX) data for Smart DCA rules
const fetchVixData = async (startDate: string): Promise<Map<string, number>> => {
  const fromTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const toTimestamp = Math.floor(Date.now() / 1000);
  const vixMap = new Map<string, number>();

  try {
    const url = `${BACKEND_URL}/api/stock/%5EVIX?period1=${fromTimestamp}&period2=${toTimestamp}`;
    const response = await fetch(url);
    if (!response.ok) return vixMap;

    const data = await response.json();
    const prices = data.prices || [];

    for (const p of prices) {
      vixMap.set(p.date, p.price);
    }
  } catch (err) {
    console.warn('VIX data not available:', err);
  }

  return vixMap;
};

const fetchPortfolioTransactions = async (): Promise<ApiTransaction[]> => {
  const response = await fetch(`${BACKEND_URL}/api/transactions`);
  if (!response.ok) throw new Error('Failed to fetch transactions');
  return response.json();
};

const setPortfolioTicker = async (ticker: string): Promise<void> => {
  await fetch(`${BACKEND_URL}/api/transactions/set-ticker`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker })
  });
};

const updateTransaction = async (
  id: number,
  updates: { quantity?: number; unit_price?: number; fees?: number }
): Promise<ApiTransaction> => {
  const response = await fetch(`${BACKEND_URL}/api/transactions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!response.ok) throw new Error('Failed to update transaction');
  const data = await response.json();
  return data.transaction;
};

// ============================================================================
// COMPONENT
// ============================================================================

const DcaBacktester: React.FC = () => {
  // Form state
  const [ticker, setTicker] = useState<string>('CW8.PA');
  const [startDate, setStartDate] = useState<string>('2023-05-01');
  const [baseAmount, setBaseAmount] = useState<number>(100);
  const [frequency, setFrequency] = useState<DcaFrequency>('monthly');
  const [useSmaRule, setUseSmaRule] = useState<boolean>(true);
  const [useSma200Rule, setUseSma200Rule] = useState<boolean>(true);
  const [useSma20Rule, setUseSma20Rule] = useState<boolean>(false);
  const [useSma50Rule, setUseSma50Rule] = useState<boolean>(false);
  const [useRsiRule, setUseRsiRule] = useState<boolean>(false);
  const [useVixRule, setUseVixRule] = useState<boolean>(false);
  const [useDcaStrict, setUseDcaStrict] = useState<boolean>(false);
  const [indicatorTimeframe, setIndicatorTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [useSellInMay, setUseSellInMay] = useState<boolean>(false);

  // Configurable multipliers for Smart DCA rules
  const [sma20Multiplier, setSma20Multiplier] = useState<number>(2);
  const [sma50Multiplier, setSma50Multiplier] = useState<number>(2);
  const [sma100Multiplier, setSma100Multiplier] = useState<number>(2);
  const [sma200Multiplier, setSma200Multiplier] = useState<number>(2);
  const [vixMultiplier, setVixMultiplier] = useState<number>(3);
  const [vixThreshold, setVixThreshold] = useState<number>(40);

  // Data state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<DcaTransaction[]>([]);
  const [summary, setSummary] = useState<DcaExtendedSummary | null>(null);
  const [marketData, setMarketData] = useState<MarketDataPoint[]>([]);
  const [drawdownData, setDrawdownData] = useState<Array<{ date: string; drawdown: number }>>([]);

  // Portfolio state
  const [portfolioTxs, setPortfolioTxs] = useState<ApiTransaction[]>([]);
  const [usePortfolio, setUsePortfolio] = useState<boolean>(true);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [showPortfolioEditor, setShowPortfolioEditor] = useState<boolean>(false);
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ quantity: number; unit_price: number; fees: number }>({ quantity: 0, unit_price: 0, fees: 0 });

  // Handle transaction update
  const handleUpdateTransaction = async (id: number) => {
    try {
      await updateTransaction(id, editForm);
      // Refresh transactions
      const updated = await fetchPortfolioTransactions();
      setPortfolioTxs(updated);
      setEditingTxId(null);
    } catch (err) {
      setError('Erreur lors de la mise à jour');
    }
  };

  const startEditing = (tx: ApiTransaction) => {
    setEditingTxId(tx.id);
    setEditForm({ quantity: tx.quantity, unit_price: tx.price, fees: tx.fees });
  };

  // Check backend status on mount
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/health`)
      .then(res => res.json())
      .then(data => {
        setBackendStatus('online');
        if (data.transactions > 0) {
          fetchPortfolioTransactions().then(setPortfolioTxs);
        }
      })
      .catch(() => setBackendStatus('offline'));
  }, []);

  // Main backtest function
  const runBacktest = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Detect if ticker is crypto (for API limits)
      const cryptoTickers = ['BTC', 'ETH', 'SOL', 'ADA', 'TAO', 'SUI', 'ONDO', 'LINK', 'AAVE', 'RNDR'];
      const isCrypto = cryptoTickers.some(ct => ticker.toUpperCase().includes(ct));

      // Calculate lookback period for proper SMA calculation
      // For crypto: limit to 2 years max (CoinGecko API limits)
      // For stocks: use full lookback for accurate SMA
      const userStartDate = new Date(startDate);
      let lookbackDays: number;

      if (isCrypto) {
        // Crypto: limit lookback to avoid API errors
        lookbackDays = Math.min(365 * 2, indicatorTimeframe === 'daily' ? 200 : 365 * 2);
      } else if (indicatorTimeframe === 'monthly') {
        lookbackDays = 200 * 30; // ~17 years for monthly SMA-200
      } else if (indicatorTimeframe === 'weekly') {
        lookbackDays = 200 * 7; // ~4 years for weekly SMA-200
      } else {
        lookbackDays = 200; // 200 days for daily SMA-200
      }

      const historicalStartDate = new Date(userStartDate);
      historicalStartDate.setDate(historicalStartDate.getDate() - lookbackDays);
      const historicalStartStr = historicalStartDate.toISOString().split('T')[0];

      // Fetch market data from earlier date for proper SMA calculation
      const allPrices = await fetchMarketData(ticker, historicalStartStr);

      if (allPrices.length === 0) {
        throw new Error(`Aucune donnée trouvée pour ${ticker}`);
      }

      // Convert to MarketDataPoint format with SMA-100, SMA-200 based on timeframe
      // Use allPrices (with historical data) for proper SMA calculation
      const allPriceValues = allPrices.map(p => p.price);

      // Calculate SMAs based on indicator timeframe using FULL historical data
      let sma20Map = new Map<string, number>();
      let sma50Map = new Map<string, number>();
      let sma100Map = new Map<string, number>();
      let sma200Map = new Map<string, number>();

      if (indicatorTimeframe === 'daily') {
        // Daily SMA: direct calculation on all data
        const sma20Values = calculateSMA(allPriceValues, 20);
        const sma50Values = calculateSMA(allPriceValues, 50);
        const sma100Values = calculateSMA(allPriceValues, 100);
        const sma200Values = calculateSMA(allPriceValues, 200);
        allPrices.forEach((p, i) => {
          sma20Map.set(p.date, sma20Values[i]);
          sma50Map.set(p.date, sma50Values[i]);
          sma100Map.set(p.date, sma100Values[i]);
          sma200Map.set(p.date, sma200Values[i]);
        });
      } else if (indicatorTimeframe === 'weekly') {
        // Weekly SMA: resample to weekly, calculate SMA, then map back to daily
        const weeklyPricesForSMA = resampleToWeekly(allPrices);
        const weeklySma20 = calculateSMA(weeklyPricesForSMA.map(w => w.price), 20);
        const weeklySma50 = calculateSMA(weeklyPricesForSMA.map(w => w.price), 50);
        const weeklySma100 = calculateSMA(weeklyPricesForSMA.map(w => w.price), 100);
        const weeklySma200 = calculateSMA(weeklyPricesForSMA.map(w => w.price), 200);

        // Create date maps from weekly data
        weeklyPricesForSMA.forEach((wp, i) => {
          sma20Map.set(wp.date, weeklySma20[i]);
          sma50Map.set(wp.date, weeklySma50[i]);
          sma100Map.set(wp.date, weeklySma100[i]);
          sma200Map.set(wp.date, weeklySma200[i]);
        });

        // Fill in daily dates with the most recent weekly value
        let lastSma20 = allPriceValues[0];
        let lastSma50 = allPriceValues[0];
        let lastSma100 = allPriceValues[0];
        let lastSma200 = allPriceValues[0];
        allPrices.forEach((p) => {
          if (sma100Map.has(p.date)) {
            lastSma20 = sma20Map.get(p.date)!;
            lastSma50 = sma50Map.get(p.date)!;
            lastSma100 = sma100Map.get(p.date)!;
            lastSma200 = sma200Map.get(p.date)!;
          }
          sma20Map.set(p.date, lastSma20);
          sma50Map.set(p.date, lastSma50);
          sma100Map.set(p.date, lastSma100);
          sma200Map.set(p.date, lastSma200);
        });
      } else {
        // Monthly SMA: resample to monthly, calculate SMA, then map back to daily
        const monthlyPricesForSMA = resampleToMonthly(allPrices);
        const monthlySma20 = calculateSMA(monthlyPricesForSMA.map(m => m.price), 20);
        const monthlySma50 = calculateSMA(monthlyPricesForSMA.map(m => m.price), 50);
        const monthlySma100 = calculateSMA(monthlyPricesForSMA.map(m => m.price), 100);
        const monthlySma200 = calculateSMA(monthlyPricesForSMA.map(m => m.price), 200);

        // Create date maps from monthly data
        monthlyPricesForSMA.forEach((mp, i) => {
          sma20Map.set(mp.date, monthlySma20[i]);
          sma50Map.set(mp.date, monthlySma50[i]);
          sma100Map.set(mp.date, monthlySma100[i]);
          sma200Map.set(mp.date, monthlySma200[i]);
        });

        // Fill in daily dates with the most recent monthly value
        let lastSma20 = allPriceValues[0];
        let lastSma50 = allPriceValues[0];
        let lastSma100 = allPriceValues[0];
        let lastSma200 = allPriceValues[0];
        allPrices.forEach((p) => {
          if (sma100Map.has(p.date)) {
            lastSma20 = sma20Map.get(p.date)!;
            lastSma50 = sma50Map.get(p.date)!;
            lastSma100 = sma100Map.get(p.date)!;
            lastSma200 = sma200Map.get(p.date)!;
          }
          sma20Map.set(p.date, lastSma20);
          sma50Map.set(p.date, lastSma50);
          sma100Map.set(p.date, lastSma100);
          sma200Map.set(p.date, lastSma200);
        });
      }

      // Filter prices to user's requested start date (but keep SMA maps with full data)
      const prices = allPrices.filter(p => p.date >= startDate);
      const priceValues = prices.map(p => p.price);

      // Calculate weekly RSI
      const weeklyPrices = resampleToWeekly(prices);
      const weeklyRsiValues = calculateRSI(weeklyPrices.map(w => w.price), 14);

      // Map weekly RSI back to daily dates
      const weeklyRsiMap = new Map<string, number>();
      weeklyPrices.forEach((wp, i) => {
        weeklyRsiMap.set(wp.date, weeklyRsiValues[i]);
      });

      // For each daily date, find the most recent weekly RSI
      let lastRsi = 50;

      // Fetch VIX data
      const vixMap = await fetchVixData(startDate);

      const data: MarketDataPoint[] = prices.map((p, i) => {
        if (weeklyRsiMap.has(p.date)) {
          lastRsi = weeklyRsiMap.get(p.date)!;
        }
        return {
          date: p.date,
          price: p.price,
          sma20: sma20Map.get(p.date) || priceValues[i],
          sma50: sma50Map.get(p.date) || priceValues[i],
          sma100: sma100Map.get(p.date) || priceValues[i],
          sma200: sma200Map.get(p.date) || priceValues[i],
          rsiWeekly: lastRsi,
          vix: vixMap.get(p.date)
        };
      });

      setMarketData(data);

      // Build transactions
      let txs: DcaTransaction[];

      if (usePortfolio && portfolioTxs.length > 0) {
        // Use portfolio transactions
        await setPortfolioTicker(ticker);

        let totalShares = 0;
        txs = portfolioTxs.map(ptx => {
          totalShares += ptx.quantity;
          // Find price for this date
          const pricePoint = data.find(d => d.date === ptx.date.split(' ')[0]) || data[data.length - 1];

          return {
            date: ptx.date.split(' ')[0],
            price: ptx.price,
            investedAmount: ptx.invested_amount,
            sharesBought: ptx.quantity,
            accumulatedShares: totalShares,
            portfolioValue: totalShares * (pricePoint?.price || ptx.price),
            multiplierApplied: 1,
            reason: 'Portfolio import'
          };
        });
      } else {
        // Simulate DCA based on frequency
        txs = [];
        let totalShares = 0;
        let totalInvested = 0;

        const dcaDates = data.filter((pt) => {
          const d = new Date(pt.date);
          if (frequency === 'monthly') return d.getDate() <= 3;
          if (frequency === 'weekly') return d.getDay() === 1;
          if (frequency === 'daily') return true;
          if (frequency === 'quarterly') return d.getDate() <= 3 && [0, 3, 6, 9].includes(d.getMonth());
          return false;
        });

        // Deduplicate by month for monthly
        const seenMonths = new Set<string>();
        const filteredDates = frequency === 'monthly'
          ? dcaDates.filter(pt => {
            const month = pt.date.substring(0, 7);
            if (seenMonths.has(month)) return false;
            seenMonths.add(month);
            return true;
          })
          : dcaDates;

        // Budget Balancing: track "debt" when spending more than baseAmount
        // If we spend 2x this month, we skip next month to keep total equal
        let budgetDebt = 0; // How much extra we've spent
        let savedCash = 0;  // Cash saved from RSI > 70 skips

        // Sell in May: Pre-calculate actual summer and winter DCA periods
        const summerDates = filteredDates.filter(pt => {
          const month = new Date(pt.date).getMonth();
          return month >= 4 && month <= 7; // May(4) to August(7)
        });
        const winterDates = filteredDates.filter(pt => {
          const month = new Date(pt.date).getMonth();
          return month >= 8 || month <= 3; // Sept(8) to April(3)
        });

        // Calculate total savings from summer months and bonus per winter month
        const summerSavings = summerDates.length * baseAmount;
        const sellInMayBonus = winterDates.length > 0 ? summerSavings / winterDates.length : 0;

        // Pre-calculate for each date: was the price above SMA on the PREVIOUS day?
        // This uses ALL daily data to correctly track crossing direction
        // Key = date string, Value = true if previous day price was above SMA (meaning today's crossing = support)
        const wasAboveSma20Map = new Map<string, boolean>();
        const wasAboveSma50Map = new Map<string, boolean>();
        const wasAboveSma100Map = new Map<string, boolean>();
        const wasAboveSma200Map = new Map<string, boolean>();

        // Iterate through ALL days in data (not just DCA dates) to build tracking maps
        for (let i = 1; i < data.length; i++) {
          const prevDay = data[i - 1];
          const todayDate = data[i].date;

          // Was price above SMA on the PREVIOUS day?
          if (prevDay.sma20) {
            wasAboveSma20Map.set(todayDate, prevDay.price >= prevDay.sma20);
          }
          if (prevDay.sma50) {
            wasAboveSma50Map.set(todayDate, prevDay.price >= prevDay.sma50);
          }
          if (prevDay.sma100) {
            wasAboveSma100Map.set(todayDate, prevDay.price >= prevDay.sma100);
          }
          if (prevDay.sma200) {
            wasAboveSma200Map.set(todayDate, prevDay.price >= prevDay.sma200);
          }
        }

        // Pre-calculate max VIX since previous DCA date for each DCA date
        // This ensures we don't miss VIX spikes that happen between DCA dates
        const maxVixSincePrevDcaMap = new Map<string, number>();
        const filteredDatesSet = new Set(filteredDates.map(pt => pt.date));
        let lastDcaIndex = 0;

        for (let i = 0; i < filteredDates.length; i++) {
          const dcaDate = filteredDates[i].date;
          const dcaDateIndex = data.findIndex(d => d.date === dcaDate);

          // Find max VIX from last DCA date (or start) to current DCA date
          let maxVix = 0;
          for (let j = lastDcaIndex; j <= dcaDateIndex && j < data.length; j++) {
            if (data[j].vix && data[j].vix! > maxVix) {
              maxVix = data[j].vix!;
            }
          }
          maxVixSincePrevDcaMap.set(dcaDate, maxVix);
          lastDcaIndex = dcaDateIndex + 1;
        }

        filteredDates.forEach((pt) => {
          let amount = baseAmount;
          let multiplier = 1;
          const reasons: string[] = [];
          const month = new Date(pt.date).getMonth();
          const isSummerMonth = month >= 4 && month <= 7; // May(4) to August(7)

          // DCA Strict mode: skip all rules, just invest base amount
          if (useDcaStrict) {
            const sharesBought = amount / pt.price;
            totalShares += sharesBought;
            totalInvested += amount;

            txs.push({
              date: pt.date,
              price: pt.price,
              investedAmount: amount,
              sharesBought,
              accumulatedShares: totalShares,
              portfolioValue: totalShares * pt.price,
              multiplierApplied: 1,
              reason: ''
            });
            return;
          }

          // Sell in May Strategy: skip May-Aug, add bonus in Sept-April
          if (useSellInMay && isSummerMonth) {
            txs.push({
              date: pt.date,
              price: pt.price,
              investedAmount: 0,
              sharesBought: 0,
              accumulatedShares: totalShares,
              portfolioValue: totalShares * pt.price,
              multiplierApplied: 0,
              reason: `🌴 Sell in May (total épargné: €${summerSavings.toFixed(0)})`
            });
            return;
          }

          // Check if we're in debt from previous over-spending (only applies to base amount, not Sell in May bonus)
          let effectiveBaseAmount = baseAmount;
          if (budgetDebt >= baseAmount) {
            budgetDebt -= baseAmount;
            effectiveBaseAmount = 0; // Skip base amount this month due to debt
            reasons.push(`⏸️ Équilibrage dette (reste: €${budgetDebt.toFixed(0)})`);
          }

          // Add Sell in May bonus during winter months (always applied, separate from debt)
          // This is money saved during summer, not borrowed from future months
          if (useSellInMay && !isSummerMonth && sellInMayBonus > 0) {
            amount = effectiveBaseAmount + sellInMayBonus;
            reasons.push(`🌴 +€${sellInMayBonus.toFixed(0)}`);
          } else {
            amount = effectiveBaseAmount;
          }

          // If we have nothing to invest this month (debt only, no Sell in May bonus), skip
          if (amount <= 0) {
            txs.push({
              date: pt.date,
              price: pt.price,
              investedAmount: 0,
              sharesBought: 0,
              accumulatedShares: totalShares,
              portfolioValue: totalShares * pt.price,
              multiplierApplied: 0,
              reason: reasons.join(', ')
            });
            return;
          }

          // RSI Accumulation Strategy
          if (useRsiRule && pt.rsiWeekly) {
            if (pt.rsiWeekly > 70) {
              savedCash += baseAmount;
              txs.push({
                date: pt.date,
                price: pt.price,
                investedAmount: 0,
                sharesBought: 0,
                accumulatedShares: totalShares,
                portfolioValue: totalShares * pt.price,
                multiplierApplied: 0,
                reason: `⏸️ RSI ${pt.rsiWeekly.toFixed(0)} > 70 (épargné: €${savedCash.toFixed(0)})`
              });
              return;
            } else if (pt.rsiWeekly < 30 && savedCash > 0) {
              amount += savedCash;
              reasons.push(`🚀 RSI < 30 (déployé: €${savedCash.toFixed(0)})`);
              savedCash = 0;
            }
          }

          // Rule: Price < SMA-20 (only when previous day was above = support crossing)
          const currentBelowSma20 = pt.sma20 && pt.price < pt.sma20;
          const prevWasAboveSma20 = wasAboveSma20Map.get(pt.date) ?? true;
          if (useSma20Rule && currentBelowSma20 && prevWasAboveSma20) {
            multiplier += (sma20Multiplier - 1);
            reasons.push(`📉 SMA20↓ x${sma20Multiplier}`);
          }

          // Rule: Price < SMA-50 (only when previous day was above = support crossing)
          const currentBelowSma50 = pt.sma50 && pt.price < pt.sma50;
          const prevWasAboveSma50 = wasAboveSma50Map.get(pt.date) ?? true;
          if (useSma50Rule && currentBelowSma50 && prevWasAboveSma50) {
            multiplier += (sma50Multiplier - 1);
            reasons.push(`📉 SMA50↓ x${sma50Multiplier}`);
          }

          // Rule: Price < SMA-100 (only when previous day was above = support crossing)
          const currentBelowSma100 = pt.sma100 && pt.price < pt.sma100;
          const prevWasAboveSma100 = wasAboveSma100Map.get(pt.date) ?? true;
          if (useSmaRule && currentBelowSma100 && prevWasAboveSma100) {
            multiplier += (sma100Multiplier - 1);
            reasons.push(`📉 SMA100↓ x${sma100Multiplier}`);
          }

          // Rule: Price < SMA-200 (only when previous day was above = support crossing)
          const currentBelowSma200 = pt.sma200 && pt.price < pt.sma200;
          const prevWasAboveSma200 = wasAboveSma200Map.get(pt.date) ?? true;
          if (useSma200Rule && currentBelowSma200 && prevWasAboveSma200) {
            multiplier += (sma200Multiplier - 1);
            reasons.push(`📉 SMA200↓ x${sma200Multiplier}`);
          }

          // Rule: VIX > threshold (use max VIX since previous DCA date to catch spikes)
          const maxVixSincePrev = maxVixSincePrevDcaMap.get(pt.date) || pt.vix || 0;
          if (useVixRule && maxVixSincePrev > vixThreshold) {
            multiplier += (vixMultiplier - 1);
            reasons.push(`🔥 VIX>${vixThreshold} (max:${maxVixSincePrev.toFixed(0)}) x${vixMultiplier}`);
          }

          const finalAmount = amount * multiplier;
          const sharesBought = finalAmount / pt.price;

          // Track budget debt for balancing
          const extraSpent = finalAmount - baseAmount;
          if (extraSpent > 0) {
            budgetDebt += extraSpent;
          }

          totalShares += sharesBought;
          totalInvested += finalAmount;

          txs.push({
            date: pt.date,
            price: pt.price,
            investedAmount: finalAmount,
            sharesBought,
            accumulatedShares: totalShares,
            portfolioValue: totalShares * pt.price,
            multiplierApplied: multiplier,
            reason: reasons.join(', ')
          });
        });
      }

      if (txs.length === 0) {
        throw new Error('Aucune transaction générée');
      }

      setTransactions(txs);

      // Calculate all metrics
      const lastTx = txs[txs.length - 1];
      const totalInvested = txs.reduce((sum, t) => sum + t.investedAmount, 0);
      const currentValue = lastTx.portfolioValue;
      const profit = currentValue - totalInvested;
      const profitPct = (profit / totalInvested) * 100;

      // Years for CAGR
      const startTime = new Date(txs[0].date).getTime();
      const endTime = new Date(lastTx.date).getTime();
      const years = (endTime - startTime) / (1000 * 60 * 60 * 24 * 365.25);

      const cagr = calculateCAGR(totalInvested, currentValue, years);

      // XIRR
      const cashFlows = buildCashFlowsFromTransactions(txs, currentValue);
      const xirr = calculateXIRR(cashFlows);

      // Portfolio values for drawdown and volatility
      const portfolioValues = txs.map(t => ({ date: t.date, value: t.portfolioValue }));
      const ddResult = calculateMaxDrawdown(portfolioValues);
      setDrawdownData(ddResult.drawdownSeries);

      // Volatility & Sharpe from portfolio values
      const valueArray = portfolioValues.map(p => p.value);
      const volatility = calculateVolatility(valueArray);
      const sharpe = calculateSharpeFromPrices(valueArray, 2);

      // Avg price & best/worst months
      const avgPrice = calculateAveragePurchasePrice(txs);
      const { best, worst } = calculateBestWorstMonths(txs);

      setSummary({
        totalInvested,
        currentValue,
        profitPercent: profitPct,
        cagr,
        shares: lastTx.accumulatedShares,
        xirr,
        sharpeRatio: sharpe,
        maxDrawdown: ddResult.maxDrawdown,
        maxDrawdownPeakDate: ddResult.maxDrawdownPeakDate,
        maxDrawdownTroughDate: ddResult.maxDrawdownTroughDate,
        volatility,
        avgBuyPrice: avgPrice,
        bestMonth: best,
        worstMonth: worst,
        dataSource: usePortfolio ? 'yahoo' : 'yahoo'
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Backend Status */}
      {backendStatus === 'offline' && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
          ⚠️ Backend non connecté. Lancez: <code className="bg-red-900/50 px-2 py-1 rounded">cd backend && npm start</code>
        </div>
      )}

      {/* Controls */}
      <div className="bg-[#1E1E2E] p-6 rounded-xl border border-gray-700 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-400 uppercase font-bold mb-1">Ticker</label>
            <select
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className="w-full bg-[#0F0F23] text-white border border-gray-600 rounded p-2 focus:border-blue-500 outline-none font-mono"
            >
              {/* Crypto */}
              <optgroup label="🪙 Crypto">
                <option value="BTC-USD">Bitcoin (BTC)</option>
                <option value="ETH-USD">Ethereum (ETH)</option>
                <option value="SOL-USD">Solana (SOL)</option>
                <option value="TAO-USD">Bittensor (TAO)</option>
                <option value="SUI-USD">Sui (SUI)</option>
                <option value="ONDO-USD">Ondo (ONDO)</option>
                <option value="LINK-USD">Chainlink (LINK)</option>
                <option value="AAVE-USD">Aave (AAVE)</option>
                <option value="RNDR-USD">Render (RNDR)</option>
              </optgroup>

              {/* ETF S&P500 */}
              <optgroup label="📊 ETF S&P500">
                <option value="ESE.PA">BNP S&P 500 (ESE.PA)</option>
                <option value="SPY">S&P 500 (SPY)</option>
                <option value="VOO">Vanguard S&P 500 (VOO)</option>
                <option value="RSP">Equal Weight S&P (RSP)</option>
                <option value="SPMO">S&P Momentum (SPMO)</option>
                <option value="SPHQ">S&P Quality (SPHQ)</option>
                <option value="SPVM">S&P Value Momentum (SPVM)</option>
                <option value="SPHD">S&P High Dividend (SPHD)</option>
              </optgroup>

              {/* ETF World */}
              <optgroup label="🌍 ETF World">
                <option value="CW8.PA">MSCI World (CW8.PA)</option>
                <option value="XDEQ.DE">Xtrackers MSCI World (XDEQ)</option>
                <option value="WPEA.L">iShares World ESG (WPEA)</option>
                <option value="VTI">Total US Market (VTI)</option>
                <option value="QQQ">Nasdaq 100 (QQQ)</option>
                <option value="PAEEM.PA">Amundi EM (PAEEM)</option>
                <option value="PAASI.PA">Amundi Asia (PAASI)</option>
              </optgroup>

              {/* ETF Sectoriel */}
              <optgroup label="🏭 ETF Sectoriel">
                <option value="SMH">VanEck Semiconductors (SMH)</option>
                <option value="ARKK">ARK Innovation (ARKK)</option>
                <option value="XLK">Tech Select SPDR (XLK)</option>
                <option value="NUKL">Range Nuclear (NUKL)</option>
                <option value="GLUX">Amundi Luxury (GLUX)</option>
              </optgroup>

              {/* Crypto ETF */}
              <optgroup label="₿ Crypto ETF">
                <option value="IBIT">iShares Bitcoin (IBIT)</option>
                <option value="HODL">VanEck Bitcoin (HODL)</option>
                <option value="CBTC.DE">Bitcoin ETC (CBTC-EUR)</option>
              </optgroup>

              {/* REITs */}
              <optgroup label="🏢 REITs">
                <option value="VNQ">Vanguard Real Estate (VNQ)</option>
                <option value="IYR">iShares US Real Estate (IYR)</option>
                <option value="SCHH">Schwab US REIT (SCHH)</option>
              </optgroup>

              {/* Bonds */}
              <optgroup label="💵 Bonds & Commodities">
                <option value="SHY">iShares 1-3 Year Treasury (SHY)</option>
                <option value="GDX">VanEck Gold Miners (GDX)</option>
                <option value="IWM">iShares Russell 2000 (IWM)</option>
                <option value="PPH">VanEck Pharma (PPH)</option>
                <option value="NLR">VanEck Uranium (NLR)</option>
              </optgroup>

              {/* Actions Tier 1 */}
              <optgroup label="🏆 Actions Tier 1">
                <option value="NVDA">Nvidia (NVDA)</option>
                <option value="MSFT">Microsoft (MSFT)</option>
                <option value="GOOGL">Alphabet (GOOGL)</option>
                <option value="AMZN">Amazon (AMZN)</option>
                <option value="MA">Mastercard (MA)</option>
                <option value="ASML">ASML (ASML)</option>
                <option value="RMS.PA">Hermès (RMS.PA)</option>
                <option value="AMAT">Applied Materials (AMAT)</option>
                <option value="FTNT">Fortinet (FTNT)</option>
              </optgroup>

              {/* Actions Tier 2 */}
              <optgroup label="⭐ Actions Tier 2">
                <option value="ZTS">Zoetis (ZTS)</option>
                <option value="SPGI">S&P Global (SPGI)</option>
                <option value="MSCI">MSCI Inc (MSCI)</option>
                <option value="V">Visa (V)</option>
                <option value="META">Meta (META)</option>
                <option value="ANET">Arista Networks (ANET)</option>
                <option value="TSM">TSMC (TSM)</option>
                <option value="MC.PA">LVMH (MC.PA)</option>
                <option value="BLK">BlackRock (BLK)</option>
                <option value="IDXX">IDEXX Labs (IDXX)</option>
              </optgroup>

              {/* Actions Tier 3 */}
              <optgroup label="📈 Actions Tier 3">
                <option value="NOVO-B.CO">Novo Nordisk (NOVO-B)</option>
                <option value="ADBE">Adobe (ADBE)</option>
                <option value="MANH">Manhattan Associates (MANH)</option>
                <option value="POOL">Pool Corp (POOL)</option>
                <option value="CPRT">Copart (CPRT)</option>
                <option value="PANW">Palo Alto Networks (PANW)</option>
                <option value="MCO">Moody's (MCO)</option>
                <option value="FICO">FICO (FICO)</option>
                <option value="BKNG">Booking (BKNG)</option>
                <option value="IBKR">Interactive Brokers (IBKR)</option>
                <option value="AVGO">Broadcom (AVGO)</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase font-bold mb-1">Date de début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[#0F0F23] text-white border border-gray-600 rounded p-2 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase font-bold mb-1">Montant (€)</label>
            <input
              type="number"
              value={baseAmount}
              onChange={(e) => setBaseAmount(Number(e.target.value))}
              className="w-full bg-[#0F0F23] text-white border border-gray-600 rounded p-2 outline-none"
              disabled={usePortfolio}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase font-bold mb-1">Fréquence</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as DcaFrequency)}
              className="w-full bg-[#0F0F23] text-white border border-gray-600 rounded p-2 outline-none"
              disabled={usePortfolio}
            >
              <option value="daily">Quotidien</option>
              <option value="weekly">Hebdomadaire</option>
              <option value="monthly">Mensuel</option>
              <option value="quarterly">Trimestriel</option>
            </select>
          </div>
        </div>

        {/* Portfolio Toggle */}
        {portfolioTxs.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-3 cursor-pointer">
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${usePortfolio ? 'bg-emerald-600 border-emerald-600' : 'border-gray-500'}`}>
                  {usePortfolio && <span className="text-white text-xs">✓</span>}
                </div>
                <input type="checkbox" checked={usePortfolio} onChange={() => setUsePortfolio(!usePortfolio)} className="hidden" />
                <span className="text-gray-300">
                  Utiliser mes {portfolioTxs.length} transactions du portefeuille
                  <span className="text-emerald-400 ml-2">
                    ({portfolioTxs.reduce((s, t) => s + t.invested_amount, 0).toFixed(0)}€ investis)
                  </span>
                </span>
              </label>
              {usePortfolio && (
                <button
                  onClick={() => setShowPortfolioEditor(!showPortfolioEditor)}
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  {showPortfolioEditor ? '✕ Fermer' : '✏️ Modifier'}
                </button>
              )}
            </div>

            {/* Portfolio Editor Table */}
            {showPortfolioEditor && (
              <div className="mt-4 bg-[#0F0F23] rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50 text-xs uppercase text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Quantité</th>
                      <th className="px-3 py-2 text-left">Prix unitaire</th>
                      <th className="px-3 py-2 text-left">Frais</th>
                      <th className="px-3 py-2 text-left">Total</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {portfolioTxs.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-800/30">
                        <td className="px-3 py-2 text-gray-400 font-mono text-xs">{tx.date.split(' ')[0]}</td>
                        {editingTxId === tx.id ? (
                          <>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                value={editForm.quantity}
                                onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                                className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={editForm.unit_price}
                                onChange={(e) => setEditForm({ ...editForm, unit_price: Number(e.target.value) })}
                                className="w-20 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={editForm.fees}
                                onChange={(e) => setEditForm({ ...editForm, fees: Number(e.target.value) })}
                                className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
                              />
                            </td>
                            <td className="px-3 py-2 text-gray-400">
                              €{(editForm.quantity * editForm.unit_price + editForm.fees).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 flex gap-2">
                              <button
                                onClick={() => handleUpdateTransaction(tx.id)}
                                className="text-emerald-400 hover:text-emerald-300"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => setEditingTxId(null)}
                                className="text-red-400 hover:text-red-300"
                              >
                                ✕
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-white">{tx.quantity}</td>
                            <td className="px-3 py-2 text-white">€{tx.price.toFixed(2)}</td>
                            <td className="px-3 py-2 text-gray-400">€{tx.fees.toFixed(2)}</td>
                            <td className="px-3 py-2 text-emerald-400 font-medium">€{tx.invested_amount.toFixed(2)}</td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => startEditing(tx)}
                                className="text-blue-400 hover:text-blue-300"
                              >
                                ✏️
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Smart DCA Rules */}
        {!usePortfolio && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-blue-400">⚡ Smart DCA Rules</p>

              {/* DCA Strict Toggle */}
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${useDcaStrict ? 'bg-gray-600 border-gray-600' : 'border-gray-500'}`}>
                  {useDcaStrict && <span className="text-white text-xs">✓</span>}
                </div>
                <input type="checkbox" checked={useDcaStrict} onChange={() => setUseDcaStrict(!useDcaStrict)} className="hidden" />
                <span className="text-gray-300 text-sm">DCA Strict (x1 fixe)</span>
              </label>
            </div>

            {/* Timeframe Selector */}
            <div className="mb-3 flex items-center gap-3">
              <span className="text-xs text-gray-400 uppercase">Timeframe indicateurs:</span>
              <div className="flex gap-2">
                {(['daily', 'weekly', 'monthly'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setIndicatorTimeframe(tf)}
                    className={`px-3 py-1 text-xs rounded-full transition ${indicatorTimeframe === tf
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                  >
                    {tf === 'daily' ? 'Jour' : tf === 'weekly' ? 'Semaine' : 'Mois'}
                  </button>
                ))}
              </div>
            </div>

            <div className={`grid grid-cols-2 md:grid-cols-5 gap-3 ${useDcaStrict ? 'opacity-40 pointer-events-none' : ''}`}>
              {/* SMA-20 Rule */}
              <label className="flex items-center space-x-2 cursor-pointer select-none group bg-gray-800/30 rounded-lg p-2">
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${useSma20Rule ? 'bg-cyan-600 border-cyan-600' : 'border-gray-500'}`}>
                  {useSma20Rule && <span className="text-white text-xs">✓</span>}
                </div>
                <input type="checkbox" checked={useSma20Rule} onChange={() => setUseSma20Rule(!useSma20Rule)} className="hidden" />
                <span className="text-gray-300 text-sm group-hover:text-white transition">Prix &lt; SMA20</span>
              </label>

              {/* SMA-50 Rule */}
              <label className="flex items-center space-x-2 cursor-pointer select-none group bg-gray-800/30 rounded-lg p-2">
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${useSma50Rule ? 'bg-green-600 border-green-600' : 'border-gray-500'}`}>
                  {useSma50Rule && <span className="text-white text-xs">✓</span>}
                </div>
                <input type="checkbox" checked={useSma50Rule} onChange={() => setUseSma50Rule(!useSma50Rule)} className="hidden" />
                <span className="text-gray-300 text-sm group-hover:text-white transition">Prix &lt; SMA50</span>
              </label>

              {/* SMA-100 Rule */}
              <label className="flex items-center space-x-2 cursor-pointer select-none group bg-gray-800/30 rounded-lg p-2">
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${useSmaRule ? 'bg-blue-600 border-blue-600' : 'border-gray-500'}`}>
                  {useSmaRule && <span className="text-white text-xs">✓</span>}
                </div>
                <input type="checkbox" checked={useSmaRule} onChange={() => setUseSmaRule(!useSmaRule)} className="hidden" />
                <span className="text-gray-300 text-sm group-hover:text-white transition">Prix &lt; SMA100</span>
              </label>

              {/* SMA-200 Rule */}
              <label className="flex items-center space-x-2 cursor-pointer select-none group bg-gray-800/30 rounded-lg p-2">
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${useSma200Rule ? 'bg-purple-600 border-purple-600' : 'border-gray-500'}`}>
                  {useSma200Rule && <span className="text-white text-xs">✓</span>}
                </div>
                <input type="checkbox" checked={useSma200Rule} onChange={() => setUseSma200Rule(!useSma200Rule)} className="hidden" />
                <span className="text-gray-300 text-sm group-hover:text-white transition">Prix &lt; SMA200</span>
              </label>

              {/* RSI Accumulation Rule */}
              <label className="flex items-center space-x-2 cursor-pointer select-none group bg-gray-800/30 rounded-lg p-2">
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${useRsiRule ? 'bg-amber-600 border-amber-600' : 'border-gray-500'}`}>
                  {useRsiRule && <span className="text-white text-xs">✓</span>}
                </div>
                <input type="checkbox" checked={useRsiRule} onChange={() => setUseRsiRule(!useRsiRule)} className="hidden" />
                <span className="text-gray-300 text-sm group-hover:text-white transition">RSI Accum.</span>
              </label>

              {/* VIX Rule */}
              <label className="flex items-center space-x-2 cursor-pointer select-none group bg-gray-800/30 rounded-lg p-2">
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${useVixRule ? 'bg-red-600 border-red-600' : 'border-gray-500'}`}>
                  {useVixRule && <span className="text-white text-xs">✓</span>}
                </div>
                <input type="checkbox" checked={useVixRule} onChange={() => setUseVixRule(!useVixRule)} className="hidden" />
                <span className="text-gray-300 text-sm group-hover:text-white transition">VIX &gt; 40</span>
              </label>

              {/* Sell in May */}
              <label className="flex items-center space-x-2 cursor-pointer select-none group bg-gray-800/30 rounded-lg p-2">
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${useSellInMay ? 'bg-green-600 border-green-600' : 'border-gray-500'}`}>
                  {useSellInMay && <span className="text-white text-xs">✓</span>}
                </div>
                <input type="checkbox" checked={useSellInMay} onChange={() => setUseSellInMay(!useSellInMay)} className="hidden" />
                <span className="text-gray-300 text-sm group-hover:text-white transition">Sell in May</span>
              </label>
            </div>

            {/* Multiplier Sliders */}
            <div className={`mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 ${useDcaStrict ? 'opacity-40 pointer-events-none' : ''}`}>
              {/* SMA-20 Multiplier */}
              {useSma20Rule && (
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 uppercase">Levier SMA20</span>
                    <span className="text-cyan-400 font-bold">x{sma20Multiplier}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="0.5"
                    value={sma20Multiplier}
                    onChange={(e) => setSma20Multiplier(Number(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>x1</span>
                    <span>x6</span>
                    <span>x12</span>
                  </div>
                </div>
              )}

              {/* SMA-50 Multiplier */}
              {useSma50Rule && (
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 uppercase">Levier SMA50</span>
                    <span className="text-green-400 font-bold">x{sma50Multiplier}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="0.5"
                    value={sma50Multiplier}
                    onChange={(e) => setSma50Multiplier(Number(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>x1</span>
                    <span>x6</span>
                    <span>x12</span>
                  </div>
                </div>
              )}

              {/* SMA-100 Multiplier */}
              {useSmaRule && (
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 uppercase">Levier SMA100</span>
                    <span className="text-blue-400 font-bold">x{sma100Multiplier}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="0.5"
                    value={sma100Multiplier}
                    onChange={(e) => setSma100Multiplier(Number(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>x1</span>
                    <span>x6</span>
                    <span>x12</span>
                  </div>
                </div>
              )}

              {/* SMA-200 Multiplier */}
              {useSma200Rule && (
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 uppercase">Levier SMA200</span>
                    <span className="text-purple-400 font-bold">x{sma200Multiplier}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="0.5"
                    value={sma200Multiplier}
                    onChange={(e) => setSma200Multiplier(Number(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>x1</span>
                    <span>x6</span>
                    <span>x12</span>
                  </div>
                </div>
              )}

              {/* VIX Multiplier */}
              {useVixRule && (
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 uppercase">Levier VIX</span>
                    <span className="text-red-400 font-bold">x{vixMultiplier}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="0.5"
                    value={vixMultiplier}
                    onChange={(e) => setVixMultiplier(Number(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>x1</span>
                    <span>x6</span>
                    <span>x12</span>
                  </div>
                </div>
              )}

              {/* VIX Threshold */}
              {useVixRule && (
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 uppercase">Seuil VIX</span>
                    <span className="text-orange-400 font-bold">{vixThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="60"
                    step="5"
                    value={vixThreshold}
                    onChange={(e) => setVixThreshold(Number(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>20</span>
                    <span>40</span>
                    <span>60</span>
                  </div>
                </div>
              )}
            </div>

            {/* RSI Explanation */}
            {useRsiRule && !useDcaStrict && (
              <div className="mt-3 bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 text-sm text-amber-200">
                <strong>📊 RSI Accumulation:</strong> RSI &gt; 70 → Skip & save | RSI &lt; 30 → Deploy saved cash
              </div>
            )}

            {/* Sell in May Explanation */}
            {useSellInMay && !useDcaStrict && (
              <div className="mt-3 bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-sm text-green-200">
                <strong>🌴 Sell in May:</strong> Skip mai-août, redistribue l'épargne de sept à avril
              </div>
            )}
          </div>
        )}

        {/* Run Button */}
        <div className="mt-6">
          <button
            onClick={runBacktest}
            disabled={isLoading || backendStatus === 'offline'}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg shadow-lg transform active:scale-95 transition-all"
          >
            {isLoading ? '⏳ Chargement des données...' : '🚀 ANALYSER'}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* Results Section */}
      {summary && transactions.length > 0 && (
        <div className="space-y-6">
          {/* KPIs Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Total Investi" value={`€${summary.totalInvested.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}`} />
            <KpiCard
              label="Valeur Actuelle"
              value={`€${summary.currentValue.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}`}
              color={summary.profitPercent >= 0 ? 'emerald' : 'red'}
            />
            <KpiCard
              label="Rendement Total"
              value={`${summary.profitPercent >= 0 ? '+' : ''}${summary.profitPercent.toFixed(1)}%`}
              color={summary.profitPercent >= 0 ? 'emerald' : 'red'}
            />
            <KpiCard label="CAGR" value={`${summary.cagr.toFixed(1)}%`} color="blue" tooltip="Taux de croissance annuel composé" />
          </div>

          {/* Advanced KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="XIRR"
              value={`${summary.xirr.toFixed(1)}%`}
              color="purple"
              tooltip="Taux de rendement interne étendu (flux irréguliers)"
            />
            <KpiCard
              label="Sharpe Ratio"
              value={summary.sharpeRatio.toFixed(2)}
              color={summary.sharpeRatio > 1 ? 'emerald' : summary.sharpeRatio > 0 ? 'amber' : 'red'}
              tooltip="Rendement ajusté au risque (>1 = bon)"
            />
            <KpiCard
              label="Max Drawdown"
              value={`-${summary.maxDrawdown.toFixed(1)}%`}
              color="red"
              tooltip={`Pic: ${summary.maxDrawdownPeakDate} → Creux: ${summary.maxDrawdownTroughDate}`}
            />
            <KpiCard
              label="Volatilité"
              value={`${summary.volatility.toFixed(1)}%`}
              color="amber"
              tooltip="Volatilité annualisée (σ × √252)"
            />
          </div>

          {/* Price Chart with SMA-100 & SMA-200 */}
          <div className="bg-[#1E1E2E] p-6 rounded-xl border border-gray-700 shadow-xl h-[400px]">
            <h3 className="text-white font-semibold mb-4">📈 Prix, SMA-100 & SMA-200</h3>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={marketData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  stroke="#9CA3AF"
                  fontSize={11}
                  tickFormatter={(val) => new Date(val).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
                  minTickGap={50}
                />
                <YAxis stroke="#9CA3AF" fontSize={11} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                  formatter={(value: number, name: string) => [
                    `€${value.toFixed(2)}`,
                    name === 'price' ? 'Prix' : name === 'sma100' ? 'SMA-100' : 'SMA-200'
                  ]}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('fr-FR')}
                />
                <Legend />
                {/* VIX > threshold vertical reference lines - one per month, thinner */}
                {(() => {
                  const seenMonths = new Set<string>();
                  return marketData
                    .filter(pt => pt.vix && pt.vix > vixThreshold)
                    .filter(pt => {
                      const month = pt.date.substring(0, 7);
                      if (seenMonths.has(month)) return false;
                      seenMonths.add(month);
                      return true;
                    })
                    .map((pt, idx) => (
                      <ReferenceLine
                        key={`vix-${idx}`}
                        x={pt.date}
                        stroke="#EF4444"
                        strokeDasharray="2 3"
                        strokeWidth={0.8}
                        strokeOpacity={0.7}
                      />
                    ));
                })()}
                <Line type="monotone" dataKey="price" name="Prix" stroke="#3B82F6" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="sma20" name="SMA-20" stroke="#06B6D4" dot={false} strokeWidth={1} strokeDasharray="2 2" />
                <Line type="monotone" dataKey="sma50" name="SMA-50" stroke="#22C55E" dot={false} strokeWidth={1} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="sma100" name="SMA-100" stroke="#F59E0B" dot={false} strokeWidth={1.5} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="sma200" name="SMA-200" stroke="#A855F7" dot={false} strokeWidth={1.5} strokeDasharray="3 3" />

                {/* Smart Rule Trigger Markers - SMA20 (cyan) */}
                {useSma20Rule && transactions
                  .filter(tx => tx.reason?.includes('SMA20'))
                  .map((tx, idx) => {
                    const pt = marketData.find(m => m.date === tx.date);
                    return pt ? (
                      <ReferenceDot
                        key={`sma20-${idx}`}
                        x={tx.date}
                        y={pt.price}
                        r={5}
                        fill="#06B6D4"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ) : null;
                  })}

                {/* Smart Rule Trigger Markers - SMA50 (green) */}
                {useSma50Rule && transactions
                  .filter(tx => tx.reason?.includes('SMA50'))
                  .map((tx, idx) => {
                    const pt = marketData.find(m => m.date === tx.date);
                    return pt ? (
                      <ReferenceDot
                        key={`sma50-${idx}`}
                        x={tx.date}
                        y={pt.price}
                        r={5}
                        fill="#22C55E"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ) : null;
                  })}

                {/* Smart Rule Trigger Markers - SMA100 (blue) */}
                {useSmaRule && transactions
                  .filter(tx => tx.reason?.includes('SMA100'))
                  .map((tx, idx) => {
                    const pt = marketData.find(m => m.date === tx.date);
                    return pt ? (
                      <ReferenceDot
                        key={`sma100-${idx}`}
                        x={tx.date}
                        y={pt.price}
                        r={5}
                        fill="#3B82F6"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ) : null;
                  })}

                {/* Smart Rule Trigger Markers - SMA200 (purple) */}
                {useSma200Rule && transactions
                  .filter(tx => tx.reason?.includes('SMA200'))
                  .map((tx, idx) => {
                    const pt = marketData.find(m => m.date === tx.date);
                    return pt ? (
                      <ReferenceDot
                        key={`sma200-${idx}`}
                        x={tx.date}
                        y={pt.price}
                        r={5}
                        fill="#A855F7"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ) : null;
                  })}

                {/* Smart Rule Trigger Markers - VIX (red) */}
                {useVixRule && transactions
                  .filter(tx => tx.reason?.includes('VIX'))
                  .map((tx, idx) => {
                    const pt = marketData.find(m => m.date === tx.date);
                    return pt ? (
                      <ReferenceDot
                        key={`vix-trigger-${idx}`}
                        x={tx.date}
                        y={pt.price}
                        r={5}
                        fill="#EF4444"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ) : null;
                  })}

                {/* Zoom Brush */}
                <Brush
                  dataKey="date"
                  height={30}
                  stroke="#3B82F6"
                  fill="#1E1E2E"
                  tickFormatter={(val) => new Date(val).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Portfolio Growth */}
          <div className="bg-[#1E1E2E] p-6 rounded-xl border border-gray-700 shadow-xl h-[350px]">
            <h3 className="text-white font-semibold mb-4">💰 Croissance du Portefeuille</h3>
            <ResponsiveContainer width="100%" height="90%">
              <AreaChart data={transactions.map((t, i) => ({
                ...t,
                costBasis: transactions.slice(0, i + 1).reduce((s, x) => s + x.investedAmount, 0)
              }))}>
                <defs>
                  <linearGradient id="colorPortfolio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9CA3AF" fontSize={11} minTickGap={50} />
                <YAxis stroke="#9CA3AF" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                  formatter={(value: number) => [`€${Math.round(value).toLocaleString()}`, '']}
                />
                <Legend />
                <Area type="monotone" dataKey="portfolioValue" name="Valeur" stroke="#10B981" fill="url(#colorPortfolio)" />
                <Area type="monotone" dataKey="costBasis" name="Investi" stroke="#3B82F6" fill="none" strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Drawdown Chart */}
          <div className="bg-[#1E1E2E] p-6 rounded-xl border border-gray-700 shadow-xl h-[250px]">
            <h3 className="text-white font-semibold mb-4">📉 Drawdown (Pertes Temporaires)</h3>
            <ResponsiveContainer width="100%" height="85%">
              <AreaChart data={drawdownData}>
                <defs>
                  <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} minTickGap={50} />
                <YAxis stroke="#9CA3AF" fontSize={10} tickFormatter={(v) => `-${v.toFixed(0)}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                  formatter={(value: number) => [`-${value.toFixed(1)}%`, 'Drawdown']}
                />
                <Area type="monotone" dataKey="drawdown" stroke="#EF4444" fill="url(#colorDrawdown)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Full Transaction History with Smart DCA Indicators */}
          <div className="bg-[#1E1E2E] rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-white font-semibold">📊 Historique Complet des Transactions</h3>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500/30 rounded"></span> SMA</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500/30 rounded"></span> RSI</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500/30 rounded"></span> VIX</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-600/30 rounded"></span> Skip</span>
                <span className="text-gray-400">{transactions.length} tx</span>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-[#0F0F23] text-xs uppercase font-medium sticky top-0">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Prix</th>
                    <th className="px-4 py-3">Montant</th>
                    <th className="px-4 py-3">Parts</th>
                    <th className="px-4 py-3">Cumul</th>
                    <th className="px-4 py-3">Valeur</th>
                    <th className="px-4 py-3">Indicateurs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {transactions.map((tx, idx) => {
                    // Determine row background color based on indicator
                    let rowBg = '';
                    if (tx.reason?.includes('SMA100') || tx.reason?.includes('SMA200')) {
                      rowBg = 'bg-blue-500/10';
                    }
                    if (tx.reason?.includes('RSI')) {
                      rowBg = tx.reason.includes('⏸️') ? 'bg-gray-600/20' : 'bg-amber-500/10';
                    }
                    if (tx.reason?.includes('VIX')) {
                      rowBg = 'bg-red-500/10';
                    }
                    if (tx.reason?.includes('Budget équilibré')) {
                      rowBg = 'bg-gray-600/20';
                    }
                    if (tx.multiplierApplied > 1) {
                      rowBg = 'bg-emerald-500/15';
                    }

                    return (
                      <tr key={idx} className={`${rowBg} hover:bg-gray-800/50 transition`}>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{tx.date}</td>
                        <td className="px-4 py-2">€{tx.price.toFixed(2)}</td>
                        <td className={`px-4 py-2 font-medium ${tx.investedAmount === 0 ? 'text-gray-600' : tx.multiplierApplied > 1 ? 'text-emerald-400' : 'text-white'}`}>
                          {tx.investedAmount === 0 ? '—' : `€${Math.round(tx.investedAmount)}`}
                          {tx.multiplierApplied > 1 && <span className="text-emerald-500 text-xs ml-1">x{tx.multiplierApplied}</span>}
                        </td>
                        <td className="px-4 py-2">{tx.sharesBought > 0 ? tx.sharesBought.toFixed(4) : '—'}</td>
                        <td className="px-4 py-2 text-blue-400">{tx.accumulatedShares.toFixed(2)}</td>
                        <td className="px-4 py-2 text-emerald-400">€{Math.round(tx.portfolioValue).toLocaleString()}</td>
                        <td className="px-4 py-2">
                          {tx.reason && (
                            <span className={`text-xs px-2 py-1 rounded-full ${tx.reason.includes('⏸️') ? 'bg-gray-700 text-gray-400' :
                              tx.reason.includes('🚀') ? 'bg-amber-700/50 text-amber-300' :
                                tx.reason.includes('SMA') ? 'bg-blue-700/50 text-blue-300' :
                                  tx.reason.includes('VIX') ? 'bg-red-700/50 text-red-300' :
                                    'bg-gray-700 text-gray-400'
                              }`}>
                              {tx.reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================

interface KpiCardProps {
  label: string;
  value: string;
  color?: 'emerald' | 'red' | 'blue' | 'amber' | 'purple';
  tooltip?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, color = 'white', tooltip }) => {
  const colorClasses = {
    white: 'text-white',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    purple: 'text-purple-400'
  };

  return (
    <div className="bg-[#1E1E2E] p-4 rounded-xl border border-gray-700 relative group">
      <p className="text-gray-400 text-xs uppercase flex items-center gap-1">
        {label}
        {tooltip && (
          <span className="cursor-help text-gray-600 hover:text-gray-400">ⓘ</span>
        )}
      </p>
      <p className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</p>
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-gray-300 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-gray-700">
          {tooltip}
        </div>
      )}
    </div>
  );
};

export default DcaBacktester;