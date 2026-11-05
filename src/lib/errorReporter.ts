import { supabase } from "./supabase";

/**
 * Relata erros de JavaScript do navegador ao próprio servidor (POST /api/client-error → tabela app_error_log,
 * que o master lê em Admin > Operação > Erros do app). Sem serviço externo.
 * Limites para nunca virar problema: no máximo 8 relatos por aba, o mesmo erro só uma vez e ruído conhecido ignorado.
 */
const IGNORAR = /ResizeObserver loop|Script error\.?$|insertBefore|removeChild|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|NetworkError|Load failed|Failed to fetch|AbortError/i;
const vistos = new Set<string>();
let enviados = 0;

async function enviar(mensagem: string, stack?: string) {
  if (!mensagem || IGNORAR.test(mensagem)) return;
  const chave = mensagem.slice(0, 160);
  if (vistos.has(chave) || enviados >= 8) return;
  vistos.add(chave);
  enviados++;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    await fetch("/api/client-error", {
      method: "POST", headers, keepalive: true,
      body: JSON.stringify({ mensagem, stack, url: window.location.pathname }),
    });
  } catch { /* relatar erro nunca pode gerar outro erro */ }
}

export function relatarErro(error: unknown) {
  const e = error as any;
  void enviar(String(e?.message ?? e ?? ""), typeof e?.stack === "string" ? e.stack : undefined);
}

export function iniciarRelatorDeErros() {
  window.addEventListener("error", (ev) => relatarErro(ev.error ?? ev.message));
  window.addEventListener("unhandledrejection", (ev) => relatarErro(ev.reason));
}
