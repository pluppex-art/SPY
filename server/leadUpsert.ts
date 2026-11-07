// Entrada de leads vinda de fora (checkout, formulario do site): NUNCA duplica e SEMPRE cai na etapa certa.
//  * se o telefone (ou e-mail) ja existe no sistema, o lead existente e so ATUALIZADO (campos vazios preenchidos,
//    nota nova, e a etapa so avanca — nunca volta);
//  * lead novo entra na etapa que combina com o momento (entrada / proposta enviada / ganho), nao tudo em "Novo Lead".
// Etapas vem do funil comercial ativo da empresa (crm_funis), reconhecidas pelo NOME; ids seguem getStageId.

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStageId } from "../src/lib/funnelIds.js";

export type Papel = "entrada" | "proposta" | "ganho";

export type Etapa = { stageId: string; pipelineId: "comercial"; status: string; funilId: string; indice: number; nome: string };

/** Todas as formas de escrever o mesmo numero: com/sem 55 e com/sem o 9 depois do DDD. */
export function phoneVariants(raw: unknown): string[] {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10) return d.length >= 8 ? [d] : [];
  const out = new Set<string>([d]);
  if (d.length === 11 && d[2] === "9") out.add(d.slice(0, 2) + d.slice(3));
  if (d.length === 10) out.add(d.slice(0, 2) + "9" + d.slice(2));
  for (const v of [...out]) out.add("55" + v);
  return [...out];
}

const REGEX: Record<Papel, RegExp[]> = {
  entrada: [/novo/i],
  proposta: [/proposta/i, /negocia/i, /follow/i],
  ganho: [/ganh[oa]/i, /fechad/i],
};

function statusDaEtapa(nome: string): string {
  const n = nome.toLowerCase();
  if (n.includes("ganh") || n.includes("fechad")) return "Fechado";
  if (n.includes("desqualific")) return "Desqualificado";
  if (n.includes("perdid")) return "Perdido";
  return /novo/.test(n) ? "Novo" : "Em Aberto";
}

async function funilComercial(db: SupabaseClient, tenantId: string): Promise<{ id: string; nomes: string[] } | null> {
  const { data } = await db.from("crm_funis").select("id,tipo,etapas,etapas_config,ativo,created_at")
    .eq("tenant_id", tenantId).like("tipo", "comercial%").order("created_at", { ascending: true }).limit(10);
  const f = (data || []).find((x: any) => x.ativo !== false && !String(x.tipo).includes("arquivado")) as any;
  if (!f) return null;
  const nomes: string[] = Array.isArray(f.etapas_config) && f.etapas_config.length > 0 ? f.etapas_config.map((e: any) => String(e.nome)) : (Array.isArray(f.etapas) ? f.etapas.map(String) : []);
  return nomes.length ? { id: f.id, nomes } : null;
}

/** Etapa do funil comercial da empresa que combina com o papel; sem funil, cai no padrao (status sem etapa). */
export async function etapaPorPapel(db: SupabaseClient, tenantId: string, papel: Papel): Promise<Etapa | null> {
  const f = await funilComercial(db, tenantId);
  if (!f) return null;
  let indice = -1;
  for (const re of REGEX[papel]) { indice = f.nomes.findIndex((n) => re.test(n)); if (indice >= 0) break; }
  if (indice < 0) indice = papel === "ganho" ? -1 : 0;
  if (indice < 0) return null;
  return { stageId: getStageId(f.id, indice), pipelineId: "comercial", status: statusDaEtapa(f.nomes[indice]), funilId: f.id, indice, nome: f.nomes[indice] };
}

/** Acrescenta uma nota na lista de notas do lead (o app guarda as notas como JSON; texto antigo vira a primeira nota). */
export function comNota(atual: unknown, texto: string, autor = "Sistema"): string {
  let lista: any[] = [];
  const s = typeof atual === "string" ? atual.trim() : "";
  if (s) {
    try { const j = JSON.parse(s); lista = Array.isArray(j) ? j : []; if (!Array.isArray(j)) throw new Error(); }
    catch { lista = [{ id: randomUUID(), text: s, author: "Sistema", createdAt: new Date().toISOString(), category: "geral" }]; }
  }
  lista.unshift({ id: randomUUID(), text: texto, author: autor, createdAt: new Date().toISOString(), category: "geral" });
  return JSON.stringify(lista);
}

/** O lead so avanca no funil: nunca volta de uma etapa mais adiantada (reabre os que estavam perdidos/desqualificados). */
function devePassar(lead: any, alvo: Etapa): boolean {
  if (lead.status === "Fechado") return false;
  if (lead.status === "Perdido" || lead.status === "Desqualificado") return true;
  if (!lead.stageId) return true;
  const prefixo = `${alvo.funilId}-`;
  if (!String(lead.stageId).startsWith(prefixo)) return alvo.status === "Fechado";
  const atual = Number(String(lead.stageId).slice(prefixo.length));
  return Number.isFinite(atual) ? atual < alvo.indice : true;
}

