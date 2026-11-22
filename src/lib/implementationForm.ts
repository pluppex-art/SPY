/**
 * Definição do formulário de implantação (CRM > Implementações). Vive no
 * código — as respostas ficam em `implementations.data` (jsonb) chaveadas
 * por `field.id`, então adicionar/renomear campo aqui não exige migração.
 *
 * NUNCA pedir senha/token de acesso neste formulário: integrações registram
 * só STATUS e identificadores públicos (ID do pixel, número...). Acesso é
 * concedido na própria plataforma (ex.: Business Manager), não digitado aqui.
 */

export type ImplFieldType = "text" | "textarea" | "select" | "boolean" | "date";
/** `client` = o cliente pode preencher pelo link público (Etapa 2); `internal` = só a equipe. */
export type ImplAudience = "client" | "internal";
/** Como o campo conta pro progresso: `answered` = preenchido; `status` = Concluída/Não se aplica; `check` = marcado. Sem `track` não conta. */
export type ImplTrack = "answered" | "status" | "check";

export interface ImplField {
  id: string;
  label: string;
  type: ImplFieldType;
  audience: ImplAudience;
  options?: string[];
  help?: string;
  placeholder?: string;
  track?: ImplTrack;
  /** Subtítulo exibido quando muda de um campo pro outro dentro da seção. */
  group?: string;
  /** Consulta pública que preenche este campo e os vizinhos (CNPJ → Receita, CEP → endereço). */
  lookup?: "cnpj" | "cep";
}

export interface ImplSection {
  id: string;
  title: string;
  description: string;
  fields: ImplField[];
}

export const INTEGRATION_STATUS_OPTIONS = ["Pendente", "Em andamento", "Concluída", "Não se aplica"];

export const IMPLEMENTATION_STATUSES = ["Em andamento", "Aguardando cliente", "Bloqueada", "Concluída"] as const;
export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];

export const IMPLEMENTATION_STATUS_TONE: Record<ImplementationStatus, string> = {
  "Em andamento": "bg-blue-500/10 text-blue-500 border-blue-500/30",
  "Aguardando cliente": "bg-amber-500/10 text-amber-500 border-amber-500/30",
  Bloqueada: "bg-rose-500/10 text-rose-500 border-rose-500/30",
  "Concluída": "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
};

const statusField = (id: string, label: string, group?: string): ImplField => ({
  id, label, type: "select", options: INTEGRATION_STATUS_OPTIONS, audience: "internal", track: "status", group,
});

