/**
 * Cria o ambiente (tenant) do cliente a partir de uma implementação COMPLETA e aciona o agente de
 * implementação (n8n) — usado quando o chatbot termina de coletar os dados (nó "Salvar dados" com
 * "criar ambiente ao concluir"). Mesmo resultado do botão "Criar ambiente do cliente" e do checkout.
 *
 * Decisões de segurança:
 *  - Nenhuma senha viaja por e-mail/WhatsApp: o admin nasce com senha aleatória que ninguém vê e o
 *    cliente recebe um LINK para definir a própria senha (igual ao checkout).
 *  - Nunca duplica: só age se a implementação ainda não tem ambiente (`linked_tenant_id` nulo). O vínculo é
 *    "reservado" com update condicional ANTES de criar o acesso e acionar o agente; quem perder a corrida
 *    desfaz o que criou. O agente só é chamado uma vez por ambiente (chamar de novo duplicaria os agentes).
 *  - Falha parcial não derruba nada: o que deu certo fica, o que falhou vai para as notas internas da implementação.
 */
import { randomBytes } from "node:crypto";
import { tenantReadiness, buildEmpresaDados } from "../src/lib/implementationTenant.js";

type Db = any;
export interface ProvisionDeps {
  db: Db;
  planIdFromLead: (leadId?: string | null) => Promise<string | null>;
  provisionPlan: (tenantId: string, planId: string, by?: string) => Promise<unknown>;
  publicAppUrl: () => string;
  /** Monta o e-mail de acesso (server/emailTemplates.ts → notificationEmail). */
  buildAccessMail: (a: { name: string; company: string; url: string; appHost: string }) => { subject: string; html: string; text?: string };
  sendEmail: (mail: { to: string; subject: string; html: string; text?: string }) => Promise<unknown>;
  fetchImpl?: typeof fetch;
}

export interface ProvisionResult {
  status: "created" | "skipped" | "failed";
  reason?: string;
  missing?: string[];
  tenantId?: string;
  emailSent?: boolean;
  agentTriggered?: boolean;
}

const DEFAULT_MODULES = { crm: true, sdr: false, advDashboard: false, financeiro: true, marketing: false, educacao: false, clinica: false, produtividade: true, rh: false, bi: false, engajamento: false };
const WEBHOOK_DEFAULT = "https://n8n.spycrm.com.br/webhook/spy-agente-implementacao-tenant-criado";

