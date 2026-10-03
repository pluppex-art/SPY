import { useState } from "react";
import { MessageSquarePlus, Loader2, Users, Check, X, Trash2, AlertTriangle, Sparkles, Workflow, MessageCircle } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { useMessageTriggers, type MessageTrigger } from "../../hooks/useMessageTriggers";
import { AutomationFunilConnections } from "./AutomationFunilConnections";
import { cn } from "../../lib/utils";

// Central de Automações — o tenant descreve em texto livre quem quer contatar (ex: "mandar
// mensagem pra quem não tem contato há 2 meses"), a Júlia (via n8n) interpreta e monta a lista
// de leads + o texto que mandaria, e NADA é enviado de verdade até você aprovar essa lista e
// mensagem específicas aqui. Ver useMessageTriggers.ts e server/messageTriggers.ts.
//
// Antes desta versão essa tela era uma maquete (fluxos ficavam só no estado local do app,
// "Testar disparo" só incrementava um contador falso) — substituída pela versão real porque é
// exatamente o mesmo conceito (gatilho -> ação de mensagem), só que agora conectada de ponta a
// ponta: banco (tenant_message_triggers), interpretação por IA e envio real pela Júlia.

const STATUS_LABEL: Record<MessageTrigger["status"], { label: string; className: string }> = {
  pendente_interpretacao: { label: "Analisando...", className: "bg-white/5 text-slate-400 border-white/10" },
  aguardando_confirmacao: { label: "Aguardando sua aprovação", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  aprovado: { label: "Aprovado — enviando...", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  executado: { label: "Enviado", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  rejeitado: { label: "Rejeitado", className: "bg-white/5 text-slate-500 border-white/10" },
  erro: { label: "Não foi possível entender", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

function TriggerCard({ trigger, onAprovar, onRejeitar, onRemover }: {
  trigger: MessageTrigger;
  onAprovar: (id: string) => Promise<void>;
  onRejeitar: (id: string) => Promise<void>;
  onRemover: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const status = STATUS_LABEL[trigger.status];
  const canReview = trigger.status === "aguardando_confirmacao";

  const handleAprovar = async () => {
    if (!(await confirmDialog({
      title: "Aprovar e enviar",
      description: `Isso vai mandar mensagem de verdade pra ${trigger.leadsEncontrados.length} contato(s) real(is). Essa ação não pode ser desfeita.`,
    }))) return;
    setBusy(true);
    await onAprovar(trigger.id);
    setBusy(false);
  };

  return (
    <Card className="p-5 rounded-2xl border border-white/10 bg-[var(--color-surface-elevated)] space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-white leading-relaxed flex-1">"{trigger.descricao}"</p>
        <span className={`shrink-0 text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-full border ${status.className}`}>
          {status.label}
        </span>
      </div>

      {trigger.status === "pendente_interpretacao" && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> A Júlia está lendo seu pedido e montando a lista...
        </p>
      )}

      {trigger.status === "erro" && (
        <p className="text-xs text-rose-400 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {trigger.erro || "Não foi possível entender esse pedido."}
        </p>
      )}

      {(trigger.status === "aguardando_confirmacao" || trigger.status === "aprovado" || trigger.status === "executado") && trigger.resumoInterpretado && (
        <div className="space-y-2 pt-2 border-t border-white/5">
          <p className="text-xs text-slate-200">
            <span className="font-bold">Entendi assim:</span> {trigger.resumoInterpretado}
          </p>
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {trigger.leadsEncontrados.length} contato(s) encontrado(s)
          </p>
          {trigger.mensagemSugerida && (
            <div className="bg-black/20 border border-white/10 rounded-xl p-2.5">
              <p className="text-[9px] font-bold uppercase text-slate-500 mb-1">Mensagem que ela mandaria</p>
              <p className="text-xs text-slate-200 italic">"{trigger.mensagemSugerida}"</p>
            </div>
          )}
        </div>
      )}

      {canReview && (
        <div className="flex items-center gap-2 pt-1">
          <Button onClick={handleAprovar} disabled={busy || trigger.leadsEncontrados.length === 0} className="h-8 px-3 text-[11px] font-bold gap-1.5 bg-purple-600 hover:bg-purple-500 text-white">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aprovar e enviar
          </Button>
          <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); await onRejeitar(trigger.id); setBusy(false); }} className="h-8 px-3 text-[11px] font-bold gap-1.5 border-white/10 text-slate-300">
            <X className="w-3.5 h-3.5" /> Rejeitar
          </Button>
        </div>
      )}

      {(trigger.status === "rejeitado" || trigger.status === "erro" || trigger.status === "executado") && (
        <button
          onClick={async () => { if (await confirmDialog({ title: "Remover gatilho", description: "Remover este registro da lista?" })) await onRemover(trigger.id); }}
          className="text-[10px] font-bold text-slate-500 hover:text-rose-400 flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Remover
        </button>
      )}
    </Card>
  );
}

type Aba = "julia" | "funis";

export default function MarketingAutomacoes() {
  const { triggers, loading, criar, aprovar, rejeitar, remover } = useMessageTriggers();
  const [descricao, setDescricao] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [aba, setAba] = useState<Aba>("julia");

  const handleSubmit = async () => {
    if (!descricao.trim()) { toast.error("Descreva o que você quer que aconteça."); return; }
    setSubmitting(true);
    const { error } = await criar(descricao.trim());
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    setDescricao("");
    toast.success("Pedido enviado — a Júlia já está analisando.");
  };

  const pendentes = triggers.filter((t) => t.status === "aguardando_confirmacao").length;
  const enviados = triggers.filter((t) => t.status === "executado").length;
  const totalContatados = triggers.filter((t) => t.status === "executado").reduce((s, t) => s + t.leadsEncontrados.length, 0);

  return (
    <PageContainer
      title="Central de Automações S.P.Y."
      description={aba === "julia"
        ? "Descreva quem você quer contatar em texto livre — a Júlia entende, monta a lista e a mensagem, e só envia depois que você aprovar."
        : "Conecte etapas do funil comercial (ou categorias de produto vendidas) a departamentos da Operação — monte como você quiser, sem precisar de ninguém mexer em configuração."}
    >
      <div className="space-y-6 pb-20">
        <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] w-fit">
          {([["julia", "Gatilho → Mensagem (Júlia)", MessageCircle], ["funis", "Gatilho → Funis / OS", Workflow]] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setAba(v)}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-[calc(var(--radius-control)-2px)] cursor-pointer transition-all flex items-center gap-1.5",
                aba === v ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {aba === "julia" ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-5 bg-[var(--color-surface-elevated)] border border-white/5">
                <Sparkles className="w-5 h-5 text-amber-400 mb-3" />
                <div className="text-2xl font-black text-white font-mono mb-1">{pendentes}</div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Aguardando sua aprovação</div>
              </Card>
              <Card className="p-5 bg-[var(--color-surface-elevated)] border border-white/5">
                <Check className="w-5 h-5 text-emerald-400 mb-3" />
                <div className="text-2xl font-black text-emerald-400 font-mono mb-1">{enviados}</div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Gatilhos já enviados</div>
              </Card>
              <Card className="p-5 bg-[var(--color-surface-elevated)] border border-white/5">
                <Users className="w-5 h-5 text-indigo-400 mb-3" />
                <div className="text-2xl font-black text-white font-mono mb-1">{totalContatados}</div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Contatos alcançados</div>
              </Card>
            </div>

            <Card className="p-5 rounded-2xl bg-[var(--color-surface-elevated)] border border-white/10 space-y-3">
              <label className="text-[11px] font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                <MessageSquarePlus className="w-4 h-4 text-purple-400" /> Novo gatilho
              </label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder='Ex: "Quero mandar mensagem pra todo mundo que ficou parado há mais de 30 dias"'
                rows={3}
                className="w-full text-sm bg-black/20 border border-white/10 rounded-xl p-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50 resize-y"
              />
              <Button onClick={handleSubmit} disabled={submitting} className="h-9 px-4 text-xs font-bold gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 text-white">
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Pedir pra Júlia entender
              </Button>
            </Card>

            <div className="space-y-3">
              {loading ? (
                <p className="text-xs text-slate-500">Carregando...</p>
              ) : triggers.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-4 text-center">Nenhum gatilho ainda — descreva um acima pra começar.</p>
              ) : (
                triggers.map((t) => (
                  <TriggerCard
                    key={t.id}
                    trigger={t}
                    onAprovar={async (id) => { const r = await aprovar(id); if (r.error) toast.error(r.error); else toast.success("Enviando as mensagens agora."); }}
                    onRejeitar={async (id) => { await rejeitar(id); }}
                    onRemover={remover}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          <AutomationFunilConnections />
        )}
      </div>
    </PageContainer>
  );
}
