/**
 * Catálogo padrão de cargos do SPY (igual para qualquer empresa), organizado por nível:
 * Estratégico (direção), Tático (gestão/coordenação) e Operacional (execução).
 * Cada cargo traz as páginas sugeridas (módulos) e se enxerga só os próprios dados (vendedores).
 * Nomes sem "/" (a barra separa as áreas na exibição "Administrador / Dev").
 */
export type NivelCargo = "Estratégico" | "Tático" | "Operacional";

export interface CargoPadrao {
  nome: string;
  nivel: NivelCargo;
  area: string;
  descricao: string;
  modulos: string[];
  restringir_aos_proprios_dados: boolean;
}

const IA = ["ia_sdr", "ia_cs", "ia_chatbot"];
const TODOS = ["crm", "financeiro", "engajamento", "marketing", "rh", "bi", "produtividade", "catalogo", "dev", "aurora", ...IA];

const c = (
  nivel: NivelCargo, area: string, nome: string, descricao: string, modulos: string[], restringir = false,
): CargoPadrao => ({ nome, nivel, area, descricao, modulos, restringir_aos_proprios_dados: restringir });

export const CARGOS_PADRAO: CargoPadrao[] = [
  // ── Estratégico (direção) ────────────────────────────────────────────────
  c("Estratégico", "Direção", "Sócio", "Sócio da empresa; acesso a tudo.", TODOS),
  c("Estratégico", "Direção", "Administrador", "Administra a empresa e a configuração do sistema.", TODOS),
  c("Estratégico", "Direção", "Diretor Executivo", "CEO: define a direção e acompanha todos os resultados.", TODOS),
  c("Estratégico", "Comercial", "Diretor Comercial", "Responde por vendas, metas e receita.", ["crm", "engajamento", "marketing", "bi", "produtividade", "catalogo", "aurora", ...IA]),
  c("Estratégico", "Financeiro", "Diretor Financeiro", "Responde por caixa, resultado e governança financeira.", ["financeiro", "bi", "produtividade", "catalogo", "aurora"]),
  c("Estratégico", "Operações", "Diretor de Operações", "Responde por processos, entrega e eficiência.", ["crm", "produtividade", "catalogo", "bi", "rh", "aurora"]),

  // ── Tático (gestão e coordenação) ────────────────────────────────────────
  c("Tático", "Comercial", "Gerente Comercial", "Lidera o time de vendas e acompanha metas.", ["crm", "engajamento", "marketing", "bi", "produtividade", "catalogo", "ia_sdr", "ia_cs"]),
  c("Tático", "Comercial", "Líder de SDR", "Coordena a pré-venda e a qualificação de leads.", ["crm", "engajamento", "produtividade", "catalogo", "ia_sdr"]),
  c("Tático", "Customer Success", "Gerente de Customer Success", "Responde por retenção, sucesso e atendimento de clientes.", ["crm", "engajamento", "bi", "produtividade", "ia_cs", "ia_chatbot"]),
  c("Tático", "Financeiro", "Gerente Financeiro", "Gere contas a pagar, a receber e fluxo de caixa.", ["financeiro", "bi", "produtividade"]),
  c("Tático", "Marketing", "Gerente de Marketing", "Gere campanhas, conteúdo e geração de demanda.", ["marketing", "engajamento", "bi", "produtividade", "catalogo"]),
  c("Tático", "Operações", "Gerente de Operações", "Gere processos, projetos e entregas.", ["crm", "produtividade", "catalogo", "bi"]),
  c("Tático", "Pessoas", "Gerente de RH", "Gere admissão, desempenho e equipe.", ["rh", "produtividade", "bi"]),
  c("Tático", "Tecnologia", "Líder Técnico", "Tech lead: orienta o time de desenvolvimento.", ["dev", "produtividade", "bi"]),

  // ── Operacional (execução) ───────────────────────────────────────────────
  c("Operacional", "Comercial", "SDR", "Pré-vendas: prospecta e qualifica leads.", ["crm", "engajamento", "produtividade", "catalogo", "ia_sdr"], true),
  c("Operacional", "Comercial", "Closer", "Conduz reuniões e fecha negócios.", ["crm", "engajamento", "produtividade", "catalogo"], true),
  c("Operacional", "Comercial", "Vendedor", "Vende e acompanha a própria carteira.", ["crm", "engajamento", "produtividade", "catalogo"], true),
  c("Operacional", "Comercial", "Executivo de Contas", "Atende e expande contas de clientes.", ["crm", "engajamento", "produtividade", "catalogo"], true),
  c("Operacional", "Atendimento", "Atendente", "Atende clientes nos canais de mensagem.", ["crm", "engajamento", "produtividade", "ia_chatbot"]),
  c("Operacional", "Atendimento", "Analista de Suporte", "Resolve dúvidas e problemas dos clientes.", ["crm", "engajamento", "produtividade", "ia_chatbot", "ia_cs"]),
  c("Operacional", "Customer Success", "Analista de Customer Success", "Acompanha a saúde, o uso e a implantação dos clientes.", ["crm", "engajamento", "produtividade", "ia_cs"]),
  c("Operacional", "Marketing", "Analista de Marketing", "Executa campanhas e acompanha indicadores.", ["marketing", "engajamento", "produtividade", "catalogo"]),
  c("Operacional", "Marketing", "Gestor de Tráfego", "Gere anúncios pagos e a performance das campanhas.", ["marketing", "produtividade", "bi"]),
  c("Operacional", "Marketing", "Social Media", "Gere as redes sociais e a comunidade.", ["marketing", "engajamento", "produtividade"]),
  c("Operacional", "Marketing", "Designer", "Cria peças e identidade visual.", ["marketing", "produtividade", "catalogo"]),
  c("Operacional", "Marketing", "Videomaker", "Grava e edita vídeos.", ["marketing", "engajamento", "produtividade", "catalogo"]),
  c("Operacional", "Marketing", "Criador de Conteúdo", "Produz conteúdo para os canais da empresa.", ["marketing", "engajamento", "produtividade", "catalogo"]),
  c("Operacional", "Financeiro", "Analista Financeiro", "Lançamentos, conciliação, cobrança e relatórios.", ["financeiro", "produtividade"]),
  c("Operacional", "Pessoas", "Analista de RH", "Rotinas de pessoal, recrutamento e acompanhamento da equipe.", ["rh", "produtividade"]),
  c("Operacional", "Tecnologia", "Dev", "Desenvolvedor: constrói e mantém o sistema.", ["dev", "produtividade", "bi"]),
  c("Operacional", "Tecnologia", "Analista de Dados", "Dados, BI e indicadores.", ["bi", "dev", "produtividade"]),
  c("Operacional", "Administrativo", "Assistente Administrativo", "Apoio às rotinas administrativas e recepção.", ["crm", "produtividade", "catalogo"]),
  c("Operacional", "Operações", "Operador de Estoque", "Estoque, separação e logística.", ["produtividade", "catalogo"]),
  c("Operacional", "Geral", "Estagiário", "Apoio ao time, com acesso restrito aos próprios dados.", ["produtividade", "crm"], true),
];

export const NIVEIS_CARGO: NivelCargo[] = ["Estratégico", "Tático", "Operacional"];

/**
 * Cargos do catálogo que ainda não existem. Pula o que já existe (sem diferenciar maiúsculas) e
 * qualquer nome igual a um cargo de login em uso (users.role), para não restringir ninguém sem querer.
 */
export function cargosPadraoFaltantes(existentes: string[], rolesEmUso: string[] = []): { faltantes: CargoPadrao[]; pulados: string[] } {
  const norm = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const ja = new Set(existentes.map(norm));
  const emUso = new Set(rolesEmUso.map(norm));
  const faltantes: CargoPadrao[] = [];
  const pulados: string[] = [];
  for (const cargo of CARGOS_PADRAO) {
    const k = norm(cargo.nome);
    if (ja.has(k)) continue;
    if (emUso.has(k)) { pulados.push(cargo.nome); continue; }
    faltantes.push(cargo);
  }
  return { faltantes, pulados };
}
