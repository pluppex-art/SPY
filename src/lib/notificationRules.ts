/**
 * Regras de quem vê os pop-ups em tempo real (por usuário, dentro da empresa ativa).
 * Puro e sem dependências, pra poder testar sem montar o app.
 */

type RuleUser = {
  id?: string;
  isMaster?: boolean;
  isTenantAdmin?: boolean;
  preferences?: { notification_prefs?: unknown } | null;
} | null | undefined;

/** O usuário deixou o canal "Plataforma" ligado pra esse tipo de aviso? Sem preferência salva = ligado (padrão). */
export function wantsInApp(user: RuleUser, triggerId: string): boolean {
  const prefs = user?.preferences?.notification_prefs;
  if (!Array.isArray(prefs)) return true;
  const own = prefs.find((p: any) => p?.id === triggerId);
  return typeof own?.inApp === "boolean" ? own.inApp : true;
}

/**
 * Pop-up de "Novo lead": só pra quem interessa. Lead com vendedor definido avisa o próprio vendedor e os
 * administradores; lead sem vendedor (fila/SDR) avisa todos que ainda querem esse aviso.
 */
export function shouldPopupNewLead(user: RuleUser, lead: { seller_id?: string | null }): boolean {
  if (!user) return false;
  if (!wantsInApp(user, "novo_lead")) return false;
  const isAdmin = !!(user.isMaster || user.isTenantAdmin);
  if (lead.seller_id && lead.seller_id !== user.id && !isAdmin) return false;
  return true;
}

/** Notificação gravada pra uma pessoa (user_id) só aparece pra ela; sem user_id vale pra empresa toda. */
export function shouldPopupNotification(user: RuleUser, n: { user_id?: string | null }): boolean {
  if (!user) return false;
  return !n.user_id || n.user_id === user.id;
}
