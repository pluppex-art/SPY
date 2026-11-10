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
  type: "text" | "select" | "vendedores";
  choices?: { value: string; label: string }[];
  /** type "vendedores": quem pode receber leads (nome + id do usuário, quando houver). */
  vendedores?: { nome: string; userId?: string | null }[];
  /** type "vendedores": quantos closers estão elegíveis no rodízio automático (0 = o rodízio deixaria o lead sem dono). */
  rodizioElegiveis?: number;
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
  /** Passo opcional antes de gravar: resolve vínculos (ex.: empresa do contato) e recusa linhas sem vínculo. */
  resolve?: (rows: BuiltRow[], opt: Record<string, string>) => Promise<{ rows: BuiltRow[]; rejected: { line: number; reason: string }[]; notes?: string[] }>;
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

export const EMAIL_IN_TEXT = /[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"']+/;

/** Texto colado → pessoas. Aceita um e-mail por linha, "Nome, email" ou "Nome <email>"; vários e-mails na mesma linha (vírgula, ; ou tab) também. */
export function parseManualText(text: string): { email: string; name: string }[] {
  const out: { email: string; name: string }[] = [];
  const re = new RegExp(EMAIL_IN_TEXT.source, "g");
  for (const line of text.split(/\r?\n/)) {
    for (const part of line.split(/[;\t]/)) {
      const emails = part.match(re);
      if (!emails) continue;
      const name = emails.length === 1 ? part.replace(emails[0], "").replace(/[<>,;"]/g, " ").replace(/\s+/g, " ").trim() : "";
      emails.forEach((e) => out.push({ email: e.toLowerCase(), name }));
    }
  }
  return out;
}


// ─── Distribuição dos leads entre vendedores ─────────────────────────────────

export type DistModo = "eu" | "quantidades" | "igual" | "rodizio";
export interface DistItem { nome: string; userId?: string | null; qtd: number }
export interface DistConfig { modo: DistModo; itens: DistItem[]; restante: "rodizio" | "eu" }

export const DIST_PADRAO = '{"modo":"eu","itens":[],"restante":"rodizio"}';

/** Texto salvo na opção -> configuração válida (qualquer lixo vira "tudo para mim"). */
export function parseDist(raw: string): DistConfig {
  try {
    const j = JSON.parse(raw);
    const modo: DistModo = ["eu", "quantidades", "igual", "rodizio"].includes(j?.modo) ? j.modo : "eu";
    const itens: DistItem[] = (Array.isArray(j?.itens) ? j.itens : [])
      .map((i: any) => ({ nome: String(i?.nome ?? "").trim().slice(0, 120), userId: i?.userId ? String(i.userId) : null, qtd: Math.max(0, Math.floor(Number(i?.qtd) || 0)) }))
      .filter((i: DistItem) => i.nome)
      .slice(0, 60);
    return { modo, itens, restante: j?.restante === "eu" ? "eu" : "rodizio" };
  } catch { return { modo: "eu", itens: [], restante: "rodizio" }; }
}

/**
 * Reparte `total` leads (na ordem do arquivo) entre os vendedores, intercalando (um para cada, na vez) até acabar a cota
 * de cada um — ninguém fica só com os primeiros da planilha. `atribuicao[i]` = índice do vendedor, ou -1 (sem dono
 * definido aqui: "o restante"). "igual" ignora as quantidades e divide por igual (sobras para os primeiros).
 */
export function distribuir(total: number, cfg: DistConfig): { atribuicao: number[]; contagem: number[]; restante: number } {
  const n = cfg.itens.length;
  const atribuicao: number[] = new Array(Math.max(0, total)).fill(-1);
  if ((cfg.modo !== "quantidades" && cfg.modo !== "igual") || n === 0 || total <= 0) return { atribuicao, contagem: new Array(n).fill(0), restante: Math.max(0, total) };
  let cota: number[];
  if (cfg.modo === "igual") cota = cfg.itens.map((_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));
  else {
    cota = cfg.itens.map((i) => i.qtd);
    let soma = cota.reduce((a, b) => a + b, 0);
    for (let i = n - 1; soma > total && i >= 0; i--) { const corta = Math.min(cota[i], soma - total); cota[i] -= corta; soma -= corta; } // passou do total: tira dos últimos
  }
  const contagem = new Array(n).fill(0);
  let pos = 0, vez = 0;
  while (pos < total && cota.some((c, i) => c > contagem[i])) {
    if (contagem[vez] < cota[vez]) { atribuicao[pos++] = vez; contagem[vez]++; }
    vez = (vez + 1) % n;
  }
  return { atribuicao, contagem, restante: total - pos };
}
