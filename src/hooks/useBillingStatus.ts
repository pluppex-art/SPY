import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { saasApi, type BillingStatus } from "../lib/saasApi";

// Cache curto por tenant: o Layout monta uma vez por navegação e a tela "Plano & Uso" reaproveita.
const cache = new Map<string, { at: number; v: BillingStatus }>();
const TTL = 60_000;

export function invalidateBillingStatus() { cache.clear(); }

export function useBillingStatus() {
  const { activeTenantId, user } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !activeTenantId) { setLoading(false); return; }
    let cancelled = false;
    const hit = cache.get(activeTenantId);
    if (hit && Date.now() - hit.at < TTL) { setStatus(hit.v); setLoading(false); return; }
    setLoading(true);
    saasApi.status(activeTenantId)
      .then((v) => { cache.set(activeTenantId, { at: Date.now(), v }); if (!cancelled) setStatus(v); })
      .catch(() => { if (!cancelled) setStatus(null); }) // falha de rede/sessão nunca bloqueia o app
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeTenantId, user]);

  return { status, loading, refresh: () => { invalidateBillingStatus(); } };
}
