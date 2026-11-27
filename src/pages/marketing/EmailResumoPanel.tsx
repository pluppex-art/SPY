import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Card } from "../../components/ui/card";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { resumirEmail, type ResumoEmail } from "../../lib/resumoEmail";

const fmt = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);

/** Desempenho dos e-mails de marketing nos últimos 90 dias (campanhas e sequências). */
export function EmailResumoPanel({ mostrarVazio = false }: { mostrarVazio?: boolean } = {}) {
  const { activeTenantId } = useAuth();
  const [r, setR] = useState<ResumoEmail | null>(null);

  useEffect(() => {
    if (!supabase || !activeTenantId) { setR(null); return; }
    let cancelado = false;
    (async () => {
      const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const consulta = (cols: string) => supabase!.from("email_campaigns").select(cols).eq("tenant_id", activeTenantId).neq("status", "deleted").gte("created_at", desde).gt("sent", 0).limit(500);
      let { data, error } = await consulta("id, name, sent, opened, clicked, created_at");
      if (error) ({ data, error } = await consulta("id, name, sent, created_at"));
      if (!cancelado) setR(error ? null : resumirEmail((data || []) as any));
    })().catch(() => { if (!cancelado) setR(null); });
    return () => { cancelado = true; };
  }, [activeTenantId]);

  if (!r || r.enviados === 0) return mostrarVazio ? <Card className="p-8 text-center space-y-1"><Mail className="w-8 h-8 mx-auto text-[var(--color-primary-blue)]" /><p className="text-sm font-bold text-[var(--color-text-primary)]">Nenhum e-mail enviado nos últimos 90 dias</p><p className="text-xs text-[var(--color-text-muted)]">Em Marketing → E-mail em massa você cria campanhas e sequências; o desempenho aparece aqui.</p></Card> : null;
  const kpis = [
    { l: "E-mails enviados", v: r.enviados.toLocaleString("pt-BR") },
    { l: "Abriram", v: fmt(r.taxaAbertura) },
    { l: "Clicaram", v: fmt(r.taxaClique) },
    { l: "Campanhas e sequências", v: String(r.campanhas) },
  ];
  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Mail className="w-4 h-4 text-[var(--color-primary-blue)]" /> E-mail marketing · últimos 90 dias</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (<div key={k.l} className="rounded-lg bg-[var(--color-surface-sunken)] p-3 text-center"><p className="text-[10px] font-bold uppercase text-[var(--color-text-faint)]">{k.l}</p><p className="text-base font-black text-[var(--color-text-primary)]">{k.v}</p></div>))}
      </div>
      {r.melhores.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-bold text-[var(--color-text-muted)]">Melhores por cliques (mín. 20 envios)</p>
          {r.melhores.map((m) => (<div key={m.id} className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-[var(--color-text-primary)]">{m.name}</span><span className="shrink-0 text-[var(--color-text-muted)]">{m.enviados} env. · {fmt(m.taxaAbertura)} abr. · <b className="text-[var(--color-text-primary)]">{fmt(m.taxaClique)} cliques</b></span></div>))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-text-faint)]">Aberturas são estimativas (alguns apps abrem ou bloqueiam imagens sozinhos); cliques são mais confiáveis.</p>
    </Card>
  );
}
