// Cidade e estado do lead. O sistema guarda a cidade em dois lugares (coluna `city` e `customFields.cidade`, do formulário
// do lead) e o estado em `state` ou `customFields.estado`; as telas devem ler pelos dois para nunca mostrar "vazio" à toa.
const clean = (v: unknown) => String(v ?? "").trim();

export function leadCity(l: any): string {
  return clean(l?.city) || clean(l?.customFields?.cidade);
}

/** UF em maiúsculas (2 letras) quando for sigla; senão o texto como veio. */
export function leadState(l: any): string {
  const raw = clean(l?.state) || clean(l?.customFields?.estado) || clean(l?.customFields?.uf);
  return /^[a-zA-Z]{2}$/.test(raw) ? raw.toUpperCase() : raw;
}

// ─── Cidades escritas de jeitos diferentes ───────────────────────────────────
// "Palmas", "PALMAS", "palmas", "Palmás", "Palmas/TO", "Palmas - TO", "Palmas (TO)" e "Palmas." são a MESMA cidade. Os filtros
// agrupam pela chave normalizada e mostram uma única vez, com o melhor rótulo; a importação já grava limpo e separa a UF.

const UFS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "Palmas/TO", "Palmas - TO", "Palmas, TO", "Palmas (TO)" -> { city: "Palmas", uf: "TO" }. Sem sigla válida, devolve só a cidade limpa. */
export function splitCityUf(raw: unknown): { city: string; uf: string } {
  let s = clean(raw).replace(/\s+/g, " ");
  let uf = "";
  const m = s.match(/^(.*?)\s*(?:[/\-–—,]\s*|\(\s*)([A-Za-z]{2})\s*\)?\s*$/);
  if (m && UFS.has(m[2].toUpperCase()) && m[1].trim()) { s = m[1].trim(); uf = m[2].toUpperCase(); }
  s = s.replace(/^[\s.,;:\-–—]+|[\s.,;:\-–—]+$/g, ""); // pontuação sobrando nas pontas
  return { city: s, uf };
}

/** Chave de comparação: sem acento, minúscula, sem pontuação, sem a sigla do estado. */
export function cityKey(raw: unknown): string {
  return semAcento(splitCityUf(raw).city).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Texto bonito da cidade: tudo maiúsculo/minúsculo vira "Título"; texto misturado é mantido, só ajustando "Do/Da/De/Dos/Das/E" no meio para minúsculo. */
export function cityLabel(raw: unknown): string {
  const { city } = splitCityUf(raw);
  if (!city) return "";
  const semMisturar = city === city.toUpperCase() || city === city.toLowerCase();
  const palavras = semMisturar ? city.toLowerCase().split(" ") : city.split(" ");
  return palavras
    .map((w, i) => {
      if (i > 0 && MINUSCULAS.has(w.toLowerCase())) return w.toLowerCase();
      return semMisturar ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    })
    .join(" ");
}

/** Cidades distintas (uma por chave) com o rótulo mais usado — prefere a grafia acentuada quando empata. Ordenadas por nome. */
export function groupCities(values: unknown[]): { key: string; label: string; count: number }[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const v of values) {
    const key = cityKey(v);
    if (!key) continue;
    const label = cityLabel(v);
    const g = grupos.get(key) ?? new Map<string, number>();
    g.set(label, (g.get(label) || 0) + 1);
    grupos.set(key, g);
  }
  return [...grupos.entries()].map(([key, g]) => {
    // Grafia com acento vence (é a escrita certa), depois a mais usada.
    const acentos = (t: string) => (t.match(/[^\x00-\x7f]/g) || []).length; // mais acentos = escrita mais completa
    const variantes = [...g.entries()].sort((a, b) => acentos(b[0]) - acentos(a[0]) || b[1] - a[1] || b[0].length - a[0].length);
    return { key, label: variantes[0][0], count: [...g.values()].reduce((x, y) => x + y, 0) };
  }).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
