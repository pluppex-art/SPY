// Modelos de funil oferecidos ao criar uma empresa. A tela mostra e deixa ajustar; o servidor remonta o funil com
// as mesmas regras (nunca grava o que veio do navegador sem limpar).
import { ETAPAS_SISTEMA } from "./funilStages.js";

export interface EtapaDoFunil { nome: string; cor: string; iniciarMinimizado: boolean }

export interface ModeloDeFunil {
  id: string;
  titulo: string;
  descricao: string;
  nomeDoFunil: string;
  /** Só as etapas do dia a dia: Ganho, Perdido e Desqualificado entram sozinhas no fim. */
  etapas: EtapaDoFunil[];
}

const etapa = (nome: string, cor: string, iniciarMinimizado = false): EtapaDoFunil => ({ nome, cor, iniciarMinimizado });

export const MODELOS_DE_FUNIL: ModeloDeFunil[] = [
  {
    id: "comercial_padrao",
    titulo: "Comercial padrão",
    descricao: "Do primeiro contato ao fechamento. Serve para a maioria das empresas.",
    nomeDoFunil: "Funil Comercial Principal",
    etapas: [etapa("Novo Lead", "blue"), etapa("Qualificação", "orange"), etapa("Apresentação", "cyan"), etapa("Negociação", "purple"), etapa("Fechamento", "indigo")],
  },
  {
    id: "orcamento_luminar",
    titulo: "Orçamento (modelo Luminar)",
    descricao: "Loja que recebe o pedido, manda orçamento e volta a chamar quem não respondeu.",
    nomeDoFunil: "Funil Comercial Principal",
    etapas: [etapa("Novo Lead", "blue"), etapa("Orçamento", "orange"), etapa("Repescagem", "cyan")],
  },
  {
    id: "vendas_rapidas",
    titulo: "Vendas rápidas",
    descricao: "Venda decidida na própria conversa: atende, envia a proposta e recebe.",
    nomeDoFunil: "Vendas Rápidas",
    etapas: [etapa("Novo Lead", "blue"), etapa("Em Atendimento", "orange"), etapa("Proposta Enviada", "purple"), etapa("Aguardando Pagamento", "amber")],
  },
  {
    id: "vendas_consultivas",
    titulo: "Vendas consultivas",
    descricao: "Venda mais longa: diagnóstico, reunião, proposta, negociação e contrato.",
    nomeDoFunil: "Vendas Consultivas",
    etapas: [
      etapa("Novo Lead", "blue"), etapa("Qualificação", "orange"), etapa("Diagnóstico", "cyan"), etapa("Reunião / Apresentação", "indigo"),
      etapa("Proposta", "purple"), etapa("Follow-Up", "pink", true), etapa("Negociação", "amber"), etapa("Contrato", "emerald"),
    ],
  },
];

export const ETAPAS_SDR = [etapa("Triagem SDR", "blue"), etapa("Contato Efetuado", "orange"), etapa("Qualificação SDR", "cyan"), etapa("Reunião Agendada", "indigo"), etapa("Promovido Closer", "purple")];

export const MAX_ETAPAS = 15;
const CORES = ["blue", "orange", "cyan", "emerald", "purple", "rose", "amber", "indigo", "pink", "slate"];

export interface FunilMontado { nome: string; etapas: string[]; etapasConfig: EtapaDoFunil[] }

/** Etapas do dia a dia limpas (sem vazias, repetidas ou as de sistema) + Ganho, Perdido e Desqualificado no fim. */
export function montarFunil(entrada: unknown): FunilMontado | null {
  const dados = (entrada && typeof entrada === "object" ? entrada : {}) as { nome?: unknown; etapas?: unknown };
  if (!Array.isArray(dados.etapas)) return null;
  const vistas = new Set<string>();
  const comuns: EtapaDoFunil[] = [];
  for (const item of dados.etapas) {
    const nome = String((item as any)?.nome ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const chave = nome.toLocaleLowerCase("pt-BR");
    if (!nome || vistas.has(chave) || ETAPAS_SISTEMA.some((s) => s.re.test(nome))) continue;
    vistas.add(chave);
    const cor = String((item as any)?.cor ?? "");
    comuns.push(etapa(nome, CORES.includes(cor) ? cor : CORES[comuns.length % CORES.length], (item as any)?.iniciarMinimizado === true));
    if (comuns.length === MAX_ETAPAS) break;
  }
  if (!comuns.length) return null;
  const etapasConfig = [...comuns, ...ETAPAS_SISTEMA.map((s) => etapa(s.nome, s.cor, true))];
  return { nome: String(dados.nome ?? "").trim().slice(0, 80) || "Funil Comercial Principal", etapas: etapasConfig.map((e) => e.nome), etapasConfig };
}

/** Linhas de `crm_funis` da empresa nova: o comercial escolhido e, se pedido, o de pré-vendas (SDR). */
export function linhasDeFunis(tenantId: string, comercial: unknown, comSdr: boolean, novoId: () => string) {
  const linha = (tipo: "comercial" | "sdr_ia", f: FunilMontado) => ({
    id: novoId(), tenant_id: tenantId, nome: f.nome, tipo, etapas: f.etapas, etapas_config: f.etapasConfig, ativo: true,
    // As duas linhas vão com as mesmas colunas: em inserção em lote, coluna ausente numa linha vira nulo.
    sdr_etapa_entrada: tipo === "sdr_ia" ? ETAPAS_SDR[0].nome : "",
    sdr_etapa_handoff: tipo === "sdr_ia" ? ETAPAS_SDR[ETAPAS_SDR.length - 1].nome : "",
  });
  const principal = montarFunil(comercial);
  const sdr = comSdr ? montarFunil({ nome: "Funil SDR IA — Aurora", etapas: ETAPAS_SDR }) : null;
  return [...(principal ? [linha("comercial", principal)] : []), ...(sdr ? [linha("sdr_ia", sdr)] : [])];
}
