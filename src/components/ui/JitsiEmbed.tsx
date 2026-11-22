import { useEffect, useRef, useState } from "react";
import { Loader2, Video } from "lucide-react";

declare global {
  interface Window { JitsiMeetExternalAPI: any }
}

interface JitsiEmbedProps {
  roomName: string;
  displayName?: string;
  email?: string;
  onLeave?: () => void;
  className?: string;
}

function loadJitsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) { resolve(); return; }
    const existing = document.querySelector('script[src*="meet.jit.si/external_api"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function JitsiEmbed({ roomName, displayName, email, onLeave, className }: JitsiEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function init() {
      try {
        await loadJitsiScript();
        if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) return;

        apiRef.current = new window.JitsiMeetExternalAPI("meet.jit.si", {
          roomName,
          width: "100%",
          height: "100%",
          parentNode: containerRef.current,
          lang: "ptBR",
          userInfo: {
            displayName: displayName ?? "Usuário S.P.Y.",
            email: email ?? "",
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            defaultLanguage: "ptBR",
            disableInviteFunctions: false,
            enableWelcomePage: false,
            enableClosePage: false,
            toolbarButtons: [
              "microphone", "camera", "closedcaptions", "desktop",
              "fullscreen", "hangup", "chat", "raisehand",
              "tileview", "select-background", "shareaudio", "settings",
            ],
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_ALWAYS_VISIBLE: true,
            DEFAULT_LOGO_URL: "",
            BRAND_WATERMARK_LINK: "",
            HIDE_INVITE_MORE_HEADER: false,
            NATIVE_APP_SCHEME: "",
            APP_NAME: "S.P.Y. SORA — Sala de Reunião",
            PROVIDER_NAME: "S.P.Y. SORA",
          },
        });

        apiRef.current.addEventListener("videoConferenceJoined", () => setLoading(false));
        apiRef.current.addEventListener("readyToClose", () => onLeave?.());
        apiRef.current.addEventListener("videoConferenceLeft", () => onLeave?.());

        // Fallback: hide loader after 8s even if event doesn't fire
        setTimeout(() => { if (!disposed) setLoading(false); }, 8000);
      } catch (err) {
        if (!disposed) setError("Não foi possível carregar a sala. Verifique sua conexão.");
        setLoading(false);
      }
    }

    init();

    return () => {
      disposed = true;
      try { apiRef.current?.dispose(); } catch {}
      apiRef.current = null;
    };
  }, [roomName]);

  return (
    <div className={`relative w-full h-full bg-[var(--color-surface)] ${className ?? ""}`}>
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--color-surface)]">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <Video className="w-7 h-7 text-blue-400" />
          </div>
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <p className="text-xs text-slate-500 font-bold">Conectando à sala...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--color-surface)] text-center px-6">
          <Video className="w-8 h-8 text-slate-600" />
          <p className="text-sm text-slate-400 font-bold">{error}</p>
        </div>
      )}

      {/* Jitsi container */}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

/** Extracts Jitsi room name from a meet.jit.si URL or axis-prefixed room */
export function isJitsiLink(link?: string): boolean {
  return !!link && link.includes("meet.jit.si");
}

export function jitsiRoomName(link: string): string {
  // https://meet.jit.si/axis-abc123 → axis-abc123
  try {
    return new URL(link).pathname.replace(/^\//, "");
  } catch {
    return link;
  }
}

/** Generates a unique Jitsi room URL for a meeting */
export function generateJitsiLink(reuniaoId: string): string {
  return `https://meet.jit.si/axis-${reuniaoId}`;
}
