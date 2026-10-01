import { useState } from "react";
import { FileText, Save, RefreshCw, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { AgentPrompt } from "../../../hooks/useAgentPrompts";

// Usado pelo catálogo de agentes/personas (SettingsSistemaAuroraAgentes.tsx) — cada agente
// usa uma chave FIXA (ver FIXED_N8N_PROMPT_KEY lá) quando tem workflow real ligado no n8n,
// ou uma chave derivada do nome (promptKeyForAgent) quando ainda não tem.
//
// Cores por CSS var (--color-text-*, --color-surface-*, --color-border-*, --color-primary-blue),
// não Tailwind slate/violet cru: essa tela é usada nos dois temas (claro/escuro, toggle via
// classe `.dark` no <html>, ver index.css) e tons de cinza/roxo fixos só ficam legíveis em
// um dos dois temas — no claro (fundo branco), por exemplo, texto pálido demais some quase
// por completo. O destaque de
// "customizado por este tenant" usa --color-primary-blue (a cor de marca do tenant, já
// configurável em Configurações) em vez de um roxo decorativo fixo.

export function ViewPromptButton({
  agentKey,
  expandedKey,
  setExpandedKey,
}: {
  agentKey: string;
  expandedKey: string | null;
  setExpandedKey: (key: string | null) => void;
}) {
  const isOpen = expandedKey === agentKey;
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => setExpandedKey(isOpen ? null : agentKey)}
      className="flex items-center gap-1.5 text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg shadow-none bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] hover:bg-[var(--color-surface-elevated)]"
    >
      <FileText className="w-3 h-3" />
      Ver prompt
      {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
    </Button>
  );
}

/**
 * Prompt de um agente, aberto inline dentro do card de toggle correspondente. Le/escreve
 * `ai_agent_prompts` (ver useAgentPrompts) — padrão "default + override": existe um texto
 * padrão global (mantido por master) e cada tenant pode salvar sua PRÓPRIA versão, que só
 * afeta esse tenant — editar aqui nunca muda o que os outros tenants veem. Disponível pra
 * qualquer tenant admin, não só master — mesma tela, mesmo acesso em todo tenant.
 *
 * IMPORTANTE (não é um "substituir o prompt"): cada agente com workflow real no n8n já tem
 * seu próprio comportamento/prompt embutido no nó — o texto salvo aqui é um bloco ADICIONAL
 * de contexto/instrução específico do tenant, somado por cima do comportamento padrão, nunca
 * uma substituição dele. O n8n já lê esse valor ao vivo por tenant (isolado por execução,
 * nunca cacheado nem compartilhado entre tenants) — salvar aqui reflete na próxima chamada do
 * agente, sem precisar tocar em nada no n8n.
 */
export function InlinePromptEditor({
  agentKey,
  agent,
  loading,
  saving,
  onSave,
}: {
  agentKey: string;
  agent: AgentPrompt | undefined;
  loading: boolean;
  saving: boolean;
  onSave: (text: string, name: string, description: string | null) => void;
}) {
  const [value, setValue] = useState(agent?.prompt ?? "");
  const [loadedFor, setLoadedFor] = useState<string | null>(agent ? agentKey : null);
  const [showBase, setShowBase] = useState(false);
  const [copied, setCopied] = useState(false);

  // Só inicializa o textarea quando o prompt desse agente chega pela primeira vez — evita
  // sobrescrever o que o usuário já está digitando caso o hook recarregue no meio da edição.
  if (agent && loadedFor !== agentKey) {
    setValue(agent.prompt);
    setLoadedFor(agentKey);
  }

  if (loading || !agent) {
    return <p className="text-xs text-[var(--color-text-muted)] pt-2">Carregando prompt...</p>;
  }

  const dirty = value !== agent.prompt;

  const handleCopyBase = async () => {
    if (!agent.basePrompt) return;
    try {
      await navigator.clipboard.writeText(agent.basePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard pode falhar em contexto não-seguro/sem permissão — sem crash, só não copia.
    }
  };

  return (
    <div className="pt-2 space-y-2 border-t border-[var(--color-border-subtle)] mt-1">
      {agent.basePrompt && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowBase((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {showBase ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Ver prompt completo atual (somente leitura)
          </button>
          {showBase && (
            <div className="relative">
              <pre className="w-full max-h-72 overflow-y-auto text-[11px] font-mono whitespace-pre-wrap bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg p-3 text-[var(--color-text-muted)]">
                {agent.basePrompt}
              </pre>
              <button
                type="button"
                onClick={handleCopyBase}
                title="Copiar"
                className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-1 rounded-md bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          )}
          <p className="text-[10px] text-[var(--color-text-faint)]">
            Este é o comportamento real que o agente já tem hoje, embutido no n8n — mostrado aqui só pra
            transparência. Editar aqui não muda isso; use o campo abaixo para adicionar instruções por cima.
          </p>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 pt-2">
        <span
          className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide border ${
            agent.isCustomized
              ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30"
              : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"
          }`}
        >
          {agent.isCustomized ? "Customizado por este tenant" : "Padrão global"}
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onSave(value, agent.name, agent.description)}
          disabled={!dirty || saving}
          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg shadow-none border ${
            dirty
              ? "bg-[var(--color-primary-blue)]/10 !text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30 hover:bg-[var(--color-primary-blue)]/20"
              : "bg-[var(--color-surface-sunken)] !text-[var(--color-text-faint)] border-[var(--color-border-default)]"
          }`}
        >
          {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Instruções adicionais para este agente, específicas da sua empresa (ex: um produto especial, uma regra de atendimento, um jeito de falar)..."
        rows={6}
        className="w-full text-xs font-mono bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg p-3 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-blue)]/50 resize-y"
      />
      <p className="text-[10px] text-[var(--color-text-faint)]">
        Isto é somado ao comportamento padrão do agente, nunca o substitui — não cole o prompt inteiro aqui.
        Salvar cria/atualiza só a versão deste tenant, isolada por execução — não muda o padrão nem o que os outros tenants veem.
        {agent.updatedAt && ` Última atualização: ${new Date(agent.updatedAt).toLocaleString("pt-BR")}.`}
      </p>
    </div>
  );
}
