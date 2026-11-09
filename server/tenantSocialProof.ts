import type { Express } from "express";

// Prova social das páginas públicas DE CADA EMPRESA (catálogo e proposta), com os produtos dela.
// Genérico para todos os tenants. Regras:
//  - só responde se a empresa LIGOU (app_settings.social_proof_publico.enabled === true; padrão desligado);
//  - só vendas reais (lead "Fechado" com produto) e só do PRÓPRIO tenant;
//  - nada de dado pessoal (nem nome de cliente, nem valor): só produto + quantidade;
//  - só afirma o que é verdadeiro sem depender de data (o lead não guarda a data do fechamento):
//    "N clientes já compraram X". Produto com menos de MIN_SALES vendas não aparece.

export const SETTING_KEY = "social_proof_publico";
export const MIN_SALES = 3;
const MAX_ITEMS = 5;
const MAX_LEADS_SCANNED = 5000;
const CACHE_TTL_MS = 10 * 60_000;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

export interface TenantProofItem { product: string; count: number }
export interface TenantProofResponse {
  enabled: boolean;
  items: TenantProofItem[];
  brand?: { name: string | null; color: string | null; logoUrl: string | null };
}

/** Conta vendas por produto e devolve os mais vendidos (≥ MIN_SALES). Função pura, sem dado pessoal. */
export function topProducts(leadRows: any[], productRows: any[]): TenantProofItem[] {
  const counts = new Map<string, number>();
  for (const l of leadRows || []) {
    const ids: unknown = l?.productIds;
    if (!Array.isArray(ids)) continue;
    // O mesmo produto repetido no mesmo lead conta uma venda só.
    for (const id of new Set(ids.filter((x): x is string => typeof x === "string"))) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const names = new Map<string, string>();
  for (const p of productRows || []) if (p?.id && typeof p.name === "string" && p.name.trim()) names.set(p.id, p.name.trim().slice(0, 80));
  return [...counts.entries()]
    .filter(([id, n]) => n >= MIN_SALES && names.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ITEMS)
    .map(([id, n]) => ({ product: names.get(id)!, count: n }));
}

const safeLogo = (u: unknown): string | null => (typeof u === "string" && /^https:\/\/[^\s]{4,500}$/.test(u) ? u : null);

const cache = new Map<string, { at: number; data: TenantProofResponse }>();

export async function buildTenantProof(db: any, tenantId: string): Promise<TenantProofResponse> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  let data: TenantProofResponse = { enabled: false, items: [] };
  try {
    const { data: setting } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", SETTING_KEY).maybeSingle();
    if (setting?.value?.enabled === true) {
      const { data: leads } = await db.from("leads").select("productIds")
        .eq("tenant_id", tenantId).eq("status", "Fechado").is("deleted_at", null).limit(MAX_LEADS_SCANNED);
      const { data: products } = await db.from("products").select("id, name").eq("tenant_id", tenantId).limit(2000);
      const items = topProducts(leads || [], products || []);

      const [{ data: tenant }, { data: emp }] = await Promise.all([
        db.from("tenants").select("name, primary_color").eq("id", tenantId).maybeSingle(),
        db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "empresa_dados").maybeSingle(),
      ]);
      data = {
        enabled: true,
        items,
        brand: {
          name: typeof tenant?.name === "string" ? tenant.name.slice(0, 80) : null,
          color: HEX.test(tenant?.primary_color || "") ? tenant.primary_color : null,
          logoUrl: safeLogo(emp?.value?.logoUrl),
        },
      };
    }
  } catch (err: any) {
    console.error("[tenant-social-proof]", err?.message);
    return { enabled: false, items: [] }; // erro não entra no cache
  }
  if (cache.size > 500) cache.clear();
  cache.set(tenantId, { at: Date.now(), data });
  return data;
}

/** Apaga o cache de uma empresa (ou de todas): usado nos testes. */
export function clearTenantProofCache(tenantId?: string) { if (tenantId) cache.delete(tenantId); else cache.clear(); }

interface Deps { supabaseService: any; limiter: any }

export function registerTenantSocialProofRoutes(app: Express, { supabaseService, limiter }: Deps) {
  // Público (catálogo e proposta). A empresa vem do id do catálogo OU do token da proposta — nunca de outro lugar.
  app.get("/api/public/tenant-social-proof", limiter, async (req: any, res: any) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    const none: TenantProofResponse = { enabled: false, items: [] };
    if (!supabaseService) return res.json(none);

    let tenantId: string | null = null;
    const qTenant = typeof req.query.tenantId === "string" ? req.query.tenantId : "";
    const qToken = typeof req.query.token === "string" ? req.query.token : "";
    try {
      if (qTenant && UUID.test(qTenant)) {
        tenantId = qTenant;
      } else if (qToken && qToken.length >= 16 && qToken.length <= 200) {
        const { data: prop } = await supabaseService.from("proposals").select("tenant_id").eq("view_token", qToken).maybeSingle();
        tenantId = prop?.tenant_id || null;
      }
    } catch { /* cai em "nada" */ }
    if (!tenantId) return res.json(none);

    const out = await buildTenantProof(supabaseService, tenantId);
    // Desligado ou sem produto com vendas suficientes: não expõe nem a marca.
    if (!out.enabled || out.items.length === 0) return res.json(none);
    res.json(out);
  });
}
