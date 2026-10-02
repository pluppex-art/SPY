export type OsEtapaTipo = "aberta" | "concluida" | "cancelada";

export interface OsEtapa {
  /** Id estável — é o que a OS guarda em `etapa_id`. Nunca derivado da posição. */
  id: string;
  nome: string;
  cor: string;
  iniciarMinimizado: boolean;
  tipo: OsEtapaTipo;
}

export interface OsDepartamento {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
}

export interface OsFunil {
  id: string;
  departamentoId: string;
  nome: string;
  etapas: OsEtapa[];
  padrao: boolean;
  ativo: boolean;
}

// Mesmos valores do CHECK de public.ordens_servico.prioridade.
export type OsPrioridade = "Baixa" | "Normal" | "Alta" | "Urgente";

/** Status legado da tabela (CHECK de public.ordens_servico.status). */
export type OsStatus = "Rascunho" | "Aberta" | "Em execução" | "Concluída" | "Faturada" | "Cancelada";

export interface OrdemServico {
  id: string;
  numero: number;
  titulo: string;
  descricao: string;
  status: OsStatus;
  /** Null em OS antigas (anteriores aos departamentos): aparecem só na Visão geral. */
  departamentoId: string | null;
  funilId: string | null;
  etapaId: string | null;
  prioridade: OsPrioridade;
  solicitanteNome: string;
  responsavelNome: string;
  clienteNome: string;
  prazo: string | null;
  campos: Record<string, string>;
  origemTipo: string | null;
  createdAt: string;
}

export const OS_PRIORIDADES: { id: OsPrioridade; label: string; style: string }[] = [
  { id: "Baixa", label: "Baixa", style: "bg-slate-500/15 text-slate-400 border-slate-500/25" },
  { id: "Normal", label: "Normal", style: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  { id: "Alta", label: "Alta", style: "bg-orange-500/15 text-orange-400 border-orange-500/25" },
  { id: "Urgente", label: "Urgente", style: "bg-red-500/15 text-red-400 border-red-500/25" },
];

export const OS_ORIGEM_LABEL: Record<string, string> = {
  implementation: "Implementação",
};

const STATUS_ENCERRADOS: OsStatus[] = ["Concluída", "Faturada", "Cancelada"];

/** O status legado é derivado da etapa: 1ª etapa = Aberta, demais em andamento = Em execução. */
export function statusDaEtapa(etapas: OsEtapa[], etapa: OsEtapa): OsStatus {
  if (etapa.tipo === "concluida") return "Concluída";
  if (etapa.tipo === "cancelada") return "Cancelada";
  const primeira = etapas.find(e => e.tipo === "aberta");
  return primeira?.id === etapa.id ? "Aberta" : "Em execução";
}

/** OS em aberto: pela etapa quando há funil; senão pelo status legado. */
export function osEmAberto(o: Pick<OrdemServico, "status">, etapa?: OsEtapa): boolean {
  return etapa ? etapa.tipo === "aberta" : !STATUS_ENCERRADOS.includes(o.status);
}

export const OS_ETAPA_TIPOS: { id: OsEtapaTipo; label: string }[] = [
  { id: "aberta", label: "Em andamento" },
  { id: "concluida", label: "Conclui a OS" },
  { id: "cancelada", label: "Cancela a OS" },
];

export function novoIdEtapa(): string {
  return `etp_${crypto.randomUUID().slice(0, 8)}`;
}

// ─── Templates ─────────────────────────────────────────────────────────────
// Ponto de partida editável. Nada aqui é fixo no código: o tenant cria os
// departamentos a partir de um template (ou do zero) e passa a editar tudo.

type EtapaSeed = [nome: string, cor: string, tipo?: OsEtapaTipo];

export interface OsDepartamentoTemplate {
  nome: string;
  cor: string;
  etapas: EtapaSeed[];
}

export const OS_FLUXO_GERAL: EtapaSeed[] = [
  ["Aberta", "slate"],
  ["Em andamento", "blue"],
  ["Aguardando", "amber"],
  ["Concluída", "emerald", "concluida"],
  ["Cancelada", "rose", "cancelada"],
];

export const OS_DEPARTAMENTOS_SUGERIDOS: OsDepartamentoTemplate[] = [
  {
    nome: "Dev",
    cor: "indigo",
    etapas: [["Backlog", "slate"], ["A Fazer", "blue"], ["Em Progresso", "amber"], ["Em Review", "indigo"], ["Concluído", "emerald", "concluida"], ["Cancelado", "rose", "cancelada"]],
  },
  {
    nome: "Tráfego",
    cor: "orange",
    etapas: [["Briefing", "slate"], ["Setup", "blue"], ["Rodando", "emerald"], ["Otimização", "amber"], ["Encerrada", "purple", "concluida"], ["Cancelada", "rose", "cancelada"]],
  },
  {
    nome: "Conteúdo",
    cor: "pink",
    etapas: [["Pauta", "slate"], ["Produção", "blue"], ["Aprovação", "amber"], ["Agendado", "purple"], ["Publicado", "emerald", "concluida"], ["Cancelado", "rose", "cancelada"]],
  },
  { nome: "Serviços", cor: "emerald", etapas: OS_FLUXO_GERAL },
  { nome: "Produtos", cor: "amber", etapas: OS_FLUXO_GERAL },
];

export interface OsTemplate {
  id: string;
  nome: string;
  descricao: string;
  /** Nomes dos departamentos de OS_DEPARTAMENTOS_SUGERIDOS (ou "Geral"). */
  departamentos: string[];
}

export const OS_TEMPLATES: OsTemplate[] = [
  {
    id: "agencia",
    nome: "Agência / operação completa",
    descricao: "Dev, Tráfego, Conteúdo, Serviços e Produtos.",
    departamentos: ["Dev", "Tráfego", "Conteúdo", "Serviços", "Produtos"],
  },
  {
    nome: "Software house",
    id: "software-house",
    descricao: "Dev e Serviços.",
    departamentos: ["Dev", "Serviços"],
  },
  {
    id: "geral",
    nome: "Um departamento só",
    descricao: "Um único departamento \"Geral\" com fluxo simples. Dá para criar mais depois.",
    departamentos: ["Geral"],
  },
];

export function etapasFromSeed(seed: EtapaSeed[]): OsEtapa[] {
  return seed.map(([nome, cor, tipo]) => ({
    id: novoIdEtapa(),
    nome,
    cor,
    iniciarMinimizado: false,
    tipo: tipo ?? "aberta",
  }));
}

export function templateDepartamento(nome: string): OsDepartamentoTemplate {
  return (
    OS_DEPARTAMENTOS_SUGERIDOS.find(d => d.nome === nome) ?? { nome, cor: "blue", etapas: OS_FLUXO_GERAL }
  );
}
