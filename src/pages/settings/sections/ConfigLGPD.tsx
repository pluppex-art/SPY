import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Download, EyeOff, ShieldCheck, FileCheck2 } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { PageContainer } from "../../../components/PageContainer";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { useAuth } from "../../../contexts/AuthContext";
import { saasApi, fmtDate } from "../../../lib/saasApi";

type Hit = Awaited<ReturnType<typeof saasApi.lgpdSearch>>[number];
type Req = Awaited<ReturnType<typeof saasApi.lgpdRequests>>[number];
const KIND_LABEL: Record<string, string> = { export: "Exportação", anonymize: "Anonimização", consent: "Consentimento" };

export default function ConfigLGPD() {
  const { activeTenantId } = useAuth();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [history, setHistory] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(() => {
    saasApi.lgpdRequests(activeTenantId).then(setHistory).catch(() => setHistory([]));
  }, [activeTenantId]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const search = async () => {
    if (q.trim().length < 3) { toast.info("Digite ao menos 3 caracteres (nome, e-mail ou telefone)."); return; }
    setBusy(true);
    try { setHits(await saasApi.lgpdSearch(q.trim(), activeTenantId)); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const doExport = async (h: Hit) => {
    try {
      const blob = await saasApi.lgpdExport(h.type, h.id, activeTenantId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `lgpd-${h.type}-${h.id.slice(0, 8)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Dados do titular exportados."); loadHistory();
    } catch (e: any) { toast.error(e.message); }
  };

  const doAnonymize = async (h: Hit) => {
    const ok = await confirmDialog({
      title: "Anonimizar titular", confirmText: "Anonimizar definitivamente",
      description: `Os dados pessoais de "${h.name}" (nome, contatos, documentos, observações) serão apagados de forma IRREVERSÍVEL. O registro permanece, sem identificação, para não quebrar relatórios e histórico.`,
    });
    if (!ok) return;
    try {
      await saasApi.lgpdAnonymize(h.type, h.id, activeTenantId);
      toast.success("Titular anonimizado."); setHits((x) => x.filter((i) => i.id !== h.id)); loadHistory();
    } catch (e: any) { toast.error(e.message); }
  };

  const doConsent = async (h: Hit, granted: boolean) => {
    try { await saasApi.lgpdConsent({ subjectType: h.type, subjectId: h.id, granted, channel: "painel" }, activeTenantId); toast.success(granted ? "Consentimento registrado." : "Revogação registrada."); loadHistory(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <PageContainer title="LGPD" subtitle="Atenda pedidos de titulares: exportar dados, anonimizar e registrar consentimento. Tudo fica auditado.">
      <Card className="p-5 space-y-3">
        <div className="flex gap-2">
          <input className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-3 py-2 text-sm" placeholder="Buscar titular por nome, e-mail ou telefone"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} />
          <Button disabled={busy} onClick={() => void search()}><Search className="w-4 h-4 mr-1" /> Buscar</Button>
        </div>
        {hits.length > 0 && (
          <ul className="divide-y divide-[var(--color-border-default)]">
            {hits.map((h) => (
              <li key={`${h.type}-${h.id}`} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-semibold">{h.name}</span> <Badge variant="neutral">{h.type === "lead" ? "Lead" : "Cliente"}</Badge>
                  <div className="text-xs text-[var(--color-text-muted)]">{[h.email, h.phone, h.extra].filter(Boolean).join(" · ") || "sem contato"}</div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void doExport(h)}><Download className="w-3.5 h-3.5 mr-1" /> Exportar</Button>
                  <Button size="sm" variant="outline" onClick={() => void doConsent(h, true)}><FileCheck2 className="w-3.5 h-3.5 mr-1" /> Consentiu</Button>
                  <Button size="sm" variant="outline" onClick={() => void doConsent(h, false)}>Revogou</Button>
                  <Button size="sm" variant="danger" onClick={() => void doAnonymize(h)}><EyeOff className="w-3.5 h-3.5 mr-1" /> Anonimizar</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 space-y-3 mt-4">
        <div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="w-4 h-4" /> Histórico de solicitações</div>
        {history.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">Nenhuma solicitação registrada.</p> : (
          <ul className="text-sm divide-y divide-[var(--color-border-default)]">
            {history.map((r) => (
              <li key={r.id} className="py-1.5 flex justify-between gap-3">
                <span>{KIND_LABEL[r.kind] ?? r.kind} · {r.subject_type} <code className="text-xs">{r.subject_id.slice(0, 8)}</code>{r.kind === "consent" ? ` · ${r.details?.granted === false ? "revogado" : "concedido"}` : ""}{r.status === "failed" ? " · falhou" : ""}</span>
                <span className="text-[var(--color-text-muted)]">{fmtDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageContainer>
  );
}
