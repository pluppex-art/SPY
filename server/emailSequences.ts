import type { Express } from "express";
import { sendTenantEmail } from "./mailer.js";
import { buildMail, bloquearEnderecoInexistente, ehEnderecoInexistente, cleanEmail, optoutUrl, optoutSet, pagedTable, parseAudience, resolveAudience, selectAudience } from "./emailCampaigns.js";

/** Sequência de e-mails: vários envios em dias seguidos para cada pessoa inscrita (ex.: dia 0, dia 3, dia 7). */

export interface Passo { dias: number; subject: string; body: string }
const MAX_PASSOS = 8;
const MAX_INSCRITOS = 5_000;
const POR_RODADA = 200;
const FALHAS_MAX = 3;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DIA_MS = 86_400_000;

/** Valida os passos vindos da tela: de 1 a 8 e-mails; "dias" é a espera depois da inscrição (1º) ou do e-mail anterior (demais). */
export function parsePassos(raw: unknown): { ok: true; passos: Passo[] } | { ok: false; erro: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, erro: "Adicione pelo menos um e-mail na sequência." };
  if (raw.length > MAX_PASSOS) return { ok: false, erro: `No máximo ${MAX_PASSOS} e-mails por sequência.` };
  const passos: Passo[] = [];
  for (let i = 0; i < raw.length; i++) {
    const subject = String(raw[i]?.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
    const body = String(raw[i]?.body ?? "").trim().slice(0, 20_000);
    if (!subject || !body) return { ok: false, erro: `E-mail ${i + 1}: informe assunto e mensagem.` };
    const d = Math.floor(Number(raw[i]?.dias ?? 0));
    if (!Number.isFinite(d) || d < 0 || d > 60) return { ok: false, erro: `E-mail ${i + 1}: a espera deve ser de 0 a 60 dias.` };
    passos.push({ dias: d, subject, body });
  }
  return { ok: true, passos };
}

/** Filtros da entrada automática (só leads): lista de origens, status e canais; vazio = todos. `desde` = só leads criados depois. */
export function parseAuto(raw: any, desde: string): { sources: string[]; statuses: string[]; canais: string[]; desde: string } {
  const arr = (v: any) => (Array.isArray(v) ? v.map(String).slice(0, 100) : []);
  return { sources: arr(raw?.sources), statuses: arr(raw?.statuses), canais: arr(raw?.canais), desde };
}

/** E-mails já inscritos (lê em páginas: o banco devolve no máximo 1000 linhas por consulta). */
async function jaInscritos(db: any, seq: any): Promise<Set<string>> {
  const linhas = await pagedTable(db, "email_sequence_enrollments", "email", seq.tenant_id, (q) => q.eq("sequence_id", seq.id));
  return new Set(linhas.map((r: any) => String(r.email)));
}

/** Coloca nas sequências com entrada automática os leads novos (criados depois da ativação) que combinam com os filtros. */
export async function inscreverAutomaticos(db: any, opts: { agora?: number; sequenceId?: string; tenantId?: string } = {}): Promise<{ sequencias: number; entraram: number }> {
  const agora = opts.agora ?? Date.now();
  let q = db.from("email_sequences").select("*").eq("status", "active").not("auto", "is", null).limit(100);
  if (opts.sequenceId) q = q.eq("id", opts.sequenceId);
  if (opts.tenantId) q = q.eq("tenant_id", opts.tenantId);
  const { data: seqs, error } = await q;
  if (error) { if (/auto/i.test(error.message)) return { sequencias: 0, entraram: 0 }; throw new Error(error.message); }
  let entraram = 0;
  for (const seq of seqs || []) {
    const auto = seq.auto; const passos: Passo[] = seq.steps || [];
    if (!auto?.desde || !passos.length) continue;
    // Lê em páginas (o banco devolve no máximo 1000 linhas por consulta), senão depois de 1000 leads novos os mais recentes nunca entrariam.
    const consulta = (cols: string, de: number) => db.from("leads").select(cols).eq("tenant_id", seq.tenant_id).is("deleted_at", null).not("email", "is", null).neq("email", "").gte("created_at", auto.desde).order("created_at", { ascending: true }).order("id", { ascending: true }).range(de, de + 999);
    let cols = "id, name, email, company, source, status, customFields"; let leads: any[] = []; let el: any = null;
    for (let de = 0; de < 20_000; de += 1000) {
      let r = await consulta(cols, de);
      if (r.error && /customFields/i.test(r.error.message) && cols.includes("customFields")) { cols = "id, name, email, company, source, status"; r = await consulta(cols, de); }
      if (r.error) { el = r.error; break; }
      leads.push(...(r.data || []));
      if (!r.data || r.data.length < 1000) break;
    }
    if (el) continue;
    const sel = selectAudience(leads, { leads: true, sources: auto.sources, statuses: auto.statuses, canais: auto.canais } as any, await optoutSet(db, seq.tenant_id));
    if (!sel.rows.length) continue;
    const existentes = await jaInscritos(db, seq);
    const novos = sel.rows.filter((r) => !existentes.has(r.email));
    for (let i = 0; i < novos.length; i += 500) {
      const { error: ei } = await db.from("email_sequence_enrollments").upsert(novos.slice(i, i + 500).map((r) => ({ sequence_id: seq.id, tenant_id: seq.tenant_id, lead_id: r.lead_id, email: r.email, name: r.name, company: r.company, step_idx: 0, next_send_at: quandoEnviar(agora, passos[0].dias), status: "active" })), { onConflict: "sequence_id,email", ignoreDuplicates: true });
      if (ei) break;
      entraram += Math.min(500, novos.length - i);
    }
  }
  return { sequencias: (seqs || []).length, entraram };
}

