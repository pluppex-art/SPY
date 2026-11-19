/**
 * Banco de mentira em memória para testar as rotas do Agendamento sem rede. Entende só o que as rotas usam
 * (filtros comuns, order/limit/range, insert/update/upsert) e espelha em JS as funções do banco
 * (agendamento_reservar / atualizar / expirar_pendentes) usando as MESMAS regras de src/lib/agendamento/engine.ts.
 * O SQL de verdade é validado à parte (supabase/tests/agendamento_funcoes.sql, rodado em Postgres embutido).
 */
import { randomUUID } from "node:crypto";
import { ocupadosNaHora, minutosDaHora, horaParaExibir, horaDeMinutos, type ReservaLite } from "../../src/lib/agendamento/engine.js";

type Row = Record<string, any>;
type Resp = { data: any; error: any };

export function criarFakeDb(seed: Record<string, Row[]> = {}, opts: { agoraMs?: () => number } = {}) {
  const t: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const agoraMs = opts.agoraMs ?? (() => Date.now());
  const erroSql = (message: string, code?: string) => ({ message, code });

  const unico = (tabela: string, linha: Row, ignorar?: Row): boolean => {
    if (tabela !== "agendamento_config" || !linha.slug) return true;
    return !(t[tabela] ?? []).some((r) => r !== ignorar && String(r.slug ?? "").toLowerCase() === String(linha.slug).toLowerCase());
  };

  const lite = (r: Row): ReservaLite => ({ id: r.id, data: String(r.data).slice(0, 10), hora: r.hora, duracao: Number(r.duracao), qtdRecursos: r.qtd_recursos, status: r.status, statusPagamento: r.status_pagamento, pagarNoLocal: r.pagar_no_local, createdAt: r.created_at, mesa: r.mesa });
  const cfgDe = (tenant: string) => (t.agendamento_config ?? []).find((c) => c.tenant_id === tenant);

  function checarVaga(tenant: string, data: string, hora: string, duracao: number, qtd: number, excluir: string | null) {
    const cfg = cfgDe(tenant);
    if (!cfg) throw erroSql("sem_config");
    if (qtd > cfg.qtd_recursos) throw erroSql("recursos_demais");
    const ini = minutosDaHora(hora), fim = ini + Math.round(duracao * 60);
    const doDia = (t.agendamento_reservas ?? []).filter((r) => r.tenant_id === tenant).map(lite);
    for (let h = Math.floor(ini / 60); h < Math.ceil(fim / 60); h++) {
      if (ocupadosNaHora(h, data, doDia, agoraMs(), cfg.expiracao_pendente_min, excluir ?? undefined) + qtd > cfg.qtd_recursos) throw erroSql(`sem_vaga:${horaParaExibir(horaDeMinutos(h * 60))}`);
    }
  }

  const rpcs: Record<string, (a: any) => any> = {
    agendamento_reservar: ({ p_tenant, p_itens }) => {
      const antes = JSON.stringify(t.agendamento_reservas ?? []);
      try {
        const criadas: Row[] = [];
        for (const it of p_itens) {
          checarVaga(p_tenant, it.data, it.hora, it.duracao, it.qtd_recursos, null);
          const r: Row = {
            id: randomUUID(), tenant_id: p_tenant, grupo_id: it.grupo_id ?? randomUUID(), data: it.data, hora: it.hora, inicio_min: minutosDaHora(it.hora), duracao: it.duracao,
            qtd_recursos: it.qtd_recursos, qtd_pessoas: it.qtd_pessoas ?? 0, valor_total: it.valor_total ?? 0, tipo_evento: it.tipo_evento ?? null, observacoes: it.observacoes ?? null,
            status: it.status ?? "Pendente", status_pagamento: it.status_pagamento ?? "Pendente", forma_pagamento: it.forma_pagamento ?? null, detalhes_pagamento: it.detalhes_pagamento ?? [],
            pagar_no_local: it.pagar_no_local ?? false, comanda: it.comanda ?? null, mesa: it.mesa ?? false, mesa_cadeiras: it.mesa_cadeiras ?? null, aniversariante: it.aniversariante ?? null,
            checkin_ids: [], noshow_ids: [], recursos_atribuidos: [], origem: it.origem ?? "equipe", criado_por: it.criado_por ?? null, criado_por_nome: it.criado_por_nome ?? null,
            lead_id: it.lead_id ?? null, contato_nome: it.contato_nome, contato_telefone: it.contato_telefone ?? null, contato_email: it.contato_email ?? null, motivo_cancelamento: null,
            mp_preference_id: it.mp_preference_id ?? null, mp_payment_id: null, externo_id: it.externo_id ?? null, created_at: new Date(agoraMs()).toISOString(), updated_at: new Date(agoraMs()).toISOString(),
          };
          (t.agendamento_reservas ??= []).push(r);
          criadas.push({ ...r });
        }
        return { data: criadas, error: null };
      } catch (e: any) { t.agendamento_reservas = JSON.parse(antes); return { data: null, error: e }; } // tudo ou nada
    },
    agendamento_atualizar: ({ p_tenant, p_id, p_patch }) => {
      const r = (t.agendamento_reservas ?? []).find((x) => x.id === p_id && x.tenant_id === p_tenant);
      if (!r) return { data: null, error: erroSql("reserva_nao_encontrada") };
      const novo = { ...r, ...p_patch };
      const status = p_patch.status ?? r.status;
      if (status !== "Cancelada" && (novo.data !== r.data || novo.hora !== r.hora || Number(novo.duracao) !== Number(r.duracao) || novo.qtd_recursos !== r.qtd_recursos || r.status === "Cancelada")) {
        try { checarVaga(p_tenant, String(novo.data).slice(0, 10), novo.hora, Number(novo.duracao), novo.qtd_recursos, p_id); } catch (e: any) { return { data: null, error: e }; }
      }
      Object.assign(r, p_patch, { inicio_min: minutosDaHora(novo.hora), updated_at: new Date(agoraMs()).toISOString() });
      return { data: { ...r }, error: null };
    },
    agendamento_expirar_pendentes: ({ p_tenant }) => {
      let n = 0;
      for (const r of t.agendamento_reservas ?? []) {
        const cfg = cfgDe(r.tenant_id);
        if ((p_tenant == null || r.tenant_id === p_tenant) && cfg && r.status === "Pendente" && r.status_pagamento === "Pendente" && !r.pagar_no_local
          && agoraMs() - new Date(r.created_at).getTime() > (cfg.expiracao_pendente_min + 15) * 60000) { r.status = "Cancelada"; r.motivo_cancelamento = "Expirada"; n++; }
      }
      return { data: n, error: null };
    },
  };

  const from = (nome: string) => {
    const filtros: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select"; let contar = false;
    let patch: Row = {}, ins: Row[] = [], onConflict = "id", ordem: [string, boolean][] = [], max = Infinity, deslocar = 0, um = false;
    const executar = (): Resp => {
      const linhas = (t[nome] ??= []);
      if (op === "insert" || op === "upsert") {
        const saida: Row[] = [];
        for (const novo of ins) {
          const chaves = onConflict.split(",");
          const existente = op === "upsert" ? linhas.find((r) => chaves.every((k) => r[k] === novo[k])) : undefined;
          if (existente) { Object.assign(existente, novo); saida.push(existente); continue; }
          if (!unico(nome, novo)) return { data: null, error: erroSql("duplicate key value violates unique constraint", "23505") };
          const r = { id: randomUUID(), created_at: new Date(agoraMs()).toISOString(), ...novo };
          linhas.push(r); saida.push(r);
        }
        return { data: um ? saida[0] ?? null : saida, error: null };
      }
      let m = linhas.filter((r) => filtros.every((f) => f(r)));
      if (op === "delete") { for (const r of m) linhas.splice(linhas.indexOf(r), 1); return { data: m, error: null }; }
      if (contar) return { data: m.slice(0, 0), count: m.length, error: null } as any;
      if (op === "update") {
        for (const r of m) {
          const proposto = { ...r, ...patch };
          if (!unico(nome, proposto, r)) return { data: null, error: erroSql("duplicate key value violates unique constraint", "23505") };
          Object.assign(r, patch);
        }
        return { data: um ? m[0] ?? null : m, error: null };
      }
      if (ordem.length) m = [...m].sort((a, b) => { for (const [c, asc] of ordem) { const d = (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1); if (d) return d; } return 0; });
      m = m.slice(deslocar, deslocar + max);
      return { data: um ? m[0] ?? null : m, error: null };
    };
    const q: any = {
      select: (_c?: string, o?: { count?: string; head?: boolean }) => { if (o?.count) contar = true; return q; },
      delete: () => { op = "delete"; return q; },
      not: (c: string, operador: string, v: any) => { filtros.push((r) => { const base = operador === "like" ? new RegExp("^" + String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$").test(String(r[c] ?? "")) : operador === "is" ? (r[c] ?? null) === v : r[c] === v; return !base; }); return q; },
      insert: (v: any) => { op = "insert"; ins = Array.isArray(v) ? v : [v]; return q; },
      upsert: (v: any, o?: any) => { op = "upsert"; ins = Array.isArray(v) ? v : [v]; if (o?.onConflict) onConflict = o.onConflict; return q; },
      update: (p: Row) => { op = "update"; patch = p; return q; },
      eq: (c: string, v: any) => { filtros.push((r) => r[c] === v); return q; },
      neq: (c: string, v: any) => { filtros.push((r) => r[c] !== v); return q; },
      is: (c: string, v: any) => { filtros.push((r) => (r[c] ?? null) === v); return q; },
      in: (c: string, v: any[]) => { filtros.push((r) => v.includes(r[c])); return q; },
      gt: (c: string, v: any) => { filtros.push((r) => Number(r[c] ?? 0) > Number(v)); return q; },
      gte: (c: string, v: any) => { filtros.push((r) => String(r[c]) >= String(v)); return q; },
      lte: (c: string, v: any) => { filtros.push((r) => String(r[c]) <= String(v)); return q; },
      like: (c: string, v: string) => { const re = new RegExp("^" + v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$"); filtros.push((r) => re.test(String(r[c] ?? ""))); return q; },
      ilike: (c: string, v: string) => { filtros.push((r) => String(r[c] ?? "").toLowerCase() === v.toLowerCase().replace(/\\/g, "")); return q; },
      or: () => q,
      order: (c: string, o?: { ascending?: boolean }) => { ordem.push([c, o?.ascending !== false]); return q; },
      limit: (n: number) => { max = n; return q; },
      range: (a: number, b: number) => { deslocar = a; max = b - a + 1; return q; },
      maybeSingle: () => { um = true; return Promise.resolve(executar()); },
      single: () => { um = true; return Promise.resolve(executar()); },
      then: (a: any, b: any) => Promise.resolve(executar()).then(a, b),
    };
    return q;
  };
  const rpc = (nome: string, args: any) => Promise.resolve(rpcs[nome] ? rpcs[nome](args) : { data: null, error: erroSql(`rpc desconhecida: ${nome}`) });
  return { from, rpc, t };
}

/** App de mentira: guarda as rotas registradas para chamá-las direto, sem subir servidor. */
export function criarFakeApp() {
  const rotas = new Map<string, any[]>();
  const reg = (metodo: string) => (caminho: string, ...h: any[]) => { rotas.set(`${metodo} ${caminho}`, h); };
  const app: any = { get: reg("GET"), post: reg("POST"), put: reg("PUT"), patch: reg("PATCH"), all: (c: string, ...h: any[]) => { for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) rotas.set(`${m} ${c}`, h); } };
  const chamar = async (metodo: string, caminho: string, req: { params?: any; query?: any; body?: any; headers?: any; [k: string]: any } = {}) => {
    const h = rotas.get(`${metodo} ${caminho}`);
    if (!h) throw new Error(`rota não registrada: ${metodo} ${caminho}`);
    let status = 200, corpo: any;
    const res: any = { status: (s: number) => ((status = s), res), json: (b: any) => ((corpo = b), res), send: (b: any) => ((corpo = b), res) };
    const reqq = { params: {}, query: {}, body: {}, headers: {}, ...req };
    for (const fn of h) { await fn(reqq, res, () => undefined); }
    return { status, corpo };
  };
  return { app, chamar, rotas };
}
