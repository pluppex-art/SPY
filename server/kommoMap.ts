/**
 * Mapeamento Kommo → SPY, compartilhado pela importação (kommoSync) e pelo webhook ao vivo
 * (kommoWebhook): assim os dois produzem exatamente as mesmas linhas, com os mesmos ids
 * determinísticos (reimportar ou receber o mesmo evento duas vezes nunca duplica).
 */
import { createHash } from "crypto";
import {
  kommoByIds, kommoFieldValue, kommoCustomFields, kommoFieldByName,
  type KommoConn, type KommoPipeline, type KommoUser,
} from "./kommoClient.js";

export const WON = 142;
export const LOST = 143;
const COLORS = ["blue", "cyan", "indigo", "purple", "amber", "orange", "pink", "slate"];
const INTEREST_RE = /interess|produto|servi[cç]o|procura|necessidade/i;
// Campo do lead que nomeia o vendedor (ex.: "Comercial"); tem prioridade sobre o "Responsável" nativo da Kommo.
const SELLER_RE = /^\s*(comercial|vendedor|consultor|closer|atendente)\b/i;
const SOURCE_RE = /origem|fonte|source|canal|campanha|utm_source/i;

export const iso = (unix: any) => (unix ? new Date(Number(unix) * 1000).toISOString() : null);
export const clip = (v: any, n: number) => String(v ?? "").slice(0, n);
export const digits = (v: string) => v.replace(/\D/g, "");
export const funilId = (pipelineId: number) => `kommo-${pipelineId}`;
// A Kommo preenche empresas sem nome com este texto; não é um nome de verdade.
export const isPlaceholderName = (v: string) => !v.trim() || /^(\.|company name not specified)$/i.test(v.trim());

export const uuidFrom = (...parts: (string | number)[]) => {
  const h = createHash("sha1").update(parts.join(":")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
/** UUID estável a partir de tenant + id da Kommo (mesma entrada → mesmo id). */
export const leadUuid = (tenantId: string, kommoLeadId: number) => uuidFrom("kommo", tenantId, kommoLeadId);
export const productUuid = (tenantId: string, catalogId: number, elementId: number) => uuidFrom("kommo-prod", tenantId, catalogId, elementId);
export const taskUuid = (tenantId: string, taskId: number) => uuidFrom("kommo-task", tenantId, taskId);

export const brDate = (isoStr: string) =>
  new Date(isoStr).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export async function upsertChunks(sb: any, table: string, rows: any[], onConflict = "id"): Promise<string | null> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 200), { onConflict });
    if (error) return error.message;
  }
  return null;
}

export function funilRow(tenantId: string, p: KommoPipeline) {
  return {
    id: funilId(p.id),
    nome: `Kommo — ${p.name}`,
    tipo: "comercial",
    etapas: p.statuses.map((s) => s.name),
    etapas_config: p.statuses.map((s, i) => ({
      nome: s.name,
      cor: s.id === WON ? "emerald" : s.id === LOST ? "rose" : COLORS[i % COLORS.length],
      iniciarMinimizado: s.id === WON || s.id === LOST,
    })),
    ativo: true,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };
}

export type StagePlace = { idx: number; status: "Novo" | "Fechado" | "Perdido" };

/** "pipelineId:statusId" → posição da etapa no funil do SPY (e o status do lead). */
export function buildStageIndex(pipelines: KommoPipeline[]): Map<string, StagePlace> {
  const m = new Map<string, StagePlace>();
  // Lead na caixa de entrada da Kommo cai na 1ª etapa real do funil.
  for (const p of pipelines) for (const id of p.incomingIds) m.set(`${p.id}:${id}`, { idx: 0, status: "Novo" });
  for (const p of pipelines) p.statuses.forEach((s, idx) => m.set(`${p.id}:${s.id}`, {
    idx, status: s.id === WON ? "Fechado" : s.id === LOST ? "Perdido" : "Novo",
  }));
  return m;
}

