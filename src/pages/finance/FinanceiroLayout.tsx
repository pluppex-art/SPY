import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useData } from "../../contexts/DataContext";
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
} from "lucide-react";
import { SectionSidebar, type SectionNavGroup } from "../../components/layout/SectionSidebar";
import { NovaOperacaoModal } from "./components/NovaOperacaoModal";
import { FinanceiroFilterProvider } from "./FinanceiroFilterContext";

const groups: SectionNavGroup[] = [
  {
    title: "Visão Geral",
    icon: LayoutDashboard,
    items: [
      { title: "Painel Financeiro", path: "/app/financeiro/dashboard", icon: LayoutDashboard },
      { title: "Busca Financeira", path: "/app/financeiro/busca", icon: Search },
    ],
  },
  {
    title: "Movimentações",
    icon: ArrowLeftRight,
    items: [
      { title: "Todas as Movimentações", path: "/app/financeiro/transacoes", icon: ArrowLeftRight },
      { title: "Receitas", path: "/app/financeiro/receitas", icon: Inbox },
      { title: "Despesas", path: "/app/financeiro/despesas", icon: TrendingDown },
      { title: "Contratos & Faturas", path: "/app/financeiro/faturas", icon: Receipt },
    ],
  },
  {
    title: "Cobrança",
    icon: Receipt,
    items: [
      { title: "Cobranças", path: "/app/financeiro/cobrancas", icon: Receipt },
      { title: "Inadimplência", path: "/app/financeiro/inadimplencia", icon: AlertTriangle },
    ],
  },
  {
    title: "Caixa e Bancos",
    icon: Landmark,
    items: [
      { title: "Fluxo de Caixa", path: "/app/financeiro/fluxo-caixa", icon: Waves },
      { title: "Conciliação Bancária", path: "/app/financeiro/conciliacao", icon: RefreshCw },
      { title: "Contas Bancárias", path: "/app/financeiro/bancos", icon: CreditCard },
      { title: "Transferências entre Contas", path: "/app/financeiro/transferencias", icon: Repeat },
    ],
  },
  {
    title: "Gestão",
    icon: FolderTree,
    items: [
      { title: "Centros de Custo", path: "/app/financeiro/centros-custo", icon: Target },
      { title: "Tags", path: "/app/financeiro/tags", icon: Tag },
      { title: "Plano de Contas", path: "/app/financeiro/plano-contas", icon: FolderTree },
      { title: "Orçamentos", path: "/app/financeiro/orcamentos", icon: Target },
      { title: "Contatos (Clientes & Fornecedores)", path: "/app/financeiro/contatos", icon: Users },
    ],
  },
  {
    title: "Análises & Relatórios",
    icon: PieChart,
    items: [
      { title: "Central de Relatórios", path: "/app/financeiro/relatorios", icon: BarChart3 },
      { title: "DRE Gerencial", path: "/app/financeiro/dre", icon: PieChart },
      { title: "MRR & Receita Recorrente", path: "/app/financeiro/mrr", icon: Repeat2 },
      { title: "Projeção de Caixa", path: "/app/financeiro/projecao", icon: LineChart },
      { title: "Indicações & Parcerias", path: "/app/financeiro/indicacoes", icon: Handshake },
    ],
  },
  {
    title: "Importação",
    icon: Upload,
    items: [
      { title: "Importar Movimentações", path: "/app/financeiro/importar", icon: Upload },
    ],
  },
];

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
];

export default function FinanceiroLayout() {
  const location = useLocation();
  const [novaOperacaoOpen, setNovaOperacaoOpen] = useState(false);
  const { ensureNicheModulesLoaded } = useData();

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
          className="fixed bottom-20 sm:bottom-6 right-6 z-40 h-12 w-12 rounded-full bg-[var(--color-primary-blue)] text-white shadow-lg flex items-center justify-center hover:brightness-110 active:scale-95 transition-all cursor-pointer print:hidden"
          title="Nova Operação"
        >
          <Plus className="w-5 h-5" />
        </button>
      )}

      <NovaOperacaoModal isOpen={novaOperacaoOpen} onClose={() => setNovaOperacaoOpen(false)} defaultType={tipoPadrao} />
    </SectionSidebar>
  );
}
