import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Detecta aba aberta rodando um bundle JS antigo depois de um novo deploy —
// achado real nesta sessão: vários bugs já corrigidos e publicados
// continuavam reaparecendo porque o usuário nunca fechava/recarregava a aba
// (SPA de rota única — navegar entre páginas não busca JS novo, só o
// `index.html`/chunk de quando a aba abriu). Compara o build id embutido no
// bundle atual (__BUILD_ID__, injetado no build pelo vite.config.ts) contra
// `/build-id.txt` (gerado no mesmo build, servido sem cache — ver
// vercel.json) a cada intervalo e quando a aba volta a ficar visível.
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

export function useBuildVersionCheck() {
  const notifiedRef = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (notifiedRef.current) return;
      try {
        const res = await fetch(`/build-id.txt?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const remoteId = (await res.text()).trim();
        if (remoteId && remoteId !== __BUILD_ID__) {
          notifiedRef.current = true;
          toast.message("Nova versão disponível", {
            description: "Esta aba está rodando uma versão antiga do sistema.",
            duration: Infinity,
            action: {
              label: "Atualizar agora",
              onClick: () => window.location.reload(),
            },
          });
        }
      } catch {
        // Sem rede/offline — não incomoda o usuário por causa disso.
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisibility = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
