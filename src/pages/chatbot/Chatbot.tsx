import { useState } from "react";
import { toast } from "sonner";
import { Bot, Plus, Trash2, Loader2, Pencil } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { EmptyState } from "../../components/ui/empty-state";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useAuth } from "../../contexts/AuthContext";
import { useChatbots } from "../../hooks/useChatbots";
import { CHATBOT_TEMPLATES } from "../../lib/chatbot/templates";
import { ChatbotEditor } from "./ChatbotEditor";

/**
 * Chatbot por regras (sem IA): o cliente monta o próprio fluxo (menus, perguntas, arquivos, lead,
 * atendente humano) e conecta um número de WhatsApp. Um workflow n8n compartilhado executa o fluxo
 * de todas as empresas — ver src/lib/chatbot/engine.ts e server/chatbot.ts.
 */
export default function Chatbot() {
  const { user } = useAuth();
  const { bots, loading, error, create, update, remove, refresh } = useChatbots();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [templateId, setTemplateId] = useState(CHATBOT_TEMPLATES[0].id);
  const [busy, setBusy] = useState(false);

  const canEdit = !!(user?.isMaster || user?.isTenantAdmin);
  const open = bots.find((b) => b.id === openId) ?? null;

  if (open) {
    return (
      <PageContainer title="Chatbot" description="Monte o fluxo de atendimento do seu WhatsApp — sem inteligência artificial, você controla cada resposta.">
        <ChatbotEditor key={open.id} bot={open} readOnly={!canEdit} onBack={() => setOpenId(null)} onSave={update} onRefresh={refresh} />
      </PageContainer>
    );
  }

  const handleCreate = async () => {
    if (!newName.trim()) return toast.error("Dê um nome ao chatbot.");
    const tpl = CHATBOT_TEMPLATES.find((t) => t.id === templateId) ?? CHATBOT_TEMPLATES[0];
    setBusy(true);
    const r = await create({ name: newName, flow: tpl.flow });
    setBusy(false);
    if (r.error || !r.bot) return toast.error(r.error ?? "Não foi possível criar.");
    setCreating(false);
    setNewName("");
    setOpenId(r.bot.id);
  };

  return (
    <PageContainer
      title="Chatbot"
      description="Atendimento automático no WhatsApp com regras que você mesmo monta — sem inteligência artificial."
      actions={
        canEdit ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" /> Novo chatbot
          </Button>
        ) : undefined
      }
    >
      {creating && (
        <Card className="p-4 space-y-4 mb-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Novo chatbot</h3>
          <Input autoFocus placeholder="Ex.: Atendimento comercial" maxLength={120} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="grid gap-2 md:grid-cols-2">
            {CHATBOT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={`text-left rounded-xl border p-3 transition-colors ${templateId === t.id ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]"}`}
              >
                <p className="text-sm font-bold text-[var(--color-text-primary)]">{t.name}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{t.description}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Criar e editar
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-faint)]" /></div>
      ) : error ? (
        <Card className="p-6 text-sm text-rose-600">Não foi possível carregar os chatbots: {error}</Card>
      ) : bots.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Nenhum chatbot ainda"
          description={canEdit ? "Crie o primeiro: escolha um modelo pronto e ajuste as mensagens do seu jeito." : "Peça a um administrador da empresa para criar o chatbot."}
          action={canEdit ? <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Criar chatbot</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {bots.map((b) => (
            <Card key={b.id} className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 shrink-0"><Bot className="w-5 h-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{b.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">{b.description || `${Object.keys(b.flow.nodes).length} passos no fluxo`}</p>
                </div>
                <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${b.active ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-500"}`}>
                  {b.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-text-faint)]">{b.whatsappSession ? "WhatsApp conectado a este bot" : "Sem número de WhatsApp conectado"}</p>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => setOpenId(b.id)}>
                  <Pencil className="w-3.5 h-3.5" /> {canEdit ? "Editar" : "Ver"}
                </Button>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="danger"
                    title="Excluir chatbot"
                    onClick={async () => {
                      if (!(await confirmDialog({ title: "Excluir chatbot", description: `Excluir “${b.name}”? O fluxo e o histórico das conversas serão apagados. Isso não pode ser desfeito.`, confirmText: "Excluir" }))) return;
                      const r = await remove(b.id);
                      if (r.error) toast.error(r.error);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
