// Situação das empresas no servidor: consulta (com cache curto), rotas do cliente e do master, e a trava das rotas /api para
// empresa desabilitada. A trava só vale para quem NÃO é master e, em caso de erro de consulta, deixa passar (nunca derruba o sistema).
import type express from "express";
import { situacaoDaEmpresa, bloqueiaAcesso, type Situacao } from "../src/lib/situacaoEmpresa.js";

/** Continuam abertas para empresa desabilitada: ver a própria situação, assinatura e pagamento. */
export const ROTAS_LIVRES = ["/api/billing", "/api/checkout"];
export const rotaLivre = (caminho: string) => ROTAS_LIVRES.some((p) => caminho === p || caminho.startsWith(`${p}/`));

const TTL = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarSituacaoEmpresa(deps: { supabaseService: any; tenantRaiz: string }) {
  const db = () => deps.supabaseService;
  const cacheEmpresa = new Map<string, { at: number; v: Situacao }>();
  const cacheUsuario = new Map<string, { at: number; tenantId: string | null; master: boolean }>();

  async function daEmpresa(tenantId: string): Promise<Situacao> {
    const hit = cacheEmpresa.get(tenantId);
    if (hit && Date.now() - hit.at < TTL) return hit.v;
    const [t, a] = await Promise.all([
      db().from("tenants").select("status").eq("id", tenantId).maybeSingle(),
      db().from("tenant_subscriptions").select("status, current_period_end, trial_ends_at").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    if (t.error || a.error) throw new Error(t.error?.message || a.error?.message);
    const v = situacaoDaEmpresa({ status: t.data?.status, assinatura: a.data, ehRaiz: tenantId === deps.tenantRaiz });
    cacheEmpresa.set(tenantId, { at: Date.now(), v });
    return v;
  }

  async function doUsuario(userId: string) {
    const hit = cacheUsuario.get(userId);
    if (hit && Date.now() - hit.at < TTL) return hit;
    const { data, error } = await db().from("users").select("tenant_id, is_master").eq("id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    const v = { at: Date.now(), tenantId: (data?.tenant_id as string) ?? null, master: !!data?.is_master };
    cacheUsuario.set(userId, v);
    return v;
  }

  /** Situação que bloqueia este usuário nesta rota, ou null se pode seguir. */
  async function bloqueioDe(userId: string, caminho: string): Promise<Situacao | null> {
    if (!db() || rotaLivre(caminho)) return null;
    try {
      const u = await doUsuario(userId);
      if (u.master || !u.tenantId) return null;
      const s = await daEmpresa(u.tenantId);
      return bloqueiaAcesso(s) ? s : null;
    } catch (e: any) {
      console.error("[situacao-empresa] consulta falhou, deixando passar:", e?.message);
      return null;
    }
  }

  const limpar = (tenantId: string) => cacheEmpresa.delete(tenantId);

  function registrar(app: express.Express, { requireUser, requireMaster, limiter }: { requireUser: any; requireMaster: any; limiter: any }) {
    app.get("/api/admin/empresas/situacoes", requireUser, requireMaster, limiter, async (_req: any, res) => {
      try {
        const [t, a] = await Promise.all([
          db().from("tenants").select("id, status").limit(2000),
          db().from("tenant_subscriptions").select("tenant_id, status, current_period_end, trial_ends_at").limit(5000),
        ]);
        if (t.error || a.error) throw new Error(t.error?.message || a.error?.message);
        const porEmpresa = new Map<string, any>((a.data || []).map((x: any) => [x.tenant_id, x]));
        const situacoes: Record<string, Situacao> = {};
        for (const x of t.data || []) situacoes[x.id] = situacaoDaEmpresa({ status: x.status, assinatura: porEmpresa.get(x.id), ehRaiz: x.id === deps.tenantRaiz });
        res.json({ situacoes });
      } catch (e: any) { console.error("[situacao-empresa/lista]", e?.message); res.status(500).json({ error: "Não foi possível consultar as situações." }); }
    });

    const mudar = (status: "Inactive" | "Active") => async (req: any, res: any) => {
      const id = String(req.params.tenantId || "");
      if (!UUID.test(id)) return res.status(400).json({ error: "Empresa inválida." });
      if (id === deps.tenantRaiz) return res.status(409).json({ error: "A empresa dona do sistema não pode ser desabilitada." });
      try {
        const { data: atual } = await db().from("tenants").select("status").eq("id", id).maybeSingle();
        if (!atual) return res.status(404).json({ error: "Empresa não encontrada." });
        const { error } = await db().from("tenants").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw new Error(error.message);
        limpar(id);
        const { error: trilha } = await db().from("billing_events").insert({ tenant_id: id, type: "status_change", from_status: atual.status, to_status: status, payload: { by: req.user.id, origem: "admin" } });
        if (trilha) console.warn("[situacao-empresa] não registrou a trilha:", trilha.message);
        res.json({ ok: true, situacao: await daEmpresa(id) });
      } catch (e: any) { console.error("[situacao-empresa/mudar]", e?.message); res.status(500).json({ error: "Não foi possível alterar a empresa." }); }
    };
    app.post("/api/admin/empresas/:tenantId/desabilitar", requireUser, requireMaster, limiter, mudar("Inactive"));
    app.post("/api/admin/empresas/:tenantId/reativar", requireUser, requireMaster, limiter, mudar("Active"));
  }

  return { daEmpresa, bloqueioDe, limpar, registrar };
}
