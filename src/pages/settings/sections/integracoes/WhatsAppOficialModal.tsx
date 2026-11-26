import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, KeyRound, Link2, Loader2, Plus, RefreshCw, Trash2, Webhook } from "lucide-react";
import { Modal } from "../../../../components/ui/modal";
import { Button } from "../../../../components/ui/button";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";
import { apiFetch } from "../../../../lib/apiClient";
import { Field, FormSection, ModalFooter, ModalTitle, inputCls } from "../../../finance/components/ModalKit";

export interface NumeroOficial {
  id: string; apelido: string | null; phoneNumberId: string; wabaId: string; telefone: string | null; nomeVerificado: string | null;
  qualidade: string | null; webhookAtivo: boolean; ultimoErro: string | null; ultimaMensagemEm: string | null; criadoEm: string;
}

const comTenant = (url: string, tenantId?: string) => (tenantId ? `${url}?tenantId=${encodeURIComponent(tenantId)}` : url);
const QUALIDADE: Record<string, string> = { GREEN: "Qualidade alta", YELLOW: "Qualidade média", RED: "Qualidade baixa" };

/** Números da API oficial do WhatsApp conectados pela empresa ativa. */
export function useNumerosOficiais(tenantId?: string) {
  const [numeros, setNumeros] = useState<NumeroOficial[]>([]);
  const [carregando, setCarregando] = useState(true);
  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await apiFetch(comTenant("/api/whatsapp-oficial/numeros", tenantId));
      const j = await r.json().catch(() => ({}));
      setNumeros(r.ok ? j.numeros ?? [] : []);
    } catch { setNumeros([]); } finally { setCarregando(false); }
  }, [tenantId]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { numeros, carregando, recarregar };
}

const VAZIO = { apelido: "", phoneNumberId: "", wabaId: "", accessToken: "", appSecret: "" };