export const IMPLEMENTATION_SECTIONS: ImplSection[] = [
  {
    id: "empresa",
    title: "Dados da empresa",
    description: "Quem é o cliente e como a operação funciona hoje.",
    fields: [
      { id: "razao_social", label: "Razão social", type: "text", audience: "client", track: "answered" },
      { id: "nome_fantasia", label: "Nome fantasia", type: "text", audience: "client" },
      { id: "cnpj", label: "CNPJ", type: "text", audience: "client", track: "answered", lookup: "cnpj", help: "Digite o CNPJ e clique em Buscar: razão social, nome fantasia, endereço e CEP são atualizados com os dados da Receita (o segmento só é preenchido se estiver vazio)." },
      { id: "segmento", label: "Segmento de atuação", type: "text", audience: "client", track: "answered" },
      { id: "site", label: "Site / Instagram", type: "text", audience: "client" },
      { id: "cep", label: "CEP", type: "text", audience: "client", lookup: "cep", placeholder: "00000-000" },
      { id: "endereco", label: "Endereço", type: "text", audience: "client" },
      { id: "faixa_colaboradores", label: "Nº de colaboradores", type: "select", options: ["1–5", "6–20", "21–50", "51–200", "200+"], audience: "client" },
      { id: "operacao_descricao", label: "Como a operação funciona hoje?", type: "textarea", audience: "client", track: "answered", help: "Do primeiro contato do cliente até a entrega/cobrança." },
    ],
  },
  {
    id: "responsaveis",
    title: "Responsáveis",
    description: "Quem fala com a gente e quem valida o go-live.",
    fields: [
      { id: "resp_nome", label: "Responsável principal", type: "text", audience: "client", track: "answered" },
      { id: "resp_cargo", label: "Cargo", type: "text", audience: "client" },
      { id: "resp_whatsapp", label: "WhatsApp", type: "text", audience: "client", track: "answered" },
      { id: "resp_email", label: "E-mail", type: "text", audience: "client", track: "answered" },
      { id: "tec_nome", label: "Responsável técnico", type: "text", audience: "client", help: "Quem gerencia domínio, DNS e contas de anúncio." },
      { id: "tec_contato", label: "Contato do responsável técnico", type: "text", audience: "client" },
      { id: "decisor_nome", label: "Sócio/decisor que valida o go-live", type: "text", audience: "client" },
    ],
  },
  {
    id: "comercial",
    title: "Comercial",
    description: "Como o time vende e o que precisa entrar configurado no SPY.",
    fields: [
      { id: "qtd_usuarios", label: "Quantos usuários vão usar o sistema?", type: "text", audience: "client", track: "answered" },
      { id: "usuarios_lista", label: "Usuários (nome, e-mail e perfil)", type: "textarea", audience: "client", help: "Um por linha. Ex.: Maria — maria@empresa.com — Vendedora" },
      { id: "etapas_funil", label: "Etapas do funil de vendas", type: "textarea", audience: "client", track: "answered", help: "Ex.: Novo lead → Qualificado → Proposta → Fechado" },
      { id: "origens_leads", label: "De onde vêm os leads hoje?", type: "textarea", audience: "client" },
      { id: "meta_mensal", label: "Meta mensal de vendas", type: "text", audience: "client" },
      { id: "importar_base", label: "Tem base de clientes/leads pra importar?", type: "boolean", audience: "client" },
      { id: "importar_base_origem", label: "Onde está essa base? (planilha, outro Vendas…)", type: "text", audience: "client" },
    ],
  },
  {
    id: "integracoes",
    title: "Integrações",
    description: "Cada integração tem o que o cliente informa e o status que a equipe controla. Não colocar senhas aqui.",
    fields: [
      { id: "whats_usa", label: "Vai usar WhatsApp?", type: "boolean", audience: "client", group: "WhatsApp" },
      { id: "whats_numero", label: "Número que será conectado", type: "text", audience: "client", group: "WhatsApp" },
      { id: "whats_tipo", label: "Tipo de conta", type: "select", options: ["WhatsApp Business (app)", "API oficial (Meta)", "Ainda não sei"], audience: "client", group: "WhatsApp" },
      statusField("whats_status", "Status da integração", "WhatsApp"),

      { id: "meta_usa", label: "Investe em Meta Ads (Facebook/Instagram)?", type: "boolean", audience: "client", group: "Meta Ads" },
      { id: "meta_conta_id", label: "ID da conta de anúncios", type: "text", audience: "client", group: "Meta Ads" },
      { id: "meta_pixel_id", label: "ID do Pixel", type: "text", audience: "client", group: "Meta Ads" },
      { id: "meta_acesso", label: "Já concedeu acesso no Business Manager?", type: "boolean", audience: "client", group: "Meta Ads" },
      statusField("meta_status", "Status da integração", "Meta Ads"),

      { id: "google_usa", label: "Investe em Google Ads / usa GA4?", type: "boolean", audience: "client", group: "Google Ads / GA4" },
      { id: "google_ads_id", label: "ID da conta Google Ads", type: "text", audience: "client", group: "Google Ads / GA4" },
      { id: "google_ga4_id", label: "ID da propriedade GA4", type: "text", audience: "client", group: "Google Ads / GA4" },
      { id: "google_acesso", label: "Já concedeu acesso?", type: "boolean", audience: "client", group: "Google Ads / GA4" },
      statusField("google_status", "Status da integração", "Google Ads / GA4"),

      { id: "pag_gateway", label: "Gateway de pagamento", type: "select", options: ["Mercado Pago", "Stripe", "Asaas", "Outro", "Nenhum"], audience: "client", group: "Pagamentos" },
      { id: "pag_conta_criada", label: "A conta no gateway já existe?", type: "boolean", audience: "client", group: "Pagamentos" },
      statusField("pag_status", "Status da integração", "Pagamentos"),

      { id: "email_usa", label: "Vai enviar e-mails pelo sistema?", type: "boolean", audience: "client", group: "E-mail (SMTP)" },
      { id: "email_provedor", label: "Provedor de e-mail", type: "text", audience: "client", group: "E-mail (SMTP)" },
      { id: "email_remetente", label: "E-mail remetente", type: "text", audience: "client", group: "E-mail (SMTP)" },
      statusField("email_status", "Status da integração", "E-mail (SMTP)"),

      { id: "dominio", label: "Domínio", type: "text", audience: "client", group: "Domínio / Site" },
      { id: "dominio_dns_por", label: "Quem gerencia o DNS?", type: "text", audience: "client", group: "Domínio / Site" },
      statusField("dominio_status", "Status da integração", "Domínio / Site"),

      { id: "agenda_usa", label: "Usa Google Calendar pra agendar reuniões?", type: "boolean", audience: "client", group: "Agenda" },
      statusField("agenda_status", "Status da integração", "Agenda"),

      { id: "maxdata_usa", label: "Vai usar a base Max Data?", type: "boolean", audience: "client", group: "Max Data" },
      { id: "maxdata_id", label: "ID da empresa no Max Data (empId)", type: "text", audience: "client", group: "Max Data" },
      statusField("maxdata_status", "Status da integração", "Max Data"),

      { id: "outras_integracoes", label: "Outras ferramentas que precisam se conectar", type: "textarea", audience: "client", group: "Outras" },
    ],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    description: "Como o cliente cobra e recebe.",
    fields: [
      { id: "fin_cobranca_auto", label: "Quer cobrança automática?", type: "boolean", audience: "client" },
      { id: "fin_formas", label: "Formas de recebimento", type: "select", options: ["Pix", "Boleto", "Cartão", "Várias"], audience: "client" },
      { id: "fin_importar", label: "Precisa importar lançamentos existentes?", type: "boolean", audience: "client" },
      { id: "fin_obs", label: "Observações do financeiro", type: "textarea", audience: "client" },
      statusField("fin_status", "Status da configuração do financeiro"),
    ],
  },
  {
    id: "aurora",
    title: "Aurora (IA)",
    description: "Como o assistente deve falar e atender.",
    fields: [
      { id: "ia_usar", label: "Vai usar a Aurora no atendimento?", type: "boolean", audience: "client" },
      { id: "ia_tom", label: "Tom de voz", type: "select", options: ["Formal", "Consultivo", "Descontraído"], audience: "client" },
      { id: "ia_horario", label: "Horário de atendimento", type: "text", audience: "client" },
      { id: "ia_transferir", label: "Quando passar pra um humano?", type: "textarea", audience: "client" },
      { id: "ia_faq", label: "Perguntas frequentes dos clientes", type: "textarea", audience: "client" },
      { id: "ia_produtos", label: "Produtos/serviços que a Aurora pode oferecer", type: "textarea", audience: "client" },
      statusField("ia_status", "Status da configuração da Aurora"),
    ],
  },
  {
    id: "golive",
    title: "Go-live (equipe)",
    description: "Checklist interno de entrega — não aparece pro cliente.",
    fields: [
      { id: "chk_usuarios", label: "Usuários criados", type: "boolean", audience: "internal", track: "check" },
      { id: "chk_funil", label: "Funil configurado", type: "boolean", audience: "internal", track: "check" },
      { id: "chk_base", label: "Base importada", type: "boolean", audience: "internal", track: "check" },
      { id: "chk_integracoes", label: "Integrações testadas ponta a ponta", type: "boolean", audience: "internal", track: "check" },
      { id: "chk_treinamento", label: "Treinamento realizado", type: "boolean", audience: "internal", track: "check" },
      { id: "chk_validacao", label: "Cliente validou a entrega", type: "boolean", audience: "internal", track: "check" },
      { id: "golive_obs", label: "Observações do go-live", type: "textarea", audience: "internal" },
    ],
  },
];

