import { supabase } from './supabase';

/**
 * fetch() para as rotas internas do S.P.Y. (/api/ai/*, /api/whatsapp/*,
 * /api/settings/*, /api/leads/*) — todas exigem uma sessão real do Supabase
 * Auth (ver requireUser em server.ts). Anexa automaticamente o header
 * Authorization com o access_token da sessão atual.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  // Queda de rede do navegador (ERR_NETWORK_CHANGED / "Failed to fetch": Wi-Fi reconectando, VPN, IPv4↔IPv6) derruba
  // de uma vez todas as chamadas em andamento — e o carregamento inicial ficava sem dados até recarregar a página.
  // Leituras (GET) são seguras de repetir; escritas nunca são repetidas aqui (poderiam duplicar efeito).
  const method = (init.method || 'GET').toUpperCase();
  const retries = method === 'GET' ? 3 : 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, { ...init, headers });
    } catch (err) {
      if (attempt >= retries || init.signal?.aborted) throw err;
      await new Promise((ok) => setTimeout(ok, 600 * (attempt + 1)));
    }
  }
}
