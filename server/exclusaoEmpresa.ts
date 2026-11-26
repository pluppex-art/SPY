// Exclusão completa de uma empresa (fase 3 do ciclo de vida), só pelo master e só depois de um backup completo.
// Ordem: 1) confere e registra o plano; 2) desabilita a empresa e pausa os fluxos dela no n8n (dá para desfazer);
// 3) o banco apaga os dados em etapas (spy_exclusao_executar); 4) apaga fora do banco: fluxos, WhatsApp, arquivos, logins e cobrança.
// Nada de fora do banco é apagado antes de o banco terminar. O que falhar na etapa 4 fica pendente para tentar de novo.
import type express from "express";
import axios from "axios";
import { BUCKET_BACKUP, arquivosDaPasta, locaisDosArquivos, type Arquivo } from "./arquivosDaEmpresa.js";
import { criarMotorBackup, lerOpenApiDe, redigir, type Manifest } from "./backupEmpresa.js";

export const VALIDADE_BACKUP_H = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Fluxo { id: string; name: string; active?: boolean; tags?: { name: string }[]; nodes?: unknown }
export interface ItemFluxo { id: string; nome: string; ativo: boolean }
export interface Empresa { id: string; name: string }

const igual = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Quais fluxos do n8n são desta empresa. Apaga só o que tem "[Nome exato da empresa]" no começo, não é modelo/padrão, não cita
 * outra empresa e é uma cópia de cliente (ou cita o id desta). O que só cita a empresa vai para conferência manual, intocado.
 */
export function fluxosDaEmpresa(fluxos: Fluxo[], empresa: Empresa, empresas: Empresa[], tenantRaiz: string) {
  const nome = igual(empresa.name);
  const nomeUnico = !empresas.some((e) => e.id !== empresa.id && igual(e.name) === nome);
  const apagar: ItemFluxo[] = [], revisar: ItemFluxo[] = [];
  for (const f of fluxos) {
    const corpo = JSON.stringify(f.nodes ?? []);
    const cita = corpo.includes(empresa.id);
    const prefixo = /^\s*\[([^\]]+)\]/.exec(f.name)?.[1] ?? "";
    const bate = nomeUnico && igual(prefixo) === nome;
    if (!bate && !cita) continue;
    const tags = (f.tags ?? []).map((t) => igual(t.name));
    const protegido = tags.some((t) => t.startsWith("padrao") || t.startsWith("rodrigo")) || /pluppex|modelo|produto/.test(igual(prefixo));
    const copia = tags.includes("copia-cliente");
    const citaOutra = empresas.some((e) => e.id !== empresa.id && corpo.includes(e.id) && (e.id !== tenantRaiz || !copia));
    const item = { id: f.id, nome: f.name, ativo: !!f.active };
    if (bate && !protegido && !citaOutra && (copia || cita)) apagar.push(item); else revisar.push(item);
  }
  return { apagar, revisar };
}

export interface Instancia { id: string; tenant_id: string; name: string | null; colaborador_id?: string | null }
export interface Bot { tenant_id: string; whatsapp_session: string | null }

/**
 * Nomes que a sessão de WhatsApp da empresa pode ter no WAHA (o id da linha ou o nome dela). O servidor WAHA é compartilhado:
 * um nome que também aparece em outra empresa fica de fora.
 */
export function sessoesDaEmpresa(instancias: Instancia[], bots: Bot[], tenantId: string) {
  const deOutros = new Set<string>();
  for (const i of instancias) if (i.tenant_id !== tenantId) { deOutros.add(i.id); if (i.name) deOutros.add(i.name); }
  for (const b of bots) if (b.tenant_id !== tenantId && b.whatsapp_session) deOutros.add(b.whatsapp_session);
  const minhas = new Set<string>();
  for (const i of instancias) if (i.tenant_id === tenantId) { if (!i.colaborador_id) minhas.add(i.id); if (i.name) minhas.add(i.name); }
  for (const b of bots) if (b.tenant_id === tenantId && b.whatsapp_session) minhas.add(b.whatsapp_session);
  const todas = [...minhas];
  return { apagar: todas.filter((s) => !deOutros.has(s)), compartilhadas: todas.filter((s) => deOutros.has(s)) };
}

