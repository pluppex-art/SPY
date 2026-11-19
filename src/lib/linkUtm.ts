/** Monta um link com os parâmetros UTM que o SPY lê para saber de qual campanha veio cada lead. */
export interface EntradaUtm { url: string; source: string; medium?: string; campaign?: string; content?: string; term?: string }

const slug = (v: string) => v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);

export function montarLinkUtm(e: EntradaUtm): { ok: true; link: string } | { ok: false; erro: string } {
  let bruto = String(e.url || "").trim();
  if (!bruto) return { ok: false, erro: "Cole o endereço da página." };
  if (!/^https?:\/\//i.test(bruto)) bruto = `https://${bruto}`;
  let u: URL;
  try { u = new URL(bruto); } catch { return { ok: false, erro: "Endereço inválido." }; }
  if (!u.hostname.includes(".")) return { ok: false, erro: "Endereço inválido." };
  const source = slug(e.source);
  if (!source) return { ok: false, erro: "Informe de onde vem o clique (ex.: instagram, google, email)." };
  u.searchParams.set("utm_source", source);
  for (const [k, v] of [["utm_medium", e.medium], ["utm_campaign", e.campaign], ["utm_content", e.content], ["utm_term", e.term]] as const) {
    const s = slug(v || "");
    if (s) u.searchParams.set(k, s); else u.searchParams.delete(k);
  }
  return { ok: true, link: u.toString() };
}
