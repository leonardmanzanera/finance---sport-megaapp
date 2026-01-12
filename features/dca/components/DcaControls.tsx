import React from 'react';
import { DcaFrequency } from '../../../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

interface DcaControlsProps {
    ticker: string;
    setTicker: (val: string) => void;
    startDate: string;
    setStartDate: (val: string) => void;
    baseAmount: number;
    setBaseAmount: (val: number) => void;
    frequency: DcaFrequency;
    setFrequency: (val: DcaFrequency) => void;

    // Strategy Toggles
    useDcaStrict: boolean;
    setUseDcaStrict: (val: boolean) => void;
    useSmaRule: boolean; // SMA 100
    setUseSmaRule: (val: boolean) => void;
    useSma20Rule: boolean;
    setUseSma20Rule: (val: boolean) => void;
    useSma50Rule: boolean;
    setUseSma50Rule: (val: boolean) => void;
    useSma200Rule: boolean;
    setUseSma200Rule: (val: boolean) => void;
    useRsiRule: boolean;
    setUseRsiRule: (val: boolean) => void;
    useVixRule: boolean;
    setUseVixRule: (val: boolean) => void;
    useSellInMay: boolean;
    setUseSellInMay: (val: boolean) => void;

    // Configuration
    indicatorTimeframe: 'daily' | 'weekly' | 'monthly';
    setIndicatorTimeframe: (val: 'daily' | 'weekly' | 'monthly') => void;
    sma20Multiplier: number;
    setSma20Multiplier: (val: number) => void;
    sma50Multiplier: number;
    setSma50Multiplier: (val: number) => void;
    sma100Multiplier: number;
    setSma100Multiplier: (val: number) => void;
    sma200Multiplier: number;
    setSma200Multiplier: (val: number) => void;
    vixMultiplier: number;
    setVixMultiplier: (val: number) => void;
    vixThreshold: number;
    setVixThreshold: (val: number) => void;

    // Portfolio Integration
    usePortfolio: boolean;
    setUsePortfolio: (val: boolean) => void;
    backendStatus: 'checking' | 'online' | 'offline';
    portfolioTxsCount: number;

    // Actions
    runBacktest: () => void;
    isLoading: boolean;
    error: string | null;
}

