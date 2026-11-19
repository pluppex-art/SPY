import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, ShoppingCart, FileSpreadsheet, Layers, Wallet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { exportarXlsx, dataParaArquivo } from "../../lib/exportXlsx";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Skeleton } from "../../components/ui/skeleton";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { useLocalization } from "../../contexts/LocalizationContext";
import { FilterBar, FilterSearch, FilterChips } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { kpiSimples } from "./components/kpiSimples";
import { LegendaStatusFinanceiro, StatusFinanceiroBadge } from "./components/StatusFinanceiroBadge";
import { statusDoLancamento, useFinanceEntriesResumo, type LancamentoResumo, type StatusFinanceiro } from "./hooks/useFinanceEntriesResumo";

const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

interface Grupo {
  id: string;
  descricao: string;
  contraparte: string | null;
  parcelas: LancamentoResumo[];
  total: number;
  pagas: number;
  status: StatusFinanceiro;
}

/**
 * Compras e Parcelas — cada compra parcelada (ou boleto em várias vezes) com
 * "2/6 parcelas pagas", vencimento, valor e status de cada parcela. Serve tanto
 * para Pagar (fornecedores) quanto para Receber (vendas parceladas).
 */
export default function FinanceiroCompras() {
  const { rows, loading, erro, hoje } = useFinanceEntriesResumo();
  const { formatCurrency: brl } = useLocalization();
  const [tipo, setTipo] = useState<"Pagar" | "Receber">("Pagar");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const grupos = useMemo<Grupo[]>(() => {
    const m = new Map<string, LancamentoResumo[]>();
    for (const l of rows) {
      if (l.type !== tipo || !l.installment_group_id || (l.installment_total ?? 0) < 2) continue;
      const arr = m.get(l.installment_group_id) ?? [];
      arr.push(l);
      m.set(l.installment_group_id, arr);
    }
    const q = busca.trim().toLowerCase();
    return [...m.entries()]
      .map(([id, ps]) => {
        const parcelas = ps.sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0));
        const pagas = parcelas.filter((p) => p.status === "Pago").length;
        const atrasada = parcelas.some((p) => statusDoLancamento(p, hoje) === "Atrasado");
        const status: StatusFinanceiro = pagas === parcelas.length ? "Pago" : atrasada ? "Atrasado" : pagas > 0 ? "Parcial" : "Pendente";
        // "Compra X" sem o sufixo " (2/6)" que o parcelamento acrescenta à descrição.
        const descricao = parcelas[0].description.replace(/\s*\(?\d+\s*\/\s*\d+\)?\s*$/, "") || parcelas[0].description;
        return { id, descricao, contraparte: parcelas[0].counterparty, parcelas, total: parcelas.reduce((a, p) => a + p.value, 0), pagas, status };
      })
      .filter((g) => !q || `${g.descricao} ${g.contraparte ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => Number(a.status === "Pago") - Number(b.status === "Pago") || a.descricao.localeCompare(b.descricao));
  }, [rows, tipo, busca, hoje]);

  const exportar = async () => {
    const linhas = grupos.flatMap((g) =>
      g.parcelas.map((p) => [g.descricao, g.contraparte, `${p.installment_number}/${p.installment_total}`, p.date, p.value, statusDoLancamento(p, hoje), `${g.pagas}/${g.parcelas.length}`]),
    );
    try {
      await exportarXlsx(`${tipo === "Pagar" ? "compras" : "vendas-parceladas"}-${dataParaArquivo()}`, [{
        nome: tipo === "Pagar" ? "Compras e parcelas" : "Vendas parceladas",
        colunas: [
          { titulo: tipo === "Pagar" ? "Compra" : "Venda", largura: 36 }, { titulo: tipo === "Pagar" ? "Fornecedor" : "Cliente", largura: 28 }, { titulo: "Parcela", largura: 10 },
          { titulo: "Vencimento", tipo: "data" }, { titulo: "Valor", tipo: "moeda" }, { titulo: "Status", largura: 12 }, { titulo: "Parcelas pagas (compra)", largura: 22 },
        ],
        linhas,
      }]);
      toast.success(`${linhas.length} parcela(s) exportada(s).`);
    } catch {
      toast.error("Não foi possível gerar a planilha.");
    }
  };

  const alternar = (id: string) =>
    setAbertos((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <PageContainer
      title="Compras e Parcelas"
      description="Cada compra parcelada com as parcelas pagas, a vencer e atrasadas — controle de boletos por fornecedor ou cliente."
      actions={<Button variant="outline" onClick={exportar} disabled={grupos.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar planilha</Button>}
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
      {erro && <Card className="p-4 text-sm text-red-600">{erro}</Card>}

      <FinanceKpiFilter
        id="finCompras"
        kpis={[
          kpiSimples(tipo === "Pagar" ? "Compras parceladas" : "Vendas parceladas", loading ? "…" : grupos.length, Layers, `${grupos.filter((g) => g.status !== "Pago").length} em andamento`),
          kpiSimples("Valor total", loading ? "…" : brl(grupos.reduce((a, g) => a + g.total, 0)), Wallet, "Soma das parcelas"),
          kpiSimples("Parcelas atrasadas", loading ? "…" : grupos.reduce((a, g) => a + g.parcelas.filter((p) => statusDoLancamento(p, hoje) === "Atrasado").length, 0), AlertTriangle, "Vencidas e não pagas", grupos.some((g) => g.status === "Atrasado")),
          kpiSimples("Já pago", loading ? "…" : brl(grupos.reduce((a, g) => a + g.parcelas.filter((p) => p.status === "Pago").reduce((x, p) => x + p.value, 0), 0)), CheckCircle2, "Parcelas quitadas"),
        ]}
        activeCount={busca.trim() ? 1 : 0}
        onClear={() => setBusca("")}
      >
        <FilterBar>
          <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar compra ou fornecedor…" />
        </FilterBar>
        <FilterChips
          value={tipo}
          onChange={(v) => setTipo(v as "Pagar" | "Receber")}
          allLabel="Compras (a pagar)"
          allValue="Pagar"
          options={[{ value: "Receber", label: "Vendas parceladas (a receber)" }]}
        />
      </FinanceKpiFilter>

      {loading && rows.length === 0 ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : grupos.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma compra parcelada"
          description="Ao lançar uma despesa parcelada em Despesas, ela aparece aqui com o controle de cada parcela."
          action={<Link to="/app/financeiro/despesas"><Button>Ir para Despesas</Button></Link>}
        />
      ) : (
        <div className="space-y-2">
          {grupos.map((g) => {
            const aberto = abertos.has(g.id);
            return (
              <Card key={g.id} className="p-3">
                <button type="button" onClick={() => alternar(g.id)} className="flex w-full items-center gap-3 text-left">
                  {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{g.descricao}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{g.contraparte || "Sem fornecedor/cliente"} · {g.pagas}/{g.parcelas.length} parcelas pagas</p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border-default)]">
                      <div className="h-full bg-emerald-500" style={{ width: `${(g.pagas / g.parcelas.length) * 100}%` }} />
                    </div>
                  </div>
                  <StatusFinanceiroBadge status={g.status} />
                  <span className="text-sm font-semibold tabular-nums">{brl(g.total)}</span>
                </button>
                {aberto && (
                  <ul className="mt-3 divide-y divide-[var(--color-border-default)] border-t border-[var(--color-border-default)]">
                    {g.parcelas.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span>Parcela {p.installment_number}/{p.installment_total} · vence {dataBR(p.date)}</span>
                        <span className="flex items-center gap-3">
                          <StatusFinanceiroBadge status={statusDoLancamento(p, hoje)} />
                          <span className="font-semibold tabular-nums">{brl(p.value)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <LegendaStatusFinanceiro />
      </div>
    </PageContainer>
  );
}