export type ImplData = Record<string, any>;

export function isFieldDone(field: ImplField, data: ImplData): boolean {
  const v = data?.[field.id];
  if (field.track === "answered") return typeof v === "string" ? v.trim().length > 0 : !!v;
  if (field.track === "status") return v === "Concluída" || v === "Não se aplica";
  if (field.track === "check") return v === true;
  return false;
}

export function isFieldFilled(field: ImplField, data: ImplData): boolean {
  const v = data?.[field.id];
  if (field.type === "boolean") return v === true || v === false;
  return typeof v === "string" ? v.trim().length > 0 : v !== undefined && v !== null && v !== "";
}

export interface ImplProgress { done: number; total: number; percent: number }

const toProgress = (done: number, total: number): ImplProgress => ({
  done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100),
});

/** Progresso geral e por seção — só campos com `track` contam. Com `audience`,
 * conta só os itens que aquele público enxerga (o cliente vê o progresso do
 * que depende dele, não o checklist interno que ele nem tem acesso). */
export function computeProgress(data: ImplData, audience?: ImplAudience): { overall: ImplProgress; sections: Record<string, ImplProgress> } {
  let done = 0, total = 0;
  const sections: Record<string, ImplProgress> = {};
  for (const s of IMPLEMENTATION_SECTIONS) {
    const tracked = s.fields.filter(f => f.track && (!audience || f.audience === audience));
    const sDone = tracked.filter(f => isFieldDone(f, data)).length;
    sections[s.id] = toProgress(sDone, tracked.length);
    done += sDone;
    total += tracked.length;
  }
  return { overall: toProgress(done, total), sections };
}

