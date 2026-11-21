/**
 * Módulo Agendamento — peças do servidor que não dependem de rede nem de banco (por isso são testáveis):
 * validação da configuração, plano de pagamento, cobrança do Mercado Pago, lançamento financeiro e assinatura
 * dos links. Testado em tests/agendamento/servico.test.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  centavos, valorReconhecido, validarPagamentoMisto, FORMAS_PAGAMENTO,
  type ConfigAgenda, type DetalhePagamento, type HorarioDia, type ReservaLite, type StatusPagamento, type StatusReserva,
} from "../src/lib/agendamento/engine.js";

// ─── linha do banco ↔ regras ─────────────────────────────────────────────────

export interface LinhaConfig {
  tenant_id: string;
  slug: string | null;
  ativo: boolean;
  nome_estabelecimento: string | null;
  endereco: string | null;
  telefone: string | null;
  whatsapp: string | null;
  logo_url: string | null;
  recurso_singular: string;
  recurso_plural: string;
  qtd_recursos: number;
  pessoas_por_recurso: number;
  preco_dia_util: number | string;
  preco_fim_semana: number | string;
  dias_fim_semana: number[];
  horarios: HorarioDia[];
  datas_bloqueadas: string[];
  tipos_evento: string[];
  expiracao_pendente_min: number;
  fuso: string;
  pagamento_online: boolean;
  mesas_ativo: boolean;
  mesas_max_por_dia: number;
  cadeiras_max: number;
  permissoes_equipe: PermissoesEquipe;
}

export interface PermissoesEquipe {
  criar: boolean;
  editar: boolean;
  cancelar: boolean;
  receber: boolean;
  sem_contato: boolean;
}

export const PERMISSOES_PADRAO: PermissoesEquipe = { criar: true, editar: true, cancelar: false, receber: true, sem_contato: false };

/** Preço da hora de reserva vive em public.products (type 'Reserva'): uma linha para dia útil e outra para fim de semana. */
export const ORIGEM_PRECO = "agendamento_config";
export const PRECOS_RESERVA = {
  preco_dia_util: { sufixo: "dia_util", nome: "Reserva — hora em dia útil" },
  preco_fim_semana: { sufixo: "fim_semana", nome: "Reserva — hora em fim de semana" },
} as const;
export type CampoPreco = keyof typeof PRECOS_RESERVA;
export const externoIdPreco = (tenantId: string, campo: CampoPreco) => `${tenantId}:${PRECOS_RESERVA[campo].sufixo}`;

/** Sobrepõe à configuração os preços vindos de products. Sem a linha em products, vale o valor antigo da própria configuração. */
export function aplicarPrecos<T extends { tenant_id: string; preco_dia_util: number | string; preco_fim_semana: number | string }>(
  cfg: T, produtos: Array<{ externo_id: string | null; price: number | string | null }>,
): T {
  const out = { ...cfg };
  for (const campo of Object.keys(PRECOS_RESERVA) as CampoPreco[]) {
    const p = produtos.find((x) => x.externo_id === externoIdPreco(cfg.tenant_id, campo));
    if (p && p.price !== null && p.price !== undefined && Number.isFinite(Number(p.price))) out[campo] = Number(p.price) as any;
  }
  return out;
}

export function configParaEngine(c: LinhaConfig): ConfigAgenda {
  return {
    qtdRecursos: c.qtd_recursos,
    pessoasPorRecurso: c.pessoas_por_recurso,
    precoDiaUtil: Number(c.preco_dia_util) || 0,
    precoFimSemana: Number(c.preco_fim_semana) || 0,
    diasFimSemana: c.dias_fim_semana ?? [0, 5, 6],
    horarios: c.horarios,
    datasBloqueadas: (c.datas_bloqueadas ?? []).map((d) => String(d).slice(0, 10)),
    expiracaoPendenteMin: c.expiracao_pendente_min,
    mesasMaxPorDia: c.mesas_max_por_dia,
    cadeirasMax: c.cadeiras_max,
  };
}

