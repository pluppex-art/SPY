/**
 * Módulo Agendamento — rotas do servidor.
 *
 *  Equipe (login):     /api/agendamento/*
 *  Página pública:     /api/agendar/:slug/*        (sem login; limitada por IP e por telefone)
 *  Mercado Pago:       /api/agendamento/mp-webhook/:tenantId  (aviso de pagamento; link assinado)
 *  Rotina diária:      /api/agendamento/cron/expirar          (CRON_SECRET)
 *
 * Tudo que grava passa por aqui: valida regras (src/lib/agendamento/engine.ts), confere permissões e grava pelas
 * funções do banco, que garantem a vaga com trava por dia. As telas só LEEM as tabelas (RLS por empresa).
 */
import axios from "axios";
import type { Express, Request, RequestHandler, Response } from "express";
import { upsertLead, atualizarLeadPorId } from "./leadUpsert.js";
import {
  PERMISSOES_PADRAO, assinar, conferirAssinatura, configParaEngine, linhaParaLite, montarLancamento, montarPreferenciaMP,
  planejarPagamento, repartirMisto, slugDe, validarConfig, SLUG_REGEX,
  type LinhaConfig, type LinhaReserva, type PedidoPagamento, type PermissoesEquipe,
} from "./agendamentoPuro.js";
import {
  agoraNoFuso, agruparBlocos, centavos, decidirPagamentoAprovado, formaPorTipoMercadoPago, gerarSlots, horaParaExibir, limpaData,
  marcarUnidade, maxPessoas, minutosDaHora, ratearValor, totalPadrao, validarReserva, unidadeId,
  type Bloco, type StatusReserva,
} from "../src/lib/agendamento/engine.js";

export interface AgendamentoDeps {
  requireUser: RequestHandler;
  /** Empresa que a pessoa está operando (a dela, ou a escolhida por master/parceiro). */
  resolveTenant: (req: any, res: Response) => Promise<string | null>;
  supabaseService: any;
  /** Limite por IP da página pública. */
  limiterPublico: RequestHandler;
  /** Chave para assinar links (nunca sai do servidor). */
  segredo: string;
  /** Endereço público do sistema (links de retorno e aviso de pagamento). */
  appUrl: string;
  cronSecret?: string;
}

const MAX_HORAS_POR_PEDIDO = 14;
const MAX_PEDIDOS_ABERTOS_POR_TELEFONE = 3;

const ERRO_VAGA = "Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.";
const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const nomeLimpo = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
const textoLivre = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
const uuidOk = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Erro de vaga vindo do banco ("sem_vaga:20:00") → mensagem para a pessoa. */
function mensagemDeErroDoBanco(e: any): { status: number; erro: string; code?: string } {
  const m = String(e?.message || "");
  if (m.startsWith("sem_vaga")) return { status: 409, code: "sem_vaga", erro: m.includes(":") ? `${ERRO_VAGA} (${m.split(":").slice(1).join(":")})` : ERRO_VAGA };
  if (m.includes("recursos_demais")) return { status: 400, code: "recursos_demais", erro: "Quantidade acima do total disponível." };
  if (m.includes("sem_config")) return { status: 409, code: "sem_config", erro: "O agendamento ainda não foi configurado." };
  if (m.includes("reserva_nao_encontrada")) return { status: 404, erro: "Reserva não encontrada." };
  return { status: 500, erro: "Não foi possível salvar. Tente novamente." };
}

