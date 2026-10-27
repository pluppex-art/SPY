import { sendTenantEmail } from "./mailer.js";
import { notificationEmail, type NotificationKind } from "./emailTemplates.js";
import { getTenantBrand } from "./emailBrand.js";

// Espelha DEFAULT_NOTIFICATION_PREFS (SettingsNotificacoes.tsx): vale quando o usuário nunca mexeu
// nas preferências. O id também funciona como allowlist de quais avisos podem virar e-mail.
export const EMAIL_TRIGGER_DEFAULTS: Record<string, boolean> = {
  novo_lead: true,
  lead_distribuido: true,
  lead_esquentou: false,
  tarefa_vencida: false,
  tarefa_proxima: false,
  reuniao_confirmada: true,
  proposta_aberta: true,
  venda_fechada: true,
  pagamento_recebido: true,
};

const MAX_RECIPIENTS = 25;

interface NotifyInput {
  triggerId: string;
  title: string;
  description: string;
  kind?: NotificationKind;
  /** Caminho interno (ex.: "/app/crm/pipeline"); qualquer outra coisa é descartada. */
  linkPath?: string | null;
  /** Se informado, só esses usuários são candidatos (ex.: o vendedor responsável). */
  userIds?: string[];
}

/**
 * Manda o e-mail de um aviso do sistema pros usuários do tenant que deixaram o canal "E-mail" ligado
 * pra esse tipo de aviso (preferência do usuário, ou o padrão da tela de notificações). Nunca lança:
 * e-mail é complemento do sino, não pode derrubar a ação que gerou o aviso.
 */
export async function emailNotifyTenant(db: any, tenantId: string, baseUrl: string, n: NotifyInput): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  try {
    if (!(n.triggerId in EMAIL_TRIGGER_DEFAULTS)) return out;
    let q = db.from("users").select("id, name, email, active, is_master, preferences").eq("tenant_id", tenantId);
    if (n.userIds?.length) q = q.in("id", n.userIds);
    const { data: users } = await q.limit(200);

    const wants = (u: any) => {
      const prefs = Array.isArray(u.preferences?.notification_prefs) ? u.preferences.notification_prefs : null;
      const own = prefs?.find((p: any) => p?.id === n.triggerId);
      return typeof own?.email === "boolean" ? own.email : EMAIL_TRIGGER_DEFAULTS[n.triggerId];
    };
    const recipients = (users || [])
      .filter((u: any) => u.active !== false && !u.is_master && typeof u.email === "string" && u.email.includes("@") && wants(u))
      .slice(0, MAX_RECIPIENTS);

    const brand = await getTenantBrand(db, tenantId);
    const path = typeof n.linkPath === "string" && /^\/app\/[\w\-./?=&%]*$/.test(n.linkPath) ? n.linkPath : "";
    for (const u of recipients) {
      try {
        const mail = notificationEmail({
          kind: n.kind || "info",
          title: n.title.slice(0, 140),
          description: n.description.slice(0, 600),
          linkUrl: path ? `${baseUrl}${path}` : `${baseUrl}/app`,
          settingsUrl: `${baseUrl}/app/configuracoes/usuario/notificacoes`,
          name: u.name,
          brand,
        });
        await sendTenantEmail(db, tenantId, { to: u.email, ...mail });
        out.sent++;
      } catch (err: any) {
        out.failed++;
        console.error("[email-notify]", n.triggerId, err?.message);
      }
    }
  } catch (err: any) {
    console.error("[email-notify]", err?.message);
  }
  return out;
}