export interface LinhaReserva {
  id: string;
  tenant_id: string;
  grupo_id: string;
  data: string;
  hora: string;
  duracao: number | string;
  qtd_recursos: number;
  qtd_pessoas: number;
  valor_total: number | string;
  tipo_evento: string | null;
  observacoes: string | null;
  status: StatusReserva;
  status_pagamento: StatusPagamento;
  forma_pagamento: string | null;
  detalhes_pagamento: DetalhePagamento[];
  pagar_no_local: boolean;
  comanda: string | null;
  mesa: boolean;
  mesa_cadeiras: number | null;
  aniversariante: string | null;
  checkin_ids: string[];
  noshow_ids: string[];
  recursos_atribuidos: number[];
  origem: "site" | "equipe" | "importacao";
  criado_por: string | null;
  criado_por_nome: string | null;
  lead_id: string | null;
  contato_nome: string;
  contato_telefone: string | null;
  contato_email: string | null;
  motivo_cancelamento: string | null;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  externo_id: string | null;
  created_at: string;
  updated_at: string;
}

export function linhaParaLite(r: LinhaReserva): ReservaLite {
  return {
    id: r.id,
    data: String(r.data).slice(0, 10),
    hora: r.hora,
    duracao: Number(r.duracao),
    qtdRecursos: r.qtd_recursos,
    status: r.status,
    statusPagamento: r.status_pagamento,
    pagarNoLocal: r.pagar_no_local,
    createdAt: r.created_at,
    mesa: r.mesa,
  };
}

// ─── configuração ────────────────────────────────────────────────────────────

