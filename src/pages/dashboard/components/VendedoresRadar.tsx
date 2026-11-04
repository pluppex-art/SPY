import { useMemo, useState } from "react";
import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from "recharts";
import { Card } from "../../../components/ui/card";
import { SectionTitle } from "../../../components/ui/section-title";
import {
  computeVendedores, resolverPeriodo, PERIODO_LABEL,
  type DadosVendedores, type Faixa, type PeriodoOpcao, type VendedorLinha,
} from "../vendedoresMetrics";

type Modo = "vendedores" | "produtos" | "periodos";

const COR_A = "#ef4444";
const COR_B = "#2563eb";

const selectCls =
  "h-9 min-w-0 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-3 text-xs font-semibold text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)] cursor-pointer";

interface Totais { receita: number; vendas: number; conversao: number; ticket: number; leads: number; oportunidades: number }

/** Soma as linhas (ou pega só a do vendedor escolhido) num único conjunto de números. */
function agregar(linhas: VendedorLinha[], vendedorKey: string | null): Totais {
  const base = vendedorKey ? linhas.filter((l) => l.key === vendedorKey) : linhas;
  const receita = base.reduce((s, l) => s + l.receita, 0);
  const vendas = base.reduce((s, l) => s + l.vendas, 0);
  const leads = base.reduce((s, l) => s + l.leads, 0);
  const oportunidades = base.reduce((s, l) => s + l.oportunidades, 0);
  return {
    receita, vendas, leads, oportunidades,
    ticket: vendas > 0 ? receita / vendas : 0,
    conversao: leads > 0 ? Math.round((vendas / leads) * 1000) / 10 : 0,
  };
}

function deLinha(l: VendedorLinha): Totais {
  return { receita: l.receita, vendas: l.vendas, leads: l.leads, oportunidades: l.oportunidades, ticket: l.ticket, conversao: l.conversao };
}

interface Props {
  dados: DadosVendedores;
  /** Faixa de datas da página (mesmo período da Central de Receita). */
  faixaPagina: Faixa;
  /** Linhas já calculadas pelo painel (período da página + produto escolhido no painel). */
  linhas: VendedorLinha[];
  produtos: { id: string; name: string }[];
  produtoSel: string;
  vendedorSel: string;
  formatCurrency: (n: number) => string;
}

const PERIODOS: PeriodoOpcao[] = ["mes", "mesPassado", "90d", "ano", "tudo", "pagina"];

