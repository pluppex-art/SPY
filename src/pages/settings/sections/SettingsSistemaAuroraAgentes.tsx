import { useState, useEffect } from "react";
import {
  Bot, Pencil, Sparkles, UserSearch, Eye, Radar,
  Handshake, Briefcase, LineChart, Search, Headset, Wallet, Megaphone, ClipboardList, Trash2, Sunrise, Workflow,
} from "lucide-react";
import { AgentFlowViewerModal } from "./AgentFlowViewer";
import { getFlowForAgentKey } from "./agentFlowDiagrams";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { Modal } from "../../../components/ui/modal";
import { Input } from "../../../components/ui/input";
import { FormField } from "../../../components/ui/form-field";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";
import type { AuroraAgent } from "../../../contexts/DataContextTypes";
import { useAgentPrompts } from "../../../hooks/useAgentPrompts";
import { useTenantAiConfig } from "../../../hooks/useTenantAiConfig";
import { ViewPromptButton, InlinePromptEditor } from "./AgentPromptControls";

// Card "Aurora" (núcleo) — id sintético, não é uma linha de aurora_agents. Liga/desliga
// aqui grava em tenant_ai_config.aurora_enabled (useTenantAiConfig), não em aurora_agents.
const AURORA_CORE_ID = "aurora-core";

// Os 3 agentes que a Aurora pode de fato ACIONAR (workflows reais no n8n, controlados por
// tenant_ai_config.allowed_execute_modules) — antes tinham um botão Liberado/Bloqueado
// separado do switch de ativo/inativo; agora é o MESMO switch do card (ver isExecuteActive/
// handleToggle abaixo) — só esses 3 controlam essa tabela em vez de aurora_agents.active,
// pra não duplicar controle nem ter um botão a mais que só repetia a mesma decisão.
const EXECUTE_MODULE_BY_NAME: Record<string, string> = {
  "Radar de Oportunidades": "radar",
  "Júlia — SDR": "sdr",
  "Closer": "closer",
};

// Catálogo padrão só exibido em memória enquanto o tenant não salvou nenhum
// agente ainda — mesmo padrão já usado pros funis (FUNIS_DEFAULT em
// funisTypes.ts): nada é gravado sozinho, vira registro real só quando o
// admin editar/salvar algo pela primeira vez. Cobre todas as frentes reais
// do CRM (SDR, inteligência, prospecção, vendas, comercial, atendimento,
// financeiro, marketing, operações, executivo, pesquisa) — são personas de
// negócio, não os nomes técnicos das AURORA_TOOLS (ferramentas internas que
// a Aurora chama por trás; o agente é quem representa isso pro usuário).
const AURORA_AGENTS_DEFAULT: Array<Pick<AuroraAgent, "name" | "role" | "description">> = [
  { name: "Júlia — SDR", role: "SDR", description: "Qualificação e primeiro contato com leads recebidos." },
  { name: "Agente Secreto", role: "Inteligência", description: "Monitoramento e alertas de oportunidades ocultas no pipeline." },
  { name: "Radar de Oportunidades", role: "Prospecção", description: "Identifica leads quentes e sinais de compra em tempo real." },
  { name: "Closer", role: "Vendas", description: "Condução de negociações e fechamento de propostas." },
  { name: "Agente Comercial", role: "Comercial", description: "Suporte geral ao time comercial no dia a dia do CRM." },
  { name: "Diretoria", role: "Executivo", description: "Resumos e recomendações estratégicas para a liderança." },
  { name: "Pesquisa", role: "Pesquisa", description: "Levantamento de dados de mercado e concorrência." },
  { name: "Atendimento", role: "Suporte", description: "Acompanhamento de clientes ativos e chamados de suporte." },
  { name: "Financeiro", role: "Financeiro", description: "Resumos de fluxo de caixa, contas e inadimplência." },
  { name: "Marketing", role: "Marketing", description: "Leitura de campanhas, landing pages e origem dos leads." },
  { name: "Organização", role: "Operações", description: "Tarefas pendentes, agenda e follow-ups do dia a dia." },
  { name: "Briefing Diário", role: "Briefing", description: "Resumo executivo enviado por WhatsApp às 8h, com prioridades do dia personalizadas por pessoa." },
];

