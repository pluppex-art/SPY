import { useEffect, useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { supabase } from "../../../lib/supabase";
import { useData } from "../../../contexts/DataContext";
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
  if (!raw) return "—";
  const d = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleDateString("pt-BR");
};

const isPago = (status?: string) => /pago|receb|ganho/i.test(status || "");
const toNumber = (v: unknown) => {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const join = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(" · ");

// Convenção do endpoint /api/v1/finance-entries: o lançamento de cada item
// integrado (ex.: reserva) tem id "tnp_fat_<externalId>".
const financeIdOf = (externalId: string) => `tnp_fat_${externalId}`;

type FinanceRow = { id: string; description: string; category: string | null; status: string; value: number | string; date: string; payment_method: string | null; proposal_id: string | null };
const FINANCE_COLS = "id, description, category, status, value, date, payment_method, proposal_id";

/**
 * Histórico de vendas do lead: quantas vendas já fez e a timeline delas.
 * Junta, nesta ordem, o que existir para o lead:
 *  1. reservas pagas sincronizadas (customFields.reservationsHistory), com a
 *     forma de pagamento vinda do lançamento financeiro da reserva;
 *  2. propostas do lead com seus recebimentos (finance_entries.proposal_id),
 *     uma venda por proposta, com as parcelas;
 *  3. recebimentos do cliente vinculado (finance_entries.contato_id);
 *  4. o próprio ganho do lead (status Fechado), quando não há nada acima:
 *     valor, forma de pagamento e data gravados no lead.
 * Vale para qualquer tenant, com ou sem agenda.
 */
export function TimelineSection({ lead }: TimelineSectionProps) {
  const { proposals } = useData();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(false);

  const reservas: any[] = useMemo(() => {
    const h = lead?.customFields?.reservationsHistory;
    return Array.isArray(h) ? h : [];
  }, [lead?.customFields?.reservationsHistory]);

  const propostas: any[] = useMemo(
    () => (proposals || []).filter((p: any) => (p.lead_id ?? p.leadId) === lead?.id && !["Recusada", "Rascunho", "Cancelada"].includes(p.status)),
    [proposals, lead?.id],
  );

  useEffect(() => {
    if (!lead?.id) { setVendas([]); return; }
    let cancelled = false;
    setLoading(true);

    const carregar = async (): Promise<Venda[]> => {
      const out: Venda[] = [];

      // 1) Reservas pagas (mesma regra do sync: Check-in/Confirmada + Pago)
      const pagas = reservas.filter((r) => ["Check-in", "Confirmada"].includes(r.status) && /pago/i.test(r.paymentStatus || "") && toNumber(r.totalValue) > 0);
      if (pagas.length > 0) {
        const fin = new Map<string, FinanceRow>();
        if (supabase) {
          const { data } = await supabase.from("finance_entries").select(FINANCE_COLS).in("id", pagas.map((r) => financeIdOf(String(r.id))));
          (data || []).forEach((f: any) => fin.set(f.id, f));
        }
        for (const r of pagas) {
          const f = fin.get(financeIdOf(String(r.id)));
          if (f && toNumber(f.value) <= 0) continue; // retratada (cancelada/reembolsada depois)
          out.push({
            id: `res-${r.id}`,
            date: r.date || r.createdAt || "",
            description: `Reserva${r.eventType ? ` - ${r.eventType}` : ""}`,
            detail: join(
              typeof r.peopleCount === "number" && `${r.peopleCount} pessoa${r.peopleCount > 1 ? "s" : ""}`,
              typeof r.laneCount === "number" && `${r.laneCount} pista${r.laneCount > 1 ? "s" : ""}`,
              f?.payment_method,
            ),
            status: "Pago",
            value: toNumber(r.totalValue),
          });
        }
      }

      // 2) Propostas do lead e os recebimentos delas (uma venda por proposta)
      if (propostas.length > 0 && supabase) {
        const { data } = await supabase.from("finance_entries").select(FINANCE_COLS)
          .in("proposal_id", propostas.map((p: any) => p.id)).eq("type", "Receber");
        const rows = (data || []) as FinanceRow[];
        for (const p of propostas) {
          const parcelas = rows.filter((f) => f.proposal_id === p.id);
          const total = parcelas.length > 0 ? parcelas.reduce((s, f) => s + toNumber(f.value), 0) : toNumber(p.valor);
          if (total <= 0) continue;
          const pagas2 = parcelas.filter((f) => isPago(f.status)).length;
          const metodo = parcelas.find((f) => f.payment_method)?.payment_method;
          out.push({
            id: `prop-${p.id}`,
            date: parcelas.length > 0 ? parcelas.map((f) => f.date).sort()[0] : (p.created_at || p.date || ""),
            description: p.title || p.titulo || p.name || "Proposta",
            detail: join(parcelas.length > 1 ? `${pagas2}/${parcelas.length} parcelas pagas` : null, metodo),
            status: p.status === "Aceita" ? (parcelas.length > 0 && pagas2 < parcelas.length ? "Em andamento" : "Pago") : p.status,
            value: total,
          });
        }
      }

      // 3) Recebimentos do cliente vinculado (se nada acima explicou a venda)
      if (out.length === 0 && lead.clientId && supabase) {
        const { data } = await supabase.from("finance_entries").select(FINANCE_COLS)
          .eq("contato_id", lead.clientId).eq("type", "Receber").gt("value", 0)
          .order("date", { ascending: false }).limit(200);
        for (const f of (data || []) as FinanceRow[]) {
          out.push({
            id: `fin-${f.id}`, date: f.date, description: f.description,
            detail: join(f.category, f.payment_method), status: f.status, value: toNumber(f.value),
          });
        }
      }

      // 4) O ganho do próprio lead (Fechado) quando não há registro financeiro
      if (out.length === 0 && lead.status === "Fechado" && !lead._somenteCliente) {
        const cf = lead.customFields || {};
        const parcelas = toNumber(cf.parcelas ?? cf.installments);
        out.push({
          id: `ganho-${lead.id}`,
          date: cf.dataPagamento || lead.date || lead.createdAt || "",
          description: lead.company || lead.name ? `Venda fechada - ${lead.company || lead.name}` : "Venda fechada",
          detail: join(cf.formaPagamento, cf.detalhesPagamento, parcelas > 1 && `${parcelas}x`),
          status: "Ganho",
          value: toNumber(lead.value),
        });
      }

      return out;
    };

    carregar()
      .then((r) => { if (!cancelled) setVendas(r); })
      .catch(() => { if (!cancelled) setVendas([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lead?.id, lead?.clientId, lead?.status, lead?.value, reservas, propostas]);

  const ordenadas = useMemo(
    () => [...vendas].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0)),
    [vendas],
  );
  const total = ordenadas.reduce((acc, v) => acc + v.value, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Vendas", value: String(ordenadas.length) },
          { label: "Total vendido", value: brl(total) },
          { label: "Última venda", value: ordenadas[0] ? formatDate(ordenadas[0].date) : "—" },
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
        ) : ordenadas.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhuma venda registrada"
            description="As vendas deste lead aparecem aqui."
            className="py-8"
          />
        ) : (
          <ol className="relative border-l border-[var(--color-border-default)] ml-3 space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {ordenadas.map((v) => (
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
                      <p className="text-xs font-black text-emerald-500 whitespace-nowrap">{v.value > 0 ? brl(v.value) : "—"}</p>
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
