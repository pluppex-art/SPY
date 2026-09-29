/**
 * Comparação de tabelas (Clínica & Saúde): normalização + matching determinístico + regras
 * financeiras. Puro (sem rede/DB) — roda no servidor (processamento) e no cliente (prévia).
 *
 * Princípio: regra determinística primeiro (código → memória confirmada → nome/sinônimo exato →
 * similaridade). A IA só entra depois, nos casos ambíguos (`needsAi`), e NUNCA promove uma
 * correspondência por conta própria acima do que as regras permitem sem confirmação humana.
 * Na dúvida o item fica "nao_identificado" — nunca inventa correspondência.
 */

export const MATCH_ENGINE_VERSION = "tm-1.0";

export type MatchStatus = "automatico" | "revisao" | "nao_identificado";
export type MatchOrigin = "codigo" | "memoria" | "sinonimo" | "similaridade";

export interface MatchConfig {
  /** Confiança mínima para aceitar sozinho (com margem sobre o 2º colocado). */
  autoThreshold: number;
  /** Confiança mínima para sugerir (vai pra fila de revisão). */
  reviewThreshold: number;
  /** Diferença mínima entre o 1º e o 2º candidato para aceitar automaticamente. */
  autoMargin: number;
  /** Dicionário extra de abreviações (chave normalizada → expansão), por tenant. */
  abbreviations?: Record<string, string>;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = { autoThreshold: 95, reviewThreshold: 80, autoMargin: 8 };

export interface BaseItem {
  id: string;
  nome: string;
  codigo_interno?: string | null;
  codigo_externo?: string | null;
  nomes_alternativos?: string[] | null;
  custo?: number | null;
  valor?: number | null;
}

export interface PartnerItem {
  nome: string;
  codigo?: string | null;
}

/** Equivalência já confirmada por uma pessoa (memória do tenant). */
export interface Equivalence {
  exame_base_id: string;
  nome_parceiro_norm: string;
  codigo_parceiro?: string | null;
}

export interface Candidate {
  exame_base_id: string;
  score: number;
  origin: MatchOrigin;
  reason: string;
}

export interface MatchResult {
  status: MatchStatus;
  exame_base_id: string | null;
  score: number;
  origin: MatchOrigin | null;
  reason: string;
  /** Até 3 candidatos, pra tela de revisão e pra Aurora. */
  candidates: Candidate[];
  /** true quando a IA pode ajudar (revisão/não identificado com candidatos plausíveis). */
  needsAi: boolean;
  evidence: string[];
}

// ─── Normalização ────────────────────────────────────────────────────────────

const BASE_ABBREVIATIONS: Record<string, string> = {
  vit: "vitamina",
  vitam: "vitamina",
  hemog: "hemoglobina",
  hb: "hemoglobina",
  hgb: "hemoglobina",
  colest: "colesterol",
  glic: "glicose",
  glicem: "glicemia",
  trigl: "triglicerideos",
  tg: "triglicerideos",
  tgo: "transaminase oxalacetica",
  tgp: "transaminase piruvica",
  ast: "transaminase oxalacetica",
  alt: "transaminase piruvica",
  plaq: "plaquetas",
  leuc: "leucocitos",
  eritr: "eritrocitos",
  hemat: "hematocrito",
  ht: "hematocrito",
  ur: "ureia",
  creat: "creatinina",
  prot: "proteina",
  proteinas: "proteina",
  tsh: "hormonio tireoestimulante",
  hdl: "hdl",
  ldl: "ldl",
  sang: "sangue",
  soro: "soro",
  eas: "urina tipo i",
  hcg: "gonadotropina corionica",
  bhcg: "gonadotropina corionica",
  psa: "antigeno prostatico especifico",
};

/** Palavras sem valor de identificação — saem antes de comparar. */
const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "e", "em", "para", "por", "com", "sem", "a", "o", "as", "os", "no", "na",
  "dosagem", "exame", "pesquisa", "determinacao", "quantitativo", "quantitativa", "qualitativo", "qualitativa",
  "serico", "serica", "sericos", "sericas", "plasmatico", "plasmatica", "sangue", "soro", "amostra", "teste",
]);

