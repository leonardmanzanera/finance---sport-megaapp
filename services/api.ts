/**
 * API Service Layer for Market Data
 * 
 * Provides real market data from:
 * - CoinGecko (cryptocurrency) - Free, CORS-friendly
 * - Yahoo Finance (stocks/ETFs) - Via Vite proxy
 */

import { MarketDataPoint } from '../types';

// ============================================================================
// TYPES
// ============================================================================

interface CoinGeckoMarketData {
    prices: [number, number][]; // [timestamp, price]
    market_caps: [number, number][];
    total_volumes: [number, number][];
}

interface YahooQuote {
    timestamp: number[];
    indicators: {
        quote: Array<{
            close: (number | null)[];
            open: (number | null)[];
            high: (number | null)[];
            low: (number | null)[];
            volume: (number | null)[];
        }>;
    };
}

interface YahooChartResult {
    chart: {
        result: Array<{
            timestamp: number[];
            indicators: YahooQuote['indicators'];
        }>;
        error: { code: string; description: string } | null;
    };
}

// ============================================================================
// COIN MAPPING (ticker -> CoinGecko ID)
// ============================================================================

const COIN_ID_MAP: Record<string, string> = {
    'BTC': 'bitcoin',
    'BTC-USD': 'bitcoin',
    'ETH': 'ethereum',
    'ETH-USD': 'ethereum',
    'SOL': 'solana',
    'SOL-USD': 'solana',
    'ADA': 'cardano',
    'ADA-USD': 'cardano',
    'DOT': 'polkadot',
    'DOT-USD': 'polkadot',
    'AVAX': 'avalanche-2',
    'AVAX-USD': 'avalanche-2',
    'MATIC': 'matic-network',
    'MATIC-USD': 'matic-network',
    'LINK': 'chainlink',
    'LINK-USD': 'chainlink',
    'XRP': 'ripple',
    'XRP-USD': 'ripple',
    'DOGE': 'dogecoin',
    'DOGE-USD': 'dogecoin',
};

// Known stock/ETF tickers
const STOCK_TICKERS = new Set([
    'SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'META', 'NVDA',
    'VOO', 'VTI', 'IVV', 'VEA', 'VWO', 'BND', 'AGG', 'GLD', 'SLV',
    'JPM', 'BAC', 'WMT', 'JNJ', 'PG', 'UNH', 'V', 'MA', 'HD', 'DIS',
]);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Determines if the ticker is a cryptocurrency
 */
export const isCryptoTicker = (ticker: string): boolean => {
    const normalized = ticker.toUpperCase().replace('-USD', '');
    return COIN_ID_MAP.hasOwnProperty(ticker.toUpperCase()) ||
        COIN_ID_MAP.hasOwnProperty(normalized);
};

/**
 * Get CoinGecko ID from ticker
 */
const getCoinGeckoId = (ticker: string): string => {
    const upper = ticker.toUpperCase();
    if (COIN_ID_MAP[upper]) return COIN_ID_MAP[upper];
    const base = upper.replace('-USD', '');
    if (COIN_ID_MAP[base]) return COIN_ID_MAP[base];
    // Fallback: try ticker as-is (lowercase for CoinGecko)
    return ticker.toLowerCase();
};

/**
 * Convert date to Unix timestamp (seconds)
 */
const dateToUnix = (date: Date): number => Math.floor(date.getTime() / 1000);

/**
 * Format timestamp to YYYY-MM-DD
 */
const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
};

// ============================================================================
// COINGECKO API (Crypto)
// ============================================================================

/**
 * Fetch cryptocurrency historical data from CoinGecko
 * Free tier: ~10-30 requests/minute
 */
export const fetchCryptoHistory = async (
    ticker: string,
    startDate: string,
    endDate?: string
): Promise<MarketDataPoint[]> => {
    const coinId = getCoinGeckoId(ticker);
    const fromTimestamp = dateToUnix(new Date(startDate));
    const toTimestamp = endDate ? dateToUnix(new Date(endDate)) : dateToUnix(new Date());

    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?vs_currency=usd&from=${fromTimestamp}&to=${toTimestamp}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
        }

        const data: CoinGeckoMarketData = await response.json();

        if (!data.prices || data.prices.length === 0) {
            throw new Error(`No price data found for ${ticker}`);
        }

        // Convert to MarketDataPoint format
        // CoinGecko returns multiple data points per day for short ranges
        // We need to deduplicate to daily data
        const dailyMap = new Map<string, number>();

        for (const [timestamp, price] of data.prices) {
            const dateStr = formatDate(timestamp);
            // Keep the last price of each day
            dailyMap.set(dateStr, price);
        }

        const marketData: MarketDataPoint[] = [];
        const sortedDates = Array.from(dailyMap.keys()).sort();

        for (const dateStr of sortedDates) {
            marketData.push({
                date: dateStr,
                price: dailyMap.get(dateStr)!,
                sma100: 0, // Will be calculated later
                vix: undefined, // VIX not available for crypto directly
            });
        }

        return marketData;
    } catch (error) {
        console.error('CoinGecko fetch error:', error);
        throw error;
    }
};

