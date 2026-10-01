import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import {
  Users, TrendingUp, TrendingDown, Target, DollarSign, Wallet, AlertTriangle,
  Building2, CalendarCheck, ListChecks, Loader2, RefreshCw, BarChart3,
} from "lucide-react";
import { Card } from "../../../components/ui/card";
import { DateRangeFilter } from "../../../components/ui/DateRangeFilter";
import { EmptyState } from "../../../components/ui/empty-state";
import { useAuth } from "../../../contexts/AuthContext";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { apiFetch } from "../../../lib/apiClient";

// Paleta de categorias sem contagem fixa (origens de lead variam por tenant)
// — cor da marca pra fatia mais relevante + tons neutros de cinza, em vez do
// arco-íris antigo (regra de cores do dashboard: só branco/cinza/cor do
// tenant). Cicla se houver mais origens que tons.
const COLORS = [
  "var(--color-primary-blue)",
  "var(--color-text-primary)",
  "var(--color-text-muted)",
  "var(--color-text-faint)",
  "var(--color-border-default)",
];

interface BiSummary {
  periodo: { from: string; to: string };
  crm: {
    leadsCadastrados: number;
    leadsNovosNoPeriodo: number;
    leadsPorEtapa: Record<string, number>;
    negociosGanhos: number;
    negociosPerdidos: number;
    taxaConversao: number;
    valorTotalOportunidades: number;
    valorGanho: number;
    ticketMedio: number;
    origemLeads: Record<string, number>;
    distribuicaoPorVendedor: Record<string, { leads: number; ganhos: number; valorGanho: number }>;
    evolucaoVendas: { mes: string; valorGanho: number; negociosGanhos: number; leadsNovos: number }[];
  };
  financeiro: {
    receitaRecebida: number;
    despesasPagas: number;
    saldoPeriodo: number;
    receitaAReceber: { value: number; count: number };
    despesasAPagar: { value: number; count: number };
    inadimplenciaReceber: { value: number; count: number };
    taxaInadimplenciaContratos: number;
    evolucaoFinanceira: { mes: string; receita: number; despesa: number; resultado: number }[];
  };
  operacional: {
    clientesAtivos: number;
    clientesNovos: number;
    reunioes: { total: number; concluidas: number; pendentes: number };
    tarefas: { total: number; concluidas: number; pendentes: number };
    produtividadePorResponsavel: Record<string, { total: number; concluidas: number }>;
  };
  cachedAt: string;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Eixo Y dos gráficos em R$ mostrava o número cru (ex.: "15000") — formato
// curto ("R$15k") deixa o eixo legível sem precisar passar o mouse; o
// tooltip continua mostrando o valor completo formatado.
function tickCurrencyShort(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return `R$${(v / 1000).toFixed(0)}k`;
  return `R$${v}`;
}

const kpiCardClass = "p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm";
const kpiLabelClass = "text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] flex items-center gap-1.5 mb-1.5";
const kpiValueClass = "text-xl font-black text-[var(--color-text-primary)] font-mono tracking-tight";

export function BusinessIntelligenceView() {
  const { activeTenantId } = useAuth();
  const { funis } = useData();
  const { formatCurrency } = useLocalization();

  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [summary, setSummary] = useState<BiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // "Tudo" (dateFrom/dateTo nulos, ver DateRangeFilter) precisa virar um
    // range explícito bem largo — se omitir os parâmetros, o endpoint cai no
    // default dele (últimos 12 meses), que não é o mesmo que "sem filtro".
    const from = dateFrom || "2000-01-01";
    const to = dateTo || toIso(new Date());
    apiFetch(`/api/dashboard/bi-summary?tenantId=${encodeURIComponent(activeTenantId)}&from=${from}&to=${to}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((err) => { if (!cancelled) setError(err?.message || "Falha ao carregar indicadores."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeTenantId, dateFrom, dateTo, refreshKey]);

  const stageLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of (funis as any[]) || []) {
      for (const s of f.stages || f.etapas || []) {
        if (s?.id) map.set(String(s.id), s.name || s.nome || s.id);
      }
    }
    return map;
  }, [funis]);

  const leadsPorEtapaData = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.crm.leadsPorEtapa)
      .map(([stageId, count]) => ({ name: stageLabels.get(stageId) || (stageId === "sem-etapa" ? "Sem etapa" : stageId), value: count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [summary, stageLabels]);

  const origemData = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.crm.origemLeads)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [summary]);

  const vendedorData = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.crm.distribuicaoPorVendedor)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.valorGanho - a.valorGanho)
      .slice(0, 10);
  }, [summary]);

  if (loading && !summary) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-[var(--color-text-muted)]">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-xs font-bold">Calculando indicadores...</span>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Não foi possível carregar o BI"
        description={error}
        action={
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-primary-blue)] hover:underline"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
        }
      />
    );
  }

  if (!summary) return null;

  const noDataAtAll = summary.crm.leadsCadastrados === 0 && summary.financeiro.receitaRecebida === 0 && summary.operacional.clientesAtivos === 0;

  return (
    <motion.div
      key="bi"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-6 text-left"
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-black text-[var(--color-text-primary)] uppercase tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-[var(--color-primary-blue)]" /> Dashboard / BI
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 font-medium">
            CRM, Financeiro e Operacional consolidados — calculado no servidor, sem carregar a base inteira no navegador.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Atualizar"
            className="flex items-center justify-center w-[38px] h-[38px] rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {noDataAtAll ? (
        <EmptyState
          icon={BarChart3}
          title="Ainda não há dados suficientes"
          description="Assim que houver leads, propostas ou lançamentos financeiros no período selecionado, os indicadores aparecem aqui."
        />
      ) : (
        <>
          {/* ── CRM / VENDAS ── */}
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] flex items-center gap-1.5 mb-2">
              <Target className="w-3 h-3" /> CRM / Vendas
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><Users className="w-3 h-3" /> Leads Cadastrados</div>
                <div className={kpiValueClass}>{summary.crm.leadsCadastrados}</div>
                <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">{summary.crm.leadsNovosNoPeriodo} novos no período</div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><TrendingUp className="w-3 h-3 text-success" /> Negócios Ganhos</div>
                <div className="text-xl font-black text-success font-mono tracking-tight">{summary.crm.negociosGanhos}</div>
                <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">Taxa de conversão: {summary.crm.taxaConversao}%</div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><TrendingDown className="w-3 h-3 text-danger" /> Negócios Perdidos</div>
                <div className="text-xl font-black text-danger font-mono tracking-tight">{summary.crm.negociosPerdidos}</div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><DollarSign className="w-3 h-3" /> Ticket Médio</div>
                <div className={kpiValueClass}>{formatCurrency(summary.crm.ticketMedio)}</div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><DollarSign className="w-3 h-3" /> Valor Total Oportunidades</div>
                <div className={kpiValueClass}>{formatCurrency(summary.crm.valorTotalOportunidades)}</div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><DollarSign className="w-3 h-3 text-success" /> Valor Ganho</div>
                <div className="text-xl font-black text-success font-mono tracking-tight">{formatCurrency(summary.crm.valorGanho)}</div>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-4 mt-4">
              <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
                <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-2">Evolução de Vendas (por mês)</span>
                {summary.crm.evolucaoVendas.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-faint)] py-8 text-center">Sem dados no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={summary.crm.evolucaoVendas.map((d) => ({ ...d, mesLabel: monthLabel(d.mes) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                      <XAxis dataKey="mesLabel" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={tickCurrencyShort} width={56} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Line type="monotone" dataKey="valorGanho" name="Valor Ganho" stroke="var(--color-success)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
                <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-2">Leads por Etapa do Pipeline</span>
                {leadsPorEtapaData.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-faint)] py-8 text-center">Sem leads.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={leadsPorEtapaData} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip />
                      <Bar dataKey="value" name="Leads" fill="var(--color-primary-blue)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
                <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-2">Origem dos Leads</span>
                {origemData.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-faint)] py-8 text-center">Sem dados no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      {/* Rótulo direto na fatia (nome completo da origem) sobrepunha
                          quando havia várias origens finas — trocado por legenda
                          própria (nomes) + a fatia mostra só o número no hover. */}
                      <Pie data={origemData} dataKey="value" nameKey="name" cx="42%" cy="50%" outerRadius={80}>
                        {origemData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
                <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-2">Distribuição por Vendedor</span>
                {vendedorData.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-faint)] py-8 text-center">Sem dados no período.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-thin pr-1">
                    {vendedorData.map((v) => (
                      <div key={v.name} className="flex items-center justify-between text-xs bg-[var(--color-surface-sunken)] px-3 py-2 rounded-lg">
                        <span className="font-bold text-[var(--color-text-primary)] truncate">{v.name}</span>
                        <span className="flex items-center gap-3 shrink-0 font-mono">
                          <span className="text-[var(--color-text-faint)]">{v.leads} leads</span>
                          <span className="text-success font-bold">{v.ganhos} ganhos</span>
                          <span className="text-[var(--color-text-primary)] font-bold">{formatCurrency(v.valorGanho)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* ── FINANCEIRO ── */}
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] flex items-center gap-1.5 mb-2 mt-2">
              <Wallet className="w-3 h-3" /> Financeiro
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><TrendingUp className="w-3 h-3 text-success" /> Receita Recebida</div>
                <div className="text-xl font-black text-success font-mono tracking-tight">{formatCurrency(summary.financeiro.receitaRecebida)}</div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><TrendingDown className="w-3 h-3 text-danger" /> Despesas Pagas</div>
                <div className="text-xl font-black text-danger font-mono tracking-tight">{formatCurrency(summary.financeiro.despesasPagas)}</div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><DollarSign className="w-3 h-3" /> Saldo do Período</div>
                <div className={`text-xl font-black font-mono tracking-tight ${summary.financeiro.saldoPeriodo >= 0 ? "text-success" : "text-danger"}`}>
                  {formatCurrency(summary.financeiro.saldoPeriodo)}
                </div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><AlertTriangle className="w-3 h-3 text-warning" /> Inadimplência (Receber)</div>
                <div className="text-xl font-black text-warning font-mono tracking-tight">{formatCurrency(summary.financeiro.inadimplenciaReceber.value)}</div>
                <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">{summary.financeiro.inadimplenciaReceber.count} lançamento(s) em atraso</div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><DollarSign className="w-3 h-3" /> A Receber</div>
                <div className={kpiValueClass}>{formatCurrency(summary.financeiro.receitaAReceber.value)}</div>
                <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">{summary.financeiro.receitaAReceber.count} lançamento(s)</div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><DollarSign className="w-3 h-3" /> A Pagar</div>
                <div className={kpiValueClass}>{formatCurrency(summary.financeiro.despesasAPagar.value)}</div>
                <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">{summary.financeiro.despesasAPagar.count} lançamento(s)</div>
              </Card>
            </div>

            <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm mt-4">
              <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-2">Receita x Despesa por Mês</span>
              {summary.financeiro.evolucaoFinanceira.length === 0 ? (
                <p className="text-xs text-[var(--color-text-faint)] py-8 text-center">Sem lançamentos pagos no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={summary.financeiro.evolucaoFinanceira.map((d) => ({ ...d, mesLabel: monthLabel(d.mes) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                    <XAxis dataKey="mesLabel" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={tickCurrencyShort} width={56} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="receita" name="Receita" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesa" name="Despesa" fill="var(--color-danger)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* ── OPERACIONAL ── */}
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] flex items-center gap-1.5 mb-2 mt-2">
              <Building2 className="w-3 h-3" /> Operacional
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><Building2 className="w-3 h-3" /> Clientes Ativos</div>
                <div className={kpiValueClass}>{summary.operacional.clientesAtivos}</div>
                <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">{summary.operacional.clientesNovos} novos no período</div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><CalendarCheck className="w-3 h-3" /> Reuniões</div>
                <div className={kpiValueClass}>{summary.operacional.reunioes.total}</div>
                <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
                  <span className="text-success font-bold">{summary.operacional.reunioes.concluidas} concluídas</span> · {summary.operacional.reunioes.pendentes} agendadas
                </div>
              </Card>
              <Card className={kpiCardClass}>
                <div className={kpiLabelClass}><ListChecks className="w-3 h-3" /> Tarefas</div>
                <div className={kpiValueClass}>{summary.operacional.tarefas.total}</div>
                <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
                  <span className="text-success font-bold">{summary.operacional.tarefas.concluidas} concluídas</span> · {summary.operacional.tarefas.pendentes} pendentes
                </div>
              </Card>
            </div>

            {Object.keys(summary.operacional.produtividadePorResponsavel).length > 0 && (
              <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm mt-4">
                <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-2">Produtividade por Responsável (tarefas + reuniões)</span>
                <div className="space-y-1.5">
                  {Object.entries(summary.operacional.produtividadePorResponsavel)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .slice(0, 10)
                    .map(([name, v]) => (
                      <div key={name} className="flex items-center justify-between text-xs bg-[var(--color-surface-sunken)] px-3 py-2 rounded-lg">
                        <span className="font-bold text-[var(--color-text-primary)] truncate">{name}</span>
                        <span className="font-mono">
                          <span className="text-success font-bold">{v.concluidas}</span>
                          <span className="text-[var(--color-text-faint)]"> / {v.total}</span>
                        </span>
                      </div>
                    ))}
                </div>
              </Card>
            )}
          </div>

          <p className="text-[10px] text-[var(--color-text-faint)] text-right">
            Calculado no servidor às {new Date(summary.cachedAt).toLocaleString("pt-BR")} · período {summary.periodo.from} a {summary.periodo.to}
          </p>
        </>
      )}
    </motion.div>
  );
}
