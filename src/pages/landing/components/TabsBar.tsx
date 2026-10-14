import { useRef } from "react";
import type { ReactNode, KeyboardEvent } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

/** Abas acessíveis (roving tabindex, setas, Home/End). O painel é responsabilidade do pai: id `${prefix}-panel`, aria-labelledby `${prefix}-tab-${id}`. */
export function TabsBar({
  items,
  active,
  onChange,
  prefix,
  label,
  className = "",
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string, byUser: boolean) => void;
  prefix: string;
  label: string;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.id === active);
    let n = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % items.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    else return;
    e.preventDefault();
    onChange(items[n].id, true);
    refs.current[items[n].id]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className={`sp-tabs ${className}`} onKeyDown={onKey}>
      {items.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${prefix}-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`${prefix}-panel`}
            tabIndex={on ? 0 : -1}
            className="sp-tab"
            onClick={() => onChange(t.id, true)}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