/** O backup precisa estar completo, ser recente e conter toda tabela em que a empresa tem registro. Devolve o motivo da recusa. */
export function problemaDoBackup(m: Manifest | null, tenantId: string, tabelas: Record<string, number>, agora: number): string | null {
  if (!m || m.empresa.id !== tenantId) return "Backup não encontrado. Gere um backup desta empresa.";
  if (m.status !== "concluido") return "O backup não está completo. Gere um novo e confira que aparece como Completo.";
  if (agora - Date.parse(m.criadoEm) > VALIDADE_BACKUP_H * 3_600_000) return `O backup tem mais de ${VALIDADE_BACKUP_H} horas. Gere um novo.`;
  const salvas = new Set(m.tabelas.filter((t) => t.status === "ok" && t.linhas > 0).map((t) => t.nome));
  const faltam = Object.keys(tabelas).filter((t) => !t.startsWith("backups.") && !salvas.has(t));
  return faltam.length ? `Há dados que não estão no backup (${faltam.slice(0, 6).join(", ")}${faltam.length > 6 ? "…" : ""}). Gere um novo.` : null;
}

type Categoria = "fluxos" | "sessoes" | "arquivos" | "usuarios" | "cobrancas";
const CATEGORIAS: Categoria[] = ["fluxos", "sessoes", "arquivos", "usuarios", "cobrancas"];
export const ROTULO: Record<Categoria, string> = { fluxos: "Fluxo do n8n", sessoes: "Sessão de WhatsApp", arquivos: "Arquivo", usuarios: "Login", cobrancas: "Assinatura no Asaas" };

export interface Plano {
  statusAnterior: string;
  desativados: string[];
  itens: Record<Categoria, { pendentes: any[]; falhas: { item: any; erro: string }[]; feitos: number }>;
  revisar: ItemFluxo[];
  compartilhadas: string[];
}

export interface Registro { id: string; empresa_id: string; empresa_nome: string; backup_id: string; status: string; plano: Plano; registros_apagados: number; criado_em: string }

export interface Externos {
  /** null = n8n não configurado neste servidor. */
  n8n: null | { listar(): Promise<Fluxo[]>; ler(id: string): Promise<Fluxo | null>; ativar(id: string, ativo: boolean): Promise<void>; apagar(id: string): Promise<void> };
  whatsapp: null | { listar(): Promise<string[]>; apagar(sessao: string): Promise<void> };
  cobranca: null | { cancelar(id: string): Promise<void> };
}

const loginJaNaoExiste = (e: any) => e?.status === 404 || /user not found/i.test(String(e?.message || ""));
const texto = (e: any) => String(e?.message || e || "erro").slice(0, 200);

export function resumo(r: Registro) {
  const itens = r.plano.itens;
  return {
    id: r.id, empresaId: r.empresa_id, empresa: r.empresa_nome, backupId: r.backup_id, status: r.status, criadoEm: r.criado_em, registrosApagados: r.registros_apagados,
    concluido: r.status === "concluida", parado: r.status === "concluida" || r.status === "com_pendencias",
    restantes: CATEGORIAS.reduce((s, c) => s + itens[c].pendentes.length, 0),
    pendencias: CATEGORIAS.flatMap((c) => itens[c].falhas.map((f) => `${ROTULO[c]} ${typeof f.item === "string" ? f.item : f.item.nome ?? f.item.caminho}: ${f.erro}`)),
    revisar: r.plano.revisar.map((f) => f.nome), compartilhadas: r.plano.compartilhadas,
  };
}

export class Recusa extends Error { constructor(message: string, readonly status = 409) { super(message); } }

