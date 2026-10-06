// Cliente das rotas /api/integrations/google/* (estado, sincronização, histórico).
// Nenhum token passa por aqui: o backend só devolve estado e contagens.
import { apiFetch } from "./apiClient";

export type ServiceStatus = "connected" | "needs_reauth" | "disconnected" | "error" | "not_authorized";

export interface GoogleServiceState {
  enabled: boolean;
  status: ServiceStatus;
  email?: string | null;
  scopes?: string[];
  lastSyncAt?: string | null;
  lastSyncStatus?: "running" | "ok" | "error" | null;
  lastError?: string | null;
  connectedAt?: string | null;
  counts?: { events?: number; tasks?: number; pending?: number; overdue?: number };
}

export interface GoogleIntegrationsStatus {
  connected: boolean;
  needsReauth: boolean;
  email: string | null;
  /** Conectou antes do Tasks existir: precisa reautorizar para habilitá-lo. */
  tasksNeedsAuthorization: boolean;
  services: { calendar: GoogleServiceState; tasks: GoogleServiceState };
}

export interface SyncOutcome {
  service: "calendar" | "tasks";
  ok: boolean;
  skipped?: string;
  error?: string;
  result?: { fetched: number; created: number; updated: number; removed: number };
}

const headers = (tenantId: string): HeadersInit => ({ "x-active-tenant-id": tenantId });

export async function getGoogleIntegrationsStatus(tenantId: string): Promise<GoogleIntegrationsStatus | null> {
  try {
    const res = await apiFetch("/api/integrations/google/status", { headers: headers(tenantId) });
    if (!res.ok) return null;
    return (await res.json()).google as GoogleIntegrationsStatus;
  } catch {
    return null;
  }
}

export async function syncGoogleIntegrations(tenantId: string, services: ("calendar" | "tasks")[]): Promise<SyncOutcome[]> {
  const res = await apiFetch("/api/integrations/google/sync", {
    method: "POST",
    headers: { ...headers(tenantId), "Content-Type": "application/json" },
    body: JSON.stringify({ services }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Falha ao sincronizar.");
  return (await res.json()).outcomes as SyncOutcome[];
}
