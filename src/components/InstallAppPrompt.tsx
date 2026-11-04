import { useEffect, useState } from "react";
import { Download, Share, X, PlusSquare } from "lucide-react";
import { Button } from "./ui/button";

const DISMISS_KEY = "spy:install-prompt-dismissed-at";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

function wasDismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

/** Convite para instalar o S.P.Y. na tela inicial. Só aparece no celular, fora do app já instalado. */
export function InstallAppPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // iPhone não dispara beforeinstallprompt: mostra o passo a passo do Safari.
    if (isIos) setShow(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [isIos]);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sem storage: só some nesta sessão */ }
  };

  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    setEvt(null);
    if (outcome === "accepted") setShow(false);
    else dismiss();
  };

  if (!show) return null;

  return (
    <div className="md:hidden mx-4 mt-3 rounded-[var(--radius-panel)] border border-[var(--color-primary-blue)]/25 bg-[var(--color-primary-blue)]/5 p-3.5 flex items-start gap-3">
      <img src="/pwa-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black text-[var(--color-text-primary)]">Instale o S.P.Y. no celular</p>
        {evt ? (
          <>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">Abre em tela cheia, direto da tela inicial, como um aplicativo.</p>
            <Button onClick={install} className="mt-2.5 h-9 px-4 text-xs font-bold gap-1.5">
              <Download className="w-3.5 h-3.5" /> Instalar aplicativo
            </Button>
          </>
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">
            Toque em <Share className="inline w-3.5 h-3.5 -mt-0.5 text-[var(--color-primary-blue)]" /> <b>Compartilhar</b> e depois em{" "}
            <PlusSquare className="inline w-3.5 h-3.5 -mt-0.5 text-[var(--color-primary-blue)]" /> <b>Adicionar à Tela de Início</b>.
          </p>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Dispensar" className="p-2 -m-1 shrink-0 text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
