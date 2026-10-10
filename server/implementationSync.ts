import type { TenantSnapshot } from "../src/lib/implementationForm.js";

/**
 * Lê o ambiente (tenant) que o cliente já tem no SPY e devolve só o que é
 * seguro copiar pra implementação. Roda com service role, então cada leitura
 * escolhe colunas EXPLICITAMENTE:
 *  - users: nunca `password_hash` (nem `select *`); exclui usuários master
 *    (equipe da plataforma) e inativos/apagados.
 *  - app_settings: os valores vêm inteiros do banco (têm chaves/tokens), mas só
 *    ids públicos e o booleano `connected` são copiados pro snapshot — nada de
 *    apiKey/secret/token/accessToken.
 *  - whatsapp_instances: nunca `api_key`/`webhook_secret`.
 * Quem chama TEM que ter checado que o solicitante é master.
 */
export async function readTenantSnapshot(db: any, tenantId: string): Promise<TenantSnapshot | null> {
  const { data: tenant } = await db.from("tenants").select("name").eq("id", tenantId).is("deleted_at", null).maybeSingle();
  if (!tenant) return null;

  const [usersR, settingsR, waR, stagesR, agentsR] = await Promise.all([
    db.from("users").select("name, email, role, is_tenant_admin, phone")
      .eq("tenant_id", tenantId).eq("is_master", false).is("deleted_at", null).or("active.is.null,active.eq.true").limit(200),
    db.from("app_settings").select("key, value").eq("tenant_id", tenantId)
      .in("key", ["empresa_dados", "integracoes_meta_ads", "integracoes_google_ads", "integracoes_payments", "integracoes_smtp", "integracoes_maxdata"]),
    db.from("whatsapp_instances").select("phone, status").eq("tenant_id", tenantId),
    db.from("crm_pipeline_stages").select("nome, ordem").eq("tenant_id", tenantId).order("ordem", { ascending: true }).limit(100),
    db.from("aurora_agents").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("active", true),
  ]);

  const settings: Record<string, any> = {};
  for (const row of settingsR.data || []) settings[row.key] = row.value && typeof row.value === "object" ? row.value : {};
  const str = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  const emp = settings.empresa_dados || {};
  const meta = settings.integracoes_meta_ads || {};
  const google = settings.integracoes_google_ads || {};
  const pay = settings.integracoes_payments || {};
  const smtp = settings.integracoes_smtp || {};
  const maxdata = settings.integracoes_maxdata || {};

  const stageNames: string[] = [];
  for (const s of stagesR.data || []) {
    const n = str(s.nome);
    if (n && !stageNames.includes(n)) stageNames.push(n);
  }

  return {
    tenantName: tenant.name,
    empresa: { razaoSocial: str(emp.razaoSocial), nomeFantasia: str(emp.nomeFantasia), cnpj: str(emp.cnpj), endereco: str(emp.endereco), website: str(emp.website) },
    users: (usersR.data || []).map((u: any) => ({ name: str(u.name), email: str(u.email), role: str(u.role), is_tenant_admin: !!u.is_tenant_admin, phone: str(u.phone) })),
    whatsapp: (waR.data || []).map((w: any) => ({ phone: str(w.phone), connected: /^connected$/i.test(String(w.status || "")) })),
    meta: { pixelId: str(meta.pixelId), accountId: str(meta.accountId), connected: !!meta.connected },
    google: { customerId: str(google.customerId), measurementId: str(google.measurementId), connected: !!google.connected },
    payments: [
      { name: "Mercado Pago", connected: !!pay.mercadoPago?.connected },
      { name: "Stripe", connected: !!pay.stripe?.connected },
      { name: "Asaas", connected: !!pay.asaas?.connected },
    ],
    smtp: { server: str(smtp.smtpServer), user: str(smtp.smtpUser) },
    maxdata: { clientId: str(maxdata.empId), configured: !!(str(maxdata.apiUrl) && str(maxdata.apiKey)), connected: !!maxdata.connected },
    stages: stageNames,
    auroraActive: agentsR.count || 0,
  };
}
