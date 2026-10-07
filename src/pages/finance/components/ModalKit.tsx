import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

/**
 * Peças visuais compartilhadas pelos modais do financeiro (Contatos, Cobranças,
 * Indicações, Nova Operação, Rateio) — mesmo padrão de "Novo/Editar lançamento":
 * cabeçalho com ícone, seções com título iconificado, controles compactos (h-9,
 * rounded-lg) e rodapé enxuto. Só apresentação: nenhuma regra de negócio aqui.
 */

export const inputCls = (invalid?: boolean) =>
  cn(
    "w-full h-9 bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border rounded-lg px-3 text-xs",
    "placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    invalid ? "border-[var(--color-danger)]" : "border-[var(--color-border-default)]"
  );

export const selectCls = (invalid?: boolean) => cn(inputCls(invalid), "cursor-pointer");

export const textareaCls =
  "w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] resize-none disabled:opacity-60";

type IconType = React.ComponentType<{ className?: string }>;

/** Título do modal: ícone em quadro colorido + título + subtítulo. */
export function ModalTitle({
  icon: Icon,
  title,
  subtitle,
  tone = "primary",
}: {
  icon: IconType;
  title: string;
  subtitle?: string;
  tone?: "primary" | "success" | "danger" | "warning";
}) {
  const toneCls = {
    primary: "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]",
    success: "bg-emerald-500/10 text-emerald-500",
    danger: "bg-rose-500/10 text-rose-500",
    warning: "bg-amber-500/10 text-amber-500",
  }[tone];
  return (
    <div className="flex items-center gap-3">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", toneCls)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-base font-black text-[var(--color-text-primary)] leading-tight">{title}</div>
        {subtitle && <div className="text-xs font-normal text-[var(--color-text-muted)]">{subtitle}</div>}
      </div>
    </div>
  );
}

/** Seção com cabeçalho iconificado. */
export function FormSection({
  icon: Icon,
  title,
  hint,
  children,
  className,
}: {
  icon: IconType;
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/40 p-3.5 space-y-3", className)}>
      <header className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-[var(--color-primary-blue)] shrink-0" />
        <h4 className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-primary)]">{title}</h4>
        {hint && <span className="text-[10px] font-normal normal-case tracking-normal text-[var(--color-text-faint)] ml-1 truncate">{hint}</span>}
      </header>
      {children}
    </section>
  );
}

/** Rótulo + controle + dica/erro inline. */
export function Field({
  label,
  icon: Icon,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  icon?: IconType;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[11px] font-bold text-[var(--color-text-primary)] mb-1 flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />}
        {label}
        {required && <span className="text-[var(--color-danger)]">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[10px] text-[var(--color-danger)] mt-1">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-[var(--color-text-faint)] mt-1 leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

/** Rodapé padrão: cancelar + ação principal com estado de carregamento. */
export function ModalFooter({
  onCancel,
  submitLabel,
  submitIcon: SubmitIcon,
  saving,
  disabled,
  cancelLabel = "Cancelar",
  type = "submit",
  onSubmit,
  left,
}: {
  onCancel: () => void;
  submitLabel: string;
  submitIcon?: IconType;
  saving?: boolean;
  disabled?: boolean;
  cancelLabel?: string;
  type?: "submit" | "button";
  onSubmit?: () => void;
  left?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
      <div className="min-w-0">{left}</div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="h-9 px-4 text-xs font-bold border-[var(--color-border-default)]">
          {cancelLabel}
        </Button>
        <Button type={type} onClick={type === "button" ? onSubmit : undefined} disabled={saving || disabled} className="h-9 px-5 text-xs font-bold gap-1.5 shadow-xs">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : SubmitIcon ? <SubmitIcon className="w-3.5 h-3.5" /> : null}
          {saving ? "Salvando..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** Linha chave/valor para modos de detalhes e resumos. */
export function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-[var(--color-text-muted)] shrink-0">{label}</span>
      <span className={cn("text-right font-semibold text-[var(--color-text-primary)] break-words min-w-0", mono && "font-mono")}>{value || "—"}</span>
    </div>
  );
}