const DcaControls: React.FC<DcaControlsProps> = ({
    ticker, setTicker,
    startDate, setStartDate,
    baseAmount, setBaseAmount,
    frequency, setFrequency,
    useDcaStrict, setUseDcaStrict,
    useSmaRule, setUseSmaRule,
    useSma20Rule, setUseSma20Rule,
    useSma50Rule, setUseSma50Rule,
    useSma200Rule, setUseSma200Rule,
    useRsiRule, setUseRsiRule,
    useVixRule, setUseVixRule,
    useSellInMay, setUseSellInMay,
    indicatorTimeframe, setIndicatorTimeframe,
    sma20Multiplier, setSma20Multiplier,
    sma50Multiplier, setSma50Multiplier,
    sma100Multiplier, setSma100Multiplier,
    sma200Multiplier, setSma200Multiplier,
    vixMultiplier, setVixMultiplier,
    vixThreshold, setVixThreshold,
    usePortfolio, setUsePortfolio,
    backendStatus, portfolioTxsCount,
    runBacktest, isLoading, error
}) => {
    return (
        <Card className="glass-panel border-white/5 shadow-2xl">
            <CardHeader className="pb-2">
                <CardTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                    <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                        ⚡ Paramètres DCA
                    </span>
                    {backendStatus === 'online' && (
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                {/* Main Controls Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Ticker Select */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Actif Cible</Label>
                        <Select value={ticker} onValueChange={setTicker}>
                            <SelectTrigger className="glass-input h-10 font-medium">
                                <SelectValue placeholder="Choisir un actif" />
                            </SelectTrigger>
                            <SelectContent className="glass-panel border-white/10">
                                <SelectGroup>
                                    <SelectLabel>🪙 Crypto</SelectLabel>
                                    <SelectItem value="BTC-USD">Bitcoin (BTC)</SelectItem>
                                    <SelectItem value="ETH-USD">Ethereum (ETH)</SelectItem>
                                    <SelectItem value="SOL-USD">Solana (SOL)</SelectItem>
                                    <SelectItem value="TAO-USD">Bittensor (TAO)</SelectItem>
                                    <SelectItem value="SUI-USD">Sui (SUI)</SelectItem>
                                </SelectGroup>
                                <SelectGroup>
                                    <SelectLabel>📊 ETF S&P500</SelectLabel>
                                    <SelectItem value="SPY">S&P 500 (SPY)</SelectItem>
                                    <SelectItem value="VOO">Vanguard S&P 500 (VOO)</SelectItem>
                                    <SelectItem value="QQQ">Nasdaq 100 (QQQ)</SelectItem>
                                </SelectGroup>
                                <SelectGroup>
                                    <SelectLabel>🌍 ETF World & Others</SelectLabel>
                                    <SelectItem value="CW8.PA">MSCI World (CW8.PA)</SelectItem>
                                    <SelectItem value="IBIT">iShares Bitcoin (IBIT)</SelectItem>
                                    <SelectItem value="GLUX">Amundi Luxury (GLUX)</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Start Date */}
                    <div className="space-y-2">
                        <Label htmlFor="startDate" className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Début du DCA</Label>
                        <Input
                            id="startDate"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="glass-input h-10"
                        />
                    </div>

                    {/* Amount & Frequency */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Montant / Période</Label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                <Input
                                    type="number"
                                    value={baseAmount}
                                    onChange={(e) => setBaseAmount(Number(e.target.value))}
                                    disabled={usePortfolio}
                                    className="glass-input h-10 pl-7"
                                />
                            </div>
                            <Select value={frequency} onValueChange={(val) => setFrequency(val as DcaFrequency)} disabled={usePortfolio}>
                                <SelectTrigger className="w-[110px] glass-input h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="glass-panel">
                                    <SelectItem value="daily">Jours</SelectItem>
                                    <SelectItem value="weekly">Hebdo</SelectItem>
                                    <SelectItem value="monthly">Mensuel</SelectItem>
                                    <SelectItem value="quarterly">Trimestriel</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Mode & Timeframe */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Mode & Timeframe</Label>
                        <div className="flex gap-2">
                            <div className={`flex items-center gap-2 px-3 rounded-md border text-sm flex-1 transition-all h-10 ${useDcaStrict ? 'bg-primary/20 border-primary text-primary' : 'bg-background/20 border-white/5 text-muted-foreground'}`}>
                                <Checkbox
                                    id="dcaStrict"
                                    checked={useDcaStrict}
                                    onCheckedChange={(checked) => setUseDcaStrict(checked as boolean)}
                                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <Label htmlFor="dcaStrict" className="cursor-pointer font-medium">DCA Strict</Label>
                            </div>
                            <Select value={indicatorTimeframe} onValueChange={(val) => setIndicatorTimeframe(val as 'daily' | 'weekly' | 'monthly')}>
                                <SelectTrigger className="w-[100px] glass-input h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="glass-panel">
                                    <SelectItem value="daily">D1 (Day)</SelectItem>
                                    <SelectItem value="weekly">W1 (Week)</SelectItem>
                                    <SelectItem value="monthly">M1 (Mth)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Portfolio Switch */}
                <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${usePortfolio ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-background/30 border-white/5'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-lg text-lg ${usePortfolio ? 'bg-emerald-500/20 text-emerald-400' : 'bg-background/40 text-muted-foreground'}`}>
                            💼
                        </div>
                        <div>
                            <h4 className={`text-sm font-bold ${usePortfolio ? 'text-emerald-400' : 'text-foreground'}`}>Utiliser le Portfolio Réel</h4>
                            <p className="text-xs text-muted-foreground">
                                {backendStatus === 'online'
                                    ? <span className="text-emerald-400/80">● Connecté ({portfolioTxsCount} txs)</span>
                                    : <span className="text-destructive/80">● Backend hors ligne</span>}
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={usePortfolio}
                        onCheckedChange={setUsePortfolio}
                        disabled={backendStatus !== 'online'}
                        className="data-[state=checked]:bg-emerald-500"
                    />
                </div>

                {/* Smart Rules Config - Accordion */}
                {!useDcaStrict && (
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="smart-rules" className="border-border/50 bg-background/20 rounded-xl px-4 border">
                            <AccordionTrigger className="hover:no-underline py-4">
                                <div className="flex items-center gap-3">
                                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-1.5 rounded-md text-white text-xs">
                                        🧠
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="text-sm font-bold bg-gradient-to-r from-blue-300 to-purple-300 bg-clip-text text-transparent">
                                            Stratégies Smart DCA
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-normal">
                                            Indicateurs techniques & filtres de marché
                                        </span>
                                    </div>
                                    <Badge variant="outline" className="ml-2 text-[10px] border-blue-500/30 text-blue-300 bg-blue-500/5">
                                        {indicatorTimeframe === 'daily' ? 'Journalier' : indicatorTimeframe === 'weekly' ? 'Hebdomadaire' : 'Mensuel'}
                                    </Badge>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-4 pb-6">
                                <div className="space-y-6">
                                    {/* Rule Toggles */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                        <div className={`flex flex-col gap-2 p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${useRsiRule ? 'bg-amber-500/10 border-amber-500/50' : 'bg-background/40 border-white/5 hover:bg-background/60'}`}>
                                            <div className="flex justify-between items-start">
                                                <Label htmlFor="rsi" className={`cursor-pointer font-bold text-xs ${useRsiRule ? 'text-amber-400' : 'text-muted-foreground'}`}>RSI &lt; 30</Label>
                                                <Checkbox id="rsi" checked={useRsiRule} onCheckedChange={(c) => setUseRsiRule(c as boolean)} className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500 h-4 w-4" />
                                            </div>
                                            <div className="text-[10px] text-muted-foreground leading-tight">Accumulation en zone de peur</div>
                                        </div>
                                        <div className={`flex flex-col gap-2 p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${useSma20Rule ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-background/40 border-white/5 hover:bg-background/60'}`}>
                                            <div className="flex justify-between items-start">
                                                <Label htmlFor="sma20" className={`cursor-pointer font-bold text-xs ${useSma20Rule ? 'text-cyan-400' : 'text-muted-foreground'}`}>SMA 20</Label>
                                                <Checkbox id="sma20" checked={useSma20Rule} onCheckedChange={(c) => setUseSma20Rule(c as boolean)} className="data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500 h-4 w-4" />
                                            </div>
                                            <div className="text-[10px] text-muted-foreground leading-tight">Tendance court terme</div>
                                        </div>
                                        <div className={`flex flex-col gap-2 p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${useSma50Rule ? 'bg-teal-500/10 border-teal-500/50' : 'bg-background/40 border-white/5 hover:bg-background/60'}`}>
                                            <div className="flex justify-between items-start">
                                                <Label htmlFor="sma50" className={`cursor-pointer font-bold text-xs ${useSma50Rule ? 'text-teal-400' : 'text-muted-foreground'}`}>SMA 50</Label>
                                                <Checkbox id="sma50" checked={useSma50Rule} onCheckedChange={(c) => setUseSma50Rule(c as boolean)} className="data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500 h-4 w-4" />
                                            </div>
                                            <div className="text-[10px] text-muted-foreground leading-tight">Tendance moyen terme</div>
                                        </div>
                                        <div className={`flex flex-col gap-2 p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${useSmaRule ? 'bg-blue-500/10 border-blue-500/50' : 'bg-background/40 border-white/5 hover:bg-background/60'}`}>
                                            <div className="flex justify-between items-start">
                                                <Label htmlFor="sma100" className={`cursor-pointer font-bold text-xs ${useSmaRule ? 'text-blue-400' : 'text-muted-foreground'}`}>SMA 100</Label>
                                                <Checkbox id="sma100" checked={useSmaRule} onCheckedChange={(c) => setUseSmaRule(c as boolean)} className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 h-4 w-4" />
                                            </div>
                                            <div className="text-[10px] text-muted-foreground leading-tight">Tendance long terme</div>
                                        </div>
                                        <div className={`flex flex-col gap-2 p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${useSma200Rule ? 'bg-purple-500/10 border-purple-500/50' : 'bg-background/40 border-white/5 hover:bg-background/60'}`}>
                                            <div className="flex justify-between items-start">
                                                <Label htmlFor="sma200" className={`cursor-pointer font-bold text-xs ${useSma200Rule ? 'text-purple-400' : 'text-muted-foreground'}`}>SMA 200</Label>
                                                <Checkbox id="sma200" checked={useSma200Rule} onCheckedChange={(c) => setUseSma200Rule(c as boolean)} className="data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500 h-4 w-4" />
                                            </div>
                                            <div className="text-[10px] text-muted-foreground leading-tight">La ligne de vie</div>
                                        </div>
                                        <div className={`flex flex-col gap-2 p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${useVixRule ? 'bg-red-500/10 border-red-500/50' : 'bg-background/40 border-white/5 hover:bg-background/60'}`}>
                                            <div className="flex justify-between items-start">
                                                <Label htmlFor="vix" className={`cursor-pointer font-bold text-xs ${useVixRule ? 'text-red-400' : 'text-muted-foreground'}`}>VIX Spike</Label>
                                                <Checkbox id="vix" checked={useVixRule} onCheckedChange={(c) => setUseVixRule(c as boolean)} className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500 h-4 w-4" />
                                            </div>
                                            <div className="text-[10px] text-muted-foreground leading-tight">Panic buy (Volatilité)</div>
                                        </div>
                                    </div>

                                    {/* Sell in May */}
                                    <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${useSellInMay ? 'bg-green-500/10 border-green-500/30' : 'bg-background/40 border-white/5'}`}>
                                        <Checkbox id="sellInMay" checked={useSellInMay} onCheckedChange={(c) => setUseSellInMay(c as boolean)} className="data-[state=checked]:bg-green-500 lg:h-5 lg:w-5" />
                                        <div>
                                            <Label htmlFor="sellInMay" className={`cursor-pointer font-bold text-sm ${useSellInMay ? 'text-green-400' : 'text-muted-foreground'}`}>Sell in May & Go Away</Label>
                                            <p className="text-xs text-muted-foreground">Historiquement, les marchés sous-performent l'été. Cette option met en pause le DCA de Mai à Août et réinvestit le cash accumulé en Septembre.</p>
                                        </div>
                                    </div>

                                    {/* Multiplier Sliders */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {[
                                            { active: useSma20Rule, label: 'SMA 20 Multiplier', color: 'cyan', val: sma20Multiplier, set: setSma20Multiplier },
                                            { active: useSma50Rule, label: 'SMA 50 Multiplier', color: 'teal', val: sma50Multiplier, set: setSma50Multiplier },
                                            { active: useSmaRule, label: 'SMA 100 Multiplier', color: 'blue', val: sma100Multiplier, set: setSma100Multiplier },
                                            { active: useSma200Rule, label: 'SMA 200 Multiplier', color: 'purple', val: sma200Multiplier, set: setSma200Multiplier },
                                            { active: useVixRule, label: 'VIX Multiplier', color: 'red', val: vixMultiplier, set: setVixMultiplier },
                                        ].map((item, i) => item.active && (
                                            <div key={i} className={`bg-${item.color}-500/5 border border-${item.color}-500/20 rounded-xl p-4 space-y-4`}>
                                                <div className="flex justify-between items-center">
                                                    <span className={`text-xs font-bold uppercase text-${item.color}-400`}>{item.label}</span>
                                                    <span className={`text-${item.color}-400 font-black bg-${item.color}-500/10 px-2 py-0.5 rounded`}>x{item.val}</span>
                                                </div>
                                                <Slider
                                                    value={[item.val]}
                                                    onValueChange={(val) => item.set(val[0])}
                                                    min={1}
                                                    max={12}
                                                    step={0.5}
                                                    className={`[&_[role=slider]]:bg-${item.color}-500 cursor-pointer`}
                                                />
                                            </div>
                                        ))}

                                        {useVixRule && (
                                            <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-bold uppercase text-orange-400">Seuil VIX (Panic)</span>
                                                    <span className="text-orange-400 font-black bg-orange-500/10 px-2 py-0.5 rounded">{vixThreshold}</span>
                                                </div>
                                                <Slider
                                                    value={[vixThreshold]}
                                                    onValueChange={(val) => setVixThreshold(val[0])}
                                                    min={20}
                                                    max={80}
                                                    step={5}
                                                    className="[&_[role=slider]]:bg-orange-500 cursor-pointer"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}

                {/* Run Button */}
                <Button
                    onClick={runBacktest}
                    disabled={isLoading || backendStatus === 'offline'}
                    size="lg"
                    className="w-full relative overflow-hidden group h-14 text-lg font-bold shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] border-0"
                    style={{
                        background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                    }}
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 pointer-events-none" />
                    {isLoading ? (
                        <div className="flex items-center gap-2">
                            <span className="animate-spin text-2xl">⏳</span>
                            <span>Analyse en cours...</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">🚀</span>
                            <span>LANCER LE BACKTEST</span>
                        </div>
                    )}
                </Button>

                {/* Error Display */}
                {error && (
                    <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm font-medium animate-in slide-in-from-bottom-2 fade-in">
                        ⚠️ {error}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default DcaControls;
