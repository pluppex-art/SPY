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

export function SalesRankingPodium({ salesRanking }: { salesRanking: SalesEntry[] }) {
  const top3 = salesRanking.slice(0, 3);
  // Achado real: o card ficava com uma área em branco enorme quando havia só
  // 1-2 vendedores (o pódio sempre reserva 3 posições) ou mesmo com 3 — o
  // Funil ao lado tem bem mais linhas. Em vez de inventar conteúdo, mostra o
  // resto do ranking real (4º colocado em diante, mesmo cálculo de sempre,
  // useDashboard.ts não corta mais em 3) como lista simples.
  const rest = salesRanking.slice(3);
  const hasSales = top3.length > 0;

  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] relative group shadow-sm">
      <div className="flex items-center justify-between mb-8">
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
          description="Feche a primeira venda para inaugurar o pódio do mês!"
          className="py-12"
        />
      ) : (
        <>
          <div className="flex items-end justify-center gap-4 mb-8 h-48">
            {top3[1] ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "75%", opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 50 }}
                className="flex-1 max-w-[120px] flex flex-col items-center gap-2"
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-xl shadow-sm">🥈</div>
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-slate-400 text-white text-[8px] font-black rounded-full flex items-center justify-center">2º</div>
                </div>
                <div className="w-full h-full bg-[var(--color-surface-sunken)] border-x border-t border-[var(--color-border-default)] rounded-t-xl p-3 flex flex-col items-center justify-center">
                  <p className="text-xs font-bold text-[var(--color-text-primary)] text-center truncate w-full mb-0.5">{top3[1].name}</p>
                  <p className="text-[11px] font-bold text-[var(--color-text-muted)] font-mono">R$ {top3[1].total.toLocaleString('pt-BR')}</p>
                </div>
              </motion.div>
            ) : <div className="flex-1 max-w-[120px]" />}

            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "100%", opacity: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 50 }}
              className="flex-1 max-w-[140px] flex flex-col items-center gap-2.5"
            >
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center text-2xl shadow-md">🥇</div>
              </div>
              <div className="w-full h-full bg-amber-500/10 border-x border-t border-amber-500/30 rounded-t-2xl p-4 flex flex-col items-center justify-center">
                <p className="text-xs font-black text-[var(--color-text-primary)] text-center truncate w-full mb-0.5">{top3[0].name}</p>
                <p className="text-sm font-black text-amber-600 dark:text-amber-400 font-mono">R$ {top3[0].total.toLocaleString('pt-BR')}</p>
                <Badge variant="warning" className="mt-2 text-[8px] py-0">Top Closer</Badge>
              </div>
            </motion.div>

            {top3[2] ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "60%", opacity: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 50 }}
                className="flex-1 max-w-[110px] flex flex-col items-center gap-2"
              >
                <div className="relative">
                  <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-lg shadow-sm">🥉</div>
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-700 text-white text-[8px] font-black rounded-full flex items-center justify-center">3º</div>
                </div>
                <div className="w-full h-full bg-[var(--color-surface-sunken)] border-x border-t border-[var(--color-border-default)] rounded-t-xl p-2.5 flex flex-col items-center justify-center">
                  <p className="text-[11px] font-bold text-[var(--color-text-primary)] text-center truncate w-full mb-0.5">{top3[2].name}</p>
                  <p className="text-[10px] font-bold text-[var(--color-text-muted)] font-mono">R$ {top3[2].total.toLocaleString('pt-BR')}</p>
                </div>
              </motion.div>
            ) : <div className="flex-1 max-w-[110px]" />}
          </div>

          {/* Achado real: esta grade renderizava top3 na ordem de colocação
              (1º, 2º, 3º), mas o pódio ACIMA mostra na ordem visual (2º, 1º,
              3º, prata-ouro-bronze) — com 2 ou 3 vendedores, os números de
              contrato(s)/conv. apareciam embaixo do card da PESSOA ERRADA
              (ex.: as estatísticas do 1º colocado apareciam sob o card do 2º
              colocado). Mesma ordem visual do pódio agora, slot por slot —
              inclusive o placeholder vazio quando não há 2º/3º colocado, pra
              as colunas continuarem alinhadas com os cards acima. */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[top3[1], top3[0], top3[2]].map((entry, idx) => (
              entry ? (
                <div key={idx} className="p-2 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
                  <p className="text-[10px] text-[var(--color-text-faint)] font-bold">{entry.deals} contrato(s)</p>
                  <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">{entry.rate}% conv.</p>
                </div>
              ) : <div key={idx} />
            ))}
          </div>

          {rest.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)] space-y-1.5">
              {rest.map((entry, i) => (
                <div key={entry.name} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-[var(--radius-control)] hover:bg-[var(--color-surface-sunken)] transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex items-center justify-center text-[9px] font-black text-[var(--color-text-faint)]">
                      {i + 4}º
                    </span>
                    <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono">
                    <span className="text-[var(--color-text-faint)]">{entry.deals} contrato(s)</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{entry.rate}%</span>
                    <span className="text-[var(--color-text-primary)] font-bold w-20 text-right">R$ {entry.total.toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