/** Campos acompanhados que ainda não estão prontos — usado em "O que falta" no relatório. */
export function pendingFields(data: ImplData, audience?: ImplAudience): { section: ImplSection; field: ImplField }[] {
  const out: { section: ImplSection; field: ImplField }[] = [];
  for (const section of IMPLEMENTATION_SECTIONS) {
    for (const field of section.fields) {
      if (!field.track || isFieldDone(field, data)) continue;
      if (audience && field.audience !== audience) continue;
      out.push({ section, field });
    }
  }
  return out;
}

// ── Validação / resolução de campo (usado pelo endpoint público e pela Aurora) ──

const norm = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const MAX_FIELD_TEXT = 2000;

export function allFields(audience?: ImplAudience): ImplField[] {
  return IMPLEMENTATION_SECTIONS.flatMap(s => s.fields).filter(f => !audience || f.audience === audience);
}

export type CoerceResult = { ok: true; value: any } | { ok: false; reason: string };

/** Converte o valor cru (texto vindo do cliente ou de uma chamada da Aurora) pro tipo do campo. Vazio limpa a resposta. */
export function coerceFieldValue(field: ImplField, raw: any): CoerceResult {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { ok: true, value: undefined };
  if (field.type === "boolean") {
    if (typeof raw === "boolean") return { ok: true, value: raw };
    const n = norm(String(raw));
    if (["sim", "s", "true", "1", "yes", "y"].includes(n)) return { ok: true, value: true };
    if (["nao", "n", "false", "0", "no"].includes(n)) return { ok: true, value: false };
    return { ok: false, reason: `"${field.label}" aceita só sim ou não.` };
  }
  if (field.type === "select") {
    const opt = field.options?.find(o => norm(o) === norm(String(raw)));
    return opt ? { ok: true, value: opt } : { ok: false, reason: `"${field.label}" aceita: ${field.options?.join(", ")}.` };
  }
  if (field.type === "date") {
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: true, value: s };
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (br) return { ok: true, value: `${br[3]}-${br[2]}-${br[1]}` };
    return { ok: false, reason: `"${field.label}" precisa de uma data (AAAA-MM-DD ou DD/MM/AAAA).` };
  }
  return { ok: true, value: String(raw).trim().slice(0, MAX_FIELD_TEXT) };
}

export type FindFieldResult =
  | { status: "found"; field: ImplField }
  | { status: "ambiguous"; candidates: ImplField[] }
  | { status: "none" };