export function WhatsAppOficialModal({ aberto, onClose, tenantId, numeros, carregando, recarregar }: {
  aberto: boolean; onClose: () => void; tenantId?: string; numeros: NumeroOficial[]; carregando: boolean; recarregar: () => Promise<void>;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const [f, setF] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const formAberto = adicionando || (!carregando && numeros.length === 0);

  const fechar = () => { setAdicionando(false); setF(VAZIO); setErro(null); onClose(); };

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setSalvando(true);
    try {
      const r = await apiFetch(comTenant("/api/whatsapp-oficial/numeros", tenantId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || "Não foi possível conectar o número."); return; }
      if (j.aviso) toast.warning(j.aviso); else toast.success("Número conectado e webhook configurado automaticamente.");
      setF(VAZIO); setAdicionando(false);
      await recarregar();
    } catch { setErro("Não foi possível conectar o número. Tente de novo."); }
    finally { setSalvando(false); }
  }

  async function reativar(n: NumeroOficial) {
    setOcupado(n.id);
    const r = await apiFetch(comTenant(`/api/whatsapp-oficial/numeros/${n.id}/webhook`, tenantId), { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) toast.success("Webhook configurado."); else toast.error(j.error || "Não foi possível configurar o webhook.");
    await recarregar(); setOcupado(null);
  }

  async function remover(n: NumeroOficial) {
    if (!(await confirmDialog({ title: "Remover número oficial", description: `Remover ${n.telefone || n.phoneNumberId}? As mensagens deixam de chegar. O histórico das conversas é mantido.` }))) return;
    setOcupado(n.id);
    const r = await apiFetch(comTenant(`/api/whatsapp-oficial/numeros/${n.id}`, tenantId), { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) toast.success("Número removido."); else toast.error(j.error || "Não foi possível remover.");
    await recarregar(); setOcupado(null);
  }

  return (
    <Modal isOpen={aberto} onClose={fechar} maxWidth="max-w-2xl" title={<ModalTitle icon={BadgeCheck} tone="success" title="WhatsApp Business (API oficial)" subtitle="Números conectados pela API da Meta. O webhook é configurado automaticamente." />}>
      <div className="space-y-4">
        {carregando ? (
          <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando números…</p>
        ) : numeros.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">{numeros.length} número(s) conectado(s) · {numeros.filter((n) => n.webhookAtivo).length} recebendo mensagens</p>
            {numeros.map((n) => (
              <div key={n.id} className="rounded-xl border border-[var(--color-border-default)] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 text-xs">
                  <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{n.apelido || n.nomeVerificado || n.telefone}</p>
                  <p className="text-[var(--color-text-muted)]">{n.telefone}{n.nomeVerificado ? ` · ${n.nomeVerificado}` : ""}{n.qualidade && QUALIDADE[n.qualidade] ? ` · ${QUALIDADE[n.qualidade]}` : ""}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${n.webhookAtivo ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" : "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"}`}><Webhook className="w-3 h-3" /> {n.webhookAtivo ? "Webhook ativo" : "Webhook pendente"}</span>
                    <span className="text-[10px] text-[var(--color-text-faint)]">{n.ultimaMensagemEm ? `Última mensagem: ${new Date(n.ultimaMensagemEm).toLocaleString("pt-BR")}` : "Nenhuma mensagem recebida ainda"}</span>
                  </p>
                  {n.ultimoErro && <p className="text-[11px] text-[var(--color-danger)] mt-1 break-words">{n.ultimoErro}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" disabled={ocupado === n.id} onClick={() => reativar(n)} className="h-8 px-3 text-xs gap-1.5">{ocupado === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Reconfigurar webhook</Button>
                  <Button variant="outline" disabled={ocupado === n.id} onClick={() => remover(n)} className="h-8 px-2.5 text-[var(--color-danger)]" aria-label="Remover número"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {formAberto ? (
          <form onSubmit={conectar} className="space-y-4">
            <FormSection icon={Link2} title="Dados do número" hint="Painel da Meta › seu app › WhatsApp › Configuração da API">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Apelido" hint="Opcional. Ex.: Comercial" className="sm:col-span-2"><input className={inputCls()} maxLength={60} value={f.apelido} onChange={(e) => setF({ ...f, apelido: e.target.value })} /></Field>
                <Field label="ID do número de telefone" required><input className={inputCls()} inputMode="numeric" value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value.trim() })} placeholder="Phone number ID" /></Field>
                <Field label="ID da conta do WhatsApp Business" required><input className={inputCls()} inputMode="numeric" value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value.trim() })} placeholder="WhatsApp Business Account ID" /></Field>
              </div>
            </FormSection>
            <FormSection icon={KeyRound} title="Acesso">
              <Field label="Token de acesso" required hint="Use um token permanente (Usuário do sistema), com as permissões whatsapp_business_messaging e whatsapp_business_management.">
                <input className={inputCls()} type="password" autoComplete="off" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value.trim() })} />
              </Field>
              <Field label="Chave secreta do app" hint="Opcional, recomendada: confere a assinatura das mensagens recebidas.">
                <input className={inputCls()} type="password" autoComplete="off" value={f.appSecret} onChange={(e) => setF({ ...f, appSecret: e.target.value.trim() })} />
              </Field>
            </FormSection>
            <p className="text-[11px] text-[var(--color-text-muted)] rounded-lg bg-[var(--color-surface-sunken)] p-3">Uma vez só, no painel da Meta: em WhatsApp › Configuração, cadastre qualquer URL de webhook padrão do app e assine o campo <strong>messages</strong>. O endereço de cada conta o sistema configura sozinho.</p>
            {erro && <p className="text-xs text-[var(--color-danger)]">{erro}</p>}
            <ModalFooter onCancel={numeros.length > 0 ? () => { setAdicionando(false); setErro(null); } : fechar} submitLabel="Conectar número" saving={salvando} disabled={!f.phoneNumberId || !f.wabaId || !f.accessToken} />
          </form>
        ) : (
          !carregando && <Button onClick={() => setAdicionando(true)} className="h-9 px-4 text-xs font-bold gap-1.5"><Plus className="w-3.5 h-3.5" /> Conectar outro número</Button>
        )}
      </div>
    </Modal>
  );
}
