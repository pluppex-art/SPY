import { useState } from "react";
import { ShieldCheck, HardDrive, ExternalLink, RefreshCw, Gauge, ShieldAlert, FileText, Save } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { useAuroraTokenUsage } from "../../../hooks/useAuroraTokenUsage";
import { useTenantAiConfig } from "../../../hooks/useTenantAiConfig";
import { useAuth } from "../../../contexts/AuthContext";
import { ConfigSistemaAuroraAgentes } from "./SettingsSistemaAuroraAgentes";

// Esta tela mostrava um painel inteiro de "backup" que não fazia nada:
// destino de storage (S3/GCS/SFTP), botão "Criar Snapshot Agora" e um card
// com data/tamanho/checksum SHA-512 fixos — nenhum backup nunca foi
// disparado por nenhum desses controles. O armazenamento real deste sistema
// é o Postgres gerenciado pelo Supabase, que já faz backup automático (e
// Point-in-Time Recovery nos planos pagos) na infraestrutura deles — não faz
// sentido fingir um sistema de backup próprio por cima disso. Esta versão
// só descreve a realidade e aponta pra onde o backup de fato é gerenciado.
export function ConfigSistemaBackups() {
  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Backups & Segurança do Banco de Dados <ShieldCheck className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          O banco de dados deste sistema roda no Supabase, que gerencia backup e recuperação na própria infraestrutura.
        </p>
      </div>

      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-4 shadow-sm">
        <h3 className="font-bold text-sm text-[var(--color-text-primary)] flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-[var(--color-primary-blue)]" /> Onde o backup é gerenciado
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          O Supabase realiza backups automáticos do banco de dados de acordo com o plano contratado do projeto
          (backups diários e, em planos superiores, Point-in-Time Recovery). Este painel do S.P.Y. CRM não controla
          nem substitui isso — a configuração e restauração de backups fica no painel do próprio Supabase.
        </p>
        <a
          href="https://supabase.com/docs/guides/platform/backups"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-primary-blue)] hover:underline"
        >
          Ver documentação de backups do Supabase <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </Card>
    </div>
  );
}

