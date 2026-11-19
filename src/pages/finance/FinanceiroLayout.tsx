import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Inbox,
  TrendingUp,
  Wallet,
  TrendingDown,
  Landmark,
  Waves,
  RefreshCw,
  CreditCard,
  Repeat,
  Target,
  FolderTree,
  Users,
  PieChart,
  Handshake,
  BarChart3,
  Repeat2,
  LineChart,
  Receipt,
  AlertTriangle,
  Search,
  Upload,
  Plus,
  Tag,
  ClipboardList,
  CalendarDays,
  ShoppingCart,
  GraduationCap,
  Stethoscope,
} from "lucide-react";
import { SectionSidebar, type SectionNavGroup, type SectionNavItem } from "../../components/layout/SectionSidebar";
import { NovaOperacaoModal } from "./components/NovaOperacaoModal";
import { FinanceiroFilterProvider } from "./FinanceiroFilterContext";

/**
 * Menu do Financeiro — o mesmo para toda empresa, organizado por assunto.
 * Os grupos "do negócio" (mensalidades de alunos, faturamento de clínica,
 * equipe, comissões) só aparecem quando o cliente tem o módulo correspondente.
 */
function montarGrupos(has: (m: any) => boolean): SectionNavGroup[] {
  const entradas: SectionNavItem[] = [
    { title: "Receitas (a receber)", path: "/app/financeiro/receitas", icon: Inbox },
    { title: "Contratos & Faturas", path: "/app/financeiro/faturas", icon: Receipt },
    { title: "Cobranças", path: "/app/financeiro/cobrancas", icon: Receipt },
    { title: "Inadimplência", path: "/app/financeiro/inadimplencia", icon: AlertTriangle },
    { title: "MRR & Receita Recorrente", path: "/app/financeiro/mrr", icon: Repeat2 },
  ];
  if (has("educacao")) entradas.splice(1, 0, { title: "Mensalidades de Alunos", path: "/app/educacao/mensalidades", icon: GraduationCap });
  if (has("clinica")) entradas.splice(1, 0, { title: "Faturamento da Clínica", path: "/app/clinica/faturamento", icon: Stethoscope });

  const pessoas: SectionNavItem[] = [];
  if (has("rh")) pessoas.push({ title: "Equipe & Folha", path: "/app/equipe", icon: Users });
  if (has("crm")) pessoas.push({ title: "Comissões & Vendedores", path: "/app/financeiro/indicacoes", icon: Handshake });
  else pessoas.push({ title: "Indicações & Parcerias", path: "/app/financeiro/indicacoes", icon: Handshake });

  return [
    {
      title: "Painel Geral",
      icon: LayoutDashboard,
      items: [
        { title: "Painel Financeiro", path: "/app/financeiro/dashboard", icon: LayoutDashboard },
        { title: "Central de Resumo", path: "/app/financeiro/resumo", icon: ClipboardList },
        { title: "Agenda Financeira", path: "/app/financeiro/agenda", icon: CalendarDays },
        { title: "Busca Financeira", path: "/app/financeiro/busca", icon: Search },
      ],
    },
    { title: "Entradas", icon: Inbox, items: entradas },
    {
      title: "Custos e Despesas",
      icon: TrendingDown,
      items: [
        { title: "Despesas (a pagar)", path: "/app/financeiro/despesas", icon: TrendingDown },
        { title: "Compras e Parcelas", path: "/app/financeiro/compras", icon: ShoppingCart },
        { title: "Centros de Custo", path: "/app/financeiro/centros-custo", icon: Target },
        { title: "Orçamentos", path: "/app/financeiro/orcamentos", icon: Target },
      ],
    },
    { title: "Pessoas & Comercial", icon: Users, items: pessoas },
    {
      title: "Financeiro Geral",
      icon: Landmark,
      items: [
        { title: "Todas as Movimentações", path: "/app/financeiro/transacoes", icon: ArrowLeftRight },
        { title: "Fluxo de Caixa", path: "/app/financeiro/fluxo-caixa", icon: Waves },
        { title: "Projeção de Caixa", path: "/app/financeiro/projecao", icon: LineChart },
        { title: "Bancos e Conciliação", path: "/app/financeiro/conciliacao", icon: RefreshCw },
        { title: "Contas Bancárias", path: "/app/financeiro/bancos", icon: CreditCard },
        { title: "Transferências entre Contas", path: "/app/financeiro/transferencias", icon: Repeat },
      ],
    },
    {
      title: "Relatórios",
      icon: PieChart,
      items: [
        { title: "Central de Relatórios", path: "/app/financeiro/relatorios", icon: BarChart3 },
        { title: "DRE Gerencial", path: "/app/financeiro/dre", icon: PieChart },
      ],
    },
    {
      title: "Cadastros",
      icon: FolderTree,
      items: [
        { title: "Clientes & Fornecedores", path: "/app/financeiro/contatos", icon: Users },
        { title: "Plano de Contas", path: "/app/financeiro/plano-contas", icon: FolderTree },
        { title: "Tags", path: "/app/financeiro/tags", icon: Tag },
        { title: "Importar Movimentações", path: "/app/financeiro/importar", icon: Upload },
      ],
    },
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
  "/app/financeiro/busca",
  "/app/financeiro/transacoes",
  "/app/financeiro/resumo",
  "/app/financeiro/agenda",
  "/app/financeiro/compras",
];

export default function FinanceiroLayout() {
  const location = useLocation();
  const [novaOperacaoOpen, setNovaOperacaoOpen] = useState(false);
  const { ensureNicheModulesLoaded } = useData();
  const { isModuleEnabled } = useAuth();
  const groups = useMemo(() => montarGrupos((m) => isModuleEnabled(m)), [isModuleEnabled]);

  // Bancos/transferências/centros de custo/anexos/categorias/auditoria não
  // entram na carga inicial do app (módulo de nicho) — busca sob demanda ao
  // entrar em qualquer tela do Financeiro.
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);

  const mostrarFab = !PAGINAS_COM_BOTAO_PROPRIO.some(p => location.pathname.startsWith(p));
  // Antes buscava "recebimento" (rota inexistente), então sempre caía em "Pagar".
  const tipoPadrao = /receb|receita|cobranca|inadimpl|mrr/.test(location.pathname) ? "Receber" : "Pagar";

  return (
    <SectionSidebar heading="Financeiro" subheading="Gestão Financeira" groups={groups}>
      <FinanceiroFilterProvider>
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
    </SectionSidebar>
  );
}
