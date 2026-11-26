/** Desenho de uma aba do relatório: indicadores (o mesmo card do Financeiro), gráficos e tabelas. */
import { AlertTriangle, Hash, Percent, Wallet } from "lucide-react";
import { FinanceKpiGrid } from "../../pages/finance/components/FinanceKpiGrid";
import { kpiSimples } from "../../pages/finance/components/kpiSimples";
import { Card } from "../ui/card";
import { cn } from "../../lib/utils";
import { formatarValor, valorCurto, type AbaRelatorio, type CardRelatorio, type GraficoRelatorio, type TabelaRelatorio } from "../../lib/relatorio";

const iconeDoCard = (c: CardRelatorio) => (c.alerta ? AlertTriangle : c.formato === "moeda" ? Wallet : c.formato === "percentual" ? Percent : Hash);

export function CardsRelatorio({ cards }: { cards: CardRelatorio[] }) {
  if (!cards.length) return null;
  return (
    <div className="spy-rel-cards">
      <FinanceKpiGrid cards={cards.map((c) => kpiSimples(c.titulo, formatarValor(c.valor, c.formato), iconeDoCard(c), c.detalhe, c.alerta))} />
    </div>
  );
}

// Cores das séries quando há duas (conferidas para daltonismo, no claro e no escuro). Com uma só, vale a cor da empresa.
const CORES_SERIES = ["bg-[#2a78d6] dark:bg-[#3987e5]", "bg-[#eb6834] dark:bg-[#d95926]"];
const corDaSerie = (i: number, total: number) => (total === 1 ? "bg-[var(--color-primary-blue)]" : CORES_SERIES[i % CORES_SERIES.length]);

/** Rótulos "MM/AA" ou "DD/MM": é uma sequência no tempo, desenhada em colunas. O resto é comparação, em barras deitadas. */
const ehSequencia = (g: GraficoRelatorio) => g.pontos.length > 0 && g.pontos.every((p) => /^\d{2}\/\d{2}$/.test(String(p.rotulo)));

