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

const usuarios = (n: number) => [
  `Agente Secreto de Vendas para ${n} pessoas`,
  `Aurora para ${n} pessoas`,
  "CRM, funil e clientes",
  "Agenda e tarefas",
  "Catálogo de produtos",
  "Propostas e contratos",
];

export const PLANS: PlanData[] = [
  {
    id: "start",
    name: "3 usuários",
    tagline: "Para equipes pequenas que querem enxergar cada conversa de venda.",
    monthlyPrice: "591",
    setupPrice: "R$ 3.000",
    featuresHeader: "Inclui:",
    features: usuarios(3),
    ctaText: "Quero 3 usuários",
  },
  {
    id: "autopilot",
    name: "5 usuários",
    badgeTop: "RECOMENDADO",
    highlight: true,
    tagline: "Para o time comercial que quer captar e retomar mais oportunidades.",
    monthlyPrice: "985",
    setupPrice: "R$ 4.500",
    featuresHeader: "Inclui:",
    features: usuarios(5),
    ctaText: "Quero 5 usuários",
  },
  {
    id: "autonomous",
    name: "10 usuários",
    tagline: "Para operações com vários vendedores e gestão sobre o time inteiro.",
    monthlyPrice: "1.970",
    setupPrice: "R$ 7.500",
    featuresHeader: "Inclui:",
    features: usuarios(10),
    ctaText: "Quero 10 usuários",
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
