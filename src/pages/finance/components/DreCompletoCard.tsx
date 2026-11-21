import { useEffect, useState } from "react";
import { ListTree } from "lucide-react";
import { SecaoCard } from "./SecaoCard";
import { apiFetch } from "../../../lib/apiClient";
import { useLocalization } from "../../../contexts/LocalizationContext";
import type { DreCompleto } from "../../../lib/dre/dre";

type Resposta = DreCompleto & { regime: "competencia" | "caixa"; lancamentos: number; itensSemCusto: number; vendasNoPeriodo: number; legado: { quantidade: number } };

/** DRE completo (plano de contas da Fase 1): cascata de receita até lucro líquido. Só lançamentos da regra nova; os antigos seguem no DRE acima. */
export function DreCompletoCard({ tenantId, startDate, endDate }: { tenantId: string | null; startDate: string; endDate: string }) {
  const { formatCurrency } = useLocalization();
  const fmt = (v: number) => formatCurrency(v);
  const [regime, setRegime] = useState<"competencia" | "caixa">("competencia");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setDados(null); setErro(false);
    if (!tenantId) return;
    let cancelado = false;
    apiFetch(`/api/finance/dre-completo?tenantId=${encodeURIComponent(tenantId)}&startDate=${startDate}&endDate=${endDate}&regime=${regime}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("falhou"))))
      .then((d) => { if (!cancelado) setDados(d); })
      .catch(() => { if (!cancelado) setErro(true); });
    return () => { cancelado = true; };
  }, [tenantId, startDate, endDate, regime]);

  type Linha = { nome: string; valor: number; tipo: "linha" | "sub" | "final"; sinal?: "menos" };
  const linhas: Linha[] = dados ? [
    { nome: "Receita bruta", valor: dados.receitaBruta, tipo: "linha" },
    { nome: "(−) Deduções (impostos, devoluções, estornos)", valor: dados.deducoes, tipo: "linha", sinal: "menos" },
    { nome: "(=) Receita líquida", valor: dados.receitaLiquida, tipo: "sub" },
    { nome: "(−) CMV / CSP", valor: dados.cmv, tipo: "linha", sinal: "menos" },
    { nome: "(=) Lucro bruto", valor: dados.lucroBruto, tipo: "sub" },
    { nome: "(−) Despesas comerciais", valor: dados.despesasComerciais, tipo: "linha", sinal: "menos" },
    { nome: "(−) Despesas administrativas", valor: dados.despesasAdministrativas, tipo: "linha", sinal: "menos" },
    { nome: "(−) Despesas com pessoal", valor: dados.despesasPessoal, tipo: "linha", sinal: "menos" },
    { nome: "(=) EBITDA", valor: dados.ebitda, tipo: "sub" },
    { nome: "(−) Depreciação e amortização", valor: dados.depreciacao, tipo: "linha", sinal: "menos" },
    { nome: "(=) Resultado operacional (EBIT)", valor: dados.resultadoOperacional, tipo: "sub" },
    { nome: "(+/−) Resultado financeiro", valor: dados.resultadoFinanceiro, tipo: "linha" },
    { nome: "(=) Lucro antes do IR/CSLL", valor: dados.lucroAntesIr, tipo: "sub" },
    { nome: "(−) IRPJ e CSLL", valor: dados.irCsll, tipo: "linha", sinal: "menos" },
    { nome: "(=) LUCRO LÍQUIDO", valor: dados.lucroLiquido, tipo: "final" },
  ] : [];

  return (
    <SecaoCard titulo="DRE completo (plano de contas)" icon={ListTree}>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <p className="text-[11px] text-[var(--color-text-faint)]">Só lançamentos feitos depois da Fase 1. Os antigos continuam no DRE acima.</p>
        <div className="inline-flex rounded-[var(--radius-control)] border border-[var(--color-border-default)] overflow-hidden text-xs">
          {(["competencia", "caixa"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setRegime(r)}
              className={`px-3 py-1.5 ${regime === r ? "bg-[var(--color-surface-sunken)] font-semibold text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}`}>
              {r === "competencia" ? "Competência" : "Caixa"}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="text-xs text-[var(--color-danger)]">Não foi possível carregar o DRE completo agora.</p>}
      {!erro && !dados && <p className="text-xs text-[var(--color-text-muted)]">Carregando…</p>}

      {dados && (
        <>
          {dados.lancamentos === 0 && dados.vendasNoPeriodo === 0 && (
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              Nenhum lançamento novo neste período{dados.legado.quantidade > 0 ? ` (há ${dados.legado.quantidade} lançamento(s) antigos, que aparecem no DRE acima)` : ""}.
            </p>
          )}
          <div className="space-y-1">
            {linhas.map((l, i) => (
              <div key={i} className={`flex items-center justify-between px-4 py-2 rounded-[var(--radius-control)] ${l.tipo !== "linha" ? "bg-[var(--color-surface-sunken)] font-semibold" : ""} ${l.tipo === "final" ? "border border-[var(--color-border-default)]" : ""}`}>
                <span className={`text-xs ${l.tipo === "linha" ? "text-[var(--color-text-muted)]" : "text-[var(--color-text-primary)]"}`}>{l.nome}</span>
                <span className={`font-mono text-xs tabular-nums ${l.valor < 0 && l.tipo !== "linha" ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"}`}>
                  {l.sinal === "menos" && l.valor > 0 ? `(${fmt(l.valor)})` : fmt(l.valor)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-1 text-[11px] text-[var(--color-text-faint)]">
            {dados.pendencias.quantidade > 0 && (
              <p className="text-[var(--color-warning)]">
                {dados.pendencias.quantidade} lançamento(s) ({fmt(dados.pendencias.valor)}) ficaram de fora por não terem uma conta do plano — classifique-os para entrarem no DRE.
              </p>
            )}
            {dados.itensSemCusto > 0 && (
              <p className="text-[var(--color-warning)]">{dados.itensSemCusto} item(ns) vendido(s) sem custo cadastrado: o CMV está subestimado e o lucro, superestimado.</p>
            )}
            {dados.foraDoResultado !== 0 && <p>{fmt(dados.foraDoResultado)} fora do resultado (empréstimos, aportes, retiradas): contam só no caixa.</p>}
            {dados.cmvMercadoria > 0 && <p>CMV inclui {fmt(dados.cmvMercadoria)} de mercadorias vendidas (custo do dia da venda).</p>}
          </div>
        </>
      )}
    </SecaoCard>
  );
}
