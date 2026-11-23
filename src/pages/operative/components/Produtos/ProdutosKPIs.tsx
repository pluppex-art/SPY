import { Card } from "../../../../components/ui/card";
import { Package, Activity, TrendingUp, Sparkles } from "lucide-react";

interface ProdutosKPIsProps {
  totalSkuCount: number;
  activeSkuCount: number;
  averageMarginVal: number;
  bestSellerCount: number;
}

export function ProdutosKPIs({ totalSkuCount, activeSkuCount, averageMarginVal, bestSellerCount }: ProdutosKPIsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      <Card className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all">
        <Package className="w-5 h-5 text-indigo-500 mb-2 sm:mb-3" />
        <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{totalSkuCount}</div>
        <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Total de SKUs</div>
      </Card>

      <Card className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all">
        <Activity className="w-5 h-5 text-emerald-500 mb-2 sm:mb-3" />
        <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{activeSkuCount}</div>
        <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">SKUs em Operação</div>
      </Card>

      <Card className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all">
        <TrendingUp className="w-5 h-5 text-blue-500 mb-2 sm:mb-3" />
        <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic font-mono">{averageMarginVal}%</div>
        <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Margem Ativa Média</div>
      </Card>

      <Card className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all">
        <Sparkles className="w-5 h-5 text-amber-500 mb-2 sm:mb-3" />
        <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic font-mono">{bestSellerCount}</div>
        <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Produtos Favoritos / BestSellers</div>
      </Card>
    </div>
  );
}
