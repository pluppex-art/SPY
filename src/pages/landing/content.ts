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
    title: "Do aceite nascem o contrato e o lançamento a receber",
    text: "Quando o cliente aceita, o contrato e o lançamento a receber são criados automaticamente, sem digitar duas vezes e sem duplicar se o aceite for repetido.",
    points: ["Contrato criado a partir do aceite", "Lançamento a receber criado junto", "Reconciliação sem duplicidade"],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    title: "O dinheiro acompanhado até o caixa",
    text: "Contas a receber, cobranças e inadimplência por faixa de atraso, com fluxo de caixa, projeção, DRE e MRR no mesmo sistema.",
    points: ["Contas a pagar e a receber", "Inadimplência por faixa de atraso", "Fluxo de caixa, projeção, DRE e MRR"],
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
    id: "vender",
    label: "Vender",
    intro: "Do primeiro contato ao contrato assinado.",
    slot: "pipeline",
    items: [
      { title: "Leads e pipeline", text: "Kanban ou lista, com funis e etapas configuráveis, score de lead com IA e temperatura.", slot: "pipeline" },
      { title: "Rodízio e captação", text: "Formulário público, API pública com chave, importação CSV e rodízio de leads entre vendedores." },
      { title: "Propostas e contratos", text: "Multi-produto, recorrência, parcelamento, desconto, implantação, contrato com PDF e aceite online.", slot: "propostas" },
      { title: "Base de clientes", text: "Cadastro sem duplicidade, com o histórico de cada cliente." },
      { title: "Catálogo de produtos", text: "Catálogo por segmento e catálogo público para compartilhar.", slot: "produtos" },
    ],
  },
  {
    id: "atender",
    label: "Atender",
    intro: "A rotina do time, organizada.",
    slot: "agenda",
    items: [
      { title: "Agenda e Google Calendar", text: "Calendário geral integrado ao Google Calendar, com link do Google Meet.", slot: "agenda" },
      { title: "Salas de reunião", text: "Notas e transcrição em texto, com resumo e insights gerados por IA." },
      { title: "Tarefas em kanban", text: "O que cada pessoa precisa entregar, por quadro.", slot: "tarefas" },
      { title: "Google Tarefas", text: "Suas tarefas do Google aparecem no S.P.Y. (somente leitura)." },
      { title: "WhatsApp e automações", text: "WhatsApp por integração configurada na implantação, e automações via n8n e webhooks." },
    ],
  },
  {
    id: "controlar",
    label: "Controlar",
    intro: "A visão do gestor sobre o resultado.",
    slot: "dashboard",
    items: [
      { title: "Central de Receita", text: "Painel executivo com a receita e os indicadores da operação.", slot: "dashboard" },
      { title: "Indicadores e relatórios executivos", text: "Relatórios para a diretoria e performance do SDR e da IA." },
      { title: "Financeiro completo", text: "Contas a pagar e a receber, DRE, MRR, conciliação e mais.", slot: "financeiro" },
      { title: "Comissões", text: "Cálculo de comissões por vendedor." },
    ],
  },
  {
    id: "gerir",
    label: "Gerir",
    intro: "Equipe, marketing e operação.",
    slot: "produtos",
    items: [
      { title: "Equipe e RH", text: "Colaboradores, cargos e permissões de acesso." },
      { title: "Marketing", text: "Campanhas, conteúdo, analytics, landing pages e formulários." },
      { title: "Ordens de serviço", text: "Registro e acompanhamento das ordens de serviço." },
      { title: "Catálogo por segmento", text: "Produtos e serviços organizados para o seu nicho.", slot: "produtos" },
    ],
  },
];

export const FINANCE_GROUPS: { title: string; items: string[] }[] = [
  { title: "Contas e cobrança", items: ["Contas a pagar e a receber", "Cobranças", "Inadimplência por faixa de atraso", "Comissões"] },
  { title: "Caixa e visão", items: ["Fluxo de caixa", "Projeção", "DRE", "MRR", "Orçamentos"] },
  { title: "Bancos", items: ["Contas bancárias e transferências", "Conciliação de extrato OFX e QFX", "Importação por CSV"] },
  { title: "Organização", items: ["Centros de custo", "Tags", "Rateio", "Anexos nos lançamentos"] },
  { title: "Relatórios", items: ["Extrato", "Performance mensal e anual", "Relatórios agrupados"] },
  { title: "Controle", items: ["Bloqueio de período", "Trilha de auditoria financeira"] },
];

export interface Segment {
  id: string;
  name: string;
  form: string;
  modules: string[];
  scenarioTitle: string;
  scenario: string[];
}

