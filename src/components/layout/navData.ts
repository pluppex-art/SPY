import {
  LayoutDashboard,
  Users,
  Columns3,
  Radar as RadarIcon,
  CheckSquare,
  Settings,
  Mail,
  Zap,
  BarChart2,
  PieChart,
  Brain,
  Wallet,
  FolderOpen,
  GraduationCap,
  BookOpen,
  Award,
  FileText,
  Megaphone,
  Edit3,
  Globe,
  Stethoscope,
  Sun,
  Calendar,
  Video,
  Archive,
  FlaskConical,
  BarChart3,
  Code2,
  FolderCode,
  Kanban,
  Bug,
  GitBranch,
  MonitorCheck,
  Building2,
  KeySquare,
  Car,
  Server,
  Handshake,
  CalendarDays,
  TrendingUp,
  SlidersHorizontal,
  ShoppingCart,
  Boxes,
  ClipboardList,
  Wrench,
  Truck,
  GitCompare,
} from "lucide-react";

/**
 * Condições de visibilidade que dependem do usuário logado (não dá pra
 * resolver estaticamente aqui).
 */
export type NavReqCondition = "master-only" | "master-or-partner";

export const conditionCheckers: Record<NavReqCondition, (user: any) => boolean> = {
  // Antes também liberava por `tenantName === "g-tech master"` — resquício do
  // tenant master original (excluído em 2026-09-22); `isMaster` sozinho já é
  // a condição correta e suficiente.
  "master-only": (user) => !!user?.isMaster,
  "master-or-partner": (user) => !!user?.isMaster || !!user?.partnerId,
};