/** Acha um campo pelo id ou por um nome aproximado ("whatsapp número", "cnpj"). Só considera campos do público informado. */
export function findField(query: string, audience: ImplAudience): FindFieldResult {
  const q = norm(query);
  if (!q) return { status: "none" };
  const fields = allFields(audience);
  const byId = fields.find(f => f.id === query.trim());
  if (byId) return { status: "found", field: byId };
  const full = (f: ImplField) => norm(`${f.group ? f.group + " " : ""}${f.label}`);
  const exact = fields.filter(f => norm(f.label) === q || full(f) === q);
  if (exact.length === 1) return { status: "found", field: exact[0] };
  const tokens = q.split(/\s+/).filter(Boolean);
  const loose = fields.filter(f => tokens.every(t => full(f).includes(t)));
  if (loose.length === 1) return { status: "found", field: loose[0] };
  if (loose.length > 1) return { status: "ambiguous", candidates: loose.slice(0, 6) };
  return { status: "none" };
}

/** Valida um patch {fieldId: valor} vindo de fora: só campos do público, valores coeridos. Retorna o patch limpo + o que foi recusado. */
export function sanitizePatch(patch: Record<string, any>, audience: ImplAudience): { clean: Record<string, any>; rejected: { id: string; reason: string }[] } {
  const clean: Record<string, any> = {};
  const rejected: { id: string; reason: string }[] = [];
  const byId = new Map(allFields(audience).map(f => [f.id, f]));
  for (const [id, raw] of Object.entries(patch || {})) {
    const field = byId.get(id);
    if (!field) { rejected.push({ id, reason: "campo desconhecido ou não permitido" }); continue; }
    const r = coerceFieldValue(field, raw);
    if (r.ok === false) rejected.push({ id, reason: r.reason });
    else clean[id] = r.value;
  }
  return { clean, rejected };
}

/** Aplica um patch limpo sobre os dados atuais (valor `undefined` remove a chave). */
export function applyPatch(data: ImplData, clean: Record<string, any>): ImplData {
  const next = { ...(data || {}) };
  for (const [k, v] of Object.entries(clean)) {
    if (v === undefined) delete next[k]; else next[k] = v;
  }
  return next;
}

// ── Puxar dados do ambiente SPY que o cliente já tem ────────────────────────
//
// O servidor lê o ambiente (tenant) do cliente e monta um TenantSnapshot SÓ com
// o que é seguro: nunca senha (password_hash), nunca chave/token de
// integração — só identificadores públicos (ID do pixel, número, host) e
// booleanos "conectado". Esta função decide o que cada dado vira no formulário.
//
// Regras: (1) resposta que uma pessoa já digitou NUNCA é sobrescrita — só
// campo vazio é preenchido; (2) status de integração só SOBE (Pendente →
// Em andamento → Concluída), nunca desce nem toca em "Não se aplica"; (3)
// checklist só é marcado, nunca desmarcado.

export interface TenantSnapshot {
  tenantName: string;
  empresa?: { razaoSocial?: string; nomeFantasia?: string; cnpj?: string; endereco?: string; website?: string } | null;
  users: { name?: string; email?: string; role?: string; is_tenant_admin?: boolean; phone?: string | null }[];
  whatsapp: { phone?: string | null; connected: boolean }[];
  meta?: { pixelId?: string; accountId?: string; connected?: boolean } | null;
  google?: { customerId?: string; measurementId?: string; connected?: boolean } | null;
  payments: { name: "Mercado Pago" | "Stripe" | "Asaas"; connected: boolean }[];
  smtp?: { server?: string; user?: string } | null;
  /** Max Data: só o ID da empresa (empId) e se URL+chave já estão preenchidas — nunca a chave nem o application_name. */
  maxdata?: { clientId?: string; configured?: boolean; connected?: boolean } | null;
  stages: string[];
  auroraActive: number;
}

const STATUS_RANK: Record<string, number> = { "": 0, Pendente: 0, "Em andamento": 1, "Concluída": 2 };

