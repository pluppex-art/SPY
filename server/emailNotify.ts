import { sendTenantEmail } from "./mailer.js";
import { notificationEmail, type NotificationKind } from "./emailTemplates.js";
import { getTenantBrand } from "./emailBrand.js";

// Espelha DEFAULT_NOTIFICATION_PREFS (SettingsNotificacoes.tsx): vale quando o usuário nunca mexeu
// nas preferências. O id também funciona como allowlist de quais avisos podem virar e-mail.
export const EMAIL_TRIGGER_DEFAULTS: Record<string, boolean> = {
  novo_lead: true,
  lead_distribuido: true,
  lead_esquentou: true,
  tarefa_vencida: true,
  tarefa_proxima: true,
  reuniao_confirmada: true,
  proposta_aberta: true,
  venda_fechada: true,
  pagamento_recebido: true,
  agente_secreto_desconectado: true,
};

const MAX_RECIPIENTS = 25;

/**
 * Link do WhatsApp (wa.me) a partir do telefone do lead. Aceita número com máscara; sem DDI assume
 * Brasil (55). Devolve null se não parecer um telefone — melhor sem botão do que um link quebrado.
 */
export function whatsappUrl(phone: unknown): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  let n = digits.replace(/^0+/, "");
  if (n.length === 10 || n.length === 11) n = `55${n}`;
  if (!/^\d{12,13}$/.test(n)) return null;
  return `https://wa.me/${n}`;
}

/** "(63) 99117-8242" a partir de dígitos brasileiros; devolve o texto original se não casar. */
export function formatPhoneBR(phone: unknown): string {
  const d = String(phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(phone ?? "").trim();
}

interface NotifyInput {
  /** Id do tipo na tela de Preferências de Notificação (define quem recebe). */
  triggerId: string;
  /** Texto do e-mail (chave de NOTIFICATION_COPY). Padrão: o próprio triggerId. */
  copyKey?: string;
  title: string;
  description: string;
  kind?: NotificationKind;
  /** Caminho interno (ex.: "/app/crm/pipeline"); qualquer outra coisa é descartada. */
  linkPath?: string | null;
  /** Se informado, só esses usuários são candidatos (ex.: o vendedor responsável). */
  userIds?: string[];
  /** Idem, por e-mail (ex.: o closer de uma reunião). */
  emails?: string[];
  /** Só administradores da empresa (ex.: avisos financeiros). */
  adminsOnly?: boolean;
  /** Dados em destaque no cartão do e-mail (ex.: nome do lead, empresa). */
  details?: { label: string; value: string }[];
  /** Telefone do lead: vira o botão principal "Chamar no WhatsApp" (abre a conversa direto). */
  phone?: string | null;
  /** Botão principal com link externo https (ex.: "Entrar na reunião"). */
  externalButton?: { label: string; url: string };
  /** Chave de controle: o mesmo aviso (ex.: "tarefa_vencida:<id>") nunca é enviado duas vezes. */
  dedupeKey?: string;
}

/**
 * Manda o e-mail de um aviso do sistema pros usuários do tenant que deixaram o canal "E-mail" ligado
 * pra esse tipo de aviso (preferência do usuário, ou o padrão da tela de notificações). Nunca lança:
 * e-mail é complemento do sino, não pode derrubar a ação que gerou o aviso.
 */
export async function emailNotifyTenant(db: any, tenantId: string, baseUrl: string, n: NotifyInput): Promise<{ sent: number; failed: number; skipped?: boolean }> {
  const out: { sent: number; failed: number; skipped?: boolean } = { sent: 0, failed: 0 };
  try {
    if (!(n.triggerId in EMAIL_TRIGGER_DEFAULTS)) return out;

    if (n.dedupeKey) {
      const { data: seen } = await db.from("notification_email_log").select("dedupe_key").eq("tenant_id", tenantId).eq("dedupe_key", n.dedupeKey).maybeSingle();
      if (seen) return { ...out, skipped: true };
    }

    let q = db.from("users").select("id, name, email, active, is_master, is_tenant_admin, preferences").eq("tenant_id", tenantId);
    if (n.userIds?.length) q = q.in("id", n.userIds);
    if (n.emails?.length) q = q.in("email", n.emails.map((e) => e.toLowerCase()));
    const { data: users } = await q.limit(200);

    const wants = (u: any) => {
      const prefs = Array.isArray(u.preferences?.notification_prefs) ? u.preferences.notification_prefs : null;
      const own = prefs?.find((p: any) => p?.id === n.triggerId);
      return typeof own?.email === "boolean" ? own.email : EMAIL_TRIGGER_DEFAULTS[n.triggerId];
    };
    const recipients = (users || [])
      .filter((u: any) => u.active !== false && !u.is_master && typeof u.email === "string" && u.email.includes("@") && wants(u) && (!n.adminsOnly || u.is_tenant_admin))
      .slice(0, MAX_RECIPIENTS);

    const brand = await getTenantBrand(db, tenantId);
    const path = typeof n.linkPath === "string" && /^\/app\/[\w\-./?=&%]*$/.test(n.linkPath) ? n.linkPath : "";
    const linkUrl = path ? `${baseUrl}${path}` : `${baseUrl}/app`;
    const wa = whatsappUrl(n.phone);
    const external = n.externalButton && /^https:\/\//i.test(n.externalButton.url) ? n.externalButton : undefined;
    const primaryButton = wa ? { label: "Chamar no WhatsApp", url: wa } : external;
    const details = [...(n.details || [])];
    if (wa && n.phone) details.push({ label: "WhatsApp", value: formatPhoneBR(n.phone) });

    for (const u of recipients) {
      try {
        const mail = notificationEmail({
          kind: n.kind || "info",
          copyKey: n.copyKey || n.triggerId,
          title: n.title.slice(0, 140),
          description: n.description.slice(0, 600),
          details,
          linkUrl,
          primaryButton,
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

    // Marca como tratado se saiu e-mail ou se ninguém quer receber (não reprocessar); se TUDO falhou, tenta de novo na próxima rodada.
    if (n.dedupeKey && (out.sent > 0 || recipients.length === 0)) {
      await db.from("notification_email_log").upsert({ tenant_id: tenantId, dedupe_key: n.dedupeKey }, { onConflict: "tenant_id,dedupe_key", ignoreDuplicates: true });
    }
  } catch (err: any) {
    console.error("[email-notify]", err?.message);
  }
  return out;
}
