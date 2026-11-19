/** Planilha (CSV para Excel, separador ;) de quem recebeu a campanha e o que fez. Protege contra fórmulas (=, +, -, @) em células. */
export interface LinhaEngajamento { email: string; name?: string | null; status?: string; open_count?: number | null; click_count?: number | null; opened_at?: string | null; clicked_at?: string | null }

const celula = (v: unknown) => {
  let t = String(v ?? "").replace(/[\r\n]+/g, " ");
  if (/^[=+\-@\t]/.test(t)) t = `'${t}`;
  return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const data = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const STATUS: Record<string, string> = { sent: "Enviado", failed: "Falhou", skipped: "Pulado", pending: "Na fila", sending: "Enviando" };

export function csvEngajamento(linhas: LinhaEngajamento[]): string {
  const cab = ["E-mail", "Nome", "Situação", "Abriu", "Aberturas", "Clicou", "Cliques", "Última abertura", "Último clique"];
  const corpo = linhas.map((l) => [l.email, l.name, STATUS[l.status || ""] || l.status, (l.open_count || 0) > 0 ? "Sim" : "Não", l.open_count || 0, (l.click_count || 0) > 0 ? "Sim" : "Não", l.click_count || 0, data(l.opened_at), data(l.clicked_at)].map(celula).join(";"));
  return [cab.join(";"), ...corpo].join("\r\n");
}
