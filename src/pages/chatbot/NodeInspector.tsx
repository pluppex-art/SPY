import { Plus, Trash2, Play } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { ChatbotFlow, FlowNode, ValidationKind } from "../../lib/chatbot/types";
import type { FlowIssue } from "../../lib/chatbot/validate";
import { NODE_LABEL } from "../../lib/chatbot/templates";
import { SAVE_TARGETS } from "../../lib/chatbot/saveTargets";

const TEXTAREA =
  "w-full min-h-[84px] rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-blue)] disabled:opacity-60";
const SELECT = "h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-text-primary)] disabled:opacity-60";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[var(--color-text-faint)]">{hint}</span>}
    </label>
  );
}

const VALIDATION_LABEL: Record<ValidationKind, string> = {
  text: "Texto livre",
  email: "E-mail",
  phone: "Telefone",
  number: "Número",
};

interface Props {
  flow: ChatbotFlow;
  node: FlowNode;
  issues: FlowIssue[];
  readOnly?: boolean;
  onChange: (node: FlowNode) => void;
  onDelete: () => void;
  onSetStart: () => void;
}

export function NodeInspector({ flow, node, issues, readOnly, onChange, onDelete, onSetStart }: Props) {
  const isStart = flow.start === node.id;
  const textHint = "Use {{nome}} para inserir o que o contato já respondeu (a variável da pergunta). {{telefone}} é sempre o número dele.";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{NODE_LABEL[node.type]}</h3>
        <div className="flex gap-1.5">
          {!isStart && !readOnly && (
            <Button size="xs" variant="outline" onClick={onSetStart} title="Definir como primeiro passo do fluxo">
              <Play className="w-3 h-3" /> Início
            </Button>
          )}
          {!readOnly && (
            <Button size="xs" variant="danger" onClick={onDelete} title="Excluir este passo">
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.map((i, idx) => (
            <li key={idx} className={`text-xs rounded-md px-2 py-1 ${i.level === "error" ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-700"}`}>
              {i.message}
            </li>
          ))}
        </ul>
      )}

      {(node.type === "message" || node.type === "question" || node.type === "handoff" || node.type === "end" || node.type === "menu") && (
        <Field label={node.type === "menu" ? "Texto antes das opções" : "Texto"} hint={textHint}>
          <textarea className={TEXTAREA} disabled={readOnly} maxLength={1000} value={node.text ?? ""} onChange={(e) => onChange({ ...node, text: e.target.value } as FlowNode)} />
        </Field>
      )}

      {node.type === "menu" && (
        <>
          <Field label="Opções" hint="O contato responde com o número ou o texto da opção. Arraste a bolinha de cada opção no mapa até o próximo passo.">
            <div className="space-y-2">
              {node.options.map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <span className="w-5 text-xs font-bold text-[var(--color-text-faint)]">{i + 1}.</span>
                  <Input
                    disabled={readOnly}
                    maxLength={60}
                    value={opt.label}
                    onChange={(e) => onChange({ ...node, options: node.options.map((o) => (o.id === opt.id ? { ...o, label: e.target.value } : o)) })}
                  />
                  {!readOnly && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      disabled={node.options.length <= 2}
                      title="Remover opção"
                      onClick={() => onChange({ ...node, options: node.options.filter((o) => o.id !== opt.id) })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && node.options.length < 10 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onChange({ ...node, options: [...node.options, { id: `${node.id}_o${Date.now().toString(36)}`, label: `Opção ${node.options.length + 1}`, next: null }] })}
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar opção
                </Button>
              )}
            </div>
          </Field>
          <Field label="Guardar a escolha em (opcional)" hint="Nome da variável, ex.: assunto. Vai junto com o lead.">
            <Input disabled={readOnly} maxLength={31} value={node.variable ?? ""} placeholder="assunto" onChange={(e) => onChange({ ...node, variable: e.target.value.toLowerCase() })} />
          </Field>
          <Field label="Texto quando a resposta não for uma opção (opcional)">
            <Input disabled={readOnly} maxLength={200} value={node.invalid_text ?? ""} placeholder="Não entendi. Responda com o número de uma das opções:" onChange={(e) => onChange({ ...node, invalid_text: e.target.value })} />
          </Field>
        </>
      )}

      {node.type === "question" && (
        <>
          <Field label="Guardar a resposta em" hint="Letras minúsculas, números e _. Use 'nome' e 'email' para preencher esses campos do lead.">
            <Input disabled={readOnly} maxLength={31} value={node.variable} onChange={(e) => onChange({ ...node, variable: e.target.value.toLowerCase() })} />
          </Field>
          <Field label="Tipo de resposta esperada">
            <select className={SELECT} disabled={readOnly} value={node.validation} onChange={(e) => onChange({ ...node, validation: e.target.value as ValidationKind })}>
              {(Object.keys(VALIDATION_LABEL) as ValidationKind[]).map((k) => (
                <option key={k} value={k}>{VALIDATION_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="Texto quando a resposta for inválida (opcional)">
            <Input disabled={readOnly} maxLength={200} value={node.error_text ?? ""} placeholder="Não consegui entender essa resposta. Pode tentar de novo?" onChange={(e) => onChange({ ...node, error_text: e.target.value })} />
          </Field>
        </>
      )}

      {node.type === "media" && (
        <>
          <Field label="Tipo">
            <select className={SELECT} disabled={readOnly} value={node.kind} onChange={(e) => onChange({ ...node, kind: e.target.value as "image" | "document" })}>
              <option value="document">Documento (PDF, planilha…)</option>
              <option value="image">Imagem</option>
            </select>
          </Field>
          <Field label="Link do arquivo" hint="URL pública (https://…). O WhatsApp baixa o arquivo direto desse link.">
            <Input disabled={readOnly} value={node.url} placeholder="https://…/catalogo.pdf" onChange={(e) => onChange({ ...node, url: e.target.value })} />
          </Field>
          <Field label="Nome do arquivo (opcional)">
            <Input disabled={readOnly} maxLength={80} value={node.filename ?? ""} placeholder="catalogo.pdf" onChange={(e) => onChange({ ...node, filename: e.target.value })} />
          </Field>
          <Field label="Legenda (opcional)" hint={textHint}>
            <Input disabled={readOnly} maxLength={300} value={node.caption ?? ""} onChange={(e) => onChange({ ...node, caption: e.target.value })} />
          </Field>
        </>
      )}

      {node.type === "create_lead" && (
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Cria o contato no CRM com tudo que foi coletado até aqui: <b>nome</b>, <b>e-mail</b> e o telefone do WhatsApp. As demais respostas vão para as observações e campos do lead.
          O funil e a etapa de entrada são escolhidos em <b>Configurações</b>. Se o telefone já estiver cadastrado, o lead existente é atualizado — nunca duplicado nem sobrescrito.
        </p>
      )}

      {(node.type === "question" || node.type === "menu") && (
        <div className="space-y-1.5">
          <label className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)] leading-relaxed">
            <input type="checkbox" disabled={readOnly} checked={!!node.skip_if_known} onChange={(e) => onChange({ ...node, skip_if_known: e.target.checked })} className="mt-0.5" />
            <span><b>Pular se já souber</b> — não pergunta de novo o que já está cadastrado do cliente no SPY (variável já preenchida).</span>
          </label>
          {node.type === "question" && (
            <label className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <input type="checkbox" disabled={readOnly} checked={!!node.allow_unknown} onChange={(e) => onChange({ ...node, allow_unknown: e.target.checked })} className="mt-0.5" />
              <span><b>Aceitar "não sei"</b> — se o contato disser que não sabe/não tem, o bot responde com tranquilidade e segue sem gravar.</span>
            </label>
          )}
        </div>
      )}

      {node.type === "save_data" && (
        <>
          <Field label="Gravar em" hint={SAVE_TARGETS[node.target]?.hint}>
            <select disabled={readOnly} className={SELECT} value={node.target} onChange={(e) => onChange({ ...node, target: e.target.value as typeof node.target, map: [] })}>
              {Object.entries(SAVE_TARGETS).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
            </select>
          </Field>
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Campo ← pergunta (variável)</span>
            {node.map.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select disabled={readOnly} className={SELECT} value={m.field} onChange={(e) => onChange({ ...node, map: node.map.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>
                  <option value="">Campo…</option>
                  {SAVE_TARGETS[node.target]?.fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <Input disabled={readOnly} className="w-32" placeholder="variavel" value={m.variable} onChange={(e) => onChange({ ...node, map: node.map.map((x, j) => (j === i ? { ...x, variable: e.target.value } : x)) })} />
                {!readOnly && <Button size="xs" variant="ghost" onClick={() => onChange({ ...node, map: node.map.filter((_, j) => j !== i) })}><Trash2 className="w-3 h-3" /></Button>}
              </div>
            ))}
            {!readOnly && <Button size="xs" variant="outline" onClick={() => onChange({ ...node, map: [...node.map, { field: "", variable: "" }] })}><Plus className="w-3 h-3" /> Campo</Button>}
          </div>
          {node.target === "implementation" && (
            <label className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <input type="checkbox" disabled={readOnly} checked={!!node.provision} onChange={(e) => onChange({ ...node, provision: e.target.checked })} className="mt-0.5" />
              <span><b>Criar o ambiente do cliente ao concluir</b> — quando os dados bastam (razão social, nome fantasia, CNPJ, endereço, responsável, e-mail e WhatsApp), cria o ambiente, envia ao responsável um link para definir a senha e aciona o agente de implementação. Só acontece uma vez por cliente.</span>
            </label>
          )}
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">Roda uma vez por conversa. Se o número não for de nenhuma implementação, nada é gravado e a conversa segue normalmente.</p>
        </>
      )}

      {node.type === "handoff" && (
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          O bot para de responder nesta conversa e a equipe é avisada (notificação no SPY e, se configurado, WhatsApp). Depois você devolve a conversa ao bot na aba <b>Conversas</b>.
        </p>
      )}
    </div>
  );
}
