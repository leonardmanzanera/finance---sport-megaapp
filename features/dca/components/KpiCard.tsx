import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { Skeleton } from '@/components/ui/skeleton';

export interface KpiCardProps {
    label: string;
    value: string;
    color?: 'emerald' | 'red' | 'blue' | 'amber' | 'purple' | 'white';
    tooltip?: string;
    isLoading?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, color = 'white', tooltip, isLoading }) => {
    const colorClasses: Record<string, string> = {
        white: 'text-foreground',
        emerald: 'text-emerald-400',
        red: 'text-red-400',
        blue: 'text-blue-400',
        amber: 'text-amber-400',
        purple: 'text-purple-400'
    };

    return (
        <Card className="glass-panel border-white/5 transition-all hover:bg-white/5">
            <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground uppercase flex items-center gap-1 font-bold tracking-wider">
                    {label}
                    {tooltip && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="cursor-help text-muted-foreground/60 hover:text-primary transition-colors">ⓘ</span>
                                </TooltipTrigger>
                                <TooltipContent className="glass-panel text-xs">
                                    <p>{tooltip}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <Skeleton className="h-8 w-24 bg-white/10" />
                ) : (
                    <p className={cn("text-2xl font-black tracking-tight", colorClasses[color])}>{value}</p>
                )}
            </CardContent>
        </Card>
    );
};

export default KpiCard;
