import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Inbox,
  FileText,
  TrendingDown,
  Landmark,
  Target,
  FolderTree,
  Users,
  PieChart,
  Handshake,
  Plus,
  GraduationCap,
  Stethoscope,
  PiggyBank,
} from "lucide-react";
import { SectionSidebar, type SectionNavGroup, type SectionNavItem } from "../../components/layout/SectionSidebar";
import { NovaOperacaoModal } from "./components/NovaOperacaoModal";
import { FinanceiroFilterProvider } from "./FinanceiroFilterContext";
import { useModoMenuFinanceiro } from "./financeiroMenu";

/**
 * Menu do Financeiro — o mesmo para toda empresa, organizado por assunto.
 * Os grupos "do negócio" (mensalidades de alunos, faturamento de clínica,
 * equipe, comissões) só aparecem quando o cliente tem o módulo correspondente.
 */
// Telas parecidas viram UMA entrada no menu, com abas no topo da página.
type Aba = { label: string; path: string };
type GrupoAbas = { title: string; icon: SectionNavItem["icon"]; abas: Aba[] };
const B = "/app/financeiro";
const G = {
  painel: { title: "Painel Geral", icon: LayoutDashboard, abas: [
    { label: "Painel", path: `${B}/dashboard` }, { label: "Análise detalhada", path: `${B}/visao-geral` },
    { label: "Central de Resumo", path: `${B}/resumo` }, { label: "Agenda", path: `${B}/agenda` }, { label: "Busca", path: `${B}/busca` },
  ] },
  relatorios: { title: "Relatórios e DRE", icon: PieChart, abas: [
    { label: "Central de Relatórios", path: `${B}/relatorios` }, { label: "DRE Gerencial", path: `${B}/dre` },
  ] },
  receitas: { title: "Receitas e Cobranças", icon: Inbox, abas: [
    { label: "A receber", path: `${B}/receitas` }, { label: "Contratos e Faturas", path: `${B}/faturas` }, { label: "Cobranças", path: `${B}/cobrancas` },
    { label: "Promessas", path: `${B}/promessas` }, { label: "Histórico", path: `${B}/historico-cobrancas` },
    { label: "Inadimplência", path: `${B}/inadimplencia` }, { label: "MRR", path: `${B}/mrr` },
  ] },
  notas: { title: "Notas e Recibos", icon: FileText, abas: [
    { label: "Notas fiscais (NFS-e)", path: `${B}/notas-fiscais` }, { label: "Modelos de recibo", path: `${B}/modelos-recibo` },
  ] },
  despesas: { title: "Despesas e Compras", icon: TrendingDown, abas: [
    { label: "A pagar", path: `${B}/despesas` }, { label: "Compras e Parcelas", path: `${B}/compras` }, { label: "Viagens e Eventos", path: `${B}/viagens` },
  ] },
  orcamento: { title: "Centros de Custo e Orçamento", icon: Target, abas: [
    { label: "Centros de Custo", path: `${B}/centros-custo` }, { label: "Orçamentos", path: `${B}/orcamentos` },
  ] },
  movimentacoes: { title: "Movimentações e Caixa", icon: ArrowLeftRight, abas: [
    { label: "Todas", path: `${B}/transacoes` }, { label: "Fluxo de Caixa", path: `${B}/fluxo-caixa` },
    { label: "Projeção", path: `${B}/projecao` }, { label: "Transferências", path: `${B}/transferencias` },
  ] },
  bancos: { title: "Bancos e Conciliação", icon: Landmark, abas: [
    { label: "Contas Bancárias", path: `${B}/bancos` }, { label: "Conciliação", path: `${B}/conciliacao` },
  ] },
  metas: { title: "Metas e Reservas", icon: PiggyBank, abas: [
    { label: "Metas", path: `${B}/metas` }, { label: "Reservas", path: `${B}/reservas` },
  ] },
  equipe: { title: "Equipe e Comissões", icon: Users, abas: [
    { label: "Funcionários", path: `${B}/funcionarios` }, { label: "Folha", path: `${B}/folha` }, { label: "Adiantamentos", path: `${B}/adiantamentos` },
    { label: "Comissões", path: `${B}/comissoes` }, { label: "Indicações", path: `${B}/indicacoes` },
  ] },
  acordos: { title: "Acordos e Patrocínios", icon: Handshake, abas: [
    { label: "Acordos e Permutas", path: `${B}/acordos` }, { label: "Patrocínios", path: `${B}/patrocinios` },
  ] },
  cadastros: { title: "Configurações", icon: FolderTree, abas: [
    { label: "Clientes e Fornecedores", path: `${B}/contatos` }, { label: "Plano de Contas", path: `${B}/plano-contas` },
    { label: "Tags", path: `${B}/tags` }, { label: "Importar", path: `${B}/importar` },
  ] },
} satisfies Record<string, GrupoAbas>;
const TODOS_GRUPOS: GrupoAbas[] = Object.values(G);
const grupoDaRota = (pathname: string) => TODOS_GRUPOS.find((g) => g.abas.some((a) => pathname === a.path || pathname.startsWith(a.path + "/")));

const itemDe = (g: GrupoAbas): SectionNavItem => ({ title: g.title, path: g.abas[0].path, icon: g.icon, matchPaths: g.abas.map((a) => a.path) });

