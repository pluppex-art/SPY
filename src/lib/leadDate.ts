// `lead.date` é um campo de texto livre digitado no cadastro — NewLeadModal.tsx grava
// literalmente a string "Hoje" (não uma data ISO) em todo lead criado por lá, e muitos leads
// migrados ficam com "" (vazio). Usar `.date` sozinho pra filtrar por período ou agrupar por
// mês faz um tenant inteiro sumir do filtro (achado real: leads com "" e "Hoje", ZERO com uma
// data ISO de verdade). `created_at` (carimbado pelo banco, sempre presente) é o fallback
// confiável quando `.date` não é uma data ISO de verdade.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** Data de cadastro do lead em ISO ("YYYY-MM-DD…"), ou "" se não houver nenhuma. */
export function leadDateIso(l: any): string {
  if (typeof l?.date === "string" && ISO_DATE_RE.test(l.date)) return l.date;
  return typeof l?.created_at === "string" ? l.created_at : "";
}
