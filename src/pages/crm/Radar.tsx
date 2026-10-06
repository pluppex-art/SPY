import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radar as RadarIcon, Flame, Clock } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { PageContainer } from "../../components/PageContainer";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { isLeadOpen } from "../../lib/leadStatus";
import { parseCurrencyBR } from "../../lib/utils";

type Risk = "critico" | "alto" | "atencao";
const RISK_META: Record<Risk, { label: string; variant: "destructive" | "warning" | "info" }> = {
  critico: { label: "Crítico", variant: "destructive" }, alto: { label: "Alto", variant: "warning" }, atencao: { label: "Atenção", variant: "info" },
};
// Limiares fixos de severidade (dias parado) — não mudam com o seletor "sem
// contato há pelo menos N dias" abaixo, que só define o piso de inclusão na
// lista. Antes os dois ficavam acoplados (crítico = days*4), então "Crítico"
// significava uma coisa com o filtro em 3 dias e outra bem diferente com o
// filtro em 30 — aqui o rótulo sempre representa a mesma gravidade real.
const CRITICO_DIAS = 14;
const ALTO_DIAS = 7;

export default function Radar() {
  const { leads } = useData();
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();
  const [days, setDays] = useState(3);
  const [vendedor, setVendedor] = useState("todos");
  const [riskFilter, setRiskFilter] = useState<Risk | null>(null);

  const rows = useMemo(() => {
    return (leads as any[])
      .filter((l) => !l.deleted_at && isLeadOpen(l.status))
      .map((l) => {
        // `timeIdle` já é calculado ao vivo em DataContext.mapLeadRow a partir
        // de updated_at/created_at — mesma fonte usada no badge do Kanban e em
        // todos os outros dashboards. `last_contact_at` (usado aqui antes) só é
        // preenchido para leads importados de uma integração Kommo, então ficava
        // null pra quase todo lead nativo do SPY e a tela caía sempre no "nunca
        // contatado", mesmo em leads com histórico de ligação/e-mail registrado.
        const idle = Math.max(0, Number(l.timeIdle) || 0);
        const risk: Risk = idle >= CRITICO_DIAS ? "critico" : idle >= ALTO_DIAS ? "alto" : "atencao";
        return { l, idle, risk, value: parseCurrencyBR(l.value) };
      })
      .filter((r) => r.idle >= days)
      .sort((a, b) => b.idle - a.idle);
  }, [leads, days]);

  const vendedores = useMemo(
    () => Array.from(new Set(rows.map((r) => r.l.seller).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(
    () => rows
      .filter((r) => vendedor === "todos" || r.l.seller === vendedor)
      .filter((r) => !riskFilter || r.risk === riskFilter),
    [rows, vendedor, riskFilter]
  );

  const counts = useMemo(() => ({
    critico: rows.filter((r) => r.risk === "critico").length,
    alto: rows.filter((r) => r.risk === "alto").length,
    atencao: rows.filter((r) => r.risk === "atencao").length,
  }), [rows]);
  const valorEmRisco = useMemo(() => rows.reduce((s, r) => s + r.value, 0), [rows]);
  const visible = filtered.slice(0, 200);

  const toggleRisk = (k: Risk) => setRiskFilter((cur) => (cur === k ? null : k));

  return (
    <PageContainer title="Radar" subtitle="Negócios em aberto que esfriaram — retome antes de perder.">
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        {(["critico", "alto", "atencao"] as Risk[]).map((k) => (
          <Card
            key={k}
            onClick={() => toggleRisk(k)}
            className={`p-4 flex items-center justify-between cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${riskFilter === k ? "ring-2 ring-[var(--color-primary-blue)]" : ""}`}
          >
            <div>
              <div className="text-xs text-[var(--color-text-muted)]">{RISK_META[k].label}</div>
              <div className="text-2xl font-black">{counts[k]}</div>
            </div>
            {k === "critico" ? <Flame className="w-6 h-6 text-danger" /> : k === "alto" ? <Clock className="w-6 h-6 text-warning" /> : <RadarIcon className="w-6 h-6 text-info" />}
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm flex items-center gap-2">Sem contato há pelo menos
            <select className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-2 py-1 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 2, 3, 5, 7, 14, 30].map((d) => <option key={d} value={d}>{d} dia{d > 1 ? "s" : ""}</option>)}
            </select>
          </label>
          {vendedores.length > 1 && (
            <label className="text-sm flex items-center gap-2">Vendedor
              <select className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-2 py-1 text-sm" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
                <option value="todos">Todos</option>
                {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          )}
          {riskFilter && (
            <button type="button" onClick={() => setRiskFilter(null)} className="text-xs font-bold text-[var(--color-primary-blue)] hover:underline">
              Limpar filtro de risco
            </button>
          )}
          <span className="text-xs text-[var(--color-text-muted)] ml-auto">
            {filtered.length} lead(s){filtered.length > visible.length ? ` (mostrando ${visible.length})` : ""} · {formatCurrency(valorEmRisco)} em risco no total
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Nenhum negócio esfriando. 🎯</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)]">
                <tr>
                  <th className="px-3 py-2">Lead</th>
                  <th className="px-3 py-2">Empresa</th>
                  <th className="px-3 py-2">Vendedor</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Parado há</th>
                  <th className="px-3 py-2">Risco</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {visible.map(({ l, idle, risk, value }) => (
                  <tr key={l.id} className="cursor-pointer hover:bg-[var(--color-surface-sunken)] transition-colors" onClick={() => navigate(`/app/crm/pipeline?lead=${l.id}`)}>
                    <td className="px-3 py-2.5 font-bold text-[var(--color-text-primary)] truncate max-w-[160px]">{l.name || l.company || "Sem nome"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)] truncate max-w-[140px]">{l.company || "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)] truncate max-w-[120px]">{l.seller || "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)] truncate max-w-[120px]">{l.status || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-[var(--color-text-primary)] text-right">{value > 0 ? formatCurrency(value) : "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-[var(--color-text-muted)] text-right">{idle}d</td>
                    <td className="px-3 py-2.5"><Badge variant={RISK_META[risk].variant}>{RISK_META[risk].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
