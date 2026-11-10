// Núcleo do importador de planilhas do S.P.Y. (genérico, para qualquer tela/nicho): tipos, leitura de
// valores (telefone, dinheiro, data, documento), sugestão de mapeamento e montagem das linhas.
// Funções puras, sem rede — a tela (ImportadorPlanilha) cuida de arquivo, duplicados e gravação.
import { parseMoney } from "./tableMatch";

export type FieldKind = "text" | "money" | "phone" | "email" | "date" | "digits" | "int";

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  /** Nomes de coluna reconhecidos (sem acento/maiúscula). Google Forms: "Nome completo", "Carimbo de data/hora"... */
  aliases: string[];
  kind?: FieldKind;
}

export interface ImportOption {
  key: string;
  label: string;
  type: "text" | "select";
  choices?: { value: string; label: string }[];
  placeholder?: string;
  default?: string;
}

export interface ExtraCell { header: string; value: string }

export interface ImportSpec {
  /** Identifica o cadastro (também nome do modelo para baixar). */
  entity: string;
  title: string;
  /** Texto curto de apoio no passo do arquivo. */
  hint?: string;
  fields: ImportField[];
  /** A linha só vale se tiver ao menos um destes campos preenchidos. */
  needOne: string[];
  /** Opções extras da importação (ex.: funil de destino, origem). Pode depender das já escolhidas. */
  options?: (values: Record<string, string>) => ImportOption[];
  /** Chaves que identificam a mesma pessoa/coisa (e-mail, telefone, documento...). Vazio = não checa. */
  rowKeys?: (v: Record<string, any>) => string[];
  /** Chaves já cadastradas na empresa (lê do banco, paginado). */
  loadExistingKeys?: (onProgress: (n: number) => void) => Promise<Set<string>>;
  /** Monta a linha do banco. `extras` = colunas do arquivo que não foram mapeadas. */
  build: (v: Record<string, any>, extras: ExtraCell[], opt: Record<string, string>) => Record<string, any>;
  /** Grava um lote. Devolve a mensagem de erro, se houver. */
  insertBatch: (rows: Record<string, any>[]) => Promise<string | null>;
  batchSize?: number;
  /** As colunas não mapeadas são guardadas (em texto) nas observações do cadastro. Sem isso, são ignoradas. */
  keepExtras?: boolean;
  /** Linhas do modelo (cabeçalho + 2 exemplos). */
  template: string[][];
  onDone?: () => void;
}

export const MAX_IMPORT_ROWS = 50_000;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export const stripText = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Telefone para WhatsApp: só dígitos; 10–11 dígitos ganham o 55. Vazio se não parecer telefone. */
export function normalizePhone(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 8 || d.length > 15) return "";
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}

export function normalizeEmail(raw: unknown): string {
  const e = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
}

/** dd/mm/aaaa [hh:mm], aaaa-mm-dd ou data do Excel → "aaaa-mm-dd". Vazio se inválida. */
export function normalizeDate(raw: unknown): string {
  const s = String(raw ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return "";
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const mo = Number(m[2]), d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseCell(raw: string, kind: FieldKind = "text"): any {
  const v = String(raw ?? "").trim();
  switch (kind) {
    case "money": return v ? parseMoney(v) : null;
    case "phone": return normalizePhone(v);
    case "email": return normalizeEmail(v);
    case "date": return normalizeDate(v);
    case "digits": return v.replace(/\D/g, "");
    case "int": { const n = parseInt(v.replace(/[^\d-]/g, ""), 10); return Number.isFinite(n) ? n : null; }
    default: return v;
  }
}

/** Sugere para cada coluna do arquivo o campo do cadastro (índice da coluna → chave do campo, ou "" = ignorar). */
export function guessColumns(headers: string[], fields: ImportField[]): string[] {
  const norm = headers.map(stripText);
  const out: string[] = headers.map(() => "");
  const usedFields = new Set<string>();
  // 1º passada: nome exato; 2º: contém. Cada campo é usado uma vez; a ordem dos aliases é a prioridade.
  for (const mode of ["eq", "has"] as const) {
    for (const f of fields) {
      if (usedFields.has(f.key)) continue;
      for (const alias of f.aliases) {
        const a = stripText(alias);
        const idx = norm.findIndex((h, i) => !out[i] && (mode === "eq" ? h === a : h.includes(a)));
        if (idx >= 0) { out[idx] = f.key; usedFields.add(f.key); break; }
      }
    }
  }
  return out;
}

export interface BuiltRow {
  /** Linha do arquivo (1 = primeira linha de dados; +1 para achar na planilha por causa do cabeçalho). */
  line: number;
  values: Record<string, any>;
  extras: ExtraCell[];
}

/** Aplica o mapeamento. Linhas sem nenhum dos campos de `needOne` são descartadas (vazias). */
export function buildRows(headers: string[], rows: string[][], columnMap: string[], spec: ImportSpec): { rows: BuiltRow[]; empty: number } {
  const kinds = new Map(spec.fields.map((f) => [f.key, f.kind] as const));
  const out: BuiltRow[] = [];
  let empty = 0;
  rows.forEach((r, i) => {
    const values: Record<string, any> = {};
    const extras: ExtraCell[] = [];
    headers.forEach((h, c) => {
      const raw = (r[c] ?? "").trim();
      const key = columnMap[c];
      if (key) {
        if (raw && (values[key] === undefined || values[key] === "")) values[key] = parseCell(raw, kinds.get(key));
      } else if (raw) {
        extras.push({ header: h, value: raw });
      }
    });
    const ok = spec.needOne.some((k) => values[k] !== undefined && values[k] !== "" && values[k] !== null);
    if (!ok) { empty++; return; }
    out.push({ line: i + 1, values, extras });
  });
  return { rows: out, empty };
}

/** Colunas extras viram texto legível ("Pergunta: resposta") para guardar nas observações. */
export function extrasToNotes(extras: ExtraCell[], maxLen = 3000): string {
  const t = extras.map((e) => `${e.header}: ${e.value}`).join("\n");
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

/** Quais linhas já existem (no banco ou antes no mesmo arquivo). Devolve índices em `rows`. */
export function findDuplicates(rows: BuiltRow[], spec: ImportSpec, existing: Set<string>): Set<number> {
  const dup = new Set<number>();
  if (!spec.rowKeys) return dup;
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const keys = spec.rowKeys!(r.values).filter(Boolean);
    if (keys.some((k) => existing.has(k) || seen.has(k))) dup.add(i);
    keys.forEach((k) => seen.add(k));
  });
  return dup;
}

export function templateToCsv(template: string[][]): string {
  const esc = (c: string) => (/[",\n;]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return "﻿" + template.map((r) => r.map(esc).join(",")).join("\r\n");
}
