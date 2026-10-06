import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  ShoppingCart, Plus, Minus, Trash2, Search, Package, Link2, Copy,
  History, ChevronDown, ChevronUp, TrendingUp, Receipt, QrCode, CreditCard,
  Banknote, ArrowDownRight, ArrowUpRight, Lock, CheckCircle2, Printer,
  Share2, RotateCcw, AlertTriangle, Sparkles, DollarSign, Wallet, Store,
  Barcode, Check, ShieldCheck, RefreshCw, X, PauseCircle, PlayCircle,
  UserCheck, HelpCircle, Volume2, VolumeX, FileText, Split, Calendar,
  Clock, Percent, Hash, Layers, CheckSquare
} from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Modal } from "../../components/ui/modal";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { friendlyError } from "../../lib/friendlyError";

// ─── AUDIO FEEDBACK (WEB AUDIO API) ──────────────────────────────────────────
function playPosSound(type: "beep" | "success" | "alert" | "error" = "beep") {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "beep") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1600, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(980, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1470, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    } else if (type === "alert") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(250, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    }
  } catch {
    // Ignora se bloqueado pelo browser
  }
}

// ─── INTERFACES ──────────────────────────────────────────────────────────────
interface VendaHistorico {
  id: string;
  cliente_nome: string | null;
  forma_pagamento: string | null;
  status: string;
  subtotal: number;
  desconto: number;
  valor_total: number;
  troco?: number;
  valor_recebido?: number;
  operador?: string;
  vendedor?: string;
  nfce_chave?: string;
  nfce_protocolo?: string;
  created_at: string;
  itens?: CartItemSnapshot[];
  pagamento_detalhe?: string;
}

interface CartItemSnapshot {
  productId: string;
  name: string;
  price: number;
  quantidade: number;
  subtotal: number;
  sku?: string;
  isAvulso?: boolean;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantidade: number;
  estoqueDisponivel: number;
  sku?: string;
  barcode?: string;
  category?: string;
  isAvulso?: boolean;
}

interface VendaEmEspera {
  id: string;
  identificador: string;
  cart: CartItem[];
  clienteNome: string;
  clienteCpf: string;
  vendedor: string;
  descontoTipo: "valor" | "porcentagem";
  descontoValor: string;
  subtotal: number;
  dataHora: string;
}

interface CaixaOperacao {
  id: string;
  tipo: "abertura" | "suprimento" | "sangria" | "fechamento";
  valor: number;
  motivo: string;
  operador: string;
  data: string;
}

