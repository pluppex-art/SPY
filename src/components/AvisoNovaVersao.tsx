import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { haVersaoNova } from "../lib/versaoNova";

// Depois de uma publicação, a aba aberta continua com o código antigo (SPA: navegar não busca JS novo).
// Compara o id embutido no bundle (__BUILD_ID__, ver vite.config.ts) com /build-id.txt, servido sem cache.
const INTERVALO_MS = 60_000;
const ADIAR_MS = 10 * 60_000;

/**
 * Aviso fixo de "nova atualização" com o botão Atualizar. É um componente próprio (e não um toast) para não se perder
 * quando a tela de notificações ainda não existe ou é remontada, nem sumir atrás de outras notificações.
 */
export function AvisoNovaVersao() {
  const [disponivel, setDisponivel] = useState(false);
  const [adiadoAte, setAdiadoAte] = useState(0);
  const [atualizando, setAtualizando] = useState(false);
  const [, setAgora] = useState(0);

  useEffect(() => {
    const verificar = async () => {
      setAgora(Date.now()); // faz o aviso adiado voltar quando o prazo vence
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/build-id.txt?t=${Date.now()}`, { cache: "no-store" });
        if (res.ok && haVersaoNova(await res.text(), __BUILD_ID__)) setDisponivel(true);
      } catch {
        // Sem rede: tenta de novo no próximo intervalo.
      }
    };
    void verificar();
    const intervalo = setInterval(verificar, INTERVALO_MS);
    document.addEventListener("visibilitychange", verificar);
    window.addEventListener("focus", verificar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", verificar);
      window.removeEventListener("focus", verificar);
    };
  }, []);

  if (!disponivel || Date.now() < adiadoAte) return null;

  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6 z-[2147483000] w-[calc(100%-2rem)] max-w-md flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-primary-blue)]/40 bg-[var(--color-surface-elevated)] p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
      <div className="p-2 rounded-xl bg-[var(--color-primary-blue)]/10 shrink-0"><Sparkles className="w-4 h-4 text-[var(--color-primary-blue)]" /></div>
      <div className="flex-1 min-w-[13rem]">
        <p className="text-sm font-black text-[var(--color-text-primary)]">Nova atualização disponível</p>
        <p className="text-[11px] text-[var(--color-text-muted)]">Salve o que estiver preenchendo e atualize.</p>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => setAdiadoAte(Date.now() + ADIAR_MS)} className="shrink-0 px-2 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer bg-transparent border-none">Depois</button>
        <button type="button" disabled={atualizando} onClick={() => { setAtualizando(true); window.location.reload(); }} className="shrink-0 flex items-center gap-1.5 rounded-xl bg-[var(--color-primary-blue)] px-3.5 py-2 text-xs font-bold !text-white cursor-pointer border-none disabled:opacity-60">
          <RefreshCw className={`w-3.5 h-3.5 ${atualizando ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>
    </div>
  );
}
