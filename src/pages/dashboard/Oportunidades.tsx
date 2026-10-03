import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Workflow, ListChecks, Percent, Search } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../lib/utils";
import { situacaoDe, recomendacaoDe, getComercialFunilStageNames, type DashboardData } from "./revenueInsights";

type Filtro = "todas" | "prioritarias" | "risco" | "semContato" | "recuperaveis";

// Conteúdo da aba "Oportunidades" da Central de Receita — não confundir com
// ./pages/crm/Oportunidades.tsx (tabela simples de leads, página própria do
// módulo CRM); esta é a versão priorizada/acionável (situação + recomendação
// por lead), renderizada como aba desta página, não uma rota separada.
export default function Oportunidades({ dashboard }: { dashboard: DashboardData }) {
  const { funis, leadActivities } = useData();
  const { leads } = dashboard;
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");

  const stageNames = useMemo(() => getComercialFunilStageNames(funis), [funis]);

  const leadsAbertos = useMemo(() => (leads as any[]).filter((l) => l.status !== "Fechado" && l.status !== "Perdido"), [leads]);

  const atividadesPorLead = useMemo(() => {
    const map = new Map<string, number>();
    (leadActivities as any[]).forEach((a) => map.set(a.leadId, (map.get(a.leadId) || 0) + 1));
    return map;
  }, [leadActivities]);

  const classificados = useMemo(() => {
    return leadsAbertos.map((l: any) => {
      const sit = situacaoDe(l);
      const semContato = (atividadesPorLead.get(l.id) || 0) === 0;
      const recuperavel = (l.scoreIA ?? 0) > 70 && (Number(l.timeIdle) || 0) > 3 && parseCurrencyBR(l.value) > 0;
      const prioritaria = sit.tone === "destructive" || sit.tone === "warning";
      return { ...l, _val: parseCurrencyBR(l.value), _sit: sit, _semContato: semContato, _recuperavel: recuperavel, _prioritaria: prioritaria };
    });
  }, [leadsAbertos, atividadesPorLead]);

  const pipelineValue = classificados.reduce((s, l) => s + l._val, 0);
  const prioritarias = classificados.filter((l) => l._prioritaria);
  const semContato = classificados.filter((l) => l._semContato);
  const recuperaveis = classificados.filter((l) => l._recuperavel);
  const emRisco = classificados.filter((l) => l._sit.tone === "destructive");
  const probMedia = classificados.length > 0 ? Math.round(classificados.reduce((s, l) => s + (l.scoreIA ?? 0), 0) / classificados.length) : 0;

  const filtradas = useMemo(() => {
    let base = classificados;
    if (filtro === "prioritarias") base = prioritarias;
    else if (filtro === "risco") base = emRisco;
    else if (filtro === "semContato") base = semContato;
    else if (filtro === "recuperaveis") base = recuperaveis;
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      base = base.filter((l) => (l.company || l.name || "").toLowerCase().includes(q));
    }
    return [...base].sort((a, b) => b._val * (b.scoreIA ?? 0) - a._val * (a.scoreIA ?? 0));
  }, [filtro, classificados, prioritarias, emRisco, semContato, recuperaveis, busca]);

  const tabs: { id: Filtro; label: string; count: number }[] = [
    { id: "todas", label: "Todas", count: classificados.length },
    { id: "prioritarias", label: "Prioritárias", count: prioritarias.length },
    { id: "risco", label: "Em risco", count: emRisco.length },
    { id: "semContato", label: "Sem contato", count: semContato.length },
    { id: "recuperaveis", label: "Recuperáveis", count: recuperaveis.length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-[var(--color-text-primary)]">Oportunidades</h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Encontre, priorize e trabalhe as oportunidades que realmente podem gerar receita.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Workflow className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Oportunidades Ativas</span></div>
          <p className="text-2xl font-black text-[var(--color-text-primary)] font-mono mt-2">{classificados.length}</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><ListChecks className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Valor no Pipeline</span></div>
          <p className="text-2xl font-black text-[var(--color-text-primary)] font-mono mt-2">{formatCurrency(pipelineValue)}</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-danger/20">
          <div className="flex items-center gap-2 text-danger"><Flame className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Prioritárias</span></div>
          <p className="text-2xl font-black text-danger font-mono mt-2">{prioritarias.length}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-bold mt-1">{formatCurrency(prioritarias.reduce((s, l) => s + l._val, 0))}</p>
        </Card>
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 text-[var(--color-text-faint)]"><Percent className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider">Probabilidade Média</span></div>
          <p className="text-2xl font-black text-[var(--color-text-primary)] font-mono mt-2">{probMedia}%</p>
        </Card>
      </div>

      <Card className="overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
        <div className="p-4 border-b border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setFiltro(t.id)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${filtro === t.id ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar oportunidade..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-primary-blue)]/50 w-48"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
              <tr>
                <th className="px-4 py-2.5">Cliente/Lead</th>
                <th className="px-4 py-2.5">Valor</th>
                <th className="px-4 py-2.5">Etapa</th>
                <th className="px-4 py-2.5">Prob.</th>
                <th className="px-4 py-2.5">Último contato</th>
                <th className="px-4 py-2.5">Situação</th>
                <th className="px-4 py-2.5">Recomendação</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {filtradas.map((l) => (
                <tr key={l.id} className="hover:bg-[var(--color-surface-sunken)] transition-colors">
                  <td className="px-4 py-2.5 font-bold text-[var(--color-text-primary)] truncate max-w-[180px]">{l.company || l.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[var(--color-text-primary)]">{formatCurrency(l._val)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)] truncate max-w-[120px]">{stageNames[l.stageId] || "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{l.scoreIA ?? 0}%</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{l.timeIdle ? `há ${l.timeIdle} dias` : "—"}</td>
                  <td className="px-4 py-2.5"><Badge variant={l._sit.tone}>{l._sit.label}</Badge></td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{recomendacaoDe(l._sit.label)}</td>
                  <td className="px-4 py-2.5">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/app/crm/pipeline?leadId=${l.id}`)} className="h-7 px-2.5 text-[10px] font-bold">Abrir</Button>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--color-text-faint)]">Nenhuma oportunidade encontrada nesse filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
