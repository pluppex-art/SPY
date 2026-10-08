import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { requestNotificationPermission } from "./lib/notifications";
const LandingPage = lazy(() => import("./pages/landing/LandingPage"));
// Lazy: página de marketing pública, sem nenhuma dependência do app autenticado — fica no
// próprio chunk pra quem visita /lp não baixar o bundle inteiro do CRM.
const SPYLandingPage = lazy(() => import("./pages/lp/SPYLandingPage"));
const PoliticaPrivacidade = lazy(() => import("./pages/lp/PoliticaPrivacidade"));
// "Central de Receita" — redesenho do Dashboard principal (/app/dashboard),
// pedido explícito do usuário. O Dashboard.tsx antigo continua no repo (não
// apagado) só não está mais roteado aqui — reversível se precisar. As outras
// 5 telas da suíte (Mapa da Receita, Oportunidades, Vazamentos, Inteligência
// Aurora, Previsão & Decisão) vivem DENTRO dessa mesma página, como abas
// (ver RevenueTabs.tsx) — pedido explícito do usuário de não navegar pra
// rotas separadas — por isso não têm lazy import/rota próprios aqui.
const Dashboard = lazy(() => import("./pages/dashboard/CentralReceita"));
const PerformanceIA = lazy(() => import("./pages/dashboard/PerformanceIA"));
const PainelGeral = lazy(() => import("./pages/clinica/PainelGeral"));
const AgendaMedica = lazy(() => import("./pages/clinica/AgendaMedica"));
const AnaliseFatura = lazy(() => import("./pages/solar/AnaliseFatura"));
const PainelSolar = lazy(() => import("./pages/solar/PainelSolar"));
const Prontuarios = lazy(() => import("./pages/clinica/Prontuarios"));
const Faturamento = lazy(() => import("./pages/clinica/Faturamento"));
const Estoque = lazy(() => import("./pages/clinica/Estoque"));
const Telemedicina = lazy(() => import("./pages/clinica/Telemedicina"));
const Exames = lazy(() => import("./pages/clinica/Exames"));
const EstatisticasClinicas = lazy(() => import("./pages/clinica/Estatisticas"));
const Pacientes = lazy(() => import("./pages/clinica/Pacientes"));
const Login = lazy(() => import("./pages/auth/Login"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
import Layout from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
const Pipeline = lazy(() => import("./pages/crm/Pipeline"));
const Clientes = lazy(() => import("./pages/crm/Clientes"));
const AgendaCRM = lazy(() => import("./pages/crm/AgendaCRM"));
const Contatos = lazy(() => import("./pages/crm/Contatos"));
const Empresas = lazy(() => import("./pages/crm/Empresas"));
const Oportunidades = lazy(() => import("./pages/crm/Oportunidades"));
const Atividades = lazy(() => import("./pages/crm/Atividades"));
const FollowUps = lazy(() => import("./pages/crm/FollowUps"));
const CRMImportacao = lazy(() => import("./pages/crm/Importacao"));
const Tarefas = lazy(() => import("./pages/operative/Tarefas"));
const Produtos = lazy(() => import("./pages/operative/Produtos"));
const Indicadores = lazy(() => import("./pages/operative/Indicadores"));
const RelatoriosExecutivos = lazy(() => import("./pages/crm/RelatoriosExecutivos"));
const Contracts = lazy(() => import("./pages/crm/Contracts"));
const Implementacoes = lazy(() => import("./pages/crm/Implementacoes"));
const ImplementacaoDetalhe = lazy(() => import("./pages/crm/ImplementacaoDetalhe"));
const ImplementacaoRelatorio = lazy(() => import("./pages/crm/ImplementacaoRelatorio"));
const Messaging = lazy(() => import("./pages/crm/Messaging"));
const Automations = lazy(() => import("./pages/marketing/Automations"));
const AdminSaaS = lazy(() => import("./pages/admin/AdminSaaS"));
const PartnersOverview = lazy(() => import("./pages/partners/PartnersOverview"));

const FinanceiroLayout = lazy(() => import("./pages/finance/FinanceiroLayout"));
const FinanceiroVisaoGeral = lazy(() => import("./pages/finance/FinanceiroVisaoGeral"));
const FinanceiroReceitas = lazy(() => import("./pages/finance/FinanceiroReceitas"));
const FinanceiroDespesas = lazy(() => import("./pages/finance/FinanceiroDespesas"));
const FinanceiroFluxoCaixa = lazy(() => import("./pages/finance/FinanceiroFluxoCaixa"));
const FinanceiroTransacoes = lazy(() => import("./pages/finance/FinanceiroTransacoes"));
const FinanceiroCobrancas = lazy(() => import("./pages/finance/FinanceiroCobrancas"));
const FinanceiroConciliacao = lazy(() => import("./pages/finance/FinanceiroConciliacao"));
const FinanceiroCentrosCusto = lazy(() => import("./pages/finance/FinanceiroCentrosCusto"));
const FinanceiroOrcamentos = lazy(() => import("./pages/finance/FinanceiroOrcamentos"));
const FinanceiroDRE = lazy(() => import("./pages/finance/FinanceiroDRE"));
const FinanceiroContasBancarias = lazy(() => import("./pages/finance/FinanceiroContasBancarias"));
const FinanceiroTransferencias = lazy(() => import("./pages/finance/FinanceiroTransferencias"));
const FinanceiroInadimplencia = lazy(() => import("./pages/finance/FinanceiroInadimplencia"));
const FinanceiroMRR = lazy(() => import("./pages/finance/FinanceiroMRR"));
const FinanceiroProjecao = lazy(() => import("./pages/finance/FinanceiroProjecao"));
const FinanceiroRelatorios = lazy(() => import("./pages/finance/FinanceiroRelatorios"));
const FinanceiroRelatorioAgrupado = lazy(() => import("./pages/finance/FinanceiroRelatorioAgrupado"));
const FinanceiroExtrato = lazy(() => import("./pages/finance/FinanceiroExtrato"));
const FinanceiroPerformanceMensal = lazy(() => import("./pages/finance/FinanceiroPerformanceMensal"));
const FinanceiroPerformanceAnual = lazy(() => import("./pages/finance/FinanceiroPerformanceAnual"));
const FinanceiroBuscaGlobal = lazy(() => import("./pages/finance/FinanceiroBuscaGlobal"));
const FinanceiroImportarMovimentacoes = lazy(() => import("./pages/finance/FinanceiroImportarMovimentacoes"));
const FinanceiroContatos = lazy(() => import("./pages/finance/FinanceiroContatos"));
const Indicacoes = lazy(() => import("./pages/finance/Indicacoes"));

const Calendario = lazy(() => import("./pages/agenda/Calendario"));
const Eventos = lazy(() => import("./pages/agenda/Eventos"));
const Disponibilidade = lazy(() => import("./pages/agenda/Disponibilidade"));
const AgendaConfiguracoes = lazy(() => import("./pages/agenda/AgendaConfiguracoes"));

const SettingsLayout = lazy(() => import("./pages/settings/SettingsLayout"));
const ConfigEmpresaDados = lazy(() => import("./pages/settings/ConfigEmpresaDados"));
const ConfigPlanoUso = lazy(() => import("./pages/settings/sections/ConfigPlanoUso"));
const ConfigLGPD = lazy(() => import("./pages/settings/sections/ConfigLGPD"));
const Radar = lazy(() => import("./pages/crm/Radar"));
const ConfigEmpresaFiliais = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigEmpresaFiliais })));
const ConfigEmpresaEquipe = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigEmpresaEquipe })));
const ConfigEmpresaPermissoes = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigEmpresaPermissoes })));
const ConfigEmpresaCargos = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigEmpresaCargos })));
const ConfigNichos = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigNichos })));
const ConfigCRMFunis = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigCRMFunis })));
const ConfigCRMOrigens = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigCRMOrigens })));
const ConfigCRMProdutos = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigCRMProdutos })));
const ConfigProdutividadeCategorias = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigProdutividadeCategorias })));
const ConfigFinanceiroCategorias = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigFinanceiroCategorias })));
const ConfigEngajamentoModelos = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigEngajamentoModelos })));
const ConfigEngajamentoAutomacoes = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigEngajamentoAutomacoes })));
const ConfigIntegracoesApps = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigIntegracoesApps })));
const ConfigNotificacoesPreferencias = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigNotificacoesPreferencias })));
const ConfigPerfilUsuario = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigPerfilUsuario })));
const ConfigPreferenciasSistema = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigPreferenciasSistema })));
const ConfigCRMCampos = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigCRMCampos })));
const ConfigCRMSLA = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigCRMSLA })));
const ConfigCRMGatilhosIA = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigCRMGatilhosIA })));
const ConfigIntegracoesSMTP = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigIntegracoesSMTP })));
const ConfigSistemaBackups = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigSistemaBackups })));
const ConfigSistemaAuroraUso = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigSistemaAuroraUso })));
const ConfigSistemaTreinamento = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigSistemaTreinamento })));
const ConfigIntegracoesSDR = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigIntegracoesSDR })));
const ConfigFinanceiroSquads = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigFinanceiroSquads })));
const ConfigFinanceiroBloqueioPeriodo = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigFinanceiroBloqueioPeriodo })));
const ConfigFinanceiroAuditoria = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigFinanceiroAuditoria })));
const ConfigRodizioLeads = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigRodizioLeads })));
const ConfigKanbanBoards = lazy(() => import("./pages/settings/SettingsPages").then(m => ({ default: m.ConfigKanbanBoards })));
const ConfigIntegracoesWebhooks = lazy(() => import("./pages/settings/ConfigIntegracoesWebhooks").then(m => ({ default: m.ConfigIntegracoesWebhooks })));
const ConfigConexoes = lazy(() => import("./pages/settings/sections/integracoes/ConfigConexoes").then(m => ({ default: m.ConfigConexoes })));
const ConfigConectoresExternos = lazy(() => import("./pages/settings/ConfigConectoresExternos").then(m => ({ default: m.ConfigConectoresExternos })));
const ConfigLinksDinamicos = lazy(() => import("./pages/settings/ConfigLinksDinamicos").then(m => ({ default: m.ConfigLinksDinamicos })));
const SettingsGenericForm = lazy(() => import("./pages/settings/SettingsGenericForm"));
const GenericPlaceholder = lazy(() => import("./pages/common/GenericPlaceholder"));
const EducationTurmas = lazy(() => import("./pages/education/Turmas"));
const EducationConteudo = lazy(() => import("./pages/education/Conteudo"));
const EducationCertificados = lazy(() => import("./pages/education/Certificados"));
const EducationMensalidades = lazy(() => import("./pages/education/Mensalidades"));
const AlunosEdu = lazy(() => import("./pages/education/Alunos"));
const PainelGeralEdu = lazy(() => import("./pages/education/PainelGeral"));
const Propostas = lazy(() => import("./pages/crm/Propostas"));
const CommercialDashboard = lazy(() => import("./pages/crm/Dashboard"));
const MarketingAutomacoes = lazy(() => import("./pages/marketing/MarketingAutomacoes"));
const MarketingConteudo = lazy(() => import("./pages/marketing/MarketingConteudo"));
const MarketingCampanhas = lazy(() => import("./pages/marketing/MarketingCampanhas"));
const MarketingAnalytics = lazy(() => import("./pages/marketing/MarketingAnalytics"));
const MarketingSocial = lazy(() => import("./pages/marketing/MarketingSocial"));
const MarketingLandingPages = lazy(() => import("./pages/marketing/MarketingLandingPages"));
const EEmpreendaEditor = lazy(() => import("./pages/marketing/EEmpreendaEditor"));
const MarketingFormularios = lazy(() => import("./pages/marketing/MarketingFormularios"));
const RHColaboradores = lazy(() => import("./pages/hr/RHColaboradores"));
const ReunioesList = lazy(() => import("./pages/reunioes/index"));
const ReuniaoRoom = lazy(() => import("./pages/reunioes/ReuniaoRoom"));

