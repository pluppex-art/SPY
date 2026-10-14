/**
 * Planos comerciais do S.P.Y. — FALLBACK OFFLINE das landings (/lp e /landing).
 * A fonte da verdade são as tabelas `subscription_plans` e `credit_tiers`, gerenciadas em Admin → Assinaturas
 * e servidas por GET /api/billing/public-plans (ver src/lib/usePublicPlans.ts). Estes valores só aparecem
 * enquanto a API carrega ou se ela falhar/vier vazia. Mantenha-os próximos dos valores reais.
 * Sem ícones React: cada tela mapeia o ícone pelo `id`.
 */

export interface PlanData {
  id: string;
  name: string;
  badgeTop?: string;
  tagline: string;
  monthlyPrice: string;
  setupPrice: string;
  featuresHeader: string;
  features: string[];
  ctaText: string;
  highlight?: boolean;
}

export const PLANS: PlanData[] = [
  {
    id: "start",
    name: "START",
    tagline: "Para empresas que querem organizar e enxergar melhor sua operação comercial.",
    monthlyPrice: "997",
    setupPrice: "R$ 2.997",
    featuresHeader: "Inclui:",
    features: [
      "CRM",
      "Gestão de leads",
      "Pipeline comercial",
      "Gestão de clientes",
      "Histórico de interações",
      "Integração WhatsApp",
      "Inteligência sobre leads",
      "Identificação de oportunidades",
      "Análise de conversas",
      "Score de oportunidade",
      "Próxima melhor ação",
    ],
    ctaText: "Começar Agora",
  },
  {
    id: "autopilot",
    name: "AUTOPILOT",
    badgeTop: "MAIS ESCOLHIDO",
    tagline: "Para empresas que querem que a inteligência comece a trabalhar as oportunidades.",
    monthlyPrice: "1.997",
    setupPrice: "R$ 4.997",
    featuresHeader: "Tudo do START +",
    features: [
      "Agentes de IA",
      "Qualificação automática",
      "Follow-up automático",
      "Recuperação de oportunidades",
      "Agendamento automático",
      "Distribuição de leads",
      "Ações comerciais automatizadas",
    ],
    ctaText: "Quero o Autopilot",
    highlight: true,
  },
  {
    id: "autonomous",
    name: "AUTONOMOUS",
    tagline: "Para transformar o S.P.Y. em parte ativa e autônoma da sua operação comercial.",
    monthlyPrice: "3.997",
    setupPrice: "R$ 9.997",
    featuresHeader: "Tudo do AUTOPILOT +",
    features: [
      "Múltiplos agentes especializados",
      "Propostas comerciais",
      "Negociação com regras",
      "Reativação de clientes",
      "Expansão de carteira",
      "Operação comercial autônoma",
      "Maior capacidade de processamento",
      "Configurações avançadas",
    ],
    ctaText: "Quero Conhecer",
  },
];

export const TOKEN_TIERS = [
  { credits: "10.000 créditos", price: "R$ 199" },
  { credits: "30.000 créditos", price: "R$ 497" },
  { credits: "75.000 créditos", price: "R$ 997" },
  { credits: "150.000 créditos", price: "R$ 1.797" },
  { credits: "300.000 créditos", price: "R$ 2.997" },
];

export const CREDITS_COPY = {
  title: "Créditos de Inteligência",
  description: "Unidade de consumo de IA sob demanda utilizada pelos agentes do S.P.Y.",
  extraUsage: "Consumo adicional conforme utilização.",
  disclaimer: "Os créditos representam a unidade de processamento. O fluxo real pode utilizar múltiplos modelos.",
  controlTitle: "Você tem controle total",
  controlItems: [
    { id: "api", title: "Use sua própria API", text: "OpenAI, Google Gemini ou provedores compatíveis." },
    { id: "rules", title: "Defina suas regras", text: "Você dita o limite e como a inteligência age na sua operação." },
    { id: "payg", title: "Pague pelo que utiliza", text: "Transparência, previsibilidade e sem surpresas na fatura." },
  ],
};

export const GUARANTEES = [
  { id: "nolock", title: "Sem fidelidade", text: "Cancele quando quiser." },
  { id: "security", title: "Segurança", text: "Dados protegidos." },
  { id: "support", title: "Suporte humano", text: "Acompanhamento ativo." },
  { id: "evolution", title: "Evolução contínua", text: "Novidades semanais." },
];
