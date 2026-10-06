// Registro de serviços conectados (tabela public.integrations) — SEM tokens.
//
// As credenciais continuam na tabela de cada provedor (para o Google: google_calendar_connections),
// que só o backend (service_role) lê. Aqui fica o ESTADO por serviço: conta, escopos concedidos,
// status, última sincronização. É o que a Central de Conexões mostra e o que a Aurora usa para saber
// se pode consultar os dados de alguém. Pensado para outros provedores (Meta, Gmail, Drive...).
import type { SupabaseClient } from "@supabase/supabase-js";

export type IntegrationStatus = "connected" | "needs_reauth" | "disconnected" | "error";

export const GOOGLE_PROVIDER = "google";

/** Serviços do Google que sabemos usar hoje e os escopos que cada um exige. */
export const GOOGLE_SERVICE_SCOPES = {
  calendar: [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/meetings.space.created",
  ],
  tasks: ["https://www.googleapis.com/auth/tasks.readonly"],
} as const;

export type GoogleService = keyof typeof GOOGLE_SERVICE_SCOPES;

/** Quais serviços um conjunto de escopos concedidos habilita. Calendar basta ter UM escopo de calendário. */
export function googleServicesFromScope(scope: string | null | undefined): GoogleService[] {
  const granted = new Set((scope ?? "").split(/\s+/).filter(Boolean));
  const out: GoogleService[] = [];
  if (GOOGLE_SERVICE_SCOPES.calendar.some(s => granted.has(s) && s.includes("/calendar"))) out.push("calendar");
  if (GOOGLE_SERVICE_SCOPES.tasks.every(s => granted.has(s))) out.push("tasks");
  return out;
}

/** Escopos concedidos que pertencem a um serviço (para registrar só o que ele usa). */
export function scopesForService(service: GoogleService, scope: string | null | undefined): string[] {
  const granted = new Set((scope ?? "").split(/\s+/).filter(Boolean));
  return GOOGLE_SERVICE_SCOPES[service].filter(s => granted.has(s));
}

export interface RegisterGoogleParams {
  tenantId: string;
  userId: string;
  email: string | null;
  accountId?: string | null;
  scope: string | null | undefined;
  credentialId?: string | null;
}

/** Cria/atualiza uma linha por serviço concedido. Idempotente (chave tenant+usuário+provedor+serviço). */
export async function registerGoogleServices(supabase: SupabaseClient, p: RegisterGoogleParams): Promise<GoogleService[]> {
  const services = googleServicesFromScope(p.scope);
  const now = new Date().toISOString();
  for (const service of services) {
    const { error } = await supabase.from("integrations").upsert(
      {
        tenant_id: p.tenantId,
        user_id: p.userId,
        provider: GOOGLE_PROVIDER,
        service,
        provider_account_id: p.accountId ?? null,
        account_email: p.email,
        scopes: scopesForService(service, p.scope),
        status: "connected",
        credential_table: "google_calendar_connections",
        credential_id: p.credentialId ?? null,
        connected_at: now,
        disconnected_at: null,
        last_sync_error: null,
      },
      { onConflict: "tenant_id,user_id,provider,service" },
    );
    if (error) console.error(`[integrations] falha ao registrar google/${service}:`, error.message);
  }
  return services;
}

/** Muda o status de TODOS os serviços Google de um usuário (desconexão, token inválido...). */
export async function markGoogleIntegrations(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  status: IntegrationStatus,
  error?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "disconnected") patch.disconnected_at = new Date().toISOString();
  if (error !== undefined) patch.last_sync_error = error;
  const { error: err } = await supabase
    .from("integrations").update(patch)
    .eq("tenant_id", tenantId).eq("user_id", userId).eq("provider", GOOGLE_PROVIDER);
  if (err) console.error("[integrations] falha ao atualizar status:", err.message);
}
