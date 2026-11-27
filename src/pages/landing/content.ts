/**
 * Conteúdo da landing. Tudo aqui é recurso confirmado no produto; nada de números inventados.
 * Cenários e conversas são sempre rotulados "Exemplo ilustrativo" na tela.
 */

export interface LifecycleStep {
  id: string;
  label: string;
  title: string;
  text: string;
  points: string[];
}

export const LIFECYCLE: LifecycleStep[] = [
  {
    id: "lead",
    label: "Lead",
    title: "O contato entra e já cai no pipeline",
    text: "Formulário público, API pública ou importação de planilha CSV. O S.P.Y. evita duplicidade na base de clientes e distribui os leads entre os vendedores em rodízio.",
    points: ["Pipeline em kanban ou lista, com funis e etapas que você configura", "Score de lead com IA e temperatura (quente, morno, frio)", "Rodízio de leads entre a equipe"],
  },
  {
    id: "proposta",
    label: "Proposta",
    title: "Proposta com vários produtos, do jeito que você vende",
    text: "Monte a proposta como um carrinho, com recorrência, parcelamento, desconto e taxa de implantação. O contrato tem editor de cláusulas e gera PDF.",
    points: ["Multi-produto a partir do catálogo", "Recorrência, parcelamento, desconto e implantação", "Editor de contrato com cláusulas e PDF"],
  },
  {
    id: "aceite",
    label: "Aceite",
    title: "O cliente aceita online, por um link público",
    text: "Você envia o link e acompanha se o cliente abriu a proposta. O aceite só vale para proposta já enviada e dentro da validade.",
    points: ["Link público da proposta", "Rastreio de visualização", "Aceite online com validação de envio e de validade"],
  },
  {
    id: "contrato",
    label: "Contrato",
    title: "Do aceite nasce o contrato, sem digitar de novo",
    text: "Quando o cliente aceita, o contrato é criado automaticamente, sem duplicar se o aceite for repetido. Com o módulo Financeiro, o lançamento a receber nasce junto.",
    points: ["Contrato criado a partir do aceite", "Editor de cláusulas e PDF", "Sem duplicidade se o aceite se repetir"],
  },
];

export interface ExplorerItem {
  title: string;
  text: string;
  slot?: string;
}
export interface ExplorerTab {
  id: string;
  label: string;
  intro: string;
  slot: string;
  items: ExplorerItem[];
}

export const EXPLORER: ExplorerTab[] = [
  {
    id: "inteligencia",
    label: "Inteligência",
    intro: "Identificação e acompanhamento de oportunidades. É o espião que capta os dados.",
    slot: "pipeline",
    items: [
      { title: "Agente Secreto de Vendas", text: "Acompanha o WhatsApp conectado de cada vendedor e alimenta o funil de vendas.", slot: "pipeline" },
      { title: "Radar de busca e de grupos", text: "Busca empresas no Google Maps e acompanha os grupos cadastrados, avisando o vendedor quando acha uma oportunidade." },
      { title: "Rodízio e captação", text: "Formulário público, API pública com chave, importação CSV e rodízio de leads entre vendedores." },
    ],
  },
  {
    id: "recuperacao",
    label: "Recuperação",
    intro: "Retomada de clientes e negociações.",
    slot: "agenda",
    items: [
      { title: "Negócios esfriando", text: "O Radar do CRM mostra o que está esquentando e o que está parado, para retomar antes de perder.", slot: "pipeline" },
      { title: "Aurora aponta os leads sem contato", text: "Pergunte quem ficou sem resposta e receba a próxima ação sugerida.", slot: "aurora" },
      { title: "Tarefas em kanban", text: "A retomada vira tarefa, com o que cada pessoa precisa entregar.", slot: "tarefas" },
      { title: "Rastreio de propostas", text: "Veja se o cliente abriu a proposta enviada por link.", slot: "propostas" },
      { title: "WhatsApp e automações", text: "WhatsApp por integração configurada na implantação, e automações via n8n e webhooks." },
    ],
  },
  {
    id: "dados",
    label: "Dados",
    intro: "Organização e centralização das informações.",
    slot: "pipeline",
    items: [
      { title: "Leads e pipeline", text: "Kanban ou lista, com funis e etapas configuráveis, score de lead com IA e temperatura.", slot: "pipeline" },
      { title: "Base de clientes", text: "Cadastro sem duplicidade, com o histórico de cada cliente." },
      { title: "Propostas e contratos", text: "Multi-produto, recorrência, parcelamento, desconto, implantação, contrato com PDF e aceite online.", slot: "propostas" },
      { title: "Catálogo de produtos", text: "Catálogo por segmento e catálogo público para compartilhar.", slot: "produtos" },
      { title: "Agenda e Google Calendar", text: "Calendário geral integrado ao Google Calendar, com link do Google Meet. Tarefas do Google em modo de leitura.", slot: "agenda" },
      { title: "Salas de reunião", text: "Notas e transcrição em texto, com resumo e insights gerados por IA." },
    ],
  },
  {
    id: "gestao",
    label: "Gestão",
    intro: "Relatórios, indicadores e acompanhamento.",
    slot: "dashboard",
    items: [
      { title: "Central de Receita", text: "Painel executivo com a receita e os indicadores da operação.", slot: "dashboard" },
      { title: "Indicadores e relatórios executivos", text: "Relatórios para a diretoria e performance do SDR e da IA." },
      { title: "Auditoria de pipeline e performance", text: "A Aurora revisa o funil e o desempenho do time e aponta o que merece atenção.", slot: "aurora" },
      { title: "Briefing diário", text: "Um resumo do dia, entregue por automação com n8n." },
    ],
  },
];

