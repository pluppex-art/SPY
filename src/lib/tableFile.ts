// Leitura de planilhas (CSV/XLSX) no navegador + mapeamento de colunas para a Comparação de
// Tabelas. O arquivo NUNCA sobe para o servidor cru: só as linhas já mapeadas/validadas.
import Papa from "papaparse";
import { parseMoney } from "./tableMatch";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 8000;
const ALLOWED_EXT = ["csv", "xlsx", "xls"];

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  fileName: string;
}

const cellToString = (v: any): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("result" in v) return cellToString((v as any).result); // fórmula
    if ("text" in v) return String((v as any).text ?? ""); // hyperlink
    if ("richText" in v) return ((v as any).richText || []).map((t: any) => t.text).join("");
    return "";
  }
  return String(v).trim();
};

/** Lê CSV, XLSX ou XLS antigo (1ª planilha). Valida extensão, tamanho e quantidade de linhas. */
export async function readTableFile(file: File, opts: { maxBytes?: number; maxRows?: number } = {}): Promise<ParsedTable> {
  const maxBytes = opts.maxBytes ?? MAX_FILE_BYTES;
  const maxRows = opts.maxRows ?? MAX_ROWS;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error("Use um arquivo .xlsx, .xls ou .csv.");
  }
  if (file.size > maxBytes) throw new Error(`Arquivo maior que ${Math.round(maxBytes / 1024 / 1024)} MB.`);

  let matrix: string[][] = [];
  if (ext === "csv") {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    matrix = (parsed.data as string[][]).map((r) => r.map((c) => String(c ?? "").trim()));
  } else if (ext === "xls") {
    const { readXlsMatrix } = await import("./xlsLegacy");
    matrix = readXlsMatrix(await file.arrayBuffer());
  } else {
    const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new (ExcelJS as any).Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("A planilha está vazia.");
    ws.eachRow({ includeEmpty: false }, (row: any) => {
      const values: any[] = Array.isArray(row.values) ? row.values.slice(1) : [];
      matrix.push(values.map(cellToString));
    });
  }

  matrix = matrix.filter((r) => r.some((c) => c !== ""));
  if (matrix.length < 2) throw new Error("A planilha precisa de um cabeçalho e ao menos uma linha.");
  const width = Math.max(...matrix.map((r) => r.length));
  const headers = matrix[0].concat(Array(Math.max(0, width - matrix[0].length)).fill("")).map((h, i) => h || `Coluna ${i + 1}`);
  const rows = matrix.slice(1).map((r) => r.concat(Array(Math.max(0, width - r.length)).fill("")));
  if (rows.length > maxRows) throw new Error(`A tabela tem ${rows.length} linhas; o limite é ${maxRows}.`);
  return { headers, rows, fileName: file.name };
}

// ─── Mapeamento de colunas ───────────────────────────────────────────────────

export type ComparisonField = "nome" | "codigo" | "quantidade" | "valor" | "custo";
export type BaseField = "nome" | "codigo_interno" | "codigo_externo" | "categoria" | "tipo" | "material" | "unidade" | "custo" | "valor" | "parceiro" | "nomes_alternativos";

export type ColumnMapping<F extends string> = Partial<Record<F, number>>;

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const HINTS_COMPARISON: Record<ComparisonField, string[]> = {
  nome: ["nome do exame", "exame", "procedimento", "descricao", "nome", "servico", "item"],
  codigo: ["codigo", "cod", "tuss", "cbhpm", "sigla", "id"],
  quantidade: ["quantidade", "qtd", "qtde", "volume"],
  valor: ["valor", "preco", "tabela", "valor parceiro", "valor unitario"],
  custo: ["custo", "custo interno"],
};
const HINTS_BASE: Record<BaseField, string[]> = {
  nome: ["nome oficial", "nome do exame", "exame", "nome", "descricao", "procedimento"],
  codigo_interno: ["codigo interno", "cod interno", "codigo", "cod"],
  codigo_externo: ["codigo externo", "cod externo", "tuss", "cbhpm", "sigla"],
  categoria: ["categoria", "grupo", "area"],
  tipo: ["tipo"],
  material: ["material", "amostra"],
  unidade: ["unidade", "un"],
  custo: ["custo"],
  valor: ["valor", "preco", "valor comercial"],
  parceiro: ["parceiro", "laboratorio", "lab"],
  nomes_alternativos: ["sinonimos", "nomes alternativos", "apelidos", "aliases"],
};

/** Sugere o mapeamento pelos cabeçalhos (o usuário confirma/ajusta antes de processar). */
export function guessMapping<F extends string>(headers: string[], hints: Record<F, string[]>): ColumnMapping<F> {
  const norm = headers.map(strip);
  const used = new Set<number>();
  const out: ColumnMapping<F> = {};
  for (const field of Object.keys(hints) as F[]) {
    for (const hint of hints[field]) {
      let idx = norm.findIndex((h, i) => !used.has(i) && h === hint);
      if (idx < 0) idx = norm.findIndex((h, i) => !used.has(i) && h.includes(hint));
      if (idx >= 0) { out[field] = idx; used.add(idx); break; }
    }
  }
  return out;
}
export const guessComparisonMapping = (h: string[]) => guessMapping<ComparisonField>(h, HINTS_COMPARISON);
export const guessBaseMapping = (h: string[]) => guessMapping<BaseField>(h, HINTS_BASE);

export interface MappedComparisonRow {
  linha: number;
  nome: string;
  codigo: string;
  quantidade: number | null;
  valor: number | null;
  custo: number | null;
  extras: Record<string, string>;
}

/** Aplica o mapeamento; colunas não mapeadas vão para `extras` (até 20). Devolve também os problemas. */
export function mapComparisonRows(table: ParsedTable, m: ColumnMapping<ComparisonField>) {
  const rows: MappedComparisonRow[] = [];
  const issues = { semNome: 0, valorInvalido: 0, duplicadas: 0 };
  const mappedIdx = new Set(Object.values(m).filter((v): v is number => typeof v === "number"));
  const extraIdx = table.headers.map((_, i) => i).filter((i) => !mappedIdx.has(i)).slice(0, 20);
  const seen = new Set<string>();
  table.rows.forEach((r, i) => {
    const nome = m.nome !== undefined ? r[m.nome] : "";
    const codigo = m.codigo !== undefined ? r[m.codigo] : "";
    if (!nome && !codigo) { issues.semNome++; return; }
    const rawValor = m.valor !== undefined ? r[m.valor] : "";
    const valor = rawValor ? parseMoney(rawValor) : null;
    if (rawValor && valor === null) issues.valorInvalido++;
    const key = `${(nome || "").toLowerCase()}|${(codigo || "").toLowerCase()}`;
    if (seen.has(key)) issues.duplicadas++;
    seen.add(key);
    const qtd = m.quantidade !== undefined && r[m.quantidade] ? parseMoney(r[m.quantidade]) : null;
    const custo = m.custo !== undefined && r[m.custo] ? parseMoney(r[m.custo]) : null;
    rows.push({
      linha: i + 2, nome: nome || "", codigo: codigo || "", quantidade: qtd, valor, custo,
      extras: Object.fromEntries(extraIdx.filter((x) => r[x]).map((x) => [table.headers[x], r[x]])),
    });
  });
  return { rows, issues };
}