export function registerAgendamentoRoutes(app: Express, deps: AgendamentoDeps) {
  const { requireUser, resolveTenant, supabaseService: db, limiterPublico, segredo, appUrl } = deps;
  const chave = `agendamento:${segredo}`;
  const pronto = (res: Response) => { if (!db) { res.status(503).json({ error: "Serviço indisponível." }); return false; } return true; };

  // ─── acesso a dados ──────────────────────────────────────────────────────
  const moduloLigado = async (tenantId: string) => {
    const { data } = await db.from("tenants").select("modules").eq("id", tenantId).is("deleted_at", null).maybeSingle();
    return data?.modules?.agendamento === true;
  };
  const carregarConfig = async (tenantId: string): Promise<LinhaConfig | null> => {
    const { data } = await db.from("agendamento_config").select("*").eq("tenant_id", tenantId).maybeSingle();
    return (data as LinhaConfig) ?? null;
  };
  /** Cria a configuração padrão na primeira vez (endereço público a partir do nome da empresa). */
  const garantirConfig = async (tenantId: string): Promise<LinhaConfig> => {
    const atual = await carregarConfig(tenantId);
    if (atual) return atual;
    const { data: t } = await db.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const nome = String(t?.name || "");
    const base = slugDe(nome);
    for (let i = 0; i < 30; i++) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const { error } = await db.from("agendamento_config").insert({ tenant_id: tenantId, slug, nome_estabelecimento: nome || null });
      if (!error) break;
      if ((error as any).code === "23505") { if (await carregarConfig(tenantId)) break; continue; } // endereço em uso por outra empresa (ou criada agora)
      throw new Error(error.message);
    }
    const criada = await carregarConfig(tenantId);
    if (!criada) throw new Error("Não foi possível criar a configuração do agendamento.");
    return criada;
  };
  const reservasDoDia = async (tenantId: string, data: string): Promise<LinhaReserva[]> => {
    const { data: rows } = await db.from("agendamento_reservas").select("*").eq("tenant_id", tenantId).eq("data", data).limit(2000);
    return (rows ?? []) as LinhaReserva[];
  };
  const reservaPorId = async (tenantId: string, id: string): Promise<LinhaReserva | null> => {
    if (!uuidOk(id)) return null;
    const { data } = await db.from("agendamento_reservas").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    return (data as LinhaReserva) ?? null;
  };
  const expirar = (tenantId: string) => db.rpc("agendamento_expirar_pendentes", { p_tenant: tenantId }).then(() => undefined, () => undefined);

  // ─── quem está operando ──────────────────────────────────────────────────
  interface Operador { id: string; nome: string; admin: boolean }
  const operador = async (req: any, tenantId: string): Promise<Operador> => {
    const { data: u } = await db.from("users").select("name, is_master, is_tenant_admin, tenant_id").eq("id", req.user.id).maybeSingle();
    const admin = !!u && (u.is_master === true || (u.is_tenant_admin === true && u.tenant_id === tenantId));
    return { id: req.user.id, nome: String(u?.name || req.user.email || "Equipe"), admin };
  };
  const pode = (op: Operador, cfg: LinhaConfig, acao: keyof PermissoesEquipe) => op.admin || (cfg.permissoes_equipe ?? PERMISSOES_PADRAO)[acao] === true;

  /** Resolve empresa, confere o módulo e carrega a configuração. Responde o erro sozinho e devolve null. */
  const contexto = async (req: any, res: Response) => {
    if (!pronto(res)) return null;
    const tenantId = await resolveTenant(req, res);
    if (!tenantId) return null;
    if (!(await moduloLigado(tenantId))) { res.status(403).json({ error: "O módulo Agendamento não está ativo nesta empresa.", code: "modulo_desligado" }); return null; }
    const cfg = await garantirConfig(tenantId);
    const op = await operador(req, tenantId);
    return { tenantId, cfg, op };
  };

  const auditar = async (tenantId: string, reservaId: string | null, op: { id?: string; nome: string } | null, acao: string, detalhes: string) => {
    try { await db.from("agendamento_auditoria").insert({ tenant_id: tenantId, reserva_id: reservaId, user_id: op?.id ?? null, user_nome: op?.nome ?? "Cliente (site)", acao, detalhes: detalhes.slice(0, 500) }); }
    catch (e: any) { console.warn("[agendamento] auditoria:", e?.message); }
  };

  /** Mantém o financeiro e o lead em dia com a reserva. Nunca derruba a operação. */
  const sincronizar = async (tenantId: string, r: LinhaReserva, opts: { papelLead?: "entrada" | "ganho"; nomeEstab?: string } = {}) => {
    try {
      const l = montarLancamento(r);
      const { data: existente } = await db.from("finance_entries").select("id").eq("tenant_id", tenantId).eq("id", l.id).maybeSingle();
      // Valor zero só para retratar um lançamento que já existia (reserva paga que foi cancelada/estornada).
      if (l.value > 0 || existente) {
        let categoryId: string | undefined;
        const { data: cats } = await db.from("finance_categories").select("id, nome").eq("tenant_id", tenantId).eq("tipo", "Receita").ilike("nome", l.category);
        categoryId = (cats || []).find((c: any) => String(c.nome).trim().toLowerCase() === l.category.toLowerCase())?.id;
        if (!categoryId) {
          const { data: criada } = await db.from("finance_categories").insert({ tenant_id: tenantId, nome: l.category, tipo: "Receita" }).select("id").maybeSingle();
          categoryId = criada?.id;
        }
        await db.from("finance_entries").upsert({ ...l, tenant_id: tenantId, ...(categoryId ? { category_id: categoryId } : {}) }, { onConflict: "id" });
      }
    } catch (e: any) { console.warn("[agendamento] financeiro:", e?.message); }
    try {
      if (opts.papelLead && r.lead_id) await atualizarLeadPorId(db, tenantId, r.lead_id, opts.papelLead, `Reserva ${limpaData(r.data)} às ${horaParaExibir(r.hora)} — ${r.status}${r.status_pagamento === "Pago" ? " (paga)" : ""}`, opts.papelLead === "ganho" ? Number(r.valor_total) : undefined);
    } catch (e: any) { console.warn("[agendamento] lead:", e?.message); }
  };

  const leadDoContato = async (tenantId: string, nome: string, telefone: string, email: string, origem: string, nota: string): Promise<string | null> => {
    if (!telefone && !email) return null;
    try { return (await upsertLead(db, tenantId, { name: nome, phone: telefone, email, source: origem, nota, papel: "entrada" })).id; }
    catch (e: any) { console.warn("[agendamento] lead:", e?.message); return null; }
  };

  // ═══ EQUIPE ══════════════════════════════════════════════════════════════

  app.get("/api/agendamento/config", requireUser, async (req: any, res) => {
    const c = await contexto(req, res);
    if (!c) return;
    await expirar(c.tenantId);
    res.json({ config: c.cfg, admin: c.op.admin, permissoes: { criar: pode(c.op, c.cfg, "criar"), editar: pode(c.op, c.cfg, "editar"), cancelar: pode(c.op, c.cfg, "cancelar"), receber: pode(c.op, c.cfg, "receber"), sem_contato: pode(c.op, c.cfg, "sem_contato") }, linkPublico: c.cfg.slug ? `${appUrl}/agendar/${c.cfg.slug}` : null });
  });

  app.put("/api/agendamento/config", requireUser, async (req: any, res) => {
    const c = await contexto(req, res);
    if (!c) return;
    if (!c.op.admin) return res.status(403).json({ error: "Só o administrador altera a configuração." });
    const v = validarConfig(req.body);
    if (v.ok === false) return res.status(400).json({ error: v.erro });
    if (Object.keys(v.patch).length === 0) return res.json({ config: c.cfg });
    const { data, error } = await db.from("agendamento_config").update({ ...v.patch, updated_at: new Date().toISOString() }).eq("tenant_id", c.tenantId).select("*").maybeSingle();
    if (error) {
      if ((error as any).code === "23505") return res.status(409).json({ error: "Esse endereço público já está em uso. Escolha outro." });
      console.error("[agendamento] config:", error.message);
      return res.status(500).json({ error: "Não foi possível salvar a configuração." });
    }
    await auditar(c.tenantId, null, c.op, "CONFIG", `Alterou: ${Object.keys(v.patch).join(", ")}`);
    res.json({ config: data });
  });

  /** Cria a reserva pela equipe: horários marcados ou encaixe manual, com o recebimento já escolhido. */
  app.post("/api/agendamento/reservas", requireUser, async (req: any, res) => {
    const c = await contexto(req, res);
    if (!c) return;
    const { tenantId, cfg, op } = c;
    if (!pode(op, cfg, "criar")) return res.status(403).json({ error: "Você não tem permissão para criar reservas." });
    const b = req.body ?? {};

    const nome = nomeLimpo(b.nome);
    const telefone = soDigitos(b.telefone);
    const email = String(b.email ?? "").trim().toLowerCase();
    if (nome.length < 2) return res.status(400).json({ error: "Informe o nome do cliente." });
    if (telefone && (telefone.length < 10 || telefone.length > 13)) return res.status(400).json({ error: "Telefone inválido." });
    if (email && !emailValido(email)) return res.status(400).json({ error: "E-mail inválido." });
    if (!telefone && !email && !pode(op, cfg, "sem_contato")) return res.status(400).json({ error: "Informe o WhatsApp ou o e-mail do cliente." });

    const data = limpaData(b.data);
    const manual = b.manual && typeof b.manual === "object" ? b.manual : null;
    const horas: string[] = Array.isArray(b.horas) ? b.horas.map(String) : [];
    if (!manual && horas.length === 0) return res.status(400).json({ error: "Escolha pelo menos um horário." });
    if (horas.length > MAX_HORAS_POR_PEDIDO) return res.status(400).json({ error: "Horários demais em uma reserva." });
    const qtdRecursos = Number(b.qtdRecursos);
    const qtdPessoas = Number(b.qtdPessoas);
    const mesaPedida = b.mesa?.ativo === true;
    if (mesaPedida && !cfg.mesas_ativo) return res.status(400).json({ error: "Reserva de mesa não está habilitada." });

    let blocos: Bloco[];
    let valores: number[];
    if (manual) {
      const duracao = Number(manual.duracao);
      const valor = Number(manual.valor);
      if (!Number.isFinite(valor) || valor < 0 || valor > 1_000_000) return res.status(400).json({ error: "Valor inválido." });
      if (!/^\d{1,2}:\d{2}$/.test(String(manual.hora))) return res.status(400).json({ error: "Horário inválido." });
      blocos = [{ hora: String(manual.hora), duracao }];
      valores = [centavos(valor)];
    } else {
      blocos = agruparBlocos(horas);
      const totalHoras = blocos.reduce((s, x) => s + x.duracao, 0);
      valores = ratearValor(totalPadrao(data, configParaEngine(cfg), qtdRecursos, totalHoras), blocos);
    }

    const eng = configParaEngine(cfg);
    const agora = agoraNoFuso(Date.now(), cfg.fuso);
    await expirar(tenantId);
    const existentes = (await reservasDoDia(tenantId, data)).map(linhaParaLite);
    for (const bl of blocos) {
      const r = validarReserva({ data, hora: bl.hora, duracao: bl.duracao, qtdRecursos, qtdPessoas, mesa: mesaPedida, mesaCadeiras: Number(b.mesa?.cadeiras) || 0 }, eng, existentes, { agora, equipe: true, manual: !!manual });
      if (r.ok === false) return res.status(400).json({ error: r.erro, code: r.codigo });
    }

    const totalGeral = centavos(valores.reduce((s, v) => s + v, 0));
    const pedido: PedidoPagamento = { modo: "pendente", ...(b.pagamento ?? {}) };
    if (pedido.modo !== "pendente" && !pode(op, cfg, "receber")) return res.status(403).json({ error: "Você não tem permissão para receber pagamentos." });
    const plano = planejarPagamento(pedido, totalGeral, op.admin);
    if (plano.ok === false) return res.status(400).json({ error: plano.erro });
    const p = plano.plano;
    const valoresFinais = p.valor_total === 0 ? valores.map(() => 0) : valores;
    const mistoPorFaixa = pedido.modo === "receber" && p.forma_pagamento === "MISTO" ? repartirMisto(p.detalhes_pagamento, valoresFinais) : null;

    const grupoId = crypto.randomUUID();
    const leadId = await leadDoContato(tenantId, nome, telefone, email, "Agendamento", `Reserva criada pela equipe (${op.nome}) para ${data}.`);
    const itens = blocos.map((bl, i) => ({
      grupo_id: grupoId, data, hora: bl.hora, duracao: bl.duracao, qtd_recursos: qtdRecursos, qtd_pessoas: qtdPessoas, valor_total: valoresFinais[i],
      tipo_evento: textoLivre(b.tipoEvento, 60) || null, observacoes: [textoLivre(b.observacoes, 800), p.observacao, manual ? "[Manual]" : ""].filter(Boolean).join(" ") || null,
      status: p.status, status_pagamento: p.status_pagamento, forma_pagamento: p.forma_pagamento,
      detalhes_pagamento: mistoPorFaixa ? mistoPorFaixa[i] : p.valor_total === 0 ? p.detalhes_pagamento : p.detalhes_pagamento.length === 1 ? [{ method: p.detalhes_pagamento[0].method, amount: valoresFinais[i] }] : p.detalhes_pagamento,
      pagar_no_local: p.pagar_no_local, comanda: p.comanda ?? null,
      mesa: mesaPedida, mesa_cadeiras: mesaPedida ? Number(b.mesa?.cadeiras) || null : null, aniversariante: mesaPedida || b.mesa?.aniversariante ? textoLivre(b.mesa?.aniversariante, 80) || null : null,
      origem: "equipe", criado_por: op.id, criado_por_nome: op.nome, lead_id: leadId, contato_nome: nome, contato_telefone: telefone || null, contato_email: email || null,
    }));

    const { data: criadas, error } = await db.rpc("agendamento_reservar", { p_tenant: tenantId, p_itens: itens });
    if (error) { const m = mensagemDeErroDoBanco(error); if (m.status === 500) console.error("[agendamento] reservar:", error.message); return res.status(m.status).json({ error: m.erro, code: m.code }); }
    const linhas = (criadas ?? []) as LinhaReserva[];
    for (const r of linhas) {
      await auditar(tenantId, r.id, op, "CRIOU", `Reserva de ${nome} em ${data} às ${horaParaExibir(r.hora)} (${r.qtd_recursos} unid.)${p.status_pagamento === "Pago" ? " — recebida" : ""}`);
      if (p.status_pagamento === "Pago") await sincronizar(tenantId, r, { papelLead: "ganho" });
    }
    res.status(201).json({ ok: true, reservas: linhas });
  });

  /** Edita uma reserva (horário, quantidades, observações, valor). Mudança de horário/quantidade confere a vaga. */
  app.patch("/api/agendamento/reservas/:id", requireUser, async (req: any, res) => {
    const c = await contexto(req, res);
    if (!c) return;
    const { tenantId, cfg, op } = c;
    if (!pode(op, cfg, "editar")) return res.status(403).json({ error: "Você não tem permissão para editar reservas." });
    const atual = await reservaPorId(tenantId, req.params.id);
    if (!atual) return res.status(404).json({ error: "Reserva não encontrada." });
    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};

    const data = b.data !== undefined ? limpaData(b.data) : limpaData(atual.data);
    const hora = b.hora !== undefined ? String(b.hora) : atual.hora;
    const duracao = b.duracao !== undefined ? Number(b.duracao) : Number(atual.duracao);
    const qtdRecursos = b.qtdRecursos !== undefined ? Number(b.qtdRecursos) : atual.qtd_recursos;
    const qtdPessoas = b.qtdPessoas !== undefined ? Number(b.qtdPessoas) : atual.qtd_pessoas;
    const mesa = b.mesa !== undefined ? b.mesa === true : atual.mesa;
    const cadeiras = b.mesaCadeiras !== undefined ? Number(b.mesaCadeiras) || 0 : atual.mesa_cadeiras ?? 0;

    const mudouAgenda = data !== limpaData(atual.data) || hora !== atual.hora || duracao !== Number(atual.duracao) || qtdRecursos !== atual.qtd_recursos;
    if (mesa && !cfg.mesas_ativo) return res.status(400).json({ error: "Reserva de mesa não está habilitada." });
    if (mudouAgenda || (mesa && !atual.mesa)) {
      const outras = (await reservasDoDia(tenantId, data)).map(linhaParaLite);
      const r = validarReserva({ data, hora, duracao, qtdRecursos, qtdPessoas, mesa, mesaCadeiras: cadeiras }, configParaEngine(cfg), outras, { agora: agoraNoFuso(Date.now(), cfg.fuso), equipe: true, manual: true, excluirId: atual.id });
      if (r.ok === false) return res.status(400).json({ error: r.erro, code: r.codigo });
      Object.assign(patch, { data, hora, duracao, qtd_recursos: qtdRecursos });
    }
    if (b.qtdPessoas !== undefined) {
      if (!Number.isInteger(qtdPessoas) || qtdPessoas < 1 || qtdPessoas > maxPessoas(qtdRecursos, cfg.pessoas_por_recurso)) return res.status(400).json({ error: `Para ${qtdRecursos} unidade(s), o máximo é ${maxPessoas(qtdRecursos, cfg.pessoas_por_recurso)} pessoas.` });
      patch.qtd_pessoas = qtdPessoas;
    }
    if (b.valorTotal !== undefined) {
      if (!op.admin) return res.status(403).json({ error: "Só o administrador altera o valor da reserva." });
      const v = Number(b.valorTotal);
      if (!Number.isFinite(v) || v < 0 || v > 1_000_000) return res.status(400).json({ error: "Valor inválido." });
      patch.valor_total = centavos(v);
    }
    if (b.tipoEvento !== undefined) patch.tipo_evento = textoLivre(b.tipoEvento, 60) || null;
    if (b.observacoes !== undefined) patch.observacoes = textoLivre(b.observacoes, 1000) || null;
    if (b.comanda !== undefined) patch.comanda = textoLivre(b.comanda, 40) || null;
    if (b.mesa !== undefined) patch.mesa = mesa;
    if (b.mesaCadeiras !== undefined) patch.mesa_cadeiras = mesa ? cadeiras || null : null;
    if (b.aniversariante !== undefined) patch.aniversariante = textoLivre(b.aniversariante, 80) || null;
    if (b.contatoNome !== undefined) { const n = nomeLimpo(b.contatoNome); if (n.length < 2) return res.status(400).json({ error: "Informe o nome." }); patch.contato_nome = n; }
    if (b.contatoTelefone !== undefined) { const t = soDigitos(b.contatoTelefone); if (t && (t.length < 10 || t.length > 13)) return res.status(400).json({ error: "Telefone inválido." }); patch.contato_telefone = t || null; }
    if (b.contatoEmail !== undefined) { const e = String(b.contatoEmail).trim().toLowerCase(); if (e && !emailValido(e)) return res.status(400).json({ error: "E-mail inválido." }); patch.contato_email = e || null; }
    if (Object.keys(patch).length === 0) return res.json({ ok: true, reserva: atual });

    const { data: nova, error } = await db.rpc("agendamento_atualizar", { p_tenant: tenantId, p_id: atual.id, p_patch: patch });
    if (error) { const m = mensagemDeErroDoBanco(error); if (m.status === 500) console.error("[agendamento] atualizar:", error.message); return res.status(m.status).json({ error: m.erro, code: m.code }); }
    await auditar(tenantId, atual.id, op, "EDITOU", `Campos: ${Object.keys(patch).join(", ")}`);
    await sincronizar(tenantId, nova as LinhaReserva);
    res.json({ ok: true, reserva: nova });
  });

  /** Cancelar (com motivo) ou voltar para pendente. Confirmar é feito pelo recebimento. */
  app.post("/api/agendamento/reservas/:id/status", requireUser, async (req: any, res) => {
    const c = await contexto(req, res);
    if (!c) return;
    const { tenantId, cfg, op } = c;
    const atual = await reservaPorId(tenantId, req.params.id);
    if (!atual) return res.status(404).json({ error: "Reserva não encontrada." });
    const status = String(req.body?.status ?? "") as StatusReserva;
    if (status === "Cancelada") {
      if (!pode(op, cfg, "cancelar")) return res.status(403).json({ error: "Você não tem permissão para cancelar reservas." });
      const motivo = textoLivre(req.body?.motivo, 300);
      if (motivo.length < 3) return res.status(400).json({ error: "Informe o motivo do cancelamento." });
      const { data: nova, error } = await db.rpc("agendamento_atualizar", { p_tenant: tenantId, p_id: atual.id, p_patch: { status: "Cancelada", motivo_cancelamento: motivo } });
      if (error) return res.status(mensagemDeErroDoBanco(error).status).json({ error: mensagemDeErroDoBanco(error).erro });
      await auditar(tenantId, atual.id, op, "CANCELOU", motivo);
      await sincronizar(tenantId, nova as LinhaReserva);
      return res.json({ ok: true, reserva: nova });
    }
    if (status === "Pendente") {
      if (!pode(op, cfg, "editar")) return res.status(403).json({ error: "Você não tem permissão para editar reservas." });
      if (atual.status_pagamento === "Pago") return res.status(409).json({ error: "Reserva já paga: para desfazer, cancele e estorne o pagamento." });
      const { data: nova, error } = await db.rpc("agendamento_atualizar", { p_tenant: tenantId, p_id: atual.id, p_patch: { status: "Pendente", checkin_ids: [], noshow_ids: [] } });
      if (error) return res.status(mensagemDeErroDoBanco(error).status).json({ error: mensagemDeErroDoBanco(error).erro });
      await auditar(tenantId, atual.id, op, "STATUS", "Voltou para pendente");
      await sincronizar(tenantId, nova as LinhaReserva);
      return res.json({ ok: true, reserva: nova });
    }
    return res.status(400).json({ error: "Status inválido. Para confirmar, registre o recebimento." });
  });

  /** Check-in / no-show de UMA unidade (uma pista numa hora). */
  app.post("/api/agendamento/reservas/:id/unidade", requireUser, async (req: any, res) => {
    const c = await contexto(req, res);
    if (!c) return;
    const { tenantId, cfg, op } = c;
    if (!pode(op, cfg, "editar")) return res.status(403).json({ error: "Você não tem permissão para editar reservas." });
    const atual = await reservaPorId(tenantId, req.params.id);
    if (!atual) return res.status(404).json({ error: "Reserva não encontrada." });
    if (atual.status === "Cancelada") return res.status(409).json({ error: "Reserva cancelada." });
    const tipo = req.body?.tipo === "NO_SHOW" ? "NO_SHOW" : req.body?.tipo === "CHECK_IN" ? "CHECK_IN" : null;
    const uid = String(req.body?.uid ?? "");
    if (!tipo) return res.status(400).json({ error: "Tipo inválido." });
    // Só aceita unidades que existem nesta reserva (evita lixo nas listas).
    const horaIni = Math.floor(minutosDaHora(atual.hora) / 60);
    const horasReserva = Array.from({ length: Math.max(1, Math.ceil(Number(atual.duracao))) }, (_, i) => horaIni + i);
    const validos = new Set(horasReserva.flatMap((h) => Array.from({ length: atual.qtd_recursos }, (_, i) => unidadeId(atual.id, h, i + 1))));
    if (!validos.has(uid)) return res.status(400).json({ error: "Unidade inválida para esta reserva." });
    const m = marcarUnidade({ status: atual.status, checkinIds: atual.checkin_ids ?? [], noshowIds: atual.noshow_ids ?? [] }, uid, tipo);
    const { data: nova, error } = await db.rpc("agendamento_atualizar", { p_tenant: tenantId, p_id: atual.id, p_patch: { status: m.status, checkin_ids: m.checkinIds, noshow_ids: m.noshowIds } });
    if (error) return res.status(mensagemDeErroDoBanco(error).status).json({ error: mensagemDeErroDoBanco(error).erro });
    await auditar(tenantId, atual.id, op, tipo === "CHECK_IN" ? "CHECK_IN" : "NO_SHOW", uid);
    await sincronizar(tenantId, nova as LinhaReserva);
    res.json({ ok: true, reserva: nova });
  });

  /** Qual pista cada unidade usou (definido no check-in). */
  app.post("/api/agendamento/reservas/:id/recursos", requireUser, async (req: any, res) => {
    const c = await contexto(req, res);
    if (!c) return;
    const { tenantId, cfg, op } = c;
    if (!pode(op, cfg, "editar")) return res.status(403).json({ error: "Você não tem permissão para editar reservas." });
    const atual = await reservaPorId(tenantId, req.params.id);
    if (!atual) return res.status(404).json({ error: "Reserva não encontrada." });
    const lista: unknown = req.body?.recursos;
    if (!Array.isArray(lista) || lista.length > atual.qtd_recursos || lista.some((n) => !Number.isInteger(n) || n < 1 || n > cfg.qtd_recursos) || new Set(lista).size !== lista.length) {
      return res.status(400).json({ error: `Escolha até ${atual.qtd_recursos} número(s) entre 1 e ${cfg.qtd_recursos}, sem repetir.` });
    }
    const { data: nova, error } = await db.rpc("agendamento_atualizar", { p_tenant: tenantId, p_id: atual.id, p_patch: { recursos_atribuidos: lista } });
    if (error) return res.status(mensagemDeErroDoBanco(error).status).json({ error: mensagemDeErroDoBanco(error).erro });
    await auditar(tenantId, atual.id, op, "ATRIBUIU", `${cfg.recurso_plural}: ${(lista as number[]).join(", ") || "nenhuma"}`);
    res.json({ ok: true, reserva: nova });
  });

  /** Recebimento: dinheiro, pix, cartão, misto, cortesia (admin), comanda ou baixa pela comanda. Vale para a reserva ou para o grupo todo. */
  app.post("/api/agendamento/reservas/:id/pagamento", requireUser, async (req: any, res) => {
    const c = await contexto(req, res);
    if (!c) return;
    const { tenantId, cfg, op } = c;
    if (!pode(op, cfg, "receber")) return res.status(403).json({ error: "Você não tem permissão para receber pagamentos." });
    const base = await reservaPorId(tenantId, req.params.id);
    if (!base) return res.status(404).json({ error: "Reserva não encontrada." });
    let alvo: LinhaReserva[] = [base];
    if (req.body?.grupo === true) {
      const { data: irmas } = await db.from("agendamento_reservas").select("*").eq("tenant_id", tenantId).eq("grupo_id", base.grupo_id).neq("status", "Cancelada").order("inicio_min");
      alvo = (irmas ?? []) as LinhaReserva[];
    }
    if (alvo.some((r) => r.status_pagamento === "Pago" || r.status_pagamento === "Reembolsado")) return res.status(409).json({ error: "Essa reserva já foi paga." });
    const valores = alvo.map((r) => Number(r.valor_total));
    const total = centavos(valores.reduce((s, v) => s + v, 0));
    const pedido = req.body?.pedido as PedidoPagamento;
    const plano = planejarPagamento(pedido ?? { modo: "pendente" }, total, op.admin);
    if (plano.ok === false) return res.status(400).json({ error: plano.erro });
    const p = plano.plano;
    const valoresFinais = p.valor_total === 0 ? valores.map(() => 0) : valores;
    const misto = p.forma_pagamento === "MISTO" ? repartirMisto(p.detalhes_pagamento, valoresFinais) : null;
    const atualizadas: LinhaReserva[] = [];
    for (let i = 0; i < alvo.length; i++) {
      const r = alvo[i];
      const detalhes = misto ? misto[i] : p.detalhes_pagamento.length === 1 && p.valor_total !== 0 ? [{ method: p.detalhes_pagamento[0].method, amount: valoresFinais[i] }] : p.detalhes_pagamento;
      const patchPag: Record<string, unknown> = {
        status: r.status === "Check-in" && p.status === "Confirmada" ? "Check-in" : p.status, status_pagamento: p.status_pagamento, forma_pagamento: p.forma_pagamento,
        detalhes_pagamento: detalhes, pagar_no_local: p.pagar_no_local,
        ...(p.comanda !== undefined ? { comanda: p.comanda } : {}), ...(p.valor_total === 0 ? { valor_total: 0 } : {}),
        ...(p.observacao ? { observacoes: [r.observacoes, p.observacao].filter(Boolean).join(" ") } : {}),
      };
      const { data: nova, error } = await db.rpc("agendamento_atualizar", { p_tenant: tenantId, p_id: r.id, p_patch: patchPag });
      if (error) { const m = mensagemDeErroDoBanco(error); if (m.status === 500) console.error("[agendamento] pagamento:", error.message); return res.status(m.status).json({ error: m.erro, code: m.code, parcial: atualizadas.map((x) => x.id) }); }
      atualizadas.push(nova as LinhaReserva);
      await auditar(tenantId, r.id, op, "PAGAMENTO", `${pedido.modo}${p.forma_pagamento ? ` · ${p.forma_pagamento}` : ""}${p.comanda ? ` · comanda ${p.comanda}` : ""}`);
      await sincronizar(tenantId, nova as LinhaReserva, { papelLead: p.status_pagamento === "Pago" ? "ganho" : undefined });
    }
    res.json({ ok: true, reservas: atualizadas });
  });

  app.get("/api/agendamento/reservas/:id/auditoria", requireUser, async (req: any, res) => {
    const c = await contexto(req, res);
    if (!c) return;
    if (!uuidOk(req.params.id)) return res.status(404).json({ error: "Reserva não encontrada." });
    const { data } = await db.from("agendamento_auditoria").select("id, user_nome, acao, detalhes, created_at").eq("tenant_id", c.tenantId).eq("reserva_id", req.params.id).order("created_at", { ascending: false }).limit(100);
    res.json({ itens: data ?? [] });
  });

  // ═══ PÁGINA PÚBLICA ══════════════════════════════════════════════════════

  /** Empresa pela página pública: precisa existir, estar com o módulo ligado e aceitar reservas. */
  const empresaPublica = async (slug: string, res: Response) => {
    if (!pronto(res)) return null;
    const s = String(slug || "").toLowerCase();
    if (!SLUG_REGEX.test(s)) { res.status(404).json({ error: "Página não encontrada." }); return null; }
    const { data: cfg } = await db.from("agendamento_config").select("*").ilike("slug", s).maybeSingle();
    if (!cfg || !(await moduloLigado(cfg.tenant_id))) { res.status(404).json({ error: "Página não encontrada." }); return null; }
    return cfg as LinhaConfig;
  };
  const tokenMp = async (tenantId: string): Promise<string | null> => {
    const { data } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_payments").maybeSingle();
    const t = data?.value?.mercadoPago?.accessToken;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  };
  const linkPagamentoPossivel = async (cfg: LinhaConfig) => cfg.pagamento_online && !!(await tokenMp(cfg.tenant_id));

  app.get("/api/agendar/:slug/config", limiterPublico, async (req, res) => {
    const cfg = await empresaPublica(req.params.slug, res);
    if (!cfg) return;
    res.json({
      ativo: cfg.ativo, nome: cfg.nome_estabelecimento, endereco: cfg.endereco, telefone: cfg.telefone, whatsapp: cfg.whatsapp, logoUrl: cfg.logo_url,
      recursoSingular: cfg.recurso_singular, recursoPlural: cfg.recurso_plural, qtdRecursos: cfg.qtd_recursos, pessoasPorRecurso: cfg.pessoas_por_recurso,
      precoDiaUtil: Number(cfg.preco_dia_util), precoFimSemana: Number(cfg.preco_fim_semana), diasFimSemana: cfg.dias_fim_semana, horarios: cfg.horarios,
      datasBloqueadas: (cfg.datas_bloqueadas ?? []).map((d) => String(d).slice(0, 10)), tiposEvento: cfg.tipos_evento, mesasAtivo: cfg.mesas_ativo, cadeirasMax: cfg.cadeiras_max,
      expiracaoMin: cfg.expiracao_pendente_min, pagamentoOnline: await linkPagamentoPossivel(cfg), hoje: agoraNoFuso(Date.now(), cfg.fuso).data,
    });
  });

  /** Horários do dia com as vagas que restam. Não expõe nada de outras reservas. */
  app.get("/api/agendar/:slug/disponibilidade", limiterPublico, async (req, res) => {
    const cfg = await empresaPublica(req.params.slug, res);
    if (!cfg) return;
    const data = limpaData(req.query.data);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: "Data inválida." });
    const agora = agoraNoFuso(Date.now(), cfg.fuso);
    const reservas = (await reservasDoDia(cfg.tenant_id, data)).map(linhaParaLite);
    const slots = gerarSlots(data, configParaEngine(cfg), reservas, { agora });
    const mesasNoDia = reservas.filter((r) => r.mesa && r.status !== "Cancelada").length;
    res.json({ data, slots: slots.map((s) => ({ hora: s.hora, rotulo: s.rotulo, disponivel: s.disponivel, livres: s.livres })), mesasDisponiveis: Math.max(0, cfg.mesas_max_por_dia - mesasNoDia) });
  });

  app.post("/api/agendar/:slug/reservar", limiterPublico, async (req, res) => {
    const cfg = await empresaPublica(req.params.slug, res);
    if (!cfg) return;
    if (!cfg.ativo) return res.status(403).json({ error: "As reservas online estão pausadas. Fale conosco pelo WhatsApp." });
    const b = req.body ?? {};
    if (b.website) return res.status(200).json({ ok: true }); // isca para robôs: campo escondido que gente de verdade não preenche

    const nome = nomeLimpo(b.nome);
    const telefone = soDigitos(b.telefone);
    const email = String(b.email ?? "").trim().toLowerCase();
    if (nome.length < 2) return res.status(400).json({ error: "Informe seu nome." });
    if (telefone.length < 10 || telefone.length > 13) return res.status(400).json({ error: "Informe um WhatsApp válido, com DDD." });
    if (email && !emailValido(email)) return res.status(400).json({ error: "E-mail inválido." });

    const data = limpaData(b.data);
    const horas: string[] = Array.isArray(b.horas) ? b.horas.map(String) : [];
    if (horas.length === 0) return res.status(400).json({ error: "Escolha pelo menos um horário." });
    if (horas.length > MAX_HORAS_POR_PEDIDO) return res.status(400).json({ error: "Horários demais em uma reserva." });
    if (horas.some((h) => !/^\d{1,2}:00$/.test(h))) return res.status(400).json({ error: "Horário inválido." }); // a página pública só vende horas cheias
    const qtdRecursos = Number(b.qtdRecursos);
    const qtdPessoas = Number(b.qtdPessoas);
    const mesaPedida = cfg.mesas_ativo && b.mesa?.ativo === true;

    await expirar(cfg.tenant_id);

    // Anti-abuso: uma pessoa não segura a agenda inteira com reservas que ela nunca vai pagar.
    const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: abertas } = await db.from("agendamento_reservas").select("grupo_id").eq("tenant_id", cfg.tenant_id).eq("origem", "site").eq("contato_telefone", telefone).in("status", ["Pendente", "Confirmada"]).gte("created_at", desde).gte("data", agoraNoFuso(Date.now(), cfg.fuso).data);
    if (new Set((abertas ?? []).map((x: any) => x.grupo_id)).size >= MAX_PEDIDOS_ABERTOS_POR_TELEFONE) {
      return res.status(429).json({ error: "Você já tem reservas em aberto. Conclua ou fale conosco para reservar mais." });
    }

    const eng = configParaEngine(cfg);
    const agora = agoraNoFuso(Date.now(), cfg.fuso);
    const blocos = agruparBlocos(horas);
    const existentes = (await reservasDoDia(cfg.tenant_id, data)).map(linhaParaLite);
    for (const bl of blocos) {
      const r = validarReserva({ data, hora: bl.hora, duracao: bl.duracao, qtdRecursos, qtdPessoas, mesa: mesaPedida, mesaCadeiras: Number(b.mesa?.cadeiras) || 0 }, eng, existentes, { agora });
      if (r.ok === false) return res.status(400).json({ error: r.erro, code: r.codigo });
    }

    const totalHoras = blocos.reduce((s, x) => s + x.duracao, 0);
    const total = totalPadrao(data, eng, qtdRecursos, totalHoras); // o preço SEMPRE vem do servidor, nunca do navegador
    const valores = ratearValor(total, blocos);
    const online = await linkPagamentoPossivel(cfg);
    const grupoId = crypto.randomUUID();
    const leadId = await leadDoContato(cfg.tenant_id, nome, telefone, email, "Agendamento (site)", `Reserva pelo site para ${data}.`);
    const itens = blocos.map((bl, i) => ({
      grupo_id: grupoId, data, hora: bl.hora, duracao: bl.duracao, qtd_recursos: qtdRecursos, qtd_pessoas: qtdPessoas, valor_total: valores[i],
      tipo_evento: cfg.tipos_evento.includes(String(b.tipoEvento)) ? String(b.tipoEvento) : null, observacoes: textoLivre(b.observacoes, 500) || null,
      status: "Pendente", status_pagamento: "Pendente",
      // Sem pagamento online, a reserva fica "a pagar no local" (não expira) e a equipe confirma no balcão.
      pagar_no_local: !online, mesa: mesaPedida, mesa_cadeiras: mesaPedida ? Number(b.mesa?.cadeiras) || null : null, aniversariante: mesaPedida ? textoLivre(b.mesa?.aniversariante, 80) || null : null,
      origem: "site", lead_id: leadId, contato_nome: nome, contato_telefone: telefone, contato_email: email || null,
    }));
    const { data: criadas, error } = await db.rpc("agendamento_reservar", { p_tenant: cfg.tenant_id, p_itens: itens });
    if (error) { const m = mensagemDeErroDoBanco(error); if (m.status === 500) console.error("[agendamento] reservar (site):", error.message); return res.status(m.status).json({ error: m.erro, code: m.code }); }
    const linhas = (criadas ?? []) as LinhaReserva[];
    for (const r of linhas) await auditar(cfg.tenant_id, r.id, null, "CRIOU", `Reserva pelo site de ${nome} em ${data} às ${horaParaExibir(r.hora)}`);

    const token = assinar(grupoId, chave);
    const resumo = linhas.map((r) => ({ data: limpaData(r.data), hora: r.hora, rotulo: horaParaExibir(r.hora), duracao: Number(r.duracao), qtdRecursos: r.qtd_recursos }));
    if (!online) return res.status(201).json({ ok: true, grupoId, token, total, reservas: resumo, pagamento: { tipo: "local" } });

    try {
      const mp = await tokenMp(cfg.tenant_id);
      const expiraEm = new Date(Date.now() + cfg.expiracao_pendente_min * 60_000);
      const pref = montarPreferenciaMP({
        nomeEstabelecimento: cfg.nome_estabelecimento || "Reserva", grupoId, total, descricao: `Dia ${data.split("-").reverse().join("/")} às ${horaParaExibir(blocos[0].hora)}`,
        pagador: { nome, ...(email ? { email } : {}) }, expiraEm,
        urlNotificacao: `${appUrl}/api/agendamento/mp-webhook/${cfg.tenant_id}?t=${assinar(cfg.tenant_id, chave)}`,
        urlRetorno: `${appUrl}/agendar/${cfg.slug}?grupo=${grupoId}&t=${token}`,
      });
      const { data: mpResp } = await axios.post("https://api.mercadopago.com/checkout/preferences", pref, { headers: { Authorization: `Bearer ${mp}`, "Content-Type": "application/json" }, timeout: 15000 });
      await db.from("agendamento_reservas").update({ mp_preference_id: String(mpResp?.id ?? "") || null }).eq("grupo_id", grupoId).eq("tenant_id", cfg.tenant_id);
      return res.status(201).json({ ok: true, grupoId, token, total, reservas: resumo, pagamento: { tipo: "online", url: mpResp?.init_point, expiraEm: expiraEm.toISOString() } });
    } catch (e: any) {
      // Não conseguiu gerar a cobrança: libera as vagas na hora (não deixa reserva "presa" por 30 minutos).
      console.error("[agendamento] Mercado Pago:", e?.response?.data?.message || e?.message);
      await db.from("agendamento_reservas").update({ status: "Cancelada", motivo_cancelamento: "Falha ao gerar a cobrança online" }).eq("grupo_id", grupoId).eq("tenant_id", cfg.tenant_id);
      return res.status(502).json({ error: "Não foi possível abrir o pagamento agora. Tente novamente em instantes." });
    }
  });

  /** Situação de um pedido (a página consulta ao voltar do Mercado Pago). Só com o link assinado. */
  app.get("/api/agendar/:slug/pedido/:grupoId", limiterPublico, async (req, res) => {
    const cfg = await empresaPublica(req.params.slug, res);
    if (!cfg) return;
    const grupoId = String(req.params.grupoId);
    if (!uuidOk(grupoId) || !conferirAssinatura(grupoId, String(req.query.t ?? ""), chave)) return res.status(404).json({ error: "Pedido não encontrado." });
    const { data } = await db.from("agendamento_reservas").select("data, hora, duracao, qtd_recursos, status, status_pagamento, valor_total, created_at").eq("tenant_id", cfg.tenant_id).eq("grupo_id", grupoId).order("inicio_min");
    const linhas = data ?? [];
    if (linhas.length === 0) return res.status(404).json({ error: "Pedido não encontrado." });
    const situacao = linhas.every((r: any) => r.status_pagamento === "Pago") ? "pago" : linhas.every((r: any) => r.status === "Cancelada") ? (linhas.some((r: any) => r.status_pagamento === "Reembolsado") ? "estornado" : "cancelado") : "aguardando";
    res.json({ situacao, total: centavos(linhas.reduce((s: number, r: any) => s + Number(r.valor_total), 0)), reservas: linhas.map((r: any) => ({ data: limpaData(r.data), rotulo: horaParaExibir(r.hora), duracao: Number(r.duracao), qtdRecursos: r.qtd_recursos })) });
  });

  // ═══ MERCADO PAGO ════════════════════════════════════════════════════════

  /**
   * Aviso de pagamento. O link é assinado (só o Mercado Pago, que recebeu o link ao criar a cobrança, o conhece) e o
   * pagamento é SEMPRE conferido direto na API do Mercado Pago com a chave da empresa — o corpo do aviso não é confiável.
   */
  const webhook: RequestHandler = async (req: any, res: Response) => {
    res.status(200); // o Mercado Pago só precisa de um 200; erros são tratados internamente
    try {
      const tenantId = String(req.params.tenantId);
      if (!uuidOk(tenantId) || !conferirAssinatura(tenantId, String(req.query.t ?? ""), chave) || !db) return res.send("ok");
      const idPag = String(req.query["data.id"] ?? req.query.id ?? req.body?.data?.id ?? req.body?.id ?? "");
      if (!/^\d{4,20}$/.test(idPag)) return res.send("ok");
      const cfg = await carregarConfig(tenantId);
      const mp = await tokenMp(tenantId);
      if (!cfg || !mp) return res.send("ok");

      const { data: pag } = await axios.get(`https://api.mercadopago.com/v1/payments/${idPag}`, { headers: { Authorization: `Bearer ${mp}` }, timeout: 15000 }).catch(() => ({ data: null }));
      if (!pag || pag.status !== "approved" || !uuidOk(pag.external_reference)) return res.send("ok");

      const { data: grupo } = await db.from("agendamento_reservas").select("*").eq("tenant_id", tenantId).eq("grupo_id", pag.external_reference).order("inicio_min");
      const linhas = (grupo ?? []) as LinhaReserva[];
      if (linhas.length === 0 || linhas.every((r) => r.status_pagamento === "Pago" || r.status_pagamento === "Reembolsado")) return res.send("ok"); // já processado

      // Quem paga menos do que o combinado não confirma nada (o original aceitava qualquer valor aprovado).
      const devido = centavos(linhas.reduce((s, r) => s + Number(r.valor_total), 0));
      if (Number(pag.transaction_amount) + 0.01 < devido) {
        await auditar(tenantId, linhas[0].id, { nome: "Mercado Pago" }, "PAGAMENTO_DIVERGENTE", `Recebido R$ ${pag.transaction_amount}, devido R$ ${devido}. Nada foi confirmado.`);
        return res.send("ok");
      }

      const agoraMs = Date.now();
      const eng = configParaEngine(cfg);
      const outrasPorDia = new Map<string, ReturnType<typeof linhaParaLite>[]>();
      let estornar = false;
      let atraso = 0;
      for (const r of linhas) {
        const dia = limpaData(r.data);
        if (!outrasPorDia.has(dia)) outrasPorDia.set(dia, (await reservasDoDia(tenantId, dia)).map(linhaParaLite));
        const d = decidirPagamentoAprovado(linhaParaLite(r), outrasPorDia.get(dia)!, eng, agoraMs);
        atraso = Math.max(atraso, d.atrasoMin);
        if (d.acao === "estornar") estornar = true;
      }

      if (!estornar) {
        const forma = formaPorTipoMercadoPago(pag.payment_type_id);
        for (const r of linhas) {
          const nota = atraso > cfg.expiracao_pendente_min + 5 ? " [PAGO COM ATRASO - VAGA LIVRE]" : "";
          const { data: nova, error } = await db.rpc("agendamento_atualizar", { p_tenant: tenantId, p_id: r.id, p_patch: {
            status: "Confirmada", status_pagamento: "Pago", forma_pagamento: forma, mp_payment_id: idPag, pagar_no_local: false,
            detalhes_pagamento: [{ method: forma, amount: Number(r.valor_total) }], observacoes: `${r.observacoes ?? ""}${nota}`.trim() || null } });
          if (error) { console.error("[agendamento] webhook confirmar:", error.message); continue; }
          await auditar(tenantId, r.id, { nome: "Mercado Pago" }, "PAGAMENTO", `Pagamento online aprovado (${forma})`);
          await sincronizar(tenantId, nova as LinhaReserva, { papelLead: "ganho" });
        }
        return res.send("ok");
      }

      // Pagou depois do prazo e a vaga já foi ocupada por outra pessoa: devolve o dinheiro automaticamente.
      const estornou = await axios.post(`https://api.mercadopago.com/v1/payments/${idPag}/refunds`, {}, { headers: { Authorization: `Bearer ${mp}`, "Content-Type": "application/json", "X-Idempotency-Key": `agendamento-${idPag}` }, timeout: 15000 }).then(() => true, () => false);
      for (const r of linhas) {
        const aviso = estornou
          ? `[ESTORNO AUTOMÁTICO: pagamento recebido com ${Math.round(atraso)} min de atraso e a vaga já estava ocupada.]`
          : `[ERRO NO ESTORNO AUTOMÁTICO: devolver manualmente no Mercado Pago — atraso de ${Math.round(atraso)} min.]`;
        const { data: nova } = await db.rpc("agendamento_atualizar", { p_tenant: tenantId, p_id: r.id, p_patch: { status: "Cancelada", status_pagamento: estornou ? "Reembolsado" : "Pendente Estorno", mp_payment_id: idPag, motivo_cancelamento: "Pagamento fora do prazo sem vaga", observacoes: `${r.observacoes ?? ""} ${aviso}`.trim() } });
        await auditar(tenantId, r.id, { nome: "Mercado Pago" }, estornou ? "ESTORNO" : "ESTORNO_PENDENTE", aviso);
        if (nova) await sincronizar(tenantId, nova as LinhaReserva);
      }
      return res.send("ok");
    } catch (e: any) {
      console.error("[agendamento] webhook:", e?.message);
      return res.send("ok");
    }
  };
  app.post("/api/agendamento/mp-webhook/:tenantId", webhook);
  app.get("/api/agendamento/mp-webhook/:tenantId", webhook);

  // ═══ ROTINA DIÁRIA ═══════════════════════════════════════════════════════

  app.all("/api/agendamento/cron/expirar", async (req: Request, res: Response) => {
    const secret = deps.cronSecret;
    if (!secret || String(req.headers.authorization || "") !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });
    if (!pronto(res)) return;
    const { data, error } = await db.rpc("agendamento_expirar_pendentes", { p_tenant: null });
    if (error) { console.error("[agendamento] cron:", error.message); return res.status(500).json({ ok: false }); }
    res.json({ ok: true, expiradas: data });
  });
}