/** Agentes contratados à parte, além do Agente Secreto de Vendas e da Aurora que já vêm no plano. Textos do catálogo (src/lib/catalogoSpy.ts). */
export const OTHER_AGENTS: { id: "interno" | "julia" | "closer" | "cs"; name: string; text: string }[] = [
  { id: "interno", name: "Agente Secreto Interno", text: "Acompanha os grupos da equipe por departamento e transforma as mensagens em tarefas, ordens de serviço e pedidos." },
  { id: "julia", name: "Júlia, vendedora de IA", text: "Atende e qualifica quem chega, e passa a conversa para o vendedor." },
  { id: "closer", name: "Agente Closer", text: "Conduz a negociação e o fechamento das propostas." },
  { id: "cs", name: "Sucesso do Cliente", text: "Acompanha os clientes depois da venda." },
];

/** Módulos que complementam os quatro pilares, contratados à parte (ver "Preciso usar todos os módulos?" no FAQ). */
export const COMPLEMENTS: { areas: string[]; segments: { name: string; form: string }[] } = {
  areas: ["Financeiro", "Marketing", "Equipe e RH", "Ordens de serviço"],
  segments: [
    { name: "Varejo", form: "/f/varejo" },
    { name: "Automotivo", form: "/f/automotivo" },
    { name: "Energia solar", form: "/f/solar" },
    { name: "Imobiliária", form: "/f/imobiliaria" },
    { name: "Clínica", form: "/f/clinica" },
    { name: "Educação", form: "/f/educacao" },
  ],
};

export const AURORA_CAPS: [string, string][] = [
  ["Consulta os seus dados", "Pergunte sobre pipeline, leads sem contato, reuniões, tarefas, financeiro, propostas, clientes e produtos."],
  ["Copiloto do lead", "Apoio ao vendedor na qualificação e na próxima ação de cada lead."],
  ["Auditoria de pipeline e performance", "Revisa o funil e o desempenho do time e aponta o que merece atenção."],
  ["Briefing diário", "Um resumo do dia, entregue por automação com n8n."],
  ["Respeita as permissões", "No chat interno, a Aurora só mostra o que a pessoa que perguntou pode ver."],
  ["Você controla o consumo", "Há um teto de uso de IA por empresa, e você pode usar a sua própria chave."],
];

export const INTEGRATIONS = [
  "Google Calendar e Google Meet",
  "Google Tarefas (leitura)",
  "Kommo",
  "n8n e webhooks",
  "API pública com chave (leads, financeiro, clientes, reuniões e produtos)",
  "E-mail por SMTP",
  "WhatsApp, por integração configurada na implantação",
];

export const SECURITY = [
  "Isolamento por empresa no banco de dados",
  "Permissões por cargo e por usuário",
  "Bloqueio de período no financeiro",
  "Trilha de auditoria financeira",
  "Tratamento de dados conforme a LGPD",
];

