import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { apiFetch } from "../lib/apiClient";
import { formatAgo } from "../lib/socialProof";

interface Item { plan: string; paidAt: string }

const FIRST_DELAY_MS = 9_000;
const VISIBLE_MS = 7_000;
const GAP_MS = 28_000;
const MAX_SHOWS = 3;
const DISMISS_KEY = "spy:social-proof-dismissed";

/**
 * Prova social em páginas públicas (checkout e site): "uma empresa contratou o plano X · há 12 min".
 * Usa só vendas REAIS vindas de /api/checkout/social-proof (sem dado pessoal). Sem venda recente a lista vem
 * vazia e nada aparece — nunca inventa. No máximo 3 aparições por visita e some de vez se a pessoa fechar.
 */
export function SocialProofPopup() {
  const [items, setItems] = useState<Item[]>([]);
  const [shown, setShown] = useState<Item | null>(null);

  useEffect(() => {
    try { if (sessionStorage.getItem(DISMISS_KEY)) return; } catch { /* sem storage: segue */ }
    let alive = true;
    const timers: number[] = [];
    (async () => {
      try {
        const res = await apiFetch("/api/checkout/social-proof", { cache: "no-store" } as RequestInit);
        if (!res.ok) return;
        const data = await res.json();
        const list: Item[] = Array.isArray(data?.items) ? data.items.filter((i: any) => typeof i?.plan === "string" && typeof i?.paidAt === "string") : [];
        if (!alive || list.length === 0) return;
        setItems(list);
        const total = Math.min(MAX_SHOWS, list.length);
        for (let i = 0; i < total; i++) {
          const start = FIRST_DELAY_MS + i * (VISIBLE_MS + GAP_MS);
          timers.push(window.setTimeout(() => { if (alive) setShown(list[i]); }, start));
          timers.push(window.setTimeout(() => { if (alive) setShown(null); }, start + VISIBLE_MS));
        }
      } catch { /* prova social é enfeite: nunca atrapalha a página */ }
    })();
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, []);

  if (!shown || items.length === 0) return null;
  const ago = formatAgo(shown.paidAt);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[70] left-3 right-3 sm:right-auto sm:left-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:w-[340px] flex items-start gap-3 p-3.5 rounded-[var(--radius-panel)] bg-[var(--color-surface-elevated,#fff)] border border-[var(--color-border-default,#e2e8f0)] shadow-[var(--shadow-panel)] animate-in fade-in slide-in-from-bottom-3 duration-300"
    >
      <span className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-[var(--color-primary-blue)] bg-[color-mix(in_srgb,var(--color-primary-blue)_14%,transparent)]">
        <Sparkles className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--color-text-primary,#0f172a)] leading-snug">
          Uma empresa acabou de contratar o plano <span className="text-[var(--color-primary-blue)]">{shown.plan}</span>
        </p>
        {ago && <p className="mt-0.5 text-xs text-[var(--color-text-muted,#526077)]">{ago}</p>}
      </div>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => { setShown(null); setItems([]); try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ok */ } }}
        className="w-8 h-8 -mr-1 -mt-1 shrink-0 flex items-center justify-center rounded-lg text-[var(--color-text-faint,#5f6f86)] hover:text-[var(--color-text-primary,#0f172a)] bg-transparent border-none cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
