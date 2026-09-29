import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Zap, Wrench, ChevronUp, ChevronDown,
  Receipt, Percent, DollarSign, Layers, TrendingUp, TrendingDown,
  CreditCard, Banknote, QrCode, FileText, Calendar, ArrowRightLeft,
  Repeat, CalendarClock, Info, Plus, Trash2, ShoppingCart,
  Check, Package, Pencil, Lock,
} from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { useData } from "../../../../contexts/DataContext";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { cn } from "../../../../lib/utils";
import { toast } from "sonner";
import {
  calculateSale, FREQUENCY_LABELS, cycleMonthsFor, OPEN_ENDED_BATCH_CYCLES, getSaleRealValue,
  type Frequencia, type BillingType, type DiscountType,
} from "../../../../lib/saleCalculator";

const PAYMENT_OPTIONS = [
  { id: "Pix", label: "Pix", icon: QrCode },
  { id: "Cartão de Crédito", label: "Crédito", icon: CreditCard },
  { id: "Boleto Bancário", label: "Boleto", icon: FileText },
  { id: "Cartão de Débito", label: "Débito", icon: CreditCard },
  { id: "Dinheiro", label: "Dinheiro", icon: Banknote },
  { id: "Transferência / TED", label: "TED", icon: ArrowRightLeft },
  { id: "Link de Pagamento", label: "Link Pgto.", icon: Zap },
] as const;

const RECURRING_FREQUENCIES: Frequencia[] = ["mensal", "trimestral", "semestral", "anual", "personalizado"];
const DURATION_PRESETS = [1, 3, 6, 12, 24];

const DISCOUNT_OPTIONS_RECURRING: { id: DiscountType; label: string }[] = [
  { id: "none", label: "Sem desconto" },
  { id: "first_charge", label: "Só na 1ª cobrança" },
  { id: "recurring", label: "Em todo ciclo" },
  { id: "total", label: "Total do contrato" },
  { id: "percentage", label: "Percentual (%)" },
];
const DISCOUNT_OPTIONS_ONE_TIME: { id: DiscountType; label: string }[] = [
  { id: "none", label: "Sem desconto" },
  { id: "total", label: "Valor fixo (R$)" },
  { id: "percentage", label: "Percentual (%)" },
];

interface AddProdutoLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableProducts: any[];
  leadId?: string;
  leadName?: string;
  companyName?: string;
  seller?: string;
  /** Pré-seleciona o produto ao abrir (clique num item da lista na aba Produtos). */
  initialProductId?: string;
  /** Modo "editar proposta": os produtos escolhidos entram como itens DESTA proposta já
   * existente (nunca cria uma segunda proposta pro mesmo lead). */
  existingProposal?: { id: string; titulo?: string; status?: string; valor?: number } | null;
  /** Itens que já estão na proposta existente (só exibição, pra ver o que já foi vendido). */
  existingItems?: any[];
  /** Chamado depois que a venda é fechada com sucesso, pra quem chamou registrar no
   * histórico de alterações do lead (setAlterationLogs) sem esse modal precisar saber
   * desse detalhe. */
  onDone?: (summary: string) => void;
}

/** Um produto já "confirmado" nesta venda — snapshot congelado do que estava configurado
 * no formulário no momento em que o usuário clicou "Adicionar Produto". Guarda `sale` já
 * calculado (calculateSale) pra não precisar re-derivar nada na hora de fechar a venda. */
interface CartItem {
  key: string;
  product: any;
  quantity: number;
  isRecurring: boolean;
  frequency: Frequencia;
  durationMonths: number | null;
  isOpenEnded: boolean;
  implFee: number;
  unitPrice: number;
  sale: ReturnType<typeof calculateSale>;
  /** Modo edição: ids dos proposal_items que este item substitui + lançamentos financeiros ligados a ele. */
  replaceItemIds?: string[];
  replaceEntryIds?: string[];
  replacePaid?: boolean;
  oldAmount?: number;
}

/** Um produto que já está na proposta (linha do produto + linha de implantação, se houver). */
interface ExistingGroup {
  main: any;
  setup: any | null;
  ids: string[];
}


const labelClass = "text-[10px] font-bold uppercase text-[var(--color-text-muted)] mb-1 block";
const inputClass =
  "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all";
const sectionClass = "bg-[var(--color-surface-sunken)] p-3.5 rounded-xl border border-[var(--color-border-subtle)] space-y-3";
const sectionTitleClass = "text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-1.5";

/** Cartão de uma etapa do fluxo em sequência. Etapa futura = bloqueada (só o título);
 * etapa concluída = resumo de uma linha clicável pra reabrir; etapa atual = conteúdo. */