export async function provisionTenantForImplementation(deps: ProvisionDeps, implementationId: string, ownerTenantId: string): Promise<ProvisionResult> {
  const { db } = deps;
  const { data: impl } = await db.from("implementations").select("id, data, linked_tenant_id, lead_id, internal_notes").eq("id", implementationId).eq("tenant_id", ownerTenantId).maybeSingle();
  if (!impl) return { status: "failed", reason: "implementacao_nao_encontrada" };
  if (impl.linked_tenant_id) return { status: "skipped", reason: "ja_vinculada" };
  const data = impl.data || {};
  const ready = tenantReadiness(data);
  if (!ready.ready) return { status: "skipped", reason: "dados_incompletos", missing: ready.missing };

  const email = String(data.resp_email).trim().toLowerCase();
  const company = String(data.nome_fantasia).trim();
  const note = async (line: string) => {
    const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const prev = String(impl.internal_notes || "");
    await db.from("implementations").update({ internal_notes: `${prev}${prev ? "\n" : ""}[${stamp}] ${line}` }).eq("id", impl.id).eq("tenant_id", ownerTenantId);
  };

  const { data: existing } = await db.from("users").select("id").ilike("email", email).limit(1).maybeSingle();
  if (existing) { await note("Chatbot: ambiente NÃO criado — o e-mail do responsável já tem acesso no sistema. Crie manualmente com outro e-mail."); return { status: "failed", reason: "email_ja_cadastrado" }; }

  const { data: tenant, error: tErr } = await db.from("tenants").insert({
    name: company, niche: "Geral", plan: "start", status: "Active", timezone: "America/Sao_Paulo", primary_color: "#2563EB", modules: DEFAULT_MODULES,
  }).select().maybeSingle();
  if (tErr || !tenant) { await note("Chatbot: não foi possível criar o ambiente (erro ao criar a empresa)."); return { status: "failed", reason: "erro_ao_criar_empresa" }; }

  const undo = async (authId?: string | null) => {
    await db.from("implementations").update({ linked_tenant_id: null }).eq("id", impl.id).eq("linked_tenant_id", tenant.id);
    if (authId) await db.auth.admin.deleteUser(authId);
    await db.from("app_settings").delete().eq("tenant_id", tenant.id);
    await db.from("tenants").delete().eq("id", tenant.id);
  };

  // Reserva o vínculo: se outra execução já vinculou, esta desfaz o que criou e não aciona nada.
  const { data: claimed } = await db.from("implementations").update({ linked_tenant_id: tenant.id, last_synced_at: new Date().toISOString() })
    .eq("id", impl.id).eq("tenant_id", ownerTenantId).is("linked_tenant_id", null).select("id");
  if (!claimed || claimed.length === 0) { await db.from("tenants").delete().eq("id", tenant.id); return { status: "skipped", reason: "ja_vinculada" }; }

  const created = await db.auth.admin.createUser({ email, password: randomBytes(18).toString("base64url"), email_confirm: true });
  const authId: string | undefined = created.data?.user?.id;
  if (!authId) { await undo(); await note("Chatbot: ambiente NÃO criado — não foi possível criar o login (o e-mail pode já existir no Auth)."); return { status: "failed", reason: "erro_ao_criar_login" }; }

  const { error: uErr } = await db.from("users").insert({
    id: authId, tenant_id: tenant.id, name: String(data.resp_nome).trim() || `Admin ${company}`, email, role: "Admin", is_master: false, is_tenant_admin: true, active: true,
  });
  if (uErr) { await undo(authId); await note("Chatbot: ambiente NÃO criado — erro ao criar o perfil do administrador."); return { status: "failed", reason: "erro_ao_criar_perfil" }; }

  const { error: eErr } = await db.from("app_settings").insert({ tenant_id: tenant.id, key: "empresa_dados", value: buildEmpresaDados(data) });
  const problems: string[] = [];
  if (eErr) problems.push("Dados da Empresa não foram gravados no novo ambiente");

  try {
    const planId = await deps.planIdFromLead(impl.lead_id);
    if (planId) await deps.provisionPlan(tenant.id, planId);
  } catch { problems.push("o plano não foi aplicado"); }

  // E-mail: link para o cliente definir a própria senha (nunca a senha).
  let emailSent = false;
  try {
    const base = deps.publicAppUrl();
    const link = await db.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${base}/redefinir-senha` } });
    const url = link.data?.properties?.action_link;
    if (url) {
      const mail = deps.buildAccessMail({ name: String(data.resp_nome).trim(), company, url, appHost: base.replace(/^https?:\/\//, "") });
      await deps.sendEmail({ to: email, ...mail });
      emailSent = true;
    }
  } catch { /* vira aviso abaixo */ }
  if (!emailSent) problems.push(`o e-mail de acesso NÃO foi enviado (oriente o cliente a usar "Esqueci a senha" em ${email})`);

  // Agente de implementação (n8n): uma única vez, só depois do ambiente existir.
  let agentTriggered = false;
  const secret = process.env.SPY_IMPLEMENTACAO_WEBHOOK_SECRET;
  if (!secret) problems.push("o agente de implementação NÃO foi acionado (SPY_IMPLEMENTACAO_WEBHOOK_SECRET não configurada)");
  else {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    try {
      const r = await (deps.fetchImpl ?? fetch)(process.env.SPY_IMPLEMENTACAO_WEBHOOK_URL || WEBHOOK_DEFAULT, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret }, signal: ac.signal,
        body: JSON.stringify({ tenant_id: tenant.id, company, email, phone: String(data.resp_whatsapp || ""), implementation_id: impl.id }),
      });
      agentTriggered = r.ok;
      if (!r.ok) problems.push(`o agente de implementação respondeu HTTP ${r.status}`);
    } catch (e: any) {
      problems.push(e?.name === "AbortError" ? "o agente de implementação não respondeu em 6 segundos" : "falha ao chamar o agente de implementação");
    } finally { clearTimeout(timer); }
  }

  await note(problems.length
    ? `Chatbot: ambiente criado, mas ${problems.join("; ")}.`
    : "Chatbot: ambiente criado, e-mail de acesso enviado e agente de implementação acionado.");
  return { status: "created", tenantId: tenant.id, emailSent, agentTriggered };
}
