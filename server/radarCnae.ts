// Busca do Radar por CNAE: empresas ativas da base da Receita (apipj) por atividade e cidade, dentro do limite diário
// do Radar, guardadas em radar_empresas_frias para aparecerem em "Já salvas".
import type { Express } from "express";
import { montarUrlBusca, normalizarCnae, normalizarEmpresa, normalizarMunicipio, MENSAGENS_APIPJ, type EmpresaProspeccao } from "./prospeccaoCnae.js";
import { LIMITE_POR_DIA, reservar, devolver, restanteHoje } from "./radarCota.js";
import { cleanEmail } from "./emailCampaigns.js";

/** O serviço de consulta cobra cada empresa devolvida do limite por minuto (10 no plano gratuito). */
export const porMinuto = () => Number(process.env.APIPJ_POR_MINUTO) || 10;

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Formato que a tela do Radar já mostra. */
export function paraORadar(e: EmpresaProspeccao) {
  const telefone = e.telefone.split("/")[0].trim();
  return {
    empresa: e.fantasia || e.nome, razaoSocial: e.nome, cnpj: e.cnpj,
    endereco: [e.endereco, [e.cidade, e.uf].filter(Boolean).join("/")].filter(Boolean).join(" · "),
    avaliacao: "", contato: telefone, site: "", whatsapp: "", email: cleanEmail(e.email),
  };
}

/** Guarda sem sobrescrever o que já existe (a situação da empresa pode ter mudado no atendimento). */
async function guardar(db: any, tenantId: string, empresas: EmpresaProspeccao[]) {
  const linhas = empresas.filter((e) => soDigitos(e.cnpj).length === 14).map((e) => ({
    tenant_id: tenantId, cnpj: soDigitos(e.cnpj), razao_social: e.nome || null, nome_fantasia: e.fantasia || null,
    cnae_principal: soDigitos(e.cnae) || null, cnae_descricao: e.cnaeDescricao || null, porte: e.porte || null, municipio: e.cidade || null, uf: e.uf || null,
    endereco: e.endereco || null, cep: soDigitos(e.cep) || null, telefones: e.telefone.split("/").map((t) => t.trim()).filter(Boolean),
    email: cleanEmail(e.email) || null, data_abertura: e.abertura || null, origem: "cnae", status: "novo",
  }));
  if (!linhas.length) return;
  const { error } = await db.from("radar_empresas_frias").upsert(linhas, { onConflict: "tenant_id,cnpj", ignoreDuplicates: true });
  if (error) console.warn("[radar/cnae] não guardou:", error.message);
}

interface Deps { requireUser: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; limiter: any; supabaseService: any; buscar?: typeof fetch }

export function registerRadarCnaeRoutes(app: Express, { requireUser, resolveRequestedTenantId, limiter, supabaseService: db, buscar }: Deps) {
  app.post("/api/radar/cnae", requireUser, limiter, async (req: any, res: any) => {
    const chave = process.env.APIPJ_KEY;
    if (!db || !chave) return res.status(503).json({ error: "A busca por CNAE ainda não está configurada neste ambiente." });
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const cnae = normalizarCnae(req.body?.cnae), municipio = normalizarMunicipio(req.body?.municipio);
    if (!cnae) return res.status(400).json({ error: "Informe o CNAE com 7 dígitos (ex.: 56.11-2-01)." });
    if (!municipio) return res.status(400).json({ error: "Escolha a cidade." });
    const quantidade = Math.min(porMinuto(), Math.max(1, parseInt(String(req.body?.quantidade ?? "10"), 10) || 10));
    const cursor = typeof req.body?.cursor === "string" ? req.body.cursor.slice(0, 512) : null;
    let separado = 0;
    const encerrar = async (entregues: number) => {
      try { await devolver(db, tenantId, separado - entregues); separado = entregues; return await restanteHoje(db, tenantId); } catch (e: any) { console.error("[radar/cota]", e?.message); return undefined; }
    };
    try {
      const [{ data: t }, { data: u }] = await Promise.all([
        db.from("tenants").select("modules").eq("id", tenantId).maybeSingle(),
        db.from("users").select("is_master").eq("id", req.user.id).maybeSingle(),
      ]);
      if (u?.is_master !== true && Object.keys(t?.modules || {}).length && t.modules.radar !== true) return res.status(403).json({ error: "O módulo Radar não está habilitado no plano desta empresa." });
      separado = await reservar(db, tenantId, quantidade);
      if (!separado) return res.status(429).json({ error: `O limite de ${LIMITE_POR_DIA} empresas por dia foi atingido. Volta amanhã.`, restante: 0 });
      const r = await (buscar ?? fetch)(montarUrlBusca({ cnae, municipio, limite: separado, cursor }), { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) {
        const erro: any = await r.json().catch(() => ({}));
        console.error("[radar/cnae] apipj", r.status, String(erro?.code ?? ""));
        const restante = await encerrar(0);
        if (r.status === 429) {
          if (erro?.code === "quota_exceeded") return res.status(429).json({ error: "A cota mensal da consulta por CNAE acabou. Volta no dia 1º, ou aumente o plano da apipj.", restante });
          // Limite do minuto: a tela espera e pede de novo.
          const aguardar = Math.min(90, Math.max(5, Number(r.headers.get("retry-after")) || 60));
          return res.status(429).json({ error: "A consulta por CNAE libera poucas empresas por minuto. Tente de novo em instantes.", aguardar, restante });
        }
        return res.status(502).json({ error: MENSAGENS_APIPJ[r.status] ?? "A consulta por CNAE não respondeu como esperado.", restante });
      }
      const j: any = await r.json();
      const empresas = (Array.isArray(j?.resultados) ? j.resultados : []).map(normalizarEmpresa).slice(0, separado);
      await guardar(db, tenantId, empresas);
      const restante = await encerrar(empresas.length);
      res.json({ resultados: empresas.map(paraORadar), restante, total: Number(j?.total) || 0, proximoCursor: typeof j?.proximo_cursor === "string" ? j.proximo_cursor : null });
    } catch (e: any) {
      console.error("[radar/cnae]", e?.message);
      const restante = separado ? await encerrar(0) : undefined;
      res.status(502).json({ error: "Não foi possível consultar por CNAE agora. Tente de novo.", restante });
    }
  });
}