export function applyTenantSnapshot(current: ImplData, snap: TenantSnapshot): { data: ImplData; filled: string[]; statusRaised: string[] } {
  const data: ImplData = { ...(current || {}) };
  const filled: string[] = [];
  const statusRaised: string[] = [];
  const labelOf = (id: string) => {
    const f = allFields().find(x => x.id === id);
    return f ? `${f.group ? f.group + " — " : ""}${f.label}` : id;
  };

  const fill = (id: string, value: any) => {
    if (value === undefined || value === null || value === "") return;
    const cur = data[id];
    const has = typeof cur === "string" ? cur.trim() !== "" : cur !== undefined && cur !== null;
    if (has) return;
    data[id] = value;
    filled.push(labelOf(id));
  };
  const raise = (id: string, to: "Em andamento" | "Concluída") => {
    const cur = String(data[id] ?? "");
    if (cur === "Não se aplica") return;
    if ((STATUS_RANK[to] ?? 0) <= (STATUS_RANK[cur] ?? 0)) return;
    data[id] = to;
    statusRaised.push(labelOf(id));
  };
  const check = (id: string) => {
    if (data[id] === true) return;
    data[id] = true;
    statusRaised.push(labelOf(id));
  };

  const e = snap.empresa || {};
  fill("razao_social", e.razaoSocial);
  fill("nome_fantasia", e.nomeFantasia || snap.tenantName);
  fill("cnpj", e.cnpj);
  fill("site", e.website);
  fill("endereco", e.endereco);

  const users = (snap.users || []).filter(u => u.email);
  if (users.length > 0) {
    const perfil = (u: TenantSnapshot["users"][number]) => (u.is_tenant_admin ? "Administrador" : u.role || "Usuário");
    fill("qtd_usuarios", String(users.length));
    fill("usuarios_lista", users.map(u => `${u.name || "Sem nome"} — ${u.email} — ${perfil(u)}`).join("\n"));
    const admin = users.find(u => u.is_tenant_admin) || users[0];
    fill("resp_nome", admin.name);
    fill("resp_email", admin.email);
    fill("resp_whatsapp", admin.phone || undefined);
    check("chk_usuarios");
  }

  if (snap.whatsapp.length > 0) {
    fill("whats_usa", true);
    fill("whats_numero", snap.whatsapp.find(w => w.phone)?.phone || undefined);
    raise("whats_status", snap.whatsapp.some(w => w.connected) ? "Concluída" : "Em andamento");
  }

  const m = snap.meta;
  if (m && (m.pixelId || m.accountId)) {
    fill("meta_usa", true);
    fill("meta_conta_id", m.accountId);
    fill("meta_pixel_id", m.pixelId);
    raise("meta_status", m.connected ? "Concluída" : "Em andamento");
  }

  const g = snap.google;
  if (g && (g.customerId || g.measurementId)) {
    fill("google_usa", true);
    fill("google_ads_id", g.customerId);
    fill("google_ga4_id", g.measurementId);
    raise("google_status", g.connected ? "Concluída" : "Em andamento");
  }

  const gateway = snap.payments.find(p => p.connected);
  if (gateway) {
    fill("pag_gateway", gateway.name);
    fill("pag_conta_criada", true);
    raise("pag_status", "Concluída");
  }

  const md = snap.maxdata;
  if (md && (md.clientId || md.configured || md.connected)) {
    fill("maxdata_usa", true);
    fill("maxdata_id", md.clientId);
    raise("maxdata_status", md.connected ? "Concluída" : "Em andamento");
  }

  if (snap.smtp?.server && snap.smtp?.user) {
    fill("email_usa", true);
    fill("email_provedor", snap.smtp.server);
    fill("email_remetente", snap.smtp.user);
    // Credenciais preenchidas não significa testado — não marca como concluída.
    raise("email_status", "Em andamento");
  }

  if (snap.stages.length > 0) {
    fill("etapas_funil", snap.stages.join(" → "));
    check("chk_funil");
  }

  if (snap.auroraActive > 0) {
    fill("ia_usar", true);
    raise("ia_status", "Concluída");
  }

  return { data, filled, statusRaised };
}
