import { useState, useMemo, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  ShoppingCart, DollarSign, TrendingUp, Boxes, Package,
  Truck, ArrowRight, CheckCircle2, AlertTriangle, CreditCard,
  QrCode, Banknote, Clock, ArrowUpRight, BarChart3, RefreshCw
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { supabase } from "../../lib/supabase";
import { DrillDownPanel, type DrillColumn } from "../../components/ui/DrillDownPanel";

interface VendaFinalizada {
  id: string;
  timestamp: string;
  data: string;
  cliente: string;
  vendedor?: string;
  itens: Array<{
    id: string;
    name: string;
    price: number;
    cost?: number;
    qty: number;
    total: number;
  }>;
  subtotal: number;
  desconto: number;
  total: number;
  metodo: string;
  status: "concluida" | "cancelada";
}

interface CaixaStatus {
  aberto: boolean;
  dataAbertura: string;
  saldoInicial: number;
  operador: string;
}

export default function PainelVarejo() {
  const { user, activeTenantId } = useAuth();
  const tenantId = activeTenantId || user?.tenantId || (user as any)?.tenant_id || "default";
  const { products } = useData();

  // 1. Vendas do PDV (banco real: vendas + venda_items)
  const [vendas, setVendas] = useState<VendaFinalizada[]>([]);
  // 2. Status do Caixa Atual — derivado das operações reais em `caixa_operacoes`
  // (mesma tabela usada pelo PDV em Vendas.tsx, sem estado local/fake).
  const [caixa, setCaixa] = useState<CaixaStatus>({
    aberto: false,
    dataAbertura: "",
    saldoInicial: 0,
    operador: "",
  });
  // 3. Compras e reposições (banco real: compras)
  const [compras, setCompras] = useState<any[]>([]);

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
      const ultimaAbertura = data.find((op: any) => op.tipo === "abertura");
      setCaixa({
        aberto: data.length > 0 && data[0].tipo !== "fechamento",
        dataAbertura: ultimaAbertura
          ? new Date(ultimaAbertura.created_at).toLocaleDateString("pt-BR") + " " + new Date(ultimaAbertura.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : "",
        saldoInicial: Number(ultimaAbertura?.valor) || 0,
        operador: ultimaAbertura?.operador || user?.name || "",
      });
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, user]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const hojeInicio = new Date();
      hojeInicio.setHours(0, 0, 0, 0);

      const { data: vendasRows, error: vendasError } = await supabase
        .from("vendas")
        .select("*, venda_items(*)")
        .eq("tenant_id", activeTenantId)
        .gte("created_at", hojeInicio.toISOString())
        .order("created_at", { ascending: false });
      if (vendasError) console.error("[Supabase] fetch vendas (painel varejo) error:", vendasError.message);
      if (!cancelled && vendasRows) {
        setVendas(
          vendasRows.map((v: any): VendaFinalizada => ({
            id: v.id,
            timestamp: v.created_at,
            data: new Date(v.created_at).toLocaleDateString("pt-BR"),
            cliente: v.cliente_nome || "Consumidor Final",
            vendedor: undefined,
            itens: (v.venda_items || []).map((it: any) => ({
              id: it.id,
              name: it.product_name || "Item",
              price: Number(it.preco_unitario) || 0,
              cost: undefined,
              qty: it.quantidade,
              total: Number(it.preco_unitario) * it.quantidade,
            })),
            subtotal: Number(v.valor_total) || 0,
            desconto: 0,
            total: Number(v.valor_total) || 0,
            metodo: v.forma_pagamento || "Outro",
            status: v.status === "cancelada" ? "cancelada" : "concluida",
          }))
        );
      }

      const { data: comprasRows, error: comprasError } = await supabase
        .from("compras")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("data", { ascending: false })
        .limit(10);
      if (comprasError) console.error("[Supabase] fetch compras (painel varejo) error:", comprasError.message);
      if (!cancelled && comprasRows) {
        setCompras(comprasRows.map((c: any) => ({
          id: c.id,
          fornecedor: c.fornecedor,
          valor: Number(c.valor) || 0,
          data: new Date(c.data + "T00:00:00").toLocaleDateString("pt-BR"),
          status: c.status,
        })));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  // Métricas Consolidadas
  const metrics = useMemo(() => {
    const ativas = (vendas || []).filter(v => v.status !== "cancelada");
    const totalFaturamento = ativas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
    const totalVendas = ativas.length;
    const ticketMedio = totalVendas > 0 ? totalFaturamento / totalVendas : 0;

    // Lucro bruto estimado
    const lucroEstimado = totalFaturamento * 0.42; // ~42% margem bruta de varejo padrão

    // Mix de pagamento
    const paymentMap: Record<string, number> = {};
    ativas.forEach(v => {
      const m = v.metodo || "Outro";
      paymentMap[m] = (paymentMap[m] || 0) + (Number(v.total) || 0);
    });

    // Ranking de produtos mais vendidos
    const prodMap: Record<string, { name: string; qty: number; total: number }> = {};
    ativas.forEach(v => {
      (v.itens || []).forEach(item => {
        if (!item) return;
        const name = item.name || "Produto";
        if (!prodMap[name]) {
          prodMap[name] = { name, qty: 0, total: 0 };
        }
        const q = Number(item.qty) || 1;
        const tot = Number(item.total) || ((Number(item.price) || 0) * q);
        prodMap[name].qty += q;
        prodMap[name].total += tot;
      });
    });

    const topProdutos = Object.values(prodMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      totalFaturamento,
      totalVendas,
      ticketMedio,
      lucroEstimado,
      paymentMap,
      topProdutos,
      totalItensEstoque: products?.length || 0,
    };
  }, [vendas, products]);

  const [drillKey, setDrillKey] = useState<"vendas" | "catalogo" | null>(null);
  const vendaColumns: DrillColumn[] = [
    { header: "Cliente", render: (v: VendaFinalizada) => <span className="font-bold text-[var(--color-text-primary)]">{v.cliente || "—"}</span> },
    { header: "Método", render: (v: VendaFinalizada) => v.metodo || "—" },
    { header: "Itens", render: (v: VendaFinalizada) => (v.itens || []).length },
    { header: "Total", render: (v: VendaFinalizada) => `R$ ${(Number(v.total) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, className: "text-right" },
  ];
  const productColumns: DrillColumn[] = [
    { header: "Produto", render: (p: any) => <span className="font-bold text-[var(--color-text-primary)]">{p.name || "—"}</span> },
    { header: "Estoque", render: (p: any) => Number(p.currentStock ?? p.current_stock ?? p.stock) || 0 },
    { header: "Estoque Mín.", render: (p: any) => Number(p.minStock ?? p.min_stock) || 0 },
  ];

  // Itens com estoque crítico
  const itensCriticos = useMemo(() => {
    return (products || [])
      .filter(p => (Number(p.currentStock ?? p.current_stock ?? p.stock) || 0) <= (Number(p.minStock ?? p.min_stock) || 5))
      .slice(0, 4)
      .map(p => {
        const stock = Number(p.currentStock ?? p.current_stock ?? p.stock) || 0;
        const min = Number(p.minStock ?? p.min_stock) || 10;
        return {
          name: p.name || "Item em estoque",
          stock,
          min,
          status: stock <= 2 ? "Crítico" : "Atenção",
        };
      });
  }, [products]);

  return (
    <PageContainer
      title="Painel Executivo de Varejo"
      description="Visão consolidada da frente de caixa (PDV), giro de produtos, reposições e lucratividade da operação."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/app/varejo/estoque"
            className="h-9 px-3.5 text-xs font-semibold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors"
          >
            <Boxes className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> Estoque
          </Link>
          <Link
            to="/app/varejo/compras"
            className="h-9 px-3.5 text-xs font-semibold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors"
          >
            <Truck className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> Compras & Reposição
          </Link>
          <Link
            to="/app/varejo/vendas"
            className="h-9 px-4 text-xs font-bold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white shadow-xs transition-all"
          >
            <ShoppingCart className="w-3.5 h-3.5" /> Abrir PDV / Caixa
          </Link>
        </div>
      }
    >
      {/* Top Banner: Status do Caixa */}
      <div className="mb-6 p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-3.5 h-3.5 rounded-full ${caixa.aberto ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-text-primary)]">
                Frente de Caixa: {caixa.aberto ? "Em Operação (Aberto)" : "Fechado"}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Operador: {caixa.operador}
              </span>
            </div>
            <span className="text-[11px] text-[var(--color-text-muted)]">
              Abertura: {caixa.dataAbertura} • Fundo de Troco Inicial: R$ {(Number(caixa.saldoInicial) || 0).toFixed(2)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/app/varejo/vendas"
            className="h-8 px-3 text-xs font-semibold inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            Acessar Terminal PDV <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card onClick={() => setDrillKey("vendas")} className="p-4 bg-[var(--color-surface-elevated)]/40 border border-emerald-500/20 shadow-xs cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Faturamento Hoje</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-500 font-mono">
            R$ {metrics.totalFaturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">
            {metrics.totalVendas} transações no PDV
          </span>
        </Card>

        <Card className="p-4 bg-[var(--color-surface-elevated)]/40 border border-blue-500/20 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Lucro Bruto Estimado</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-500 font-mono">
            R$ {metrics.lucroEstimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">
            Margem comercial estimada (~42%)
          </span>
        </Card>

        <Card className="p-4 bg-[var(--color-surface-elevated)]/40 border border-amber-500/20 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Ticket Médio</span>
            <ShoppingCart className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-500 font-mono">
            R$ {metrics.ticketMedio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">
            Média por atendimento no caixa
          </span>
        </Card>

        <Card onClick={() => setDrillKey("catalogo")} className="p-4 bg-[var(--color-surface-elevated)]/40 border border-purple-500/20 shadow-xs cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Catálogo Ativo</span>
            <Boxes className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-black text-[var(--color-text-primary)]">
            {metrics.totalItensEstoque}
          </p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">
            Itens monitorados em estoque
          </span>
        </Card>
      </div>

      {/* Analytics Rows */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Top 5 Produtos Mais Vendidos */}
        <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500" /> Mais Vendidos (Volume)
              </h4>
              <Link to="/app/varejo/estoque" className="text-[11px] font-bold text-[var(--color-primary-blue)] hover:underline">
                Ver Estoque
              </Link>
            </div>

            <div className="space-y-3">
              {metrics.topProdutos.map((p, idx) => {
                const maxQty = metrics.topProdutos[0]?.qty || 1;
                const pct = Math.round((p.qty / maxQty) * 100);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--color-text-primary)] truncate max-w-[180px]">
                        {idx + 1}. {p.name}
                      </span>
                      <span className="font-mono text-[var(--color-text-muted)]">
                        <strong>{p.qty} un</strong> • R$ {(Number(p.total) || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-primary-blue)] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {metrics.topProdutos.length === 0 && (
                <div className="text-xs text-[var(--color-text-muted)] py-6 text-center">
                  Nenhuma venda computada ainda hoje.
                </div>
              )}
            </div>
          </div>
          <div className="pt-4 mt-4 border-t border-[var(--color-border-subtle)] text-[10px] text-[var(--color-text-muted)] flex justify-between">
            <span>Calculado automaticamente via PDV</span>
            <span className="text-emerald-500 font-bold">Alta rotatividade</span>
          </div>
        </div>

        {/* Mix de Meios de Pagamento */}
        <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-500" /> Meios de Pagamento
              </h4>
              <span className="text-[10px] font-mono text-[var(--color-text-muted)]">PDV Live</span>
            </div>

            <div className="space-y-3">
              {Object.entries(metrics.paymentMap).map(([method, val], idx) => {
                const pct = metrics.totalFaturamento > 0 ? Math.round((val / metrics.totalFaturamento) * 100) : 0;
                let Icon = CreditCard;
                if (method.toLowerCase().includes("pix")) Icon = QrCode;
                if (method.toLowerCase().includes("dinheiro")) Icon = Banknote;

                return (
                  <div key={idx} className="p-2.5 rounded-xl bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex items-center justify-center text-[var(--color-text-primary)]">
                        <Icon className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--color-text-primary)]">{method}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{pct}% do volume</p>
                      </div>
                    </div>
                    <span className="text-xs font-black font-mono text-emerald-500">
                      R$ {val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs">
            <span className="text-[10px] text-[var(--color-text-muted)]">Total Transacionado</span>
            <span className="font-mono font-bold text-[var(--color-text-primary)]">
              R$ {metrics.totalFaturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Reposição & Estoque Baixo */}
        <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Estoque Crítico
              </h4>
              <Link to="/app/varejo/compras" className="text-[11px] font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-1">
                Nova Compra <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {itensCriticos.map((item, i) => (
                <div key={i} className="p-2.5 rounded-xl bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] flex items-center justify-between">
                  <div className="max-w-[170px]">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{item.name}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      Saldo: <strong className="text-rose-500">{item.stock} un.</strong> • Mín: {item.min}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    item.status === "Crítico"
                      ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                      : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                  }`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-text-muted)]">Itens necessitando reposição</span>
            <Link to="/app/varejo/estoque" className="text-xs font-bold text-[var(--color-primary-blue)] hover:underline">
              Gerenciar Saldo
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Row: Vendas Recentes & Compras com Fornecedores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Vendas Recentes */}
        <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-500" /> Últimos Cupons / Vendas PDV
            </h4>
            <Link to="/app/varejo/vendas" className="text-[11px] font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-1">
              Terminal PDV <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-2">
            {(vendas || []).slice(0, 4).map((v) => {
              const itens = v.itens || [];
              return (
                <div key={v.id} className="p-3 rounded-xl bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] flex items-center justify-between hover:bg-[var(--color-surface-sunken)] transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-[var(--color-primary-blue)]">{v.id}</span>
                      <p className="text-xs font-bold text-[var(--color-text-primary)]">{v.cliente || "Consumidor"}</p>
                    </div>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      {v.vendedor ? `Atendido por ${v.vendedor} • ` : ""}{v.metodo || "Outro"} • {itens.length} {itens.length === 1 ? "item" : "itens"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black font-mono text-emerald-500 block">
                      R$ {(Number(v.total) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] text-[var(--color-text-muted)] uppercase">{v.status === "cancelada" ? "Cancelada" : "Concluída"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Compras com Fornecedores */}
        <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-500" /> Ordens de Compra & Reposição
            </h4>
            <Link to="/app/varejo/compras" className="text-[11px] font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-1">
              Ver Todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-2">
            {(compras || []).map((c, i) => (
              <div key={i} className="p-3 rounded-xl bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] flex items-center justify-between hover:bg-[var(--color-surface-sunken)] transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)]">{c.id}</span>
                    <p className="text-xs font-bold text-[var(--color-text-primary)]">{c.fornecedor}</p>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    {c.data} • <strong className="text-[var(--color-text-primary)] font-mono">R$ {Number(c.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  {c.status || "Pendente"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DrillDownPanel
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        title={drillKey === "vendas" ? "Faturamento Hoje" : drillKey === "catalogo" ? "Catálogo Ativo" : undefined}
        rows={drillKey === "vendas" ? (vendas || []).filter((v) => v.status !== "cancelada") : drillKey === "catalogo" ? (products || []) : []}
        columns={drillKey === "vendas" ? vendaColumns : productColumns}
      />
    </PageContainer>
  );
}