const ImobiliarioPainel = lazy(() => import("./pages/imobiliario/PainelGeral"));
const ImobiliariosImoveis = lazy(() => import("./pages/imobiliario/Imoveis"));
const ImobiliariosVeiculos = lazy(() => import("./pages/imobiliario/Veiculos"));
const ImobiliariosCorretores = lazy(() => import("./pages/imobiliario/Corretores"));
const ImobiliariosVisitas = lazy(() => import("./pages/imobiliario/Visitas"));
const Proprietarios = lazy(() => import("./pages/imobiliario/Proprietarios"));
const Captacoes = lazy(() => import("./pages/imobiliario/Captacoes"));
const Empreendimentos = lazy(() => import("./pages/imobiliario/Empreendimentos"));
const ImobiliarioComissoes = lazy(() => import("./pages/imobiliario/ImobiliarioComissoes"));

const ProjetosSolar = lazy(() => import("./pages/solar/ProjetosSolar"));
const VistoriasSolar = lazy(() => import("./pages/solar/VistoriasSolar"));
const InstalacoesSolar = lazy(() => import("./pages/solar/InstalacoesSolar"));
const HomologacoesSolar = lazy(() => import("./pages/solar/HomologacoesSolar"));
const ManutencoesSolar = lazy(() => import("./pages/solar/ManutencoesSolar"));