/** Tokens que mudam o significado do exame: se divergirem, nunca é correspondência automática. */
const CRITICAL_TOKENS = new Set([
  "igg", "igm", "iga", "ige", "livre", "total", "direto", "indireto", "fracao", "fracionado", "fracionada",
  "urina", "fezes", "jejum", "pos", "prandial", "basal", "materno", "fetal", "neonatal", "titulacao",
  "ldl", "hdl", "vldl", "t3", "t4", "ft3", "ft4", "clearance", "depuracao", "curva",
]);

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Texto → lista de tokens normalizados (minúsculo, sem acento/símbolo, abreviações expandidas). */
export function tokenize(input: string, extraAbbr?: Record<string, string>): string[] {
  const abbr = { ...BASE_ABBREVIATIONS, ...(extraAbbr || {}) };
  const cleaned = stripAccents(String(input ?? "").toLowerCase())
    // "25-OH" / "25 oh" → token único de hidroxi-vitamina
    .replace(/\b25\s*-?\s*(oh|hidroxi)\b/g, " 25oh ")
    // "Ig G" / "Ig-M" → igg / igm
    .replace(/\big\s*-?\s*([gmae])\b/g, " ig$1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!cleaned) return [];
  const out: string[] = [];
  for (const raw of cleaned.split(/\s+/)) {
    const expanded = abbr[raw] ?? raw;
    for (const t of expanded.split(/\s+/)) {
      if (!t || STOPWORDS.has(t)) continue;
      out.push(t);
    }
  }
  return out;
}

/** Forma canônica: tokens únicos ordenados (ordem das palavras não importa). */
export function normalizeName(input: string, extraAbbr?: Record<string, string>): string {
  return [...new Set(tokenize(input, extraAbbr))].sort().join(" ");
}

export function normalizeCode(code: unknown): string {
  return String(code ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Similaridade ────────────────────────────────────────────────────────────

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Similaridade 0–100 entre dois textos já normalizados (tokens + trigramas de caracteres). */
export function similarity(normA: string, normB: string): number {
  if (!normA || !normB) return 0;
  if (normA === normB) return 100;
  const tokA = new Set(normA.split(" "));
  const tokB = new Set(normB.split(" "));
  const tokenScore = jaccard(tokA, tokB);
  const charScore = dice(trigrams(normA.replace(/ /g, "")), trigrams(normB.replace(/ /g, "")));
  // Token pesa mais (palavras inteiras em comum); trigrama cobre variações de grafia.
  return Math.round((tokenScore * 0.6 + charScore * 0.4) * 100);
}

export function criticalDiff(tokA: string[], tokB: string[]): string[] {
  const isCritical = (t: string) => CRITICAL_TOKENS.has(t) || /^\d+h?$/.test(t);
  const a = new Set(tokA.filter(isCritical));
  const b = new Set(tokB.filter(isCritical));
  const diff: string[] = [];
  for (const t of a) if (!b.has(t)) diff.push(t);
  for (const t of b) if (!a.has(t)) diff.push(t);
  return diff;
}

// ─── Índice da base + matching ───────────────────────────────────────────────

interface IndexedBase {
  item: BaseItem;
  norm: string;
  tokens: string[];
  aliasNorms: string[];
}

export interface BaseIndex {
  entries: IndexedBase[];
  byCode: Map<string, string>;
  byName: Map<string, string>;
  byAlias: Map<string, string>;
  memory: Map<string, string>;
  memoryByCode: Map<string, string>;
  config: MatchConfig;
}

export function buildBaseIndex(base: BaseItem[], memory: Equivalence[] = [], config: MatchConfig = DEFAULT_MATCH_CONFIG): BaseIndex {
  const entries: IndexedBase[] = [];
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  const byAlias = new Map<string, string>();
  for (const item of base) {
    const tokens = tokenize(item.nome, config.abbreviations);
    const norm = [...new Set(tokens)].sort().join(" ");
    const aliasNorms = (item.nomes_alternativos || []).map((a) => normalizeName(a, config.abbreviations)).filter(Boolean);
    entries.push({ item, norm, tokens, aliasNorms });
    for (const c of [item.codigo_interno, item.codigo_externo]) {
      const k = normalizeCode(c);
      if (k) byCode.set(k, item.id);
    }
    if (norm) byName.set(norm, item.id);
    for (const a of aliasNorms) if (!byAlias.has(a)) byAlias.set(a, item.id);
  }
  const mem = new Map<string, string>();
  const memCode = new Map<string, string>();
  for (const e of memory) {
    if (e.nome_parceiro_norm) mem.set(e.nome_parceiro_norm, e.exame_base_id);
    const k = normalizeCode(e.codigo_parceiro);
    if (k) memCode.set(k, e.exame_base_id);
  }
  return { entries, byCode, byName, byAlias, memory: mem, memoryByCode: memCode, config };
}

const round = (n: number) => Math.round(n);

export function matchItem(p: PartnerItem, index: BaseIndex): MatchResult {
  const cfg = index.config;
  const pTokens = tokenize(p.nome, cfg.abbreviations);
  const pNorm = [...new Set(pTokens)].sort().join(" ");
  const pCode = normalizeCode(p.codigo);
  const evidence: string[] = [];

  const finish = (r: Omit<MatchResult, "needsAi" | "evidence"> & { needsAi?: boolean }): MatchResult => ({
    needsAi: false,
    evidence,
    ...r,
  });

  if (!pNorm && !pCode) {
    return finish({ status: "nao_identificado", exame_base_id: null, score: 0, origin: null, reason: "Linha sem nome nem código.", candidates: [] });
  }

  // 1) Memória confirmada por uma pessoa (nome ou código do parceiro).
  const memId = (pNorm && index.memory.get(pNorm)) || (pCode && index.memoryByCode.get(pCode)) || null;
  if (memId) {
    evidence.push("Equivalência já confirmada anteriormente por um usuário.");
    return finish({
      status: "automatico", exame_base_id: memId, score: 100, origin: "memoria",
      reason: "Correspondência já confirmada anteriormente.",
      candidates: [{ exame_base_id: memId, score: 100, origin: "memoria", reason: "Memória do tenant" }],
    });
  }

  // 2) Código exato (interno/externo da base).
  const codeId = pCode ? index.byCode.get(pCode) : undefined;
  if (codeId) {
    // Código bate; se o nome for radicalmente diferente, ainda pede revisão (código reaproveitado/errado).
    const base = index.entries.find((e) => e.item.id === codeId)!;
    const sim = similarity(pNorm, base.norm);
    evidence.push(`Código "${p.codigo}" idêntico ao da base.`);
    if (sim >= 40 || !pNorm) {
      return finish({
        status: "automatico", exame_base_id: codeId, score: sim >= 70 ? 99 : 96, origin: "codigo",
        reason: "Código idêntico ao da base.",
        candidates: [{ exame_base_id: codeId, score: 99, origin: "codigo", reason: "Código idêntico" }],
      });
    }
    evidence.push("Nomes muito diferentes apesar do código igual — revisar.");
    return finish({
      status: "revisao", exame_base_id: codeId, score: 85, origin: "codigo",
      reason: "Código igual, mas o nome é muito diferente.",
      candidates: [{ exame_base_id: codeId, score: 85, origin: "codigo", reason: "Código idêntico, nome divergente" }],
      needsAi: true,
    });
  }

  // 3) Nome normalizado idêntico ao nome oficial ou a um sinônimo cadastrado.
  const nameId = pNorm ? index.byName.get(pNorm) : undefined;
  if (nameId) {
    evidence.push("Nome idêntico ao oficial após normalização.");
    return finish({
      status: "automatico", exame_base_id: nameId, score: 98, origin: "sinonimo",
      reason: "Nome idêntico após normalização.",
      candidates: [{ exame_base_id: nameId, score: 98, origin: "sinonimo", reason: "Nome normalizado idêntico" }],
    });
  }
  const aliasId = pNorm ? index.byAlias.get(pNorm) : undefined;
  if (aliasId) {
    evidence.push("Nome idêntico a um sinônimo cadastrado.");
    return finish({
      status: "automatico", exame_base_id: aliasId, score: 97, origin: "sinonimo",
      reason: "Nome idêntico a um sinônimo cadastrado.",
      candidates: [{ exame_base_id: aliasId, score: 97, origin: "sinonimo", reason: "Sinônimo cadastrado" }],
    });
  }

  // 4) Similaridade — top 3, com trava de tokens críticos e margem sobre o 2º colocado.
  const scored: Candidate[] = [];
  for (const e of index.entries) {
    let best = similarity(pNorm, e.norm);
    for (const a of e.aliasNorms) best = Math.max(best, similarity(pNorm, a));
    if (best < 30) continue;
    const diff = criticalDiff(pTokens, e.tokens);
    let score = best;
    let reason = `Similaridade textual de ${best}%.`;
    if (diff.length > 0) {
      score = Math.min(score, 79);
      reason += ` Termo(s) que mudam o exame divergem: ${diff.join(", ")}.`;
    }
    scored.push({ exame_base_id: e.item.id, score, origin: "similaridade", reason });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, 3);
  const top = candidates[0];
  if (!top) {
    return finish({ status: "nao_identificado", exame_base_id: null, score: 0, origin: null, reason: "Nenhum candidato com similaridade suficiente.", candidates: [] });
  }
  const second = candidates[1]?.score ?? 0;
  evidence.push(top.reason);
  if (second > 0) evidence.push(`2º candidato com ${second}%.`);

  // Similaridade sozinha (sem código/memória/sinônimo) NUNCA aceita sozinha: no máximo "revisão".
  // Só chega perto do automático quando é praticamente igual E não há concorrente próximo.
  if (top.score >= cfg.autoThreshold && top.score - second >= cfg.autoMargin) {
    return finish({
      status: "automatico", exame_base_id: top.exame_base_id, score: round(top.score), origin: "similaridade",
      reason: top.reason, candidates,
    });
  }
  if (top.score >= cfg.reviewThreshold) {
    return finish({
      status: "revisao", exame_base_id: top.exame_base_id, score: round(top.score), origin: "similaridade",
      reason: second > 0 && top.score - second < cfg.autoMargin
        ? `${top.reason} Há outro candidato muito próximo — confirme.`
        : top.reason,
      candidates, needsAi: true,
    });
  }
  // Abaixo do limiar de revisão: não identificado (mas guarda candidatos e deixa a IA tentar).
  return finish({
    status: "nao_identificado", exame_base_id: null, score: round(top.score), origin: null,
    reason: "Confiança insuficiente para sugerir uma correspondência.",
    candidates, needsAi: top.score >= 50,
  });
}

// ─── Regras financeiras (configuráveis, nada fixo na interface) ──────────────

export interface FinanceRules {
  /** Campo da base usado como "valor comercial" da comparação. */
  baseValueField: "valor" | "custo";
  /** Sobre o que a margem é calculada. */
  marginOn: "parceiro" | "base";
}

export const DEFAULT_FINANCE_RULES: FinanceRules = { baseValueField: "valor", marginOn: "parceiro" };

export interface FinanceResult {
  custo_base: number | null;
  valor_base: number | null;
  diferenca: number | null;
  diferenca_pct: number | null;
  margem: number | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Converte "R$ 1.234,56" / "1234.56" / 1234.56 em número (ou null). */
export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    return s.lastIndexOf(",") > s.lastIndexOf(".") ? num(s) : parseFloat(s.replace(/,/g, "")) || null;
  }
  if (s.includes(",")) return parseFloat(s.replace(",", "."));
  return parseFloat(s);
}

export function computeFinance(
  partnerValue: number | null,
  base: { custo?: number | null; valor?: number | null } | null,
  rules: FinanceRules = DEFAULT_FINANCE_RULES,
): FinanceResult {
  const custo = base?.custo ?? null;
  const valor = base?.valor ?? null;
  const ref = rules.baseValueField === "custo" ? custo : valor;
  const diferenca = partnerValue !== null && ref !== null ? Math.round((partnerValue - ref) * 100) / 100 : null;
  const diferenca_pct = diferenca !== null && ref ? Math.round((diferenca / ref) * 10000) / 100 : null;
  let margem: number | null = null;
  if (custo !== null) {
    const denom = rules.marginOn === "parceiro" ? partnerValue : valor;
    if (denom !== null && denom > 0) {
      margem = Math.round(((denom - custo) / denom) * 10000) / 100;
    }
  }
  return { custo_base: custo, valor_base: valor, diferenca, diferenca_pct, margem };
}