export const quandoEnviar = (agora: number, dias: number) => new Date(agora + dias * DIA_MS).toISOString();

interface Ajudas { cotaRestante: (db: any, tenantId: string) => Promise<{ restante: number }>; tenantNameOf: (tenantId: string) => Promise<{ name: string; color: string | null; logo?: string | null }>; enviar?: (db: any, tenantId: string, mail: any) => Promise<unknown> }

/** Envia os e-mails da sequência que já estão no prazo. `tenantId` limita a uma empresa (botão "enviar agora"); sem ele roda todas (cron). */
export async function processarSequencias(db: any, base: string, aj: Ajudas, opts: { tenantId?: string; sequenceId?: string; agora?: number; orcamentoMs?: number } = {}) {
  const inicio = Date.now(); const agora = opts.agora ?? Date.now(); const orcamento = opts.orcamentoMs ?? 40_000;
  // Só sequências ativas entram na fila: linhas de sequência pausada, sempre as mais antigas, travariam a fila de todas as empresas.
  let qs = db.from("email_sequences").select("id").eq("status", "active").limit(1000);
  if (opts.tenantId) qs = qs.eq("tenant_id", opts.tenantId);
  if (opts.sequenceId) qs = qs.eq("id", opts.sequenceId);
  const { data: ativas, error: errAtivas } = await qs;
  if (errAtivas) throw new Error(errAtivas.message);
  const idsAtivas = (ativas || []).map((x: any) => x.id);
  if (!idsAtivas.length) return { enviados: 0, falhas: 0, encerrados: 0, semCota: 0, pausadas: 0, restantes: false };
  let q = db.from("email_sequence_enrollments").select("*").eq("status", "active").in("sequence_id", idsAtivas).lte("next_send_at", new Date(agora).toISOString()).order("next_send_at", { ascending: true }).limit(POR_RODADA + 1);
  if (opts.tenantId) q = q.eq("tenant_id", opts.tenantId);
  const { data: devidos, error } = await q;
  if (error) throw new Error(error.message);
  const fila: any[] = (devidos || []).slice(0, POR_RODADA);
  const maisDevidos = (devidos || []).length > POR_RODADA;
  const seqs = new Map<string, any>(); const cotas = new Map<string, number>(); const optouts = new Map<string, Set<string>>(); const nomes = new Map<string, { name: string; color: string | null; logo?: string | null }>();
  const tocadas = new Set<string>(); const adiadas = new Set<string>();
  let enviados = 0, falhas = 0, encerrados = 0, semCota = 0, pausadas = 0;
  for (const en of fila) {
    if (Date.now() - inicio > orcamento) break;
    if (!seqs.has(en.sequence_id)) { const { data } = await db.from("email_sequences").select("*").eq("id", en.sequence_id).maybeSingle(); seqs.set(en.sequence_id, data || null); }
    const seq = seqs.get(en.sequence_id);
    if (!seq || seq.tenant_id !== en.tenant_id) continue;
    if (seq.status !== "active") { pausadas++; continue; }
    const passos: Passo[] = Array.isArray(seq.steps) ? seq.steps : [];
    const passo = passos[en.step_idx];
    if (!passo) { await db.from("email_sequence_enrollments").update({ status: "done" }).eq("id", en.id); encerrados++; continue; }
    if (!optouts.has(en.tenant_id)) optouts.set(en.tenant_id, await optoutSet(db, en.tenant_id));
    if (optouts.get(en.tenant_id)!.has(String(en.email)) || !cleanEmail(en.email)) { await db.from("email_sequence_enrollments").update({ status: "stopped" }).eq("id", en.id); encerrados++; continue; }
    if (seq.parar_ao_clicar && en.step_idx > 0) { // já clicou em um e-mail anterior: considera interessada e para a sequência
      const { data: cliques } = await db.from("email_campaign_recipients").select("id").eq("campaign_id", seq.campaign_id).eq("email", en.email).gt("click_count", 0).limit(1);
      if (cliques && cliques.length) { await db.from("email_sequence_enrollments").update({ status: "stopped" }).eq("id", en.id); encerrados++; continue; }
    }
    if (!cotas.has(en.tenant_id)) cotas.set(en.tenant_id, (await aj.cotaRestante(db, en.tenant_id)).restante);
    if ((cotas.get(en.tenant_id) || 0) <= 0) {
      semCota++;
      // Sem cota hoje: adia todos os vencidos desta empresa para não ocuparem o começo da fila das outras empresas.
      if (!adiadas.has(en.tenant_id)) { adiadas.add(en.tenant_id); await db.from("email_sequence_enrollments").update({ next_send_at: new Date(agora + 6 * 3600_000).toISOString() }).eq("tenant_id", en.tenant_id).eq("status", "active").lte("next_send_at", new Date(agora).toISOString()); }
      continue;
    }
    if (!nomes.has(en.tenant_id)) nomes.set(en.tenant_id, await aj.tenantNameOf(en.tenant_id));
    const t = nomes.get(en.tenant_id)!;
    // Reserva este envio: se a rotina diária e o botão "enviar agora" rodarem juntos, só um deles pega esta pessoa (sem e-mail duplicado).
    // Se a função morrer no meio, o envio volta à fila em 10 minutos.
    const { data: reservado } = await db.from("email_sequence_enrollments").update({ next_send_at: new Date(agora + 10 * 60_000).toISOString() }).eq("id", en.id).eq("next_send_at", en.next_send_at).eq("status", "active").select("id");
    if (!reservado || reservado.length === 0) continue;
    tocadas.add(seq.id);
    // A linha em email_campaign_recipients é o que dá o rastreio de abertura/clique e conta na cota diária.
    let rec: { id?: string } | null = null;
    const unsub = optoutUrl(base, en.tenant_id, en.email);
    try {
      const { data: criado, error: errRec } = await db.from("email_campaign_recipients").insert({ campaign_id: seq.campaign_id, tenant_id: en.tenant_id, lead_id: en.lead_id, email: en.email, name: en.name, company: en.company, status: "sending", claimed_at: new Date().toISOString() }).select("id").single();
      if (errRec || !criado?.id) throw new Error("Não foi possível registrar o envio da sequência."); // sem a linha não há rastreio nem parar ao clicar: não envia
      rec = criado;
      const mail = buildMail({ subject: passo.subject, body: passo.body, name: en.name, company: en.company, tenantName: t.name, tenantColor: t.color, tenantLogo: t.logo, utmCampanha: `Sequência ${seq.name}`, unsubUrl: unsub, track: { base, rid: criado.id } });
      await (aj.enviar ?? sendTenantEmail)(db, en.tenant_id, { to: en.email, ...mail, replyToEmpresa: true, deParte: t.name, headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
      await db.from("email_campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", rec!.id);
      cotas.set(en.tenant_id, (cotas.get(en.tenant_id) || 0) - 1);
      const proximo = passos[en.step_idx + 1];
      await db.from("email_sequence_enrollments").update(proximo
        ? { step_idx: en.step_idx + 1, next_send_at: quandoEnviar(agora, proximo.dias), falhas: 0 }
        : { step_idx: en.step_idx + 1, status: "done", falhas: 0 }).eq("id", en.id);
      enviados++;
    } catch (e: any) {
      if (rec?.id) await db.from("email_campaign_recipients").update({ status: "failed", error: String(e?.message || e).slice(0, 300) }).eq("id", rec.id);
      if (ehEnderecoInexistente(e?.message || e)) { // caixa inexistente: não adianta tentar de novo
        await bloquearEnderecoInexistente(db, en.tenant_id, en.email);
        await db.from("email_sequence_enrollments").update({ status: "stopped", falhas: (en.falhas || 0) + 1 }).eq("id", en.id);
        falhas++; continue;
      }
      const f = (en.falhas || 0) + 1;
      await db.from("email_sequence_enrollments").update(f >= FALHAS_MAX ? { status: "stopped", falhas: f } : { falhas: f, next_send_at: quandoEnviar(agora, 1) }).eq("id", en.id);
      falhas++;
    }
  }
  // Atualiza os totais da campanha que guarda o histórico de cada sequência.
  for (const sid of tocadas) {
    const cid = seqs.get(sid)?.campaign_id; if (!cid) continue;
    const n = async (status?: string) => { let qq = db.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", cid); if (status) qq = qq.eq("status", status); return (await qq).count || 0; };
    const [total, sent, failed] = await Promise.all([n(), n("sent"), n("failed")]);
    await db.from("email_campaigns").update({ total, sent, failed }).eq("id", cid);
  }
  return { enviados, falhas, encerrados, semCota, pausadas, restantes: maisDevidos || fila.length > enviados + falhas + encerrados + semCota + pausadas };
}

interface Deps { requireUser: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; limiter: any; supabaseService: any }

export function registrarSequencias(app: Express, { requireUser, resolveRequestedTenantId, limiter, supabaseService }: Deps, aj: Ajudas & { liberarMarketing: (req: any, res: any, tenantId: string) => Promise<boolean>; baseUrl: (req: any) => string }) {
  const db = supabaseService;
  const noDb = (res: any) => res.status(503).json({ error: "Servidor sem acesso ao banco." });
  const migracao = (e: any) => /email_sequence/i.test(String(e?.message || "")) && /does not exist|schema cache|relation/i.test(String(e?.message || ""));
  const MSG_MIGRACAO = "As sequências de e-mail ainda não foram liberadas no banco de dados (migração 20261201). Peça para a equipe técnica aplicar.";

  const carregar = async (req: any, res: any, tenantId: string) => {
    const id = String(req.params.id || "");
    if (!UUID.test(id)) { res.status(400).json({ error: "Sequência inválida." }); return null; }
    const { data } = await db.from("email_sequences").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!data) { res.status(404).json({ error: "Sequência não encontrada." }); return null; }
    return data;
  };

  /** Coloca pessoas na sequência (quem já está nela, ou se descadastrou, é pulado). Devolve quantas entraram. */
  const inscrever = async (seq: any, tenantId: string, audRaw: any) => {
    const sel = await resolveAudience(db, tenantId, parseAudience(audRaw));
    if (sel.rows.length > MAX_INSCRITOS) throw new Error(`Público com ${sel.rows.length} pessoas; o máximo por sequência é ${MAX_INSCRITOS}. Filtre por origem ou status.`);
    const passos: Passo[] = seq.steps || [];
    const quando = quandoEnviar(Date.now(), passos[0]?.dias ?? 0);
    const existentes = await jaInscritos(db, seq);
    const novos = sel.rows.filter((r) => !existentes.has(r.email));
    for (let i = 0; i < novos.length; i += 500) {
      const { error } = await db.from("email_sequence_enrollments").upsert(novos.slice(i, i + 500).map((r) => ({ sequence_id: seq.id, tenant_id: tenantId, lead_id: r.lead_id, email: r.email, name: r.name, company: r.company, step_idx: 0, next_send_at: quando, status: "active" })), { onConflict: "sequence_id,email", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    return { entraram: novos.length, jaEstavam: sel.rows.length - novos.length };
  };

  app.get("/api/email-sequences", requireUser, limiter, async (req: any, res: any) => {
    if (!db) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    try {
      const { data: seqs, error } = await db.from("email_sequences").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50);
      if (error) { if (migracao(error)) return res.json({ sequences: [], pendenteMigracao: true }); throw new Error(error.message); }
      const insc = await pagedTable(db, "email_sequence_enrollments", "sequence_id, status", tenantId);
      const camps = (seqs || []).map((s: any) => s.campaign_id).filter(Boolean);
      const { data: cs } = camps.length ? await db.from("email_campaigns").select("id, sent, failed, opened, clicked").in("id", camps) : { data: [] };
      const porCamp = new Map<string, any>((cs || []).map((c: any) => [c.id, c]));
      res.json({ sequences: (seqs || []).map((s: any) => {
        const mine = insc.filter((i: any) => i.sequence_id === s.id); const c = porCamp.get(s.campaign_id) || {};
        return { id: s.id, name: s.name, status: s.status, passos: s.steps, auto: s.auto ? { ...s.auto, desde: undefined } : null, pararAoClicar: s.parar_ao_clicar === true, created_at: s.created_at,
          inscritos: mine.length, ativos: mine.filter((i: any) => i.status === "active").length, concluidos: mine.filter((i: any) => i.status === "done").length, parados: mine.filter((i: any) => i.status === "stopped").length,
          enviados: c.sent || 0, falhas: c.failed || 0, abriram: c.opened || 0, clicaram: c.clicked || 0 };
      }) });
    } catch (e: any) { res.status(500).json({ error: e?.message || "Falha ao listar as sequências." }); }
  });

  app.post("/api/email-sequences", requireUser, limiter, async (req: any, res: any) => {
    if (!db) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await aj.liberarMarketing(req, res, tenantId))) return;
    const name = String(req.body?.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "Dê um nome para a sequência." });
    const p = parsePassos(req.body?.passos);
    if (p.ok === false) return res.status(400).json({ error: p.erro });
    const autoOn = req.body?.autoInscrever === true && req.body?.audience?.leads !== false;
    let campId: string | null = null; let seqId: string | null = null;
    try {
      const { data: camp, error: ec } = await db.from("email_campaigns").insert({ tenant_id: tenantId, name: `[Sequência] ${name}`.slice(0, 120), subject: p.passos[0].subject, body: p.passos[0].body, audience: { sequencia: true }, total: 0, status: "done", created_by: req.user.id }).select("id").single();
      if (ec) throw new Error(ec.message);
      campId = camp.id;
      const { data: seq, error } = await db.from("email_sequences").insert({ tenant_id: tenantId, name, steps: p.passos, status: "active", campaign_id: campId, created_by: req.user.id, ...(autoOn ? { auto: parseAuto(req.body.audience, new Date().toISOString()) } : {}), ...(req.body?.pararAoClicar === true ? { parar_ao_clicar: true } : {}) }).select("*").single();
      if (error && /parar_ao_clicar/i.test(error.message)) throw new Error("A opção de parar ao clicar ainda não foi liberada no banco de dados (migração 20261203). Peça para a equipe técnica aplicar ou crie sem ela.");
      if (error && autoOn && /auto/i.test(error.message) && !/email_sequence/i.test(error.message)) throw new Error("A entrada automática ainda não foi liberada no banco de dados (migração 20261202). Peça para a equipe técnica aplicar ou crie sem ela.");
      if (error) { if (migracao(error)) throw new Error(MSG_MIGRACAO); throw new Error(error.message); }
      seqId = seq.id;
      const r = req.body?.audience ? await inscrever(seq, tenantId, req.body.audience) : { entraram: 0, jaEstavam: 0 };
      res.json({ id: seq.id, ...r });
    } catch (e: any) {
      if (seqId) await db.from("email_sequences").delete().eq("id", seqId);
      if (campId) await db.from("email_campaigns").delete().eq("id", campId);
      res.status(400).json({ error: e?.message || "Não foi possível criar a sequência." });
    }
  });

  app.post("/api/email-sequences/:id/inscrever", requireUser, limiter, async (req: any, res: any) => {
    if (!db) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await aj.liberarMarketing(req, res, tenantId))) return;
    const seq = await carregar(req, res, tenantId); if (!seq) return;
    try { res.json(await inscrever(seq, tenantId, req.body?.audience)); } catch (e: any) { res.status(400).json({ error: e?.message || "Não foi possível inscrever." }); }
  });

  // Liga/desliga a entrada automática de leads novos (com os filtros dados; só vale para leads criados depois de ligar).
  app.post("/api/email-sequences/:id/auto", requireUser, limiter, async (req: any, res: any) => {
    if (!db) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await aj.liberarMarketing(req, res, tenantId))) return;
    const seq = await carregar(req, res, tenantId); if (!seq) return;
    const ligar = req.body?.ativo === true;
    const auto = ligar ? parseAuto(req.body, seq.auto?.desde || new Date().toISOString()) : null;
    const { error } = await db.from("email_sequences").update({ auto }).eq("id", seq.id);
    if (error) return res.status(400).json({ error: /auto/i.test(error.message) ? "A entrada automática ainda não foi liberada no banco de dados (migração 20261202)." : error.message });
    res.json({ ok: true, auto });
  });

  app.post("/api/email-sequences/:id/parar-ao-clicar", requireUser, limiter, async (req: any, res: any) => {
    if (!db) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await aj.liberarMarketing(req, res, tenantId))) return;
    const seq = await carregar(req, res, tenantId); if (!seq) return;
    const ativo = req.body?.ativo === true;
    const { error } = await db.from("email_sequences").update({ parar_ao_clicar: ativo }).eq("id", seq.id);
    if (error) return res.status(400).json({ error: /parar_ao_clicar/i.test(error.message) ? "Essa opção ainda não foi liberada no banco de dados (migração 20261203)." : error.message });
    res.json({ ok: true, ativo });
  });

  // Edita nome e e-mails. Quem já está no meio segue do ponto onde parou (se removerem e-mails, quem passou do fim é concluído).
  app.post("/api/email-sequences/:id/editar", requireUser, limiter, async (req: any, res: any) => {
    if (!db) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await aj.liberarMarketing(req, res, tenantId))) return;
    const seq = await carregar(req, res, tenantId); if (!seq) return;
    const name = String(req.body?.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "Dê um nome para a sequência." });
    const p = parsePassos(req.body?.passos);
    if (p.ok === false) return res.status(400).json({ error: p.erro });
    const { error } = await db.from("email_sequences").update({ name, steps: p.passos }).eq("id", seq.id);
    if (error) return res.status(400).json({ error: error.message });
    if (seq.campaign_id) await db.from("email_campaigns").update({ name: `[Sequência] ${name}`.slice(0, 120) }).eq("id", seq.campaign_id).eq("tenant_id", tenantId);
    res.json({ ok: true });
  });

  app.post("/api/email-sequences/:id/status", requireUser, limiter, async (req: any, res: any) => {
    if (!db) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await aj.liberarMarketing(req, res, tenantId))) return;
    const seq = await carregar(req, res, tenantId); if (!seq) return;
    const status = req.body?.status === "paused" ? "paused" : "active";
    await db.from("email_sequences").update({ status }).eq("id", seq.id);
    res.json({ ok: true, status });
  });

  app.delete("/api/email-sequences/:id", requireUser, limiter, async (req: any, res: any) => {
    if (!db) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await aj.liberarMarketing(req, res, tenantId))) return;
    const seq = await carregar(req, res, tenantId); if (!seq) return;
    await db.from("email_sequences").delete().eq("id", seq.id);
    if (seq.campaign_id) await db.from("email_campaigns").delete().eq("id", seq.campaign_id).eq("tenant_id", tenantId);
    res.json({ ok: true });
  });

  // Envia agora o que já está no prazo (o resto sai sozinho na rotina diária). O navegador repete enquanto `restantes` for verdadeiro.
  app.post("/api/email-sequences/:id/processar", requireUser, limiter, async (req: any, res: any) => {
    if (!db) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await aj.liberarMarketing(req, res, tenantId))) return;
    const seq = await carregar(req, res, tenantId); if (!seq) return;
    try {
      if (seq.auto) await inscreverAutomaticos(db, { sequenceId: seq.id, tenantId }).catch(() => undefined); // quem virou lead desde a última rotina entra antes de enviar
      res.json(await processarSequencias(db, aj.baseUrl(req), aj, { tenantId, sequenceId: seq.id }));
    } catch (e: any) { res.status(500).json({ error: e?.message || "Falha ao enviar." }); }
  });
}
