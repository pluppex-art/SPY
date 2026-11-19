/** Resumo do desempenho de e-mail (campanhas e sequências) para a tela de Análises. */
export interface CampanhaEmail { id: string; name: string; sent: number; opened?: number | null; clicked?: number | null; created_at?: string }

export interface ResumoEmail {
  campanhas: number; enviados: number; abriram: number; clicaram: number;
  taxaAbertura: number | null; taxaClique: number | null;
  melhores: { id: string; name: string; enviados: number; taxaClique: number; taxaAbertura: number }[];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/** `minEnvios`: campanhas com poucos envios ficam fora do ranking (taxa de 1 e-mail não diz nada). */
export function resumirEmail(campanhas: CampanhaEmail[], minEnvios = 20): ResumoEmail {
  const ativas = campanhas.filter((c) => (c.sent || 0) > 0);
  const enviados = ativas.reduce((a, c) => a + (c.sent || 0), 0);
  const abriram = ativas.reduce((a, c) => a + Math.min(c.opened || 0, c.sent || 0), 0);
  const clicaram = ativas.reduce((a, c) => a + Math.min(c.clicked || 0, c.sent || 0), 0);
  const melhores = ativas.filter((c) => c.sent >= minEnvios)
    .map((c) => ({ id: c.id, name: String(c.name).replace(/^\[Sequência\]\s*/, "Sequência: "), enviados: c.sent, taxaClique: pct(Math.min(c.clicked || 0, c.sent), c.sent) ?? 0, taxaAbertura: pct(Math.min(c.opened || 0, c.sent), c.sent) ?? 0 }))
    .sort((a, b) => b.taxaClique - a.taxaClique || b.taxaAbertura - a.taxaAbertura).slice(0, 5);
  return { campanhas: ativas.length, enviados, abriram, clicaram, taxaAbertura: pct(abriram, enviados), taxaClique: pct(clicaram, enviados), melhores };
}
