/**
 * DCA Backtester Backend Server
 * 
 * Uses existing portfolio.db for transactions
 * Provides market data with Redis caching
 */

import express from 'express';
import cors from 'cors';
import { createClient } from 'redis';
import fetch from 'node-fetch';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL = 3600; // 1 hour cache

// Use existing portfolio.db from parent directory
const DB_PATH = join(__dirname, '..', 'portfolio.db');

// API endpoints
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const YAHOO_API = 'https://query1.finance.yahoo.com';

// Rate limiting for CoinGecko
const COINGECKO_DELAY = 1500;
let lastCoinGeckoRequest = 0;

// ============================================================================
// DATABASE SETUP (using existing portfolio.db)
// ============================================================================

const db = new Database(DB_PATH);
console.log(`📦 Connected to existing database: ${DB_PATH}`);

// Check existing schema
const tableInfo = db.prepare("PRAGMA table_info(transactions)").all();
console.log('📊 Table schema:', tableInfo.map(c => c.name).join(', '));

// Add ticker column if not exists (for multi-asset support)
const hasTicker = tableInfo.some(c => c.name === 'ticker');
if (!hasTicker) {
    console.log('⚠️ Adding ticker column with default value...');
    // Get default ticker from user or use placeholder
    db.exec(`
    ALTER TABLE transactions ADD COLUMN ticker TEXT DEFAULT 'UNKNOWN';
  `);
    console.log('✅ Ticker column added. Please update ticker values via /api/transactions/set-ticker');
}

// ============================================================================
// REDIS SETUP (optional - works without it)
// ============================================================================

let redis = null;
let redisAvailable = false;

async function initRedis() {
    try {
        redis = createClient({
            url: REDIS_URL,
            socket: {
                connectTimeout: 2000,
                reconnectStrategy: false // Don't reconnect
            }
        });

        redis.on('error', () => {
            // Silent - we work without cache
            redis = null;
            redisAvailable = false;
        });

        await redis.connect();
        redisAvailable = true;
        console.log('🔴 Redis connected');
    } catch {
        console.log('ℹ️  Running without Redis (optional)');
        redis = null;
        redisAvailable = false;
    }
}

