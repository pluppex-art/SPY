/**
 * Relatórios do sistema. Os números vêm prontos da função `spy_relatorio` do banco (a mesma que a Aurora usa);
 * aqui ficam só os tipos, a regra de quais áreas a pessoa pode ver, a formatação e a versão em planilha.
 */
import type { AbaXlsx, ColunaXlsx } from "./exportXlsx";

export type FormatoValor = "texto" | "moeda" | "data" | "numero" | "percentual";

export interface ColunaRelatorio { chave: string; titulo: string; formato: FormatoValor }
export interface CardRelatorio { titulo: string; valor: number; formato: FormatoValor; detalhe: string; alerta: boolean }
export interface GraficoRelatorio { titulo: string; formato: FormatoValor; series: ColunaRelatorio[]; pontos: Record<string, any>[] }
export interface TabelaRelatorio { titulo: string; colunas: ColunaRelatorio[]; linhas: Record<string, any>[]; nota: string }
export interface AbaRelatorio { id: string; titulo: string; cards: CardRelatorio[]; graficos: GraficoRelatorio[]; tabelas: TabelaRelatorio[]; nota: string }
export interface AreaRelatorio { id: AreaId; titulo: string; abas: AbaRelatorio[] }
export interface Relatorio {
  empresa: string;
  filial: string;
  periodo: { inicio: string; fim: string };
  gerado_em: string;
  areas: AreaRelatorio[];
  avisos: string[];
}

/** Na ordem em que aparecem no relatório geral. Cada área aparece para quem tem ao menos um dos módulos. */
export const AREAS_RELATORIO = [
  { id: "vendas", modulos: ["crm"] },
  { id: "financeiro", modulos: ["financeiro"] },
  { id: "marketing", modulos: ["marketing"] },
  { id: "operacoes", modulos: ["produtividade", "catalogo", "agenda", "agendamento"] },
  { id: "varejo", modulos: ["varejo"] },
  { id: "imobiliario", modulos: ["imobiliaria"] },
  { id: "automotivo", modulos: ["automotivo", "concessionaria"] },
  { id: "solar", modulos: ["solar"] },
  { id: "clinicas", modulos: ["clinica"] },
  { id: "educacao", modulos: ["educacao"] },
  { id: "dev", modulos: ["dev"] },
] as const;

export type AreaId = (typeof AREAS_RELATORIO)[number]["id"];

export const areasPermitidas = (pode: (modulo: string) => boolean): AreaId[] =>
  AREAS_RELATORIO.filter((a) => a.modulos.some(pode)).map((a) => a.id);

export const dataBR = (iso: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

export function formatarValor(v: unknown, formato: FormatoValor): string {
  if (v === null || v === undefined || v === "") return "—";
  if (formato === "texto") return String(v);
  if (formato === "data") return dataBR(v) || String(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (formato === "moeda") return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const texto = n.toLocaleString("pt-BR", { maximumFractionDigits: formato === "percentual" ? 1 : 2 });
  return formato === "percentual" ? `${texto}%` : texto;
}

/** Valor curto para caber em cima de uma barra: 3.404.030 → "3,4 mi". */
export function valorCurto(v: unknown, formato: FormatoValor): string {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const curto = abs >= 1e6 ? `${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : abs >= 1e4 ? `${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`
      : abs >= 1e3 ? `${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
        : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return formato === "percentual" ? `${curto}%` : curto;
}

const nomeDeAba = (base: string, usados: Set<string>) => {
  const limpo = base.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() || "Planilha";
  let nome = limpo.slice(0, 31);
  for (let i = 2; usados.has(nome.toLowerCase()); i++) nome = `${limpo.slice(0, 31 - String(i).length - 1)} ${i}`;
  usados.add(nome.toLowerCase());
  return nome;
};

const colunaXlsx = (c: ColunaRelatorio): ColunaXlsx => ({
  titulo: c.titulo,
  tipo: c.formato === "moeda" || c.formato === "data" || c.formato === "numero" ? c.formato : c.formato === "percentual" ? "numero" : "texto",
  largura: c.formato === "texto" ? 28 : undefined,
});

/** O relatório inteiro em planilha: uma aba com todos os indicadores e uma aba por tabela com linhas. */
export function planilhasDoRelatorio(r: Relatorio): AbaXlsx[] {
  const usados = new Set<string>();
  const indicadores: AbaXlsx = {
    nome: nomeDeAba("Indicadores", usados),
    colunas: [{ titulo: "Área", largura: 18 }, { titulo: "Aba", largura: 24 }, { titulo: "Indicador", largura: 32 }, { titulo: "Valor", largura: 20 }, { titulo: "Detalhe", largura: 44 }],
    linhas: r.areas.flatMap((a) => a.abas.flatMap((b) => b.cards.map((c) => [a.titulo, b.titulo, c.titulo, formatarValor(c.valor, c.formato), c.detalhe]))),
  };
  const variasAreas = r.areas.length > 1;
  const tabelas = r.areas.flatMap((a) => a.abas.flatMap((b) => b.tabelas.filter((t) => t.linhas.length > 0).map((t): AbaXlsx => ({
    nome: nomeDeAba(variasAreas ? `${a.titulo} - ${t.titulo}` : t.titulo, usados),
    colunas: t.colunas.map(colunaXlsx),
    linhas: t.linhas.map((l) => t.colunas.map((c) => l[c.chave] ?? "")),
  }))));
  return [indicadores, ...tabelas];
}