/** Nome da etapa por "pipelineId:statusId" (inclui a caixa de entrada), para o histórico de mudanças. */
export function buildStatusNames(pipelines: KommoPipeline[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of pipelines) {
    for (const id of p.incomingIds) m.set(`${p.id}:${id}`, "Entrada");
    for (const s of p.statuses) m.set(`${p.id}:${s.id}`, s.name);
  }
  return m;
}

export interface LeadCtx {
  tenantId: string;
  users: Map<number, KommoUser>;
  stageIndex: Map<string, StagePlace>;
  contacts: Map<number, any>;
  companies: Map<number, any>;
  existing: Map<string, any>; // id do lead no SPY → customFields atuais (não apagar o que é local)
  vinculo: Map<string, { clientId: string; clientName: string }>; // cliente já ligado no SPY: nunca zerar
}

/** Busca contatos/empresas dos leads e o estado atual deles no SPY. Devolve o contexto parcial (sem users/stageIndex). */
export async function loadLeadContext(
  conn: KommoConn, sb: any, tenantId: string, leads: any[], extraContacts: any[] = [],
): Promise<{ contacts: Map<number, any>; companies: Map<number, any>; existing: Map<string, any>; vinculo: Map<string, { clientId: string; clientName: string }> }> {
  const contactIds = new Set<number>();
  const companyIds = new Set<number>();
  for (const l of leads) {
    for (const c of l._embedded?.contacts || []) contactIds.add(c.id);
    for (const c of l._embedded?.companies || []) companyIds.add(c.id);
  }
  const contacts = new Map<number, any>(extraContacts.filter((c) => c?.id).map((c) => [c.id, c]));
  for (const c of await kommoByIds(conn, "/contacts", "contacts", [...contactIds])) contacts.set(c.id, c);
  const companies = new Map<number, any>((await kommoByIds(conn, "/companies", "companies", [...companyIds])).map((c) => [c.id, c]));

  const existing = new Map<string, any>();
  const vinculo = new Map<string, { clientId: string; clientName: string }>();
  const ids = leads.map((l) => leadUuid(tenantId, l.id));
  for (let i = 0; i < ids.length; i += 80) { // ids na URL: lotes pequenos para não estourar o limite do PostgREST
    const { data, error } = await sb.from("leads").select("id, customFields, clientId, clientName").in("id", ids.slice(i, i + 80));
    if (error) throw new Error(`Falha ao consultar leads existentes: ${error.message}`);
    for (const r of data || []) { existing.set(r.id, r.customFields || {}); vinculo.set(r.id, { clientId: r.clientId || "", clientName: r.clientName || "" }); }
  }
  return { contacts, companies, existing, vinculo };
}

export interface BuiltLeads {
  rows: any[];
  skipped: { id: number; pipelineId: number; statusId: number }[];
  tagPairs: { leadId: string; tags: string[] }[];
}