/** "Tô Na Pista Boliche" → "to-na-pista-boliche" (3 a 60 caracteres). */
export function slugDe(nome: string): string {
  const s = String(nome ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
  return s.length >= 3 ? s : "agenda";
}

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{2,60}$/;
/** Endereços que já existem no sistema e não podem ser usados como nome público. */
const SLUGS_RESERVADOS = new Set(["api", "app", "login", "admin", "catalogo", "checkout", "agendar", "proposta", "implementacao"]);

const fusoValido = (f: string) => { try { new Intl.DateTimeFormat("en", { timeZone: f }); return true; } catch { return false; } };
const dataValida = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const texto = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export type ResultadoConfig = { ok: true; patch: Record<string, unknown> } | { ok: false; erro: string };

/**
 * Valida o que a tela de configuração mandou (camelCase) e devolve só as colunas a gravar (snake_case).
 * Campo ausente = não muda. Qualquer valor fora do permitido recusa o pedido inteiro.
 */
export function validarConfig(b: any): ResultadoConfig {
  const patch: Record<string, unknown> = {};
  const falha = (erro: string): ResultadoConfig => ({ ok: false, erro });
  const tem = (k: string) => b && Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined;

  if (tem("slug")) {
    const s = String(b.slug ?? "").trim().toLowerCase();
    if (!SLUG_REGEX.test(s)) return falha("O endereço público deve ter de 3 a 61 letras minúsculas, números e hífen, sem espaços.");
    if (SLUGS_RESERVADOS.has(s)) return falha("Esse endereço público já é usado pelo sistema. Escolha outro.");
    patch.slug = s;
  }
  for (const [k, col, max] of [["nomeEstabelecimento", "nome_estabelecimento", 120], ["endereco", "endereco", 240], ["telefone", "telefone", 40], ["whatsapp", "whatsapp", 40], ["recursoSingular", "recurso_singular", 30], ["recursoPlural", "recurso_plural", 30]] as const) {
    if (!tem(k)) continue;
    const v = texto(b[k], max);
    if ((k === "recursoSingular" || k === "recursoPlural") && !v) return falha("Informe como chamar o que é reservado (ex.: Pista / Pistas).");
    patch[col] = v || null;
  }
  if (tem("logoUrl")) {
    const u = texto(b.logoUrl, 500);
    if (u && !/^https:\/\//i.test(u)) return falha("O endereço da logo precisa começar com https://");
    patch.logo_url = u || null;
  }
  const inteiro = (k: string, col: string, min: number, max: number, nome: string): string | null => {
    if (!tem(k)) return null;
    const n = Number(b[k]);
    if (!Number.isInteger(n) || n < min || n > max) return `${nome} deve ser um número inteiro entre ${min} e ${max}.`;
    patch[col] = n;
    return null;
  };
  const dinheiro = (k: string, col: string, nome: string): string | null => {
    if (!tem(k)) return null;
    const n = Number(b[k]);
    if (!Number.isFinite(n) || n < 0 || n > 100000) return `${nome} deve estar entre 0 e 100.000.`;
    patch[col] = centavos(n);
    return null;
  };
  const erros = [
    inteiro("qtdRecursos", "qtd_recursos", 1, 200, "A quantidade"),
    inteiro("pessoasPorRecurso", "pessoas_por_recurso", 1, 200, "O número de pessoas por unidade"),
    inteiro("expiracaoPendenteMin", "expiracao_pendente_min", 5, 240, "O prazo de pagamento (minutos)"),
    inteiro("mesasMaxPorDia", "mesas_max_por_dia", 0, 500, "O limite de mesas por dia"),
    inteiro("cadeirasMax", "cadeiras_max", 1, 36, "O limite de lugares por mesa"),
    dinheiro("precoDiaUtil", "preco_dia_util", "O preço de dia útil"),
    dinheiro("precoFimSemana", "preco_fim_semana", "O preço de fim de semana"),
  ].filter(Boolean);
  if (erros.length) return falha(erros[0] as string);

  for (const [k, col] of [["ativo", "ativo"], ["pagamentoOnline", "pagamento_online"], ["mesasAtivo", "mesas_ativo"]] as const) {
    if (!tem(k)) continue;
    if (typeof b[k] !== "boolean") return falha(`Valor inválido em ${k}.`);
    patch[col] = b[k];
  }
  if (tem("diasFimSemana")) {
    const d = b.diasFimSemana;
    if (!Array.isArray(d) || d.some((x: unknown) => !Number.isInteger(x) || (x as number) < 0 || (x as number) > 6)) return falha("Dias de fim de semana inválidos.");
    patch.dias_fim_semana = Array.from(new Set(d as number[])).sort();
  }
  if (tem("horarios")) {
    const h = b.horarios;
    if (!Array.isArray(h) || h.length !== 7) return falha("Informe o horário dos 7 dias da semana.");
    for (const d of h) {
      if (typeof d?.aberto !== "boolean" || !Number.isInteger(d.inicio) || d.inicio < 0 || d.inicio > 23 || !Number.isInteger(d.fim) || d.fim < 0 || d.fim > 23) {
        return falha("Horário de funcionamento inválido (use horas inteiras de 0 a 23; fechamento 0 = meia-noite).");
      }
    }
    patch.horarios = h.map((d: HorarioDia) => ({ aberto: d.aberto, inicio: d.inicio, fim: d.fim }));
  }
  if (tem("datasBloqueadas")) {
    const d = b.datasBloqueadas;
    if (!Array.isArray(d) || d.length > 800 || d.some((x: unknown) => !dataValida(x))) return falha("Alguma data bloqueada é inválida.");
    patch.datas_bloqueadas = Array.from(new Set(d as string[])).sort();
  }
  if (tem("tiposEvento")) {
    const t = b.tiposEvento;
    if (!Array.isArray(t)) return falha("Tipos de evento inválidos.");
    const limpos = Array.from(new Set(t.map((x: unknown) => texto(x, 40)).filter(Boolean)));
    if (limpos.length < 1 || limpos.length > 20) return falha("Informe de 1 a 20 tipos de evento.");
    patch.tipos_evento = limpos;
  }
  if (tem("fuso")) {
    const f = texto(b.fuso, 60);
    if (!f || !fusoValido(f)) return falha("Fuso horário inválido.");
    patch.fuso = f;
  }
  if (tem("permissoesEquipe")) {
    const p = b.permissoesEquipe;
    const chaves: (keyof PermissoesEquipe)[] = ["criar", "editar", "cancelar", "receber", "sem_contato"];
    if (!p || typeof p !== "object" || chaves.some((k) => typeof p[k] !== "boolean")) return falha("Permissões da equipe inválidas.");
    patch.permissoes_equipe = Object.fromEntries(chaves.map((k) => [k, p[k]]));
  }
  return { ok: true, patch };
}

// ─── pagamento recebido pela equipe ──────────────────────────────────────────

export type ModoPagamento = "pendente" | "receber" | "comanda" | "comanda_paga";

export interface PedidoPagamento {
  modo: ModoPagamento;
  forma?: string;
  misto?: DetalhePagamento[];
  comanda?: string;
}

export interface PlanoPagamento {
  status: StatusReserva;
  status_pagamento: StatusPagamento;
  forma_pagamento: string | null;
  detalhes_pagamento: DetalhePagamento[];
  pagar_no_local: boolean;
  comanda?: string;
  /** Preenchido quando o valor da reserva muda (cortesia = 0). */
  valor_total?: number;
  observacao?: string;
}

export type ResultadoPlano = { ok: true; plano: PlanoPagamento } | { ok: false; erro: string };

/**
 * Traduz o que a equipe escolheu no caixa para o que fica gravado na reserva:
 *  - receber: confirma e marca como pago (uma forma, ou várias que somam o total; CORTESIA só administrador e zera o valor);
 *  - comanda: lança na comanda, sem pagar (a reserva deixa de expirar);
 *  - comanda_paga: baixa direta, o cliente já pagou pela comanda;
 *  - pendente: volta a aguardar pagamento.
 */
export function planejarPagamento(pedido: PedidoPagamento, total: number, ehAdmin: boolean): ResultadoPlano {
  const falha = (erro: string): ResultadoPlano => ({ ok: false, erro });
  const comanda = texto(pedido.comanda, 40);
  switch (pedido.modo) {
    case "pendente":
      return { ok: true, plano: { status: "Pendente", status_pagamento: "Pendente", forma_pagamento: null, detalhes_pagamento: [], pagar_no_local: false } };
    case "comanda":
      if (!comanda) return falha("Informe o número da comanda.");
      return { ok: true, plano: { status: "Pendente", status_pagamento: "Pendente", forma_pagamento: "COMANDA", detalhes_pagamento: [], pagar_no_local: true, comanda } };
    case "comanda_paga":
      if (!comanda) return falha("Informe o número da comanda.");
      return { ok: true, plano: { status: "Confirmada", status_pagamento: "Pago", forma_pagamento: "COMANDA", detalhes_pagamento: [{ method: "COMANDA", amount: centavos(total) }], pagar_no_local: false, comanda } };
    case "receber": {
      if (pedido.misto && pedido.misto.length > 0) {
        const detalhes = pedido.misto.map((d) => ({ method: String(d.method), amount: centavos(Number(d.amount)) }));
        if (detalhes.some((d) => d.method === "CORTESIA")) return falha("Cortesia não pode ser usada em pagamento misto.");
        const v = validarPagamentoMisto(centavos(total), detalhes);
        if (v.ok === false) return falha(v.erro);
        return { ok: true, plano: { status: "Confirmada", status_pagamento: "Pago", forma_pagamento: "MISTO", detalhes_pagamento: detalhes, pagar_no_local: false, comanda: comanda || undefined } };
      }
      const forma = String(pedido.forma ?? "").toUpperCase();
      if (!(FORMAS_PAGAMENTO as readonly string[]).includes(forma)) return falha("Escolha a forma de pagamento.");
      if (forma === "CORTESIA") {
        if (!ehAdmin) return falha("Só o administrador pode lançar cortesia.");
        return { ok: true, plano: { status: "Confirmada", status_pagamento: "Pago", forma_pagamento: "CORTESIA", detalhes_pagamento: [{ method: "CORTESIA", amount: 0 }], pagar_no_local: false, comanda: comanda || undefined, valor_total: 0, observacao: `[Cortesia — valor original R$ ${centavos(total).toFixed(2)}]` } };
      }
      return { ok: true, plano: { status: "Confirmada", status_pagamento: "Pago", forma_pagamento: forma, detalhes_pagamento: [{ method: forma, amount: centavos(total) }], pagar_no_local: false, comanda: comanda || undefined } };
    }
    default:
      return falha("Modo de pagamento inválido.");
  }
}

/**
 * Pagamento misto de uma compra com várias faixas de horário: reparte cada forma entre as faixas na proporção do
 * valor de cada uma, e acerta os centavos na maior forma de cada faixa para a soma de cada faixa fechar exata.
 */
export function repartirMisto(detalhes: DetalhePagamento[], valoresFaixas: number[]): DetalhePagamento[][] {
  const total = centavos(valoresFaixas.reduce((s, v) => s + v, 0));
  return valoresFaixas.map((v) => {
    const partes = detalhes.map((d) => ({ method: d.method, amount: total > 0 ? centavos((d.amount * v) / total) : 0 }));
    const diferenca = centavos(v - partes.reduce((s, d) => s + d.amount, 0));
    if (partes.length && diferenca !== 0) {
      const maior = partes.reduce((m, d, i) => (d.amount > partes[m].amount ? i : m), 0);
      partes[maior].amount = centavos(partes[maior].amount + diferenca);
    }
    return partes;
  });
}

// ─── Mercado Pago ────────────────────────────────────────────────────────────

/** Descrição curta na fatura do cartão: até 22 caracteres, só letras e números. */
export function descritorFatura(nome: string): string {
  const s = String(nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 22).trim();
  return s || "RESERVA";
}

export interface EntradaPreferencia {
  nomeEstabelecimento: string;
  grupoId: string;
  total: number;
  descricao: string;
  pagador: { nome: string; email?: string };
  expiraEm: Date;
  urlNotificacao: string;
  urlRetorno: string;
}

/** Corpo da cobrança: uma única linha com o total do grupo; `external_reference` é o grupo (confirma todas as faixas). */
export function montarPreferenciaMP(e: EntradaPreferencia): Record<string, unknown> {
  const total = centavos(e.total);
  return {
    items: [{ id: e.grupoId, title: `Reserva — ${e.nomeEstabelecimento}`.slice(0, 120), quantity: 1, currency_id: "BRL", unit_price: total, description: e.descricao.slice(0, 250) }],
    payer: { name: e.pagador.nome.slice(0, 80), ...(e.pagador.email ? { email: e.pagador.email } : {}) },
    external_reference: e.grupoId,
    expires: true,
    expiration_date_to: e.expiraEm.toISOString(),
    back_urls: { success: e.urlRetorno, failure: e.urlRetorno, pending: e.urlRetorno },
    auto_return: "approved",
    notification_url: e.urlNotificacao,
    statement_descriptor: descritorFatura(e.nomeEstabelecimento),
    payment_methods: { excluded_payment_types: [{ id: "ticket" }], installments: 1 },
  };
}

// ─── financeiro ──────────────────────────────────────────────────────────────

export const CATEGORIA_FINANCEIRA = "Reservas";

/**
 * Id do lançamento no financeiro. Reservas importadas do Tô Na Pista usam o MESMO id que a integração antiga já
 * grava (`tnp_fat_<id>`), para o valor ser atualizado e não duplicado.
 */
export const idLancamento = (r: { id: string; externo_id?: string | null }) => (r.externo_id ? `tnp_fat_${r.externo_id}` : `agd_${r.id}`);

const ROTULO_FORMA: Record<string, string> = { PIX: "Pix", CREDITO: "Cartão de crédito", DEBITO: "Cartão de débito", ONLINE: "Online", DINHEIRO: "Dinheiro", MISTO: "Misto", COMANDA: "Comanda", CORTESIA: "Cortesia" };

export function montarLancamento(r: LinhaReserva) {
  const valor = valorReconhecido({ status: r.status, statusPagamento: r.status_pagamento, valorTotal: Number(r.valor_total) });
  const forma = r.forma_pagamento ? ROTULO_FORMA[String(r.forma_pagamento).toUpperCase()] ?? String(r.forma_pagamento) : null;
  return {
    id: idLancamento(r),
    description: `Reserva${r.tipo_evento ? ` - ${r.tipo_evento}` : ""} (${r.contato_nome})`,
    value: valor,
    date: String(r.data).slice(0, 10),
    competencia_date: String(r.data).slice(0, 10),
    category: CATEGORIA_FINANCEIRA,
    type: "Receber" as const,
    status: "Pago" as const,
    counterparty: r.contato_nome,
    numero_documento: `RES-${String(r.id).slice(0, 8).toUpperCase()}`,
    tags: ["Reserva"],
    ...(forma ? { payment_method: forma } : {}),
  };
}

// ─── links assinados ─────────────────────────────────────────────────────────

/** Assinatura curta (HMAC-SHA256, 32 hex) para links que não podem ser forjados: acompanhar um pedido e receber avisos de pagamento. */
export function assinar(valor: string, segredo: string): string {
  return createHmac("sha256", segredo).update(valor).digest("hex").slice(0, 32);
}

export function conferirAssinatura(valor: string, assinatura: string, segredo: string): boolean {
  const esperada = Buffer.from(assinar(valor, segredo));
  const recebida = Buffer.from(String(assinatura ?? ""));
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
}
