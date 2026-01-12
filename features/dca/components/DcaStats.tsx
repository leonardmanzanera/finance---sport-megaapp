import React from 'react';
import { DcaExtendedSummary } from '../../../types';
import KpiCard from './KpiCard';

interface DcaStatsProps {
    summary: DcaExtendedSummary | null;
    isLoading: boolean;
}

const DcaStats: React.FC<DcaStatsProps> = ({ summary, isLoading }) => {
    // Helper to safely get values or return defaults/loading placeholders
    const getVal = (fn: (s: DcaExtendedSummary) => string | number) => {
        if (isLoading) return "";
        if (!summary) return "-";
        return fn(summary);
    };

    return (
        <div className="space-y-6">
            {/* KPIs Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    label="Total Investi"
                    value={isLoading ? "" : `€${summary?.totalInvested.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) ?? 0}`}
                    isLoading={isLoading}
                />
                <KpiCard
                    label="Valeur Actuelle"
                    value={isLoading ? "" : `€${summary?.currentValue.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) ?? 0}`}
                    color={summary && summary.profitPercent >= 0 ? 'emerald' : 'red'}
                    isLoading={isLoading}
                />
                <KpiCard
                    label="Rendement Total"
                    value={isLoading ? "" : `${summary && summary.profitPercent >= 0 ? '+' : ''}${summary?.profitPercent.toFixed(1) ?? 0}%`}
                    color={summary && summary.profitPercent >= 0 ? 'emerald' : 'red'}
                    isLoading={isLoading}
                />
                <KpiCard
                    label="CAGR"
                    value={isLoading ? "" : `${summary?.cagr.toFixed(1) ?? 0}%`}
                    color="blue"
                    tooltip="Taux de croissance annuel composé"
                    isLoading={isLoading}
                />
            </div>

            {/* Advanced KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    label="XIRR"
                    value={isLoading ? "" : `${summary?.xirr.toFixed(1) ?? 0}%`}
                    color="purple"
                    tooltip="Taux de rendement interne étendu (flux irréguliers)"
                    isLoading={isLoading}
                />
                <KpiCard
                    label="Sharpe Ratio"
                    value={isLoading ? "" : (summary?.sharpeRatio.toFixed(2) ?? "0")}
                    color={(summary?.sharpeRatio ?? 0) > 1 ? 'emerald' : (summary?.sharpeRatio ?? 0) > 0 ? 'amber' : 'red'}
                    tooltip="Rendement ajusté au risque (>1 = bon)"
                    isLoading={isLoading}
                />
                <KpiCard
                    label="Max Drawdown"
                    value={isLoading ? "" : `-${summary?.maxDrawdown.toFixed(1) ?? 0}%`}
                    color="red"
                    tooltip={`Pic: ${summary?.maxDrawdownPeakDate} → Creux: ${summary?.maxDrawdownTroughDate}`}
                    isLoading={isLoading}
                />
                <KpiCard
                    label="Volatilité"
                    value={isLoading ? "" : `${summary?.volatility.toFixed(1) ?? 0}%`}
                    color="amber"
                    tooltip="Volatilité annualisée (σ × √252)"
                    isLoading={isLoading}
                />
            </div>
        </div>
    );
};

export default DcaStats;