/** Lead da Kommo → linha de `leads` do SPY. `fallbackSource` vale quando o lead não tem campo de fonte. */
export function buildLeadRows(ctx: LeadCtx, leads: any[], fallbackSource = "Não informada", extra: (l: any) => Record<string, any> = () => ({})): BuiltLeads {
  const { tenantId, users, stageIndex, contacts, companies, existing, vinculo } = ctx;
  const rows: any[] = [];
  const skipped: BuiltLeads["skipped"] = [];
  const tagPairs: BuiltLeads["tagPairs"] = [];
  for (const l of leads) {
    const place = stageIndex.get(`${l.pipeline_id}:${l.status_id}`);
    if (!place) { skipped.push({ id: l.id, pipelineId: l.pipeline_id, statusId: l.status_id }); continue; }
    const id = leadUuid(tenantId, l.id);
    const main = (l._embedded?.contacts || []).find((c: any) => c.is_main) || (l._embedded?.contacts || [])[0];
    const contact = main ? contacts.get(main.id) : null;
    const company = (l._embedded?.companies || [])[0];
    const rawCompany = company ? (companies.get(company.id)?.name || company.name || "") : "";
    const createdIso = new Date((l.created_at || Date.now() / 1000) * 1000).toISOString();
    const phone = digits(kommoFieldValue(contact, "PHONE"));
    const lossReason = l._embedded?.loss_reason?.[0]?.name ?? null;
    const tags = (l._embedded?.tags || []).map((t: any) => String(t.name)).filter(Boolean);
    if (tags.length) tagPairs.push({ leadId: id, tags });
    rows.push({
      id, tenant_id: tenantId,
      name: contact?.name || l.name || `Lead Kommo #${l.id}`,
      title: l.name || "",
      company: isPlaceholderName(rawCompany) ? "" : rawCompany,
      email: kommoFieldValue(contact, "EMAIL").toLowerCase(),
      phone,
      seller: kommoFieldByName([l], SELLER_RE) || users.get(l.responsible_user_id)?.name || "",
      source: kommoFieldByName([l, contact], SOURCE_RE) || fallbackSource,
      status: place.status,
      priority: "Média",
      value: Number(l.price) || 0,
      pipelineId: "comercial",
      stageId: `${funilId(l.pipeline_id)}-${place.idx}`,
      lead_interesse_cliente: kommoFieldByName([l, contact], INTEREST_RE),
      clientId: vinculo.get(id)?.clientId ?? "", clientName: vinculo.get(id)?.clientName ?? "",
      productIds: (l._embedded?.catalog_elements || []).map((e: any) => productUuid(tenantId, e.metadata?.catalog_id, e.id)),
      tenantName: "", scoreIA: 50,
      date: createdIso.slice(0, 10),
      created_at: createdIso,
      deleted_at: null, // um lead restaurado na Kommo volta a aparecer
      // Motivo de perda e último contato: colunas reais do lead (além de ficarem em customFields.kommo)
      ...(place.status === "Perdido" && lossReason ? { loss_reason: clip(lossReason, 255) } : {}),
      last_contact_at: iso(l.updated_at),
      customFields: {
        ...(existing.get(id) || {}),
        kommo: {
          leadId: l.id, pipelineId: l.pipeline_id, statusId: l.status_id,
          contactId: main?.id ?? null, companyId: company?.id ?? null,
          lossReason, tags,
          lastContactAt: iso(l.updated_at), closedAt: iso(l.closed_at),
          fields: { ...kommoCustomFields(contact), ...kommoCustomFields(l) },
          syncedAt: new Date().toISOString(),
          ...extra(l),
        },
      },
    });
  }
  return { rows, skipped, tagPairs };
}

/**
 * Tags da Kommo → tabelas `tags` e `lead_tags` do SPY (além de ficarem em customFields.kommo.tags).
 * Cria só as tags que faltam (por nome, sem diferenciar maiúsculas) e liga cada lead às dele.
 * Devolve uma mensagem de erro (ou null) — falhar aqui nunca derruba a importação do lead.
 */
