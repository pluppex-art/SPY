import * as React from "react"
import { cn } from "../../lib/utils"

interface SectionTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h2" | "h3" | "h4"
  tone?: "default" | "muted" | "danger"
}

/** Título padrão de seção/card dos dashboards. Todo título de card deve usar este componente. */
const SectionTitle = ({ as: Tag = "h3", tone = "default", className, ...props }: SectionTitleProps) => (
  <Tag
    className={cn(
      "flex items-center gap-2 text-xs font-black uppercase tracking-wider",
      tone === "danger" ? "text-danger" : tone === "muted" ? "text-[var(--color-text-muted)]" : "text-[var(--color-text-primary)]",
      className,
    )}
    {...props}
  />
)

export { SectionTitle }
