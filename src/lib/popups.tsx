import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Info, AlertTriangle, XCircle, CircleDollarSign, X } from "lucide-react";
import type { ReactNode } from "react";

// Pop-ups do S.P.Y. no formato de notificação de app (banner do Instagram/TikTok/YouTube): logo do S.P.Y. com um
// emblema do tipo no canto, "S.P.Y. · agora", título e texto, cartão inteiro clicável. A venda fechada segue o
// estilo Hotmart ("Venda realizada!" com o valor em destaque). Renderizados pelo <Toaster /> do Layout via
// toast.custom (dentro do Router, então useNavigate funciona) e usando só tokens do tema.

export type PopupKind = "success" | "info" | "warning" | "error";

const KIND_STYLE: Record<PopupKind, { icon: ReactNode; color: string }> = {
  success: { icon: <CheckCircle2 className="w-3 h-3" strokeWidth={3} />, color: "var(--color-success)" },
  info: { icon: <Info className="w-3 h-3" strokeWidth={3} />, color: "var(--color-primary-blue)" },
  warning: { icon: <AlertTriangle className="w-3 h-3" strokeWidth={3} />, color: "var(--color-warning)" },
  error: { icon: <XCircle className="w-3 h-3" strokeWidth={3} />, color: "var(--color-danger)" },
};

interface CardProps {
  toastId: string | number;
  badge: ReactNode;
  color: string;
  title: string;
  description?: string;
  meta?: string;
  highlight?: string;
  linkUrl?: string | null;
  celebratory?: boolean;
}

function PopupCard({ toastId, badge, color, title, description, meta, highlight, linkUrl, celebratory }: CardProps) {
  const navigate = useNavigate();
  // Só segue links internos do app (nunca um endereço externo vindo de uma notificação).
  const internalLink = linkUrl && linkUrl.startsWith("/") && !linkUrl.startsWith("//") ? linkUrl : null;
  const open = () => { if (internalLink) navigate(internalLink); toast.dismiss(toastId); };

  return (
    <div className="relative w-[calc(100vw-1.5rem)] sm:w-[380px]">
      <button
        type="button"
        onClick={open}
        aria-label={[title, description, meta, highlight].filter(Boolean).join(". ")}
        className="w-full text-left flex items-start gap-3 p-3 rounded-[22px] border border-[var(--color-border-default)] backdrop-blur-xl shadow-[0_12px_32px_-8px_rgba(15,23,42,0.35)] cursor-pointer active:scale-[0.98] transition-transform"
        style={{ background: `color-mix(in srgb, ${celebratory ? color : "var(--color-surface-elevated)"} ${celebratory ? 9 : 0}%, color-mix(in srgb, var(--color-surface-elevated) 92%, transparent))` }}
      >
        <span className="relative shrink-0 mt-0.5">
          <img src="/pwa-192.png" alt="" aria-hidden="true" width={40} height={40} className="w-10 h-10 rounded-[10px] object-cover" />
          <span
            className="absolute -right-1.5 -bottom-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-white ring-2 ring-[var(--color-surface-elevated)]"
            style={{ background: color }}
          >
            {badge}
          </span>
        </span>
        <span className="min-w-0 flex-1 pr-1">
          <span className="flex items-center justify-between gap-2 text-[11px] leading-none text-[var(--color-text-faint)]">
            <span className="font-bold tracking-wide uppercase">S.P.Y.</span>
            <span className="sm:mr-7">agora</span>
          </span>
          <span className="block mt-1 text-[15px] font-extrabold text-[var(--color-text-primary)] leading-tight break-words">{title}</span>
          {description && <span className="mt-0.5 text-[13px] text-[var(--color-text-muted)] leading-snug line-clamp-2 break-words">{description}</span>}
          {meta && <span className="block text-xs text-[var(--color-text-faint)] leading-snug">{meta}</span>}
          {highlight && <span className="block mt-1 text-[22px] font-black leading-none tracking-tight" style={{ color }}>{highlight}</span>}
        </span>
      </button>
      <button
        type="button"
        onClick={() => toast.dismiss(toastId)}
        aria-label="Fechar aviso"
        className="hidden sm:flex absolute top-2 right-2.5 w-8 h-8 items-center justify-center rounded-full text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] bg-transparent border-none cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function showNotificationPopup(n: { title: string; description?: string | null; type?: string | null; link_url?: string | null }) {
  const kind: PopupKind = n.type === "success" || n.type === "warning" || n.type === "error" ? n.type : "info";
  const s = KIND_STYLE[kind];
  toast.custom(
    (id) => <PopupCard toastId={id} badge={s.icon} color={s.color} title={n.title} description={n.description || undefined} linkUrl={n.link_url} />,
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
  toast.custom(
    (id) => (
      <PopupCard
        toastId={id}
        badge={<CircleDollarSign className="w-3 h-3" strokeWidth={3} />}
        color="var(--color-success)"
        title="Venda realizada!"
        description={[sale.name, sale.company].filter(Boolean).join(" · ")}
        meta={sale.seller ? `Vendedor: ${sale.seller}` : undefined}
        highlight={formatLeadValue(sale.value)}
        linkUrl={`/app/crm/pipeline?leadId=${encodeURIComponent(sale.leadId)}`}
        celebratory
      />
    ),
    { duration: 10000 },
  );
  void celebrate();
}
