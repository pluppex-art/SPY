import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { Card } from "./card"
import { cn } from "../../lib/utils"

type Tone = "default" | "danger" | "success" | "warning"

const TONE_COLOR: Record<Tone, string> = {
  default: "var(--color-primary-blue)",
  danger: "var(--color-danger, #ef4444)",
  success: "var(--color-success, #10b981)",
  warning: "#f59e0b",
}

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: React.ReactNode
  /** linha de destaque colorida: variação, % ou contagem (ex.: "58,8% de conversão") */
  sub?: React.ReactNode
  /** legenda do período (ex.: "Últimos 30 dias") */
  caption?: string
  /** conteúdo à direita da legenda (ex.: mini-gráfico) */
  footer?: React.ReactNode
  /** explicação exibida ao passar o mouse no rótulo */
  hint?: string
  tone?: Tone
  /** cor própria do ícone/destaque (sobrepõe o tom) */
  color?: string
  onClick?: () => void
  className?: string
}

/** Card de indicador padrão dos dashboards: ícone + rótulo, valor grande, destaque e período. */
function StatCard({ icon: Icon, label, value, sub, caption, footer, hint, tone = "default", color, onClick, className }: StatCardProps) {
  const c = color ?? TONE_COLOR[tone]
  const valueColor = tone === "danger" || tone === "success" ? c : undefined
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-5 min-w-0 shadow-sm flex flex-col",
        onClick && "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md",
        tone === "danger" && "border-danger/20",
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${c} 12%, transparent)` }}>
          <Icon className="w-5 h-5" style={{ color: c }} />
        </div>
        <p title={hint} className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] leading-tight">{label}</p>
      </div>
      <p className="text-2xl font-black font-mono mt-3 truncate text-[var(--color-text-primary)]" style={valueColor ? { color: valueColor } : undefined}>{value}</p>
      <p className="text-[11px] font-bold mt-1 min-h-[16px] flex items-center gap-1" style={{ color: c }}>{sub}</p>
      {(caption || footer) && (
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-[10px] text-[var(--color-text-faint)]">{caption}</p>
          {footer}
        </div>
      )}
    </Card>
  )
}

export { StatCard }
