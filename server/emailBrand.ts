import type { EmailBrand } from "./emailTemplates.js";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Marca (nome, cor e logo) de uma empresa, pra vestir os e-mails com a identidade dela. Vem das
 * mesmas configurações que o sistema já usa: tenants.primary_color (Empresa → Tema) e
 * app_settings.empresa_dados.logoUrl. Nunca lança — sem marca, o e-mail sai no padrão do S.P.Y.
 * Roda com service role; quem chama TEM que ter resolvido o tenant do destinatário.
 */
export async function getTenantBrand(db: any, tenantId: string | null | undefined): Promise<EmailBrand | undefined> {
  if (!tenantId) return undefined;
  try {
    const [{ data: tenant }, { data: emp }] = await Promise.all([
      db.from("tenants").select("name, primary_color").eq("id", tenantId).maybeSingle(),
      db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "empresa_dados").maybeSingle(),
    ]);
    if (!tenant) return undefined;
    const logo = typeof emp?.value?.logoUrl === "string" ? emp.value.logoUrl.trim() : "";
    return {
      name: tenant.name || null,
      color: HEX.test(tenant.primary_color || "") ? tenant.primary_color : null,
      logoUrl: /^https:\/\//i.test(logo) ? logo : null,
    };
  } catch {
    return undefined;
  }
}

/** Marca da empresa do usuário com esse e-mail (para "esqueci a senha", onde só se sabe o e-mail). */
export async function getBrandForEmail(db: any, email: string): Promise<{ brand?: EmailBrand; name?: string | null }> {
  try {
    const { data: u } = await db.from("users").select("name, tenant_id").eq("email", email).is("deleted_at", null).limit(1).maybeSingle();
    return { brand: await getTenantBrand(db, u?.tenant_id), name: u?.name };
  } catch {
    return {};
  }
}