const SEM_MIGRACAO = "A exclusão ainda não foi instalada no banco (falta aplicar a migração 20261228_excluir_empresa.sql).";
/** O banco respondeu que a tabela ou a função da exclusão não existe. */
const naoInstalada = (e: any) => ["PGRST202", "PGRST205", "42P01"].includes(e?.code) || /could not find the (function|table)|empresa_exclusoes.* does not exist/i.test(String(e?.message || ""));

export function criarMotorExclusao(deps: { db: any; externos: Externos; lerBackup: (tenantId: string, id: string) => Promise<Manifest | null>; tenantRaiz: string; aoMudar?: (tenantId: string) => void; agora?: () => number }) {
  const { db, externos, tenantRaiz } = deps;
  const agora = deps.agora ?? (() => Date.now());

  async function ok<T = any>(consulta: PromiseLike<{ data: T; error: any }>): Promise<T> {
    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    return data;
  }
  async function todas(tabela: string, campos: string): Promise<any[]> {
    const linhas: any[] = [];
    for (let de = 0; ; de += 1000) {
      const lote: any[] = (await ok(db.from(tabela).select(campos).order("id").range(de, de + 999))) || [];
      linhas.push(...lote);
      if (lote.length < 1000) return linhas;
    }
  }
  async function conferirNoBanco(tenantId: string) {
    const { data, error } = await db.rpc("spy_exclusao_conferir", { p_tenant: tenantId });
    if (error) {
      if (naoInstalada(error)) throw new Recusa(SEM_MIGRACAO, 503);
      throw new Error(error.message);
    }
    if (!data?.existe) throw new Recusa("Empresa não encontrada.", 404);
    return data as { existe: true; bloqueios: string[]; tabelas: Record<string, number>; registros: number };
  }
  async function aberta(tenantId: string): Promise<Registro | null> {
    const { data, error } = await db.from("empresa_exclusoes").select("*").eq("empresa_id", tenantId).neq("status", "cancelada").maybeSingle();
    if (error) throw naoInstalada(error) ? new Recusa(SEM_MIGRACAO, 503) : new Error(error.message);
    return data ?? null;
  }
  const salvar = (r: Registro) => ok(db.from("empresa_exclusoes").update({ plano: r.plano, status: r.status, atualizado_em: new Date(agora()).toISOString() }).eq("id", r.id));
  const buscar = async (id: string): Promise<Registro> => {
    const r = await ok(db.from("empresa_exclusoes").select("*").eq("id", id).maybeSingle());
    if (!r) throw new Recusa("Exclusão não encontrada.", 404);
    return r as Registro;
  };

  /** Tudo que existe da empresa fora das tabelas, levantado antes de apagar (depois não dá mais para descobrir). */
  async function levantar(tenantId: string) {
    const empresas: Empresa[] = await todas("tenants", "id, name");
    const empresa = empresas.find((e) => e.id === tenantId)!;
    const [instancias, bots, usuarios] = await Promise.all([
      todas("whatsapp_instances", "id, tenant_id, name, colaborador_id"),
      todas("chatbots", "id, tenant_id, whatsapp_session"),
      ok<any[]>(db.from("users").select("id, is_master").eq("tenant_id", tenantId)),
    ]);
    let fluxos = { apagar: [] as ItemFluxo[], revisar: [] as ItemFluxo[] };
    if (externos.n8n) {
      try { fluxos = fluxosDaEmpresa(await externos.n8n.listar(), empresa, empresas, tenantRaiz); }
      catch (e) { throw new Recusa(`O n8n não respondeu (${texto(e)}). Tente de novo em instantes.`, 502); }
    }
    const sessoes = sessoesDaEmpresa(instancias, bots, tenantId);
    const locais = await locaisDosArquivos(db, tenantId);
    const arquivos: Arquivo[] = [...locais.soltos];
    for (const p of locais.pastas) arquivos.push(...await arquivosDaPasta(db, p));
    const assinatura: any = await ok(db.from("tenant_subscriptions").select("gateway, gateway_subscription_id").eq("tenant_id", tenantId).maybeSingle());
    return {
      empresa, fluxos, sessoes, arquivos,
      usuarios: (usuarios || []).filter((u) => !u.is_master).map((u) => String(u.id)),
      cobrancas: assinatura?.gateway === "asaas" && assinatura.gateway_subscription_id ? [String(assinatura.gateway_subscription_id)] : [],
    };
  }

  /** O que seria apagado. Só lê. */
  async function conferir(tenantId: string) {
    const andamento = await aberta(tenantId);
    if (andamento) return { andamento: resumo(andamento) };
    const banco = await conferirNoBanco(tenantId);
    const l = await levantar(tenantId);
    let sessoes = l.sessoes.apagar, aviso = "";
    if (externos.whatsapp) {
      try { const vivas = new Set(await externos.whatsapp.listar()); sessoes = sessoes.filter((s) => vivas.has(s)); }
      catch { aviso = "O servidor de WhatsApp não respondeu: a lista mostra todas as sessões cadastradas."; }
    }
    return {
      empresa: l.empresa.name, bloqueios: banco.bloqueios, registros: banco.registros, tabelas: Object.keys(banco.tabelas).length,
      usuarios: l.usuarios.length, arquivos: l.arquivos.length, sessoes, compartilhadas: l.sessoes.compartilhadas,
      fluxos: l.fluxos.apagar.map((f) => f.nome), revisar: l.fluxos.revisar.map((f) => f.nome), cobrancas: l.cobrancas.length,
      avisos: [aviso, externos.n8n ? "" : "O n8n não está configurado neste servidor: os fluxos não serão apagados.", externos.whatsapp ? "" : "O WhatsApp (WAHA) não está configurado neste servidor: as sessões ficam pendentes."].filter(Boolean),
    };
  }

  async function reativar(ids: string[]) {
    for (const id of ids) { try { await externos.n8n!.ativar(id, true); } catch (e) { console.error("[exclusao-empresa] não reativou o fluxo", id, texto(e)); } }
  }

  /**
   * Desfaz o que a preparação fez, só se nada chegou a ser apagado. A marca "cancelada" é gravada primeiro e só sobre
   * "iniciada": se o banco ainda estiver apagando (linha travada), a atualização espera, não encontra "iniciada" e nada é desfeito.
   */
  async function cancelar(r: Registro): Promise<boolean> {
    const mudou: any[] = (await ok(db.from("empresa_exclusoes").update({ status: "cancelada", atualizado_em: new Date(agora()).toISOString() }).eq("id", r.id).eq("status", "iniciada").select("id"))) || [];
    if (!mudou.length) return false;
    await reativar(r.plano.desativados);
    await ok(db.from("tenants").update({ status: r.plano.statusAnterior }).eq("id", r.empresa_id));
    deps.aoMudar?.(r.empresa_id);
    return true;
  }

  /** Cancelamento pedido pelo master: só antes de o banco começar a apagar. */
  async function desistir(id: string) {
    if (!(await cancelar(await buscar(id)))) throw new Recusa("Não dá mais para cancelar: a exclusão já começou a apagar.");
  }

  async function iniciar(tenantId: string, pedido: { confirmacao: string; backupId: string }, por: string) {
    const andamento = await aberta(tenantId);
    if (andamento) return resumo(andamento);
    if (tenantId === tenantRaiz) throw new Recusa("A empresa dona do sistema nunca pode ser excluída.");
    const empresa: any = await ok(db.from("tenants").select("name, status").eq("id", tenantId).maybeSingle());
    if (!empresa) throw new Recusa("Empresa não encontrada.", 404);
    if (pedido.confirmacao.trim() !== String(empresa.name).trim()) throw new Recusa("O nome digitado não é igual ao nome da empresa.", 400);
    const banco = await conferirNoBanco(tenantId);
    if (banco.bloqueios.length) throw new Recusa(banco.bloqueios.join(" "));
    const problema = problemaDoBackup(await deps.lerBackup(tenantId, pedido.backupId), tenantId, banco.tabelas, agora());
    if (problema) throw new Recusa(problema);
    const l = await levantar(tenantId);

    const fila = <T,>(pendentes: T[]) => ({ pendentes, falhas: [], feitos: 0 });
    const plano: Plano = {
      statusAnterior: empresa.status || "Active", desativados: [], revisar: l.fluxos.revisar, compartilhadas: l.sessoes.compartilhadas,
      itens: { fluxos: fila(l.fluxos.apagar), sessoes: fila(l.sessoes.apagar), arquivos: fila(l.arquivos), usuarios: fila(l.usuarios), cobrancas: fila(l.cobrancas) },
    };
    const r: Registro = await ok(db.from("empresa_exclusoes").insert({ empresa_id: tenantId, empresa_nome: empresa.name, backup_id: pedido.backupId, excluido_por: por, plano }).select("*").single());
    try {
      await ok(db.from("tenants").update({ status: "Inactive" }).eq("id", tenantId));
      deps.aoMudar?.(tenantId);
      for (const f of r.plano.itens.fluxos.pendentes as ItemFluxo[]) {
        if (!f.ativo) continue;
        await externos.n8n!.ativar(f.id, false);
        r.plano.desativados.push(f.id);
        await salvar(r);
      }
    } catch (e) {
      await cancelar(r);
      throw new Recusa(`Nada foi excluído: não foi possível preparar a empresa (${texto(e)}).`, 502);
    }
    return resumo(r);
  }

  async function apagarItem(r: Registro, categoria: Categoria, item: any, vivas: () => Promise<Set<string>>) {
    if (categoria === "fluxos") {
      if (!externos.n8n) throw new Error("n8n não configurado neste servidor");
      const fluxo = await externos.n8n.ler(item.id);
      if (!fluxo) return;
      // Guarda o fluxo junto do backup antes de apagar.
      const { error } = await db.storage.from(BUCKET_BACKUP).upload(`${r.empresa_id}/${r.backup_id}/n8n/${item.id}.json`, Buffer.from(JSON.stringify(redigir(fluxo))), { upsert: true, contentType: "application/json" });
      if (error) throw new Error(`não foi possível guardar o fluxo antes de apagar: ${error.message}`);
      await externos.n8n.apagar(item.id);
    } else if (categoria === "sessoes") {
      if (!externos.whatsapp) throw new Error("WhatsApp (WAHA) não configurado neste servidor");
      if ((await vivas()).has(item)) await externos.whatsapp.apagar(item);
    } else if (categoria === "usuarios") {
      const { error } = await db.auth.admin.deleteUser(item);
      if (error && !loginJaNaoExiste(error)) throw new Error(error.message);
    } else if (categoria === "cobrancas") {
      if (!externos.cobranca) throw new Error("Asaas não configurado neste servidor: cancele a assinatura no painel do Asaas");
      await externos.cobranca.cancelar(item);
    }
  }

  /** Limpa o que fica fora do banco, até acabar o tempo. */
  async function limpar(r: Registro, orcamentoMs: number) {
    const fim = Date.now() + orcamentoMs;
    let sessoesVivas: Promise<Set<string>> | null = null;
    const vivas = () => (sessoesVivas ??= externos.whatsapp!.listar().then((l) => new Set(l)));
    let desdeSalvo = 0;
    for (const categoria of CATEGORIAS) {
      const fila = r.plano.itens[categoria];
      while (fila.pendentes.length) {
        if (categoria === "arquivos") {
          const bucket = (fila.pendentes[0] as Arquivo).bucket;
          const lote = (fila.pendentes as Arquivo[]).filter((a) => a.bucket === bucket).slice(0, 100);
          const { error } = await db.storage.from(bucket).remove(lote.map((a) => a.caminho));
          fila.pendentes = (fila.pendentes as Arquivo[]).filter((a) => !lote.includes(a));
          if (error) fila.falhas.push(...lote.map((item) => ({ item, erro: texto(error) })));
          else fila.feitos += lote.length;
        } else {
          const item = fila.pendentes.shift();
          try { await apagarItem(r, categoria, item, vivas); fila.feitos++; }
          catch (e: any) {
            // Só o "não existe" respondido pelo próprio serviço conta como já apagado.
            if (e?.response?.status === 404) fila.feitos++; else fila.falhas.push({ item, erro: texto(e) });
          }
        }
        if (++desdeSalvo >= 10) { await salvar(r); desdeSalvo = 0; }
        if (Date.now() >= fim) { await salvar(r); return; }
      }
    }
    r.status = CATEGORIAS.some((c) => r.plano.itens[c].falhas.length) ? "com_pendencias" : "concluida";
    await salvar(r);
  }

  /** Um passo da exclusão; chamar de novo até "parado". Em "com_pendencias", chamar de novo tenta o que falhou. */
  async function avancar(id: string, orcamentoMs = 30_000) {
    const r = await buscar(id);
    if (r.status === "cancelada") throw new Recusa("Esta exclusão foi cancelada.");
    if (r.status === "concluida") return resumo(r);
    // Preparada e esquecida: o backup já não vale. Desfaz em vez de apagar.
    if (r.status === "iniciada" && agora() - Date.parse(r.criado_em) > VALIDADE_BACKUP_H * 3_600_000 && (await cancelar(r))) {
      throw new Recusa(`Nada foi excluído: o pedido tem mais de ${VALIDADE_BACKUP_H} horas. Gere um backup novo e comece de novo.`);
    }
    if (r.status === "iniciada" || r.status === "apagando") {
      const { error } = await db.rpc("spy_exclusao_executar", { p_exclusao: id, p_tempo_ms: 20_000 });
      const depois = await buscar(id); // o banco é quem diz até onde chegou
      if (error) {
        if (depois.status === "iniciada" && (await cancelar(depois))) throw new Recusa(`Nada foi excluído: ${error.message}`);
        if (depois.status === "iniciada" || depois.status === "apagando") throw new Recusa(`A exclusão parou no meio: ${error.message} Tente continuar.`);
      }
      if (depois.status === "banco_apagado") deps.aoMudar?.(depois.empresa_id);
      return resumo(depois);
    }
    if (r.status === "com_pendencias") {
      for (const c of CATEGORIAS) { const f = r.plano.itens[c]; f.pendentes.push(...f.falhas.map((x) => x.item)); f.falhas = []; }
      r.status = "banco_apagado";
    }
    await limpar(r, orcamentoMs);
    return resumo(r);
  }

  async function listar() {
    const { data, error } = await db.from("empresa_exclusoes").select("*").neq("status", "cancelada").neq("status", "concluida").order("criado_em", { ascending: false }).limit(50);
    if (error) { if (naoInstalada(error)) return []; throw new Error(error.message); }
    return ((data || []) as Registro[]).map(resumo);
  }

  return { conferir, iniciar, avancar, desistir, listar };
}