const ROLE_ICONS: Record<string, typeof Bot> = {
  SDR: UserSearch,
  "Inteligência": Eye,
  "Prospecção": Radar,
  Vendas: Handshake,
  Comercial: Briefcase,
  Executivo: LineChart,
  Pesquisa: Search,
  Suporte: Headset,
  Financeiro: Wallet,
  Marketing: Megaphone,
  "Operações": ClipboardList,
  Briefing: Sunrise,
};

function RoleIcon({ role }: { role?: string }) {
  const Icon = (role && ROLE_ICONS[role]) || Bot;
  return <Icon className="w-4 h-4 text-violet-400" />;
}

// Todo agente do catálogo com workflow real no n8n usa chave FIXA — é exatamente o agent_key
// que o n8n já lê ao vivo por tenant (ver cada workflow entre parênteses). Nunca derivar esses
// do nome: o catálogo permite editar o nome de um agente (botão Editar), e se a chave mudasse
// junto o vínculo com o n8n quebraria silenciosamente. As personas sem workflow 1:1 continuam
// usando uma chave derivada do nome, prefixada "persona-" pra nunca colidir com as fixas.
const FIXED_N8N_PROMPT_KEY: Record<string, string> = {
  Aurora: "aurora", // Helper - Checar Config Aurora Tenant + AURORA CORE
  ...EXECUTE_MODULE_BY_NAME, // Radar, Júlia SDR v2, Closer AI
  "Diretoria": "diretoria", // CEO AI
  "Agente Comercial": "agente_comercial", // CCO AI
  "Financeiro": "financeiro", // CFO AI
  "Marketing": "marketing", // CMO AI
  "Organização": "organizacao", // COO AI
  "Pesquisa": "pesquisa", // Research Intelligence
  "Agente Secreto": "agente_secreto", // CRM Customer Intelligence
  "Atendimento": "atendimento", // Gerencia Customer Success
  "Briefing Diário": "briefing_diario", // Autonomous Daily Briefing
};

function promptKeyForAgent(name: string): string {
  if (FIXED_N8N_PROMPT_KEY[name]) return FIXED_N8N_PROMPT_KEY[name];
  const slug = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `persona-${slug}`;
}

// originalName é o nome de CATÁLOGO (interno, nunca editável) de quando o modal abriu — é ele
// que resolve o agent_key (promptKeyForAgent), nunca o que o usuário digita no campo Nome.
// Pra agente ligado ao n8n, o campo Nome edita um APELIDO por tenant (guardado em
// ai_agent_prompts.name, mesma linha do prompt aditivo), não o nome de catálogo — é assim que
// o cliente pode chamar a Júlia de outro nome sem quebrar o vínculo com o workflow real.
type EditingState = { id?: string; name: string; originalName: string; role: string; description: string } | null;

// Nome de exibição real de um agente: pra quem tem workflow no n8n, é o apelido que o tenant
// salvou em ai_agent_prompts.name (upsert por tenant, nunca sobrescreve o catálogo global);
// sem apelido salvo ainda, ou pra quem não é ligado ao n8n, mostra o nome de catálogo mesmo.
function displayNameForAgent(agent: Pick<AuroraAgent, "name">, promptByKey: Map<string, { name: string }>): string {
  const key = FIXED_N8N_PROMPT_KEY[agent.name];
  if (!key) return agent.name;
  return promptByKey.get(key)?.name || agent.name;
}