export async function syncLeadTags(sb: any, tenantId: string, pairs: { leadId: string; tags: string[] }[], extraNames: string[] = []): Promise<{ error: string | null; links: number }> {
  const names = [...new Set([...pairs.flatMap((p) => p.tags), ...extraNames].map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) return { error: null, links: 0 };
  const byName = new Map<string, string>();
  const load = async () => {
    for (let i = 0; i < names.length; i += 60) {
      const { data, error } = await sb.from("tags").select("id, name").eq("tenant_id", tenantId).in("name", names.slice(i, i + 60));
      if (error) return error.message;
      for (const t of data || []) byName.set(String(t.name).toLowerCase(), t.id);
    }
    return null;
  };
  let err = await load();
  if (err) return { error: `tags: ${err}`, links: 0 };
  const missing = names.filter((n) => !byName.has(n.toLowerCase()));
  if (missing.length) {
    const { error } = await sb.from("tags").insert(missing.map((name) => ({ tenant_id: tenantId, name: clip(name, 100) })));
    if (error && error.code !== "23505") return { error: `tags: ${error.message}`, links: 0 };
    err = await load();
    if (err) return { error: `tags: ${err}`, links: 0 };
  }
  const links = pairs.flatMap((p) => p.tags.map((t) => ({ lead_id: p.leadId, tag_id: byName.get(t.trim().toLowerCase()), tenant_id: tenantId })).filter((r) => r.tag_id));
  for (let i = 0; i < links.length; i += 200) {
    const { error } = await sb.from("lead_tags").upsert(links.slice(i, i + 200), { onConflict: "lead_id,tag_id", ignoreDuplicates: true });
    if (error) return { error: `lead_tags: ${error.message}`, links: i };
  }
  return { error: null, links: links.length };
}

/** Nota/ligação da Kommo → linha de `lead_activities`, mantendo o conteúdo como está na Kommo. */
export function noteRow(tenantId: string, n: any, users: Map<number, KommoUser>) {
  const t8 = tenantId.slice(0, 8);
  const p = n.params || {};
  const text = String(p.text ?? p.comment ?? "").trim();
  const kind = String(n.note_type || "common");
  const call = /^call/.test(kind);
  const titulo = kind === "common" ? "Comentário"
    : kind === "call_in" ? "Ligação recebida" : kind === "call_out" ? "Ligação realizada"
    : /^sms/.test(kind) ? "SMS" : /mail/.test(kind) ? "E-mail"
    : /service_message/.test(kind) ? "Mensagem do sistema" : kind === "geolocation" ? "Localização"
    : kind === "attachment" ? "Anexo" : `Kommo: ${kind}`;
  const detalhes = [
    p.phone ? `Telefone: ${p.phone}` : "", p.duration ? `Duração: ${p.duration}s` : "",
    p.call_result ? `Resultado: ${p.call_result}` : "", p.link ? `Gravação: ${p.link}` : "",
    p.file_name ? `Arquivo: ${p.file_name}` : "",
  ].filter(Boolean).join("\n");
  const when = iso(n.created_at) || new Date().toISOString();
  return {
    id: `kommo-note-${t8}-${n.id}`, tenant_id: tenantId, lead_id: leadUuid(tenantId, n.entity_id),
    type: call ? "Ligação" : /mail/.test(kind) ? "E-mail" : "Outro",
    title: clip(titulo, 255),
    description: [text, detalhes].filter(Boolean).join("\n\n"),
    date: brDate(when),
    seller: n.created_by ? (users.get(n.created_by)?.name || "Kommo") : "Kommo",
    created_at: when,
  };
}

/** Tarefa da Kommo → linha de `tasks`. `leadExists` evita violar a FK quando o lead ainda não foi importado. */
export function taskRow(tenantId: string, t: any, users: Map<number, KommoUser>, spyByEmail: Map<string, string>, leadExists: (id: string) => boolean) {
  const lid = leadUuid(tenantId, t.entity_id);
  const email = users.get(t.responsible_user_id)?.email;
  const text = String(t.text || "").trim();
  return {
    id: taskUuid(tenantId, t.id), tenant_id: tenantId, lead_id: leadExists(lid) ? lid : null,
    assigned_to: (email && spyByEmail.get(email)) || null,
    title: clip(text.split("\n")[0] || "Tarefa da Kommo", 255), description: text || null,
    status: t.is_completed ? "Done" : "To Do", priority: "Medium",
    due_date: iso(t.complete_till), completed_at: t.is_completed ? iso(t.updated_at) : null,
    created_at: iso(t.created_at) || undefined,
  };
}

/** Todos os valores de um campo (ex.: vários telefones/e-mails do contato), na ordem da Kommo. */
export function allValues(entity: any, code: string): string[] {
  const f = (entity?.custom_fields_values || []).find((c: any) => c.field_code === code);
  return ((f?.values || []) as any[]).map((v) => String(v?.value ?? "").trim()).filter(Boolean);
}
