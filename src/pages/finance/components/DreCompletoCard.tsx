import { useEffect, useState } from "react";
import { ListTree, Download } from "lucide-react";
import { toast } from "sonner";
import { SecaoCard } from "./SecaoCard";
import { apiFetch } from "../../../lib/apiClient";
import { useLocalization } from "../../../contexts/LocalizationContext";
import type { DreCompleto } from "../../../lib/dre/dre";

type Resposta = DreCompleto & { regime: "competencia" | "caixa"; lancamentos: number; itensSemCusto: number; vendasNoPeriodo: number; legado: { quantidade: number } };

/** DRE completo (plano de contas da Fase 1): cascata de receita até lucro líquido. Só lançamentos da regra nova; os antigos seguem no DRE acima. */
export function DreCompletoCard({ tenantId, startDate, endDate }: { tenantId: string | null; startDate: string; endDate: string }) {
  const { formatCurrency } = useLocalization();
  const fmt = (v: number) => formatCurrency(v);
  const [regime, setRegime] = useState<"competencia" | "caixa">("caixa");
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

  // PDF = página de impressão só com este bloco (o navegador oferece "Salvar como PDF").
  const exportarPdf = () => {
    if (!dados) return;
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const rows = linhas.map((l) => `<tr class="${l.tipo !== "linha" ? "t" : ""}"><td>${esc(l.nome)}</td><td class="v">${esc(l.sinal === "menos" && l.valor > 0 ? `(${fmt(l.valor)})` : fmt(l.valor))}</td></tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) { toast.error("Libere os pop-ups do navegador para exportar o PDF."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>DRE completo</title><style>
      body{font-family:system-ui,sans-serif;color:#111;padding:32px;max-width:760px;margin:auto}
      h1{font-size:20px;margin:0}p{color:#555;font-size:12px;margin:4px 0 20px}
      table{width:100%;border-collapse:collapse;font-size:13px}td{padding:9px 10px;border-bottom:1px solid #e5e5e5}
      .v{text-align:right;font-variant-numeric:tabular-nums}.t td{font-weight:700;background:#f5f5f5}
    </style></head><body><h1>DRE completo</h1><p>${esc(startDate)} a ${esc(endDate)} · ${regime === "caixa" ? "Regime de Caixa" : "Regime de Competência"}</p><table>${rows}</table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <SecaoCard titulo="DRE completo (plano de contas)" icon={ListTree} direita={<button type="button" onClick={exportarPdf} disabled={!dados} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded border border-[var(--color-border-default)] text-[var(--color-text-muted)] bg-transparent cursor-pointer disabled:opacity-40 print:hidden"><Download className="w-3 h-3" /> PDF</button>}>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <p className="text-[11px] text-[var(--color-text-faint)]">Só lançamentos feitos depois da Fase 1. Os antigos continuam no DRE acima.</p>
        <div className="inline-flex rounded-[var(--radius-control)] border border-[var(--color-border-default)] overflow-hidden text-xs">
          {(["caixa", "competencia"] as const).map((r) => (
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
