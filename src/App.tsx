import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { requestNotificationPermission } from "./lib/notifications";
import LandingPage from "./pages/landing/LandingPage";
// Lazy: página de marketing pública, sem nenhuma dependência do app autenticado — fica no
// próprio chunk pra quem visita /lp não baixar o bundle inteiro do CRM.
const SPYLandingPage = lazy(() => import("./pages/lp/SPYLandingPage"));
import Dashboard from "./pages/dashboard/Dashboard";
import PerformanceIA from "./pages/dashboard/PerformanceIA";
import PainelGeral from "./pages/clinica/PainelGeral";
import AgendaMedica from "./pages/clinica/AgendaMedica";
import AnaliseFatura from "./pages/solar/AnaliseFatura";
import PainelSolar from "./pages/solar/PainelSolar";
import Prontuarios from "./pages/clinica/Prontuarios";
import Faturamento from "./pages/clinica/Faturamento";
import Estoque from "./pages/clinica/Estoque";
import Telemedicina from "./pages/clinica/Telemedicina";
import Exames from "./pages/clinica/Exames";
import EstatisticasClinicas from "./pages/clinica/Estatisticas";
import Pacientes from "./pages/clinica/Pacientes";
import Login from "./pages/auth/Login";
import ResetPassword from "./pages/auth/ResetPassword";
import Layout from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Pipeline from "./pages/crm/Pipeline";
import Clientes from "./pages/crm/Clientes";
import AgendaCRM from "./pages/crm/AgendaCRM";
import Contatos from "./pages/crm/Contatos";
import Empresas from "./pages/crm/Empresas";
import Oportunidades from "./pages/crm/Oportunidades";
import Atividades from "./pages/crm/Atividades";
import FollowUps from "./pages/crm/FollowUps";
import CRMImportacao from "./pages/crm/Importacao";
import Tarefas from "./pages/operative/Tarefas";
import Produtos from "./pages/operative/Produtos";
import Indicadores from "./pages/operative/Indicadores";
import RelatoriosExecutivos from "./pages/crm/RelatoriosExecutivos";
import Contracts from "./pages/crm/Contracts";
import Implementacoes from "./pages/crm/Implementacoes";
import ImplementacaoDetalhe from "./pages/crm/ImplementacaoDetalhe";
import ImplementacaoRelatorio from "./pages/crm/ImplementacaoRelatorio";
import Messaging from "./pages/crm/Messaging";
import Automations from "./pages/marketing/Automations";
import AdminSaaS from "./pages/admin/AdminSaaS";
import PartnersOverview from "./pages/partners/PartnersOverview";

import FinanceiroLayout from "./pages/finance/FinanceiroLayout";
import FinanceiroVisaoGeral from "./pages/finance/FinanceiroVisaoGeral";
import FinanceiroReceber from "./pages/finance/FinanceiroReceber";
import FinanceiroPagar from "./pages/finance/FinanceiroPagar";
import FinanceiroReceitas from "./pages/finance/FinanceiroReceitas";
import FinanceiroDespesas from "./pages/finance/FinanceiroDespesas";
import FinanceiroFluxoCaixa from "./pages/finance/FinanceiroFluxoCaixa";
import FinanceiroTransacoes from "./pages/finance/FinanceiroTransacoes";
import FinanceiroCobrancas from "./pages/finance/FinanceiroCobrancas";
import FinanceiroConciliacao from "./pages/finance/FinanceiroConciliacao";
import FinanceiroCentrosCusto from "./pages/finance/FinanceiroCentrosCusto";
import FinanceiroOrcamentos from "./pages/finance/FinanceiroOrcamentos";
import FinanceiroDRE from "./pages/finance/FinanceiroDRE";
import FinanceiroContasBancarias from "./pages/finance/FinanceiroContasBancarias";
import FinanceiroTransferencias from "./pages/finance/FinanceiroTransferencias";
import FinanceiroInadimplencia from "./pages/finance/FinanceiroInadimplencia";
import FinanceiroMRR from "./pages/finance/FinanceiroMRR";
import FinanceiroProjecao from "./pages/finance/FinanceiroProjecao";
import FinanceiroRelatorios from "./pages/finance/FinanceiroRelatorios";
import FinanceiroRelatorioAgrupado from "./pages/finance/FinanceiroRelatorioAgrupado";
import FinanceiroExtrato from "./pages/finance/FinanceiroExtrato";
import FinanceiroPerformanceMensal from "./pages/finance/FinanceiroPerformanceMensal";
import FinanceiroPerformanceAnual from "./pages/finance/FinanceiroPerformanceAnual";
import FinanceiroBuscaGlobal from "./pages/finance/FinanceiroBuscaGlobal";
import FinanceiroImportarMovimentacoes from "./pages/finance/FinanceiroImportarMovimentacoes";
import FinanceiroContatos from "./pages/finance/FinanceiroContatos";
import Indicacoes from "./pages/finance/Indicacoes";