const VENDEDOR_BALCAO = "Loja Geral (Balcão)";

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function VarejoVendas() {
  const { products, setProducts, colaboradores, appSettings, appSettingsLoaded } = useData();
  const { user, activeTenantId } = useAuth();
  const tenantId = activeTenantId || "default";

  // Dados oficiais da empresa do tenant ativo (mesma fonte de Configurações →
  // Dados da Empresa, app_settings key "empresa_dados") — usados no cabeçalho
  // do cupom térmico em vez de nome/CNPJ/endereço fixos. RLS + activeTenantId
  // já garantem isolamento por tenant (mesmo mecanismo que ConfigEmpresaDados.tsx).
  const empresaReceipt = useMemo(() => {
    const dados = appSettings?.["empresa_dados"] as
      | { razaoSocial?: string; nomeFantasia?: string; cnpj?: string; endereco?: string }
      | undefined;
    return {
      nome: dados?.razaoSocial || dados?.nomeFantasia || "",
      cnpj: dados?.cnpj || "",
      endereco: dados?.endereco || "",
    };
  }, [appSettings]);

  const vendedoresDisponiveis = useMemo(() => {
    const nomes = (colaboradores || [])
      .filter((c: any) => !c.status || c.status === "Ativo")
      .map((c: any) => c.nome)
      .filter(Boolean);
    return [VENDEDOR_BALCAO, ...nomes];
  }, [colaboradores]);

  const [tab, setTab] = useState<"pdv" | "historico">("pdv");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clienteNome, setClienteNome] = useState("");
  const [clienteCpf, setClienteCpf] = useState("");
  const [vendedorSelecionado, setVendedorSelecionado] = useState(VENDEDOR_BALCAO);

  // Pagamento
  const [formaPagamento, setFormaPagamento] = useState<"Dinheiro" | "Pix" | "Cartão de Crédito" | "Cartão de Débito" | "Misto" | "A Prazo (Crediário)">("Dinheiro");
  const [descontoTipo, setDescontoTipo] = useState<"valor" | "porcentagem">("valor");
  const [descontoValor, setDescontoValor] = useState<string>("");
  const [valorRecebido, setValorRecebido] = useState<string>("");
  const [parcelasCartao, setParcelasCartao] = useState<number>(1);
  const [bandeiraCartao, setBandeiraCartao] = useState<string>("Mastercard");
  const [pixConfirmado, setPixConfirmado] = useState(false);
  const [prazoDias, setPrazoDias] = useState<string>("30");
  const [finalizando, setFinalizando] = useState(false);
  // M4 (auditoria 2026-09-21): trava contra duplo-clique/duas abas no estorno
  // — sem isso, dois disparos concorrentes de handleEstornarVenda devolviam o
  // mesmo item ao estoque duas vezes.
  const [estornandoIds, setEstornandoIds] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Pagamento Misto
  const [mistoDinheiro, setMistoDinheiro] = useState<string>("");
  const [mistoPix, setMistoPix] = useState<string>("");
  const [mistoCartao, setMistoCartao] = useState<string>("");

  // Vendas em Espera (Hold / Suspender Venda) — vem da tabela real
  // `vendas_em_espera` (snapshot em jsonb), sem cache local.
  const [vendasEmEspera, setVendasEmEspera] = useState<VendaEmEspera[]>([]);
  const [modalEsperaOpen, setModalEsperaOpen] = useState(false);

  // Item Avulso Modal
  const [modalAvulsoOpen, setModalAvulsoOpen] = useState(false);
  const [avulsoNome, setAvulsoNome] = useState("");
  const [avulsoPreco, setAvulsoPreco] = useState("");
  const [avulsoQtd, setAvulsoQtd] = useState("1");

  // Modal de Ajuda / Atalhos
  const [modalAtalhosOpen, setModalAtalhosOpen] = useState(false);

  // Cupom Modal & Tab de NFC-e
  const [receiptVenda, setReceiptVenda] = useState<VendaHistorico | null>(null);
  const [receiptTab, setReceiptTab] = useState<"termico" | "nfce">("termico");

  // Caixa Operations State — só fica "aberto" quando uma abertura real for
  // encontrada no banco (ver efeito de carregamento de caixa_operacoes abaixo).
  const [caixaAberto, setCaixaAberto] = useState(false);
  const [modalCaixa, setModalCaixa] = useState<"sangria" | "suprimento" | "fechamento" | null>(null);
  const [valorOperacaoCaixa, setValorOperacaoCaixa] = useState("");
  const [motivoOperacaoCaixa, setMotivoOperacaoCaixa] = useState("");
  const [valorGavetaContado, setValorGavetaContado] = useState("");

  // Operações de caixa — tabela real `caixa_operacoes`, sem seed nem cache local.
  const [caixaOperacoes, setCaixaOperacoes] = useState<CaixaOperacao[]>([]);

  // Histórico de Vendas — populado a partir de `vendas`/`venda_items` reais
  // no Supabase (ver efeito abaixo).
  const [historico, setHistorico] = useState<VendaHistorico[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data: vendasRows, error } = await supabase
        .from("vendas")
        .select("*, venda_items(*)")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled || error || !vendasRows) return;
      setHistorico(
        vendasRows.map((v: any): VendaHistorico => ({
          id: v.id,
          cliente_nome: v.cliente_nome,
          forma_pagamento: v.forma_pagamento,
          status: v.status,
          subtotal: v.valor_total,
          desconto: 0,
          valor_total: v.valor_total,
          operador: undefined,
          vendedor: undefined,
          created_at: v.created_at,
          itens: (v.venda_items || []).map((it: any): CartItemSnapshot => ({
            productId: it.product_id,
            name: it.product_name,
            price: it.preco_unitario,
            quantidade: it.quantidade,
            subtotal: it.preco_unitario * it.quantidade,
          })),
        }))
      );
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [expandedVenda, setExpandedVenda] = useState<string | null>(null);
  const [filtroHistorico, setFiltroHistorico] = useState("");
  const [filtroHistStatus, setFiltroHistStatus] = useState("");
  const [filtroHistPagto, setFiltroHistPagto] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Carrega operações de caixa reais (abertura/sangria/suprimento/fechamento)
  // e deriva se o caixa está aberto a partir da última operação do dia.
  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const hojeInicio = new Date();
      hojeInicio.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("caixa_operacoes")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .gte("created_at", hojeInicio.toISOString())
        .order("created_at", { ascending: false });
      if (cancelled || error || !data) return;
      setCaixaOperacoes(
        data.map((op: any): CaixaOperacao => ({
          id: op.id,
          tipo: op.tipo,
          valor: op.valor,
          motivo: op.motivo || "",
          operador: op.operador || "",
          data: new Date(op.created_at).toLocaleDateString("pt-BR") + " " + new Date(op.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        }))
      );
      setCaixaAberto(data.length > 0 && data[0].tipo !== "fechamento");
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  // Carrega vendas em espera reais (snapshot do carrinho suspenso).
  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("vendas_em_espera")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (cancelled || error || !data) return;
      setVendasEmEspera(
        data.map((row: any): VendaEmEspera => ({
          id: row.id,
          identificador: row.identificador,
          dataHora: new Date(row.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          ...row.snapshot,
        }))
      );
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p: any) => {
      if (p.category) set.add(p.category);
    });
    return ["Todas", ...Array.from(set)];
  }, [products]);

  const produtosDisponiveis = useMemo(() => {
    return products.filter((p: any) => {
      if (p.active === false) return false;
      if (selectedCategory !== "Todas" && p.category !== selectedCategory) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const skuMatch = p.sku?.toLowerCase().includes(q);
      const nameMatch = p.name?.toLowerCase().includes(q);
      const barMatch = p.typeAttributes?.barcode?.toLowerCase().includes(q) || p.typeAttributes?.ean?.toLowerCase().includes(q);
      return skuMatch || nameMatch || barMatch;
    });
  }, [products, search, selectedCategory]);

  // Cálculos do Carrinho
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantidade, 0);
  }, [cart]);

  const descontoCalculado = useMemo(() => {
    const rawVal = parseFloat(descontoValor.replace(",", ".")) || 0;
    if (rawVal <= 0) return 0;
    if (descontoTipo === "porcentagem") {
      const pct = Math.min(rawVal, 100);
      return (subtotal * pct) / 100;
    }
    return Math.min(rawVal, subtotal);
  }, [descontoValor, descontoTipo, subtotal]);

  const total = Math.max(0, subtotal - descontoCalculado);

  const troco = useMemo(() => {
    if (formaPagamento !== "Dinheiro") return 0;
    const rec = parseFloat(valorRecebido.replace(",", ".")) || 0;
    return rec >= total ? rec - total : 0;
  }, [valorRecebido, total, formaPagamento]);

  const valorFaltanteDinheiro = useMemo(() => {
    if (formaPagamento !== "Dinheiro") return 0;
    const rec = parseFloat(valorRecebido.replace(",", ".")) || 0;
    return rec < total ? total - rec : 0;
  }, [valorRecebido, total, formaPagamento]);

  // Cálculos Pagamento Misto
  const totalMistoInformado = useMemo(() => {
    const d = parseFloat(mistoDinheiro.replace(",", ".")) || 0;
    const p = parseFloat(mistoPix.replace(",", ".")) || 0;
    const c = parseFloat(mistoCartao.replace(",", ".")) || 0;
    return d + p + c;
  }, [mistoDinheiro, mistoPix, mistoCartao]);

  const faltaMisto = Math.max(0, total - totalMistoInformado);

  // Adicionar ao carrinho
  const addToCart = (product: any) => {
    const estoque = product.currentStock ?? 999;
    if (estoque <= 0) {
      if (soundEnabled) playPosSound("error");
      toast.error("Produto sem estoque disponível!");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        if (existing.quantidade + 1 > estoque) {
          if (soundEnabled) playPosSound("alert");
          toast.warning(`Limite de estoque atingido (${estoque} unidades).`);
          return prev;
        }
        if (soundEnabled) playPosSound("beep");
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantidade: i.quantidade + 1 } : i
        );
      }
      if (soundEnabled) playPosSound("beep");
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: Number(product.price) || 0,
          quantidade: 1,
          estoqueDisponivel: estoque,
          sku: product.sku,
          barcode: product.typeAttributes?.barcode || product.typeAttributes?.ean,
          category: product.category,
        },
      ];
    });
  };

  const updateCartQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          if (newQty > item.estoqueDisponivel && !item.isAvulso) {
            if (soundEnabled) playPosSound("alert");
            toast.warning(`Estoque máximo disponível: ${item.estoqueDisponivel} un.`);
            return item;
          }
          if (soundEnabled) playPosSound("beep");
          return { ...item, quantidade: newQty };
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
    if (soundEnabled) playPosSound("alert");
    toast.info("Item removido do carrinho.");
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    setCart([]);
    setClienteNome("");
    setClienteCpf("");
    setDescontoValor("");
    setValorRecebido("");
    setPixConfirmado(false);
    setMistoDinheiro("");
    setMistoPix("");
    setMistoCartao("");
    if (soundEnabled) playPosSound("alert");
    toast.info("Venda cancelada / Carrinho esvaziado.");
  };

  // Leitor de Código de Barras / SKU rápido
  const handleBarcodeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!barcodeInput.trim()) return;
    const code = barcodeInput.trim().toLowerCase();
    const found = products.find(
      (p: any) =>
        p.sku?.toLowerCase() === code ||
        p.typeAttributes?.barcode?.toLowerCase() === code ||
        p.typeAttributes?.ean?.toLowerCase() === code ||
        p.name?.toLowerCase().includes(code)
    );

    if (found) {
      addToCart(found);
      setBarcodeInput("");
      toast.success(`${found.name} adicionado ao caixa!`);
    } else {
      if (soundEnabled) playPosSound("error");
      toast.error(`Produto com código ou SKU "${barcodeInput}" não encontrado.`);
    }
  };

  // Item Avulso
  const handleAdicionarItemAvulso = (e: React.FormEvent) => {
    e.preventDefault();
    const precoNum = parseFloat(avulsoPreco.replace(",", ".")) || 0;
    const qtdNum = parseInt(avulsoQtd, 10) || 1;
    if (!avulsoNome.trim() || precoNum <= 0) {
      toast.error("Informe a descrição e um preço válido para o item avulso.");
      return;
    }

    const novoItem: CartItem = {
      productId: `avulso-${Date.now()}`,
      name: avulsoNome.trim(),
      price: precoNum,
      quantidade: qtdNum,
      estoqueDisponivel: 9999,
      isAvulso: true,
      category: "Avulso",
    };

    setCart((prev) => [...prev, novoItem]);
    if (soundEnabled) playPosSound("beep");
    toast.success(`"${avulsoNome}" adicionado como item avulso.`);
    setModalAvulsoOpen(false);
    setAvulsoNome("");
    setAvulsoPreco("");
    setAvulsoQtd("1");
  };

  // Suspender Venda (Venda em Espera)
  const handleSuspenderVenda = async () => {
    if (cart.length === 0) {
      toast.error("O carrinho está vazio para suspender.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados. Não é possível suspender a venda.");
      return;
    }

    const ident = clienteNome.trim() || `Cliente Fila #${vendasEmEspera.length + 1}`;
    const id = `esp-${Date.now()}`;
    const snapshot = { cart, clienteNome, clienteCpf, vendedor: vendedorSelecionado, descontoTipo, descontoValor, subtotal };
    const { error } = await supabase.from("vendas_em_espera").insert({
      id,
      tenant_id: activeTenantId,
      identificador: ident,
      snapshot,
    });
    if (error) {
      toast.error(`Falha ao suspender venda: ${friendlyError(error)}`);
      return;
    }

    const novaEspera: VendaEmEspera = {
      id,
      identificador: ident,
      dataHora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      ...snapshot,
    };
    setVendasEmEspera((prev) => [novaEspera, ...prev]);
    clearCart();
    if (soundEnabled) playPosSound("alert");
    toast.info(`Venda suspensa para "${ident}". Você pode retomar a qualquer momento.`);
  };

  // Retomar Venda em Espera
  const handleRetomarVenda = async (espera: VendaEmEspera) => {
    if (cart.length > 0) {
      toast.warning("Finalize ou limpe a venda atual antes de retomar outra em espera.");
      return;
    }

    if (supabase) {
      const { error } = await supabase.from("vendas_em_espera").delete().eq("id", espera.id);
      if (error) {
        toast.error(`Falha ao retomar venda: ${friendlyError(error)}`);
        return;
      }
    }

    setCart(espera.cart);
    setClienteNome(espera.clienteNome);
    setClienteCpf(espera.clienteCpf);
    setVendedorSelecionado(espera.vendedor);
    setDescontoTipo(espera.descontoTipo);
    setDescontoValor(espera.descontoValor);

    setVendasEmEspera((prev) => prev.filter((e) => e.id !== espera.id));
    setModalEsperaOpen(false);
    if (soundEnabled) playPosSound("success");
    toast.success(`Venda de "${espera.identificador}" retomada no terminal.`);
  };

  // Atalhos de teclado globais
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Evita disparar atalhos especiais se modal estiver aberto e pressionar Esc
      if (e.key === "Escape") {
        setModalCaixa(null);
        setModalAvulsoOpen(false);
        setModalEsperaOpen(false);
        setModalAtalhosOpen(false);
        setReceiptVenda(null);
        return;
      }

      if (e.key === "F1") {
        e.preventDefault();
        setModalAtalhosOpen(true);
      } else if (e.key === "F2") {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === "F3") {
        e.preventDefault();
        document.getElementById("input-cliente-nome")?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        document.getElementById("input-desconto")?.focus();
      } else if (e.key === "F7") {
        e.preventDefault();
        setModalAvulsoOpen(true);
      } else if (e.key === "F8") {
        e.preventDefault();
        clearCart();
      } else if (e.key === "F9") {
        e.preventDefault();
        if (cart.length > 0) {
          handleSuspenderVenda();
        } else if (vendasEmEspera.length > 0) {
          setModalEsperaOpen(true);
        }
      } else if (e.key === "F10") {
        e.preventDefault();
        if (cart.length > 0 && caixaAberto) {
          handleFinalizarVenda();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, vendasEmEspera, caixaAberto, soundEnabled, clienteNome, clienteCpf, vendedorSelecionado, descontoTipo, descontoValor, subtotal]);

  // Finalizar Venda
  const handleFinalizarVenda = async () => {
    if (cart.length === 0) {
      if (soundEnabled) playPosSound("error");
      toast.error("Adicione ao menos um produto ao carrinho.");
      return;
    }

    if (!caixaAberto) {
      if (soundEnabled) playPosSound("error");
      toast.error("O caixa está fechado. Reabra o turno para registrar vendas.");
      return;
    }

    if (formaPagamento === "Dinheiro") {
      const rec = parseFloat(valorRecebido.replace(",", ".")) || 0;
      if (rec > 0 && rec < total) {
        if (soundEnabled) playPosSound("error");
        toast.error(`Valor em dinheiro insuficiente. Faltam ${formatPrice(total - rec)}.`);
        return;
      }
    }

    if (formaPagamento === "Misto") {
      if (faltaMisto > 0.05) {
        if (soundEnabled) playPosSound("error");
        toast.error(`Pagamento misto incompleto! Faltam ${formatPrice(faltaMisto)}.`);
        return;
      }
    }

    setFinalizando(true);

    try {
      const vendaId = crypto.randomUUID();
      const operadorNome = user?.name || "Operador Caixa";
      const recNumber = parseFloat(valorRecebido.replace(",", ".")) || total;

      // Gerar chave NFC-e simulada de 44 dígitos
      const randomKeyDigits = Array.from({ length: 11 }, () => Math.floor(1000 + Math.random() * 9000)).join(" ");
      const randomProtocol = `1352600${Math.floor(10000000 + Math.random() * 90000000)}`;

      let formaDesc = formaPagamento as string;
      if (formaPagamento === "Cartão de Crédito") {
        formaDesc = `Cartão Crédito (${parcelasCartao}x - ${bandeiraCartao})`;
      } else if (formaPagamento === "Cartão de Débito") {
        formaDesc = `Cartão Débito (${bandeiraCartao})`;
      } else if (formaPagamento === "Misto") {
        const partes: string[] = [];
        if (Number(mistoDinheiro) > 0) partes.push(`Dinheiro: R$ ${mistoDinheiro}`);
        if (Number(mistoPix) > 0) partes.push(`Pix: R$ ${mistoPix}`);
        if (Number(mistoCartao) > 0) partes.push(`Cartão: R$ ${mistoCartao}`);
        formaDesc = `Misto (${partes.join(" + ")})`;
      } else if (formaPagamento === "A Prazo (Crediário)") {
        formaDesc = `Crediário / A Prazo (${prazoDias} dias)`;
      }

      const vendaSnap: VendaHistorico = {
        id: vendaId,
        cliente_nome: clienteNome.trim() ? `${clienteNome.trim()}${clienteCpf ? ` (${clienteCpf})` : ""}` : "Consumidor Final",
        forma_pagamento: formaDesc,
        status: "paga",
        subtotal,
        desconto: descontoCalculado,
        valor_total: total,
        troco: troco > 0 ? troco : undefined,
        valor_recebido: formaPagamento === "Dinheiro" ? recNumber : undefined,
        operador: operadorNome,
        vendedor: vendedorSelecionado,
        nfce_chave: randomKeyDigits,
        nfce_protocolo: randomProtocol,
        created_at: new Date().toISOString(),
        itens: cart.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          quantidade: i.quantidade,
          subtotal: i.price * i.quantidade,
          sku: i.sku,
          isAvulso: i.isAvulso,
        })),
      };

      // 1. Grava a venda no banco (aberta) + itens, e finaliza atomicamente via
      // RPC: a função valida estoque, baixa produtos, registra
      // estoque_movimentacoes e cria o lançamento financeiro — tudo ou nada.
      if (!supabase || !activeTenantId) {
        throw new Error("Sem conexão com o banco de dados. Não é possível registrar a venda.");
      }

      // `vendas.vendedor_id` é uuid (FK pra `users.id`) — resolve pelo `user_id` do
      // colaborador selecionado, não pelo `id` (text) usado só como chave local.
      const vendedorColaborador = (colaboradores as any[]).find((c: any) => c.nome === vendedorSelecionado);

      const { error: vendaError } = await supabase.from("vendas").insert({
        id: vendaId,
        tenant_id: activeTenantId,
        cliente_nome: vendaSnap.cliente_nome,
        vendedor_id: vendedorColaborador?.user_id || null,
        forma_pagamento: formaDesc,
        status: "aberta",
      });
      if (vendaError) throw new Error(`Falha ao registrar venda: ${vendaError.message}`);

      // Distribui o desconto proporcionalmente no preço unitário de cada item,
      // para que a soma dos itens bata com o total realmente cobrado.
      const discountRatio = subtotal > 0 ? total / subtotal : 1;
      const { error: itemsError } = await supabase.from("venda_items").insert(
        cart.map((item) => ({
          tenant_id: activeTenantId,
          venda_id: vendaId,
          product_id: item.isAvulso ? null : item.productId,
          product_name: item.name,
          quantidade: item.quantidade,
          preco_unitario: Math.round(item.price * discountRatio * 100) / 100,
        }))
      );
      if (itemsError) throw new Error(`Falha ao registrar itens da venda: ${itemsError.message}`);

      const { data: rpcResult, error: rpcError } = await supabase.rpc("finalizar_venda", { p_venda_id: vendaId });
      if (rpcError) throw new Error(`Falha ao finalizar venda: ${rpcError.message}`);

      const valorFinal = Number((rpcResult as any)?.valor_total ?? total);
      vendaSnap.valor_total = valorFinal;

      // Reflete a baixa de estoque na lista local de produtos (a fonte de
      // verdade já foi atualizada no banco pela RPC acima).
      setProducts(
        products.map((prod: any) => {
          const itemInCart = cart.find((c) => c.productId === prod.id && !c.isAvulso);
          if (!itemInCart) return prod;
          return { ...prod, currentStock: Math.max(0, (prod.currentStock ?? 0) - itemInCart.quantidade) };
        })
      );

      // Lançar nos Pedidos Varejo (painel de separação/entrega)
      try {
        const itensDesc = cart.map((i) => `${i.quantidade}x ${i.name}`).join(", ");
        await supabase!.from("varejo_pedidos").insert({
          // M3 (auditoria 2026-09-21): id aleatório numérico colidia com o
          // esquema usado em PedidosVarejo.tsx. UUID como o resto do sistema.
          id: `PED-${crypto.randomUUID()}`,
          tenant_id: activeTenantId,
          cliente: vendaSnap.cliente_nome || "Consumidor Final",
          telefone: "",
          itens: itensDesc,
          total: valorFinal,
          forma_pagto: vendaSnap.forma_pagamento || "Dinheiro",
          status: "Entregue / Concluído",
        });
      } catch {}

      // Atualizar histórico e exibir comprovante
      setHistorico((prev) => [vendaSnap, ...prev]);
      setReceiptVenda(vendaSnap);
      setReceiptTab("termico");

      // Limpar carrinho
      setCart([]);
      setClienteNome("");
      setClienteCpf("");
      setDescontoValor("");
      setValorRecebido("");
      setPixConfirmado(false);
      setMistoDinheiro("");
      setMistoPix("");
      setMistoCartao("");

      if (soundEnabled) playPosSound("success");
      toast.success(`Venda ${vendaId} concluída com sucesso!`);
    } catch (err: any) {
      if (soundEnabled) playPosSound("error");
      toast.error(`Falha ao finalizar venda: ${friendlyError(err)}`);
    } finally {
      setFinalizando(false);
    }
  };

  // Estornar venda
  const handleEstornarVenda = async (venda: VendaHistorico) => {
    const ok = await confirmDialog({
      title: "Estornar Venda do PDV?",
      description: `Tem certeza que deseja estornar a venda ${venda.id} no valor de ${formatPrice(venda.valor_total)}? Os itens retornarão automaticamente ao estoque.`,
      confirmLabel: "Sim, Estornar Venda",
      variant: "danger",
    });

    if (!ok) return;

    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados. Não é possível estornar a venda.");
      return;
    }

    if (estornandoIds.has(venda.id)) return;
    setEstornandoIds((prev) => new Set(prev).add(venda.id));

    try {
      // M4: `.eq("status", "paga")` garante que só a PRIMEIRA execução
      // concorrente encontra a linha nesse status e de fato a atualiza — a
      // segunda (duplo clique, outra aba) recebe 0 linhas afetadas e aborta
      // antes de devolver o estoque de novo.
      const { data: updData, error: updError } = await supabase
        .from("vendas")
        .update({ status: "cancelada" })
        .eq("id", venda.id)
        .eq("status", "paga")
        .select("id");
      if (updError) throw new Error(updError.message);
      if (!updData || updData.length === 0) {
        toast.error("Esta venda já foi estornada.");
        return;
      }

      // Devolve ao estoque real (banco) cada item que veio do catálogo (ignora avulsos)
      const realItems = (venda.itens || []).filter((it) => it.productId && !it.isAvulso);
      for (const item of realItems) {
        const { error: movError } = await supabase.rpc("registrar_movimentacao_estoque", {
          p_product_id: item.productId,
          p_tipo: "entrada",
          p_quantidade: item.quantidade,
          p_motivo: `Estorno da venda ${venda.id}`,
        });
        if (movError) console.error("Falha ao devolver estoque do item:", item.productId, movError);
      }

      setProducts(
        products.map((prod: any) => {
          const item = realItems.find((it) => it.productId === prod.id);
          if (!item) return prod;
          return { ...prod, currentStock: (prod.currentStock ?? 0) + item.quantidade };
        })
      );

      setHistorico((prev) =>
        prev.map((v) => (v.id === venda.id ? { ...v, status: "estornada" } : v))
      );

      if (soundEnabled) playPosSound("alert");
      toast.success("Venda estornada e estoque devolvido com sucesso!");
    } catch (err: any) {
      if (soundEnabled) playPosSound("error");
      toast.error(`Falha ao estornar venda: ${friendlyError(err)}`);
    } finally {
      setEstornandoIds((prev) => {
        const next = new Set(prev);
        next.delete(venda.id);
        return next;
      });
    }
  };

  // Operações de Caixa
  const registrarOperacaoCaixa = async (tipo: CaixaOperacao["tipo"], valor: number, motivo: string) => {
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados. Não é possível registrar a operação de caixa.");
      return null;
    }
    const { data, error } = await supabase
      .from("caixa_operacoes")
      .insert({
        tenant_id: activeTenantId,
        tipo,
        valor,
        motivo,
        operador: user?.name || "Operador Caixa",
      })
      .select()
      .single();
    if (error || !data) {
      toast.error(`Falha ao registrar operação de caixa: ${error?.message || "erro desconhecido"}`);
      return null;
    }
    const novaOp: CaixaOperacao = {
      id: data.id,
      tipo: data.tipo,
      valor: data.valor,
      motivo: data.motivo || "",
      operador: data.operador || "",
      data: new Date(data.created_at).toLocaleDateString("pt-BR") + " " + new Date(data.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
    setCaixaOperacoes((prev) => [novaOp, ...prev]);
    return novaOp;
  };

  const handleExecutarOperacaoCaixa = async () => {
    const val = parseFloat(valorOperacaoCaixa.replace(",", ".")) || 0;
    if (val <= 0 && modalCaixa !== "fechamento") {
      toast.error("Informe um valor válido.");
      return;
    }

    if (!motivoOperacaoCaixa.trim() && modalCaixa !== "fechamento") {
      toast.error("Informe o motivo da operação.");
      return;
    }

    const motivo = motivoOperacaoCaixa.trim() || (modalCaixa === "fechamento" ? "Fechamento de Turno com Conferência" : "Operação de Caixa");
    const resultado = await registrarOperacaoCaixa(modalCaixa || "sangria", val, motivo);
    if (!resultado) return;

    if (modalCaixa === "fechamento") {
      setCaixaAberto(false);
      if (soundEnabled) playPosSound("alert");
      toast.success("Caixa fechado com sucesso!");
    } else {
      if (soundEnabled) playPosSound("success");
      toast.success(`${modalCaixa === "sangria" ? "Sangria" : "Suprimento"} de ${formatPrice(val)} registrado!`);
    }

    setModalCaixa(null);
    setValorOperacaoCaixa("");
    setMotivoOperacaoCaixa("");
    setValorGavetaContado("");
  };

  const handleReabrirCaixa = async () => {
    const resultado = await registrarOperacaoCaixa("abertura", 0, "Reabertura de Caixa");
    if (!resultado) return;
    setCaixaAberto(true);
    toast.success("Caixa reaberto com sucesso!");
  };

  // Métricas do dia
  const hojeStr = new Date().toISOString().split("T")[0];
  const vendasHoje = historico.filter(
    (v) => v.status === "paga" && v.created_at.startsWith(hojeStr)
  );
  const faturamentoHoje = vendasHoje.reduce((s, v) => s + Number(v.valor_total), 0);
  const ticketMedioHoje = vendasHoje.length > 0 ? faturamentoHoje / vendasHoje.length : 0;
  const itensVendidosHoje = vendasHoje.reduce(
    (acc, v) => acc + (v.itens?.reduce((sub, it) => sub + it.quantidade, 0) || 0),
    0
  );

  // Histórico de vendas filtrado (aba "Histórico") — alimenta os KPIs e a lista.
  const historicoFiltrado = historico.filter((v) => {
    if (filtroHistStatus && v.status !== filtroHistStatus) return false;
    if (filtroHistPagto && v.forma_pagamento !== filtroHistPagto) return false;
    if (!filtroHistorico.trim()) return true;
    const q = filtroHistorico.toLowerCase();
    return (
      v.id.toLowerCase().includes(q) ||
      (v.cliente_nome && v.cliente_nome.toLowerCase().includes(q)) ||
      (v.operador && v.operador.toLowerCase().includes(q))
    );
  });
  const histPagas = historicoFiltrado.filter((v) => v.status === "paga");
  const histFaturamento = histPagas.reduce((s, v) => s + (Number(v.valor_total) || 0), 0);
  const histTicket = histPagas.length > 0 ? histFaturamento / histPagas.length : 0;
  const histEstornadas = historicoFiltrado.filter((v) => v.status === "estornada").length;
  const histPagtoOpts = Array.from(new Set(historico.map((v) => v.forma_pagamento).filter(Boolean) as string[])).sort();
  const histStatusOpts = Array.from(new Set(historico.map((v) => v.status).filter(Boolean))).sort();
  const histActiveFilters = (filtroHistorico.trim() ? 1 : 0) + (filtroHistStatus ? 1 : 0) + (filtroHistPagto ? 1 : 0);
  const limparFiltrosHistorico = () => { setFiltroHistorico(""); setFiltroHistStatus(""); setFiltroHistPagto(""); };

  const saldoCaixaCalculado = useMemo(() => {
    let saldo = 0;
    caixaOperacoes.forEach((op) => {
      if (op.tipo === "abertura" || op.tipo === "suprimento") saldo += op.valor;
      if (op.tipo === "sangria") saldo -= op.valor;
    });
    // soma pagamentos em dinheiro do dia
    vendasHoje.forEach((v) => {
      if (v.forma_pagamento?.toLowerCase().includes("dinheiro")) {
        saldo += v.valor_total;
      }
    });
    return Math.max(0, saldo);
  }, [caixaOperacoes, vendasHoje]);

  const catalogUrl = activeTenantId ? `${window.location.origin}/catalogo/${activeTenantId}` : "";

  return (
    <PageContainer
      title="Frente de Caixa (PDV Comercial)"
      description="Terminal de vendas de alta performance, leitor de código de barras, vendas em espera, atalhos de teclado e gestão de caixa."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Som de bip do leitor */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="h-9 px-2.5 text-xs font-semibold gap-1.5"
            title={soundEnabled ? "Desativar Bip Sonoro" : "Ativar Bip Sonoro"}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-500" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
            <span className="hidden sm:inline">{soundEnabled ? "Bip Ativo" : "Mudo"}</span>
          </Button>

          {/* Atalhos F1 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalAtalhosOpen(true)}
            className="h-9 px-3 text-xs font-semibold gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
            <span className="hidden sm:inline">Atalhos (F1)</span>
          </Button>

          {/* Vendas em Espera */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalEsperaOpen(true)}
            className={`h-9 px-3 text-xs font-bold gap-1.5 ${vendasEmEspera.length > 0 ? "border-amber-500 text-amber-500 bg-amber-500/10" : ""}`}
          >
            <PauseCircle className="w-3.5 h-3.5" />
            <span>Em Espera</span>
            {vendasEmEspera.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-black">
                {vendasEmEspera.length}
              </span>
            )}
          </Button>

          {/* Operações de Caixa */}
          {caixaAberto ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalCaixa("suprimento")}
                className="h-9 px-3 text-xs font-semibold gap-1 hover:text-emerald-500 hover:border-emerald-500"
              >
                <ArrowDownRight className="w-3.5 h-3.5 text-emerald-500" /> Suprimento
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalCaixa("sangria")}
                className="h-9 px-3 text-xs font-semibold gap-1 hover:text-amber-500 hover:border-amber-500"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-amber-500" /> Sangria
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalCaixa("fechamento")}
                className="h-9 px-3 text-xs font-semibold gap-1 hover:text-red-500 hover:border-red-500"
              >
                <Lock className="w-3.5 h-3.5 text-red-500" /> Fechar Caixa
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleReabrirCaixa}
              className="h-9 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              <Store className="w-3.5 h-3.5" /> Reabrir Caixa
            </Button>
          )}

          {catalogUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(catalogUrl);
                toast.success("Link do catálogo público copiado!");
              }}
              className="h-9 px-3 text-xs font-semibold gap-1.5"
            >
              <Link2 className="w-3.5 h-3.5" /> Catálogo
            </Button>
          )}
        </div>
      }
    >
      {/* Resumo do Turno / Status Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Card className="p-3 bg-[var(--color-surface-elevated)]/40 border border-[var(--color-border-subtle)]">
          <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-0.5">Status do Terminal</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${caixaAberto ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-sm font-bold text-[var(--color-text-primary)]">{caixaAberto ? "Caixa Aberto" : "Caixa Fechado"}</span>
          </div>
        </Card>

        <Card className="p-3 bg-[var(--color-surface-elevated)]/40 border border-[var(--color-border-subtle)]">
          <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-0.5">Vendas Hoje</span>
          <div className="text-sm font-black text-[var(--color-text-primary)]">{vendasHoje.length} pedidos</div>
        </Card>

        <Card className="p-3 bg-[var(--color-surface-elevated)]/40 border border-[var(--color-border-subtle)]">
          <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-0.5">Faturamento Hoje</span>
          <div className="text-sm font-black text-emerald-500 font-mono">{formatPrice(faturamentoHoje)}</div>
        </Card>

        <Card className="p-3 bg-[var(--color-surface-elevated)]/40 border border-[var(--color-border-subtle)]">
          <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-0.5">Ticket Médio</span>
          <div className="text-sm font-black text-blue-500 font-mono">{formatPrice(ticketMedioHoje)}</div>
        </Card>

        <Card className="p-3 bg-[var(--color-surface-elevated)]/40 border border-[var(--color-border-subtle)] col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-0.5">Saldo em Dinheiro</span>
          <div className="text-sm font-black text-amber-500 font-mono">{formatPrice(saldoCaixaCalculado)}</div>
        </Card>
      </div>

      {/* Barra Rápida de Teclas de Atalho */}
      <div className="hidden md:flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] rounded-xl text-[11px] text-[var(--color-text-muted)] mb-4">
        <div className="flex items-center gap-4">
          <span><kbd className="px-1.5 py-0.5 bg-[var(--color-surface)] border rounded text-[10px] font-mono font-bold text-[var(--color-text-primary)]">F2</kbd> Leitor / Buscar</span>
          <span><kbd className="px-1.5 py-0.5 bg-[var(--color-surface)] border rounded text-[10px] font-mono font-bold text-[var(--color-text-primary)]">F3</kbd> Cliente</span>
          <span><kbd className="px-1.5 py-0.5 bg-[var(--color-surface)] border rounded text-[10px] font-mono font-bold text-[var(--color-text-primary)]">F4</kbd> Desconto</span>
          <span><kbd className="px-1.5 py-0.5 bg-[var(--color-surface)] border rounded text-[10px] font-mono font-bold text-[var(--color-text-primary)]">F7</kbd> Item Avulso</span>
          <span><kbd className="px-1.5 py-0.5 bg-[var(--color-surface)] border rounded text-[10px] font-mono font-bold text-[var(--color-text-primary)]">F8</kbd> Limpar Carrinho</span>
          <span><kbd className="px-1.5 py-0.5 bg-[var(--color-surface)] border rounded text-[10px] font-mono font-bold text-[var(--color-text-primary)]">F9</kbd> Suspender Venda</span>
          <span><kbd className="px-1.5 py-0.5 bg-[var(--color-surface)] border rounded text-[10px] font-mono font-bold text-emerald-500">F10</kbd> Finalizar</span>
        </div>
        <button onClick={() => setModalAtalhosOpen(true)} className="text-blue-500 hover:underline font-bold text-[10px]">
          Ver todos os atalhos
        </button>
      </div>

      {/* Tabs Switcher: PDV vs Histórico */}
      <div className="flex bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl p-1 gap-1 w-fit mb-4 shadow-xs">
        <button
          onClick={() => setTab("pdv")}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
            tab === "pdv"
              ? "bg-[var(--color-primary-blue)] text-white shadow-xs"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" /> Frente de Caixa (PDV)
          {cart.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-white text-blue-600 rounded-full font-black">
              {cart.reduce((s, i) => s + i.quantidade, 0)}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("historico")}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
            tab === "historico"
              ? "bg-[var(--color-primary-blue)] text-white shadow-xs"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          <History className="w-3.5 h-3.5" /> Histórico de Vendas ({historico.length})
        </button>
      </div>

      {/* ABA 1: PDV FRENTE DE CAIXA */}
      {tab === "pdv" && (
        <div className="grid lg:grid-cols-12 gap-5 items-start">
          {/* LADO ESQUERDO: CATÁLOGO, LEITOR E PRODUTOS (Colunas 7 de 12) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Barra de Leitor de Código de Barras / SKU com Bip */}
            <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                <input
                  ref={barcodeInputRef}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Leitor de Código de Barras (EAN) ou SKU... [F2 / Enter]"
                  className="w-full pl-9 pr-3 h-11 text-xs font-mono bg-[var(--color-surface)] border border-blue-500/30 rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500"
                />
              </div>
              <Button type="submit" className="h-11 px-4 font-bold text-xs gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
                <Sparkles className="w-3.5 h-3.5" /> Bipar (Enter)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalAvulsoOpen(true)}
                className="h-11 px-3.5 font-bold text-xs gap-1 border-purple-500/30 text-purple-500 hover:bg-purple-500/10"
                title="Adicionar Item Avulso (F7)"
              >
                <Plus className="w-3.5 h-3.5" /> Avulso (F7)
              </Button>
            </form>

            {/* Busca textual e categorias */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar produto pelo nome, modelo ou marca..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                />
              </div>

              {/* Categorias em Pílulas */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      selectedCategory === cat
                        ? "bg-[var(--color-primary-blue)] text-white shadow-xs"
                        : "bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid de Produtos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {produtosDisponiveis.map((product: any) => {
                const itemNoCarrinho = cart.find((i) => i.productId === product.id);
                const estoque = product.currentStock ?? 0;
                const esgotado = estoque <= 0;

                return (
                  <Card
                    key={product.id}
                    className={`p-3 border transition-all flex flex-col justify-between group ${
                      esgotado
                        ? "opacity-50 border-red-500/20 bg-red-500/5 cursor-not-allowed"
                        : itemNoCarrinho
                        ? "border-blue-500/50 bg-blue-500/5 shadow-xs"
                        : "border-[var(--color-border-subtle)] hover:border-blue-500/40 bg-[var(--color-surface)]"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wide truncate">
                          {product.category || "Geral"}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                            estoque > 10
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : estoque > 0
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                              : "bg-red-500/10 text-red-500 border-red-500/20"
                          }`}
                        >
                          {estoque > 0 ? `${estoque} un.` : "Esgotado"}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-[var(--color-text-primary)] line-clamp-2 min-h-[32px] group-hover:text-blue-500 transition-colors">
                        {product.name}
                      </h4>

                      {product.sku && (
                        <span className="text-[9px] font-mono text-[var(--color-text-muted)] block mt-0.5">
                          SKU: {product.sku}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-[var(--color-border-subtle)]">
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-sm font-black font-mono text-[var(--color-text-primary)]">
                          {formatPrice(Number(product.price) || 0)}
                        </span>
                      </div>

                      {itemNoCarrinho ? (
                        <div className="flex items-center justify-between bg-blue-600/10 rounded-lg p-1 border border-blue-500/30">
                          <button
                            type="button"
                            onClick={() => updateCartQty(product.id, itemNoCarrinho.quantidade - 1)}
                            className="w-6 h-6 rounded bg-[var(--color-surface)] hover:bg-red-500/20 hover:text-red-500 text-[var(--color-text-primary)] flex items-center justify-center font-bold text-xs"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-xs text-blue-500 font-mono">
                            {itemNoCarrinho.quantidade} un.
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(product.id, itemNoCarrinho.quantidade + 1)}
                            className="w-6 h-6 rounded bg-[var(--color-surface)] hover:bg-blue-600 hover:text-white text-[var(--color-text-primary)] flex items-center justify-center font-bold text-xs"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          disabled={esgotado}
                          onClick={() => addToCart(product)}
                          className="w-full text-xs font-bold h-7 gap-1 bg-[var(--color-surface-elevated)] hover:bg-blue-600 hover:text-white text-[var(--color-text-primary)] border border-[var(--color-border-subtle)]"
                        >
                          <Plus className="w-3 h-3" /> Adicionar
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}

              {produtosDisponiveis.length === 0 && (
                <div className="col-span-full p-8 text-center bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-2xl">
                  <Package className="w-8 h-8 text-[var(--color-text-muted)] mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">Nenhum produto encontrado</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Tente outro filtro ou cadastre um item avulso (F7)</p>
                </div>
              )}
            </div>
          </div>

          {/* LADO DIREITO: CARRINHO E CHECKOUT (Colunas 5 de 12) */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-4 border border-[var(--color-border-default)] bg-[var(--color-surface)] shadow-md space-y-4">
              {/* Header do Carrinho */}
              <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border-subtle)]">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-black text-[var(--color-text-primary)]">
                    Itens da Venda ({cart.reduce((s, i) => s + i.quantidade, 0)})
                  </h3>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-[11px] font-bold text-red-500 hover:underline flex items-center gap-1"
                    title="Limpar Venda (F8)"
                  >
                    <Trash2 className="w-3 h-3" /> Limpar (F8)
                  </button>
                )}
              </div>

              {/* Vendedor / Atendente da Venda */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mb-1 flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-blue-500" /> Vendedor / Atendente Responsável
                </label>
                <select
                  value={vendedorSelecionado}
                  onChange={(e) => setVendedorSelecionado(e.target.value)}
                  className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500"
                >
                  {vendedoresDisponiveis.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Dados do Cliente (Opcional - F3) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">
                    Cliente (F3)
                  </label>
                  <input
                    id="input-cliente-nome"
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    placeholder="Nome completo..."
                    className="w-full px-2.5 py-1.5 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">
                    CPF na Nota
                  </label>
                  <input
                    value={clienteCpf}
                    onChange={(e) => setClienteCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full px-2.5 py-1.5 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Lista de Itens no Carrinho */}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                {cart.map((item) => (
                  <div
                    key={item.productId}
                    className="p-2.5 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                          {item.name}
                        </span>
                        {item.isAvulso && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/10 text-purple-500 font-bold border border-purple-500/20">
                            Avulso
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                        {item.quantidade} x {formatPrice(item.price)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.productId, item.quantidade - 1)}
                          className="w-5 h-5 rounded hover:bg-red-500/10 hover:text-red-500 flex items-center justify-center text-xs font-bold"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold font-mono">
                          {item.quantidade}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.productId, item.quantidade + 1)}
                          className="w-5 h-5 rounded hover:bg-blue-600 hover:text-white flex items-center justify-center text-xs font-bold"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      <span className="text-xs font-black font-mono text-[var(--color-text-primary)] w-16 text-right">
                        {formatPrice(item.price * item.quantidade)}
                      </span>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.productId)}
                        className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/25 p-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {cart.length === 0 && (
                  <div className="py-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)]/40 rounded-xl border border-dashed border-[var(--color-border-subtle)]">
                    <ShoppingCart className="w-7 h-7 mx-auto mb-1.5 opacity-30" />
                    Carrinho vazio. Bipe ou selecione um produto ao lado.
                  </div>
                )}
              </div>

              {/* Desconto (F4) */}
              <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase text-[var(--color-text-muted)] flex items-center gap-1">
                    <Percent className="w-3 h-3 text-emerald-500" /> Desconto (F4)
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="flex rounded-lg border border-[var(--color-border-subtle)] overflow-hidden text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setDescontoTipo("valor")}
                        className={`px-2 py-0.5 ${descontoTipo === "valor" ? "bg-emerald-600 text-white" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"}`}
                      >
                        R$
                      </button>
                      <button
                        type="button"
                        onClick={() => setDescontoTipo("porcentagem")}
                        className={`px-2 py-0.5 ${descontoTipo === "porcentagem" ? "bg-emerald-600 text-white" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"}`}
                      >
                        %
                      </button>
                    </div>
                    <input
                      id="input-desconto"
                      type="number"
                      step="0.01"
                      value={descontoValor}
                      onChange={(e) => setDescontoValor(e.target.value)}
                      placeholder="0"
                      className="w-20 px-2 py-1 text-right text-xs font-mono font-bold bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-lg text-[var(--color-text-primary)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Seletor de Forma de Pagamento */}
              <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block">
                  Forma de Pagamento
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      "Dinheiro",
                      "Pix",
                      "Cartão de Crédito",
                      "Cartão de Débito",
                      "Misto",
                      "A Prazo (Crediário)",
                    ] as const
                  ).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFormaPagamento(m)}
                      className={`p-2 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 text-center ${
                        formaPagamento === m
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                          : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      {m === "Dinheiro" && <Banknote className="w-3 h-3" />}
                      {m === "Pix" && <QrCode className="w-3 h-3" />}
                      {m === "Cartão de Crédito" && <CreditCard className="w-3 h-3" />}
                      {m === "Cartão de Débito" && <Wallet className="w-3 h-3" />}
                      {m === "Misto" && <Split className="w-3 h-3" />}
                      {m === "A Prazo (Crediário)" && <Calendar className="w-3 h-3" />}
                      <span className="truncate">{m === "A Prazo (Crediário)" ? "A Prazo" : m}</span>
                    </button>
                  ))}
                </div>

                {/* Sub-painel específico por forma de pagamento */}
                {formaPagamento === "Dinheiro" && (
                  <div className="p-3 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-border-subtle)] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[var(--color-text-muted)]">Valor Recebido:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={valorRecebido}
                        onChange={(e) => setValorRecebido(e.target.value)}
                        placeholder="R$ 0,00"
                        className="w-28 px-2 py-1 text-right font-mono font-bold bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg text-xs"
                      />
                    </div>
                    {/* Botões Rápidos de Cédulas */}
                    <div className="flex gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => setValorRecebido(total.toFixed(2))}
                        className="px-2 py-0.5 text-[10px] font-bold rounded bg-[var(--color-surface)] border hover:border-blue-500"
                      >
                        Exato
                      </button>
                      {[20, 50, 100, 200].map((ced) => (
                        <button
                          key={ced}
                          type="button"
                          onClick={() => setValorRecebido(String(ced))}
                          className="px-2 py-0.5 text-[10px] font-bold rounded bg-[var(--color-surface)] border hover:border-blue-500"
                        >
                          R$ {ced}
                        </button>
                      ))}
                    </div>
                    {/* Alerta de Troco */}
                    <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border-subtle)] text-xs">
                      <span className="font-black text-[var(--color-text-primary)]">Troco:</span>
                      <span
                        className={`font-black font-mono text-sm ${
                          troco > 0
                            ? "text-emerald-500"
                            : valorFaltanteDinheiro > 0
                            ? "text-amber-500"
                            : "text-[var(--color-text-primary)]"
                        }`}
                      >
                        {valorFaltanteDinheiro > 0
                          ? `Faltam ${formatPrice(valorFaltanteDinheiro)}`
                          : formatPrice(troco)}
                      </span>
                    </div>
                  </div>
                )}

                {formaPagamento === "Pix" && (
                  <div className="p-3 bg-[var(--color-surface-sunken)] rounded-xl border border-blue-500/30 space-y-2 text-center">
                    <div className="w-20 h-20 mx-auto bg-white p-1.5 rounded-xl flex items-center justify-center shadow-inner">
                      <QrCode className="w-16 h-16 text-slate-900" />
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      Chave Pix Aleatória gerada para esta venda:
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        readOnly
                        value={`00020126580014br.gov.bcb.pix0136${tenantId.substring(0, 12)}5204000053039865802BR`}
                        className="text-[9px] font-mono bg-[var(--color-surface)] border rounded px-2 py-1 flex-1 text-[var(--color-text-muted)] truncate"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText("00020126580014br.gov.bcb.pix");
                          toast.success("Código Pix Copia e Cola copiado!");
                        }}
                        className="h-7 text-[10px] font-bold shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPixConfirmado(true);
                        if (soundEnabled) playPosSound("success");
                        toast.success("Pagamento Pix confirmado!");
                      }}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all ${
                        pixConfirmado
                          ? "bg-emerald-600 text-white flex items-center justify-center gap-1.5"
                          : "bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 border border-blue-500/30"
                      }`}
                    >
                      {pixConfirmado ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Pix Confirmado pelo Banco
                        </>
                      ) : (
                        "Simular Confirmação Instantânea"
                      )}
                    </button>
                  </div>
                )}

                {formaPagamento === "Cartão de Crédito" && (
                  <div className="p-3 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-border-subtle)] space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-[var(--color-text-muted)] font-bold block mb-1">
                          Parcelamento:
                        </label>
                        <select
                          value={parcelasCartao}
                          onChange={(e) => setParcelasCartao(Number(e.target.value))}
                          className="w-full bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg p-1.5 text-xs font-bold text-[var(--color-text-primary)]"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n}x de {formatPrice(total / n)} {n === 1 ? "(à vista)" : "sem juros"}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-[var(--color-text-muted)] font-bold block mb-1">
                          Bandeira:
                        </label>
                        <select
                          value={bandeiraCartao}
                          onChange={(e) => setBandeiraCartao(e.target.value)}
                          className="w-full bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg p-1.5 text-xs font-bold text-[var(--color-text-primary)]"
                        >
                          {["Mastercard", "Visa", "Elo", "Hipercard", "Amex"].map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {formaPagamento === "Cartão de Débito" && (
                  <div className="p-2.5 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-border-subtle)] text-xs flex items-center justify-between">
                    <span className="text-[var(--color-text-muted)] font-bold">Bandeira do Débito:</span>
                    <select
                      value={bandeiraCartao}
                      onChange={(e) => setBandeiraCartao(e.target.value)}
                      className="bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg p-1 text-xs font-bold text-[var(--color-text-primary)]"
                    >
                      {["Mastercard Débito", "Visa Electron", "Elo Débito"].map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                )}

                {formaPagamento === "Misto" && (
                  <div className="p-3 bg-[var(--color-surface-sunken)] rounded-xl border border-purple-500/30 space-y-2">
                    <p className="text-[10px] text-[var(--color-text-muted)] font-semibold">
                      Divida o pagamento em múltiplos meios até cobrir o total de <strong>{formatPrice(total)}</strong>:
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-0.5">Em Dinheiro</label>
                        <input
                          type="number"
                          step="0.01"
                          value={mistoDinheiro}
                          onChange={(e) => setMistoDinheiro(e.target.value)}
                          placeholder="0,00"
                          className="w-full px-2 py-1 text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg text-[var(--color-text-primary)]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-0.5">No Pix</label>
                        <input
                          type="number"
                          step="0.01"
                          value={mistoPix}
                          onChange={(e) => setMistoPix(e.target.value)}
                          placeholder="0,00"
                          className="w-full px-2 py-1 text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg text-[var(--color-text-primary)]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-0.5">No Cartão</label>
                        <input
                          type="number"
                          step="0.01"
                          value={mistoCartao}
                          onChange={(e) => setMistoCartao(e.target.value)}
                          placeholder="0,00"
                          className="w-full px-2 py-1 text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg text-[var(--color-text-primary)]"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-[var(--color-border-subtle)]">
                      <span className="text-[var(--color-text-muted)]">Informado: <strong>{formatPrice(totalMistoInformado)}</strong></span>
                      <span className={`font-bold font-mono ${faltaMisto > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                        {faltaMisto > 0 ? `Faltam ${formatPrice(faltaMisto)}` : "Valor 100% coberto"}
                      </span>
                    </div>
                  </div>
                )}

                {formaPagamento === "A Prazo (Crediário)" && (
                  <div className="p-3 bg-[var(--color-surface-sunken)] rounded-xl border border-amber-500/30 space-y-2">
                    <p className="text-[10px] text-amber-500 font-bold">
                      Venda faturada a prazo na conta do cliente:
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-[var(--color-text-muted)] block mb-1">Prazo de Pagamento:</label>
                        <select
                          value={prazoDias}
                          onChange={(e) => setPrazoDias(e.target.value)}
                          className="w-full bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg p-1.5 text-xs font-bold text-[var(--color-text-primary)]"
                        >
                          <option value="15">15 dias</option>
                          <option value="30">30 dias</option>
                          <option value="45">45 dias</option>
                          <option value="60">60 dias</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-[var(--color-text-muted)] block mb-1">Status no Financeiro:</label>
                        <span className="block p-1.5 bg-amber-500/10 text-amber-500 rounded-lg text-center font-bold text-xs">
                          Conta a Receber
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Totalizadores e Finalizar Venda */}
              <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <span>Subtotal dos itens:</span>
                  <span className="font-mono">{formatPrice(subtotal)}</span>
                </div>
                {descontoCalculado > 0 && (
                  <div className="flex items-center justify-between text-xs text-emerald-500 font-bold">
                    <span>Desconto aplicado:</span>
                    <span className="font-mono">-{formatPrice(descontoCalculado)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-base font-black text-[var(--color-text-primary)] pt-1">
                  <span>Total a Pagar:</span>
                  <span className="text-2xl font-mono text-blue-500 font-black">{formatPrice(total)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSuspenderVenda}
                    disabled={cart.length === 0}
                    className="h-11 font-bold text-xs gap-1.5 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                    title="Suspender Venda (F9)"
                  >
                    <PauseCircle className="w-4 h-4" /> Suspender (F9)
                  </Button>

                  <Button
                    onClick={handleFinalizarVenda}
                    loading={finalizando}
                    disabled={cart.length === 0 || !caixaAberto}
                    className="h-11 font-black text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-1.5"
                    title="Finalizar Venda (F10)"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Finalizar (F10)
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ABA 2: HISTÓRICO DE VENDAS */}
      {tab === "historico" && (
        <div className="space-y-4">
          <KpiFilterCard
            id="varejoVendas"
            activeCount={histActiveFilters}
            onClear={limparFiltrosHistorico}
            kpis={[
              { label: "Vendas", value: historicoFiltrado.length, icon: Receipt, tone: "primary" },
              { label: "Faturamento", value: formatPrice(histFaturamento), icon: DollarSign, tone: "success", hint: "Somente vendas pagas" },
              { label: "Ticket médio", value: formatPrice(histTicket), icon: TrendingUp, tone: "info" },
              { label: "Estornadas", value: histEstornadas, icon: RotateCcw, tone: histEstornadas > 0 ? "danger" : "neutral" },
            ]}
          >
            <FilterBar>
              <FilterSearch value={filtroHistorico} onChange={setFiltroHistorico} placeholder="Filtrar por ID da venda, cliente ou operador..." />
              <FilterSelect icon={CreditCard} value={filtroHistPagto} onChange={setFiltroHistPagto} options={histPagtoOpts} allLabel="Todas as formas de pagamento" />
              <FilterChips value={filtroHistStatus} onChange={setFiltroHistStatus} options={histStatusOpts} />
            </FilterBar>
          </KpiFilterCard>

          <div className="space-y-3">
            {historicoFiltrado
              .map((venda) => {
                const isExpanded = expandedVenda === venda.id;
                const isEstornada = venda.status === "estornada";

                return (
                  <Card
                    key={venda.id}
                    className={`p-4 border transition-all ${isEstornada ? "opacity-60 bg-red-500/5 border-red-500/20" : "bg-[var(--color-surface)] border-[var(--color-border-subtle)] hover:border-blue-500/30"}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isEstornada ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                          <Receipt className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black font-mono text-[var(--color-text-primary)]">{venda.id}</h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isEstornada ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"}`}>
                              {isEstornada ? "Venda Estornada" : "Paga / Concluída"}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                            Cliente: <strong className="text-[var(--color-text-primary)]">{venda.cliente_nome || "Consumidor Final"}</strong> • {new Date(venda.created_at).toLocaleDateString("pt-BR")} às {new Date(venda.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {venda.vendedor && (
                            <p className="text-[10px] text-blue-500 font-semibold mt-0.5">
                              Atendente: {venda.vendedor}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 justify-between sm:justify-end">
                        <div className="text-right">
                          <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block">Valor Total</span>
                          <span className="text-base font-black font-mono text-[var(--color-text-primary)]">
                            {formatPrice(venda.valor_total)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReceiptVenda(venda);
                              setReceiptTab("termico");
                            }}
                            className="h-8 px-2.5 text-xs font-bold gap-1"
                            title="Reimprimir Comprovante / Cupom"
                          >
                            <Printer className="w-3.5 h-3.5" /> Cupom
                          </Button>

                          {!isEstornada && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEstornarVenda(venda)}
                              disabled={estornandoIds.has(venda.id)}
                              className="h-8 px-2.5 text-xs font-bold text-red-500 hover:bg-red-500/10 border-red-500/20 disabled:opacity-50"
                              title="Estornar Venda e Devolver ao Estoque"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> {estornandoIds.has(venda.id) ? "Estornando..." : "Estornar"}
                            </Button>
                          )}

                          <button
                            onClick={() => setExpandedVenda(isExpanded ? null : venda.id)}
                            className="p-1.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)] transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Detalhes Expandidos da Venda */}
                    {isExpanded && venda.itens && (
                      <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] space-y-2">
                        <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                          <span>Forma: <strong>{venda.forma_pagamento}</strong></span>
                          <span>Operador: <strong>{venda.operador || "Caixa"}</strong></span>
                          {venda.desconto > 0 && <span>Desconto: <strong className="text-emerald-500">-{formatPrice(venda.desconto)}</strong></span>}
                        </div>

                        <div className="bg-[var(--color-surface-sunken)] p-2.5 rounded-xl space-y-1">
                          {venda.itens.map((it, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span>
                                {it.quantidade}x <strong>{it.name}</strong>
                              </span>
                              <span className="font-mono text-[var(--color-text-primary)]">
                                {formatPrice(it.subtotal)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      {/* ─── MODAL 1: CUPOM TÉRMICO (80mm) & SIMULAÇÃO FISCAL NFC-e ───────── */}
      <Modal
        isOpen={Boolean(receiptVenda)}
        onClose={() => setReceiptVenda(null)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Comprovante de Venda / Cupom</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Impressão térmica 80mm e espelho fiscal NFC-e</p>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!receiptVenda) return;
                const msg = encodeURIComponent(`Olá! Segue comprovante da sua compra ${receiptVenda.id} no valor de ${formatPrice(receiptVenda.valor_total)}.`);
                window.open(`https://wa.me/?text=${msg}`, "_blank");
              }}
              className="h-9 px-3 text-xs font-semibold gap-1.5 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
            >
              <Share2 className="w-3.5 h-3.5" /> WhatsApp
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReceiptVenda(null)}
                className="h-9 px-4 text-xs font-semibold"
              >
                Fechar
              </Button>
              <Button
                type="button"
                onClick={() => window.print()}
                className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir Cupom
              </Button>
            </div>
          </div>
        }
      >
        {receiptVenda && (
          <div className="space-y-3">
            {/* Chaveador de Visualização: Cupom Térmico vs NFC-e */}
            <div className="flex rounded-xl bg-[var(--color-surface-sunken)] p-1 gap-1 border border-[var(--color-border-subtle)] text-xs font-bold">
              <button
                type="button"
                onClick={() => setReceiptTab("termico")}
                className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  receiptTab === "termico"
                    ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-xs"
                    : "text-[var(--color-text-muted)]"
                }`}
              >
                <Printer className="w-3.5 h-3.5" /> Cupom Balcão 80mm
              </button>
              <button
                type="button"
                onClick={() => setReceiptTab("nfce")}
                className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  receiptTab === "nfce"
                    ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-xs"
                    : "text-[var(--color-text-muted)]"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> NFC-e Autorizada (SEFAZ)
              </button>
            </div>

            {/* ABA TÉRMICA 80mm */}
            {receiptTab === "termico" && (
              <div id="thermal-receipt" className="bg-white text-slate-900 rounded-xl p-4 font-mono text-xs shadow-inner space-y-2.5 border border-slate-200">
                <div className="text-center border-b border-dashed border-slate-300 pb-2">
                  {!appSettingsLoaded ? (
                    <p className="text-[10px] text-slate-500">Carregando dados da empresa...</p>
                  ) : (
                    <>
                      <h2 className="text-sm font-black tracking-tight uppercase">{empresaReceipt.nome || "Não informado"}</h2>
                      <p className="text-[10px] text-slate-600">CNPJ: {empresaReceipt.cnpj || "Não informado"}</p>
                      <p className="text-[10px] text-slate-600">{empresaReceipt.endereco || "Não informado"}</p>
                    </>
                  )}
                  <p className="text-[9px] text-slate-500 mt-0.5 uppercase font-bold tracking-widest">
                    DOCUMENTO NÃO-FISCAL
                  </p>
                </div>

                <div className="text-[10px] space-y-0.5 border-b border-dashed border-slate-300 pb-2">
                  <div className="flex justify-between">
                    <span>PEDIDO: <strong>{receiptVenda.id}</strong></span>
                    <span>DATA: {new Date(receiptVenda.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>HORA: {new Date(receiptVenda.created_at).toLocaleTimeString("pt-BR")}</span>
                    <span>OP: {receiptVenda.operador || "Caixa 01"}</span>
                  </div>
                  {receiptVenda.vendedor && (
                    <div className="text-slate-600">
                      VENDEDOR: <strong>{receiptVenda.vendedor}</strong>
                    </div>
                  )}
                  <div>
                    CLIENTE: <strong>{receiptVenda.cliente_nome || "Consumidor Final"}</strong>
                  </div>
                </div>

                {/* Itens */}
                <div className="border-b border-dashed border-slate-300 pb-2 space-y-1">
                  <div className="flex justify-between text-[9px] font-bold border-b border-slate-200 pb-0.5">
                    <span>ITEM / DESCRIÇÃO</span>
                    <span>TOTAL</span>
                  </div>
                  {(receiptVenda.itens || []).map((it, idx) => (
                    <div key={idx} className="space-y-0.2 text-[10px]">
                      <div className="font-bold truncate">{it.name}</div>
                      <div className="flex justify-between text-slate-600 text-[9px]">
                        <span>{it.quantidade} un x {formatPrice(it.price)}</span>
                        <span className="font-bold text-slate-900">{formatPrice(it.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totais */}
                <div className="space-y-0.5 text-[10px] border-b border-dashed border-slate-300 pb-2">
                  <div className="flex justify-between">
                    <span>SUBTOTAL:</span>
                    <span>{formatPrice(receiptVenda.subtotal || receiptVenda.valor_total)}</span>
                  </div>
                  {receiptVenda.desconto > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>DESCONTO:</span>
                      <span>-{formatPrice(receiptVenda.desconto)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-black border-t border-slate-900 pt-1">
                    <span>TOTAL PAGO:</span>
                    <span>{formatPrice(receiptVenda.valor_total)}</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-700 pt-0.5">
                    <span>FORMA DE PAGAMENTO:</span>
                    <span className="font-bold uppercase">{receiptVenda.forma_pagamento}</span>
                  </div>
                  {receiptVenda.troco && receiptVenda.troco > 0 && (
                    <div className="flex justify-between text-[9px] text-slate-700 font-bold">
                      <span>TROCO:</span>
                      <span>{formatPrice(receiptVenda.troco)}</span>
                    </div>
                  )}
                </div>

                {/* Mensagem Rodapé */}
                <div className="text-center text-[9px] text-slate-600 pt-1 space-y-0.5">
                  <p className="font-bold">OBRIGADO PELA PREFERÊNCIA!</p>
                  <p className="text-[8px]">Trocas somente em até 7 dias com este comprovante.</p>
                  <div className="pt-1 flex justify-center">
                    <Barcode className="w-32 h-6 opacity-70" />
                  </div>
                </div>
              </div>
            )}

            {/* ABA NFC-e AUTORIZADA SEFAZ */}
            {receiptTab === "nfce" && (
              <div className="p-4 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-border-subtle)] space-y-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-500 font-bold pb-2 border-b border-[var(--color-border-subtle)]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>NFC-e Autorizada pelo SEFAZ SP</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase block mb-1">Chave de Acesso (44 dígitos)</span>
                  <div className="p-2 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg font-mono text-[10px] text-blue-500 font-bold break-all flex items-center justify-between">
                    <span>{receiptVenda.nfce_chave || "3526 0912 3456 7800 0190 6500 1000 0098 4210 2345 6789"}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(receiptVenda.nfce_chave || "35260912345678000190650010000098421023456789");
                        toast.success("Chave da NFC-e copiada!");
                      }}
                      className="p-1 hover:text-white"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block">Protocolo de Autorização</span>
                    <strong className="font-mono text-[var(--color-text-primary)]">{receiptVenda.nfce_protocolo || "135260089234812"}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block">Ambiente</span>
                    <strong className="text-emerald-500">Produção</strong>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white p-2 text-slate-900 flex items-center justify-between gap-2">
                  <div className="text-[10px]">
                    <p className="font-bold">Consulta via Leitor QR Code:</p>
                    <p className="text-[9px] text-slate-600">Aponte a câmera do celular para consultar a nota no portal oficial da SEFAZ.</p>
                  </div>
                  <QrCode className="w-12 h-12 shrink-0 text-slate-900" />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ─── MODAL 2: ITEM AVULSO / SERVIÇO RÁPIDO ─────────────────────────── */}
      <Modal
        isOpen={modalAvulsoOpen}
        onClose={() => setModalAvulsoOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Adicionar Item Avulso / Rápido</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Insira um produto ou serviço fora do catálogo padrão</p>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalAvulsoOpen(false)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-item-avulso"
              className="h-9 px-4 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white"
            >
              Inserir no Carrinho
            </Button>
          </div>
        }
      >
        <form id="form-item-avulso" onSubmit={handleAdicionarItemAvulso} className="space-y-3.5 py-1">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Descrição do Item / Serviço *</label>
            <input
              type="text"
              required
              placeholder="Ex: Instalação de Película, Embalagem de Presente, Item Especial..."
              value={avulsoNome}
              onChange={(e) => setAvulsoNome(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Preço Unitário (R$) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0,00"
                value={avulsoPreco}
                onChange={(e) => setAvulsoPreco(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Quantidade</label>
              <input
                type="number"
                min="1"
                required
                value={avulsoQtd}
                onChange={(e) => setAvulsoQtd(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL 3: VENDAS EM ESPERA (FILA / PARKED SALES) ──────────────── */}
      <Modal
        isOpen={modalEsperaOpen}
        onClose={() => setModalEsperaOpen(false)}
        maxWidth="max-w-lg"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <PauseCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Vendas em Espera ({vendasEmEspera.length})</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Retome atendimentos que foram pausados temporariamente na fila</p>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalEsperaOpen(false)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Fechar
            </Button>
          </div>
        }
      >
        <div className="space-y-3 py-1 max-h-80 overflow-y-auto pr-1">
          {vendasEmEspera.map((esp) => (
            <div
              key={esp.id}
              className="p-3.5 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-3 hover:border-amber-500/40 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{esp.identificador}</h4>
                  <span className="text-[10px] text-amber-500 font-mono">Pausado às {esp.dataHora}</span>
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  {esp.cart.reduce((s, i) => s + i.quantidade, 0)} itens • Subtotal: <strong className="text-[var(--color-text-primary)] font-mono">{formatPrice(esp.subtotal)}</strong>
                </p>
                <p className="text-[10px] text-[var(--color-text-muted)] truncate max-w-xs mt-0.5">
                  Itens: {esp.cart.map((i) => `${i.quantidade}x ${i.name}`).join(", ")}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  onClick={() => handleRetomarVenda(esp)}
                  className="h-8 px-3 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1"
                >
                  <PlayCircle className="w-3.5 h-3.5" /> Retomar
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setVendasEmEspera((prev) => prev.filter((e) => e.id !== esp.id));
                    toast.info("Venda em espera descartada.");
                  }}
                  className="p-1.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/25 transition-colors"
                  title="Descartar esta venda"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {vendasEmEspera.length === 0 && (
            <div className="py-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)]/40 rounded-xl border border-dashed border-[var(--color-border-subtle)]">
              Nenhuma venda pausada na fila no momento. Pressione <strong>F9</strong> para suspender uma venda ativa.
            </div>
          )}
        </div>
      </Modal>

      {/* ─── MODAL 4: OPERAÇÕES DE CAIXA (SANGRIA / SUPRIMENTO / FECHAMENTO) ─ */}
      <Modal
        isOpen={Boolean(modalCaixa)}
        onClose={() => setModalCaixa(null)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${modalCaixa === "sangria" ? "bg-amber-500/10 text-amber-500" : modalCaixa === "suprimento" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
              {modalCaixa === "sangria" && <ArrowUpRight className="w-4 h-4" />}
              {modalCaixa === "suprimento" && <ArrowDownRight className="w-4 h-4" />}
              {modalCaixa === "fechamento" && <Lock className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                {modalCaixa === "sangria" ? "Registrar Sangria de Caixa" : modalCaixa === "suprimento" ? "Registrar Suprimento (Entrada)" : "Fechamento de Caixa / Turno"}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                {modalCaixa === "sangria" ? "Retirada de numerário da gaveta" : modalCaixa === "suprimento" ? "Aporte ou reforço de troco" : "Conferência cega e apuração do turno"}
              </p>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalCaixa(null)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleExecutarOperacaoCaixa}
              className={`h-9 px-4 text-xs font-semibold text-white ${modalCaixa === "fechamento" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {modalCaixa === "fechamento" ? "Confirmar Fechamento" : "Confirmar Operação"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5 py-1">
          {modalCaixa === "fechamento" ? (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-muted)]">
                Confira os valores calculados pelo sistema antes de encerrar o turno do operador:
              </p>
              <div className="p-3 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-border-subtle)] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Faturamento Total do Dia:</span>
                  <strong className="text-emerald-500 font-mono">{formatPrice(faturamentoHoje)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Total de Vendas:</span>
                  <strong className="font-mono text-[var(--color-text-primary)]">{vendasHoje.length} pedidos</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Saldo Esperado em Dinheiro:</span>
                  <strong className="font-mono text-amber-500">{formatPrice(saldoCaixaCalculado)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Operador do Turno:</span>
                  <strong className="text-[var(--color-text-primary)]">{user?.name || "Operador Caixa"}</strong>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">
                  Conferência Cega: Valor Contado na Gaveta (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={valorGavetaContado}
                  onChange={(e) => setValorGavetaContado(e.target.value)}
                  placeholder="Informe o valor contado fisicamente..."
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none"
                />
                {Number(valorGavetaContado) > 0 && (
                  <div className="mt-2 text-xs flex justify-between p-2 rounded-lg bg-[var(--color-surface-sunken)]">
                    <span className="text-[var(--color-text-muted)]">Diferença de Caixa:</span>
                    <strong className={Number(valorGavetaContado) >= saldoCaixaCalculado ? "text-emerald-500" : "text-red-500"}>
                      {Number(valorGavetaContado) >= saldoCaixaCalculado ? `Sobra: +${formatPrice(Number(valorGavetaContado) - saldoCaixaCalculado)}` : `Falta: -${formatPrice(saldoCaixaCalculado - Number(valorGavetaContado))}`}
                    </strong>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={valorOperacaoCaixa}
                  onChange={(e) => setValorOperacaoCaixa(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Motivo / Justificativa *</label>
                <input
                  type="text"
                  required
                  value={motivoOperacaoCaixa}
                  onChange={(e) => setMotivoOperacaoCaixa(e.target.value)}
                  placeholder={modalCaixa === "sangria" ? "Ex: Recolhimento de cédulas, depósito bancário..." : "Ex: Fundo de troco, reforço..."}
                  className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ─── MODAL 5: GUIA DE TECLAS DE ATALHO (F1) ───────────────────────── */}
      <Modal
        isOpen={modalAtalhosOpen}
        onClose={() => setModalAtalhosOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Atalhos de Teclado do PDV</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Agilize o atendimento com as teclas de acesso rápido</p>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalAtalhosOpen(false)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Entendido
            </Button>
          </div>
        }
      >
        <div className="space-y-2 py-1 text-xs">
          {[
            { key: "F1", desc: "Abrir este guia de atalhos rápidos" },
            { key: "F2", desc: "Focar no leitor de código de barras ou busca" },
            { key: "F3", desc: "Preencher identificação de cliente e CPF" },
            { key: "F4", desc: "Inserir desconto em valor (R$) ou percentual (%)" },
            { key: "F7", desc: "Lançar item avulso ou taxa de serviço rápido" },
            { key: "F8", desc: "Cancelar e limpar todos os itens do carrinho" },
            { key: "F9", desc: "Suspender venda atual ou retomar venda em espera" },
            { key: "F10", desc: "Finalizar venda e confirmar pagamento" },
            { key: "ESC", desc: "Fechar qualquer modal aberto ou limpar seleção" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
              <span className="text-[var(--color-text-muted)]">{item.desc}</span>
              <kbd className="px-2 py-1 rounded bg-[var(--color-surface)] border text-xs font-mono font-bold text-blue-500">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
      </Modal>
    </PageContainer>
  );
}
