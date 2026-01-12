import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, Legend, ReferenceLine, ReferenceDot, Brush
} from 'recharts';
import { MarketDataPoint, DcaTransaction } from '../../../types';
import { Skeleton } from '@/components/ui/skeleton';

interface DcaChartsProps {
    marketData: MarketDataPoint[];
    transactions: DcaTransaction[];
    drawdownData: { date: string; drawdown: number }[];
    vixThreshold: number;
    useSmaRule: boolean; // SMA 100
    useSma20Rule: boolean;
    useSma50Rule: boolean;
    useSma200Rule: boolean;
    useVixRule: boolean;
    isLoading?: boolean;
}

const DcaCharts: React.FC<DcaChartsProps> = ({
    marketData,
    transactions,
    drawdownData,
    vixThreshold,
    useSmaRule,
    useSma20Rule,
    useSma50Rule,
    useSma200Rule,
    useVixRule,
    isLoading
}) => {
    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-[400px] w-full rounded-xl bg-white/5" />
                <Skeleton className="h-[350px] w-full rounded-xl bg-white/5" />
                <Skeleton className="h-[250px] w-full rounded-xl bg-white/5" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Price Chart with SMA-100 & SMA-200 */}
            <div className="glass-panel p-6 rounded-xl border-white/5 shadow-2xl h-[400px]">
                <h3 className="text-foreground font-bold mb-4 flex items-center gap-2">
                    <span className="text-blue-400">📈</span> Prix & Moyennes Mobiles
                </h3>
                <ResponsiveContainer width="100%" height="90%">
                    <LineChart data={marketData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                            dataKey="date"
                            stroke="#64748b"
                            fontSize={11}
                            tickFormatter={(val) => new Date(val).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
                            minTickGap={50}
                        />
                        <YAxis stroke="#64748b" fontSize={11} domain={['auto', 'auto']} />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', color: 'white' }}
                            formatter={(value: number, name: string) => [
                                `€${value.toFixed(2)}`,
                                name === 'price' ? 'Prix' : name === 'sma100' ? 'SMA-100' : 'SMA-200'
                            ]}
                            labelFormatter={(label) => new Date(label).toLocaleDateString('fr-FR')}
                        />
                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
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
                                        r={4}
                                        fill="#06B6D4"
                                        stroke="#fff"
                                        strokeWidth={1}
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
                                        r={4}
                                        fill="#22C55E"
                                        stroke="#fff"
                                        strokeWidth={1}
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
                                        r={4}
                                        fill="#3B82F6"
                                        stroke="#fff"
                                        strokeWidth={1}
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
                                        r={4}
                                        fill="#A855F7"
                                        stroke="#fff"
                                        strokeWidth={1}
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
                                        r={4}
                                        fill="#EF4444"
                                        stroke="#fff"
                                        strokeWidth={1}
                                    />
                                ) : null;
                            })}

                        {/* Zoom Brush */}
                        <Brush
                            dataKey="date"
                            height={30}
                            stroke="#3B82F6"
                            fill="rgba(15, 23, 42, 0.5)"
                            tickFormatter={(val) => new Date(val).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Portfolio Growth */}
            <div className="glass-panel p-6 rounded-xl border-white/5 shadow-2xl h-[350px]">
                <h3 className="text-foreground font-bold mb-4 flex items-center gap-2">
                    <span className="text-emerald-400">💰</span> Croissance du Portefeuille
                </h3>
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
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={11} minTickGap={50} />
                        <YAxis stroke="#64748b" fontSize={11} />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', color: 'white' }}
                            formatter={(value: number) => [`€${Math.round(value).toLocaleString()}`, '']}
                        />
                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                        <Area type="monotone" dataKey="portfolioValue" name="Valeur" stroke="#10B981" fill="url(#colorPortfolio)" strokeWidth={2} />
                        <Area type="monotone" dataKey="costBasis" name="Investi" stroke="#3B82F6" fill="none" strokeDasharray="5 5" strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Drawdown Chart */}
            <div className="glass-panel p-6 rounded-xl border-white/5 shadow-2xl h-[250px]">
                <h3 className="text-foreground font-bold mb-4 flex items-center gap-2">
                    <span className="text-red-400">📉</span> Drawdown (Pertes Temporaires)
                </h3>
                <ResponsiveContainer width="100%" height="85%">
                    <AreaChart data={drawdownData}>
                        <defs>
                            <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={10} minTickGap={50} />
                        <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `-${v.toFixed(0)}%`} />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', color: 'white' }}
                            formatter={(value: number) => [`-${value.toFixed(1)}%`, 'Drawdown']}
                        />
                        <Area type="monotone" dataKey="drawdown" stroke="#EF4444" fill="url(#colorDrawdown)" strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default DcaCharts;
