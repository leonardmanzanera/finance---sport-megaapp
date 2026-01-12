import React, { useState, useEffect } from 'react';
import { useToast } from '../../components/ui/use-toast';
import DcaControls from './components/DcaControls';
import DcaStats from './components/DcaStats';
import DcaCharts from './components/DcaCharts';
import DcaTransactions from './components/DcaTransactions';
import ExportButtons from './components/ExportButtons';
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
  const { toast } = useToast();
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
      toast({
        title: "Erreur",
        description: "Échec de la mise à jour de la transaction",
        variant: "destructive",
      });
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

          // Rule: Price < SMA-20 (Accumulate while below)
          const currentBelowSma20 = pt.sma20 && pt.price < pt.sma20;
          if (useSma20Rule && currentBelowSma20) {
            multiplier += (sma20Multiplier - 1);
            reasons.push(`📉 SMA20↓ x${sma20Multiplier}`);
          }

          // Rule: Price < SMA-50 (Accumulate while below)
          const currentBelowSma50 = pt.sma50 && pt.price < pt.sma50;
          if (useSma50Rule && currentBelowSma50) {
            multiplier += (sma50Multiplier - 1);
            reasons.push(`📉 SMA50↓ x${sma50Multiplier}`);
          }

          // Rule: Price < SMA-100 (Accumulate while below)
          const currentBelowSma100 = pt.sma100 && pt.price < pt.sma100;
          if (useSmaRule && currentBelowSma100) {
            multiplier += (sma100Multiplier - 1);
            reasons.push(`📉 SMA100↓ x${sma100Multiplier}`);
          }

          // Rule: Price < SMA-200 (Accumulate while below)
          const currentBelowSma200 = pt.sma200 && pt.price < pt.sma200;
          if (useSma200Rule && currentBelowSma200) {
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

      toast({
        title: "Backtest terminé",
        description: `Profit: ${profitPct.toFixed(2)}% | CAGR: ${cagr.toFixed(2)}%`,
        variant: profitPct >= 0 ? "default" : "destructive",
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
      toast({
        title: "Erreur du backtest",
        description: errorMessage,
        variant: "destructive",
      });
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
      <DcaControls
        ticker={ticker} setTicker={setTicker}
        startDate={startDate} setStartDate={setStartDate}
        baseAmount={baseAmount} setBaseAmount={setBaseAmount}
        frequency={frequency} setFrequency={setFrequency}
        useDcaStrict={useDcaStrict} setUseDcaStrict={setUseDcaStrict}
        useSmaRule={useSmaRule} setUseSmaRule={setUseSmaRule}
        useSma20Rule={useSma20Rule} setUseSma20Rule={setUseSma20Rule}
        useSma50Rule={useSma50Rule} setUseSma50Rule={setUseSma50Rule}
        useSma200Rule={useSma200Rule} setUseSma200Rule={setUseSma200Rule}
        useRsiRule={useRsiRule} setUseRsiRule={setUseRsiRule}
        useVixRule={useVixRule} setUseVixRule={setUseVixRule}
        useSellInMay={useSellInMay} setUseSellInMay={setUseSellInMay}
        indicatorTimeframe={indicatorTimeframe} setIndicatorTimeframe={setIndicatorTimeframe}
        sma20Multiplier={sma20Multiplier} setSma20Multiplier={setSma20Multiplier}
        sma50Multiplier={sma50Multiplier} setSma50Multiplier={setSma50Multiplier}
        sma100Multiplier={sma100Multiplier} setSma100Multiplier={setSma100Multiplier}
        sma200Multiplier={sma200Multiplier} setSma200Multiplier={setSma200Multiplier}
        vixMultiplier={vixMultiplier} setVixMultiplier={setVixMultiplier}
        vixThreshold={vixThreshold} setVixThreshold={setVixThreshold}
        usePortfolio={usePortfolio} setUsePortfolio={setUsePortfolio}
        backendStatus={backendStatus} portfolioTxsCount={portfolioTxs.length}
        runBacktest={runBacktest} isLoading={isLoading} error={error}
      />

      {/* Results Section */}
      {(isLoading || (summary && transactions.length > 0)) && (
        <div className="space-y-6">
          <DcaStats summary={summary} isLoading={isLoading} />

          {summary && !isLoading && <ExportButtons ticker={ticker} summary={summary} transactions={transactions} />}

          <DcaCharts
            marketData={marketData}
            transactions={transactions}
            drawdownData={drawdownData}
            vixThreshold={vixThreshold}
            useSmaRule={useSmaRule}
            useSma20Rule={useSma20Rule}
            useSma50Rule={useSma50Rule}
            useSma200Rule={useSma200Rule}
            useVixRule={useVixRule}
            isLoading={isLoading}
          />

          {!isLoading && <DcaTransactions transactions={transactions} />}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================



export default DcaBacktester;