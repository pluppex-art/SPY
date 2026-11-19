/** Origem de aquisição dos leads: guarda os parâmetros UTM da campanha e agrupa leads em canais legíveis (Meta, Google, E-mail…). */

const CHAVES_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

const limpar = (v: unknown, max = 100) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

/** Lê UTM (e identificadores de clique de anúncio) de um objeto solto ou de `{ utm: {...} }`. Só chaves conhecidas, com limite de tamanho. */
export function sanitizarUtm(raw: any): Record<string, string> {
  const fonte = raw && typeof raw === "object" ? { ...(raw.utm && typeof raw.utm === "object" ? raw.utm : {}), ...raw } : {};
  const out: Record<string, string> = {};
  for (const k of CHAVES_UTM) { const v = limpar(fonte[k]); if (v) out[k] = v; }
  if (limpar(fonte.gclid)) out.veio_do_google_ads = "sim";
  if (limpar(fonte.fbclid)) out.veio_do_meta_ads = "sim";
  const pagina = limpar(fonte.pagina_origem, 120);
  if (pagina) out.pagina_origem = pagina;
  return out;
}

const MAPA: Record<string, string> = {
  facebook: "Meta", fb: "Meta", instagram: "Meta", ig: "Meta", meta: "Meta", "facebook ads": "Meta", "meta ads": "Meta",
  google: "Google", adwords: "Google", "google ads": "Google", youtube: "YouTube", tiktok: "TikTok", linkedin: "LinkedIn",
  email: "E-mail", "e-mail": "E-mail", newsletter: "E-mail", whatsapp: "WhatsApp", wa: "WhatsApp", sms: "SMS",
};

/** Canal do lead: utm_source quando existe (agrupando variações), senão a origem cadastrada, senão "Orgânico". */
export function canalDoLead(lead: { source?: string | null; customFields?: Record<string, any> | null }): string {
  const utm = limpar(lead.customFields?.utm_source, 60).toLowerCase();
  if (utm) return MAPA[utm] ?? utm.charAt(0).toUpperCase() + utm.slice(1);
  if (lead.customFields?.veio_do_meta_ads === "sim") return "Meta";
  if (lead.customFields?.veio_do_google_ads === "sim") return "Google";
  return limpar(lead.source, 60) || "Orgânico";
}