function montarGrupos(has: (m: any) => boolean): SectionNavGroup[] {
  const entradas: SectionNavItem[] = [itemDe(G.receitas), itemDe(G.notas), itemDe(G.acordos)];
  if (has("educacao")) entradas.splice(1, 0, { title: "Mensalidades de Alunos", path: "/app/educacao/mensalidades", icon: GraduationCap });
  if (has("clinica")) entradas.splice(1, 0, { title: "Faturamento da Clínica", path: "/app/clinica/faturamento", icon: Stethoscope });
  return [
    { title: "Painel e Relatórios", icon: LayoutDashboard, items: [itemDe(G.painel), itemDe(G.relatorios)] },
    { title: "Entradas", icon: Inbox, items: entradas },
    { title: "Custos e Despesas", icon: TrendingDown, items: [itemDe(G.despesas), itemDe(G.orcamento)] },
    { title: "Caixa e Bancos", icon: Landmark, items: [itemDe(G.movimentacoes), itemDe(G.bancos), itemDe(G.metas)] },
    { title: "Pessoas", icon: Users, items: [itemDe(G.equipe)] },
    { title: "Configurações", icon: FolderTree, items: [itemDe(G.cadastros)] },
  ];
}

// Páginas que já têm seu próprio botão de lançamento (GenericFinanceiroList
// ou fluxo de criação dedicado) não ganham o FAB global — evitaria dois
// botões de "+" fazendo coisas parecidas na mesma tela.
const PAGINAS_COM_BOTAO_PROPRIO = [
  "/app/financeiro/receber",
  "/app/financeiro/pagar",
  "/app/financeiro/receitas",
  "/app/financeiro/despesas",
  "/app/financeiro/bancos",
  "/app/financeiro/transferencias",
  "/app/financeiro/centros-custo",
  "/app/financeiro/tags",
  "/app/financeiro/contatos",
  "/app/financeiro/cobrancas",
  "/app/financeiro/notas-fiscais",
  "/app/financeiro/modelos-recibo",
  "/app/financeiro/busca",
  "/app/financeiro/transacoes",
  "/app/financeiro/promessas",
  "/app/financeiro/historico-cobrancas",
  "/app/financeiro/patrocinios",
  "/app/financeiro/adiantamentos",
  "/app/financeiro/acordos",
  "/app/financeiro/viagens",
  "/app/financeiro/metas",
  "/app/financeiro/funcionarios",
  "/app/financeiro/folha",
  "/app/financeiro/comissoes",
  "/app/financeiro/reservas",
  "/app/financeiro/resumo",
  "/app/financeiro/agenda",
  "/app/financeiro/compras",
];

export default function FinanceiroLayout() {
  const location = useLocation();
  const [novaOperacaoOpen, setNovaOperacaoOpen] = useState(false);
  const { ensureNicheModulesLoaded } = useData();
  const { isModuleEnabled } = useAuth();
  const [modo] = useModoMenuFinanceiro();
  const groupsCompletos = useMemo(() => montarGrupos((m) => isModuleEnabled(m)), [isModuleEnabled]);

  // Bancos/transferências/centros de custo/anexos/categorias/auditoria não
  // entram na carga inicial do app (módulo de nicho) — busca sob demanda ao
  // entrar em qualquer tela do Financeiro.
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);

  const abasDaRota = grupoDaRota(location.pathname);
  const mostrarFab = !PAGINAS_COM_BOTAO_PROPRIO.some(p => location.pathname.startsWith(p));
  // Antes buscava "recebimento" (rota inexistente), então sempre caía em "Pagar".
  const tipoPadrao = /receb|receita|cobranca|inadimpl|mrr/.test(location.pathname) ? "Receber" : "Pagar";

  const conteudo = (
    <>
      <FinanceiroFilterProvider>
        {abasDaRota && abasDaRota.abas.length > 1 && (
          <nav aria-label={abasDaRota.title} className="flex gap-1 overflow-x-auto mb-4 pb-1 border-b border-[var(--color-border-subtle)] print:hidden">
            {abasDaRota.abas.map((a) => {
              const ativa = location.pathname === a.path || location.pathname.startsWith(a.path + "/");
              return (
                <Link key={a.path} to={a.path} className={`px-3 py-2 text-xs font-bold whitespace-nowrap rounded-t-[var(--radius-control)] no-underline border-b-2 -mb-px ${ativa ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>{a.label}</Link>
              );
            })}
          </nav>
        )}
        <Outlet />
      </FinanceiroFilterProvider>

      {mostrarFab && (
        <button
          type="button"
          onClick={() => setNovaOperacaoOpen(true)}
          className="fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom))] lg:bottom-6 right-4 md:right-6 z-40 h-12 w-12 rounded-full bg-[var(--color-primary-blue)] text-white shadow-lg flex items-center justify-center hover:brightness-110 active:scale-95 transition-all cursor-pointer print:hidden"
          title="Nova Operação"
        >
          <Plus className="w-5 h-5" />
        </button>
      )}

      <NovaOperacaoModal isOpen={novaOperacaoOpen} onClose={() => setNovaOperacaoOpen(false)} defaultType={tipoPadrao} />
    </>
  );

  // Resumo: a lista fica no menu lateral principal. Avançado: abre o submenu completo ao lado.
  if (modo !== "avancado") return conteudo;
  return (
    <SectionSidebar heading="Financeiro" subheading="Gestão Financeira" groups={groupsCompletos}>
      {conteudo}
    </SectionSidebar>
  );
}
