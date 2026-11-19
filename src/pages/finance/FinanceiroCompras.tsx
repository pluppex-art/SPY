import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, ShoppingCart } from "lucide-react";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Skeleton } from "../../components/ui/skeleton";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { useLocalization } from "../../contexts/LocalizationContext";
import { FilterBar, FilterSearch } from "../../components/ui/kpi-filter-card";
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

  const alternar = (id: string) =>
    setAbertos((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <PageContainer title="Compras e Parcelas" description="Cada compra parcelada com as parcelas pagas, a vencer e atrasadas — controle de boletos por fornecedor ou cliente.">
      {erro && <Card className="p-4 text-sm text-red-600">{erro}</Card>}

      <FilterBar>
        <div className="flex gap-1">
          {(["Pagar", "Receber"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${tipo === t ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)] text-white" : "border-[var(--color-border-default)]"}`}
            >
              {t === "Pagar" ? "Compras (a pagar)" : "Vendas parceladas (a receber)"}
            </button>
          ))}
        </div>
        <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar compra ou fornecedor…" />
      </FilterBar>

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
    </PageContainer>
  );
}