// ============================================================================
// YAHOO FINANCE API (Stocks/ETFs) - Via Vite Proxy
// ============================================================================

/**
 * Fetch stock/ETF historical data from Yahoo Finance
 * Uses Vite proxy to bypass CORS
 */
export const fetchStockHistory = async (
    ticker: string,
    startDate: string,
    endDate?: string
): Promise<MarketDataPoint[]> => {
    const period1 = dateToUnix(new Date(startDate));
    const period2 = endDate ? dateToUnix(new Date(endDate)) : dateToUnix(new Date());

    // Use Vite proxy (configured in vite.config.ts)
    const url = `/api/yahoo/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Yahoo Finance API error: ${response.status} ${response.statusText}`);
        }

        const data: YahooChartResult = await response.json();

        if (data.chart.error) {
            throw new Error(`Yahoo Finance: ${data.chart.error.description}`);
        }

        const result = data.chart.result?.[0];
        if (!result || !result.timestamp) {
            throw new Error(`No data found for ticker ${ticker}`);
        }

        const { timestamp } = result;
        const quotes = result.indicators.quote[0];

        const marketData: MarketDataPoint[] = [];

        for (let i = 0; i < timestamp.length; i++) {
            const closePrice = quotes.close[i];
            if (closePrice !== null && closePrice !== undefined) {
                marketData.push({
                    date: formatDate(timestamp[i] * 1000),
                    price: closePrice,
                    sma100: 0,
                    vix: undefined,
                });
            }
        }

        return marketData;
    } catch (error) {
        console.error('Yahoo Finance fetch error:', error);
        throw error;
    }
};

// ============================================================================
// VIX DATA (Fear & Greed approximation)
// ============================================================================

/**
 * Fetch VIX (^VIX) historical data
 * Used for Smart DCA rules
 */
export const fetchVixHistory = async (
    startDate: string,
    endDate?: string
): Promise<Map<string, number>> => {
    try {
        const data = await fetchStockHistory('^VIX', startDate, endDate);
        const vixMap = new Map<string, number>();

        for (const point of data) {
            vixMap.set(point.date, point.price);
        }

        return vixMap;
    } catch (error) {
        console.warn('VIX data not available, using fallback values');
        // Return empty map - will use fallback in main logic
        return new Map();
    }
};

// ============================================================================
// MAIN FETCH FUNCTION
// ============================================================================

export interface FetchMarketDataResult {
    marketData: MarketDataPoint[];
    ticker: string;
    source: 'coingecko' | 'yahoo';
    startDate: string;
    endDate: string;
}

/**
 * Main function to fetch market data
 * Automatically detects crypto vs stock and uses appropriate API
 */
export const fetchMarketData = async (
    ticker: string,
    startDate: string,
    endDate?: string
): Promise<FetchMarketDataResult> => {
    const normalizedTicker = ticker.toUpperCase().trim();
    const actualEndDate = endDate || new Date().toISOString().split('T')[0];

    let marketData: MarketDataPoint[];
    let source: 'coingecko' | 'yahoo';

    if (isCryptoTicker(normalizedTicker)) {
        // Crypto path
        marketData = await fetchCryptoHistory(normalizedTicker, startDate, actualEndDate);
        source = 'coingecko';
    } else {
        // Stock/ETF path
        marketData = await fetchStockHistory(normalizedTicker, startDate, actualEndDate);
        source = 'yahoo';
    }

    // Calculate SMA-100 for all data points
    for (let i = 0; i < marketData.length; i++) {
        if (i < 99) {
            // Not enough data for SMA-100, use available average
            const slice = marketData.slice(0, i + 1);
            const avg = slice.reduce((sum, p) => sum + p.price, 0) / slice.length;
            marketData[i].sma100 = avg;
        } else {
            // Full SMA-100
            const slice = marketData.slice(i - 99, i + 1);
            const avg = slice.reduce((sum, p) => sum + p.price, 0) / 100;
            marketData[i].sma100 = avg;
        }
    }

    // Try to fetch and merge VIX data (only for stocks, as it's more relevant)
    if (source === 'yahoo') {
        try {
            const vixData = await fetchVixHistory(startDate, actualEndDate);
            for (const point of marketData) {
                if (vixData.has(point.date)) {
                    point.vix = vixData.get(point.date);
                }
            }
        } catch {
            // VIX data optional, continue without it
        }
    }

    return {
        marketData,
        ticker: normalizedTicker,
        source,
        startDate,
        endDate: actualEndDate,
    };
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    fetchMarketData,
    fetchCryptoHistory,
    fetchStockHistory,
    fetchVixHistory,
    isCryptoTicker,
};
