import { useCallback, useEffect, useState } from "react";
import { Smartphone, Wifi, WifiOff, PauseCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { AgenteSecretoQrModal } from "../../../../components/AgenteSecretoQrModal";
import { AGENTE_SECRETO_STATUS_EVENT } from "../../../../components/AgenteSecretoConexao";
import { apiFetch } from "../../../../lib/apiClient";

type Status = "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "UNKNOWN";
interface Sessao { session: string | null; status?: Status; phone?: string | null; ativo?: boolean }

const POLL_MS = 15_000;

// Página fixa do vendedor para ver e conectar o PRÓPRIO Agente Secreto a qualquer momento — conectar pela
// primeira vez (QR) ou reconectar se cair. A sessão é criada pelo administrador (Equipe › menu do colaborador).
export function ConfigAgenteSecreto() {
  const [data, setData] = useState<Sessao | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async (): Promise<Status | null> => {
    try {
      const r = await apiFetch("/api/agente-secreto/minha-sessao");
      const d: Sessao | null = r.ok ? await r.json().catch(() => null) : null;
      setData(d || { session: null });
      return d?.status ?? null;
    } catch {
      return null; // sem rede: mantém o último estado
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const notifyChange = () => window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));

  const semSessao = !loading && !data?.session;
  const pausado = !!data?.session && data.ativo === false;
  const conectado = data?.status === "CONNECTED";
  const phone = data?.phone ? `+${String(data.phone).replace(/\D/g, "")}` : null;

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Meu Agente Secreto <Smartphone className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Conecte o seu WhatsApp para o Agente Secreto acompanhar suas conversas com os leads. Se ele cair, você mesmo reconecta por aqui.
        </p>
      </div>

      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-4">
        {loading ? (
          <p className="text-sm text-[var(--color-text-muted)] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</p>
        ) : semSessao ? (
          <div className="space-y-1">
            <p className="text-sm font-bold text-[var(--color-text-primary)]">Você ainda não tem uma sessão do Agente Secreto.</p>
            <p className="text-sm text-[var(--color-text-muted)]">Peça ao administrador da sua empresa para criar a sua sessão (Equipe › menu do colaborador › Criar sessão do Agente Secreto). Depois volte aqui para conectar.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {pausado ? <PauseCircle className="w-6 h-6 text-amber-500" /> : conectado ? <Wifi className="w-6 h-6 text-emerald-500" /> : <WifiOff className="w-6 h-6 text-rose-500" />}
              <div>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">
                  {pausado ? "Pausado" : conectado ? "Conectado" : data?.status === "UNKNOWN" ? "Status indisponível agora" : "Desconectado"}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {pausado
                    ? "Seu status não é Ativo (férias/afastamento). Ele volta sozinho quando você voltar a Ativo."
                    : conectado
                      ? `WhatsApp ${phone ?? ""} conectado — o Agente Secreto está acompanhando suas conversas.`
                      : "Ele não está acompanhando suas conversas. Leia o QR code para conectar."}
                </p>
              </div>
            </div>
            {!pausado && !conectado && data?.status !== "UNKNOWN" && (
              <Button onClick={() => setOpen(true)}>Conectar WhatsApp</Button>
            )}
          </div>
        )}
      </Card>

      <AgenteSecretoQrModal
        open={open}
        onClose={() => setOpen(false)}
        checkConnected={async () => (await load()) === "CONNECTED"}
        onConnected={() => {
          setOpen(false);
          load();
          notifyChange();
          toast.success("Agente Secreto conectado!");
        }}
      />
    </div>
  );
}
