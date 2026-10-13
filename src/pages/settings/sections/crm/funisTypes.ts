export interface StageConfig {
  nome: string;
  cor: string;
  iniciarMinimizado: boolean;
}

export interface Funil {
  id: string;
  nome: string;
  tipo: "sdr_ia" | "comercial";
  etapas: string[];
  etapasConfig?: StageConfig[];
  ativo: boolean;
  clientIds?: string[];
  sdrEtapaEntrada: string;
  sdrEtapaHandoff: string;
  sdrScoreMinimo: number;
  sdrDelayResposta: number;
  sdrMsgBoasVindas: string;
  sdrCriterioDesqualificacao: string;
  produtoIds: string[];
  horarioInicio: string;
  horarioFim: string;
  diasSemana: number[];
  contextoIA: string;
}

export const DIAS_SEMANA_LISTA = [
  { valor: 1, label: "Seg" },
  { valor: 2, label: "Ter" },
  { valor: 3, label: "Qua" },
  { valor: 4, label: "Qui" },
  { valor: 5, label: "Sex" },
  { valor: 6, label: "Sáb" },
  { valor: 7, label: "Dom" },
];

export const FUNIS_DEFAULT: Funil[] = [
  {
    id: "funil-comercial-default",
    nome: "Funil Comercial Principal",
    tipo: "comercial",
    etapas: ["Prospecção", "Qualificação", "Apresentação", "Negociação", "Fechamento"],
    ativo: true,
    sdrEtapaEntrada: "",
    sdrEtapaHandoff: "",
    sdrScoreMinimo: 65,
    sdrDelayResposta: 2,
    sdrMsgBoasVindas: "",
    sdrCriterioDesqualificacao: "sem_interesse",
    produtoIds: [],
    horarioInicio: "",
    horarioFim: "",
    diasSemana: [],
    contextoIA: "",
  },
  {
    id: "funil-sdr-ia-default",
    nome: "Funil SDR IA — Aurora",
    tipo: "sdr_ia",
    etapas: ["Triagem SDR", "Contato Efetuado", "Qualificação SDR", "Reunião Agendada", "Promovido Closer"],
    ativo: true,
    sdrEtapaEntrada: "Triagem SDR",
    sdrEtapaHandoff: "Promovido Closer",
    sdrScoreMinimo: 65,
    sdrDelayResposta: 2,
    sdrMsgBoasVindas: "Olá! Sou a Aurora, assistente comercial da S.P.Y.. Poderia me contar um pouco sobre o seu desafio atual?",
    sdrCriterioDesqualificacao: "sem_interesse",
    produtoIds: [],
    horarioInicio: "",
    horarioFim: "",
    diasSemana: [],
    contextoIA: "",
  },
];

export const CORES_LISTA = ["blue", "orange", "cyan", "emerald", "purple", "rose", "amber", "indigo", "pink", "slate"];

export const ETAPA_CORES: Record<string, { dot: string; top: string }> = {
  slate:   { dot: "#64748b", top: "#334155" },
  blue:    { dot: "#3b82f6", top: "#2563eb" },
  orange:  { dot: "#f97316", top: "#ea580c" },
  cyan:    { dot: "#06b6d4", top: "#0891b2" },
  emerald: { dot: "#10b981", top: "#059669" },
  purple:  { dot: "#a855f7", top: "#9333ea" },
  rose:    { dot: "#f43f5e", top: "#e11d48" },
  amber:   { dot: "#f59e0b", top: "#d97706" },
  indigo:  { dot: "#6366f1", top: "#4f46e5" },
  pink:    { dot: "#ec4899", top: "#db2777" },
};

export function initStageConfigs(etapas: string[], existing?: StageConfig[]): StageConfig[] {
  return etapas.map((nome, i) => {
    const ex = existing?.find(e => e.nome === nome);
    return ex ?? { nome, cor: CORES_LISTA[i % CORES_LISTA.length], iniciarMinimizado: false };
  });
}
