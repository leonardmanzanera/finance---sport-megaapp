import React from 'react';
import { DcaTransaction } from '../../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DcaTransactionsProps {
    transactions: DcaTransaction[];
}

const DcaTransactions: React.FC<DcaTransactionsProps> = ({ transactions }) => {
    if (!transactions || transactions.length === 0) return null;

    const getRowBgClass = (tx: DcaTransaction): string => {
        if (tx.multiplierApplied > 1) return 'bg-emerald-500/10';
        if (tx.reason?.includes('SMA100') || tx.reason?.includes('SMA200')) return 'bg-blue-500/10';
        if (tx.reason?.includes('RSI')) return tx.reason.includes('⏸️') ? 'bg-muted/50' : 'bg-amber-500/10';
        if (tx.reason?.includes('VIX')) return 'bg-red-500/10';
        if (tx.reason?.includes('Budget équilibré')) return 'bg-muted/50';
        return '';
    };

    const getReasonBadgeVariant = (reason: string): "default" | "secondary" | "destructive" | "outline" => {
        if (reason.includes('⏸️')) return 'secondary';
        if (reason.includes('🚀')) return 'default';
        if (reason.includes('SMA')) return 'default';
        if (reason.includes('VIX')) return 'destructive';
        return 'secondary';
    };

    return (
        <Card className="glass-panel border-white/5 transition-all hover:bg-white/5">
            <CardHeader className="pb-4">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">📊 Historique Complet des Transactions</CardTitle>
                    <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 bg-blue-500/30 rounded"></span> SMA
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 bg-amber-500/30 rounded"></span> RSI
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 bg-red-500/30 rounded"></span> VIX
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 bg-muted rounded"></span> Skip
                        </span>
                        <Badge variant="outline">{transactions.length} tx</Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-background/80 backdrop-blur-sm z-10">
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Prix</TableHead>
                                <TableHead>Montant</TableHead>
                                <TableHead>Parts</TableHead>
                                <TableHead>Cumul</TableHead>
                                <TableHead>Valeur</TableHead>
                                <TableHead>Indicateurs</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transactions.map((tx, idx) => (
                                <TableRow key={idx} className={cn(getRowBgClass(tx), "hover:bg-muted/50")}>
                                    <TableCell className="font-mono text-xs text-muted-foreground">{tx.date}</TableCell>
                                    <TableCell>€{tx.price.toFixed(2)}</TableCell>
                                    <TableCell className={cn(
                                        "font-medium",
                                        tx.investedAmount === 0 ? 'text-muted-foreground' : tx.multiplierApplied > 1 ? 'text-emerald-400' : ''
                                    )}>
                                        {tx.investedAmount === 0 ? '—' : `€${Math.round(tx.investedAmount)}`}
                                        {tx.multiplierApplied > 1 && (
                                            <span className="text-emerald-500 text-xs ml-1">x{tx.multiplierApplied}</span>
                                        )}
                                    </TableCell>
                                    <TableCell>{tx.sharesBought > 0 ? tx.sharesBought.toFixed(4) : '—'}</TableCell>
                                    <TableCell className="text-blue-400">{tx.accumulatedShares.toFixed(2)}</TableCell>
                                    <TableCell className="text-emerald-400">€{Math.round(tx.portfolioValue).toLocaleString()}</TableCell>
                                    <TableCell>
                                        {tx.reason && (
                                            <Badge variant={getReasonBadgeVariant(tx.reason)} className="text-xs">
                                                {tx.reason}
                                            </Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default DcaTransactions;
