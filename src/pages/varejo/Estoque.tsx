import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Boxes, ArrowUpCircle, ArrowDownCircle, Settings2, History,
  Search, Plus, Filter, AlertTriangle, CheckCircle2, TrendingUp,
  DollarSign, Package, Barcode, ExternalLink, X, RefreshCw,
  Layers, ArrowUpDown, Download
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FormField } from "../../components/ui/form-field";
import { EmptyState } from "../../components/ui/empty-state";
import { Modal } from "../../components/ui/modal";
import { useData } from "../../contexts/DataContext";
import { useVarejoConfig } from "../../lib/varejoConfig";
import { useLocalization } from "../../contexts/LocalizationContext";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

type TipoMov = "entrada" | "saida" | "ajuste" | "venda";

interface Movimentacao {
  id: string;
  product_id: string;
  tipo: TipoMov;
  quantidade: number;
  motivo: string | null;
  created_at: string;
  operador?: string;
}

export default function VarejoEstoque() {
  const { products, setProducts } = useData();
  const cfg = useVarejoConfig();
  const minPadrao = cfg.estoque.estoqueMinimoPadrao;
  const { user, activeTenantId } = useAuth();
  const { formatCurrency: formatPrice } = useLocalization();
  const tenantId = activeTenantId || "default";

  const [activeTab, setActiveTab] = useState<"tabela" | "movimentar" | "historico">("tabela");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [filterEstoqueStatus, setFilterEstoqueStatus] = useState<"todos" | "critico" | "baixo" | "normal">("todos");

  // Modal de Ajuste de Saldo
  const [modalAjusteOpen, setModalAjusteOpen] = useState(false);
  const [ajusteProduct, setAjusteProduct] = useState<any>(null);
  const [ajusteTipo, setAjusteTipo] = useState<"entrada" | "saida" | "ajuste">("entrada");
  const [ajusteQtd, setAjusteQtd] = useState("");
  const [ajusteMotivo, setAjusteMotivo] = useState("Compra de Fornecedor");
  const [ajusteSaving, setAjusteSaving] = useState(false);

  // Histórico de Movimentações — vem só da tabela real `estoque_movimentacoes`,
  // filtrado explicitamente pelo tenant ativo (achado A7, auditoria
  // 2026-09-21): sem o filtro, uma conta master/parceira com acesso a
  // múltiplos tenants via `has_tenant_access` recebia as 50 últimas
  // movimentações misturadas de todos os tenants acessíveis, não só do tenant
  // ativo na tela.
  const [historico, setHistorico] = useState<Movimentacao[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    supabase
      .from("estoque_movimentacoes")
      .select("id, product_id, tipo, quantidade, motivo, created_at")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error && data) {
          setHistorico(data);
        }
      });
  }, [activeTenantId]);

  const produtoNome = (productId: string) => {
    return products.find((p: any) => p.id === productId)?.name || "Produto";
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p: any) => {
      if (p.category) set.add(p.category);
    });
    return ["Todas", ...Array.from(set)];
  }, [products]);

  // Filtragem dos Produtos
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      if (selectedCategory !== "Todas" && p.category !== selectedCategory) return false;

      const stock = Number(p.currentStock) || 0;
      const minStock = Number(p.stockMin) || minPadrao;

      if (filterEstoqueStatus === "critico" && stock > 0) return false;
      if (filterEstoqueStatus === "baixo" && (stock <= 0 || stock > minStock)) return false;
      if (filterEstoqueStatus === "normal" && stock <= minStock) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.typeAttributes?.barcode?.toLowerCase().includes(q) ||
        p.typeAttributes?.ean?.toLowerCase().includes(q)
      );
    });
  }, [products, search, selectedCategory, filterEstoqueStatus]);

  const activeFilters = (search.trim() ? 1 : 0) + (selectedCategory !== "Todas" ? 1 : 0) + (filterEstoqueStatus !== "todos" ? 1 : 0);
  const limparFiltros = () => { setSearch(""); setSelectedCategory("Todas"); setFilterEstoqueStatus("todos"); };

  // Cálculos de KPI de Estoque
  const metrics = useMemo(() => {
    let totalItensCadastrados = filteredProducts.length;
    let unidadesTotais = 0;
    let valorCustoTotal = 0;
    let valorVendaTotal = 0;
    let itensCriticos = 0;

    filteredProducts.forEach((p: any) => {
      const stock = Number(p.currentStock) || 0;
      const cost = Number(p.cost) || 0;
      const price = Number(p.price) || 0;
      const minStock = Number(p.stockMin) || minPadrao;

      unidadesTotais += stock;
      valorCustoTotal += stock * cost;
      valorVendaTotal += stock * price;

      if (stock <= minStock) itensCriticos++;
    });

    const lucroPotencial = valorVendaTotal - valorCustoTotal;
    const margemMedia = valorVendaTotal > 0 ? (lucroPotencial / valorVendaTotal) * 100 : 0;

    return {
      totalItensCadastrados,
      unidadesTotais,
      valorCustoTotal,
      valorVendaTotal,
      lucroPotencial,
      margemMedia,
      itensCriticos,
    };
  }, [filteredProducts]);


  // Handlers para Ajuste de Estoque
  const handleOpenAjuste = (product: any) => {
    setAjusteProduct(product);
    setAjusteTipo("entrada");
    setAjusteQtd("");
    setAjusteMotivo("Compra de Fornecedor");
    setModalAjusteOpen(true);
  };

  const handleSalvarAjuste = async () => {
    if (!ajusteProduct) return;
    const qtd = Number(ajusteQtd);
    if (isNaN(qtd) || qtd <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    setAjusteSaving(true);
    try {
      let novoSaldo = ajusteProduct.currentStock ?? 0;
      let qtdMovimentada = qtd;

      if (ajusteTipo === "entrada") {
        novoSaldo += qtd;
        qtdMovimentada = qtd;
      } else if (ajusteTipo === "saida") {
        if (qtd > novoSaldo) {
          toast.error(`Saldo insuficiente para saída. Estoque atual: ${novoSaldo}`);
          setAjusteSaving(false);
          return;
        }
        novoSaldo = Math.max(0, novoSaldo - qtd);
        qtdMovimentada = -qtd;
      } else if (ajusteTipo === "ajuste") {
        qtdMovimentada = qtd - novoSaldo;
        novoSaldo = qtd;
      }

      // 1. Atualizar produto
      const updatedList = products.map((p: any) =>
        p.id === ajusteProduct.id ? { ...p, currentStock: novoSaldo } : p
      );
      setProducts(updatedList);

      // 2. Registrar no histórico
      const novaMov: Movimentacao = {
        id: `mov-${Math.floor(1000 + Math.random() * 9000)}`,
        product_id: ajusteProduct.id,
        tipo: ajusteTipo,
        quantidade: qtdMovimentada,
        motivo: ajusteMotivo || "Ajuste de Estoque",
        created_at: new Date().toISOString(),
        operador: user?.name || "Operador Estoque",
      };
      setHistorico((prev) => [novaMov, ...prev]);

      // 3. Supabase RPC se disponível
      if (supabase) {
        try {
          await supabase.rpc("registrar_movimentacao_estoque", {
            p_product_id: ajusteProduct.id,
            p_tipo: ajusteTipo,
            p_quantidade: qtd,
            p_motivo: ajusteMotivo || null,
          });
        } catch (supaErr) {
          console.warn("[Estoque] Supabase sync fallback to local:", supaErr);
        }
      }

      toast.success(`Estoque de "${ajusteProduct.name}" atualizado para ${novoSaldo} unidades!`);
      setModalAjusteOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar estoque.");
    } finally {
      setAjusteSaving(false);
    }
  };


  const handleExportCSV = () => {
    if (!products || products.length === 0) {
      toast.error("Nenhum produto cadastrado para exportar.");
      return;
    }
    const headers = ["ID", "Produto", "SKU", "EAN_Barras", "Categoria", "Fornecedor", "Estoque_Atual", "Estoque_Min", "Preco_Custo", "Preco_Venda", "Margem_Pct"];
    const rows = products.map((p: any) => [
      p.id,
      `"${(p.name || "").replace(/"/g, '""')}"`,
      p.sku || "",
      p.typeAttributes?.barcode || p.typeAttributes?.ean || "",
      p.category || "",
      `"${(p.provider || "").replace(/"/g, '""')}"`,
      p.currentStock ?? 0,
      p.stockMin ?? 5,
      Number(p.cost || 0).toFixed(2),
      Number(p.price || 0).toFixed(2),
      `${p.margin || 0}%`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventario_estoque_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Inventário de estoque exportado com sucesso!");
  };

  const tipoLabel: Record<string, { label: string; color: string }> = {
    entrada: { label: "Entrada (+)", color: "text-emerald-500" },
    saida: { label: "Saída (-)", color: "text-amber-500" },
    ajuste: { label: "Ajuste Balanço (=)", color: "text-blue-500" },
    venda: { label: "Venda PDV (-)", color: "text-purple-500" },
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)] flex items-center gap-2.5">
            Movimentações de Estoque <Boxes className="w-6 h-6 text-blue-500" />
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Entradas, saídas e ajustes de saldo, alertas de estoque baixo e histórico de movimentações. O cadastro de produtos fica em Produtos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="gap-1.5 font-semibold text-xs border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)]"
          >
            <Download className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> Exportar CSV
          </Button>
          <Link to="/app/produtos">
            <Button className="gap-1.5 font-bold text-xs bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white shadow-xs">
              <Plus className="w-4 h-4" /> Cadastrar produto
            </Button>
          </Link>
        </div>
      </div>

      {/* KPIs & Filtros */}
      <KpiFilterCard
        id="varejoEstoque"
        activeCount={activeFilters}
        onClear={limparFiltros}
        kpis={[
          { label: "Total em estoque", value: `${metrics.unidadesTotais} un.`, icon: Boxes, tone: "primary", hint: `${metrics.totalItensCadastrados} SKUs` },
          { label: "Capital imobilizado", value: formatPrice(metrics.valorCustoTotal), icon: DollarSign, tone: "neutral", hint: "A preço de custo" },
          { label: "Potencial de venda", value: formatPrice(metrics.valorVendaTotal), icon: TrendingUp, tone: "success", hint: `+${formatPrice(metrics.lucroPotencial)} lucro projetado` },
          { label: "Margem bruta média", value: `${metrics.margemMedia.toFixed(1)}%`, icon: Layers, tone: "accent" },
          { label: "Estoque crítico", value: `${metrics.itensCriticos} itens`, icon: AlertTriangle, tone: metrics.itensCriticos > 0 ? "danger" : "neutral", hint: "Abaixo do mínimo recomendado" },
        ]}
      >
        {activeTab === "tabela" && (
          <FilterBar>
            <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por produto, SKU, código de barras..." />
            <FilterSelect icon={Layers} value={selectedCategory} onChange={setSelectedCategory} options={categories.filter(c => c !== "Todas")} allLabel="Todas as categorias" allValue="Todas" />
            <FilterSelect
              icon={AlertTriangle}
              value={filterEstoqueStatus}
              onChange={(v) => setFilterEstoqueStatus(v as typeof filterEstoqueStatus)}
              allValue="todos"
              allLabel="Situação: todas"
              options={[
                { value: "critico", label: "Somente esgotados (0 un.)" },
                { value: "baixo", label: "Estoque baixo (≤ mínimo)" },
                { value: "normal", label: "Estoque normal" },
              ]}
            />
          </FilterBar>
        )}
      </KpiFilterCard>

      {/* Tabs */}
      <div className="flex bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl p-1 gap-1 w-fit shadow-xs">
        <button
          onClick={() => setActiveTab("tabela")}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
            activeTab === "tabela"
              ? "bg-[var(--color-primary-blue)] text-white shadow-xs"
              : "text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          <Boxes className="w-3.5 h-3.5" /> Saldos & Produtos ({products.length})
        </button>
        <button
          onClick={() => setActiveTab("historico")}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
            activeTab === "historico"
              ? "bg-[var(--color-primary-blue)] text-white shadow-xs"
              : "text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          <History className="w-3.5 h-3.5" /> Histórico de Movimentações ({historico.length})
        </button>
      </div>

      {/* TAB 1: TABELA DE GESTÃO DE ESTOQUE */}
      {activeTab === "tabela" && (
        <div className="space-y-4">
          {/* Tabela de Produtos */}
          {filteredProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Nenhum item encontrado"
              description="Tente ajustar os filtros de busca ou cadastre um novo produto em Produtos."
              className="py-12"
            />
          ) : (
            <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--color-surface-sunken)]/60 text-[10px] uppercase font-black tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
                    <tr>
                      <th className="py-3 px-4">Produto & SKU</th>
                      <th className="py-3 px-3">Categoria</th>
                      <th className="py-3 px-3">Custo Unit.</th>
                      <th className="py-3 px-3">Preço Venda</th>
                      <th className="py-3 px-3">Margem</th>
                      <th className="py-3 px-4">Nível de Saldo</th>
                      <th className="py-3 px-3">Estoque Mín.</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {filteredProducts.map((p: any) => {
                      const stock = p.currentStock ?? 0;
                      const min = p.stockMin || minPadrao;
                      const isZero = stock <= 0;
                      const isLow = stock > 0 && stock <= min;
                      const margin = p.price > 0 ? (((p.price - (p.cost || 0)) / p.price) * 100).toFixed(1) : "0.0";
                      const barcode = p.typeAttributes?.barcode || p.typeAttributes?.ean;

                      // Percentual da barra em relação ao dobro do mínimo
                      const pctBar = Math.min(100, Math.max(8, (stock / (min * 2)) * 100));

                      return (
                        <tr key={p.id} className="hover:bg-[var(--color-surface-sunken)]/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-[var(--color-text-primary)] leading-tight">{p.name}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--color-text-faint)] font-mono">
                              <span>SKU: {p.sku || "—"}</span>
                              {barcode && <span>· EAN: {barcode}</span>}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]">
                              {p.category || "Varejo"}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-mono text-[var(--color-text-muted)]">
                            {formatPrice(p.cost || 0)}
                          </td>

                          <td className="py-3 px-3 font-mono font-bold text-[var(--color-text-primary)]">
                            {formatPrice(p.price || 0)}
                          </td>

                          <td className="py-3 px-3">
                            <span className="font-mono font-black text-emerald-500">{margin}%</span>
                          </td>

                          <td className="py-3 px-4 min-w-[140px]">
                            <div className="flex items-center justify-between text-[11px] font-mono font-bold mb-1">
                              <span
                                className={
                                  isZero ? "text-red-500" : isLow ? "text-amber-500" : "text-emerald-500"
                                }
                              >
                                {stock} un.
                              </span>
                              <span className="text-[9px] text-[var(--color-text-faint)]">
                                {isZero ? "Esgotado" : isLow ? "Baixo" : "Normal"}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${pctBar}%` }}
                                className={`h-full rounded-full transition-all ${
                                  isZero ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-emerald-500"
                                }`}
                              />
                            </div>
                          </td>

                          <td className="py-3 px-3 font-mono text-[var(--color-text-faint)]">
                            {min} un.
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenAjuste(p)}
                                className="h-7 px-2 text-[11px] font-bold gap-1 text-blue-500 hover:bg-blue-500/10 border-blue-500/30"
                              >
                                <ArrowUpDown className="w-3 h-3" /> Ajustar Saldo
                              </Button>

                              <Link
                                to="/app/produtos"
                                className="h-7 px-2 inline-flex items-center gap-1 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] text-[11px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                                title="Editar cadastro em Produtos"
                              >
                                <ExternalLink className="w-3 h-3" /> Editar
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: HISTÓRICO DE MOVIMENTAÇÕES */}
      {activeTab === "historico" && (
        <div className="space-y-4">
          <Card className="p-5 space-y-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border-subtle)]">
              <h3 className="text-sm font-black text-[var(--color-text-primary)] flex items-center gap-2">
                <History className="w-4 h-4 text-blue-500" /> Registro Completo de Movimentações
              </h3>
              <span className="text-xs text-[var(--color-text-faint)]">
                {historico.length} registros no histórico
              </span>
            </div>

            {historico.length === 0 ? (
              <EmptyState
                icon={History}
                title="Nenhuma movimentação registrada"
                description="Entradas, saídas e vendas do PDV aparecerão detalhadas aqui."
                className="py-10"
              />
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {historico.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between text-xs gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
                          m.quantidade > 0
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {m.quantidade > 0 ? (
                          <ArrowUpCircle className="w-4 h-4" />
                        ) : (
                          <ArrowDownCircle className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold ${tipoLabel[m.tipo]?.color || ""}`}>
                            {tipoLabel[m.tipo]?.label || m.tipo}
                          </span>
                          <span className="font-bold text-[var(--color-text-primary)]">
                            — {produtoNome(m.product_id)}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--color-text-faint)] mt-0.5">
                          {m.motivo || "Sem motivo especificado"} · {new Date(m.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`font-mono font-black text-sm ${
                          m.quantidade < 0 ? "text-red-500" : "text-emerald-500"
                        }`}
                      >
                        {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade} un.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* MODAL 1: AJUSTE RÁPIDO DE SALDO */}
      {ajusteProduct && (
        <Modal
          isOpen={modalAjusteOpen}
          onClose={() => setModalAjusteOpen(false)}
          maxWidth="max-w-md"
          title={
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                Ajustar Estoque
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                {ajusteProduct.name} (Saldo atual: <strong>{ajusteProduct.currentStock ?? 0} un.</strong>)
              </p>
            </div>
          }
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button variant="outline" size="sm" onClick={() => setModalAjusteOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSalvarAjuste}
                loading={ajusteSaving}
                className="font-bold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
              >
                Confirmar Ajuste
              </Button>
            </div>
          }
        >
          <div className="space-y-3.5 py-1">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] block mb-1.5">
                Tipo de Movimentação
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "entrada", label: "Entrada (+)" },
                    { id: "saida", label: "Saída (-)" },
                    { id: "ajuste", label: "Inventário (=)" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAjusteTipo(t.id)}
                    className={`p-2 rounded-xl text-xs font-bold border transition-all text-center ${
                      ajusteTipo === t.id
                        ? "bg-[var(--color-primary-blue)] text-white border-[var(--color-primary-blue)] shadow-xs"
                        : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1">
                {ajusteTipo === "ajuste" ? "Novo Saldo Exato (unidades)" : "Quantidade a Movimentar"}
              </label>
              <Input
                type="number"
                min={1}
                value={ajusteQtd}
                onChange={(e) => setAjusteQtd(e.target.value)}
                placeholder="0"
                className="font-mono font-bold text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1">
                Motivo da Movimentação
              </label>
              <select
                value={ajusteMotivo}
                onChange={(e) => setAjusteMotivo(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              >
                <option value="Compra de Fornecedor">Compra de Fornecedor</option>
                <option value="Reposição de Loja">Reposição de Loja</option>
                <option value="Inventário Periódico">Inventário Periódico</option>
                <option value="Avaria / Quebra">Avaria / Quebra</option>
                <option value="Validade Vencida">Validade Vencida</option>
                <option value="Devolução de Cliente">Devolução de Cliente</option>
                <option value="Consumo Interno">Consumo Interno</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
