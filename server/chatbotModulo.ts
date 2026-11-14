/** O chatbot é um agente vendido à parte: só tenants com o módulo "chatbot" ligado podem usá-lo (conectar WhatsApp, iniciar implementação). */
export async function tenantTemChatbot(db: any, tenantId: string): Promise<boolean> {
  const { data } = await db.from("tenants").select("modules").eq("id", tenantId).maybeSingle();
  return data?.modules?.chatbot === true;
}

export const MSG_SEM_CHATBOT = "O chatbot não está contratado nesta empresa. Fale com a equipe do SPY para ativar o módulo.";
