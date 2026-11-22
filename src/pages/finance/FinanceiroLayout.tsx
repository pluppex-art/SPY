import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Inbox,
  FileText,
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
  Clock,
  MessageCircle,
  Gift,
  HandCoins,
  Plane,
  PiggyBank,
  BadgePercent,
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
    { title: "Notas fiscais (NFS-e)", path: "/app/financeiro/notas-fiscais", icon: FileText },
    { title: "Modelos de recibo", path: "/app/financeiro/modelos-recibo", icon: FileText },
    { title: "Promessas de Pagamento", path: "/app/financeiro/promessas", icon: Clock },
    { title: "Histórico de Cobranças", path: "/app/financeiro/historico-cobrancas", icon: MessageCircle },
    { title: "Patrocínios", path: "/app/financeiro/patrocinios", icon: Gift },
    { title: "Inadimplência", path: "/app/financeiro/inadimplencia", icon: AlertTriangle },
    { title: "MRR & Receita Recorrente", path: "/app/financeiro/mrr", icon: Repeat2 },
  ];
  if (has("educacao")) entradas.splice(1, 0, { title: "Mensalidades de Alunos", path: "/app/educacao/mensalidades", icon: GraduationCap });
  if (has("clinica")) entradas.splice(1, 0, { title: "Faturamento da Clínica", path: "/app/clinica/faturamento", icon: Stethoscope });

  // Folha e comissões ficam no próprio Financeiro (antes o item de equipe levava para o RH).
  const pessoas: SectionNavItem[] = [
    { title: "Funcionários e Salários", path: "/app/financeiro/funcionarios", icon: Users },
    { title: "Folha de Pagamento", path: "/app/financeiro/folha", icon: Wallet },
    { title: "Adiantamentos", path: "/app/financeiro/adiantamentos", icon: HandCoins },
    { title: "Acordos e Permutas", path: "/app/financeiro/acordos", icon: Handshake },
    { title: "Comissões de Vendedores", path: "/app/financeiro/comissoes", icon: BadgePercent },
    { title: "Indicações e Parcerias", path: "/app/financeiro/indicacoes", icon: Gift },
  ];

  return [
    {
      title: "Painel e Relatórios",
      icon: LayoutDashboard,
      items: [
        { title: "Painel Geral", path: "/app/financeiro/dashboard", icon: LayoutDashboard },
        { title: "Análise detalhada", path: "/app/financeiro/visao-geral", icon: BarChart3 },
        { title: "Central de Resumo", path: "/app/financeiro/resumo", icon: ClipboardList },
        { title: "Agenda Financeira", path: "/app/financeiro/agenda", icon: CalendarDays },
        { title: "Busca Financeira", path: "/app/financeiro/busca", icon: Search },
        { title: "Central de Relatórios", path: "/app/financeiro/relatorios", icon: BarChart3 },
        { title: "DRE Gerencial", path: "/app/financeiro/dre", icon: PieChart },
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
        { title: "Viagens e Eventos", path: "/app/financeiro/viagens", icon: Plane },
      ],
    },
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
        { title: "Metas e Resultados", path: "/app/financeiro/metas", icon: Target },
        { title: "Reservas Financeiras", path: "/app/financeiro/reservas", icon: PiggyBank },
      ],
    },
    { title: "Pessoas & Comercial", icon: Users, items: pessoas },
    {
      title: "Configurações",
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

// Modo "Resumo": só o essencial para quem não é do financeiro. "Avançado" mostra o menu completo.
const ESSENCIAIS_RESUMO = [
  "/app/financeiro/dashboard",
  "/app/financeiro/receitas",
  "/app/financeiro/despesas",
  "/app/financeiro/fluxo-caixa",
  "/app/financeiro/bancos",
  "/app/financeiro/dre",
  "/app/financeiro/resumo",
];
const MODO_KEY = "spy_financeiro_modo_menu";

export default function FinanceiroLayout() {
  const location = useLocation();
  const [novaOperacaoOpen, setNovaOperacaoOpen] = useState(false);
  const { ensureNicheModulesLoaded } = useData();
  const { isModuleEnabled } = useAuth();
  const [modo, setModo] = useState<"resumo" | "avancado">(() => {
    try { return localStorage.getItem(MODO_KEY) === "avancado" ? "avancado" : "resumo"; } catch { return "resumo"; }
  });
  const escolherModo = (m: "resumo" | "avancado") => { setModo(m); try { localStorage.setItem(MODO_KEY, m); } catch { /* sem storage: vale só nesta sessão */ } };
  const groupsCompletos = useMemo(() => montarGrupos((m) => isModuleEnabled(m)), [isModuleEnabled]);
  const groups = useMemo(() => {
    if (modo === "avancado") return groupsCompletos;
    // Uma única lista curta, na ordem do essencial; a página aberta nunca some do menu.
    const todos = groupsCompletos.flatMap((g) => g.items);
    const atual = (p: string) => location.pathname === p || location.pathname.startsWith(p + "/");
    const itens = ESSENCIAIS_RESUMO.map((path) => todos.find((i) => i.path === path)).filter(Boolean) as SectionNavItem[];
    const aberta = todos.find((i) => atual(i.path));
    if (aberta && !itens.some((i) => i.path === aberta.path)) itens.push(aberta);
    return [{ title: "Financeiro", icon: Wallet, items: itens }];
  }, [groupsCompletos, modo, location.pathname]);
  const seletorModo = (
    <div className="flex p-0.5 rounded-[var(--radius-control)] bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)]" role="group" aria-label="Modo do menu">
      {(["resumo", "avancado"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => escolherModo(m)}
          className={`flex-1 px-2 py-1 text-[11px] font-bold rounded cursor-pointer transition-all ${modo === m ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
        >
          {m === "resumo" ? "Resumo" : "Avançado"}
        </button>
      ))}
    </div>
  );

  // Bancos/transferências/centros de custo/anexos/categorias/auditoria não
  // entram na carga inicial do app (módulo de nicho) — busca sob demanda ao
  // entrar em qualquer tela do Financeiro.
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);

  const mostrarFab = !PAGINAS_COM_BOTAO_PROPRIO.some(p => location.pathname.startsWith(p));
  // Antes buscava "recebimento" (rota inexistente), então sempre caía em "Pagar".
  const tipoPadrao = /receb|receita|cobranca|inadimpl|mrr/.test(location.pathname) ? "Receber" : "Pagar";

  return (
    <SectionSidebar heading="Financeiro" subheading="Gestão Financeira" groups={groups} headerExtra={seletorModo}>
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