export type EntradaLead = {
  name: string; email?: string; phone?: string; company?: string; cnpj?: string; source: string;
  value?: number; nota: string; papel: Papel; priority?: string; scoreIA?: number;
};

const COLS = "id,name,email,phone,company,cnpj,status,stageId,pipelineId,notes,value,deleted_at";

/** Acha o lead da empresa pelo telefone (qualquer escrita do numero, inclusive pessoa extra do card) e, se nao, pelo e-mail. */
export async function acharLead(db: SupabaseClient, tenantId: string, phone?: string, email?: string): Promise<any | null> {
  const vs = phoneVariants(phone);
  if (vs.length) {
    const { data } = await db.from("leads").select(COLS).eq("tenant_id", tenantId).is("deleted_at", null).in("phone_digits", vs).order("created_at", { ascending: true }).limit(1);
    if (data?.[0]) return data[0];
    const { data: c } = await db.from("lead_contatos").select("lead_id").eq("tenant_id", tenantId).in("phone_digits", vs).limit(1);
    if (c?.[0]?.lead_id) {
      const { data: l } = await db.from("leads").select(COLS).eq("id", c[0].lead_id).is("deleted_at", null).maybeSingle();
      if (l) return l;
    }
  }
  const mail = String(email || "").trim().toLowerCase();
  if (mail) {
    const { data } = await db.from("leads").select(COLS).eq("tenant_id", tenantId).is("deleted_at", null).ilike("email", mail).order("created_at", { ascending: true }).limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

/** Cria o lead ou atualiza o que ja existe. Devolve o id e se foi criado agora. */
export async function upsertLead(db: SupabaseClient, tenantId: string, e: EntradaLead): Promise<{ id: string; criado: boolean }> {
  const etapa = await etapaPorPapel(db, tenantId, e.papel);
  const existente = await acharLead(db, tenantId, e.phone, e.email);

  if (existente) {
    const upd: Record<string, any> = { notes: comNota(existente.notes, e.nota), updated_at: new Date().toISOString() };
    if (!existente.email && e.email) upd.email = e.email;
    if (!existente.company && e.company) upd.company = e.company;
    if (!existente.cnpj && e.cnpj) upd.cnpj = e.cnpj;
    if (!existente.phone && e.phone) upd.phone = e.phone;
    if (e.value && (!existente.value || e.papel === "ganho")) upd.value = e.value;
    if (etapa && devePassar(existente, etapa)) { upd.stageId = etapa.stageId; upd.pipelineId = etapa.pipelineId; upd.status = etapa.status; }
    else if (!etapa && e.papel === "ganho") upd.status = "Fechado";
    await db.from("leads").update(upd).eq("id", existente.id);
    return { id: existente.id, criado: false };
  }

  const id = randomUUID();
  const { error } = await db.from("leads").insert({
    id, tenant_id: tenantId, name: e.name.slice(0, 200), email: e.email || "", phone: e.phone || "", company: e.company || "", cnpj: e.cnpj || "",
    source: e.source, status: etapa?.status ?? (e.papel === "ganho" ? "Fechado" : "Novo"), stageId: etapa?.stageId ?? "", pipelineId: etapa?.pipelineId ?? "comercial",
    priority: e.priority ?? "Média", value: e.value ?? 0, scoreIA: e.scoreIA ?? 50,
    notes: comNota("", e.nota), date: new Date().toISOString().split("T")[0],
  });
  if (error) throw new Error(error.message);
  return { id, criado: true };
}

/** Atualiza um lead ja conhecido (pelo id): nota + avanco de etapa. */
export async function atualizarLeadPorId(db: SupabaseClient, tenantId: string, leadId: string, papel: Papel, nota: string, value?: number): Promise<void> {
  const { data: l } = await db.from("leads").select(COLS).eq("id", leadId).maybeSingle();
  if (!l) return;
  const etapa = await etapaPorPapel(db, tenantId, papel);
  const upd: Record<string, any> = { notes: comNota(l.notes, nota), updated_at: new Date().toISOString() };
  if (value) upd.value = value;
  if (etapa && devePassar(l, etapa)) { upd.stageId = etapa.stageId; upd.pipelineId = etapa.pipelineId; upd.status = etapa.status; }
  else if (!etapa && papel === "ganho") upd.status = "Fechado";
  await db.from("leads").update(upd).eq("id", leadId);
}