const PainelAutomotivo = lazy(() => import("./pages/automotivo/PainelAutomotivo"));
const AvaliacoesVeiculos = lazy(() => import("./pages/automotivo/AvaliacoesVeiculos"));
const ConsignacoesVeiculos = lazy(() => import("./pages/automotivo/ConsignacoesVeiculos"));
const TrocasVeiculos = lazy(() => import("./pages/automotivo/TrocasVeiculos"));
const TestDrives = lazy(() => import("./pages/automotivo/TestDrives"));

const PainelVarejo = lazy(() => import("./pages/varejo/PainelVarejo"));
const FornecedoresVarejo = lazy(() => import("./pages/varejo/FornecedoresVarejo"));
const ComprasVarejo = lazy(() => import("./pages/varejo/ComprasVarejo"));
const NotasEntrada = lazy(() => import("./pages/varejo/NotasEntrada"));
const OrdensServico = lazy(() => import("./pages/operative/OrdensServico"));
const ConfigOSFunis = lazy(() => import("./pages/settings/sections/os/ConfigOSFunis").then(m => ({ default: m.ConfigOSFunis })));
const OrdemServicoDetalhe = lazy(() => import("./pages/operative/OrdemServicoDetalhe"));
const BaseExames = lazy(() => import("./pages/clinica/BaseExames"));
const ComparacaoTabelas = lazy(() => import("./pages/clinica/ComparacaoTabelas"));
const ComparacaoResultado = lazy(() => import("./pages/clinica/ComparacaoResultado"));
const NotaEntradaDetalhe = lazy(() => import("./pages/varejo/NotaEntradaDetalhe"));
const PedidosVarejo = lazy(() => import("./pages/varejo/PedidosVarejo"));

