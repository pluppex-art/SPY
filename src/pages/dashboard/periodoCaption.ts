const fmt = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/** Legenda curta do período do filtro: "Todo o período", "Últimos 30 dias" ou "30 dias · 01/10 – 30/10". */
export function periodoCaption(dateFrom: string | null, dateTo: string | null): string {
  if (!dateFrom && !dateTo) return "Todo o período";
  if (!dateFrom) return `Até ${fmt(dateTo!)}`;
  const start = new Date(dateFrom + "T12:00:00");
  const end = dateTo ? new Date(dateTo + "T12:00:00") : new Date();
  const dias = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  if (!dateTo) return `Últimos ${dias} dias`;
  return `${dias} dia${dias === 1 ? "" : "s"} · ${fmt(dateFrom)} – ${fmt(dateTo)}`;
}