import Calendario from "./pages/agenda/Calendario";
import Eventos from "./pages/agenda/Eventos";
import Disponibilidade from "./pages/agenda/Disponibilidade";
import AgendaConfiguracoes from "./pages/agenda/AgendaConfiguracoes";

import SettingsLayout from "./pages/settings/SettingsLayout";
import ConfigEmpresaDados from "./pages/settings/ConfigEmpresaDados";
import {
  ConfigEmpresaFiliais,
  ConfigEmpresaEquipe,
  ConfigEmpresaPermissoes,
  ConfigEmpresaCargos,
  ConfigNichos,
  ConfigCRMFunis,
  ConfigCRMOrigens,
  ConfigCRMProdutos,
  ConfigProdutividadeCategorias,
  ConfigFinanceiroCategorias,
  ConfigEngajamentoModelos,
  ConfigEngajamentoAutomacoes,
  ConfigIntegracoesApps,
  ConfigNotificacoesPreferencias,
  ConfigPerfilUsuario,
  ConfigPreferenciasSistema,
  ConfigCRMCampos,
  ConfigCRMSLA,
  ConfigCRMGatilhosIA,
  ConfigIntegracoesSMTP,
  ConfigSistemaBackups,
  ConfigSistemaAuroraUso,
  ConfigIntegracoesSDR,
  ConfigFinanceiroSquads,
  ConfigFinanceiroBloqueioPeriodo,
  ConfigFinanceiroAuditoria,
  ConfigRodizioLeads,
  ConfigKanbanBoards
} from "./pages/settings/SettingsPages";
import { ConfigIntegracoesWebhooks } from "./pages/settings/ConfigIntegracoesWebhooks";
import { ConfigConectoresExternos } from "./pages/settings/ConfigConectoresExternos";
import { ConfigLinksDinamicos } from "./pages/settings/ConfigLinksDinamicos";
import SettingsGenericForm from "./pages/settings/SettingsGenericForm";
import GenericPlaceholder from "./pages/common/GenericPlaceholder";
import EducationTurmas from "./pages/education/Turmas";
import EducationConteudo from "./pages/education/Conteudo";
import EducationCertificados from "./pages/education/Certificados";
import EducationMensalidades from "./pages/education/Mensalidades";
import AlunosEdu from "./pages/education/Alunos";
import PainelGeralEdu from "./pages/education/PainelGeral";
import Propostas from "./pages/crm/Propostas";
import CommercialDashboard from "./pages/crm/Dashboard";
import MarketingAutomacoes from "./pages/marketing/MarketingAutomacoes";
import MarketingConteudo from "./pages/marketing/MarketingConteudo";
import MarketingCampanhas from "./pages/marketing/MarketingCampanhas";
import MarketingAnalytics from "./pages/marketing/MarketingAnalytics";
import MarketingSocial from "./pages/marketing/MarketingSocial";
import MarketingLandingPages from "./pages/marketing/MarketingLandingPages";
import EEmpreendaEditor from "./pages/marketing/EEmpreendaEditor";
import MarketingFormularios from "./pages/marketing/MarketingFormularios";
import RHColaboradores from "./pages/hr/RHColaboradores";
import ReunioesList from "./pages/reunioes/index";
import ReuniaoRoom from "./pages/reunioes/ReuniaoRoom";