export const PROBLEM_PAINS = ["WhatsApp separado", "Planilhas soltas", "Sistema isolado", "Leads esquecidos", "Equipe sem contexto", "Gestor sem visão da operação", "Decisões no achismo"];
export const PROBLEM_WITHOUT = ["O lead chega pelo WhatsApp", "Alguém responde e o interesse aparece", "A conversa para e a retomada não acontece", "O lead esfria e some do radar"];
export const PROBLEM_WITH = [
  "O lead entra no pipeline, com score e temperatura",
  "O rodízio entrega o lead a um vendedor",
  "A retomada vira tarefa e compromisso na agenda",
  "A Aurora aponta os leads sem contato",
  "A proposta segue por link, com aceite online",
];

export const AURORA_AGENTS: { name: string; role: string; text: string }[] = [
  { name: "Agente de Pré-venda", role: "Pré-venda", text: "Atende, qualifica o lead e agenda a reunião, pelo WhatsApp configurado na implantação." },
  { name: "Agente Vendedor", role: "Vendas", text: "Conduz a negociação e o fechamento das propostas." },
  { name: "Agente Comercial", role: "Comercial", text: "Suporte ao time comercial no dia a dia de vendas." },
  { name: "Diretoria", role: "Executivo", text: "Resumos e recomendações para a liderança." },
  { name: "Financeiro", role: "Financeiro", text: "Resumos de fluxo de caixa, contas e inadimplência." },
  { name: "Marketing", role: "Marketing", text: "Leitura de campanhas, landing pages e origem dos leads." },
  { name: "Organização", role: "Operações", text: "Tarefas pendentes, agenda e retomadas do dia." },
  { name: "Atendimento", role: "Suporte", text: "Acompanhamento de clientes ativos e chamados." },
  { name: "Pesquisa", role: "Pesquisa", text: "Levantamento de dados de mercado e concorrência." },
  { name: "Briefing Diário", role: "Briefing", text: "Resumo do dia com as prioridades de cada pessoa." },
];

export const EXAMPLE_MESSAGE = "Estou pensando em trocar o sistema da empresa ainda este mês. Quanto custa?";
export const EXAMPLE_ANALYSIS: [string, string][] = [
  ["Intenção de compra", "Alta"],
  ["Prazo", "Este mês"],
  ["Contexto", "Possível troca de sistema"],
  ["Próxima ação sugerida", "Aprofundar a necessidade e agendar um diagnóstico"],
];

export const START_STEPS: [string, string][] = [
  ["Conversa inicial", "Você conta como vende hoje pelo formulário e a equipe entende o seu segmento."],
  ["Ambiente e módulos", "Criamos a empresa no S.P.Y. e ligamos os módulos que fazem sentido para o seu negócio."],
  ["Conexão da operação", "Conectamos o que você já usa (Google, WhatsApp, formulários) e importamos leads e clientes por CSV."],
  ["Equipe em operação", "Usuários e permissões definidos, rodízio e automações configurados, e o time passa a vender dentro do sistema."],
  ["Aurora e indicadores", "A Aurora passa a consultar os dados e o gestor acompanha pipeline, financeiro e relatórios."],
];

export const FAQ_EXTRA: [string, string][] = [
  ["O S.P.Y. substitui os meus sistemas e as planilhas?", "Ele centraliza no mesmo ambiente o pipeline de vendas, a base de clientes, a agenda sincronizada com o Google, propostas e contratos e o financeiro com DRE. Na prática, dispensa os sistemas isolados e as planilhas soltas."],
  ["Posso importar meus contatos de uma planilha?", "Sim. Leads e clientes podem ser importados por arquivo CSV, e o cadastro evita duplicidade na base de clientes."],
  ["O S.P.Y. gera propostas e contratos?", "Sim. A proposta é multi-produto, com recorrência, parcelamento, desconto e implantação. O contrato tem editor de cláusulas e PDF, e o cliente aceita a proposta online por um link público."],
  ["Como funciona o rodízio de leads?", "Os leads que entram pelo formulário ou pela API são distribuídos entre os vendedores em rodízio, para que ninguém fique sem atendimento."],
];