function StepShell({
  n, title, icon: Icon, current, step, summary, onOpen, forceOpen, children,
}: {
  n: number; title: string; icon: any; current: number; step: number; forceOpen?: boolean;
  summary?: string; onOpen: () => void; children: React.ReactNode;
}) {
  const isActive = forceOpen || step === n;
  const isDone = !forceOpen && step > n;
  const isLocked = !forceOpen && step < n;
  return (
    <div className={cn(
      "rounded-2xl border transition-all",
      isActive ? "border-[var(--color-primary-blue)]/40 bg-[var(--color-surface-elevated)] shadow-sm" : "border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]",
      isLocked && "opacity-50",
    )}>
      <button
        type="button"
        disabled={isLocked || isActive}
        onClick={onOpen}
        className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
      >
        <span className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0",
          isDone ? "bg-emerald-500 !text-white" : isActive ? "bg-[var(--color-primary-blue)] !text-white" : "bg-[var(--color-border-default)] text-[var(--color-text-muted)]",
        )}>
          {isDone ? <Check className="w-3.5 h-3.5" /> : isLocked ? <Lock className="w-3 h-3" /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--color-text-primary)]">
            <Icon className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> {title}
          </span>
          {isDone && summary && <span className="block text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">{summary}</span>}
        </span>
        {isDone && <span className="text-[10px] font-bold text-[var(--color-primary-blue)] flex items-center gap-1 shrink-0"><Pencil className="w-3 h-3" /> Editar</span>}
      </button>
      {isActive && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

/**
 * Substitui o antigo "Mini PDV" embutido inline no Lead Detalhes — mesmos campos de lá
 * (recorrência/vigência, implantação, desconto, composição comercial, forma de pagamento,
 * parcelas, cadastro rápido de produto novo), só que dentro de um modal em vez de ocupar a
 * aba inteira. A aba Produtos (ProductsSection.tsx) agora só lista os produtos — quem quer
 * vender abre esse modal, que continua fechando a venda de verdade: cria a proposta com o
 * item, lança o(s) valor(es) a receber no financeiro, acumula no lead e marca como Fechado.
 *
 * Auditoria 2026-09-23 (bug real em produção): recorrência estava sendo tratada como
 * parcelamento — "R$997/mês por 12 meses" virava "1x à vista de R$11.964". Recorrência e
 * parcelamento agora são conceitos SEPARADOS (ver src/lib/saleCalculator.ts): recorrente
 * gera N lançamentos financeiros de R$997 cada (um por ciclo, ligados por
 * recurring_group_id), nunca 1 lançamento do total do contrato.
 */
export function AddProdutoLeadModal({
  isOpen,
  onClose,
  availableProducts,
  leadId,
  leadName,
  companyName,
  seller,
  initialProductId,
  existingProposal,
  existingItems = [],
  onDone,
}: AddProdutoLeadModalProps) {
  const { createProposalWithItems, replaceProposalItems, financeEntries, deleteFinanceEntry, addFinanceEntry, updateLead, addNotification, leads, resolveFinanceCategoryId } = useData();
  const { formatCurrency } = useLocalization();

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [billingTypeOverride, setBillingTypeOverride] = useState<BillingType | null>(null);

  const [frequency, setFrequency] = useState<Frequencia>("mensal");
  const [customCycleMonthsInput, setCustomCycleMonthsInput] = useState("1");

  const [durationOverride, setDurationOverride] = useState<number | null>(null);
  const [isOpenEndedDuration, setIsOpenEndedDuration] = useState(false);
  const [customDurationDraft, setCustomDurationDraft] = useState("");

  const [hasImplementation, setHasImplementation] = useState<boolean | null>(null);
  // Guardam o texto BRUTO digitado (não um número já re-parseado a cada tecla) — campo
  // type="number" controlado por um valor numérico que o onChange reformata a cada tecla
  // tem um bug clássico do React/browser: se o número resultante de um passo intermediário
  // (ex.: "0", depois "06") não muda o bastante entre renders, alguns browsers não
  // re-normalizam o texto exibido, e o campo fica preso mostrando "0600" mesmo o valor
  // numérico real já sendo 600 por baixo. Guardando a string crua, o texto exibido é sempre
  // exatamente o que foi digitado — nunca diverge do estado.
  const [implementationFeeInput, setImplementationFeeInput] = useState<string | null>(null);

  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [discountInput, setDiscountInput] = useState("0");

  const [isFinancialBreakdownOpen, setIsFinancialBreakdownOpen] = useState(false);
  const [showFullSchedule, setShowFullSchedule] = useState(false);

  const [formaPagamento, setFormaPagamento] = useState<string>("Pix");
  const [installments, setInstallments] = useState(1);
  const [detalhesPagamento, setDetalhesPagamento] = useState("");
  const [firstDueDateInput, setFirstDueDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  // Carrinho: mais de um produto pode ser adicionado a UMA MESMA proposta (antes só dava
  // pra vender 1 produto por vez — clicar "adicionar produto" de novo criava uma proposta
  // NOVA e separada pro mesmo lead, e a aba Produtos só mostrava a mais recente, fazendo o
  // produto anterior "sumir"). Cada clique em "Adicionar Produto" empilha um snapshot aqui;
  // "Concluir Venda" processa todos de uma vez numa única proposta com N itens.
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Fluxo em sequência: 1 Produto → 2 Cobrança → 3 Implantação & Desconto → 4 Pagamento.
  // Cada etapa só aparece depois de "Continuar" na anterior; as já concluídas viram um
  // resumo de uma linha (clicável pra reabrir).
  const [step, setStep] = useState(1);

  // Edição dos itens que já estão na proposta (modo lápis): quantidade/preço editáveis e
  // remoção. Só vira escrita no banco ao salvar.
  const [editingGroup, setEditingGroup] = useState<ExistingGroup | null>(null);
  const [unitPriceInput, setUnitPriceInput] = useState<string | null>(null);
  // Grupos já editados e guardados (aguardando "Salvar na Proposta") — somem da lista de chips.
  const [stagedGroupIds, setStagedGroupIds] = useState<string[]>([]);
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  // Em modo edição as etapas de "novo produto" só aparecem depois de clicar no "+".
  const [addingNew, setAddingNew] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCartItems([]);
    setEditingGroup(null);
    setUnitPriceInput(null);
    setStagedGroupIds([]);
    setAddingNew(false);
    setRemovedItemIds([]);
    setStep(initialProductId ? 2 : 1);
    setProductId(initialProductId || "");
    setQuantity(1);
    setBillingTypeOverride(null);
    setFrequency("mensal");
    setCustomCycleMonthsInput("1");
    setDurationOverride(null);
    setIsOpenEndedDuration(false);
    setCustomDurationDraft("");
    setHasImplementation(null);
    setImplementationFeeInput(null);
    setDiscountType("none");
    setDiscountInput("0");
    setIsFinancialBreakdownOpen(false);
    setShowFullSchedule(false);
    setFormaPagamento("Pix");
    setInstallments(1);
    setDetalhesPagamento("");
    setFirstDueDateInput(new Date().toISOString().slice(0, 10));
    setSaving(false);
  }, [isOpen, initialProductId]);

  const product = availableProducts.find((p) => p.id === productId);

  const isRecurring = billingTypeOverride
    ? billingTypeOverride === "recurring"
    : !!(product?.recurrence || product?.typeAttributes?.isRecurring || product?.type === "Assinatura" || product?.category === "Software");

  const durationMonths = isOpenEndedDuration
    ? null
    : (durationOverride ?? (product?.contractMonths || product?.typeAttributes?.contractMonths || 12));

  const customCycleMonths = Math.max(1, parseInt(customCycleMonthsInput, 10) || 1);

  const implementationFeeOverride = implementationFeeInput !== null ? Math.max(0, parseFloat(implementationFeeInput) || 0) : null;
  const implFee = implementationFeeOverride ?? (hasImplementation === false ? 0 : (product?.implementationFee || product?.typeAttributes?.implementationFee || (product?.category === "Implantação" ? Number(product?.price) || 0 : 0)));
  const showImplToggle = hasImplementation ?? implFee > 0;

  const discountValue = Math.max(0, parseFloat(discountInput) || 0);
  const unitPrice = unitPriceInput !== null ? Math.max(0, parseFloat(unitPriceInput) || 0) : (Number(product?.price) || 0);

  // Estabiliza a referência do Date (senão `new Date(...)` inline recriaria um objeto novo
  // a cada render e invalidaria o useMemo de `sale` abaixo mesmo sem a data ter mudado).
  const firstDueDate = useMemo(() => new Date(firstDueDateInput + "T12:00:00"), [firstDueDateInput]);

  const sale = useMemo(() => calculateSale({
    unitPrice,
    quantity,
    billingType: isRecurring ? "recurring" : "one_time",
    frequency,
    customCycleMonths,
    durationMonths,
    setupFee: showImplToggle ? implFee : 0,
    discountType,
    discountValue,
    installments,
    firstDueDate,
  }), [unitPrice, quantity, isRecurring, frequency, customCycleMonths, durationMonths, showImplToggle, implFee, discountType, discountValue, installments, firstDueDate]);

  // Composição Comercial (visão do vendedor: custo/comissão/margem) — em cima
  // do valor REAL do negócio, nunca do lote de OPEN_ENDED_BATCH_CYCLES ciclos
  // que item recorrente SEM PRAZO recebe (`sale.totalProjectedAmount` nesse
  // caso é só uma projeção de cobrança, não o valor do negócio — ver
  // getSaleRealValue em saleCalculator.ts). Pra item com prazo fechado ou
  // pontual, continua sendo o total mesmo (comportamento inalterado).
  const dealValue = getSaleRealValue(sale);
  const totalCost = (Number(product?.cost) || 0) * quantity * (isRecurring ? (sale.isOpenEnded ? 1 : sale.numberOfCycles) : 1);
  const totalCommission = dealValue * ((Number(product?.commission) || 0) / 100);
  const netProfit = dealValue - totalCost - totalCommission;
  const marginPercent = dealValue > 0 ? Math.round((netProfit / dealValue) * 100) : 0;

  const discountOptions = isRecurring ? DISCOUNT_OPTIONS_RECURRING : DISCOUNT_OPTIONS_ONE_TIME;
  const freqLabel = FREQUENCY_LABELS[frequency];

  // Alternar Cobrança Única ↔ Recorrente troca o conjunto de opções de desconto (ex.: "Em
  // todo ciclo" só existe pra recorrente) — sem isso o <select> ficaria apontando pra um
  // value que sumiu da lista, mostrando em branco até o usuário mexer de novo.
  useEffect(() => {
    if (!discountOptions.some((o) => o.id === discountType)) setDiscountType("none");
  }, [isRecurring]); // eslint-disable-line react-hooks/exhaustive-deps

  // Congela a configuração atual do formulário (produto + recorrência/parcelamento +
  // implantação já calculados em `sale`) e empilha no carrinho, liberando o formulário
  // pro próximo produto. Desconto e composição comercial/margem são só do vendedor
  // decidindo o preço deste item — não precisam sobreviver no snapshot além do `sale`
  // já resolvido.
  const editingMeta = editingGroup ? (() => {
    const entries = (financeEntries || []).filter((e: any) =>
      e.proposal_id === existingProposal?.id && String(e.description || "").includes(`| ${product?.name}`));
    const linesTotal = (Number(editingGroup.main.quantidade) || 0) * (Number(editingGroup.main.preco_unitario) || 0)
      + (Number(editingGroup.setup?.preco_unitario) || 0) * (Number(editingGroup.setup?.quantidade) || 0);
    return {
      replaceItemIds: editingGroup.ids,
      replaceEntryIds: entries.map((e: any) => e.id as string),
      replacePaid: entries.some((e: any) => e.status === "Pago"),
      oldAmount: entries.length > 0 ? entries.reduce((sum: number, e: any) => sum + (Number(e.value) || 0), 0) : linesTotal,
    };
  })() : {};

  const handleAddToCart = () => {
    if (!product) {
      toast.error("Selecione um produto.");
      return;
    }
    const item: CartItem = {
      key: crypto.randomUUID(),
      product,
      quantity,
      isRecurring,
      frequency,
      durationMonths,
      isOpenEnded: sale.isOpenEnded,
      implFee: showImplToggle ? implFee : 0,
      unitPrice,
      sale,
      ...editingMeta,
    };
    setCartItems((prev) => [...prev, item]);
    if (editingGroup) setStagedGroupIds((prev) => [...prev, editingGroup.main.id]);
    toast.success(`"${product.name}" adicionado à proposta.`);

    // Reresta só a configuração DESTE produto — forma de pagamento, parcelas e 1º
    // vencimento continuam valendo pro próximo item (é a mesma venda/lead).
    setStep(1);
    setEditingGroup(null);
    setUnitPriceInput(null);
    setProductId("");
    setQuantity(1);
    setBillingTypeOverride(null);
    setFrequency("mensal");
    setCustomCycleMonthsInput("1");
    setDurationOverride(null);
    setIsOpenEndedDuration(false);
    setCustomDurationDraft("");
    setHasImplementation(null);
    setImplementationFeeInput(null);
    setDiscountType("none");
    setDiscountInput("0");
  };

  const handleRemoveFromCart = (key: string) => {
    setCartItems((prev) => prev.filter((ci) => ci.key !== key));
  };

  const cartTotal = cartItems.reduce((sum, ci) => sum + getSaleRealValue(ci.sale), 0);

  // Produtos que já estão na proposta, agrupados (linha do produto + linha de implantação).
  const isSetupLine = (it: any) => String(it.product_name || "").startsWith("Taxa de Implantação");
  const existingGroups: ExistingGroup[] = existingItems
    .filter((it: any) => !isSetupLine(it))
    .map((it: any) => {
      const setup = existingItems.find((x: any) => isSetupLine(x) && x.product_id === it.product_id) || null;
      return { main: it, setup, ids: [it.id, setup?.id].filter(Boolean) as string[] };
    });
  const removedGroups = existingGroups.filter((g) => removedItemIds.includes(g.main.id));
  const hasItemEdits = !!existingProposal?.id && removedGroups.length > 0;
  const groupLinesTotal = (g: ExistingGroup) =>
    (Number(g.main.quantidade) || 0) * (Number(g.main.preco_unitario) || 0)
    + (Number(g.setup?.quantidade) || 0) * (Number(g.setup?.preco_unitario) || 0);

  // Carrega um produto já existente na proposta dentro das etapas, com os dados dele.
  const loadGroup = (g: ExistingGroup) => {
    const prod = availableProducts.find((pp) => pp.id === g.main.product_id);
    if (!prod) {
      toast.error("Esse produto não está mais no catálogo — dá pra removê-lo da proposta, mas não editar.");
      return;
    }
    const rec = g.main.billing_type === "recurring";
    const freq = ((g.main.frequency as Frequencia) || "mensal");
    const openEnded = rec && g.main.contract_months == null;
    const totalQty = Number(g.main.quantidade) || 1;
    let qty = totalQty;
    let customMonths = 1;
    if (rec) {
      if (freq === "personalizado") {
        // O ciclo personalizado não é guardado no item: assume 1 unidade e deduz o ciclo pela vigência.
        qty = 1;
        customMonths = Math.max(1, Math.round((Number(g.main.contract_months) || totalQty) / Math.max(1, totalQty)));
      } else {
        const cycles = openEnded ? OPEN_ENDED_BATCH_CYCLES : Math.max(1, Math.round((Number(g.main.contract_months) || 1) / cycleMonthsFor(freq)));
        qty = Math.max(1, Math.round(totalQty / cycles));
      }
    }
    const entries = (financeEntries || []).filter((e: any) =>
      e.proposal_id === existingProposal?.id && String(e.description || "").includes(`| ${prod.name}`));
    setProductId(prod.id);
    setQuantity(qty);
    setBillingTypeOverride(rec ? "recurring" : "one_time");
    setFrequency(freq);
    setCustomCycleMonthsInput(String(customMonths));
    setDurationOverride(rec && !openEnded ? Number(g.main.contract_months) : null);
    setIsOpenEndedDuration(openEnded);
    setCustomDurationDraft("");
    setUnitPriceInput(String(Number(g.main.preco_unitario) || 0));
    setHasImplementation(!!g.setup);
    setImplementationFeeInput(g.setup ? String(Number(g.setup.preco_unitario) || 0) : null);
    setDiscountType("none");
    setDiscountInput("0");
    if (entries.length > 0) {
      const sorted = [...entries].sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
      if (sorted[0].payment_method) setFormaPagamento(sorted[0].payment_method);
      if (sorted[0].date) setFirstDueDateInput(String(sorted[0].date).slice(0, 10));
      if (!rec) setInstallments(sorted.length);
    }
    setEditingGroup(g);
    setAddingNew(false);
  };

  const cancelGroupEdit = () => {
    setEditingGroup(null);
    setUnitPriceInput(null);
    setProductId("");
    setQuantity(1);
    setBillingTypeOverride(null);
    setDurationOverride(null);
    setIsOpenEndedDuration(false);
    setHasImplementation(null);
    setImplementationFeeInput(null);
    setDiscountType("none");
    setDiscountInput("0");
    setStep(1);
  };

  const handleSubmit = async () => {
    // O produto ainda configurado no formulário (se houver) entra na venda junto com o
    // carrinho — assim quem vende só 1 produto continua sem precisar clicar "Adicionar"
    // antes de "Concluir Venda".
    const allItems: CartItem[] = [
      ...cartItems,
      ...(product
        ? [{
            key: "current",
            product,
            quantity,
            isRecurring,
            frequency,
            durationMonths,
            isOpenEnded: sale.isOpenEnded,
            implFee: showImplToggle ? implFee : 0,
            unitPrice,
            sale,
            ...editingMeta,
          }]
        : []),
    ];
    if (allItems.length === 0 && !hasItemEdits) {
      toast.error("Selecione ao menos um produto.");
      return;
    }
    setSaving(true);
    try {
      if (existingProposal?.id && allItems.length === 0) {
        // Só remoções.
        await replaceProposalItems(existingProposal.id, removedGroups.flatMap((g) => g.ids), [], -removedGroups.reduce((sum, g) => sum + groupLinesTotal(g), 0));
        toast.success("Itens removidos da proposta.", { description: "Os lançamentos financeiros já gerados não foram alterados." });
        onDone?.("✏️ Itens removidos da proposta.");
        onClose();
        return;
      }
      const clientName = companyName || leadName || "Cliente";
      // Vínculos reais que dá pra derivar sem inventar nada: category_id (o
      // DRE lê o id, não só o texto livre `category`) e o contato (cliente já
      // vinculado a este lead, se existir) — nunca um centro de custo/conta
      // bancária adivinhados.
      const vendasCategoryId = await resolveFinanceCategoryId("Vendas / Serviços", "Receita");
      const contatoId = leadId ? (leads || []).find((l: any) => l.id === leadId)?.clientId || null : null;

      // Todos os produtos entram como itens de UMA proposta só (nunca uma proposta por
      // produto — era isso que fazia "adicionar produto" de novo apagar/esconder o
      // anterior, já que só a proposta mais recente do lead aparecia na aba Produtos).
      const items: any[] = [];
      for (const ci of allItems) {
        const ciFreqLabel = FREQUENCY_LABELS[ci.frequency];
        const ciUnitPrice = ci.unitPrice;
        items.push({
          productId: ci.product.id,
          descricao: ci.isRecurring
            ? `${ci.product.name} (Assinatura ${ciFreqLabel} — ${ci.sale.numberOfCycles} ciclo${ci.sale.numberOfCycles > 1 ? "s" : ""}${ci.isOpenEnded ? ", contínua" : ""})`
            : ci.product.name,
          quantidade: ci.isRecurring ? ci.sale.numberOfCycles * ci.quantity : ci.quantity,
          precoUnitario: ciUnitPrice,
          billingType: ci.isRecurring ? "recurring" : "one_time",
          contractMonths: ci.isRecurring ? (ci.isOpenEnded ? null : ci.durationMonths) : null,
          frequency: ci.isRecurring ? ci.frequency : null,
        });
        if (ci.implFee > 0) {
          items.push({
            productId: ci.product.id,
            descricao: `Taxa de Implantação e Setup Inicial — ${ci.product.name}`,
            quantidade: 1,
            precoUnitario: ci.implFee,
            billingType: "one_time",
            contractMonths: null,
            frequency: null,
          });
        }
      }

      // Valor real do negócio — nunca o lote de OPEN_ENDED_BATCH_CYCLES ciclos
      // de um item recorrente SEM PRAZO (ver getSaleRealValue). Esse número
      // vira `proposals.valor` e, por sua vez, `leads.value` (fonte de
      // verdade somada em TODO o sistema — Kanban, ranking, ticket médio,
      // Propostas, BI) — corrigir aqui evita ter que corrigir cada um
      // desses lugares separadamente.
      const totalValor = allItems.reduce((sum, ci) => sum + getSaleRealValue(ci.sale), 0);

      let proposalId: string;
      if (existingProposal?.id) {
        // Modo "editar proposta": troca os itens editados/removidos e acrescenta os novos na
        // proposta que já existe. O valor ajusta pela diferença (novo total − o que valia antes).
        const oldReplaced = allItems.reduce((sum, ci) => sum + (ci.replaceItemIds ? (ci.oldAmount || 0) : 0), 0);
        const removeIds = [
          ...removedGroups.flatMap((g) => g.ids),
          ...allItems.flatMap((ci) => ci.replaceItemIds || []),
        ];
        const removedTotal = removedGroups.reduce((sum, g) => sum + groupLinesTotal(g), 0);
        await replaceProposalItems(existingProposal.id, removeIds, items, totalValor - oldReplaced - removedTotal);
        proposalId = existingProposal.id;
      } else {
        proposalId = await createProposalWithItems({
          titulo: `Proposta Comercial — ${clientName}`,
          cliente: clientName,
          valor: totalValor,
          validade: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          status: "Enviada",
          vendedor: seller || "Consultor S.P.Y.",
          leadId: leadId || null,
          tipo: "itens",
          conteudoTexto: null,
          itens: items,
        });
      }

      const isInstantPayment = formaPagamento === "Dinheiro" || formaPagamento === "Pix" || formaPagamento === "Cartão de Débito";

      // Um grupo de cobrança (recurring_group_id / installment_group_id) POR PRODUTO —
      // nunca misturando ciclos de produtos diferentes no mesmo grupo.
      let paidSkipped = 0;
      for (const ci of allItems) {
        if (ci.replaceItemIds) {
          // Produto editado: refaz as cobranças dele só se ainda não há nenhuma paga — nunca
          // apaga dinheiro já recebido.
          if (!ci.replaceEntryIds || ci.replaceEntryIds.length === 0) continue;
          if (ci.replacePaid) { paidSkipped++; continue; }
          for (const eid of ci.replaceEntryIds) await deleteFinanceEntry(eid);
        }
        const groupId = crypto.randomUUID();
        if (ci.isRecurring) {
          // Recorrente: um lançamento POR CICLO, cada um com o valor do ciclo (nunca o
          // total do contrato numa cobrança só) — ligados por recurring_group_id, mesma
          // convenção já usada em NovaOperacaoModal.tsx/GenericFinanceiroList.tsx.
          for (let i = 0; i < ci.sale.paymentSchedule.length; i++) {
            const cycle = ci.sale.paymentSchedule[i];
            const isFirst = i === 0;
            await addFinanceEntry({
              description: `Assinatura — ${clientName} | ${ci.product.name} | Ciclo ${cycle.cycleNumber}/${ci.sale.numberOfCycles}${isFirst && ci.sale.setupAmount > 0 ? " (inclui implantação)" : ""}`,
              category: "Vendas / Serviços",
              category_id: vendasCategoryId,
              contato_id: contatoId,
              value: cycle.amount,
              type: "Receber",
              status: isFirst && isInstantPayment ? "Pago" : "A Vencer",
              date: cycle.dueDate.toISOString().slice(0, 10),
              is_recurring: true,
              recurring_frequency: ci.frequency,
              recurring_group_id: groupId,
              payment_method: formaPagamento,
              notes: ci.isOpenEnded
                ? "Recorrência contínua (sem prazo definido) — lote inicial de ciclos gerado agora; os próximos ciclos precisam ser gerados manualmente ou por uma automação futura."
                : (detalhesPagamento || null),
              proposal_id: proposalId,
            }, { silent: !isFirst });
          }
        } else {
          // Cobrança única (com ou sem parcelamento): divide o MESMO total em N parcelas —
          // nunca multiplica o valor pelas parcelas. installment_group_id só quando há
          // mais de 1 parcela de verdade.
          for (let i = 0; i < ci.sale.paymentSchedule.length; i++) {
            const cycle = ci.sale.paymentSchedule[i];
            const isFirst = i === 0;
            await addFinanceEntry({
              description: `Venda — ${clientName} | ${ci.product.name}${ci.sale.numberOfCycles > 1 ? ` (parcela ${cycle.cycleNumber}/${ci.sale.numberOfCycles})` : ""}`,
              category: "Vendas / Serviços",
              category_id: vendasCategoryId,
              contato_id: contatoId,
              value: cycle.amount,
              type: "Receber",
              status: isFirst && isInstantPayment ? "Pago" : "A Vencer",
              date: cycle.dueDate.toISOString().slice(0, 10),
              ...(ci.sale.numberOfCycles > 1 ? { installment_group_id: groupId, installment_number: cycle.cycleNumber, installment_total: ci.sale.numberOfCycles } : {}),
              payment_method: formaPagamento,
              notes: detalhesPagamento || null,
              proposal_id: proposalId,
            }, { silent: !isFirst });
          }
        }
      }

      // `value` NÃO é setado aqui — createProposalWithItems (acima) já recalculou
      // o valor do lead como soma de TODAS as propostas dele (única fonte de
      // verdade, ver DataContext.tsx); sobrescrever de novo aqui reintroduziria a
      // mesma inconsistência que motivou centralizar esse cálculo.
      if (leadId) {
        const currentLead = (leads || []).find((l: any) => l.id === leadId);
        const newProductIds = allItems.map((ci) => ci.product.id);
        const accumulatedProductIds = [...new Set([...(currentLead?.productIds || []), ...newProductIds])];
        const anyRecurring = allItems.some((ci) => ci.isRecurring);
        await updateLead(leadId, {
          productIds: accumulatedProductIds,
          status: "Fechado",
          scoreIA: 100,
          temperature: "quente",
          customFields: {
            ...(existingProposal?.id ? (currentLead?.customFields || {}) : {}),
            tags: ["Venda", formaPagamento, `${allItems.length} produto${allItems.length > 1 ? "s" : ""}`],
            billingType: anyRecurring ? "recurring" : "one_time",
            totalProjectedAmount: totalValor,
            formaPagamento,
            dataPagamento: firstDueDateInput,
            detalhesPagamento,
          },
        });
      }

      const productNames = allItems.map((ci) => ci.product.name).join(", ");
      const resumoMsg = allItems.length > 1
        ? `${allItems.length} produtos — valor do negócio ${formatCurrency(totalValor)}`
        : (allItems[0].isRecurring
          ? (allItems[0].sale.isOpenEnded
              ? `${formatCurrency(allItems[0].sale.cycleAmount)}/${FREQUENCY_LABELS[allItems[0].frequency].toLowerCase()} — 1ª cobrança ${formatCurrency(allItems[0].sale.firstChargeAmount)}, sem prazo (lote inicial de ${allItems[0].sale.numberOfCycles} ciclos)`
              : `${formatCurrency(allItems[0].sale.cycleAmount)}/${FREQUENCY_LABELS[allItems[0].frequency].toLowerCase()} — 1ª cobrança ${formatCurrency(allItems[0].sale.firstChargeAmount)}, ${allItems[0].sale.numberOfCycles} ciclos, total previsto ${formatCurrency(allItems[0].sale.totalProjectedAmount)}`)
          : `${formatCurrency(allItems[0].sale.firstChargeAmount)}${allItems[0].sale.numberOfCycles > 1 ? ` (1ª de ${allItems[0].sale.numberOfCycles}x)` : ""} via ${formaPagamento}`);

      addNotification({
        title: `🎉 ${existingProposal?.id ? "Proposta Atualizada" : "Venda Concluída"}: ${clientName}`,
        description: `${productNames} — ${resumoMsg}`,
        type: "success",
        link_url: "/app/crm/propostas",
      });

      if (paidSkipped > 0) {
        toast.warning(`${paidSkipped} produto${paidSkipped > 1 ? "s" : ""} editado${paidSkipped > 1 ? "s" : ""} já ${paidSkipped > 1 ? "têm" : "tem"} cobrança paga — o financeiro dele${paidSkipped > 1 ? "s" : ""} não foi alterado.`);
      }
      toast.success("⚡ Venda concluída e automatizada!", {
        description: `${existingProposal?.id ? "Proposta atualizada com" : "Proposta criada com"} ${allItems.length} item${allItems.length > 1 ? "s" : ""}, financeiro lançado e lead atualizado.`,
      });
      onDone?.(`⚡ ${productNames} — ${resumoMsg}: ${existingProposal?.id ? "adicionado à proposta existente" : "proposta gerada"}, financeiro lançado e lead atualizado.`);
      onClose();
    } catch (err: any) {
      toast.error("Erro ao processar a venda: " + err?.message);
    } finally {
      setSaving(false);
    }
  };

  const showSteps = !existingProposal?.id || addingNew || cartItems.length > 0 || !!productId || !!editingGroup;

  const nextBtn = (label: string, onClick: () => void, disabled = false) => editingGroup ? null : (
    <div className="flex justify-end pt-1">
      <Button type="button" onClick={onClick} disabled={disabled} className="h-9 px-4 text-xs font-bold gap-1.5">
        {label} <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
      </Button>
    </div>
  );

  const billingLabel = isRecurring
    ? `Recorrente · ${freqLabel.toLowerCase()} · ${sale.isOpenEnded ? "sem prazo" : `${durationMonths}m`} · ${formatCurrency(sale.cycleAmount)}/ciclo`
    : `Cobrança única · ${installments === 1 ? "à vista" : `${installments}x`} · ${formatCurrency(sale.totalProjectedAmount)}`;
  const extrasLabel = [
    showImplToggle && implFee > 0 ? `Implantação ${formatCurrency(implFee)}` : "Sem implantação",
    discountType !== "none" ? "com desconto" : "sem desconto",
  ].join(" · ");
  const paymentLabel = `${formaPagamento} · ${firstDueDate.toLocaleDateString("pt-BR")}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existingProposal?.id ? "Editar Proposta — Adicionar Produtos" : "Adicionar Produtos"}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin pr-1">
        {/* ── CONTEXTO: cliente + destino + produtos que já estão na proposta ── */}
        <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">Cliente</p>
              <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{companyName || leadName || "Cliente"}</p>
            </div>
            <div className="text-right min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">Destino</p>
              <p className="text-xs font-bold text-[var(--color-primary-blue)] truncate">
                {existingProposal?.id ? `Proposta existente${existingProposal.status ? ` (${existingProposal.status})` : ""}` : "Nova proposta"}
              </p>
            </div>
          </div>
          {existingProposal?.id && (
            <div className="border-t border-[var(--color-border-subtle)] pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">
                  Produtos na proposta ({existingGroups.length})
                </p>
                {existingProposal.valor !== undefined && (
                  <span className="text-[11px] font-mono font-black text-[var(--color-primary-blue)]">{formatCurrency(Number(existingProposal.valor) || 0)}</span>
                )}
              </div>
              {existingGroups.length === 0 ? (
                <p className="text-[11px] text-[var(--color-text-faint)]">Nenhum item registrado ainda.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {existingGroups.map((g) => {
                    const removed = removedItemIds.includes(g.main.id);
                    const staged = stagedGroupIds.includes(g.main.id);
                    const selected = editingGroup?.main.id === g.main.id;
                    const label = String(g.main.product_name || "").replace(/\s*\(Assinatura.*$/, "");
                    return (
                      <div key={g.main.id} className={cn(
                        "flex items-center rounded-xl border text-[11px] font-bold overflow-hidden",
                        selected ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10" : "border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]",
                        removed && "opacity-50",
                      )}>
                        <button
                          type="button"
                          disabled={removed || staged}
                          onClick={() => loadGroup(g)}
                          title={staged ? "Já editado — salve a proposta para aplicar" : "Editar este produto nas etapas abaixo"}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[var(--color-text-primary)] disabled:cursor-default"
                        >
                          {staged ? <Check className="w-3 h-3 text-emerald-500" /> : <Pencil className="w-3 h-3 text-[var(--color-primary-blue)]" />}
                          <span className={cn("max-w-[220px] truncate", removed && "line-through")}>{label}</span>
                          {staged && <span className="text-[9px] text-emerald-600">editado</span>}
                        </button>
                        {!staged && (
                          <button
                            type="button"
                            onClick={() => {
                              setRemovedItemIds((prev) => removed ? prev.filter((x) => x !== g.main.id) : [...prev, g.main.id]);
                              if (selected) cancelGroupEdit();
                            }}
                            title={removed ? "Desfazer remoção" : "Remover da proposta"}
                            className="px-2 py-1.5 text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10 border-l border-[var(--color-border-subtle)]"
                          >
                            {removed ? <Plus className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-[var(--color-text-faint)] flex items-start gap-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                Clique num produto para editar tudo dele nas etapas abaixo. Cobranças já pagas no financeiro nunca são alteradas.
              </p>
            </div>
          )}
        </div>

        {/* ── CARRINHO DESTA PROPOSTA (produtos já adicionados) ── */}
        {cartItems.length > 0 && (
          <div className="bg-emerald-500/5 border border-emerald-500/25 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <ShoppingCart className="w-3.5 h-3.5" /> Produtos já adicionados ({cartItems.length})
              </span>
              <span className="text-[11px] font-mono font-black text-emerald-600 dark:text-emerald-400">
                {formatCurrency(cartTotal)}
              </span>
            </div>
            <div className="space-y-1.5">
              {cartItems.map((ci) => (
                <div key={ci.key} className="flex items-center justify-between gap-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-lg px-2.5 py-1.5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-[var(--color-text-primary)] truncate">{ci.product.name}</p>
                    <p className="text-[9px] text-[var(--color-text-faint)] font-mono">
                      {ci.isRecurring
                        ? (ci.sale.isOpenEnded
                            ? `${formatCurrency(ci.sale.cycleAmount)}/${FREQUENCY_LABELS[ci.frequency].toLowerCase()} · sem prazo (lote inicial de ${ci.sale.numberOfCycles} ciclos)`
                            : `${formatCurrency(ci.sale.cycleAmount)}/${FREQUENCY_LABELS[ci.frequency].toLowerCase()} · ${ci.sale.numberOfCycles} ciclos · total ${formatCurrency(ci.sale.totalProjectedAmount)}`)
                        : `${formatCurrency(ci.sale.totalProjectedAmount)}${ci.sale.numberOfCycles > 1 ? ` em ${ci.sale.numberOfCycles}x` : ""}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFromCart(ci.key)}
                    title="Remover item"
                    className="p-1.5 text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {existingProposal?.id && !showSteps && (
          <button
            type="button"
            onClick={() => { setAddingNew(true); setStep(1); }}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-primary-blue)]/40 py-3 text-xs font-bold text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/5 transition-colors"
          >
            <Plus className="w-4 h-4" /> Adicionar outro produto
          </button>
        )}
        {showSteps && (
          <div className="space-y-4">
            {editingGroup && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/30 px-3 py-2">
                <span className="text-[11px] font-bold text-[var(--color-primary-blue)] flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> Editando: {product?.name}
                </span>
                <button type="button" onClick={cancelGroupEdit} className="text-[10px] font-bold text-[var(--color-text-muted)] hover:underline">Cancelar edição</button>
              </div>
            )}
        {/* ── ETAPA 1: PRODUTO ── */}
        <StepShell n={1} forceOpen={!!editingGroup} title="Produto" icon={Package} current={step} step={step}
          summary={product ? `${product.name} · ${quantity}x · ${formatCurrency(unitPrice)}` : undefined}
          onOpen={() => setStep(1)}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className={labelClass}>Produto *</label>
              <select value={productId} disabled={!!editingGroup} onChange={(e) => { setProductId(e.target.value); setUnitPriceInput(null); }} className={inputClass}>
                <option value="">Selecione um produto...</option>
                {availableProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {formatCurrency(Number(p.price) || 0)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Quantidade</label>
              <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Valor unit. (R$)</label>
              <input type="number" min={0} step="0.01" value={unitPriceInput ?? String(Number(product?.price) || 0)} onChange={(e) => setUnitPriceInput(e.target.value)} className={inputClass} />
            </div>
          </div>
          {nextBtn("Continuar", () => setStep(2), !product)}
        </StepShell>

        {/* ── ETAPA 2: COBRANÇA ── */}
        <StepShell n={2} forceOpen={!!editingGroup} title="Cobrança" icon={Repeat} current={step} step={step} summary={billingLabel} onOpen={() => setStep(2)}>
            <div>
              <label className={labelClass}>Tipo de cobrança</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBillingTypeOverride("one_time")}
                  className={cn(
                    "h-9 px-3 rounded-[var(--radius-control)] border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors",
                    !isRecurring
                      ? "bg-[var(--color-primary-blue)]/15 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]"
                      : "bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] text-[var(--color-text-muted)]"
                  )}
                >
                  <DollarSign className="w-3.5 h-3.5" /> Cobrança Única
                </button>
                <button
                  type="button"
                  onClick={() => setBillingTypeOverride("recurring")}
                  className={cn(
                    "h-9 px-3 rounded-[var(--radius-control)] border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors",
                    isRecurring
                      ? "bg-[var(--color-primary-blue)]/15 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]"
                      : "bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] text-[var(--color-text-muted)]"
                  )}
                >
                  <Repeat className="w-3.5 h-3.5" /> Recorrente
                </button>
              </div>
            </div>

            {/* ── 3. CONFIGURAÇÃO DA RECORRÊNCIA (ou parcelamento, se pontual) ── */}
            {isRecurring ? (
              <div className={sectionClass}>
                <span className={sectionTitleClass}><Repeat className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Configuração da Recorrência</span>

                <div>
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-1">Frequência</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {RECURRING_FREQUENCIES.map((f) => (
                      <button key={f} type="button" onClick={() => setFrequency(f)}
                        className={cn("px-2.5 py-1 rounded-md font-bold text-[10px]", frequency === f ? "bg-[var(--color-primary-blue)] text-white" : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] hover:bg-[var(--color-border-default)]")}>
                        {FREQUENCY_LABELS[f]}
                      </button>
                    ))}
                    {frequency === "personalizado" && (
                      <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                        a cada
                        <input
                          type="number" min={1}
                          value={customCycleMonthsInput}
                          onChange={(e) => setCustomCycleMonthsInput(e.target.value)}
                          className="w-12 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded px-1.5 py-0.5 text-[10px] text-center font-mono font-bold"
                        />
                        mês(es)
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-1">Vigência</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {DURATION_PRESETS.map((m) => (
                      <button key={m} type="button" onClick={() => { setDurationOverride(m); setIsOpenEndedDuration(false); setCustomDurationDraft(""); }}
                        className={cn("px-2 py-0.5 rounded-md font-mono font-bold text-[10px]", !isOpenEndedDuration && durationMonths === m ? "bg-[var(--color-primary-blue)] text-white" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]")}>
                        {m}m
                      </button>
                    ))}
                    <input
                      type="number" min={1} placeholder="Outro"
                      value={customDurationDraft || (!isOpenEndedDuration && DURATION_PRESETS.includes(durationMonths as number) ? "" : (isOpenEndedDuration ? "" : String(durationMonths)))}
                      onChange={(e) => {
                        setCustomDurationDraft(e.target.value);
                        const v = parseInt(e.target.value, 10);
                        if (v > 0) { setDurationOverride(v); setIsOpenEndedDuration(false); }
                      }}
                      className="w-14 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded px-1.5 py-0.5 text-[10px] text-center font-mono font-bold"
                    />
                    <button type="button" onClick={() => setIsOpenEndedDuration(true)}
                      className={cn("px-2 py-0.5 rounded-md font-bold text-[10px]", isOpenEndedDuration ? "bg-[var(--color-primary-blue)] text-white" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]")}>
                      Sem prazo
                    </button>
                  </div>
                  {isOpenEndedDuration && (
                    <p className="text-[10px] text-amber-600 mt-1.5 flex items-start gap-1">
                      <Info className="w-3 h-3 shrink-0 mt-0.5" />
                      Recorrência contínua: gera um lote inicial de {sale.numberOfCycles} ciclos agora; ciclos futuros precisam ser gerados manualmente (ainda não existe cobrança recorrente automática neste sistema).
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className="bg-[var(--color-surface-elevated)] p-2.5 rounded-lg border border-[var(--color-border-subtle)]">
                    <span className="text-[9px] font-bold uppercase text-[var(--color-text-faint)] block">Valor por ciclo</span>
                    <span className="text-sm font-black text-[var(--color-text-primary)] font-mono">{formatCurrency(sale.cycleAmount)}</span>
                    <span className="text-[9px] text-[var(--color-text-faint)] block">/ {freqLabel.toLowerCase()}</span>
                  </div>
                  <div className="bg-[var(--color-surface-elevated)] p-2.5 rounded-lg border border-[var(--color-border-subtle)]">
                    <span className="text-[9px] font-bold uppercase text-[var(--color-text-faint)] block flex items-center gap-1"><CalendarClock className="w-2.5 h-2.5" /> Próxima cobrança</span>
                    <span className="text-sm font-black text-[var(--color-text-primary)] font-mono">
                      {sale.nextDueDate ? sale.nextDueDate.toLocaleDateString("pt-BR") : "—"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className={sectionClass}>
                <span className={sectionTitleClass}><Layers className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Parcelamento</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
                    <button key={n} type="button" onClick={() => setInstallments(n)}
                      className={cn("px-2.5 py-1 rounded-md font-bold text-[10px]", installments === n ? "bg-[var(--color-primary-blue)] text-white" : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] hover:bg-[var(--color-border-default)]")}>
                      {n === 1 ? "1x à vista" : `${n}x`}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {nextBtn("Continuar", () => setStep(3))}
        </StepShell>

        {/* ── ETAPA 3: IMPLANTAÇÃO & DESCONTO ── */}
        <StepShell n={3} forceOpen={!!editingGroup} title="Implantação & Desconto" icon={Wrench} current={step} step={step} summary={extrasLabel} onOpen={() => setStep(3)}>
            {/* ── 4. IMPLANTAÇÃO E DESCONTO ── */}
            <div className={sectionClass}>
              <span className={sectionTitleClass}><Wrench className="w-3.5 h-3.5 text-amber-500" /> Implantação & Desconto</span>

              <div className="flex items-center gap-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showImplToggle} onChange={(e) => setHasImplementation(e.target.checked)} className="w-3.5 h-3.5 accent-amber-500" />
                  <span className="text-[11px] font-bold text-[var(--color-text-primary)]">Taxa de Implantação/Setup</span>
                </label>
                {showImplToggle && (
                  <>
                    <input
                      type="number" min={0} step={50} value={implementationFeeInput ?? String(implFee)}
                      onChange={(e) => setImplementationFeeInput(e.target.value)}
                      className="w-28 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-600"
                    />
                    <span className="text-[9px] text-[var(--color-text-faint)] font-bold uppercase">Somente na 1ª cobrança</span>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-1">Tipo de desconto</span>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                    className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                  >
                    {discountOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                {discountType !== "none" && (
                  <div>
                    <span className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-1">
                      {discountType === "percentage" ? "Percentual (%)" : "Valor (R$)"}
                    </span>
                    <input
                      type="number" min={0} value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
              {discountType !== "none" && (
                <p className="text-[10px] text-[var(--color-text-faint)]">
                  {discountType === "first_charge" && "Reduz só a 1ª cobrança — as próximas saem pelo valor cheio do ciclo."}
                  {discountType === "recurring" && "Reduz TODAS as cobranças, inclusive a 1ª — mesmo desconto em cada ciclo."}
                  {discountType === "total" && isRecurring && "Valor total a descontar do contrato, dividido igualmente entre todos os ciclos."}
                  {discountType === "total" && !isRecurring && "Reduz o valor total da venda antes de dividir nas parcelas."}
                  {discountType === "percentage" && (isRecurring ? "Percentual aplicado sobre o valor de cada ciclo." : "Percentual aplicado sobre o valor total da venda.")}
                </p>
              )}
            </div>

          {nextBtn("Continuar", () => setStep(4))}
        </StepShell>

        {/* ── ETAPA 4: PAGAMENTO ── */}
        <StepShell n={4} forceOpen={!!editingGroup} title="Pagamento & Resumo" icon={CreditCard} current={step} step={step} summary={paymentLabel} onOpen={() => setStep(4)}>
            {/* ── 5. PAGAMENTO ── */}
            <div className={sectionClass}>
              <span className={sectionTitleClass}><CreditCard className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Pagamento</span>
              <div>
                <span className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-1">Forma de pagamento</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PAYMENT_OPTIONS.map((method) => {
                    const isSelected = formaPagamento === method.id;
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => {
                          setFormaPagamento(method.id);
                          if (method.id === "Pix" || method.id === "Dinheiro" || method.id === "Cartão de Débito") {
                            setFirstDueDateInput(new Date().toISOString().slice(0, 10));
                          }
                        }}
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all",
                          isSelected
                            ? "bg-[var(--color-primary-blue)]/15 border-[var(--color-primary-blue)] text-[var(--color-text-primary)] font-bold"
                            : "bg-[var(--color-surface-elevated)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-default)]"
                        )}
                      >
                        <Icon className={cn("w-4 h-4 shrink-0", isSelected ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-faint)]")} />
                        <span className="text-[11px] whitespace-nowrap">{method.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className={labelClass}>{isRecurring ? "1º Vencimento" : "Vencimento"}</label>
                <input type="date" value={firstDueDateInput} onChange={(e) => setFirstDueDateInput(e.target.value)} className={inputClass} />
                <div className="flex items-center gap-1 mt-1">
                  {[["Hoje", 0], ["+7d", 7], ["+15d", 15], ["+30d", 30]].map(([label, days]) => (
                    <button key={label as string} type="button"
                      onClick={() => setFirstDueDateInput(new Date(Date.now() + (days as number) * 86400000).toISOString().slice(0, 10))}
                      className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Prévia do cronograma de cobranças ── */}
              <div className="space-y-1.5 pt-1 border-t border-[var(--color-border-subtle)]">
                <span className="text-[10px] font-bold text-[var(--color-text-muted)] flex items-center gap-1"><Calendar className="w-3 h-3" /> Cronograma de cobranças</span>
                {(showFullSchedule ? sale.paymentSchedule : sale.paymentSchedule.slice(0, 3)).map((cycle) => (
                  <div key={cycle.cycleNumber} className="flex items-center justify-between text-[11px] bg-[var(--color-surface-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--color-border-subtle)]">
                    <span className="text-[var(--color-text-muted)] font-bold">{cycle.cycleNumber}ª cobrança — {cycle.dueDate.toLocaleDateString("pt-BR")}</span>
                    <span className="font-mono font-black text-[var(--color-text-primary)]">{formatCurrency(cycle.amount)}</span>
                  </div>
                ))}
                {sale.paymentSchedule.length > 3 && (
                  <button type="button" onClick={() => setShowFullSchedule((v) => !v)} className="text-[10px] font-bold text-[var(--color-primary-blue)] hover:underline">
                    {showFullSchedule ? "Ocultar cronograma" : `Ver cronograma completo (${sale.paymentSchedule.length})`}
                  </button>
                )}
              </div>
            </div>

            {/* ── COMPOSIÇÃO COMERCIAL & FINANCEIRA (visão do vendedor — custo/comissão/margem) ── */}
            <div className={sectionClass}>
              <div className="flex items-center justify-between">
                <span className={sectionTitleClass}><Receipt className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Composição Comercial & Financeira</span>
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center gap-1 text-emerald-600 font-mono font-bold text-[10px]"><Percent className="w-3 h-3" /> Margem: {marginPercent}%</span>
                  <button type="button" onClick={() => setIsFinancialBreakdownOpen((v) => !v)} className="text-[var(--color-text-primary)]">
                    {isFinancialBreakdownOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              {isFinancialBreakdownOpen && (
                <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1 animate-in fade-in">
                  <div className="bg-[var(--color-surface-elevated)] p-2 rounded-lg border border-[var(--color-border-subtle)] space-y-0.5">
                    <span className="text-[9px] text-[var(--color-text-faint)] flex items-center gap-1 uppercase"><TrendingDown className="w-2.5 h-2.5" /> Custos</span>
                    <span className="text-rose-500 font-bold text-[11px] block">{formatCurrency(totalCost)}</span>
                  </div>
                  <div className="bg-[var(--color-surface-elevated)] p-2 rounded-lg border border-[var(--color-border-subtle)] space-y-0.5">
                    <span className="text-[9px] text-[var(--color-text-faint)] flex items-center gap-1 uppercase"><Percent className="w-2.5 h-2.5" /> Comissão</span>
                    <span className="text-amber-600 font-bold text-[11px] block">{formatCurrency(totalCommission)}</span>
                  </div>
                  <div className="bg-[var(--color-surface-elevated)] p-2 rounded-lg border border-[var(--color-border-subtle)] space-y-0.5">
                    <span className="text-[9px] text-[var(--color-text-faint)] flex items-center gap-1 uppercase"><TrendingUp className="w-2.5 h-2.5" /> Lucro</span>
                    <span className="text-emerald-600 font-bold text-[11px] block">{formatCurrency(netProfit)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── 6. RESUMO FINANCEIRO (contextual) ── */}
            <div className="bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/20 rounded-xl p-3.5 space-y-2.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary-blue)] flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> {isRecurring ? "Resumo da Assinatura" : "Resumo da Venda"}
              </span>
              {isRecurring ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-black text-[var(--color-text-primary)] font-mono">{formatCurrency(sale.cycleAmount)}</span>
                    <span className="text-[10px] font-bold text-[var(--color-text-muted)]">/ {freqLabel.toLowerCase()} · {sale.numberOfCycles} ciclo{sale.numberOfCycles > 1 ? "s" : ""}{sale.isOpenEnded ? " (contínua)" : ""}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-2 border-t border-[var(--color-primary-blue)]/10">
                    <div>
                      <span className="text-[9px] text-[var(--color-text-faint)] uppercase font-bold block">1ª cobrança</span>
                      <span className="font-black text-[var(--color-text-primary)]">{formatCurrency(sale.firstChargeAmount)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-[var(--color-text-faint)] uppercase font-bold block">Total previsto{sale.isOpenEnded ? " (12 ciclos)" : ""}</span>
                      <span className="font-black text-emerald-600">{formatCurrency(sale.totalProjectedAmount)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-[var(--color-text-faint)] uppercase font-bold block">Próximo vencimento</span>
                      <span className="font-black text-[var(--color-text-primary)]">{sale.nextDueDate ? sale.nextDueDate.toLocaleDateString("pt-BR") : "—"}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)]">
                    {sale.numberOfCycles > 1 ? `${sale.numberOfCycles}x de` : "À vista"}
                  </span>
                  <span className="text-lg font-black text-emerald-600 font-mono">
                    {sale.numberOfCycles > 1 ? formatCurrency(sale.recurringChargeAmount) : formatCurrency(sale.firstChargeAmount)}
                  </span>
                </div>
              )}
            </div>

            {/* ── 7. OBSERVAÇÃO ── */}
            <div>
              <label className={labelClass}>Observação</label>
              <input value={detalhesPagamento} onChange={(e) => setDetalhesPagamento(e.target.value)} placeholder="Ex: Cartão Visa final 4022" className={inputClass} />
            </div>
        </StepShell>

          </div>
        )}

        {/* ── AÇÕES ── */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--color-border-subtle)] sticky bottom-0 bg-[var(--color-surface-elevated)]">
          <Button type="button" variant="outline" onClick={onClose} className="h-9 px-4 text-xs font-bold">
            Cancelar
          </Button>
          <div className="flex items-center gap-2">
            {product && (
              <Button
                type="button"
                variant="outline"
                onClick={() => { handleAddToCart(); }}
                disabled={saving}
                title="Guarda este produto e volta pra etapa 1 pra escolher o próximo"
                className="h-9 px-4 text-xs font-bold gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar outro produto (+)
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={(!product && cartItems.length === 0 && !hasItemEdits) || saving}
              className="h-9 px-5 text-xs font-bold gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {saving ? "Processando..." : (existingProposal?.id ? "Salvar na Proposta" : "Concluir Venda & Automatizar Tudo")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
