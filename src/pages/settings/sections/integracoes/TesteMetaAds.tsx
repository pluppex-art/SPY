import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { apiFetch } from "../../../../lib/apiClient";
import { useAuth } from "../../../../contexts/AuthContext";

/** Testa o ID da conta e o token digitados (sem salvar): mostra o nome da conta se der certo ou como corrigir se não. */
export function TesteMetaAds({ accountId, adsToken }: { accountId: string; adsToken: string }) {
  const { activeTenantId } = useAuth();
  const [testando, setTestando] = useState(false);
  const [r, setR] = useState<{ ok: boolean; texto: string } | null>(null);

  const testar = async () => {
    if (!activeTenantId) return;
    setTestando(true); setR(null);
    try {
      const res = await apiFetch(`/api/marketing/meta-testar?tenantId=${encodeURIComponent(activeTenantId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, adsToken }) });
      const j = await res.json().catch(() => ({}));
      setR(j.ok ? { ok: true, texto: `Conectado: ${j.nome || "conta de anúncios"}${j.moeda ? ` (${j.moeda})` : ""}${j.situacao ? ` · conta ${j.situacao}` : ""}.` } : { ok: false, texto: j.error || "Não foi possível testar agora." });
    } catch { setR({ ok: false, texto: "Não foi possível testar agora. Tente de novo em instantes." }); }
    finally { setTestando(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" onClick={() => void testar()} disabled={testando} className="h-8 px-3 text-xs font-bold gap-1.5">
        {testando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Testar conexão de anúncios
      </Button>
      {r && <p className={`text-xs flex items-center gap-1.5 ${r.ok ? "text-emerald-500" : "text-[var(--color-danger)]"}`} role="status">{r.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}{r.texto}</p>}
    </div>
  );
}