async function getFromCache(key) {
    if (!redisAvailable || !redis) return null;
    try {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

async function setCache(key, data, ttl = CACHE_TTL) {
    if (!redisAvailable || !redis) return;
    try { await redis.setEx(key, ttl, JSON.stringify(data)); } catch { }
}

// ============================================================================
// EXPRESS APP
// ============================================================================

const app = express();
app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.json());

// ============================================================================
// MARKET DATA ROUTES
// ============================================================================

// Crypto data from CoinGecko
app.get('/api/crypto/:coinId', async (req, res) => {
    const { coinId } = req.params;
    const { from, to } = req.query;

    if (!from) return res.status(400).json({ error: 'Missing "from" parameter' });

    const cacheKey = `crypto:${coinId}:${from}:${to || 'now'}`;
    const cached = await getFromCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    // Rate limiting
    const wait = COINGECKO_DELAY - (Date.now() - lastCoinGeckoRequest);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCoinGeckoRequest = Date.now();

    try {
        const toTs = to || Math.floor(Date.now() / 1000);
        const url = `${COINGECKO_API}/coins/${coinId}/market_chart/range?vs_currency=usd&from=${from}&to=${toTs}`;
        const response = await fetch(url);

        if (!response.ok) throw new Error(`CoinGecko: ${response.status}`);

        const data = await response.json();
        const result = transformCoinGeckoData(data);
        await setCache(cacheKey, result);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stock data from Yahoo Finance
app.get('/api/stock/:ticker', async (req, res) => {
    const { ticker } = req.params;
    const { period1, period2, interval = '1d' } = req.query;

    if (!period1) return res.status(400).json({ error: 'Missing "period1" parameter' });

    const cacheKey = `stock:${ticker}:${period1}:${period2 || 'now'}`;
    const cached = await getFromCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    try {
        const p2 = period2 || Math.floor(Date.now() / 1000);
        const url = `${YAHOO_API}/v8/finance/chart/${ticker}?period1=${period1}&period2=${p2}&interval=${interval}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (!response.ok) throw new Error(`Yahoo: ${response.status}`);

        const data = await response.json();
        const result = transformYahooData(data);
        await setCache(cacheKey, result);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// TRANSACTION ROUTES (using existing portfolio.db schema)
// ============================================================================

// Get all transactions
app.get('/api/transactions', (req, res) => {
    try {
        const transactions = db.prepare(`
      SELECT 
        id,
        date,
        action as type,
        ticker,
        quantity,
        unit_price as price,
        fees,
        total_cost as invested_amount,
        created_at
      FROM transactions 
      ORDER BY date ASC
    `).all();
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get portfolio summary
app.get('/api/transactions/summary', (req, res) => {
    try {
        const summary = db.prepare(`
      SELECT 
        ticker,
        COUNT(*) as transaction_count,
        SUM(quantity) as total_shares,
        SUM(total_cost) as total_invested,
        SUM(fees) as total_fees,
        AVG(unit_price) as avg_price,
        MIN(date) as first_date,
        MAX(date) as last_date
      FROM transactions
      GROUP BY ticker
    `).all();
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Set ticker for all transactions (one-time setup)
app.post('/api/transactions/set-ticker', (req, res) => {
    const { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: 'Missing ticker' });

    try {
        const result = db.prepare('UPDATE transactions SET ticker = ?').run(ticker.toUpperCase());
        res.json({ message: `Updated ${result.changes} transactions with ticker ${ticker.toUpperCase()}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new transaction
app.post('/api/transactions', (req, res) => {
    const { date, quantity, unit_price, fees = 0, ticker = 'UNKNOWN' } = req.body;

    if (!date || !quantity || !unit_price) {
        return res.status(400).json({ error: 'Missing: date, quantity, unit_price' });
    }

    const total_cost = quantity * unit_price + fees;

    try {
        const stmt = db.prepare(`
      INSERT INTO transactions (date, action, quantity, unit_price, fees, total_cost, ticker)
      VALUES (?, 'Acheter', ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(date, quantity, unit_price, fees, total_cost, ticker.toUpperCase());
        res.status(201).json({ id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update a transaction
app.put('/api/transactions/:id', (req, res) => {
    const { id } = req.params;
    const { quantity, unit_price, fees } = req.body;

    if (quantity === undefined && unit_price === undefined && fees === undefined) {
        return res.status(400).json({ error: 'Provide at least one field to update: quantity, unit_price, fees' });
    }

    try {
        // Get current transaction
        const current = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        if (!current) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Calculate new values
        const newQuantity = quantity !== undefined ? quantity : current.quantity;
        const newPrice = unit_price !== undefined ? unit_price : current.unit_price;
        const newFees = fees !== undefined ? fees : current.fees;
        const newTotalCost = newQuantity * newPrice + newFees;

        // Update
        const stmt = db.prepare(`
            UPDATE transactions 
            SET quantity = ?, unit_price = ?, fees = ?, total_cost = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        stmt.run(newQuantity, newPrice, newFees, newTotalCost, id);

        res.json({
            message: 'Transaction updated',
            transaction: {
                id: Number(id),
                quantity: newQuantity,
                unit_price: newPrice,
                fees: newFees,
                total_cost: newTotalCost
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// DCA ANALYSIS ENDPOINT
// ============================================================================

app.get('/api/dca/analysis', async (req, res) => {
    const { ticker } = req.query;

    try {
        // Get transactions
        const transactions = db.prepare(`
      SELECT date, quantity, unit_price as price, total_cost as invested
      FROM transactions 
      WHERE ticker = COALESCE(?, ticker)
      ORDER BY date ASC
    `).all(ticker || null);

        if (transactions.length === 0) {
            return res.json({ error: 'No transactions found', transactions: [] });
        }

        // Calculate DCA metrics
        let totalShares = 0;
        let totalInvested = 0;
        const enrichedTxs = transactions.map(tx => {
            totalShares += tx.quantity;
            totalInvested += tx.invested;
            return {
                ...tx,
                accumulated_shares: totalShares,
                cost_basis: totalInvested
            };
        });

        const avgPrice = totalInvested / totalShares;

        res.json({
            transactions: enrichedTxs,
            summary: {
                total_shares: totalShares,
                total_invested: totalInvested,
                avg_purchase_price: avgPrice,
                transaction_count: transactions.length,
                first_date: transactions[0].date,
                last_date: transactions[transactions.length - 1].date
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// HELPERS
// ============================================================================

function transformCoinGeckoData(data) {
    if (!data.prices?.length) return { prices: [], error: 'No data' };

    const dailyMap = new Map();
    for (const [ts, price] of data.prices) {
        const date = new Date(ts).toISOString().split('T')[0];
        dailyMap.set(date, price);
    }

    const prices = Array.from(dailyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, price]) => ({ date, price }));

    return { prices, count: prices.length, source: 'coingecko' };
}

function transformYahooData(data) {
    const result = data.chart?.result?.[0];
    if (!result?.timestamp) return { prices: [], error: data.chart?.error?.description || 'No data' };

    const { timestamp } = result;
    const quotes = result.indicators.quote[0];

    const prices = timestamp
        .map((ts, i) => quotes.close[i] != null ? {
            date: new Date(ts * 1000).toISOString().split('T')[0],
            price: quotes.close[i]
        } : null)
        .filter(Boolean);

    return { prices, count: prices.length, source: 'yahoo' };
}

// Health check
app.get('/api/health', (req, res) => {
    const txCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get();
    res.json({
        status: 'ok',
        redis: redis !== null,
        transactions: txCount.count,
        database: DB_PATH
    });
});

// ============================================================================
// START
// ============================================================================

async function start() {
    await initRedis();
    app.listen(PORT, () => {
        console.log(`
🚀 DCA Backend running on http://localhost:${PORT}

Endpoints:
  GET  /api/health
  GET  /api/crypto/:coinId?from=&to=
  GET  /api/stock/:ticker?period1=&period2=
  GET  /api/transactions
  GET  /api/transactions/summary
  POST /api/transactions/set-ticker
  GET  /api/dca/analysis?ticker=
    `);
    });
}

start();
