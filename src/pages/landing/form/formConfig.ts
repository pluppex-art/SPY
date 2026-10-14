import { Rocket, ShoppingCart, Car, Sun, Building2, Stethoscope, GraduationCap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NicheConfig {
  key: string;
  /** Valor enviado em `niche` ao /api/public/lead-capture (contrato inalterado). */
  payloadName: string;
  /** Segmento pré-selecionado no passo 2. */
  segment?: string;
  icon: LucideIcon;
  title: string;
  intro: string;
  points: string[];
}

export const NICHES: Record<string, NicheConfig> = {
  spy: {
    key: "spy",
    payloadName: "S.P.Y. Core Systems",
    icon: Rocket,
    title: "Vamos implantar o S.P.Y. na sua empresa",
    intro: "Conte em poucos passos como a sua operação funciona hoje. A equipe do S.P.Y. retorna para combinar a implantação.",
    points: ["Pipeline, propostas e financeiro no mesmo sistema", "Aurora, a assistente de IA", "Módulos do seu segmento"],
  },
  varejo: {
    key: "varejo",
    payloadName: "Varejo",
    segment: "varejo",
    icon: ShoppingCart,
    title: "S.P.Y. para o seu varejo",
    intro: "Frente de Caixa (PDV), estoque, fornecedores e compras no mesmo sistema do CRM e do financeiro.",
    points: ["Frente de Caixa (PDV)", "Movimentações de estoque", "Pedidos de compra e notas de entrada"],
  },
  automotivo: {
    key: "automotivo",
    payloadName: "Automotivo",
    segment: "automotivo",
    icon: Car,
    title: "S.P.Y. para a sua concessionária",
    intro: "Captações, avaliação de usados, consignações, trocas e test-drives organizados junto ao funil de vendas.",
    points: ["Avaliações de usados", "Consignações, trocas e repasses", "Test-drives na agenda"],
  },
  solar: {
    key: "solar",
    payloadName: "Energia Solar",
    segment: "solar",
    icon: Sun,
    title: "S.P.Y. para energia solar",
    intro: "Da análise de fatura por IA ao pós-venda: projetos, vistorias, instalações e homologações em um só lugar.",
    points: ["Análise de fatura e kWp por IA", "Vistorias e instalações", "Homologações e manutenções"],
  },
  imobiliaria: {
    key: "imobiliaria",
    payloadName: "Imobiliária",
    segment: "imobiliaria",
    icon: Building2,
    title: "S.P.Y. para a sua imobiliária",
    intro: "Proprietários, captações, empreendimentos, corretores e visitas, com portal público do imóvel.",
    points: ["Portal público do imóvel", "Portfólio do corretor", "Visitas agendadas"],
  },
  clinica: {
    key: "clinica",
    payloadName: "Clínicas & Saúde",
    segment: "clinica",
    icon: Stethoscope,
    title: "S.P.Y. para a sua clínica",
    intro: "Agenda médica, pacientes, prontuários, telemedicina e faturamento clínico junto ao CRM.",
    points: ["Agenda médica e telemedicina", "Prontuários e exames", "Faturamento clínico"],
  },
  educacao: {
    key: "educacao",
    payloadName: "Educação Corporativa",
    segment: "educacao",
    icon: GraduationCap,
    title: "S.P.Y. para a sua escola",
    intro: "Turmas, alunos, conteúdo, certificados e mensalidades, com o funil de matrículas no CRM.",
    points: ["Turmas e alunos", "Certificados", "Mensalidades no financeiro"],
  },
};

export const SEGMENT_OPTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "varejo", label: "Varejo", icon: ShoppingCart },
  { id: "automotivo", label: "Concessionária", icon: Car },
  { id: "solar", label: "Energia solar", icon: Sun },
  { id: "imobiliaria", label: "Imobiliária", icon: Building2 },
  { id: "clinica", label: "Clínica", icon: Stethoscope },
  { id: "educacao", label: "Escola", icon: GraduationCap },
  { id: "outro", label: "Outro segmento", icon: Rocket },
];

export const TEAM_OPTIONS = ["Só eu", "2 a 5 pessoas", "6 a 15 pessoas", "Mais de 15 pessoas"];
export const TOOL_OPTIONS = ["Planilhas", "Outro CRM", "Sistema próprio ou ERP", "Nada ainda"];
export const GOAL_OPTIONS: { id: string; label: string; text: string }[] = [
  { id: "pipeline", label: "Pipeline de vendas", text: "Organizar leads e o funil." },
  { id: "financeiro", label: "Financeiro", text: "Contas, fluxo de caixa e DRE." },
  { id: "propostas", label: "Propostas e contratos", text: "Aceite online e contrato." },
  { id: "aurora", label: "Aurora (IA)", text: "Assistente que consulta os dados." },
  { id: "segmento", label: "Módulo do meu segmento", text: "Recursos específicos do nicho." },
  { id: "outro", label: "Outro", text: "Conte na mensagem." },
];