const ProfissionaisClinica = lazy(() => import("./pages/clinica/ProfissionaisClinica"));
const ServicosClinica = lazy(() => import("./pages/clinica/ServicosClinica"));
const PlanosTratamento = lazy(() => import("./pages/clinica/PlanosTratamento"));

const PortfolioCorretor = lazy(() => import("./pages/imobiliario/PortfolioCorretor"));
const ImovelPublico = lazy(() => import("./pages/imobiliario/ImovelPublico"));
const PropostaPublica = lazy(() => import("./pages/public/PropostaPublica"));
const ImplementacaoPublica = lazy(() => import("./pages/public/ImplementacaoPublica"));
const CatalogoPublico = lazy(() => import("./pages/public/CatalogoPublico"));
const VarejoVendas = lazy(() => import("./pages/varejo/Vendas"));
const VarejoEstoque = lazy(() => import("./pages/varejo/Estoque"));
const PainelDev = lazy(() => import("./pages/dev/PainelDev"));
const ProjetosDev = lazy(() => import("./pages/dev/Projetos"));
const SprintsDev = lazy(() => import("./pages/dev/Sprints"));
const IssuesDev = lazy(() => import("./pages/dev/Issues"));
const RepositoriosDev = lazy(() => import("./pages/dev/Repositorios"));
const AmbientesDev = lazy(() => import("./pages/dev/Ambientes"));
const ProjetoDetalhesDev = lazy(() => import("./pages/dev/ProjetoDetalhesDev"));

import { AuthProvider } from "./contexts/AuthContext";
import { DataProvider, useData } from "./contexts/DataContext";
import { LocalizationProvider } from "./contexts/LocalizationContext";
import { Toaster } from "sonner";
const InteractiveForm = lazy(() => import("./pages/common/InteractiveForm").then(m => ({ default: m.InteractiveForm })));
import { ConfirmDialogHost } from "./components/ui/confirm-dialog";
import { useBuildVersionCheck } from "./hooks/useBuildVersionCheck";