export function ConfigSistemaAuroraAgentes() {
  const { auroraAgents, addAuroraAgent, updateAuroraAgent, deleteAuroraAgent, toggleAuroraAgent, ensureNicheModulesLoaded } = useData();
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);
  const [editing, setEditing] = useState<EditingState>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flowViewerAgentId, setFlowViewerAgentId] = useState<string | null>(null);
  const { prompts, loading: promptsLoading, savingKey: promptSavingKey, updatePrompt } = useAgentPrompts();
  const promptByKey = new Map(prompts.map((p) => [p.agentKey, p]));
  const { config, update: updateTenantAiConfig } = useTenantAiConfig();
  const [pendingExecuteKey, setPendingExecuteKey] = useState<string | null>(null);
  const [savingAuroraCore, setSavingAuroraCore] = useState(false);

  const hasCustomAgents = auroraAgents.length > 0;
  const personaList = hasCustomAgents ? auroraAgents : AURORA_AGENTS_DEFAULT.map((a, i) => ({ ...a, id: `default-${i}`, active: true } as AuroraAgent));
  // "Aurora" (núcleo) entra como a primeira entrada da mesma lista — deixa de ser um card
  // separado no topo da página. Toggle dela vai pro tenant_ai_config, não pro aurora_agents.
  const auroraCoreEntry: AuroraAgent = {
    id: AURORA_CORE_ID,
    name: "Aurora",
    role: "Núcleo",
    description: "Orquestradora central — desativar aqui faz a Aurora recusar educadamente qualquer mensagem desta empresa (chat pessoal e WhatsApp da equipe) até reativar.",
    active: config?.auroraEnabled ?? true,
  } as AuroraAgent;
  const displayList: AuroraAgent[] = [auroraCoreEntry, ...personaList];

  // Convencao da tabela: array vazio = tudo liberado (nenhuma restricao adicional).
  const executeRestricted = (config?.allowedExecuteModules.length ?? 0) > 0;
  const isExecuteActive = (moduleKey: string) =>
    !executeRestricted || (config?.allowedExecuteModules.includes(moduleKey) ?? false);

  const handleToggleExecuteModule = async (moduleKey: string) => {
    if (!config) return;
    setPendingExecuteKey(moduleKey);
    const current = config.allowedExecuteModules;
    const next = isExecuteActive(moduleKey)
      // Desligando: se ainda não havia restrição (array vazio = tudo liberado), vira uma
      // lista explícita com todos OS OUTROS agentes de execução, senão eles perderiam acesso
      // junto — só quando já era uma lista explícita é que basta remover esta chave dela.
      ? (executeRestricted ? current.filter((k) => k !== moduleKey) : Object.values(EXECUTE_MODULE_BY_NAME).filter((k) => k !== moduleKey))
      : [...current, moduleKey];
    await updateTenantAiConfig({ allowedExecuteModules: next });
    setPendingExecuteKey(null);
  };

  const handleToggle = async (agent: AuroraAgent) => {
    if (agent.id === AURORA_CORE_ID) {
      setSavingAuroraCore(true);
      await updateTenantAiConfig({ auroraEnabled: !(config?.auroraEnabled ?? true) });
      setSavingAuroraCore(false);
      return;
    }
    // Radar de Oportunidades/Júlia-SDR/Closer: o switch já É o controle de execução real
    // (tenant_ai_config.allowed_execute_modules) — não um botão Liberado/Bloqueado à parte.
    const executeKey = EXECUTE_MODULE_BY_NAME[agent.name];
    if (executeKey) {
      await handleToggleExecuteModule(executeKey);
      return;
    }
    if (!hasCustomAgents) {
      // Ainda é só o catálogo padrão em memória — a primeira interação
      // materializa o agente como registro real no tenant.
      addAuroraAgent({ name: agent.name, role: agent.role, description: agent.description, active: false });
      toast.info(`"${agent.name}" desativado. Os demais agentes do catálogo padrão foram salvos como ativos.`);
      AURORA_AGENTS_DEFAULT.filter(a => a.name !== agent.name).forEach(a => {
        addAuroraAgent({ name: a.name, role: a.role, description: a.description, active: true });
      });
      return;
    }
    toggleAuroraAgent(agent.id);
  };

  const handleSave = () => {
    if (!editing?.name.trim()) { toast.error("Nome do agente é obrigatório."); return; }
    const n8nKey = FIXED_N8N_PROMPT_KEY[editing.originalName];
    if (n8nKey) {
      // Agente ligado ao n8n: o campo Nome é o apelido do tenant, grava em
      // ai_agent_prompts.name (mesma linha do prompt aditivo) — nunca em aurora_agents.name,
      // que fica fixo pra não perder o vínculo com o agent_key real. Preserva o texto do
      // prompt e a descrição já salvos (se houver) em vez de zerar ao só trocar o nome.
      const existing = promptByKey.get(n8nKey);
      updatePrompt(n8nKey, existing?.prompt ?? "", editing.name, existing?.description ?? editing.description);
      toast.success("Apelido do agente atualizado.");
      setEditing(null);
      return;
    }
    if (!hasCustomAgents) {
      // Catálogo ainda em memória — a primeira edição materializa todo mundo de uma vez
      // (mesmo padrão do handleToggle/handleDelete abaixo): o agente editado entra com os
      // valores novos, os demais exatamente como estavam no catálogo padrão.
      addAuroraAgent({ name: editing.name, role: editing.role, description: editing.description, active: true });
      AURORA_AGENTS_DEFAULT.filter((a) => a.name !== editing.originalName).forEach((a) => {
        addAuroraAgent({ name: a.name, role: a.role, description: a.description, active: true });
      });
      toast.success("Agente atualizado.");
      setEditing(null);
      return;
    }
    if (editing.id) {
      updateAuroraAgent(editing.id, { name: editing.name, role: editing.role, description: editing.description });
      toast.success("Agente atualizado.");
    } else {
      addAuroraAgent({ name: editing.name, role: editing.role, description: editing.description, active: true });
      toast.success("Agente adicionado.");
    }
    setEditing(null);
  };

  const handleDelete = async (agent: AuroraAgent) => {
    if (!(await confirmDialog({
      title: "Remover agente",
      description: `Remover "${agent.name}" da lista de agentes vinculados à Aurora? Essa ação não pode ser desfeita.`,
    }))) return;
    if (!hasCustomAgents) {
      // Catálogo ainda em memória — materializa todo mundo, exceto o agente removido.
      AURORA_AGENTS_DEFAULT.filter((a) => a.name !== agent.name).forEach((a) => {
        addAuroraAgent({ name: a.name, role: a.role, description: a.description, active: true });
      });
      toast.success(`"${agent.name}" removido.`);
      return;
    }
    deleteAuroraAgent(agent.id);
    toast.success("Agente removido.");
  };

  const activeCount = displayList.filter((a) => a.active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Bot className="w-5 h-5 text-violet-400" /> Agentes vinculados à Aurora
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Cada agente pode ser ativado ou desativado — a Aurora não age em nome de um agente inativo quando ele é citado diretamente na conversa.
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-full px-3 py-1.5 whitespace-nowrap">
          {activeCount}/{displayList.length} ativos
        </span>
      </div>

      {!hasCustomAgents && (
        <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            Nenhum agente foi salvo ainda — mostrando o catálogo padrão. Ative/desative ou edite algum pra começar a personalizar por sua empresa.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {displayList.map((agent) => {
          const promptKey = promptKeyForAgent(agent.name);
          const isExpanded = expandedId === agent.id;
          const executeKey = EXECUTE_MODULE_BY_NAME[agent.name];
          // Pros 3 agentes de execução, o switch reflete allowed_execute_modules (a permissão
          // real), não aurora_agents.active — pra qualquer outro agente, active mesmo.
          const isActive = executeKey ? isExecuteActive(executeKey) : agent.active;
          return (
            <Card
              key={agent.id}
              className={`p-4 bg-[var(--color-surface-elevated)]/80 border transition-colors ${
                isActive ? "border-[var(--color-border-default)]" : "border-[var(--color-border-subtle)] opacity-60"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                  <RoleIcon role={agent.role} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{displayNameForAgent(agent, promptByKey)}</p>
                      {agent.role && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-violet-400">
                          {agent.role}
                        </span>
                      )}
                    </div>
                    <Switch
                      checked={isActive}
                      disabled={
                        (agent.id === AURORA_CORE_ID && savingAuroraCore) ||
                        (!!executeKey && pendingExecuteKey === executeKey)
                      }
                      onCheckedChange={() => handleToggle(agent)}
                    />
                  </div>
                  {agent.description && <p className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed">{agent.description}</p>}

                  <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-[var(--color-border-subtle)] flex-wrap">
                    <ViewPromptButton
                      agentKey={agent.id}
                      expandedKey={expandedId}
                      setExpandedKey={setExpandedId}
                    />
                    <button
                      onClick={() => setFlowViewerAgentId(agent.id)}
                      className="flex items-center gap-1 px-2 py-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] rounded-lg transition-colors text-[10px] font-bold"
                      title="Ver como esse agente funciona"
                    >
                      <Workflow className="w-3 h-3" /> Ver fluxo
                    </button>
                    {agent.id !== AURORA_CORE_ID && (
                      <>
                        <button
                          onClick={() => setEditing({ id: agent.id, name: displayNameForAgent(agent, promptByKey), originalName: agent.name, role: agent.role || "", description: agent.description || "" })}
                          className="flex items-center gap-1 px-2 py-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] rounded-lg transition-colors text-[10px] font-bold"
                          title="Editar agente"
                        >
                          <Pencil className="w-3 h-3" /> Editar
                        </button>
                        <button
                          onClick={() => handleDelete(agent)}
                          className="flex items-center gap-1 px-2 py-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors text-[10px] font-bold"
                          title="Remover agente"
                        >
                          <Trash2 className="w-3 h-3" /> Remover
                        </button>
                      </>
                    )}
                  </div>

                  {isExpanded && (
                    <InlinePromptEditor
                      agentKey={promptKey}
                      agent={promptByKey.get(promptKey)}
                      loading={promptsLoading}
                      saving={promptSavingKey === promptKey}
                      onSave={(text, name, description) => updatePrompt(promptKey, text, name, description)}
                    />
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Editar Agente" : "Novo Agente"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        }
      >
        {editing && (() => {
          const isN8nLinked = !!FIXED_N8N_PROMPT_KEY[editing.originalName];
          return (
            <div className="space-y-4">
              <FormField label={isN8nLinked ? "Apelido do Agente" : "Nome do Agente"}>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex: Closer"
                />
                {isN8nLinked && (
                  <p className="text-[10px] text-[var(--color-text-faint)] mt-1">
                    Esse é o nome que aparece pra você e pro seu cliente — pode trocar à vontade (ex: "Júlia" vira
                    outro nome). O funcionamento por trás continua o mesmo, controlado pela Pluppex; só o apelido
                    muda por empresa.
                  </p>
                )}
              </FormField>
              <FormField label="Papel/Função">
                <Input value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} placeholder="Ex: Vendas" />
              </FormField>
              <FormField label="Descrição">
                <Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="O que esse agente faz" />
              </FormField>
            </div>
          );
        })()}
      </Modal>

      {(() => {
        const flowAgent = displayList.find((a) => a.id === flowViewerAgentId);
        if (!flowAgent) return null;
        const key = FIXED_N8N_PROMPT_KEY[flowAgent.name] ?? promptKeyForAgent(flowAgent.name);
        return (
          <AgentFlowViewerModal
            isOpen={!!flowViewerAgentId}
            onClose={() => setFlowViewerAgentId(null)}
            agentDisplayName={displayNameForAgent(flowAgent, promptByKey)}
            diagram={getFlowForAgentKey(key)}
          />
        );
      })()}
    </div>
  );
}
