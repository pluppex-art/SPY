import { useEffect, useState } from "react";
import { GraduationCap, Save, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { useAuth } from "../../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { useAgentPrompts } from "../../../hooks/useAgentPrompts";
import { useData } from "../../../contexts/DataContext";
import { ConfigSistemaConhecimentoIA } from "./SettingsSistemaConhecimento";
import { ConfigSistemaAprendizados } from "./SettingsSistemaAprendizados";

// Os 4 agentes do modelo padrão. `key` é o agent_key que o n8n lê ao vivo por empresa
// (ai_agent_prompts): o que for salvo aqui entra no prompt do agente na próxima execução,
// que é o prompt base (80%), igual para todas as empresas. Os 20% de cada empresa vêm só do cadastro:
// Configurações → Empresa → Dados (bloco "perfil para a IA") e Produtos.
const AGENTES = [
  {
    key: "sdr",
    nome: "Agente de Pré-venda",
    resumo: "Atende e qualifica o lead no WhatsApp, agenda reunião e chama o Closer no fechamento.",
  },
  {
    key: "closer",
    nome: "Agente Vendedor",
    resumo: "Orienta o SDR e os gestores em negociação: objeções, valor e próximo passo de fechamento.",
  },
  {
    key: "radar",
    nome: "Radar de Oportunidades",
    resumo: "Lê grupos de WhatsApp e identifica oportunidades de venda; também prospecta empresas.",
  },
  {
    key: "agente_secreto",
    nome: "Agente Secreto",
    resumo: "Lê as conversas da equipe e cadastra sozinho lead, produto de interesse, etapa e tarefas no CRM.",
  },
] as const;

function AgenteTreino({ agente }: { agente: (typeof AGENTES)[number] }) {
  const { prompts, loading, refresh } = useAgentPrompts();
  const atual = prompts.find((p) => p.agentKey === agente.key);
  const verBase = true;
  const [baseDraft, setBaseDraft] = useState<string | null>(null);
  const [salvandoBase, setSalvandoBase] = useState(false);
  const [historico, setHistorico] = useState<{ id: string; changed_at: string; base_prompt: string | null }[]>([]);
  const baseAtual = atual?.basePrompt ?? "";
  const baseTexto = baseDraft ?? baseAtual;
  const baseMudou = baseDraft !== null && baseDraft !== baseAtual;

  useEffect(() => {
    if (!verBase || !supabase) return;
    supabase
      .from("agent_prompt_base_history")
      .select("id, changed_at, base_prompt")
      .eq("agent_key", agente.key)
      .order("changed_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setHistorico((data as any[]) ?? []));
  }, [verBase, agente.key, salvandoBase]);

  const salvarBase = async () => {
    if (!supabase || !baseMudou) return;
    if (!(await confirmDialog({
      title: "Alterar o prompt base de TODAS as empresas",
      description: `O prompt base (80%) do ${agente.nome} vale para todas as empresas e muda na próxima execução. A versão atual fica guardada no histórico para voltar atrás.`,
    }))) return;
    setSalvandoBase(true);
    const { error } = await supabase
      .from("ai_agent_prompts")
      .update({ base_prompt: baseTexto, updated_at: new Date().toISOString() })
      .eq("agent_key", agente.key)
      .is("tenant_id", null);
    setSalvandoBase(false);
    if (error) return toast.error(`Não foi possível salvar: ${error.message}`);
    setBaseDraft(null);
    await refresh();
    toast.success("Prompt base atualizado para todas as empresas.");
  };
  return (
    <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-3 shadow-sm">
      <p className="text-xs text-[var(--color-text-muted)]">{agente.resumo}</p>
      {loading ? (
        <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</p>
      ) : (
        <>
          {atual?.basePrompt ? (
            <div className="space-y-2 border border-warning/30 bg-warning/5 rounded-lg p-3">
              <p className="text-[11px] text-[var(--color-text-primary)]">
                <b>Prompt base (80%)</b>: é o mesmo para todas as empresas. Alterar aqui muda o agente em todas elas, na próxima execução. Os trechos entre
                colchetes duplos (como [[AGENTE]], [[EMPRESA]], [[BLOCOS]]) são preenchidos automaticamente: não apague.
              </p>
              <textarea
                value={baseTexto}
                onChange={(e) => setBaseDraft(e.target.value)}
                rows={16}
                className="w-full text-[11px] font-mono bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg p-3 text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-blue)]/50 resize-y"
              />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] text-[var(--color-text-faint)]">{baseTexto.length.toLocaleString("pt-BR")} caracteres</span>
                <Button type="button" size="sm" disabled={!baseMudou || salvandoBase} onClick={salvarBase} className="bg-warning text-white font-bold uppercase tracking-wider">
                  {salvandoBase ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar para todas as empresas
                </Button>
              </div>
              {historico.length > 0 && (
                <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Versões anteriores</p>
                  <div className="space-y-1">
                    {historico.map((h) => (
                      <div key={h.id} className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-text-muted)]">
                        <span>{new Date(h.changed_at).toLocaleString("pt-BR")} · {(h.base_prompt ?? "").length.toLocaleString("pt-BR")} caracteres</span>
                        <button type="button" onClick={() => setBaseDraft(h.base_prompt ?? "")} className="font-bold text-[var(--color-primary-blue)] hover:underline">Carregar no editor</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">Este agente ainda não tem prompt base cadastrado.</p>
          )}
        </>
      )}
    </Card>
  );
}


function EscopoVendas() {
  const { appSettings, saveAppSetting } = useData();
  const { activeTenantName } = useAuth();
  const atual: "fechamento" | "ate_reuniao" = appSettings?.ia_vendas_config?.escopo === "ate_reuniao" ? "ate_reuniao" : "fechamento";
  const [salvando, setSalvando] = useState(false);
  const mudar = async (escopo: "fechamento" | "ate_reuniao") => {
    if (escopo === atual) return;
    setSalvando(true);
    await saveAppSetting("ia_vendas_config", { ...(appSettings?.ia_vendas_config ?? {}), escopo });
    setSalvando(false);
    toast.success(escopo === "ate_reuniao" ? "Os agentes de vendas agora vão só até a reunião." : "Os agentes de vendas voltaram a conduzir até o fechamento.");
  };
  const opcoes = [
    { v: "fechamento" as const, titulo: "Até o fechamento", desc: "O Agente de Pré-venda conduz a venda e pode usar o Agente Vendedor para fechar (proposta, negociação, próximo passo de pagamento conforme o cadastro)." },
    { v: "ate_reuniao" as const, titulo: "Só até a reunião", desc: "Os agentes qualificam, tratam objeções e marcam a reunião com a equipe. Não enviam proposta, contrato, link de pagamento nem PIX e não negociam. O Agente Vendedor passa a ajudar só a conseguir a reunião." },
  ];
  return (
    <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-3 shadow-sm">
      <div>
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Até onde os agentes de vendas vão ({activeTenantName ?? "empresa selecionada"})</h3>
        <p className="text-[11px] text-[var(--color-text-muted)]">Vale para esta empresa. Para desligar o Agente Vendedor por completo, use a chave dele em Sistema → Aurora.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {opcoes.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={salvando}
            onClick={() => mudar(o.v)}
            className={`text-left rounded-lg border p-3 transition-colors cursor-pointer ${atual === o.v ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10" : "border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)]"}`}
          >
            <p className="text-xs font-bold text-[var(--color-text-primary)]">{o.titulo}{atual === o.v ? " ✓" : ""}</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">{o.desc}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}

/**
 * Configurações → Sistema → Treinamento dos agentes (SOMENTE master da plataforma).
 * Reúne num lugar só tudo o que treina os 4 agentes do modelo padrão: o treinamento de cada agente
 * (salvo em ai_agent_prompts da empresa selecionada e somado ao prompt fixo, que é 80%), o conhecimento
 * extra e as lições aprendidas. O cliente nunca vê nem edita estes campos.
 */
export function ConfigSistemaTreinamento() {
  const { user, activeTenantName } = useAuth();
  const [aba, setAba] = useState<string>(AGENTES[0].key);
  const agente = AGENTES.find((a) => a.key === aba);

  if (!user?.isMaster) return null;

  const abas = [...AGENTES.map((a) => ({ key: a.key as string, nome: a.nome })), { key: "conhecimento", nome: "Conhecimento extra" }, { key: "licoes", nome: "Lições aprendidas" }];

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Treinamento dos agentes <GraduationCap className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Cada agente tem um prompt base (80%) igual para todas as empresas, que você edita aqui. Os 20% de cada empresa não são digitados aqui: vêm de Empresa → Dados (perfil para a IA) e de Produtos.
        </p>
      </div>

      <Card className="p-3 bg-warning/10 border border-warning/30 text-xs text-[var(--color-text-primary)] flex items-start gap-2">
        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Tela interna (só master). Alterar o prompt base muda o agente em <b>todas</b> as empresas, na próxima execução.
        </span>
      </Card>

      <div className="flex flex-wrap gap-2">
        {abas.map((a) => (
          <Button key={a.key} type="button" size="sm" variant={aba === a.key ? "default" : "ghost"} onClick={() => setAba(a.key)} className="border border-[var(--color-border-default)]">
            {a.nome}
          </Button>
        ))}
      </div>

      {(aba === "sdr" || aba === "closer") && <EscopoVendas />}
      {agente && <AgenteTreino key={agente.key} agente={agente} />}
      {aba === "conhecimento" && <ConfigSistemaConhecimentoIA embedded />}
      {aba === "licoes" && <ConfigSistemaAprendizados embedded />}
    </div>
  );
}
