// Proxy fino pro backend (/api/google-calendar/*) — nenhuma chamada direta à
// Google Calendar API a partir do browser. O backend resolve a conexão do
// tenant/usuário atual e injeta o access_token; o frontend nunca vê um token.
import { apiFetch } from "./apiClient";

export interface CalendarEvent {
  id: string;
  htmlLink: string;
  hangoutLink?: string;
}

function tenantHeaders(tenantId: string): HeadersInit {
  return { "x-active-tenant-id": tenantId };
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export interface GoogleCalendarApiEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
}

// Usado só onde ainda existe uma tela lendo a lista crua de eventos pra
// montar sua própria lógica de exibição/dedupe (ex.: AgendaMedica). Onde o
// destino é reunioes, prefira syncGoogleCalendar() (google-auth.ts), que já
// faz a sincronização inteira — busca, mapeia e grava — no backend.
export async function listGoogleCalendarEvents(
  tenantId: string,
  options?: { timeMin?: string; timeMax?: string; maxResults?: number }
): Promise<GoogleCalendarApiEvent[]> {
  const params = new URLSearchParams();
  if (options?.timeMin) params.set("timeMin", options.timeMin);
  if (options?.timeMax) params.set("timeMax", options.timeMax);
  if (options?.maxResults) params.set("maxResults", String(options.maxResults));
  const res = await apiFetch(`/api/google-calendar/events?${params.toString()}`, {
    headers: tenantHeaders(tenantId),
  });
  if (!res.ok) throw new Error(await readError(res, "Falha ao buscar eventos do Google Calendar"));
  const data = await res.json();
  return (data.events || []) as GoogleCalendarApiEvent[];
}

export async function createCalendarEvent(
  tenantId: string,
  params: {
    title: string;
    description: string;
    startISO: string;
    endISO: string;
    attendeeEmails: string[];
    location?: string;
    /** true = Sala S.P.Y. (Jitsi link na descrição, sem criar Google Meet) */
    skipConferenceData?: boolean;
    /** Minutos antes do início pro Google avisar (popup + e-mail); omitido = padrão do calendário. */
    reminderMinutes?: number;
  }
): Promise<CalendarEvent> {
  const res = await apiFetch("/api/google-calendar/events", {
    method: "POST",
    headers: { ...tenantHeaders(tenantId), "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await readError(res, "Falha ao criar evento no Google Calendar"));
  return res.json();
}
