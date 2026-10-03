import { useEffect, useState } from "react";
import { CreditCard, Sparkles, CalendarClock } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { PageContainer } from "../../../components/PageContainer";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { useBillingStatus } from "../../../hooks/useBillingStatus";
import { brl, fmtDate, STATUS_LABEL } from "../../../lib/saasApi";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "info" | "neutral"> = {
  active: "success", trial: "info", past_due: "warning", suspended: "destructive", canceled: "destructive", none: "neutral",
};

export default function ConfigPlanoUso() {
  const { activeTenantId } = useAuth();
  const { status, loading } = useBillingStatus();
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    supabase.from("billing_events").select("id, type, from_status, to_status, amount_cents, created_at")
      .eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setEvents(data || []));
  }, [activeTenantId]);

  const sub = status?.subscription;
  const ai = status?.ai;
  const pct = ai?.limit ? Math.min(100, Math.round((ai.used / ai.limit) * 100)) : null;
  const barColor = pct === null ? "bg-info" : pct >= 100 ? "bg-danger" : pct >= (ai?.warnPct ?? 80) ? "bg-warning" : "bg-success";

  return (
    <PageContainer title="Plano & Uso" subtitle="Sua assinatura e o consumo de IA deste mês.">
      {loading ? <p className="text-sm text-[var(--color-text-muted)]">Carregando…</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold"><CreditCard className="w-4 h-4" /> Assinatura</div>
            {!sub ? (
              <p className="text-sm text-[var(--color-text-muted)]">Esta empresa não tem assinatura cadastrada (acesso liberado).</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black">{sub.plan?.name ?? "Sem plano"}</span>
                  <Badge variant={STATUS_VARIANT[sub.status]}>{STATUS_LABEL[sub.status]}</Badge>
                </div>
                {sub.plan && <p className="text-sm text-[var(--color-text-muted)]">{brl(sub.plan.price_cents)} / {sub.plan.billing_interval === "yearly" ? "ano" : "mês"}</p>}
                <dl className="text-sm grid grid-cols-2 gap-y-1.5">
                  {sub.status === "trial" && (<><dt className="text-[var(--color-text-muted)]">Teste até</dt><dd>{fmtDate(sub.trial_ends_at)}</dd></>)}
                  <dt className="text-[var(--color-text-muted)]">Próximo vencimento</dt><dd>{fmtDate(sub.current_period_end)}</dd>
                  <dt className="text-[var(--color-text-muted)]">Último pagamento</dt><dd>{fmtDate(sub.last_payment_at)}</dd>
                  <dt className="text-[var(--color-text-muted)]">Carência após vencer</dt><dd>{sub.grace_days} dias</dd>
                </dl>
                {sub.plan?.features?.length ? (
                  <ul className="text-sm list-disc pl-5 text-[var(--color-text-muted)]">{sub.plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
                ) : null}
              </>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="w-4 h-4" /> Consumo de IA (mês)</div>
            <p className="text-2xl font-black">{(ai?.used ?? 0).toLocaleString("pt-BR")} <span className="text-sm font-medium text-[var(--color-text-muted)]">tokens{ai?.limit ? ` de ${ai.limit.toLocaleString("pt-BR")}` : " · sem limite"}</span></p>
            {pct !== null && (
              <>
                <div className="h-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden"><div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} /></div>
                <p className="text-xs text-[var(--color-text-muted)]">{pct}% usado{ai?.hardStop ? " · a IA pausa ao atingir o limite" : " · apenas aviso ao atingir o limite"}</p>
              </>
            )}
          </Card>

          <Card className="p-5 md:col-span-2 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold"><CalendarClock className="w-4 h-4" /> Histórico</div>
            {events.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">Nenhum evento de cobrança ainda.</p> : (
              <ul className="text-sm divide-y divide-[var(--color-border-default)]">
                {events.map((e) => (
                  <li key={e.id} className="py-1.5 flex justify-between gap-3">
                    <span>{e.type === "payment_confirmed" ? "Pagamento confirmado" : e.type === "payment_overdue" ? "Pagamento em atraso" : `Status: ${STATUS_LABEL[e.from_status ?? "none"] ?? "—"} → ${STATUS_LABEL[e.to_status ?? "none"] ?? "—"}`}{e.amount_cents ? ` · ${brl(e.amount_cents)}` : ""}</span>
                    <span className="text-[var(--color-text-muted)]">{fmtDate(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
