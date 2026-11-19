import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { Card } from "../card";
import { useAuth } from "../../../contexts/AuthContext";

interface Envio { id: string; assunto: string; enviadoEm: string; abriu: boolean; clicou: boolean }

/** E-mails de marketing (campanhas e sequências) que este lead recebeu, e se abriu ou clicou. Some sozinho se não houver nenhum. */
export function EmailsMarketingSection({ lead }: { lead: any }) {
  const [envios, setEnvios] = useState<Envio[]>([]);
  const { activeTenantId } = useAuth();
  const email = String(lead?.email ?? "").trim().toLowerCase();

  useEffect(() => {
    if (!email || !activeTenantId) { setEnvios([]); return; }
    let cancelado = false;
    (async () => {
      const tenant = activeTenantId;
      const { data: rec } = await supabase.from("email_campaign_recipients").select("id, campaign_id, sent_at, open_count, click_count")
        .eq("tenant_id", tenant).eq("email", email).eq("status", "sent").order("sent_at", { ascending: false }).limit(20);
      if (cancelado || !rec?.length) { if (!cancelado) setEnvios([]); return; }
      const ids = Array.from(new Set(rec.map((r: any) => r.campaign_id)));
      const { data: camps } = await supabase.from("email_campaigns").select("id, name, subject").in("id", ids);
      const porId = new Map<string, any>((camps || []).map((c: any) => [c.id, c]));
      if (!cancelado) setEnvios(rec.map((r: any) => ({
        id: r.id, enviadoEm: r.sent_at, abriu: (r.open_count || 0) > 0, clicou: (r.click_count || 0) > 0,
        assunto: String(porId.get(r.campaign_id)?.name ?? "E-mail").replace(/^\[Sequência\]\s*/, "Sequência: "),
      })));
    })().catch(() => { if (!cancelado) setEnvios([]); });
    return () => { cancelado = true; };
  }, [email, activeTenantId]);

  if (!envios.length) return null;
  return (
    <div className="space-y-3 mt-6">
      <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5"><Mail className="w-3 h-3" /> E-mails de marketing recebidos</h4>
      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
        {envios.map((e) => (
          <Card key={e.id} className="p-3 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{e.assunto}</p>
              <p className="text-[10px] font-mono text-[var(--color-text-faint)]">{e.enviadoEm ? new Date(e.enviadoEm).toLocaleDateString("pt-BR") : "—"}</p>
            </div>
            <div className="flex gap-1.5 shrink-0 text-[9px] font-bold uppercase">
              <span className={`px-1.5 py-0.5 rounded border ${e.abriu ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25" : "text-[var(--color-text-faint)] border-[var(--color-border-default)]"}`}>{e.abriu ? "Abriu" : "Não abriu"}</span>
              {e.clicou && <span className="px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-500 border-blue-500/25">Clicou</span>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
