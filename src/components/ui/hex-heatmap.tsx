import { useMemo, useRef, useState } from "react";
import { Flame, Snowflake } from "lucide-react";

export interface HexItem {
  key: string;
  label: string;
  value: number;
  /** Linhas extras mostradas no card do hover (ex.: "Vendas: 12"). */
  extra?: { label: string; value: string }[];
}

interface HexHeatmapProps {
  items: HexItem[];
  formatValue: (n: number) => string;
  /** Texto da métrica no card do hover (ex.: "Receita"). */
  metricLabel: string;
  /** Máximo de colunas do favo; as linhas se ajustam sozinhas. */
  maxCols?: number;
  className?: string;
}

const SQRT3 = Math.sqrt(3);
const R = 44;

/** Frio (azul) → quente (vermelho) conforme a posição do valor entre o menor e o maior. */
function heatColor(t: number): string {
  const hue = 215 - Math.max(0, Math.min(1, t)) * 205; // 215 (azul) → 10 (vermelho)
  return `hsl(${Math.round(hue)} 78% ${52 - t * 4}%)`;
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/**
 * Favo de hexágonos com mapa de calor: cada hexágono é um item (produto, canal, segmento...),
 * colorido do azul (mais frio) ao vermelho (mais quente) pelo valor, com o % do total dentro.
 * Passar o mouse abre um cardzinho com valor, participação, posição no ranking e se é o ponto
 * mais quente ou mais frio. Genérico: quem usa só entrega a lista { label, value }.
 */
export function HexHeatmap({ items, formatValue, metricLabel, maxCols = 4, className }: HexHeatmapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);

  const model = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, i) => s + i.value, 0);
    const max = sorted[0]?.value ?? 0;
    const min = sorted[sorted.length - 1]?.value ?? 0;
    const cols = Math.max(1, Math.min(maxCols, sorted.length));
    const cells = sorted.map((item, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const cx = R * SQRT3 / 2 + col * R * SQRT3 + (row % 2 ? (R * SQRT3) / 2 : 0);
      const cy = R + row * R * 1.5;
      const t = max === min ? (max > 0 ? 1 : 0) : (item.value - min) / (max - min);
      return { item, idx, cx, cy, t, pct: total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0 };
    });
    const rows = Math.ceil(sorted.length / cols);
    const width = cols * R * SQRT3 + (rows > 1 ? (R * SQRT3) / 2 : 0);
    const height = R * 2 + (rows - 1) * R * 1.5;
    return { cells, width, height, count: sorted.length };
  }, [items, maxCols]);

  if (model.count === 0) return null;
  const active = hover ? model.cells.find((c) => c.item.key === hover.key) : null;

  const move = (e: React.MouseEvent, key: string) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ key, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <svg viewBox={`0 0 ${model.width} ${model.height}`} className="w-full h-auto max-h-[300px]" role="img" aria-label={`Mapa de calor por ${metricLabel}`}>
        {model.cells.map(({ item, cx, cy, t, pct, idx }) => (
          <g
            key={item.key}
            onMouseMove={(e) => move(e, item.key)}
            onMouseLeave={() => setHover(null)}
            className="cursor-default"
            style={{ opacity: hover && hover.key !== item.key ? 0.55 : 1, transition: "opacity 150ms ease-out" }}
          >
            <polygon
              points={hexPoints(cx, cy, R - 2)}
              fill={heatColor(t)}
              stroke={hover?.key === item.key ? "var(--color-text-primary)" : "var(--color-surface-elevated)"}
              strokeWidth={hover?.key === item.key ? 2.5 : 2}
            />
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff" style={{ pointerEvents: "none" }}>
              {pct}%
            </text>
            <text x={cx} y={cy + 13} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fillOpacity="0.92" style={{ pointerEvents: "none" }}>
              {item.label.length > 12 ? `${item.label.slice(0, 11)}…` : item.label}
            </text>
            {idx === 0 && model.count > 1 && (
              <text x={cx} y={cy - 22} textAnchor="middle" fontSize="10" style={{ pointerEvents: "none" }}>🔥</text>
            )}
          </g>
        ))}
      </svg>

      <div className="flex items-center justify-center gap-2 mt-2 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
        <Snowflake className="w-3 h-3 text-blue-500" /> mais frio
        <span className="h-1.5 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})` }} />
        mais quente <Flame className="w-3 h-3 text-rose-500" />
      </div>

      {active && hover && (
        <div
          className="pointer-events-none absolute z-20 w-52 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 shadow-lg"
          style={{ left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth ?? 300) - 216), top: Math.max(0, hover.y - 8) }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: heatColor(active.t) }} />
            <p className="text-xs font-black text-[var(--color-text-primary)] truncate">{active.item.label}</p>
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-wider">{metricLabel}</p>
          <p className="text-base font-black font-mono text-[var(--color-text-primary)]">{formatValue(active.item.value)}</p>
          <div className="mt-1.5 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
            <div className="flex justify-between"><span>Participação</span><b className="text-[var(--color-text-primary)]">{active.pct}%</b></div>
            <div className="flex justify-between"><span>Posição</span><b className="text-[var(--color-text-primary)]">{active.idx + 1}º de {model.count}</b></div>
            {active.item.extra?.map((e) => (
              <div key={e.label} className="flex justify-between"><span>{e.label}</span><b className="text-[var(--color-text-primary)]">{e.value}</b></div>
            ))}
          </div>
          {model.count > 1 && (active.idx === 0 || active.idx === model.count - 1) && (
            <p className={`mt-2 text-[10px] font-black uppercase tracking-wider ${active.idx === 0 ? "text-rose-500" : "text-blue-500"}`}>
              {active.idx === 0 ? "🔥 Ponto mais quente" : "❄️ Ponto mais frio"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
