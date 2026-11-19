/**
 * Envio de SMS pelas credenciais que a empresa cadastrou em Integrações (Twilio ou Zenvia). Usado pelos Gatilhos de mensagem
 * (canal SMS) depois que uma pessoa aprova a lista e o texto. Não grava nada; cada chamada envia uma mensagem.
 */

/** Telefone brasileiro → formato internacional (+55…). Devolve "" se não parecer um celular/telefone válido. */
export function telefoneE164(raw: unknown): string {
  const original = String(raw ?? "").trim();
  let d = original.replace(/\D/g, "").replace(/^0+/, "");
  if (original.startsWith("+") && !d.startsWith("55")) return ""; // número de outro país: este envio é só para o Brasil
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!/^55\d{10,11}$/.test(d)) return "";
  return `+${d}`;
}

export type CredencialSms = { provedor: "twilio"; accountSid: string; authToken: string; from: string } | { provedor: "zenvia"; apiToken: string; from: string };

/** Lê as credenciais cadastradas (Twilio tem prioridade). `null` se nenhuma estiver completa. */
export function credencialDeSms(catalogo: any): CredencialSms | null {
  const tw = catalogo?.twilio;
  if (tw?.accountSid && tw?.authToken && tw?.fromNumber) return { provedor: "twilio", accountSid: String(tw.accountSid).trim(), authToken: String(tw.authToken).trim(), from: String(tw.fromNumber).trim() };
  const zv = catalogo?.zenvia;
  if (zv?.apiToken && zv?.sender) return { provedor: "zenvia", apiToken: String(zv.apiToken).trim(), from: String(zv.sender).trim() };
  return null;
}

/** Monta a chamada HTTP do provedor (separado do envio para poder testar sem rede). */
export function montarRequisicaoSms(c: CredencialSms, para: string, texto: string): { url: string; init: RequestInit } {
  const corpo = String(texto).slice(0, 450);
  if (c.provedor === "twilio") {
    return {
      url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}/Messages.json`,
      init: { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: para, From: c.from, Body: corpo }).toString() },
    };
  }
  return {
    url: "https://api.zenvia.com/v2/channels/sms/messages",
    init: { method: "POST", headers: { "X-API-TOKEN": c.apiToken, "Content-Type": "application/json" }, body: JSON.stringify({ from: c.from, to: para.replace(/^\+/, ""), contents: [{ type: "text", text: corpo }] }) },
  };
}

const MAX_POR_EXECUCAO = 200;

/** Envia o mesmo texto (com {{primeiro_nome}}) para os leads da empresa que têm telefone válido. */
export async function enviarSmsParaLeads(db: any, tenantId: string, leadIds: string[], texto: string): Promise<{ enviados: number; falhas: number; semTelefone: number; acimaDoLimite: number; erro?: string }> {
  const { data: s } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_catalogo").maybeSingle();
  const cred = credencialDeSms(s?.value);
  if (!cred) return { enviados: 0, falhas: 0, semTelefone: 0, acimaDoLimite: 0, erro: "Cadastre o Twilio ou a Zenvia em Configurações → Integrações para enviar SMS." };
  const ids = Array.from(new Set(leadIds.map(String))).slice(0, 1000);
  const { data: leads } = await db.from("leads").select("id, name, phone, mobile_wa").eq("tenant_id", tenantId).is("deleted_at", null).in("id", ids);
  const vistos = new Set<string>();
  const alvos: { tel: string; nome: string }[] = [];
  let semTelefone = 0;
  for (const l of leads || []) {
    const tel = telefoneE164(l.mobile_wa || l.phone);
    if (!tel || !/^\+55\d{2}9\d{8}$/.test(tel)) { semTelefone++; continue; } // telefone fixo não recebe SMS
    if (vistos.has(tel)) continue;
    vistos.add(tel);
    alvos.push({ tel, nome: String(l.name || "").trim().split(/\s+/)[0] || "" });
  }
  let enviados = 0, falhas = 0;
  const lista = alvos.slice(0, MAX_POR_EXECUCAO);
  // Em grupos de 10 ao mesmo tempo: 200 envios em fila, com até 10 s cada, estourariam o tempo da função.
  for (let i = 0; i < lista.length; i += 10) {
    await Promise.all(lista.slice(i, i + 10).map(async (a) => {
      try {
        const msg = String(texto).replace(/\{\{\s*primeiro_nome\s*\}\}/gi, a.nome);
        const { url, init } = montarRequisicaoSms(cred, a.tel, msg);
        const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
        if (r.ok) enviados++; else falhas++;
      } catch { falhas++; }
    }));
  }
  return { enviados, falhas, semTelefone, acimaDoLimite: Math.max(0, alvos.length - MAX_POR_EXECUCAO) };
}
