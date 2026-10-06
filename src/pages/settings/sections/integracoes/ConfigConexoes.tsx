import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Link2Off, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Badge } from "../../../../components/ui/badge";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";
import { useAuth } from "../../../../contexts/AuthContext";
import { CONNECTION_GROUPS, type ConnectionService } from "../../../../lib/connectionsCatalog";
import {
  connectGoogleCalendar,
  consumeGoogleCalendarRedirectResult,
  disconnectGoogleCalendar,
  formatGoogleCalendarError,
} from "../../../../lib/google-auth";
import {
  getGoogleIntegrationsStatus,
  syncGoogleIntegrations,
  type GoogleIntegrationsStatus,
  type GoogleServiceState,
  type ServiceStatus,
  type SyncOutcome,
} from "../../../../lib/googleIntegrations";

const RETURN_TO = "/app/configuracoes/integracoes/conexoes";

function tempoRelativo(iso?: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

const STATUS_LABEL: Record<ServiceStatus, string> = {
  connected: "Conectado",
  needs_reauth: "Reautorizar",
  disconnected: "Desconectado",
  error: "Erro",
  not_authorized: "Não autorizado",
};
const STATUS_VARIANT: Record<ServiceStatus, "success" | "warning" | "neutral" | "destructive"> = {
  connected: "success",
  needs_reauth: "warning",
  disconnected: "neutral",
  error: "destructive",
  not_authorized: "neutral",
};

function resumoSync(o: SyncOutcome): string {
  const nome = o.service === "calendar" ? "Calendar" : "Tasks";
  if (o.skipped === "sync_in_progress") return `${nome}: já está sincronizando.`;
  if (o.skipped) return `${nome}: não conectado.`;
  if (!o.ok) return `${nome}: ${o.error === "reauth_required" ? "precisa reautorizar a conta Google." : o.error ?? "falhou."}`;
  const r = o.result!;
  return `${nome}: ${r.fetched} registro(s) lidos — ${r.created} novo(s), ${r.updated} atualizado(s).`;
}

export function ConfigConexoes() {
  const { activeTenantId } = useAuth();
  const [status, setStatus] = useState<GoogleIntegrationsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // "connect" | "sync" | "sync:calendar" | "disconnect"

  const carregar = useCallback(async () => {
    if (!activeTenantId) return;
    setStatus(await getGoogleIntegrationsStatus(activeTenantId));
    setLoading(false);
  }, [activeTenantId]);

  useEffect(() => {
    const retorno = consumeGoogleCalendarRedirectResult();
    if (retorno?.status === "connected") toast.success("Conta Google conectada. Sincronizando calendário e tarefas…");
    if (retorno?.status === "error") toast.error(formatGoogleCalendarError(retorno.reason));
    carregar();
    // A sincronização inicial roda no servidor logo depois do login: volta a consultar um pouco depois.
    if (retorno?.status === "connected") {
      const t = setTimeout(carregar, 6000);
      return () => clearTimeout(t);
    }
  }, [carregar]);

  const conectar = async () => {
    if (!activeTenantId) return;
    setBusy("connect");
    try {
      await connectGoogleCalendar(activeTenantId, RETURN_TO);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível iniciar a conexão com o Google.");
      setBusy(null);
    }
  };

  const sincronizar = async (services: ("calendar" | "tasks")[]) => {
    if (!activeTenantId) return;
    setBusy(services.length === 1 ? `sync:${services[0]}` : "sync");
    try {
      const outcomes = await syncGoogleIntegrations(activeTenantId, services);
      const falhou = outcomes.some(o => !o.ok && o.skipped !== "sync_in_progress");
      (falhou ? toast.warning : toast.success)(outcomes.map(resumoSync).join(" "));
    } catch (e: any) {
      toast.error(e?.message || "Falha ao sincronizar.");
    } finally {
      setBusy(null);
      carregar();
    }
  };

  const desconectar = async () => {
    if (!activeTenantId) return;
    if (!(await confirmDialog({
      title: "Desconectar Google",
      description: "A conta será desconectada e o acesso revogado. Os eventos e tarefas já sincronizados continuam no Spy.",
    }))) return;
    setBusy("disconnect");
    try {
      await disconnectGoogleCalendar(activeTenantId);
      toast.success("Conta Google desconectada.");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível desconectar.");
    } finally {
      setBusy(null);
      carregar();
    }
  };

  const google = status;
  const contaConectada = !!google?.connected;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conexões</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Conecte as contas da sua empresa. Os dados sincronizados ficam disponíveis para a Aurora responder com informações reais — sempre só do seu usuário.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/60 px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-success" />
        <span>Pedimos só as permissões necessárias (somente leitura para Tasks). As senhas e os tokens da conta ficam guardados no servidor e nunca chegam ao navegador.</span>
      </div>

      {CONNECTION_GROUPS.map(group => (
        <Card key={group.id} className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[var(--color-border-subtle)]">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-[var(--color-text-primary)]">{group.title}</h2>
              {group.id === "google" && (
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {loading ? "Carregando…" : contaConectada ? `Conta: ${google?.email ?? "—"} · sincroniza sozinho a cada 30 min, mesmo com você fora do sistema` : google?.needsReauth ? "A autorização expirou. Reconecte para continuar sincronizando." : "Nenhuma conta Google conectada."}
                </p>
              )}
            </div>

            {group.id === "google" && !loading && (
              <div className="flex flex-wrap items-center gap-2">
                {(!contaConectada || google?.needsReauth) && (
                  <Button onClick={conectar} disabled={busy === "connect"} className="h-9 px-4 text-xs font-medium gap-1.5">
                    {busy === "connect" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {google?.needsReauth ? "Reconectar Google" : "Conectar Google"}
                  </Button>
                )}
                {contaConectada && google?.tasksNeedsAuthorization && (
                  <Button variant="outline" onClick={conectar} disabled={busy === "connect"} className="h-9 px-4 text-xs font-medium gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> Autorizar Google Tasks
                  </Button>
                )}
                {contaConectada && (
                  <>
                    <Button variant="outline" onClick={() => sincronizar(["calendar", "tasks"].filter(s => google?.services[s as "calendar" | "tasks"].enabled) as ("calendar" | "tasks")[])} disabled={!!busy} className="h-9 px-4 text-xs font-medium gap-1.5">
                      {busy === "sync" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sincronizar tudo
                    </Button>
                    <Button variant="ghost" onClick={desconectar} disabled={!!busy} className="h-9 px-3 text-xs font-medium gap-1.5 text-rose-500 hover:text-rose-400">
                      <Link2Off className="w-3.5 h-3.5" /> Desconectar
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {group.services.map(svc => (
              <ServiceRow
                key={svc.id}
                svc={svc}
                state={group.id === "google" && (svc.id === "calendar" || svc.id === "tasks") ? google?.services[svc.id] : undefined}
                loading={loading}
                syncing={busy === `sync:${svc.id}` || busy === "sync"}
                onSync={() => sincronizar([svc.id as "calendar" | "tasks"])}
                anyBusy={!!busy}
              />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function ServiceRow({ svc, state, loading, syncing, onSync, anyBusy }: {
  svc: ConnectionService; state?: GoogleServiceState; loading: boolean; syncing: boolean; onSync: () => void; anyBusy: boolean;
}) {
  if (!svc.live) {
    return (
      <li className="flex items-center justify-between gap-3 px-5 py-3.5 opacity-70">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{svc.name}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{svc.description}</p>
        </div>
        <Badge variant="neutral" className="shrink-0">Em breve</Badge>
      </li>
    );
  }

  const status: ServiceStatus = state?.status ?? "not_authorized";
  const c = state?.counts;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{svc.name}</p>
          {!loading && <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">{svc.description}</p>
        {state?.enabled && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-faint)]">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Última sincronização: {tempoRelativo(state.lastSyncAt)}</span>
            {c?.events !== undefined && <span>{c.events} evento(s)</span>}
            {c?.tasks !== undefined && (
              <span>
                {c.tasks} tarefa(s) · {c.pending} pendente(s)
                {(c.overdue ?? 0) > 0 && <span className="text-rose-500 font-semibold"> · {c.overdue} atrasada(s)</span>}
              </span>
            )}
            {state.lastSyncStatus === "ok" && <span className="flex items-center gap-1 text-success"><CheckCircle2 className="w-3 h-3" /> ok</span>}
          </div>
        )}
        {state?.enabled && state.lastError && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-500"><AlertTriangle className="w-3 h-3 shrink-0" /> {state.lastError}</p>
        )}
      </div>
      {state?.enabled && state.status === "connected" && (
        <Button variant="outline" onClick={onSync} disabled={anyBusy} className="h-8 px-3 text-xs font-medium gap-1.5 shrink-0">
          {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sincronizar
        </Button>
      )}
    </li>
  );
}
