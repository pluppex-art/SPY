// Senha de supervisor do PDV: o gestor define uma senha por empresa (Configurações > Varejo) e o caixa precisa
// digitá-la para remover item ou cancelar a venda. Só o hash (scrypt com sal) é guardado, numa tabela sem policy
// (varejo_supervisor_senha): navegador nenhum lê isso, só estas rotas, via service_role.
// Honestidade sobre o alcance: o carrinho vive no navegador, então a senha é um controle operacional (impede o
// operador de apagar itens sem o gestor), não uma barreira contra quem controla o próprio navegador.

import type { Express } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import rateLimit from "express-rate-limit";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;

export const SENHA_MIN = 4;
export const SENHA_MAX = 64;

/** Formato guardado: "scrypt$<sal em hex>$<hash em hex>". */
export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(senha, sal, 32);
  return `scrypt$${sal.toString("hex")}$${hash.toString("hex")}`;
}

export async function senhaConfere(senha: string, guardado: string | null | undefined): Promise<boolean> {
  const [alg, salHex, hashHex] = String(guardado || "").split("$");
  if (alg !== "scrypt" || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const obtido = await scrypt(senha, Buffer.from(salHex, "hex"), esperado.length);
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
}

export function validaSenha(raw: unknown): string | null {
  if (typeof raw !== "string") return "Informe a senha.";
  if (raw.length < SENHA_MIN) return `A senha precisa ter ao menos ${SENHA_MIN} caracteres.`;
  if (raw.length > SENHA_MAX) return `A senha pode ter no máximo ${SENHA_MAX} caracteres.`;
  return null;
}

interface Deps {
  requireUser: any;
  requireTenantAdmin: any;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  supabaseService: SupabaseClient | null;
}

export function registerVarejoSupervisorRoutes(app: Express, { requireUser, requireTenantAdmin, resolveRequestedTenantId, supabaseService }: Deps) {
  // Conferir a senha é o ponto de força bruta: limite por usuário (não por IP, que numa loja é o mesmo para todo mundo).
  const verificarLimiter = rateLimit({
    windowMs: 60_000, limit: 8, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req: any) => `varejo-sup:${req.user?.id || "anon"}`,
    message: { error: "Muitas tentativas. Aguarde um minuto e tente de novo." },
  });
  const salvarLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  // A empresa já tem senha definida? (nunca devolve o hash)
  app.get("/api/varejo/supervisor-senha", requireUser, async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Banco de dados não configurado no servidor." });
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const { data, error } = await supabaseService.from("varejo_supervisor_senha").select("updated_at").eq("tenant_id", tenantId).maybeSingle();
    if (error) { console.error("[varejo/supervisor-senha GET]", error.message); return res.status(500).json({ error: "Não foi possível consultar a senha de supervisor." }); }
    res.json({ definida: !!data, atualizadaEm: data?.updated_at ?? null });
  });

  // Só administrador da empresa define ou troca.
  app.put("/api/varejo/supervisor-senha", requireUser, requireTenantAdmin, salvarLimiter, async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Banco de dados não configurado no servidor." });
    const erro = validaSenha(req.body?.senha);
    if (erro) return res.status(400).json({ error: erro });
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    try {
      const senha_hash = await hashSenha(req.body.senha);
      const { error } = await supabaseService.from("varejo_supervisor_senha")
        .upsert({ tenant_id: tenantId, senha_hash, updated_at: new Date().toISOString(), updated_by: req.user.id }, { onConflict: "tenant_id" });
      if (error) throw new Error(error.message);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[varejo/supervisor-senha PUT]", e?.message);
      res.status(500).json({ error: "Não foi possível salvar a senha de supervisor." });
    }
  });

  // O caixa digita a senha para autorizar a remoção/cancelamento.
  app.post("/api/varejo/supervisor-senha/verificar", requireUser, verificarLimiter, async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Banco de dados não configurado no servidor." });
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const senha = typeof req.body?.senha === "string" ? req.body.senha : "";
    if (!senha || senha.length > SENHA_MAX) return res.status(400).json({ error: "Informe a senha de supervisor." });
    try {
      const { data, error } = await supabaseService.from("varejo_supervisor_senha").select("senha_hash").eq("tenant_id", tenantId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return res.status(409).json({ error: "A empresa ainda não definiu a senha de supervisor.", code: "sem_senha" });
      const ok = await senhaConfere(senha, data.senha_hash);
      if (!ok) return res.status(403).json({ error: "Senha incorreta.", code: "senha_incorreta" });
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[varejo/supervisor-senha verificar]", e?.message);
      res.status(500).json({ error: "Não foi possível conferir a senha." });
    }
  });
}
