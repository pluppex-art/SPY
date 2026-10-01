import { useMemo } from 'react';
import { motion } from 'motion/react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { AlertCircle, ShieldAlert, HeartHandshake, CheckCircle2, BarChart3 } from 'lucide-react';
import { useData } from '../../../contexts/DataContext';
import { toast } from 'sonner';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { parseCurrencyBR as toNumberMRR } from '../../../lib/utils';
import type { DashboardSummary } from '../useDashboard';

function parseContractDate(d: string | undefined | null): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || '');
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

export function CustomerSuccessView({ serverSummary }: { serverSummary?: DashboardSummary | null }) {
  const { contracts, addTask } = useData();
  const { formatCurrency } = useLocalization();

  // A lista de contratos inadimplentes (com ação "Abrir Protocolo") precisa
  // dos registros reais — só os 3 números "hero" abaixo preferem o valor
  // cacheado de GET /api/dashboard/summary (ver useDashboard.ts) quando
  // disponível, mesma fórmula.
  const ativos = contracts.filter(c => c.status === 'Ativo');
  const emRisco = contracts.filter(c => c.status === 'Inadimplente');
  const mrrAtivo = serverSummary?.mrrAtivo ?? ativos.reduce((s, c: any) => s + toNumberMRR(c.mrr), 0);
  const mrrEmRisco = serverSummary?.mrrEmRisco ?? emRisco.reduce((s, c: any) => s + toNumberMRR(c.mrr), 0);
  const taxaRisco = serverSummary?.taxaInadimplencia ?? (contracts.length > 0 ? (emRisco.length / contracts.length) * 100 : 0);

  // CLV (proxy real, não uma métrica de "lifetime value" formal com churn
  // preditivo): tempo de contrato (assinatura -> cancelamento ou hoje, se
  // ainda ativo) em meses × MRR do contrato. Sem contrato com data válida,
  // não entra na amostra — nunca assume uma duração média inventada.
  const clvHistogram = useMemo(() => {
    const now = new Date();
    const values: number[] = [];
    for (const c of contracts as any[]) {
      const start = parseContractDate(c.date);
      if (!start) continue;
      const end = c.cancelledAt ? new Date(c.cancelledAt) : now;
      const months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
      const clv = months * toNumberMRR(c.mrr);
      if (clv > 0) values.push(clv);
    }
    if (values.length < 2) return { bins: [] as { label: string; count: number }[], sampleSize: values.length };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const BIN_COUNT = 5;
    const width = (max - min) / BIN_COUNT || 1;
    const bins = Array.from({ length: BIN_COUNT }, (_, i) => {
      const from = min + i * width;
      const to = i === BIN_COUNT - 1 ? max : min + (i + 1) * width;
      return { from, to, count: 0 };
    });
    values.forEach(v => {
      const idx = Math.min(BIN_COUNT - 1, Math.floor((v - min) / width));
      bins[idx].count++;
    });
    const fmtShort = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0);
    return {
      bins: bins.map(b => ({ label: `R$${fmtShort(b.from)}–${fmtShort(b.to)}`, count: b.count })),
      sampleSize: values.length,
    };
  }, [contracts]);

  const handleAbrirProtocolo = (contractClient: string) => {
    addTask({
      title: `Protocolo CS — ${contractClient}`,
      description: 'Tipo: Sucesso do Cliente · Tags: CS, Inadimplência',
      status: 'Em Aberto',
      priority: 'Alta',
    });
  };

  return (
    <motion.div
      key="sucesso"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6 text-left"
    >
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] relative overflow-hidden shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-danger/10 text-danger rounded-xl">
                <AlertCircle className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">
                Contratos Inadimplentes
              </h4>
            </div>
            {emRisco.length > 0 && (
              <Badge variant="destructive" dot dotPulse>
                {emRisco.length}
              </Badge>
            )}
          </div>

          {emRisco.length === 0 ? (
            <div className="p-4 bg-success/5 border border-success/20 rounded-[var(--radius-control)] flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              <p className="text-xs text-[var(--color-text-muted)]">Nenhum contrato inadimplente no momento.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {emRisco.map((c: any) => (
                <div key={c.id} className="p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">{c.client}</span>
                    <span className="text-[10px] font-bold text-danger px-2 py-0.5 bg-danger/10 rounded-full shrink-0">
                      {formatCurrency(toNumberMRR(c.mrr))}/mês
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-[11px] font-bold gap-1.5 h-8"
                    onClick={() => {
                      handleAbrirProtocolo(c.client);
                      toast.success(`Tarefa de CS criada para ${c.client}.`);
                    }}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-danger" /> Abrir Protocolo CS
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="lg:col-span-2 p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-6">
        <div>
          <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2.5">
            <HeartHandshake className="w-4 h-4 text-[var(--color-primary-blue)]" /> Carteira de Contratos
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 font-medium">
            Estado atual da base de contratos recorrentes.
          </p>
        </div>

        {contracts.length === 0 ? (
          <div className="h-[160px] flex items-center justify-center text-xs text-[var(--color-text-muted)]">
            Nenhum contrato cadastrado ainda.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
              <span className="text-[10px] text-[var(--color-text-faint)] font-bold uppercase tracking-wider block mb-1">
                MRR Ativo
              </span>
              <span className="text-2xl font-black text-[var(--color-text-primary)] font-mono">{formatCurrency(mrrAtivo)}</span>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{ativos.length} contrato(s) ativo(s)</p>
            </div>

            <div className="p-4 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
              <span className="text-[10px] text-[var(--color-text-faint)] font-bold uppercase tracking-wider block mb-1">
                MRR em Risco (Inadimplente)
              </span>
              <span className="text-2xl font-black text-danger font-mono">{formatCurrency(mrrEmRisco)}</span>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{emRisco.length} contrato(s)</p>
            </div>

            <div className="p-4 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
              <span className="text-[10px] text-[var(--color-text-faint)] font-bold uppercase tracking-wider block mb-1">
                Taxa de Inadimplência
              </span>
              <span className="text-2xl font-black text-[var(--color-text-primary)] font-mono">{taxaRisco.toFixed(1)}%</span>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">sobre {contracts.length} contrato(s) no total</p>
            </div>
          </div>
        )}
      </Card>
    </div>

    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
      <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2.5">
        <BarChart3 className="w-4 h-4 text-[var(--color-primary-blue)]" /> Distribuição de CLV (Valor Vitalício)
      </h3>
      <p className="text-xs text-[var(--color-text-muted)] mt-1 mb-4 font-medium">
        Tempo de contrato × MRR, por faixa de valor — quantos clientes reais caem em cada faixa.
      </p>
      {clvHistogram.bins.length === 0 ? (
        <div className="h-[140px] flex items-center justify-center text-xs text-[var(--color-text-muted)]">
          Sem contratos com data de assinatura válida o suficiente pra calcular.
        </div>
      ) : (
        <>
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
              <BarChart data={clvHistogram.bins}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={30} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-default)', borderRadius: '12px', fontSize: '11px' }}
                  formatter={(v: number) => [`${v} contrato(s)`, 'Quantidade']}
                />
                <Bar dataKey="count" name="Contratos" fill="var(--color-primary-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-[var(--color-text-faint)] mt-2">Baseado em {clvHistogram.sampleSize} contrato(s) com data de assinatura válida.</p>
        </>
      )}
    </Card>
    </motion.div>
  );
}