function Colunas({ g }: { g: GraficoRelatorio }) {
  const todos = g.pontos.flatMap((p) => g.series.map((s) => Number(p[s.chave]) || 0));
  const teto = Math.max(0, ...todos);
  const piso = Math.min(0, ...todos);
  const faixa = teto - piso || 1;
  const poucos = g.pontos.length <= 12;
  const passo = Math.ceil(g.pontos.length / 16);
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-stretch gap-1.5" style={{ minWidth: g.pontos.length * (g.series.length > 1 ? 34 : 18) }}>
        {g.pontos.map((p, i) => (
          <div key={`${p.rotulo}-${i}`} className="flex-1 min-w-0 flex flex-col">
            <div className="relative h-44 flex gap-0.5 mt-4">
              {g.series.map((s, j) => {
                const v = Number(p[s.chave]) || 0;
                const altura = (Math.abs(v) / faixa) * 100;
                const base = (-piso / faixa) * 100;
                return (
                  <div key={s.chave} className="relative flex-1 min-w-0" title={`${p.rotulo} · ${s.titulo}: ${formatarValor(v, g.formato)}`}>
                    <div
                      className={cn("absolute inset-x-0 mx-auto max-w-9", v >= 0 ? "rounded-t" : "rounded-b", v < 0 ? "bg-rose-500" : corDaSerie(j, g.series.length))}
                      style={{ height: `${v === 0 ? 0 : Math.max(altura, 1)}%`, bottom: `${v >= 0 ? base : base - altura}%` }}
                    />
                    {poucos && v !== 0 && (
                      <span className="absolute inset-x-[-12px] text-center text-[9px] font-bold tabular-nums text-[var(--color-text-muted)] whitespace-nowrap"
                        style={{ bottom: `calc(${v >= 0 ? base + altura : base}% + 2px)` }}>
                        {valorCurto(v, g.formato)}
                      </span>
                    )}
                  </div>
                );
              })}
              <div className="absolute inset-x-0 border-t border-[var(--color-border-default)]" style={{ bottom: `${(-piso / faixa) * 100}%` }} />
            </div>
            <span className="mt-1.5 text-[9px] text-center text-[var(--color-text-faint)] whitespace-nowrap">{i % passo === 0 ? p.rotulo : " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Barras({ g }: { g: GraficoRelatorio }) {
  const serie = g.series[0];
  const maior = Math.max(1, ...g.pontos.map((p) => Math.abs(Number(p[serie.chave]) || 0)));
  return (
    <ul className="space-y-2.5">
      {g.pontos.map((p, i) => {
        const v = Number(p[serie.chave]) || 0;
        return (
          <li key={`${p.rotulo}-${i}`} title={`${p.rotulo}: ${formatarValor(v, g.formato)}`}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-[var(--color-text-primary)]">{p.rotulo || "Não informado"}</span>
              <span className="shrink-0 font-bold tabular-nums text-[var(--color-text-muted)]">{formatarValor(v, g.formato)}</span>
            </div>
            <div className="mt-1 h-2 rounded bg-[var(--color-surface-sunken)]">
              <div className={cn("h-2 rounded", v < 0 ? "bg-rose-500" : "bg-[var(--color-primary-blue)]")} style={{ width: `${(Math.abs(v) / maior) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Grafico({ g }: { g: GraficoRelatorio }) {
  const vazio = !g.pontos.some((p) => g.series.some((s) => Number(p[s.chave])));
  return (
    <Card className="p-4 sm:p-5 min-w-0 break-inside-avoid bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{g.titulo}</h3>
        {g.series.length > 1 && !vazio && (
          <div className="flex items-center gap-3">
            {g.series.map((s, i) => (
              <span key={s.chave} className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                <span className={cn("w-2.5 h-2.5 rounded-sm", corDaSerie(i, g.series.length))} />{s.titulo}
              </span>
            ))}
          </div>
        )}
      </div>
      {vazio ? <p className="py-8 text-center text-xs text-[var(--color-text-faint)]">Sem dados no período.</p> : ehSequencia(g) ? <Colunas g={g} /> : <Barras g={g} />}
    </Card>
  );
}

const aDireita = (f: string) => f === "moeda" || f === "numero" || f === "percentual";

function Tabela({ t }: { t: TabelaRelatorio }) {
  return (
    <Card className="min-w-0 overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] print:overflow-visible">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--color-border-default)]">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{t.titulo}</h3>
        <span className="text-[11px] text-[var(--color-text-faint)] font-medium">{t.linhas.length} {t.linhas.length === 1 ? "linha" : "linhas"}</span>
      </div>
      {t.linhas.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--color-text-faint)]">Nenhum registro.</p>
      ) : (
        <div className="max-h-[480px] overflow-auto print:max-h-none print:overflow-visible">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--color-surface-sunken)] print:static">
              <tr>
                {t.colunas.map((c) => (
                  <th key={c.chave} className={cn("px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] whitespace-nowrap", aDireita(c.formato) ? "text-right" : "text-left")}>{c.titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.linhas.map((l, i) => (
                <tr key={i} className="border-t border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-sunken)]/60">
                  {t.colunas.map((c) => (
                    <td key={c.chave} className={cn("px-3 py-2 text-[var(--color-text-primary)]", aDireita(c.formato) ? "text-right tabular-nums whitespace-nowrap" : c.formato === "data" ? "whitespace-nowrap" : "max-w-[320px] break-words")}>
                      {formatarValor(l[c.chave], c.formato)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {t.nota && <p className="px-4 py-2 border-t border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-faint)]">{t.nota}</p>}
    </Card>
  );
}

export function AbaDoRelatorio({ aba }: { aba: AbaRelatorio }) {
  return (
    <div className="space-y-4">
      {aba.nota && <p className="text-xs text-[var(--color-text-muted)]">{aba.nota}</p>}
      <CardsRelatorio cards={aba.cards} />
      {aba.graficos.length > 0 && (
        <div className={cn("grid gap-4", aba.graficos.length > 1 && "lg:grid-cols-2")}>
          {aba.graficos.map((g) => <Grafico key={g.titulo} g={g} />)}
        </div>
      )}
      {aba.tabelas.map((t) => <Tabela key={t.titulo} t={t} />)}
    </div>
  );
}
