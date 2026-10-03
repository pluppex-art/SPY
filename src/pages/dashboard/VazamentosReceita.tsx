import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, FileWarning, Flame, Workflow, UserX } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { useDashboard } from "./useDashboard";
import { RevenueBreadcrumb } from "./components/RevenueBreadcrumb";
import { diasDesde, computeVazamentos } from "./revenueInsights";

const MOTIVO_PALETTE: Record<string, string> = {
  "Propostas sem follow-up": "#ef4444",
  "Leads quentes sem contato": "#f59e0b",
  "Oportunidades paradas (+30d)": "var(--color-primary-blue)",
  "Clientes com risco de churn": "#14b8a6",
};

type Aba = "propostas" | "leads" | "paradas" | "churn";

export default function VazamentosReceita() {
  const { contracts, proposals } = useData();
  const { leads, dateFrom, setDateFrom, dateTo, setDateTo } = useDashboard();
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>("propostas");

  const leadsAbertos = useMemo(() => (leads as any[]).filter((l) => l.status !== "Fechado" && l.status !== "Perdido"), [leads]);
  const contratosEmRisco = useMemo(() => (contracts as any[]).filter((c) => c.status === "Inadimplente"), [contracts]);
  const propostasSemFollowUp = useMemo(
    () => (proposals as any[] || []).filter((p) => p.status === "Enviada" && diasDesde(p.created_at) > 5),
    [proposals]
  );
  const propostasSemFollowUpValue = propostasSemFollowUp.reduce((s, p) => s + parseCurrencyBR(p.valor), 0);
  const leadsQuentesParados = useMemo(
    () => leadsAbertos.filter((l: any) => (l.scoreIA ?? 0) > 70 && (Number(l.timeIdle) || 0) > 2),
    [leadsAbertos]
  );
  const oportunidadesParadas = useMemo(() => leadsAbertos.filter((l: any) => (Number(l.timeIdle) || 0) > 30), [leadsAbertos]);

  const vazamentos = useMemo(() => computeVazamentos({
    contratosEmRisco, oportunidadesParadas, leadsQuentesParados, propostasSemFollowUp, propostasSemFollowUpValue,
  }).map((v) => ({ ...v, color: MOTIVO_PALETTE[v.motivo] || "#94a3b8" })), [contratosEmRisco, oportunidadesParadas, leadsQuentesParados, propostasSemFollowUp, propostasSemFollowUpValue]);

  const totalVazamento = vazamentos.reduce((s, v) => s + v.valor, 0);

  const tabs: { id: Aba; label: string; count: number }[] = [
    { id: "propostas", label: "Propostas sem follow-up", count: propostasSemFollowUp.length },
    { id: "leads", label: "Leads quentes sem contato", count: leadsQuentesParados.length },
    { id: "paradas", label: "Oportunidades paradas", count: oportunidadesParadas.length },
    { id: "churn", label: "Clientes em risco", count: contratosEmRisco.length },
  ];

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <RevenueBreadcrumb current="Vazamentos de Receita" />
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] mt-1 flex items-center gap-2">
            Vazamentos de Receita <span className="w-2 h-2 rounded-full bg-danger" />
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Encontre e recupere receita que está sendo perdida na sua operação.</p>
        </div>
        <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
      </div>

      <Card className="p-5 bg-danger/5 border border-danger/20">
        <div className="flex items-center gap-2 text-danger"><AlertTriangle className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Receita Potencial Subaproveitada</span></div>
        <p className="text-3xl font-black text-danger font-mono mt-2">{formatCurrency(totalVazamento)}</p>
        <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">
          Identificada em {propostasSemFollowUp.length + leadsQuentesParados.length + oportunidadesParadas.length + contratosEmRisco.length} oportunidade(s)
        </p>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><FileWarning className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Propostas sem Follow-up</span></div>
          <p className="text-xl font-black text-[var(--color-text-primary)] font-mono mt-2">{formatCurrency(propostasSemFollowUpValue)}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{propostasSemFollowUp.length} proposta{propostasSemFollowUp.length === 1 ? "" : "s"}</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Flame className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Leads Quentes sem Contato</span></div>
          <p className="text-xl font-black text-[var(--color-text-primary)] font-mono mt-2">{formatCurrency(leadsQuentesParados.reduce((s: number, l: any) => s + parseCurrencyBR(l.value), 0))}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{leadsQuentesParados.length} lead{leadsQuentesParados.length === 1 ? "" : "s"}</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Workflow className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Oportunidades Paradas</span></div>
          <p className="text-xl font-black text-[var(--color-text-primary)] font-mono mt-2">{formatCurrency(oportunidadesParadas.reduce((s: number, l: any) => s + parseCurrencyBR(l.value), 0))}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{oportunidadesParadas.length} oportunidade{oportunidadesParadas.length === 1 ? "" : "s"}</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><UserX className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Clientes com Risco de Churn</span></div>
          <p className="text-xl font-black text-[var(--color-text-primary)] font-mono mt-2">{formatCurrency(contratosEmRisco.reduce((s, c) => s + parseCurrencyBR(c.mrr), 0))}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{contratosEmRisco.length} cliente{contratosEmRisco.length === 1 ? "" : "s"}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-4 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4">Onde está o vazamento?</h3>
          {vazamentos.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] italic flex-1 flex items-center justify-center">Nenhum vazamento identificado.</p>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="relative h-[120px] w-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={vazamentos} cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={3} dataKey="valor" stroke="none">
                      {vazamentos.map((v, i) => <Cell key={i} fill={v.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 }} formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[11px] font-black text-[var(--color-text-primary)] font-mono">{formatCurrency(totalVazamento)}</span>
                </div>
              </div>
              <div className="w-full space-y-1.5">
                {vazamentos.map((v) => (
                  <div key={v.motivo} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                    <span className="text-[10px] text-[var(--color-text-muted)] font-semibold truncate flex-1">{v.motivo}</span>
                    <span className="text-[10px] font-bold text-[var(--color-text-primary)] tabular-nums">{totalVazamento > 0 ? Math.round((v.valor / totalVazamento) * 1000) / 10 : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-3 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4">Impacto no Resultado</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] mb-3">Se recuperarmos parte dessas oportunidades:</p>
          <div className="space-y-2.5">
            {[["Cenário Conservador", 0.3], ["Cenário Realista", 0.5], ["Cenário Otimista", 0.7]].map(([label, pct]) => (
              <div key={label as string} className="flex items-center justify-between bg-[var(--color-surface-sunken)] rounded-xl px-3.5 py-2.5">
                <div>
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">{label}</p>
                  <p className="text-[10px] text-[var(--color-text-faint)]">{Math.round((pct as number) * 100)}% de recuperação</p>
                </div>
                <span className="text-sm font-black font-mono text-[var(--color-primary-blue)]">{formatCurrency(totalVazamento * (pct as number))}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-5 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-3 border-b border-[var(--color-border-subtle)] flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setAba(t.id)}
                className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${aba === t.id ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]"}`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
          <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)] sticky top-0">
                <tr><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">Dias</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {aba === "propostas" && propostasSemFollowUp.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-bold text-[var(--color-text-primary)] truncate max-w-[110px]">{p.cliente || p.titulo || "Proposta"}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-primary)]">{formatCurrency(parseCurrencyBR(p.valor))}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{diasDesde(p.created_at)}</td>
                    <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => navigate("/app/crm/propostas")} className="h-6 px-2 text-[9px] font-bold">Ver</Button></td>
                  </tr>
                ))}
                {aba === "leads" && leadsQuentesParados.map((l: any) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 font-bold text-[var(--color-text-primary)] truncate max-w-[110px]">{l.company || l.name}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-primary)]">{formatCurrency(parseCurrencyBR(l.value))}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{l.timeIdle}</td>
                    <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => navigate(`/app/crm/pipeline?leadId=${l.id}`)} className="h-6 px-2 text-[9px] font-bold">Ver</Button></td>
                  </tr>
                ))}
                {aba === "paradas" && oportunidadesParadas.map((l: any) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 font-bold text-[var(--color-text-primary)] truncate max-w-[110px]">{l.company || l.name}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-primary)]">{formatCurrency(parseCurrencyBR(l.value))}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{l.timeIdle}</td>
                    <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => navigate(`/app/crm/pipeline?leadId=${l.id}`)} className="h-6 px-2 text-[9px] font-bold">Ver</Button></td>
                  </tr>
                ))}
                {aba === "churn" && contratosEmRisco.map((c: any) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 font-bold text-[var(--color-text-primary)] truncate max-w-[110px]">{c.client}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-primary)]">{formatCurrency(parseCurrencyBR(c.mrr))}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">—</td>
                    <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => navigate("/app/financeiro/contratos")} className="h-6 px-2 text-[9px] font-bold">Ver</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {((aba === "propostas" && propostasSemFollowUp.length === 0) ||
              (aba === "leads" && leadsQuentesParados.length === 0) ||
              (aba === "paradas" && oportunidadesParadas.length === 0) ||
              (aba === "churn" && contratosEmRisco.length === 0)) && (
              <p className="px-4 py-8 text-center text-[var(--color-text-faint)] text-xs">Nada nesse grupo — ótimo sinal.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