/** n8n, WAHA e Asaas de verdade, conforme as variáveis do servidor. */
export function externosDoServidor(whatsapp: Externos["whatsapp"]): Externos {
  const api = (process.env.N8N_API_URL || "").replace(/\/+$/, "");
  const chave = process.env.N8N_API_KEY || "";
  const n8nCfg = { headers: { "X-N8N-API-KEY": chave }, timeout: 30_000 };
  const url = (id: string) => `${api}/workflows/${encodeURIComponent(id)}`;
  const asaas = process.env.ASAAS_API_KEY || "";
  return {
    whatsapp,
    n8n: !api || !chave ? null : {
      async listar() {
        const todos: Fluxo[] = [];
        let cursor = "";
        do {
          const { data } = await axios.get(`${api}/workflows`, { ...n8nCfg, params: { limit: 100, excludePinnedData: true, ...(cursor ? { cursor } : {}) } });
          todos.push(...(data.data || []));
          cursor = data.nextCursor || "";
        } while (cursor);
        return todos;
      },
      async ler(id) {
        try { return (await axios.get(url(id), n8nCfg)).data; }
        catch (e: any) { if (e?.response?.status === 404) return null; throw e; }
      },
      async ativar(id, ativo) { await axios.post(`${url(id)}/${ativo ? "activate" : "deactivate"}`, {}, n8nCfg); },
      async apagar(id) { await axios.delete(url(id), n8nCfg); },
    },
    cobranca: !asaas ? null : {
      async cancelar(id) {
        const base = process.env.ASAAS_ENV === "sandbox" ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";
        await axios.delete(`${base}/subscriptions/${encodeURIComponent(id)}`, { headers: { access_token: asaas, "User-Agent": "spy-crm" }, timeout: 20_000 });
      },
    },
  };
}

