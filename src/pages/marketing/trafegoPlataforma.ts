// Identidade visual de cada plataforma de anúncios (só sigla e cor; nenhum logotipo de terceiros).
const COR: Record<string, string> = {
  "Meta Ads": "#2563eb", "Google Ads": "#16a34a", "TikTok Ads": "#db2777", "LinkedIn Ads": "#0369a1",
  "YouTube Ads": "#dc2626", "Pinterest Ads": "#be123c", "X Ads": "#334155",
};
const SIGLA: Record<string, string> = {
  "Meta Ads": "ME", "Google Ads": "GO", "TikTok Ads": "TK", "LinkedIn Ads": "IN", "YouTube Ads": "YT", "Pinterest Ads": "PI", "X Ads": "X",
};

export const corPlataforma = (p: string) => COR[p] ?? "#7c3aed";
export const siglaPlataforma = (p: string) => SIGLA[p] ?? ((p || "?").replace(/\s*ads$/i, "").slice(0, 2).toUpperCase() || "?");