function AppContent() {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith('/app') || location.pathname.startsWith('/login');
  // /app/* já renderiza <Layout>, que monta seu próprio <Toaster> com o estilo
  // certo do S.P.Y. — montar outro aqui também duplicaria toda notificação.
  // /login não passa pelo Layout, então precisa do seu próprio.
  const isLoginRoute = location.pathname.startsWith('/login');
  const { theme } = useData();

  useEffect(() => {
    if (isAppRoute) {
      requestNotificationPermission();
    }
  }, [isAppRoute]);

  useBuildVersionCheck();

  return (
    <>
      {isLoginRoute && <Toaster theme={theme} position="bottom-right" richColors closeButton />}
      {isAppRoute && <ConfirmDialogHost />}
      <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route
          path="/lp"
          element={
            <Suspense fallback={<div className="min-h-screen bg-white" />}>
              <SPYLandingPage />
            </Suspense>
          }
        />
        <Route
          path="/privacidade"
          element={
            <Suspense fallback={<div className="min-h-screen bg-white" />}>
              <PoliticaPrivacidade />
            </Suspense>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        {/* Auto-cadastro público desativado: S.P.Y. não é mais um SaaS de self-signup —
            novos tenants passam a ser criados por quem já está autenticado (G-Tech/parceiros).
            Rota removida em vez de deixá-la quebrar silenciosamente contra o RLS da Fase 1. */}
        <Route path="/register" element={<Navigate to="/login" replace />} />

        <Route path="/app" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/app/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="leads" element={<Navigate to="/app/crm/pipeline" replace />} />
          <Route path="pipeline" element={<Navigate to="/app/crm/pipeline" replace />} />
          <Route path="clientes" element={<Navigate to="/app/crm/clientes" replace />} />
          <Route path="propostas" element={<Navigate to="/app/crm/propostas" replace />} />
          <Route path="documentos" element={<Contracts />} />
          <Route path="performance-ia" element={<PerformanceIA />} />

          {/* Módulo CRM (Núcleo Central do S.P.Y.) */}
          <Route path="crm">
            <Route index element={<Navigate to="pipeline" replace />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="radar" element={<Radar />} />
            <Route path="leads" element={<Navigate to="/app/crm/pipeline" replace />} />
            <Route path="contatos" element={<Contatos />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="empresas" element={<Empresas />} />
            <Route path="oportunidades" element={<Oportunidades />} />
            <Route path="propostas" element={<Propostas />} />
            <Route path="contratos" element={<Contracts />} />
            <Route path="implementacoes" element={<Implementacoes />} />
            <Route path="implementacoes/:id" element={<ImplementacaoDetalhe />} />
            <Route path="implementacoes/:id/relatorio" element={<ImplementacaoRelatorio />} />
            <Route path="atividades" element={<Atividades />} />
            <Route path="follow-ups" element={<FollowUps />} />
            <Route path="importacao" element={<CRMImportacao />} />
            <Route path="dashboard" element={<CommercialDashboard />} />
            <Route path="agenda" element={<AgendaCRM />} />
          </Route>

          {/* Módulo Agenda (Compartilhada entre módulos) */}
          <Route path="agenda">
            <Route index element={<Navigate to="calendario" replace />} />
            <Route path="calendario" element={<Calendario />} />
            <Route path="eventos" element={<Eventos />} />
            <Route path="disponibilidade" element={<Disponibilidade />} />
            <Route path="configuracoes" element={<AgendaConfiguracoes />} />
            <Route path="reunioes" element={<ReunioesList />} />
            <Route path="reunioes/:id" element={<ReuniaoRoom />} />
          </Route>

          {/* Operações & Tarefas */}
          <Route path="tarefas" element={<Tarefas />} />
          <Route path="produtos" element={<Produtos />} />
          <Route path="ordens-servico" element={<OrdensServico />} />
          <Route path="ordens-servico/:id" element={<OrdemServicoDetalhe />} />

          {/* Inteligência & BI */}
          <Route path="indicadores" element={<Indicadores />} />
          <Route path="relatorios" element={<RelatoriosExecutivos />} />
          <Route path="equipe" element={<RHColaboradores />} />

          {/* Comunicação & Marketing */}
          <Route path="mensageria" element={<Messaging />} />
          <Route path="automacoes" element={<MarketingAutomacoes />} />
          <Route path="marketing" element={<ProtectedRoute requireModule="marketing"><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="conteudo" replace />} />
            <Route path="conteudo" element={<MarketingConteudo />} />
            <Route path="campanhas" element={<MarketingCampanhas />} />
            <Route path="analytics" element={<MarketingAnalytics />} />
            <Route path="social" element={<MarketingSocial />} />
            <Route path="landing-pages" element={<MarketingLandingPages />} />
            <Route path="landing-pages/eempreenda" element={<EEmpreendaEditor />} />
            <Route path="formularios" element={<MarketingFormularios />} />
          </Route>

          {/* Módulo Financeiro */}
          <Route path="financeiro" element={<ProtectedRoute requireModule="financeiro"><FinanceiroLayout /></ProtectedRoute>}>
            <Route index element={<FinanceiroVisaoGeral />} />
            <Route path="dashboard" element={<FinanceiroVisaoGeral />} />
            <Route path="painel" element={<FinanceiroVisaoGeral />} />
            <Route path="visao-geral" element={<FinanceiroVisaoGeral />} />
            {/* Contas a Receber/Pagar foram unificadas em Receitas/Despesas (abas de status). */}
            <Route path="receber" element={<Navigate to="/app/financeiro/receitas" replace />} />
            <Route path="pagar" element={<Navigate to="/app/financeiro/despesas" replace />} />
            <Route path="receitas" element={<FinanceiroReceitas />} />
            <Route path="despesas" element={<FinanceiroDespesas />} />
            <Route path="fluxo-caixa" element={<FinanceiroFluxoCaixa />} />
            <Route path="transacoes" element={<FinanceiroTransacoes />} />
            <Route path="cobrancas" element={<FinanceiroCobrancas />} />
            <Route path="conciliacao" element={<FinanceiroConciliacao />} />
            <Route path="centros-custo" element={<FinanceiroCentrosCusto />} />
            {/* Reaproveita o MESMO componente já usado em Configurações
                (financeiro/categorias) — a página já existe, só não era
                alcançável de dentro do módulo Financeiro (ficava escondida em
                Configurações). Evita ter duas implementações da mesma coisa. */}
            <Route path="plano-contas" element={<ConfigFinanceiroCategorias />} />
            <Route path="orcamentos" element={<FinanceiroOrcamentos />} />
            <Route path="bancos" element={<FinanceiroContasBancarias />} />
            <Route path="transferencias" element={<FinanceiroTransferencias />} />
            <Route path="dre" element={<FinanceiroDRE />} />
            <Route path="inadimplencia" element={<FinanceiroInadimplencia />} />
            <Route path="mrr" element={<FinanceiroMRR />} />
            <Route path="projecao" element={<FinanceiroProjecao />} />
            <Route path="relatorios" element={<FinanceiroRelatorios />} />
            <Route path="relatorios/extrato" element={<FinanceiroExtrato />} />
            <Route path="relatorios/performance-mensal" element={<FinanceiroPerformanceMensal />} />
            <Route path="relatorios/performance-anual" element={<FinanceiroPerformanceAnual />} />
            <Route path="relatorios/:slug" element={<FinanceiroRelatorioAgrupado />} />
            <Route path="busca" element={<FinanceiroBuscaGlobal />} />
            <Route path="importar" element={<FinanceiroImportarMovimentacoes />} />
            <Route path="contatos" element={<FinanceiroContatos />} />
            <Route path="indicacoes" element={<Indicacoes />} />
            <Route path="faturas" element={<Contracts />} />
            <Route path="categorias" element={<SettingsGenericForm />} />
            <Route path="*" element={<GenericPlaceholder />} />
          </Route>

          {/* Verticais de Nicho: Imobiliário */}
          <Route path="imobiliario" element={<ProtectedRoute requireModule="imobiliaria"><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ImobiliarioPainel />} />
            <Route path="painel" element={<ImobiliarioPainel />} />
            <Route path="imoveis" element={<ImobiliariosImoveis />} />
            <Route path="proprietarios" element={<Proprietarios />} />
            <Route path="captacoes" element={<Captacoes />} />
            <Route path="empreendimentos" element={<Empreendimentos />} />
            <Route path="corretores" element={<ImobiliariosCorretores />} />
            <Route path="visitas" element={<ImobiliariosVisitas />} />
            <Route path="comissoes" element={<ProtectedRoute requireTenantAdmin><ImobiliarioComissoes /></ProtectedRoute>} />
            <Route path="veiculos" element={<Navigate to="/app/automotivo/veiculos" replace />} />
            <Route path="pipeline" element={<Navigate to="/app/crm/pipeline?nicho=imobiliario" replace />} />
            <Route path="leads" element={<Navigate to="/app/crm/pipeline?nicho=imobiliario" replace />} />
          </Route>

          {/* Verticais de Nicho: Energia Solar */}
          <Route path="energia-solar" element={<ProtectedRoute requireModule="solar"><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<PainelSolar />} />
            <Route path="painel" element={<PainelSolar />} />
            <Route path="projetos" element={<ProjetosSolar />} />
            <Route path="dimensionamentos" element={<AnaliseFatura />} />
            <Route path="analise-fatura" element={<AnaliseFatura />} />
            <Route path="vistorias" element={<VistoriasSolar />} />
            <Route path="instalacoes" element={<InstalacoesSolar />} />
            <Route path="homologacoes" element={<HomologacoesSolar />} />
            <Route path="manutencoes" element={<ManutencoesSolar />} />
          </Route>
          {/* Alias legado /solar */}
          <Route path="solar" element={<ProtectedRoute requireModule="solar"><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="/app/energia-solar/dashboard" replace />} />
            <Route path="dashboard" element={<PainelSolar />} />
            <Route path="painel" element={<PainelSolar />} />
            <Route path="projetos" element={<ProjetosSolar />} />
            <Route path="dimensionamentos" element={<AnaliseFatura />} />
            <Route path="analise-fatura" element={<AnaliseFatura />} />
            <Route path="vistorias" element={<VistoriasSolar />} />
            <Route path="instalacoes" element={<InstalacoesSolar />} />
            <Route path="homologacoes" element={<HomologacoesSolar />} />
            <Route path="manutencoes" element={<ManutencoesSolar />} />
          </Route>

          {/* Verticais de Nicho: Automotivo */}
          <Route path="automotivo" element={<ProtectedRoute requireModule="automotivo"><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<PainelAutomotivo />} />
            <Route path="painel" element={<PainelAutomotivo />} />
            <Route path="veiculos" element={<ImobiliariosVeiculos />} />
            <Route path="captacoes" element={<Captacoes />} />
            <Route path="avaliacoes" element={<AvaliacoesVeiculos />} />
            <Route path="consignacoes" element={<ConsignacoesVeiculos />} />
            <Route path="trocas" element={<TrocasVeiculos />} />
            <Route path="test-drives" element={<TestDrives />} />
            <Route path="corretores" element={<ImobiliariosCorretores />} />
            <Route path="visitas" element={<ImobiliariosVisitas />} />
          </Route>
          {/* Alias legado /concessionaria */}
          <Route path="concessionaria" element={<ProtectedRoute requireModule="automotivo"><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="/app/automotivo/dashboard" replace />} />
            <Route path="dashboard" element={<PainelAutomotivo />} />
            <Route path="painel" element={<PainelAutomotivo />} />
            <Route path="veiculos" element={<ImobiliariosVeiculos />} />
            <Route path="captacoes" element={<Captacoes />} />
            <Route path="avaliacoes" element={<AvaliacoesVeiculos />} />
            <Route path="consignacoes" element={<ConsignacoesVeiculos />} />
            <Route path="trocas" element={<TrocasVeiculos />} />
            <Route path="test-drives" element={<TestDrives />} />
            <Route path="corretores" element={<ImobiliariosCorretores />} />
            <Route path="visitas" element={<ImobiliariosVisitas />} />
          </Route>

          {/* Verticais de Nicho: Varejo */}
          <Route path="varejo" element={<ProtectedRoute requireModule="varejo"><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<PainelVarejo />} />
            <Route path="painel" element={<PainelVarejo />} />
            <Route path="vendas" element={<VarejoVendas />} />
            <Route path="pedidos" element={<PedidosVarejo />} />
            <Route path="estoque" element={<VarejoEstoque />} />
            <Route path="compras" element={<ComprasVarejo />} />
            <Route path="notas-entrada" element={<NotasEntrada />} />
            <Route path="notas-entrada/:id" element={<NotaEntradaDetalhe />} />
            <Route path="fornecedores" element={<FornecedoresVarejo />} />
          </Route>

          {/* Verticais de Nicho: Clínicas */}
          <Route path="clinicas" element={<ProtectedRoute requireModule="clinica"><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<PainelGeral />} />
            <Route path="painel" element={<PainelGeral />} />
            <Route path="agenda" element={<AgendaMedica />} />
            <Route path="profissionais" element={<ProfissionaisClinica />} />
            <Route path="servicos" element={<ServicosClinica />} />
            <Route path="tratamentos" element={<PlanosTratamento />} />
            <Route path="pacientes" element={<Pacientes />} />
            <Route path="prontuarios" element={<ProtectedRoute requireModule="clinica"><Prontuarios /></ProtectedRoute>} />
            <Route path="faturamento" element={<Faturamento />} />
            <Route path="estoque" element={<Estoque />} />
            <Route path="telemedicina" element={<Telemedicina />} />
            <Route path="exames" element={<Exames />} />
            <Route path="base-exames" element={<BaseExames />} />
            <Route path="comparacao-tabelas" element={<ComparacaoTabelas />} />
            <Route path="comparacao-tabelas/:id" element={<ComparacaoResultado />} />
            <Route path="bi" element={<EstatisticasClinicas />} />
          </Route>
          {/* Alias legado /clinica */}
          <Route path="clinica" element={<ProtectedRoute requireModule="clinica"><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="/app/clinicas/dashboard" replace />} />
            <Route path="dashboard" element={<PainelGeral />} />
            <Route path="painel" element={<PainelGeral />} />
            <Route path="agenda" element={<AgendaMedica />} />
            <Route path="profissionais" element={<ProfissionaisClinica />} />
            <Route path="servicos" element={<ServicosClinica />} />
            <Route path="tratamentos" element={<PlanosTratamento />} />
            <Route path="pacientes" element={<Pacientes />} />
            <Route path="prontuarios" element={<ProtectedRoute requireModule="clinica"><Prontuarios /></ProtectedRoute>} />
            <Route path="faturamento" element={<Faturamento />} />
            <Route path="estoque" element={<Estoque />} />
            <Route path="telemedicina" element={<Telemedicina />} />
            <Route path="exames" element={<Exames />} />
            <Route path="bi" element={<EstatisticasClinicas />} />
          </Route>

          {/* Verticais de Nicho: Educação */}
          <Route path="educacao" element={<ProtectedRoute requireModule="educacao"><Outlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<PainelGeralEdu />} />
            <Route path="painel" element={<PainelGeralEdu />} />
            <Route path="turmas" element={<EducationTurmas />} />
            <Route path="alunos" element={<AlunosEdu />} />
            <Route path="conteudo" element={<EducationConteudo />} />
            <Route path="certificados" element={<EducationCertificados />} />
            <Route path="mensalidades" element={<ProtectedRoute requireModule="educacao"><EducationMensalidades /></ProtectedRoute>} />
          </Route>

          {/* Configurações Layout & Nested Routes */}
          <Route path="configuracoes" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/app/configuracoes/usuario/perfil" />} />
            <Route path="usuario/perfil" element={<ConfigPerfilUsuario />} />
            <Route path="usuario/preferencias" element={<ConfigPreferenciasSistema />} />
            <Route path="usuario/notificacoes" element={<ConfigNotificacoesPreferencias />} />
            <Route path="empresa/dados" element={<ConfigEmpresaDados />} />
            <Route path="empresa/plano" element={<ConfigPlanoUso />} />
            <Route path="empresa/lgpd" element={<ProtectedRoute requireTenantAdmin><ConfigLGPD /></ProtectedRoute>} />
            <Route path="empresa/modulos" element={<Navigate to="/app/admin?tab=tenants" replace />} />
            <Route path="empresa/filiais" element={<ConfigEmpresaFiliais />} />
            <Route path="empresa/nichos" element={<ConfigNichos />} />
            <Route path="empresa/equipe" element={<ProtectedRoute requireTenantAdmin><ConfigEmpresaEquipe /></ProtectedRoute>} />
            <Route path="empresa/permissoes" element={<ProtectedRoute requireTenantAdmin><ConfigEmpresaPermissoes /></ProtectedRoute>} />
            <Route path="empresa/cargos" element={<ProtectedRoute requireTenantAdmin><ConfigEmpresaCargos /></ProtectedRoute>} />

            <Route path="crm/funis" element={<ConfigCRMFunis />} />
            <Route path="crm/origens" element={<ConfigCRMOrigens />} />
            <Route path="crm/produtos" element={<ConfigCRMProdutos />} />
            <Route path="crm/campos" element={<ConfigCRMCampos />} />
            <Route path="crm/sla" element={<ConfigCRMSLA />} />
            <Route path="crm/gatilhos-ia" element={<ConfigCRMGatilhosIA />} />
            <Route path="crm/rodizio" element={<ConfigRodizioLeads />} />

            <Route path="produtividade/categorias" element={<ConfigProdutividadeCategorias />} />
            <Route path="kanbans" element={<ConfigKanbanBoards />} />
            <Route path="os/funis" element={<ConfigOSFunis />} />

            <Route path="financeiro/categorias" element={<ConfigFinanceiroCategorias />} />
            <Route path="financeiro/squads" element={<ProtectedRoute requireTenantAdmin><ConfigFinanceiroSquads /></ProtectedRoute>} />
            <Route path="financeiro/bloqueio-periodo" element={<ProtectedRoute requireTenantAdmin><ConfigFinanceiroBloqueioPeriodo /></ProtectedRoute>} />
            <Route path="financeiro/auditoria" element={<ProtectedRoute requireTenantAdmin><ConfigFinanceiroAuditoria /></ProtectedRoute>} />

            <Route path="engajamento/modelos" element={<ConfigEngajamentoModelos />} />
            <Route path="engajamento/automacoes" element={<ConfigEngajamentoAutomacoes />} />

            <Route path="integracoes/apps" element={<ConfigIntegracoesApps />} />
            <Route path="integracoes/smtp" element={<ConfigIntegracoesSMTP />} />
            <Route path="integracoes/webhooks" element={<ConfigIntegracoesWebhooks />} />
            <Route path="integracoes/sdr-webhooks" element={<ConfigIntegracoesSDR />} />
            <Route path="integracoes/conexoes" element={<ConfigConexoes />} />
            <Route path="integracoes/conectores-externos" element={<ConfigConectoresExternos />} />
            <Route path="integracoes/links-dinamicos" element={<ConfigLinksDinamicos />} />

            <Route path="sistema/backups" element={<ConfigSistemaBackups />} />
            <Route path="sistema/aurora" element={<ProtectedRoute requireTenantAdmin><ConfigSistemaAuroraUso /></ProtectedRoute>} />
            <Route path="sistema/treinamento" element={<ProtectedRoute requireMaster><ConfigSistemaTreinamento /></ProtectedRoute>} />
            <Route path="sistema/conhecimento" element={<Navigate to="/app/configuracoes/sistema/treinamento" replace />} />
            <Route path="sistema/aprendizados" element={<Navigate to="/app/configuracoes/sistema/treinamento" replace />} />
            {/* Páginas "Aurora" e "Aurora — Consumo & Agentes" foram unificadas em uma só
                (sistema/aurora) — redirect pra quem tiver o link antigo salvo. */}
            <Route path="ia/aurora" element={<Navigate to="/app/configuracoes/sistema/aurora" replace />} />

            <Route path="*" element={<SettingsGenericForm />} />
          </Route>

          {/* Dev & Tecnologia */}
          <Route path="dev">
            <Route index element={<Navigate to="painel" replace />} />
            <Route path="painel" element={<PainelDev />} />
            <Route path="projetos" element={<ProjetosDev />} />
            <Route path="sprints" element={<SprintsDev />} />
            <Route path="issues" element={<IssuesDev />} />
            <Route path="repositorios" element={<RepositoriosDev />} />
            <Route path="ambientes" element={<AmbientesDev />} />
            <Route path="projetos/:projectId" element={<ProjetoDetalhesDev />} />
          </Route>

          <Route path="reunioes">
            <Route index element={<ReunioesList />} />
            <Route path=":id" element={<ReuniaoRoom />} />
          </Route>

          <Route path="admin" element={<ProtectedRoute requireMaster><AdminSaaS /></ProtectedRoute>} />
          <Route path="parceiros" element={<ProtectedRoute requirePartner><PartnersOverview /></ProtectedRoute>} />
        </Route>

        {/* Portfólio público do corretor — sem autenticação */}
        <Route path="/corretor/:slug" element={<PortfolioCorretor />} />

        {/* Anúncio público de imóvel — sem autenticação */}
        <Route path="/imovel/:id" element={<ImovelPublico />} />

        {/* Catálogo público de produtos (Varejo) — sem autenticação */}
        <Route path="/catalogo/:tenantId" element={<CatalogoPublico />} />

        {/* Proposta pública com tracking — sem autenticação, acesso só via token */}
        <Route path="/proposta/:token" element={<PropostaPublica />} />
        <Route path="/implantacao/:token" element={<ImplementacaoPublica />} />

        {/* Marketing/Capture Forms Hub */}
        <Route path="/f/:niche" element={<InteractiveForm />} />

      </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LocalizationProvider>
        <DataProvider>
          <Router>
            <AppContent />
          </Router>
        </DataProvider>
      </LocalizationProvider>
    </AuthProvider>
  );
}
