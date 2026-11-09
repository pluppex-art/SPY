import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Info, AlertTriangle, XCircle, Trophy, X } from "lucide-react";
import type { ReactNode } from "react";

// Pop-ups ricos do S.P.Y. (notificações e venda fechada). Renderizados pelo <Toaster /> do Layout via
// toast.custom, então rodam dentro do Router (useNavigate funciona) e usam só tokens do tema — a cor da
// marca vem de --color-primary-blue, igual ao resto do app, sem nada específico de tenant.

export type PopupKind = "success" | "info" | "warning" | "error";

const KIND_STYLE: Record<PopupKind, { icon: ReactNode; color: string }> = {
  success: { icon: <CheckCircle2 className="w-5 h-5" />, color: "var(--color-success)" },
  info: { icon: <Info className="w-5 h-5" />, color: "var(--color-primary-blue)" },
  warning: { icon: <AlertTriangle className="w-5 h-5" />, color: "var(--color-warning)" },
  error: { icon: <XCircle className="w-5 h-5" />, color: "var(--color-danger)" },
};

interface CardProps {
  toastId: string | number;
  icon: ReactNode;
  color: string;
  title: string;
  description?: string;
  highlight?: string;
  actionLabel?: string;
  linkUrl?: string | null;
  celebratory?: boolean;
}

function PopupCard({ toastId, icon, color, title, description, highlight, actionLabel = "Ver", linkUrl, celebratory }: CardProps) {
  const navigate = useNavigate();
  // Só segue links internos do app (nunca um endereço externo vindo de uma notificação).
  const internalLink = linkUrl && linkUrl.startsWith("/") && !linkUrl.startsWith("//") ? linkUrl : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full sm:w-[360px] flex items-start gap-3 p-3.5 rounded-[var(--radius-panel)] bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-[var(--shadow-panel)]"
      style={{ borderLeft: `4px solid ${color}`, ...(celebratory ? { background: `color-mix(in srgb, ${color} 7%, var(--color-surface-elevated))` } : null) }}
    >
      <span
        className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
        style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-[var(--color-text-primary)] leading-tight break-words">{title}</p>
        {description && <p className="mt-0.5 text-xs text-[var(--color-text-muted)] leading-snug line-clamp-2 break-words">{description}</p>}
        {highlight && <p className="mt-1 text-base font-black leading-none" style={{ color }}>{highlight}</p>}
        {internalLink && (
          <button
            type="button"
            onClick={() => { navigate(internalLink); toast.dismiss(toastId); }}
            className="mt-2 min-h-8 px-3 rounded-lg text-xs font-bold text-white active:scale-95 transition-transform cursor-pointer border-none"
            style={{ background: color }}
          >
            {actionLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => toast.dismiss(toastId)}
        aria-label="Fechar aviso"
        className="w-8 h-8 -mr-1 -mt-1 shrink-0 flex items-center justify-center rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function showNotificationPopup(n: { title: string; description?: string | null; type?: string | null; link_url?: string | null }) {
  const kind: PopupKind = n.type === "success" || n.type === "warning" || n.type === "error" ? n.type : "info";
  const s = KIND_STYLE[kind];
  toast.custom(
    (id) => <PopupCard toastId={id} icon={s.icon} color={s.color} title={n.title} description={n.description || undefined} linkUrl={n.link_url} />,
    { duration: kind === "error" ? 9000 : 6500 },
  );
}

/** "R$ 1.500,00" a partir de número ou texto livre do campo `value` do lead (que não é padronizado). */
export function formatLeadValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!/\d/.test(text)) return undefined;
    const digits = Number(text.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(digits) && digits === 0) return undefined; // "R$ 0,00" não vale um destaque
    return /^R\$/i.test(text) ? text : Number.isFinite(digits) ? digits.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : undefined;
  }
  return undefined;
}

async function celebrate() {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const { default: confetti } = await import("canvas-confetti");
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--color-primary-blue").trim() || "#F97316";
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.3 }, colors: [brand, "#10B981", "#FBBF24"], disableForReducedMotion: true });
  } catch { /* confete é enfeite: nunca pode atrapalhar o aviso */ }
}

export function showSalePopup(sale: { leadId: string; name: string; company?: string | null; seller?: string | null; value?: unknown }) {
  const detail = [sale.company, sale.seller ? `Vendedor: ${sale.seller}` : null].filter(Boolean).join(" · ");
  toast.custom(
    (id) => (
      <PopupCard
        toastId={id}
        icon={<Trophy className="w-5 h-5" />}
        color="var(--color-success)"
        title={`Venda fechada! ${sale.name}`}
        description={detail || undefined}
        highlight={formatLeadValue(sale.value)}
        linkUrl={`/app/crm/pipeline?leadId=${encodeURIComponent(sale.leadId)}`}
        actionLabel="Ver lead"
        celebratory
      />
    ),
    { duration: 10000 },
  );
  void celebrate();
}