/** Comparativo em hexágono (radar) entre dois vendedores, dois produtos ou dois períodos. */
export default function VendedoresRadar({ dados, faixaPagina, linhas, produtos, produtoSel, vendedorSel, formatCurrency }: Props) {
  const podeVendedores = linhas.length >= 2;
  const [modo, setModo] = useState<Modo>(podeVendedores ? "vendedores" : "periodos");
  const modoAtivo: Modo = modo === "vendedores" && !podeVendedores ? "periodos" : modo;

  const ordenadas = useMemo(() => [...linhas].sort((a, b) => b.receita - a.receita), [linhas]);
  const [vA, setVA] = useState<string | null>(null);
  const [vB, setVB] = useState<string | null>(null);
  const keyA = vA && ordenadas.some((l) => l.key === vA) ? vA : ordenadas[0]?.key ?? "";
  const keyB = vB && ordenadas.some((l) => l.key === vB) ? vB : ordenadas.find((l) => l.key !== keyA)?.key ?? "";

  const [pA, setPA] = useState<string | null>(null);
  const [pB, setPB] = useState<string | null>(null);
  const prodA = pA && produtos.some((p) => p.id === pA) ? pA : produtos[0]?.id ?? "";
  const prodB = pB && produtos.some((p) => p.id === pB) ? pB : produtos.find((p) => p.id !== prodA)?.id ?? "";

  const [tA, setTA] = useState<PeriodoOpcao>("mes");
  const [tB, setTB] = useState<PeriodoOpcao>("mesPassado");

  const escopoVendedor = vendedorSel === "todos" ? null : vendedorSel;

  const [serieA, serieB, nomeA, nomeB] = useMemo((): [Totais, Totais, string, string] => {
    if (modoAtivo === "vendedores") {
      const a = ordenadas.find((l) => l.key === keyA);
      const b = ordenadas.find((l) => l.key === keyB);
      const vazio: Totais = { receita: 0, vendas: 0, conversao: 0, ticket: 0, leads: 0, oportunidades: 0 };
      return [a ? deLinha(a) : vazio, b ? deLinha(b) : vazio, a?.nome ?? "—", b?.nome ?? "—"];
    }
    if (modoAtivo === "produtos") {
      const calc = (id: string) => agregar(computeVendedores(dados, faixaPagina, { produtoId: id || null }).linhas, escopoVendedor);
      const nome = (id: string) => produtos.find((p) => p.id === id)?.name ?? "—";
      return [calc(prodA), calc(prodB), nome(prodA), nome(prodB)];
    }
    const prod = produtoSel === "todos" ? null : produtoSel;
    const calc = (op: PeriodoOpcao) =>
      agregar(computeVendedores(dados, resolverPeriodo(op, faixaPagina.from, faixaPagina.to), { produtoId: prod }).linhas, escopoVendedor);
    return [calc(tA), calc(tB), PERIODO_LABEL[tA], PERIODO_LABEL[tB]];
  }, [modoAtivo, ordenadas, keyA, keyB, prodA, prodB, tA, tB, dados, faixaPagina, produtos, produtoSel, escopoVendedor]);

  const eixos = useMemo(() => {
    const defs: { eixo: string; get: (t: Totais) => number; fmt: (n: number) => string }[] = [
      { eixo: "Receita", get: (t) => t.receita, fmt: formatCurrency },
      { eixo: "Vendas", get: (t) => t.vendas, fmt: (n) => String(n) },
      { eixo: "Conversão", get: (t) => t.conversao, fmt: (n) => `${n}%` },
      { eixo: "Ticket médio", get: (t) => t.ticket, fmt: formatCurrency },
      { eixo: "Leads", get: (t) => t.leads, fmt: (n) => String(n) },
      { eixo: "Oportunidades", get: (t) => t.oportunidades, fmt: (n) => String(n) },
    ];
    return defs.map((d) => {
      const a = d.get(serieA);
      const b = d.get(serieB);
      const max = Math.max(a, b);
      return { eixo: d.eixo, A: max > 0 ? Math.round((a / max) * 100) : 0, B: max > 0 ? Math.round((b / max) * 100) : 0, realA: d.fmt(a), realB: d.fmt(b) };
    });
  }, [serieA, serieB, formatCurrency]);

  const semDados = eixos.every((e) => e.A === 0 && e.B === 0);

  const modos: { id: Modo; label: string; off?: boolean }[] = [
    { id: "vendedores", label: "Vendedores", off: !podeVendedores },
    { id: "produtos", label: "Produtos", off: produtos.length < 2 },
    { id: "periodos", label: "Períodos" },
  ];

  const opcoesVend = ordenadas.map((l) => <option key={l.key} value={l.key}>{l.nome}</option>);
  const opcoesProd = produtos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>);
  const opcoesPer = PERIODOS.map((p) => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>);

  return (
    <Card className="p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionTitle as="h4">Comparativo hexagonal</SectionTitle>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Compare dois {modoAtivo === "vendedores" ? "vendedores" : modoAtivo === "produtos" ? "produtos" : "períodos"} em 6 indicadores. Cada eixo vai de 0 ao maior valor entre os dois.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-[var(--color-surface-sunken)] p-1 border border-[var(--color-border-subtle)]" role="tablist" aria-label="Comparar por">
          {modos.map((m) => (
            <button
              key={m.id} type="button" role="tab" aria-selected={modoAtivo === m.id} disabled={m.off}
              onClick={() => setModo(m.id)}
              className={`px-3 h-8 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed ${modoAtivo === m.id ? "bg-[var(--color-primary-blue)] !text-[#fff]" : "bg-transparent text-[var(--color-text-muted)]"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex items-center gap-2 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COR_A }} />
          {modoAtivo === "vendedores" && <select value={keyA} onChange={(e) => setVA(e.target.value)} className={`${selectCls} flex-1`} aria-label="Série vermelha">{opcoesVend}</select>}
          {modoAtivo === "produtos" && <select value={prodA} onChange={(e) => setPA(e.target.value)} className={`${selectCls} flex-1`} aria-label="Série vermelha">{opcoesProd}</select>}
          {modoAtivo === "periodos" && <select value={tA} onChange={(e) => setTA(e.target.value as PeriodoOpcao)} className={`${selectCls} flex-1`} aria-label="Série vermelha">{opcoesPer}</select>}
        </label>
        <label className="flex items-center gap-2 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COR_B }} />
          {modoAtivo === "vendedores" && <select value={keyB} onChange={(e) => setVB(e.target.value)} className={`${selectCls} flex-1`} aria-label="Série azul">{opcoesVend}</select>}
          {modoAtivo === "produtos" && <select value={prodB} onChange={(e) => setPB(e.target.value)} className={`${selectCls} flex-1`} aria-label="Série azul">{opcoesProd}</select>}
          {modoAtivo === "periodos" && <select value={tB} onChange={(e) => setTB(e.target.value as PeriodoOpcao)} className={`${selectCls} flex-1`} aria-label="Série azul">{opcoesPer}</select>}
        </label>
      </div>

      {(modoAtivo === "produtos" || modoAtivo === "periodos") && escopoVendedor && (
        <p className="text-[11px] text-[var(--color-text-muted)]">Considerando só o vendedor selecionado acima.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
        <div className="h-[300px] sm:h-[340px] w-full min-w-0">
          {semDados ? (
            <p className="h-full flex items-center justify-center text-xs italic text-[var(--color-text-faint)] text-center">Sem dados nesses dois itens para comparar.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
              <RadarChart data={eixos} outerRadius="70%">
                <PolarGrid gridType="polygon" stroke="var(--color-border-default)" />
                <PolarAngleAxis dataKey="eixo" tick={{ fontSize: 12, fontWeight: 700, fill: "var(--color-text-primary)" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name={nomeA} dataKey="A" stroke={COR_A} fill={COR_A} fillOpacity={0.45} strokeWidth={2} />
                <Radar name={nomeB} dataKey="B" stroke={COR_B} fill={COR_B} fillOpacity={0.45} strokeWidth={2} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 12 }}
                  formatter={(_v: number, nome: string, item: any) => [nome === nomeA ? item.payload.realA : item.payload.realB, nome]}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[11px] uppercase font-bold text-[var(--color-text-faint)]">
              <tr>
                <th className="py-2 pr-2">Indicador</th>
                <th className="py-2 px-2" style={{ color: COR_A }}>{nomeA}</th>
                <th className="py-2 pl-2" style={{ color: COR_B }}>{nomeB}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {eixos.map((e) => (
                <tr key={e.eixo}>
                  <td className="py-2 pr-2 font-bold text-[var(--color-text-primary)]">{e.eixo}</td>
                  <td className="py-2 px-2 font-mono text-[var(--color-text-primary)] whitespace-nowrap">{e.realA}</td>
                  <td className="py-2 pl-2 font-mono text-[var(--color-text-primary)] whitespace-nowrap">{e.realB}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