type Deps = { requireUser: any; requireMaster: any; limiter: any; supabaseService: any; supabaseUrl: string; serviceKey: string; tenantRaiz: string; whatsapp: Externos["whatsapp"]; aoMudar: (tenantId: string) => void };

export function registerExclusaoEmpresaRoutes(app: express.Express, d: Deps) {
  const { requireUser, requireMaster, limiter, supabaseService, serviceKey } = d;
  const backup = criarMotorBackup({ db: supabaseService, lerOpenApi: lerOpenApiDe(d.supabaseUrl, serviceKey) });
  const motor = criarMotorExclusao({ db: supabaseService, externos: externosDoServidor(d.whatsapp), lerBackup: backup.ler, tenantRaiz: d.tenantRaiz, aoMudar: d.aoMudar });
  const emAndamento = new Set<string>();

  const rota = (chave: "tenantId" | "id" | null, fn: (req: any, res: any, id: string) => Promise<unknown>) => async (req: any, res: any) => {
    if (!supabaseService || !serviceKey) return res.status(503).json({ error: "Servidor sem acesso ao banco para excluir." });
    const id = chave ? String(req.params[chave] || "") : "";
    if (chave && !UUID.test(id)) return res.status(400).json({ error: "Identificador inválido." });
    const trava = req.method === "POST" ? id : "";
    if (trava && emAndamento.has(trava)) return res.status(409).json({ error: "Esta exclusão já está avançando. Aguarde." });
    if (trava) emAndamento.add(trava);
    try { await fn(req, res, id); }
    catch (e: any) {
      if (e instanceof Recusa) return res.status(e.status).json({ error: e.message });
      console.error("[exclusao-empresa]", e?.message);
      res.status(500).json({ error: `Não foi possível concluir: ${texto(e)}` });
    } finally { if (trava) emAndamento.delete(trava); }
  };

  app.get("/api/admin/empresas/exclusoes", requireUser, requireMaster, limiter, rota(null, async (_req, res) => res.json({ exclusoes: await motor.listar() })));
  app.post("/api/admin/empresas/exclusoes/:id/avancar", requireUser, requireMaster, limiter, rota("id", async (_req, res, id) => res.json({ exclusao: await motor.avancar(id) })));
  app.post("/api/admin/empresas/exclusoes/:id/cancelar", requireUser, requireMaster, limiter, rota("id", async (_req, res, id) => { await motor.desistir(id); res.json({ ok: true }); }));
  app.get("/api/admin/empresas/:tenantId/exclusao", requireUser, requireMaster, limiter, rota("tenantId", async (_req, res, id) => res.json(await motor.conferir(id))));
  app.post("/api/admin/empresas/:tenantId/exclusao", requireUser, requireMaster, limiter, rota("tenantId", async (req, res, id) => {
    const confirmacao = String(req.body?.confirmacao ?? ""), backupId = String(req.body?.backupId ?? "");
    if (!/^[0-9]{8}-[0-9]{6}$/.test(backupId)) return res.status(400).json({ error: "Escolha um backup completo." });
    res.status(201).json({ exclusao: await motor.iniciar(id, { confirmacao, backupId }, req.user.id) });
  }));
}
