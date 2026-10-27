import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { supabase } from "../../../lib/supabase";
import { cn } from "../../../lib/utils";

interface TimelineSectionProps {
  lead: any;
}

interface Venda {
  id: string;
  date: string;
  description: string;
  detail: string;
  status: string;
  value: number;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (raw: string) => {
  const d = new Date(raw?.length === 10 ? `${raw}T12:00:00` : raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleDateString("pt-BR");
};

const isPago = (status?: string) => /pago|receb/i.test(status || "");

// Vendas já sincronizadas junto com o lead (customFields.reservationsHistory,
// preenchido pelo server.ts a cada reserva): só entra o que foi pago.
function vendasDoLead(lead: any): Venda[] {
  const history: any[] = Array.isArray(lead?.customFields?.reservationsHistory)
    ? lead.customFields.reservationsHistory
    : [];
  return history
    .filter((r) => isPago(r.paymentStatus) && Number(r.totalValue) > 0)
    .map((r) => ({
      id: String(r.id),
      date: r.date || r.createdAt || "",
      description: `Reserva${r.eventType ? ` - ${r.eventType}` : ""}`,
      detail: [
        typeof r.peopleCount === "number" ? `${r.peopleCount} pessoa${r.peopleCount > 1 ? "s" : ""}` : null,
        typeof r.laneCount === "number" ? `${r.laneCount} pista${r.laneCount > 1 ? "s" : ""}` : null,
      ].filter(Boolean).join(" · "),
      status: r.paymentStatus,
      value: Number(r.totalValue) || 0,
    }));
}

/**
 * Histórico de vendas do lead: quantas vendas já fez e a timeline delas.
 * Usa o histórico que já vem sincronizado com o lead; sem ele, cai nas
 * receitas do cliente vinculado (finance_entries.contato_id). Vale para
 * qualquer tenant, com ou sem agenda.
 */
export function TimelineSection({ lead }: TimelineSectionProps) {
  const doLead = vendasDoLead(lead);
  const [doFinanceiro, setDoFinanceiro] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(false);
  const usaFinanceiro = doLead.length === 0 && !!lead?.clientId;

  useEffect(() => {
    if (!supabase || !usaFinanceiro) { setDoFinanceiro([]); return; }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("finance_entries")
      .select("id, description, category, status, value, date, payment_method")
      .eq("contato_id", lead.clientId)
      .eq("type", "Receber")
      .gt("value", 0)
      .order("date", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setDoFinanceiro((data || []).map((e: any) => ({
          id: e.id,
          date: e.date,
          description: e.description,
          detail: [e.category, e.payment_method].filter(Boolean).join(" · "),
          status: e.status,
          value: Number(e.value) || 0,
        })));
        setLoading(false);
      }, () => { if (!cancelled) { setDoFinanceiro([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [lead?.clientId, usaFinanceiro]);

  const vendas = [...(doLead.length > 0 ? doLead : doFinanceiro)]
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  const total = vendas.reduce((acc, v) => acc + v.value, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Vendas", value: String(vendas.length) },
          { label: "Total vendido", value: brl(total) },
          { label: "Última venda", value: vendas[0] ? formatDate(vendas[0].date) : "—" },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-3 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-center">
            <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">{kpi.label}</p>
            <p className="text-sm font-black text-[var(--color-text-primary)] mt-1 whitespace-nowrap">{kpi.value}</p>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
          Histórico de vendas
        </h4>

        {loading ? (
          <p className="text-xs text-[var(--color-text-faint)] py-6 text-center">Carregando…</p>
        ) : vendas.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhuma venda registrada"
            description="As vendas deste lead aparecem aqui."
            className="py-8"
          />
        ) : (
          <ol className="relative border-l border-[var(--color-border-default)] ml-3 space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {vendas.map((v) => (
              <li key={v.id} className="ml-5">
                <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-[var(--color-primary-blue)] ring-4 ring-[var(--color-surface-elevated)]" />
                <Card className="p-3 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono text-[var(--color-text-faint)]">{formatDate(v.date)}</p>
                      <p className="text-xs font-bold text-[var(--color-text-primary)] break-words">{v.description}</p>
                      {v.detail && <p className="text-[10px] text-[var(--color-text-muted)] break-words">{v.detail}</p>}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="text-xs font-black text-emerald-500 whitespace-nowrap">{brl(v.value)}</p>
                      <span className={cn(
                        "inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border",
                        isPago(v.status)
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/25",
                      )}>
                        {v.status}
                      </span>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