export const navSections = [
  {
    title: "Visão Geral",
    items: [
      { name: "Dashboard Geral", path: "/app/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "CRM & Vendas",
    reqModule: "crm",
    items: [
      { name: "Leads & Pipeline", path: "/app/crm/pipeline", icon: Columns3 },
      { name: "Radar", path: "/app/crm/radar", icon: RadarIcon },
      { name: "Propostas Comerciais", path: "/app/crm/propostas", icon: FileText },
      { name: "Base de Clientes", path: "/app/crm/clientes", icon: Users },
    ],
  },
  {
    title: "Agenda & Reuniões",
    items: [
      { name: "Calendário Geral", path: "/app/agenda/calendario", icon: CalendarDays, reqModule: "agenda" },
      { name: "Salas de Reunião", path: "/app/agenda/reunioes", icon: Video, reqModule: "agenda" },
      { name: "Tarefas & Projetos", path: "/app/tarefas", icon: CheckSquare, reqModule: "produtividade" },
    ],
  },
  {
    title: "Gestão Financeira",
    reqModule: "financeiro",
    items: [
      { name: "Financeiro", path: "/app/financeiro/dashboard", icon: Wallet },
    ],
  },
  {
    title: "Mensageria",
    items: [
      { name: "Mensageria Omnichannel", path: "/app/mensageria", icon: Mail, reqModule: "engajamento" },
    ],
  },
  {
    title: "Comunicação & Mkt",
    items: [
      { name: "Automações", path: "/app/automacoes", icon: Zap, reqModule: "engajamento" },
      { name: "Campanhas de Mkt", path: "/app/marketing/campanhas", icon: Megaphone, reqModule: "marketing" },
      { name: "Landing Pages", path: "/app/marketing/landing-pages", icon: Globe, reqModule: "marketing" },
      { name: "Formulários", path: "/app/marketing/formularios", icon: FileText, reqModule: "marketing" },
      { name: "Conteúdo & Social", path: "/app/marketing/conteudo", icon: Edit3, reqModule: "marketing" },
      { name: "Analytics de Mkt", path: "/app/marketing/analytics", icon: BarChart2, reqModule: "marketing" },
    ],
  },
  {
    title: "Operações & Catálogo",
    items: [
      { name: "Catálogo de Produtos", path: "/app/produtos", icon: FolderOpen, reqModule: "catalogo" },
      { name: "Ordens de Serviço", path: "/app/ordens-servico", icon: Wrench, reqModule: "catalogo" },
    ],
  },
  {
    title: "Inteligência & BI",
    reqModule: "bi",
    items: [
      { name: "Performance SDR / IA", path: "/app/performance-ia", icon: Brain },
      { name: "CPM & Indicadores", path: "/app/indicadores", icon: BarChart2 },
      { name: "Relatórios Executivos", path: "/app/relatorios", icon: PieChart },
    ],
  },

  // ═══════════════════════════════════════════════════
  // MÓDULOS VERTICAIS (100% Gated por Tenant / Multi-tenant)
  // ═══════════════════════════════════════════════════
  {
    title: "Imobiliário",
    reqModule: "imobiliaria",
    items: [
      { name: "Painel Imobiliário", path: "/app/imobiliario/dashboard", icon: Building2 },
      { name: "Catálogo de Imóveis", path: "/app/imobiliario/imoveis", icon: KeySquare },
      { name: "Proprietários", path: "/app/imobiliario/proprietarios", icon: Users },
      { name: "Captações", path: "/app/imobiliario/captacoes", icon: ClipboardList },
      { name: "Empreendimentos", path: "/app/imobiliario/empreendimentos", icon: Building2 },
      { name: "Corretores", path: "/app/imobiliario/corretores", icon: Users },
      { name: "Visitas Agendadas", path: "/app/imobiliario/visitas", icon: Calendar },
    ],
  },
  {
    title: "Energia Solar",
    reqModule: "solar",
    items: [
      { name: "Painel Fotovoltaico", path: "/app/energia-solar/dashboard", icon: Sun },
      { name: "Projetos Solares", path: "/app/energia-solar/projetos", icon: LayoutDashboard },
      { name: "Vistorias Técnicas", path: "/app/energia-solar/vistorias", icon: ClipboardList },
      { name: "Análise de Fatura & kWp", path: "/app/energia-solar/dimensionamentos", icon: Sun },
      { name: "Instalações & Obras", path: "/app/energia-solar/instalacoes", icon: Wrench },
      { name: "Homologações", path: "/app/energia-solar/homologacoes", icon: FileText },
      { name: "Manutenções & Pós-Venda", path: "/app/energia-solar/manutencoes", icon: Wrench },
    ],
  },
  {
    title: "Automotivo",
    reqModule: "automotivo",
    items: [
      { name: "Painel Concessionária", path: "/app/automotivo/dashboard", icon: Building2 },
      { name: "Estoque de Veículos", path: "/app/automotivo/veiculos", icon: Car },
      { name: "Captações", path: "/app/automotivo/captacoes", icon: ClipboardList },
      { name: "Avaliações de Usados", path: "/app/automotivo/avaliacoes", icon: CheckSquare },
      { name: "Consignações", path: "/app/automotivo/consignacoes", icon: Handshake },
      { name: "Trocas & Repasses", path: "/app/automotivo/trocas", icon: TrendingUp },
      { name: "Vendedores", path: "/app/automotivo/corretores", icon: Users },
      { name: "Test-Drives Agendados", path: "/app/automotivo/visitas", icon: Calendar },
    ],
  },
  {
    title: "Varejo",
    reqModule: "varejo",
    items: [
      { name: "Painel de Varejo", path: "/app/varejo/dashboard", icon: LayoutDashboard },
      { name: "Frente de Caixa (PDV)", path: "/app/varejo/vendas", icon: ShoppingCart },
      { name: "Controle de Estoque", path: "/app/varejo/estoque", icon: Boxes },
      { name: "Fornecedores", path: "/app/varejo/fornecedores", icon: Truck },
      { name: "Pedidos de Compra", path: "/app/varejo/compras", icon: ClipboardList },
      { name: "Notas de Entrada", path: "/app/varejo/notas-entrada", icon: FileText },
    ],
  },
  {
    title: "Clínica & Saúde",
    reqModule: "clinica",
    items: [
      { name: "Painel Geral", path: "/app/clinicas/dashboard", icon: Stethoscope },
      { name: "Agenda Médica", path: "/app/clinicas/agenda", icon: Calendar },
      { name: "Pacientes", path: "/app/clinicas/pacientes", icon: Users },
      { name: "Prontuários EHR", path: "/app/clinicas/prontuarios", icon: FileText },
      { name: "Telemedicina", path: "/app/clinicas/telemedicina", icon: Video },
      { name: "Faturamento Clínico", path: "/app/clinicas/faturamento", icon: Wallet },
      { name: "Estoque de Insumos", path: "/app/clinicas/estoque", icon: Archive },
      { name: "Exames & Labs", path: "/app/clinicas/exames", icon: FlaskConical },
      { name: "Base de Exames", path: "/app/clinicas/base-exames", icon: Boxes },
      { name: "Comparação de Tabelas", path: "/app/clinicas/comparacao-tabelas", icon: GitCompare },
      { name: "BI Clínico", path: "/app/clinicas/bi", icon: BarChart3 },
    ],
  },
  {
    title: "Educação & Cursos",
    reqModule: "educacao",
    items: [
      { name: "Painel Educação", path: "/app/educacao/painel", icon: LayoutDashboard },
      { name: "Turmas Ativas", path: "/app/educacao/turmas", icon: GraduationCap },
      { name: "Base de Alunos", path: "/app/educacao/alunos", icon: Users },
      { name: "Banco de Conteúdo", path: "/app/educacao/conteudo", icon: BookOpen },
      { name: "Certificados", path: "/app/educacao/certificados", icon: Award },
      { name: "Mensalidades", path: "/app/educacao/mensalidades", icon: Wallet },
    ],
  },
  {
    title: "Dev & Engenharia",
    reqModule: "dev",
    items: [
      { name: "Painel Dev", path: "/app/dev/painel", icon: Code2 },
      { name: "Projetos", path: "/app/dev/projetos", icon: FolderCode },
      { name: "Sprints", path: "/app/dev/sprints", icon: Kanban },
      { name: "Issues & Bugs", path: "/app/dev/issues", icon: Bug },
      { name: "Repositórios", path: "/app/dev/repositorios", icon: GitBranch },
      { name: "Ambientes", path: "/app/dev/ambientes", icon: MonitorCheck },
    ],
  },
  {
    title: "Equipe & RH",
    reqModule: "rh",
    items: [
      { name: "Colaboradores & RH", path: "/app/equipe", icon: Users },
    ],
  },
  {
    title: "Configurações",
    items: [
      { name: "Configurações Gerais", path: "/app/configuracoes", icon: Settings },
      { name: "Central de Integrações", path: "/app/configuracoes/integracoes/apps", icon: Zap },
      { name: "Webhooks SDR", action: "sdr-webhooks", icon: SlidersHorizontal, reqModule: "crm" },
    ],
  },
  {
    title: "Administração Master",
    items: [
      { name: "Painel SaaS & Infra", path: "/app/admin", icon: Server, reqCondition: "master-only" as NavReqCondition },
      { name: "Portal de Parceiros", path: "/app/parceiros", icon: Handshake, reqCondition: "master-or-partner" as NavReqCondition },
      { name: "Implementações", path: "/app/crm/implementacoes", icon: ClipboardList, reqCondition: "master-only" as NavReqCondition, hideWhen: "os-implementacao" },
    ],
  },
];
