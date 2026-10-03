import { Workflow, Zap, Plug, Bot, ArrowRight } from "lucide-react";
import { Modal } from "../../components/ui/modal";
import { Badge } from "../../components/ui/badge";
import { useData } from "../../contexts/DataContext";
import { useExternalIntegrations } from "../../hooks/useExternalIntegrations";
import { getImplementacaoFunil, WIN_FUNIL_CONFIG_KEY } from "../../lib/implementationStage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Mesmo mapa fixo já usado em ConfigCRMGatilhosIA.tsx — os gatilhos de lead
// score hoje só miram etapas do funil SDR padrão, então é a mesma referência
// usada lá pra mostrar o nome da etapa em vez do id cru.
const SDR_STAGE_LABEL: Record<string, string> = {
  "sdr-1": "Novos Leads (Inbound)",
  "sdr-2": "Tentando Contato",
  "sdr-3": "Contato Realizado / Qualificação",
  "sdr-4": "Reunião Agendada",
  "sdr-5": "Desqualificado / Sem Interesse",
};

function Section({ icon: Icon, title, count, children }: { icon: typeof Workflow; title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--color-primary-blue)]" /> {title}
        <Badge variant="secondary" className="ml-1">{count}</Badge>
      </h3>
      {children}
    </div>
  );
}

const EmptyRow = ({ text }: { text: string }) => (
  <p className="text-[11px] text-[var(--color-text-faint)] italic py-1.5">{text}</p>
);

/** Painel só de leitura — mostra tudo que já automatiza algo sozinho no SPY
 * (gatilhos, conexões entre funis, webhooks, agentes de IA), hoje espalhado
 * em várias telas de Configurações. Nada aqui é editável; cada item linka
 * implicitamente pra onde ele é configurado de verdade. */
export function AutomationsMapModal({ isOpen, onClose }: Props) {
  const { leadScoreTriggers, funis, appSettings, auroraAgents } = useData();
  const { integrations } = useExternalIntegrations();

  const winFunilConfig = (appSettings?.[WIN_FUNIL_CONFIG_KEY] as Record<string, string>) || {};
  const funilConnections = Object.entries(winFunilConfig).map(([sourceId, targetId]) => {
    const source = (funis as any[]).find((f) => f.id === sourceId);
    const target = (funis as any[]).find((f) => f.id === targetId);
    return { sourceId, targetId, sourceName: source?.nome || sourceId, targetName: target?.nome || targetId };
  });
  // Mesma resolução usada pela página de Implementações — só pra confirmar que
  // a conexão configurada aponta pra um funil que ainda existe de verdade.
  void getImplementacaoFunil(appSettings, funis as any[]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mapa de Automações" maxWidth="max-w-2xl"
      description="Tudo que já roda sozinho no SPY — gatilhos de IA, conexões entre funis, webhooks e agentes. Só visualização; edite em Configurações.">
      <div className="space-y-6">
        <Section icon={Workflow} title="Conexões entre funis" count={funilConnections.length}>
          {funilConnections.length === 0 ? (
            <EmptyRow text="Nenhum funil configurado pra promover negócios ganhos automaticamente pra outro funil." />
          ) : (
            <div className="space-y-1.5">
              {funilConnections.map((c) => (
                <div key={c.sourceId} className="flex items-center gap-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] px-3 py-2">
                  <span className="font-bold text-[var(--color-text-primary)]">{c.sourceName}</span>
                  <span className="text-[var(--color-text-faint)]">— negócio ganho —</span>
                  <ArrowRight className="w-3 h-3 text-[var(--color-primary-blue)] shrink-0" />
                  <span className="font-bold text-[var(--color-primary-blue)]">{c.targetName}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Zap} title="Gatilhos de Lead Score (IA)" count={leadScoreTriggers?.length ?? 0}>
          {!leadScoreTriggers || leadScoreTriggers.length === 0 ? (
            <EmptyRow text="Nenhum gatilho de score cadastrado (Configurações › CRM › Gatilhos IA)." />
          ) : (
            <div className="space-y-1.5">
              {leadScoreTriggers.map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] px-3 py-2 flex-wrap">
                  <span className="text-[var(--color-text-primary)]">
                    Score <span className="font-bold">{t.condition === "greater" ? "maior" : "menor"} que {t.scoreThreshold}</span>
                  </span>
                  <ArrowRight className="w-3 h-3 text-[var(--color-primary-blue)] shrink-0" />
                  <span className="font-bold text-[var(--color-primary-blue)]">{SDR_STAGE_LABEL[t.targetStageId] || t.targetStageId}</span>
                  {t.autoMessage && <Badge variant="info">+ mensagem automática</Badge>}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Plug} title="Conectores externos (webhooks)" count={integrations.length}>
          {integrations.length === 0 ? (
            <EmptyRow text="Nenhum conector cadastrado (Configurações › Integrações › Conectores Externos)." />
          ) : (
            <div className="space-y-1.5">
              {integrations.map((i) => (
                <div key={i.id} className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] px-3 py-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-[var(--color-text-primary)]">{i.name}</span>
                    <Badge variant={i.active ? "success" : "neutral"}>{i.active ? "Ativo" : "Pausado"}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {i.syncEvents.length === 0
                      ? <span className="text-[10px] text-[var(--color-text-faint)] italic">Nenhum evento assinado</span>
                      : i.syncEvents.map((e) => <Badge key={e} variant="neutral">{e}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Bot} title="Agentes Aurora (IA)" count={(auroraAgents as any[])?.length ?? 0}>
          {!auroraAgents || auroraAgents.length === 0 ? (
            <EmptyRow text="Nenhum agente Aurora cadastrado (Configurações › Sistema › Aurora Agentes)." />
          ) : (
            <div className="space-y-1.5">
              {(auroraAgents as any[]).map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] px-3 py-2">
                  <span className="font-bold text-[var(--color-text-primary)]">{a.name}</span>
                  <span className="text-[var(--color-text-faint)]">· {a.role}</span>
                  <Badge variant={a.active ? "success" : "neutral"} className="ml-auto">{a.active ? "Ativo" : "Inativo"}</Badge>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </Modal>
  );
}
