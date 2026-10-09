import React from "react";

/** Peças visuais compartilhadas pelos modais de colaborador (novo/editar). */
export const labelClass = "text-[11px] font-bold text-[var(--color-text-primary)] mb-1.5 block";
export const wrapClass = (invalid?: boolean) =>
  `flex items-stretch w-full bg-[var(--color-surface-sunken)] border rounded-lg overflow-hidden transition-all focus-within:ring-2 focus-within:ring-[var(--color-primary-blue)] ${invalid ? "border-[var(--color-danger)]" : "border-[var(--color-border-default)]"}`;
export const iconBox = "w-10 shrink-0 flex items-center justify-center border-r border-[var(--color-border-subtle)] text-[var(--color-text-muted)]";
export const fieldClass = "flex-1 min-w-0 bg-transparent h-10 px-3 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none";

export function Field({ label, required, error, hint, children, className }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelClass}>{label}{required && <span className="text-[var(--color-danger)]"> *</span>}</label>
      {children}
      {error ? <p className="text-[10px] text-[var(--color-danger)] mt-1">{error}</p> : hint ? <p className="text-[10px] text-[var(--color-text-faint)] mt-1">{hint}</p> : null}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-black text-[var(--color-text-primary)]">{children}</h3>;
}

