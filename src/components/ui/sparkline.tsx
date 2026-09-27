/** Mini-gráfico de linha inline (sem eixos/legenda) pra caber dentro de um
 * card pequeno — ex.: a tendência recente por trás do número de um KPI.
 * SVG desenhado à mão (não recharts): num espaço de ~15px de altura, o
 * ResponsiveContainer do recharts fica instável (avisos de tamanho 0,
 * reflow a cada render) — um polyline normalizado resolve com menos peso e
 * comportamento previsível. Series com menos de 2 pontos não desenha nada
 * (não existe "tendência" com 1 ponto só). */
export function Sparkline({
  data,
  className,
  strokeWidth = 1.75,
}: {
  data: number[];
  className?: string;
  strokeWidth?: number;
}) {
  if (!data || data.length < 2 || data.every((v) => !Number.isFinite(v))) return null;

  const w = 100;
  const h = 28;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
