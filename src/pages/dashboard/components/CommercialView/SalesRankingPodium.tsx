import { motion } from 'motion/react';
import { Card } from '../../../../components/ui/card';
import { Trophy } from 'lucide-react';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Badge } from '../../../../components/ui/badge';

interface SalesEntry {
  name: string;
  total: number;
  deals: number;
  rate: number;
}

const RANK_STYLE = [
  { medal: '🥇', badge: 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400', card: 'bg-amber-500/10 border-amber-500/30' },
  { medal: '🥈', badge: 'bg-slate-400/20 border-slate-400 text-slate-600 dark:text-slate-300', card: 'bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]' },
  { medal: '🥉', badge: 'bg-amber-700/20 border-amber-700 text-amber-700 dark:text-amber-600', card: 'bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]' },
];

/** Antes um pódio horizontal (3 posições fixas lado a lado, ouro no meio) —
 * achado real: com só 1-2 vendedores reais, sobrava muito espaço vazio, e a
 * fileira de estatísticas embaixo tinha que ficar numa ordem visual diferente
 * da do pódio (bug real já corrigido, mas frágil por natureza — 2 layouts
 * separados pra sincronizar). Lista vertical agora: uma ordem só (1º no
 * topo), cresce sozinha conforme existem mais vendedores reais no ranking
 * (useDashboard.ts já traz até 8), e cada linha já mostra nome + valor +
 * contratos + conversão juntos, sem precisar de uma segunda fileira.
 */
export function SalesRankingPodium({ salesRanking }: { salesRanking: SalesEntry[] }) {
  const hasSales = salesRanking.length > 0;

  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] relative shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" /> Ranking de Vendas
        </h3>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {new Date().toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).toUpperCase()}
        </Badge>
      </div>

      {!hasSales ? (
        <EmptyState
          icon={Trophy}
          title="Nenhum negócio fechado"
          description="Feche a primeira venda para inaugurar o ranking do mês!"
          className="py-12"
        />
      ) : (
        <div className="space-y-2.5">
          {salesRanking.map((entry, i) => {
            const style = RANK_STYLE[i];
            return (
              <motion.div
                key={entry.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex items-center gap-3 p-3 rounded-[var(--radius-control)] border ${style?.card || 'bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)]'}`}
              >
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-black shrink-0 ${style?.badge || 'bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] text-[var(--color-text-faint)]'}`}>
                  {style?.medal || `${i + 1}º`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-black text-[var(--color-text-primary)] truncate">{entry.name}</p>
                    {i === 0 && <Badge variant="warning" className="text-[8px] py-0 shrink-0">Top Closer</Badge>}
                  </div>
                  <p className="text-[10px] text-[var(--color-text-faint)] font-bold mt-0.5">
                    {entry.deals} contrato(s) · <span className="text-emerald-600 dark:text-emerald-400">{entry.rate}% conv.</span>
                  </p>
                </div>
                <span className="text-sm font-black text-[var(--color-text-primary)] font-mono shrink-0">
                  R$ {entry.total.toLocaleString('pt-BR')}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
