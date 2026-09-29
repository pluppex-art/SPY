import { useState } from "react";
import { Bot, Workflow } from "lucide-react";
import {
  AURORA_AGENTS_DEFAULT, ROLE_ICONS, FIXED_N8N_PROMPT_KEY, promptKeyForAgent,
} from "../../settings/sections/SettingsSistemaAuroraAgentes";
import { AgentFlowViewerModal } from "../../settings/sections/AgentFlowViewer";
import { getFlowForAgentKey } from "../../settings/sections/agentFlowDiagrams";

/**
 * Catálogo global de agentes da plataforma, visível pra qualquer master — antes só existia
 * dentro de Configurações → Sistema → Aurora, escopado a um tenant específico (dono da sessão),
 * então o admin master nunca via essa lista aqui. Esta aba é só leitura (nenhum toggle/editar/
 * remover — isso é decisão por tenant, feita lá) + o mesmo "Ver fluxo" com a estrutura REAL de
 * cada workflow no n8n.
 */
const CATALOG_WITH_AURORA = [
  { name: "Aurora", role: "Núcleo", description: "Orquestradora central — atende chat pessoal e WhatsApp da equipe em todos os tenants." },
  ...AURORA_AGENTS_DEFAULT,
];

export function AdminAgentsTab() {
  const [flowAgentName, setFlowAgentName] = useState<string | null>(null);
  const flowAgent = CATALOG_WITH_AURORA.find((a) => a.name === flowAgentName);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <Bot className="w-4 h-4 text-violet-400" /> Catálogo de agentes da plataforma
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Lista global — ativar/desativar ou renomear é feito por empresa, em Configurações → Sistema → Aurora de cada tenant.
          </p>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] shrink-0">{CATALOG_WITH_AURORA.length} agentes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {CATALOG_WITH_AURORA.map((agent) => {
          const Icon = (agent.role && ROLE_ICONS[agent.role]) || Bot;
          return (
            <div
              key={agent.name}
              className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-violet-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{agent.name}</p>
                  {agent.role && (
                    <span className="text-[9px] font-black uppercase tracking-widest text-violet-400 shrink-0">{agent.role}</span>
                  )}
                </div>
                {agent.description && (
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-relaxed">{agent.description}</p>
                )}
                <button
                  onClick={() => setFlowAgentName(agent.name)}
                  className="mt-2.5 flex items-center gap-1 px-2 py-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] rounded-lg transition-colors text-[10px] font-bold"
                >
                  <Workflow className="w-3 h-3" /> Ver fluxo
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {flowAgent && (
        <AgentFlowViewerModal
          isOpen={!!flowAgentName}
          onClose={() => setFlowAgentName(null)}
          agentDisplayName={flowAgent.name}
          diagram={getFlowForAgentKey(FIXED_N8N_PROMPT_KEY[flowAgent.name] ?? promptKeyForAgent(flowAgent.name))}
        />
      )}
    </div>
  );
}