export const SEGMENTS: Segment[] = [
  {
    id: "clinica",
    name: "Clínica",
    form: "/f/clinica",
    modules: ["Agenda médica", "Pacientes", "Prontuários", "Telemedicina", "Faturamento clínico", "Exames e laboratórios", "BI clínico"],
    scenarioTitle: "Da primeira mensagem ao faturamento",
    scenario: [
      "O contato do paciente entra no pipeline como lead.",
      "A consulta é marcada na agenda médica, com Google Calendar e link do Meet para telemedicina.",
      "Prontuário e exames ficam registrados no cadastro do paciente.",
      "O faturamento clínico chega ao contas a receber do financeiro.",
    ],
  },
  {
    id: "automotivo",
    name: "Concessionária",
    form: "/f/automotivo",
    modules: ["Captações", "Avaliações de usados", "Consignações", "Trocas e repasses", "Test-drives agendados", "Vendedores"],
    scenarioTitle: "Do interessado ao veículo entregue",
    scenario: [
      "O lead entra com score de IA e temperatura, e cai no rodízio dos vendedores.",
      "O test-drive é marcado na agenda.",
      "O usado do cliente passa por avaliação e a proposta inclui a troca.",
      "O cliente aceita online; contrato e lançamento a receber nascem do aceite.",
    ],
  },
  {
    id: "imobiliaria",
    name: "Imobiliária",
    form: "/f/imobiliaria",
    modules: ["Proprietários", "Captações", "Empreendimentos", "Corretores", "Visitas agendadas", "Portal público do imóvel"],
    scenarioTitle: "Da captação do imóvel à proposta",
    scenario: [
      "O imóvel é captado e vinculado ao proprietário.",
      "O imóvel ganha uma página pública, e o corretor, o seu portfólio.",
      "A visita é agendada e acompanhada no pipeline.",
      "A proposta segue por link, com aceite online e contrato.",
    ],
  },
  {
    id: "varejo",
    name: "Varejo",
    form: "/f/varejo",
    modules: ["Frente de Caixa (PDV)", "Movimentações de estoque", "Fornecedores", "Pedidos de compra", "Notas de entrada", "Catálogo de produtos"],
    scenarioTitle: "Do balcão ao caixa da empresa",
    scenario: [
      "O cliente chega pelo formulário ou pelo balcão e vira cliente cadastrado, sem duplicidade.",
      "A venda é registrada na Frente de Caixa (PDV).",
      "Compras, fornecedores e notas de entrada ficam no mesmo sistema do estoque.",
      "Recebimentos e despesas aparecem no financeiro, com DRE.",
    ],
  },
  {
    id: "solar",
    name: "Energia solar",
    form: "/f/solar",
    modules: ["Projetos solares", "Vistorias técnicas", "Análise de fatura e kWp por IA", "Instalações e obras", "Homologações", "Manutenções e pós-venda"],
    scenarioTitle: "Da fatura de luz à usina instalada",
    scenario: [
      "O lead envia a fatura de energia e a IA ajuda na análise e no dimensionamento em kWp.",
      "A proposta sai com os itens do projeto e vai por link para o aceite.",
      "Vistoria técnica, instalação e obra são acompanhadas por projeto.",
      "Homologação e manutenções ficam registradas no pós-venda.",
    ],
  },
  {
    id: "educacao",
    name: "Escola",
    form: "/f/educacao",
    modules: ["Turmas", "Base de alunos", "Banco de conteúdo", "Certificados", "Mensalidades"],
    scenarioTitle: "Da matrícula ao certificado",
    scenario: [
      "O interessado entra no pipeline por formulário e recebe o contato do time.",
      "O aluno é cadastrado e vinculado a uma turma.",
      "As mensalidades são acompanhadas no financeiro, com inadimplência por faixa.",
      "Ao final do curso, o certificado é emitido pelo sistema.",
    ],
  },
];

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

export const PROBLEM_PAINS = ["WhatsApp separado", "Planilhas soltas", "CRM isolado", "Leads esquecidos", "Equipe sem contexto", "Gestor sem visão da operação", "Decisões no achismo"];
export const PROBLEM_WITHOUT = ["O lead chega pelo WhatsApp", "Alguém responde e o interesse aparece", "A conversa para e o follow-up não acontece", "O lead esfria e some do radar"];
export const PROBLEM_WITH = [
  "O lead entra no pipeline, com score e temperatura",
  "O rodízio entrega o lead a um vendedor",
  "O follow-up vira tarefa e compromisso na agenda",
  "A Aurora aponta os leads sem contato",
  "A proposta segue por link, com aceite online",
];

export const AURORA_AGENTS: { name: string; role: string; text: string }[] = [
  { name: "Agente de Pré-venda", role: "Pré-venda", text: "Atende, qualifica o lead e agenda a reunião, pelo WhatsApp configurado na implantação." },
  { name: "Agente Vendedor", role: "Vendas", text: "Conduz a negociação e o fechamento das propostas." },
  { name: "Agente Comercial", role: "Comercial", text: "Suporte ao time comercial no dia a dia do CRM." },
  { name: "Diretoria", role: "Executivo", text: "Resumos e recomendações para a liderança." },
  { name: "Financeiro", role: "Financeiro", text: "Resumos de fluxo de caixa, contas e inadimplência." },
  { name: "Marketing", role: "Marketing", text: "Leitura de campanhas, landing pages e origem dos leads." },
  { name: "Organização", role: "Operações", text: "Tarefas pendentes, agenda e follow-ups do dia." },
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
  ["O S.P.Y. substitui o meu CRM e as planilhas?", "Ele centraliza no mesmo ambiente o pipeline de vendas, a base de clientes, a agenda sincronizada com o Google, propostas e contratos e o financeiro com DRE. Na prática, dispensa o CRM isolado e as planilhas soltas."],
  ["Posso importar meus contatos de uma planilha?", "Sim. Leads e clientes podem ser importados por arquivo CSV, e o cadastro evita duplicidade na base de clientes."],
  ["O S.P.Y. gera propostas e contratos?", "Sim. A proposta é multi-produto, com recorrência, parcelamento, desconto e implantação. O contrato tem editor de cláusulas e PDF, e o cliente aceita a proposta online por um link público."],
  ["Como funciona o rodízio de leads?", "Os leads que entram pelo formulário ou pela API são distribuídos entre os vendedores em rodízio, para que ninguém fique sem atendimento."],
];