function daysLeftInCycle(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

function formatFull(n: number): string {
  return n.toLocaleString("pt-BR");
}

// Todo plano vende um pacote fixo de 10 mil créditos por ciclo — o número de
// tokens por trás (tenant_token_limits.monthly_limit) varia por plano, mas o
// cliente nunca vê "tokens" na tela, só créditos. Os créditos são sempre
// proporcionais ao % de consumo real (mesma base que já trava a Aurora no
// backend), então não existe conversão fixa tokens→créditos por plano: é
// sempre "% consumido do ciclo" aplicado sobre os 10 mil créditos do pacote.
const CREDITS_PER_CYCLE = 10000;

/**
 * Configurações → Sistema → Aurora — página única (era duas: "Aurora" em Inteligência
 * Artificial e "Aurora — Consumo & Agentes" em Sistema; unificadas a pedido, já que o
 * conteúdo é o mesmo tema e a divisão só confundia). Reúne: controle liga/desliga +
 * instruções específicas do tenant + prompts base por agente (tenant_ai_config +
 * ai_agent_prompts, ver useTenantAiConfig/useAgentPrompts), consumo de créditos do ciclo
 * (tenant_token_limits/tenant_token_usage_current_month, ver useAuroraTokenUsage) e o
 * catálogo de agentes/personas vinculados à Aurora (aurora_agents, ver
 * SettingsSistemaAuroraAgentes). Acesso: mesmo de antes, só pelo módulo "aurora" contratado
 * (isModuleEnabled em SettingsLayout.tsx) — nenhum gate extra de master/admin, disponível
 * pra qualquer tenant e qualquer usuário dele, igual em todo o sistema.
 *
 * O liga/desliga geral da Aurora e os toggles de execução (radar/sdr/closer, antes num card
 * "Agentes que a Aurora pode acionar" separado) foram consolidados dentro de
 * ConfigSistemaAuroraAgentes — o card "Aurora" vira só mais uma entrada da lista de agentes,
 * e os 3 agentes de execução ganham o toggle Liberado/Bloqueado junto do resto. Menos telas
 * fazendo a mesma coisa de jeitos diferentes.
 *
 * Dois mecanismos complementares de prompt, não redundantes: `ai_agent_prompts` é o texto
 * BASE de cada agente (Aurora/Radar/Júlia-SDR/Closer); `tenant_ai_config.custom_prompt`
 * (card "Instruções específicas deste tenant") é um contexto de negócio ANEXADO por cima,
 * um por tenant, sem variante padrão/override — já é isolado por tenant desde a origem.
 * Ambos já são lidos ao vivo pelo n8n (Helper - Checar Config Aurora Tenant + AURORA CORE),
 * cada um isolado por tenant/execução — salvar aqui já reflete na Aurora, sem passo manual.
 */
export function ConfigSistemaAuroraUso() {
  const { usage, loading: usageLoading, refresh } = useAuroraTokenUsage();
  const { config, loading: configLoading, update } = useTenantAiConfig();
  const { activeTenantName, user } = useAuth();
  const isMaster = !!user?.isMaster;
  const [refreshing, setRefreshing] = useState(false);
  const [customPromptDraft, setCustomPromptDraft] = useState<string | null>(null);
  const [savingCustomPrompt, setSavingCustomPrompt] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleSaveCustomPrompt = async () => {
    if (customPromptDraft === null) return;
    setSavingCustomPrompt(true);
    await update({ customPrompt: customPromptDraft });
    setSavingCustomPrompt(false);
  };

  const percent = usage?.percentUsed ?? 0;
  const creditsUsed = Math.round((percent / 100) * CREDITS_PER_CYCLE);
  const creditsLeft = Math.max(0, CREDITS_PER_CYCLE - creditsUsed);
  const barColor = usage?.limitReached ? "bg-danger" : percent >= 90 ? "bg-warning" : "bg-success";
  const textColor = usage?.limitReached ? "text-danger" : percent >= 90 ? "text-warning" : "text-success";

  return (
    <div className="max-w-3xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">Aurora — Controle, Consumo & Agentes</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            O que a Aurora pode fazer, seu consumo de IA no ciclo mensal e os agentes vinculados, tudo pra{" "}
            {activeTenantName ?? "sua empresa"}.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          size="sm"
          className="bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white border border-[var(--color-primary-blue)] font-bold uppercase tracking-wider shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {!isMaster ? null : configLoading || !config ? (
        <p className="text-xs text-[var(--color-text-muted)]">Carregando configuração...</p>
      ) : (
        <>
          <Card className="p-6 bg-[var(--color-surface-elevated)]/80 border border-[var(--color-border-default)] space-y-3">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-widest text-[var(--color-primary-blue)] flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" />
                <span>Instruções específicas deste tenant</span>
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Contexto de negócio anexado ao prompt da Aurora só para {activeTenantName ?? "esta empresa"} (ex.: termos,
                produtos, tom de voz específicos). Buscado direto pelo tenant a cada execução no n8n — nunca compartilhado
                com outros tenants.
              </p>
            </div>
            <textarea
              value={customPromptDraft ?? config.customPrompt}
              onChange={(e) => setCustomPromptDraft(e.target.value)}
              placeholder="Ex.: Somos uma boliche/lazer familiar, sempre trate reservas como 'partidas', evite jargão técnico..."
              rows={5}
              className="w-full text-xs font-mono bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg p-3 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-blue)]/50 resize-y"
            />
            <div className="flex items-center justify-between">
              {config.updatedAt ? (
                <p className="text-[10px] text-[var(--color-text-faint)]">
                  Última atualização: {new Date(config.updatedAt).toLocaleString("pt-BR")}
                </p>
              ) : <span />}
              <Button
                type="button"
                variant="ghost"
                onClick={handleSaveCustomPrompt}
                disabled={savingCustomPrompt || customPromptDraft === null || customPromptDraft === config.customPrompt}
                className={`flex items-center gap-1.5 text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg shadow-none border ${
                  customPromptDraft !== null && customPromptDraft !== config.customPrompt
                    ? "bg-[var(--color-primary-blue)]/10 !text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30 hover:bg-[var(--color-primary-blue)]/15"
                    : "bg-[var(--color-surface-sunken)] !text-[var(--color-text-faint)] border-[var(--color-border-default)]"
                }`}
              >
                {savingCustomPrompt ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {savingCustomPrompt ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </Card>
        </>
      )}

      <Card className="p-6 bg-[var(--color-surface-elevated)]/80 border border-[var(--color-border-default)] space-y-5">
        <h3 className="font-bold text-xs uppercase tracking-widest text-[var(--color-primary-blue)] flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5" />
          <span>Consumo do ciclo atual</span>
        </h3>

        {usageLoading ? (
          <p className="text-xs text-[var(--color-text-muted)]">Carregando consumo...</p>
        ) : !usage || usage.tokensLimit === null ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Nenhum limite configurado para este tenant ainda — a Aurora está liberada sem restrição de consumo.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className={`text-3xl font-black tabular-nums ${textColor}`}>{percent.toFixed(1)}%</span>
                <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
                  {formatFull(creditsUsed)} / {formatFull(CREDITS_PER_CYCLE)} créditos
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.max(1, Math.min(100, percent))}%` }}
                />
              </div>
            </div>

            {usage.limitReached && (
              <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl">
                <p className="text-xs text-danger leading-relaxed">
                  Limite atingido — a Aurora está bloqueada até o próximo ciclo ou até um upgrade de plano.
                </p>
              </div>
            )}
            {!usage.limitReached && percent >= 90 && (
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-xl">
                <p className="text-xs text-warning leading-relaxed">
                  Consumo perto do limite deste ciclo — a Aurora bloqueia automaticamente ao atingir 100%.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-[var(--color-surface)] border border-[var(--color-border-subtle)] p-3 rounded-xl space-y-0.5">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Plano</p>
                <p className="font-bold text-[var(--color-text-primary)]">{usage.planName ?? "—"}</p>
              </div>
              <div className="bg-[var(--color-surface)] border border-[var(--color-border-subtle)] p-3 rounded-xl space-y-0.5">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Restam no mês</p>
                <p className="font-bold text-[var(--color-text-primary)]">{formatFull(creditsLeft)} créditos</p>
              </div>
              <div className="bg-[var(--color-surface)] border border-[var(--color-border-subtle)] p-3 rounded-xl space-y-0.5">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Renova em</p>
                <p className="font-bold text-[var(--color-text-primary)]">{daysLeftInCycle()} dias</p>
              </div>
            </div>
          </>
        )}
      </Card>

      <div className="pt-4 border-t border-[var(--color-border-default)]">
        <ConfigSistemaAuroraAgentes />
      </div>

      {isMaster && <Card className="p-5 bg-warning/5 border border-warning/20 space-y-2">
        <h3 className="font-bold text-xs text-warning flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5" /> Ainda não existe nesta tela
        </h3>
        <p className="text-xs text-warning/80 leading-relaxed">
          Permissão granular de leitura/escrita por ferramenta (ex: "Aurora pode ler leads mas não criar"),
          conexão com sistemas externos do cliente e integrações/APIs de terceiros fazem parte de fases
          futuras do projeto de integração — ainda não estão implementadas, e esta tela não finge que estão.
        </p>
      </Card>}
    </div>
  );
}