import ImobiliarioPainel from "./pages/imobiliario/PainelGeral";
import ImobiliariosImoveis from "./pages/imobiliario/Imoveis";
import ImobiliariosVeiculos from "./pages/imobiliario/Veiculos";
import ImobiliariosCorretores from "./pages/imobiliario/Corretores";
import ImobiliariosVisitas from "./pages/imobiliario/Visitas";
import Proprietarios from "./pages/imobiliario/Proprietarios";
import Captacoes from "./pages/imobiliario/Captacoes";
import Empreendimentos from "./pages/imobiliario/Empreendimentos";
import ImobiliarioComissoes from "./pages/imobiliario/ImobiliarioComissoes";

import ProjetosSolar from "./pages/solar/ProjetosSolar";
import VistoriasSolar from "./pages/solar/VistoriasSolar";
import InstalacoesSolar from "./pages/solar/InstalacoesSolar";
import HomologacoesSolar from "./pages/solar/HomologacoesSolar";
import ManutencoesSolar from "./pages/solar/ManutencoesSolar";

import PainelAutomotivo from "./pages/automotivo/PainelAutomotivo";
import AvaliacoesVeiculos from "./pages/automotivo/AvaliacoesVeiculos";
import ConsignacoesVeiculos from "./pages/automotivo/ConsignacoesVeiculos";
import TrocasVeiculos from "./pages/automotivo/TrocasVeiculos";
import TestDrives from "./pages/automotivo/TestDrives";

import PainelVarejo from "./pages/varejo/PainelVarejo";
import FornecedoresVarejo from "./pages/varejo/FornecedoresVarejo";
import ComprasVarejo from "./pages/varejo/ComprasVarejo";
import NotasEntrada from "./pages/varejo/NotasEntrada";
import OrdensServico from "./pages/operative/OrdensServico";
import OrdemServicoDetalhe from "./pages/operative/OrdemServicoDetalhe";
import BaseExames from "./pages/clinica/BaseExames";
import ComparacaoTabelas from "./pages/clinica/ComparacaoTabelas";
import ComparacaoResultado from "./pages/clinica/ComparacaoResultado";
import NotaEntradaDetalhe from "./pages/varejo/NotaEntradaDetalhe";
import PedidosVarejo from "./pages/varejo/PedidosVarejo";

import ProfissionaisClinica from "./pages/clinica/ProfissionaisClinica";
import ServicosClinica from "./pages/clinica/ServicosClinica";
import PlanosTratamento from "./pages/clinica/PlanosTratamento";

import PortfolioCorretor from "./pages/imobiliario/PortfolioCorretor";
import ImovelPublico from "./pages/imobiliario/ImovelPublico";
import PropostaPublica from "./pages/public/PropostaPublica";
import ImplementacaoPublica from "./pages/public/ImplementacaoPublica";
import CatalogoPublico from "./pages/public/CatalogoPublico";
import VarejoVendas from "./pages/varejo/Vendas";
import VarejoEstoque from "./pages/varejo/Estoque";
import PainelDev from "./pages/dev/PainelDev";
import ProjetosDev from "./pages/dev/Projetos";
import SprintsDev from "./pages/dev/Sprints";
import IssuesDev from "./pages/dev/Issues";
import RepositoriosDev from "./pages/dev/Repositorios";
import AmbientesDev from "./pages/dev/Ambientes";
import ProjetoDetalhesDev from "./pages/dev/ProjetoDetalhesDev";

import { AuthProvider } from "./contexts/AuthContext";
import { DataProvider, useData } from "./contexts/DataContext";
import { LocalizationProvider } from "./contexts/LocalizationContext";
import { Toaster } from "sonner";
import { InteractiveForm } from "./pages/common/InteractiveForm";
import { ConfirmDialogHost } from "./components/ui/confirm-dialog";

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

  return (
    <>
      {isLoginRoute && <Toaster theme={theme} position="bottom-right" richColors closeButton />}
      {isAppRoute && <ConfirmDialogHost />}
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
            <Route path="receber" element={<FinanceiroReceber />} />
            <Route path="pagar" element={<FinanceiroPagar />} />
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
            <Route path="integracoes/conectores-externos" element={<ConfigConectoresExternos />} />
            <Route path="integracoes/links-dinamicos" element={<ConfigLinksDinamicos />} />

            <Route path="sistema/backups" element={<ConfigSistemaBackups />} />
            <Route path="sistema/aurora" element={<ProtectedRoute requireTenantAdmin><ConfigSistemaAuroraUso /></ProtectedRoute>} />
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
