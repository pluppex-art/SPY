import { useEffect, useState } from "react";
import { ShoppingBag, X } from "lucide-react";
import { formatAgo } from "../lib/socialProof";

type Item =
  | { kind: "recent"; product: string; closedAt: string }
  | { kind: "top"; product: string; count: number };
interface Brand { name: string | null; color: string | null; logoUrl: string | null }

const FIRST_DELAY_MS = 8_000;
const VISIBLE_MS = 7_000;
const GAP_MS = 25_000;
const MAX_SHOWS = 3;

/**
 * Prova social nas páginas públicas DA EMPRESA (catálogo e proposta), com os produtos dela e a marca dela:
 * "Alguém acabou de comprar Plano Ouro · há 12 min" (só com venda de data real, últimos 7 dias) ou
 * "38 clientes já compraram Plano Ouro". Só aparece se a empresa ligou em Configurações › Dados da empresa e
 * se o produto tem vendas reais suficientes (o servidor decide). Sem dado pessoal. Até 3 aparições por visita.
 */
export function TenantSocialProofPopup({ tenantId, token }: { tenantId?: string; token?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [shown, setShown] = useState<Item | null>(null);
  const scope = tenantId || token || "";

  useEffect(() => {
    if (!scope) return;
    const key = `spy:tenant-proof-dismissed:${scope}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* sem storage: segue */ }
    let alive = true;
    const timers: number[] = [];
    (async () => {
      try {
        const qs = tenantId ? `tenantId=${encodeURIComponent(tenantId)}` : `token=${encodeURIComponent(token || "")}`;
        const res = await fetch(`/api/public/tenant-social-proof?${qs}`);
        if (!res.ok) return;
        const data = await res.json();
        const recent: Item[] = Array.isArray(data?.recent)
          ? data.recent.filter((i: any) => typeof i?.product === "string" && Number.isFinite(Date.parse(i?.closedAt))).map((i: any) => ({ kind: "recent" as const, product: i.product, closedAt: i.closedAt }))
          : [];
        const top: Item[] = Array.isArray(data?.items)
          ? data.items.filter((i: any) => typeof i?.product === "string" && Number.isFinite(i?.count)).map((i: any) => ({ kind: "top" as const, product: i.product, count: i.count }))
          : [];
        // Vendas recentes (verdadeiras e frescas) primeiro; depois o ranking por contagem.
        const list = [...recent, ...top].slice(0, MAX_SHOWS);
        if (!alive || !data?.enabled || list.length === 0) return;
        setBrand(data.brand || null);
        setItems(list);
        list.forEach((it, i) => {
          const start = FIRST_DELAY_MS + i * (VISIBLE_MS + GAP_MS);
          timers.push(window.setTimeout(() => { if (alive) setShown(it); }, start));
          timers.push(window.setTimeout(() => { if (alive) setShown(null); }, start + VISIBLE_MS));
        });
      } catch { /* prova social é enfeite: nunca atrapalha a página */ }
    })();
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, [scope, tenantId, token]);

  if (!shown || items.length === 0) return null;
  const color = brand?.color || "var(--color-primary-blue, #F97316)";
  const initial = (brand?.name || "?").trim().charAt(0).toUpperCase() || "?";
  const ago = shown.kind === "recent" ? formatAgo(shown.closedAt) : "";
  // "acabou de comprar" só quando a venda foi mesmo agora (< 1 h); senão, "comprou" + quando.
  const justNow = shown.kind === "recent" && (ago === "agora mesmo" || /^há \d+ min$/.test(ago));

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[70] left-3 right-3 sm:right-auto sm:left-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:w-[380px] flex items-start gap-3 p-3 pr-10 rounded-[22px] border border-[var(--color-border-default,#e2e8f0)] bg-[var(--color-surface-elevated,#fff)]/95 backdrop-blur-xl shadow-[0_12px_32px_-8px_rgba(15,23,42,0.35)] animate-in fade-in slide-in-from-bottom-3 duration-300"
    >
      <span className="relative shrink-0 mt-0.5">
        {brand?.logoUrl ? (
          <img src={brand.logoUrl} alt="" aria-hidden="true" width={40} height={40} referrerPolicy="no-referrer" className="w-10 h-10 rounded-[10px] object-cover bg-white" />
        ) : (
          <span className="w-10 h-10 rounded-[10px] flex items-center justify-center text-lg font-black text-white" style={{ background: color }}>{initial}</span>
        )}
        <span className="absolute -right-1.5 -bottom-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-white ring-2 ring-[var(--color-surface-elevated,#fff)]" style={{ background: color }}>
          <ShoppingBag className="w-3 h-3" strokeWidth={3} />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center justify-between gap-2 text-[11px] leading-none text-[var(--color-text-faint,#5f6f86)]">
          <span className="font-bold tracking-wide uppercase truncate">{brand?.name || "Mais vendido"}</span>
          <span className="shrink-0">{shown.kind === "recent" ? ago : "mais vendido"}</span>
        </p>
        <p className="mt-1 text-[15px] font-extrabold text-[var(--color-text-primary,#0f172a)] leading-tight break-words">{shown.product}</p>
        <p className="mt-0.5 text-[13px] text-[var(--color-text-muted,#526077)] leading-snug">
          {shown.kind === "recent" ? (
            <>{justNow ? "Alguém acabou de comprar" : "Alguém comprou"}</>
          ) : (
            <><strong style={{ color }}>{shown.count.toLocaleString("pt-BR")}</strong> clientes já compraram</>
          )}
        </p>
      </div>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => { setShown(null); setItems([]); try { sessionStorage.setItem(`spy:tenant-proof-dismissed:${scope}`, "1"); } catch { /* ok */ } }}
        className="absolute top-2 right-2 w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-[var(--color-text-faint,#5f6f86)] hover:text-[var(--color-text-primary,#0f172a)] bg-transparent border-none cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
