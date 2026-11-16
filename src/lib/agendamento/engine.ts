/**
 * Módulo Agendamento — regras de negócio como funções PURAS (sem rede, sem banco, sem React), usadas pela tela
 * da equipe, pela página pública de agendamento, pelo servidor e pelos testes (tests/chatbot/agendamento-*.test.ts).
 *
 * Origem: sistema do Tô Na Pista Boliche (reservas por pista e por hora). Aqui o "recurso" é genérico (pista,
 * quadra, sala…). Diferenças deliberadas em relação ao original, todas correções:
 *  - A ocupação é calculada por INTERVALO de minutos (o original só olhava a hora cheia e perdia reservas de 18:30);
 *  - Reservas que passam da meia-noite continuam ocupando as horas seguintes do mesmo dia de funcionamento;
 *  - Uma compra com várias faixas de horário vira um GRUPO: o pagamento confirma todas as faixas (o original só
 *    confirmava a primeira);
 *  - Datas e "agora" usam o fuso da empresa, não o do navegador de quem consulta.
 *
 * Convenções: `data` = "AAAA-MM-DD"; `hora` = "HH:MM", e HH pode passar de 23 ("24:00" = meia-noite do dia
 * seguinte, ainda dentro do mesmo dia de funcionamento); `duracao` em horas (pode ser fracionada: 1.5).
 */

export type StatusReserva = "Pendente" | "Confirmada" | "Check-in" | "Cancelada" | "No-show";
export type StatusPagamento = "Pendente" | "Pago" | "Reembolsado" | "Pendente Estorno";

export const STATUS_RESERVA: StatusReserva[] = ["Pendente", "Confirmada", "Check-in", "Cancelada", "No-show"];
export const STATUS_PAGAMENTO: StatusPagamento[] = ["Pendente", "Pago", "Reembolsado", "Pendente Estorno"];
export const FORMAS_PAGAMENTO = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "CORTESIA"] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

/** Tempo, depois do prazo de pagamento, em que ainda se tenta confirmar sem checar a vaga (margem do aviso do banco). */
export const MARGEM_PAGAMENTO_ATRASADO_MIN = 5;

export interface ReservaLite {
  id: string;
  data: string;
  hora: string;
  duracao: number;
  qtdRecursos: number;
  status: StatusReserva;
  statusPagamento: StatusPagamento;
  pagarNoLocal?: boolean;
  /** ISO (UTC) da criação — base do prazo de pagamento. */
  createdAt?: string | null;
  mesa?: boolean;
}

export interface HorarioDia {
  aberto: boolean;
  /** Hora cheia de abertura (0–23). */
  inicio: number;
  /** Hora cheia de fechamento: 0 = meia-noite; menor que o início = depois da meia-noite. */
  fim: number;
}

export interface ConfigAgenda {
  qtdRecursos: number;
  pessoasPorRecurso: number;
  precoDiaUtil: number;
  precoFimSemana: number;
  /** Dias com preço de fim de semana (0 = domingo … 6 = sábado). */
  diasFimSemana: number[];
  /** 7 itens, índice 0 = domingo. */
  horarios: HorarioDia[];
  datasBloqueadas: string[];
  expiracaoPendenteMin: number;
  mesasMaxPorDia: number;
  cadeirasMax: number;
}

export interface Slot {
  hora: string;
  rotulo: string;
  disponivel: boolean;
  livres: number;
  passou: boolean;
}

export interface Agora {
  /** "AAAA-MM-DD" no fuso da empresa. */
  data: string;
  /** Minutos desde 00:00 no fuso da empresa. */
  minutos: number;
  /** Instante absoluto (ms). */
  ms: number;
}

// ─── datas e horas ───────────────────────────────────────────────────────────

export const limpaData = (s: unknown): string => String(s ?? "").trim().split(/[\sT]/)[0];

export function minutosDaHora(hora: unknown): number {
  const m = String(hora ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

export function horaDeMinutos(min: number): string {
  const h = Math.floor(min / 60);
  return `${String(h).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** "25:00" (depois da meia-noite) vira "01:00" para mostrar ao usuário. */
export function horaParaExibir(hora: string): string {
  return horaDeMinutos(minutosDaHora(hora) % 1440);
}

/** Dia da semana (0 = domingo) sem depender do fuso do computador. */
export function diaDaSemana(data: string): number {
  const [y, m, d] = limpaData(data).split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function somarDias(data: string, dias: number): string {
  const [y, m, d] = limpaData(data).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** "Agora" no fuso da empresa (padrão America/Sao_Paulo). */
export function agoraNoFuso(ms: number = Date.now(), fuso = "America/Sao_Paulo"): Agora {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00";
  return { data: `${p("year")}-${p("month")}-${p("day")}`, minutos: Number(p("hour")) * 60 + Number(p("minute")), ms };
}

// ─── ocupação e vagas ────────────────────────────────────────────────────────

/** Intervalo [início, fim) da reserva em minutos do dia de funcionamento. */
export function intervalo(r: Pick<ReservaLite, "hora" | "duracao">): [number, number] {
  const ini = minutosDaHora(r.hora);
  const dur = Math.max(0.5, Number(r.duracao) || 1);
  return [ini, ini + Math.round(dur * 60)];
}

/** A reserva segura vaga? Cancelada nunca; pendente sem pagamento só dentro do prazo. */
export function ocupaVaga(r: ReservaLite, agoraMs: number, expiracaoMin: number, excluirId?: string): boolean {
  if (!r || r.status === "Cancelada") return false;
  if (excluirId && r.id === excluirId) return false;
  if (r.status === "Pendente" && !r.pagarNoLocal && r.createdAt) {
    const criada = new Date(r.createdAt).getTime();
    if (Number.isFinite(criada) && (agoraMs - criada) / 60000 > expiracaoMin) return false;
  }
  return true;
}

/** Recursos ocupados na hora cheia `hora` (0–47) de um dia. */
export function ocupadosNaHora(hora: number, data: string, reservas: ReservaLite[], agoraMs: number, expiracaoMin: number, excluirId?: string): number {
  const alvo = limpaData(data);
  const [a, b] = [hora * 60, (hora + 1) * 60];
  let ocupados = 0;
  for (const r of reservas) {
    if (!r || limpaData(r.data) !== alvo || !ocupaVaga(r, agoraMs, expiracaoMin, excluirId)) continue;
    const [ini, fim] = intervalo(r);
    if (ini < b && fim > a) ocupados += Math.max(1, Number(r.qtdRecursos) || 1);
  }
  return ocupados;
}

export function capacidadeHora(hora: number, data: string, reservas: ReservaLite[], total: number, agoraMs: number, expiracaoMin: number, excluirId?: string) {
  const ocupados = ocupadosNaHora(hora, data, reservas, agoraMs, expiracaoMin, excluirId);
  const livres = Math.max(0, total - ocupados);
  return { ocupados, livres, disponivel: livres > 0 };
}

/** Faixa de funcionamento do dia, em horas (fim já somado de 24 se passa da meia-noite); null = fechado ou bloqueado. */
export function faixaDoDia(data: string, cfg: Pick<ConfigAgenda, "horarios" | "datasBloqueadas">): { inicio: number; fim: number } | null {
  const alvo = limpaData(data);
  if (!alvo || cfg.datasBloqueadas.some((d) => limpaData(d) === alvo)) return null;
  const dia = cfg.horarios[diaDaSemana(alvo)];
  if (!dia || !dia.aberto) return null;
  const inicio = Number(dia.inicio);
  let fim = Number(dia.fim);
  if (fim === 0) fim = 24;
  if (fim <= inicio) fim += 24;
  return { inicio, fim };
}

export function gerarSlots(
  data: string,
  cfg: ConfigAgenda,
  reservas: ReservaLite[],
  opts: { agora: Agora; equipe?: boolean; excluirId?: string },
): Slot[] {
  const faixa = faixaDoDia(data, cfg);
  if (!faixa) return [];
  const alvo = limpaData(data);
  const hoje = opts.agora.data;
  const slots: Slot[] = [];
  for (let h = faixa.inicio; h < faixa.fim; h++) {
    const { livres, disponivel } = capacidadeHora(h, alvo, reservas, cfg.qtdRecursos, opts.agora.ms, cfg.expiracaoPendenteMin, opts.excluirId);
    let passou = false;
    if (alvo < hoje) passou = true;
    else if (alvo === hoje) {
      const inicioSlot = h * 60;
      // Cliente: hora que já começou não vale. Equipe: ainda dá para encaixar até 10 minutos depois do início.
      passou = opts.equipe ? opts.agora.minutos > inicioSlot + 10 : opts.agora.minutos >= inicioSlot;
    }
    slots.push({ hora: horaDeMinutos(h * 60), rotulo: horaParaExibir(horaDeMinutos(h * 60)), disponivel: disponivel && !passou, livres, passou });
  }
  return slots;
}

// ─── preço, pessoas e blocos ─────────────────────────────────────────────────

export function precoPorHora(data: string, cfg: Pick<ConfigAgenda, "precoDiaUtil" | "precoFimSemana" | "diasFimSemana">): number {
  return cfg.diasFimSemana.includes(diaDaSemana(data)) ? cfg.precoFimSemana : cfg.precoDiaUtil;
}

/** Arredonda para centavos sem erro de ponto flutuante. */
export const centavos = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export function totalPadrao(data: string, cfg: ConfigAgenda, recursos: number, horas: number): number {
  return centavos(precoPorHora(data, cfg) * recursos * horas);
}

export function recursosParaPessoas(pessoas: number, porRecurso: number, maxRecursos: number): number {
  return Math.min(maxRecursos, Math.max(1, Math.ceil(Math.max(1, pessoas) / Math.max(1, porRecurso))));
}

export const maxPessoas = (recursos: number, porRecurso: number) => Math.max(1, recursos) * Math.max(1, porRecurso);

export interface Bloco {
  hora: string;
  /** Horas. */
  duracao: number;
}

/** Horas soltas ("18:00","19:00","21:00") viram faixas seguidas: 18h por 2h e 21h por 1h. */
export function agruparBlocos(horas: string[]): Bloco[] {
  const ordenadas = Array.from(new Set(horas.map((h) => Math.floor(minutosDaHora(h) / 60)))).sort((a, b) => a - b);
  const blocos: Bloco[] = [];
  for (const h of ordenadas) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && minutosDaHora(ultimo.hora) / 60 + ultimo.duracao === h) ultimo.duracao += 1;
    else blocos.push({ hora: horaDeMinutos(h * 60), duracao: 1 });
  }
  return blocos;
}

/** Reparte o total entre as faixas, proporcional à duração; a soma fecha exatamente no total. */
export function ratearValor(total: number, blocos: Bloco[]): number[] {
  const soma = blocos.reduce((s, b) => s + b.duracao, 0) || 1;
  const partes = blocos.map((b) => centavos((total * b.duracao) / soma));
  const diferenca = centavos(total - partes.reduce((s, v) => s + v, 0));
  if (partes.length) partes[partes.length - 1] = centavos(partes[partes.length - 1] + diferenca);
  return partes;
}

// ─── validação de uma reserva ────────────────────────────────────────────────

export interface EntradaReserva {
  data: string;
  hora: string;
  duracao: number;
  qtdRecursos: number;
  qtdPessoas: number;
  mesa?: boolean;
  mesaCadeiras?: number;
}

export type ResultadoValidacao = { ok: true } | { ok: false; codigo: string; erro: string };

export function validarReserva(
  e: EntradaReserva,
  cfg: ConfigAgenda,
  reservas: ReservaLite[],
  opts: { agora: Agora; equipe?: boolean; manual?: boolean; excluirId?: string },
): ResultadoValidacao {
  const falha = (codigo: string, erro: string): ResultadoValidacao => ({ ok: false, codigo, erro });
  const data = limpaData(e.data);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return falha("data_invalida", "Data inválida.");
  if (data < opts.agora.data) return falha("data_passada", "Essa data já passou.");
  const faixa = faixaDoDia(data, cfg);
  if (!faixa) return falha("fechado", "Estamos fechados nesse dia.");

  if (!Number.isInteger(e.qtdRecursos) || e.qtdRecursos < 1) return falha("recursos_invalidos", "Informe a quantidade.");
  if (e.qtdRecursos > cfg.qtdRecursos) return falha("recursos_demais", `Só existem ${cfg.qtdRecursos} no total.`);
  if (!Number.isInteger(e.qtdPessoas) || e.qtdPessoas < 1) return falha("pessoas_invalidas", "Informe a quantidade de pessoas.");
  const limitePessoas = maxPessoas(e.qtdRecursos, cfg.pessoasPorRecurso);
  if (e.qtdPessoas > limitePessoas) return falha("pessoas_demais", `Para ${e.qtdRecursos} reserva(s), o máximo é ${limitePessoas} pessoas.`);

  const dur = Number(e.duracao);
  if (!Number.isFinite(dur) || dur <= 0 || dur > 24) return falha("duracao_invalida", "Duração inválida.");
  const [ini, fim] = [minutosDaHora(e.hora), minutosDaHora(e.hora) + Math.round(dur * 60)];
  // Reserva normal fica dentro do horário de funcionamento; a equipe pode encaixar fora dele (modo manual).
  if (!opts.manual && (ini < faixa.inicio * 60 || fim > faixa.fim * 60)) return falha("fora_do_horario", "Esse horário está fora do funcionamento.");
  if (!opts.manual && ini % 60 !== 0) return falha("hora_quebrada", "Escolha um horário cheio.");

  // Hoje: não dá para reservar um horário que já começou.
  if (data === opts.agora.data) {
    const limite = opts.equipe ? opts.agora.minutos - 10 : opts.agora.minutos;
    if (ini < limite) return falha("horario_passou", "Esse horário já passou.");
  }

  for (let h = Math.floor(ini / 60); h < Math.ceil(fim / 60); h++) {
    const { livres } = capacidadeHora(h, data, reservas, cfg.qtdRecursos, opts.agora.ms, cfg.expiracaoPendenteMin, opts.excluirId);
    if (livres < e.qtdRecursos) {
      return falha("sem_vaga", livres === 0 ? `Sem vaga às ${horaParaExibir(horaDeMinutos(h * 60))}.` : `Só há ${livres} livre(s) às ${horaParaExibir(horaDeMinutos(h * 60))}.`);
    }
  }

  if (e.mesa) {
    const cadeiras = Number(e.mesaCadeiras) || 0;
    const teto = Math.min(36, Math.max(cfg.cadeirasMax, e.qtdPessoas));
    if (cadeiras < 1) return falha("mesa_sem_lugares", "Informe quantos lugares na mesa.");
    if (cadeiras > teto) return falha("mesa_lugares_demais", `O máximo de lugares na mesa é ${teto}.`);
    const mesasNoDia = reservas.filter(
      (r) => limpaData(r.data) === data && r.mesa && r.id !== opts.excluirId && ocupaVaga(r, opts.agora.ms, cfg.expiracaoPendenteMin),
    ).length;
    if (mesasNoDia >= cfg.mesasMaxPorDia) return falha("mesas_esgotadas", "As mesas desse dia esgotaram.");
  }
  return { ok: true };
}

// ─── check-in e no-show por unidade (cada pista de cada hora) ────────────────

/** Identificador de uma unidade: uma pista (`indice`, a partir de 1) numa hora da reserva. */
export const unidadeId = (reservaId: string, hora: number, indice: number) => `${reservaId}_${String(hora).padStart(2, "0")}:00_${indice}`;

export interface MarcacaoUnidade {
  checkinIds: string[];
  noshowIds: string[];
  status: StatusReserva;
}

/** Marca ou desmarca check-in / no-show de UMA unidade e recalcula o status geral da reserva. */
export function marcarUnidade(
  atual: { status: StatusReserva; checkinIds: string[]; noshowIds: string[] },
  uid: string,
  tipo: "CHECK_IN" | "NO_SHOW",
): MarcacaoUnidade {
  let checkin = [...atual.checkinIds];
  let noshow = [...atual.noshowIds];
  if (tipo === "CHECK_IN") {
    if (checkin.includes(uid)) checkin = checkin.filter((x) => x !== uid);
    else { checkin.push(uid); noshow = noshow.filter((x) => x !== uid); }
  } else if (noshow.includes(uid)) noshow = noshow.filter((x) => x !== uid);
  else { noshow.push(uid); checkin = checkin.filter((x) => x !== uid); }
  const status: StatusReserva = checkin.length > 0 ? "Check-in" : noshow.length > 0 ? "No-show" : "Confirmada";
  return { checkinIds: checkin, noshowIds: noshow, status };
}

// ─── métricas e alertas do dia ───────────────────────────────────────────────

export interface MetricasDia {
  total: number;
  pendentes: number;
  confirmadas: number;
  checkin: number;
  noshow: number;
}

/** Contagem por unidade (recursos × horas) das reservas já filtradas do dia. */
export function metricasDoDia(reservas: (ReservaLite & { checkinIds?: string[]; noshowIds?: string[] })[]): MetricasDia {
  const m: MetricasDia = { total: 0, pendentes: 0, confirmadas: 0, checkin: 0, noshow: 0 };
  for (const r of reservas) {
    const recursos = Math.max(1, r.qtdRecursos || 1);
    const unidades = recursos * Math.max(1, Math.ceil(r.duracao || 1));
    m.total += unidades;
    if (r.status === "Check-in") m.checkin += r.checkinIds?.length || recursos;
    else if (r.status === "No-show") m.noshow += r.noshowIds?.length || 0;
    if (r.statusPagamento === "Pendente") m.pendentes += unidades;
    else m.confirmadas += unidades;
  }
  return m;
}

export type TipoAlerta = "PENDENCIA_PASSADA" | "PARTIDA_ENCERRADA" | "SITE_URGENTE" | "COMANDA_HOJE";

export interface Alerta {
  tipo: TipoAlerta;
  reservaId: string;
  mensagem: string;
  /** Minutos que faltam para o pagamento expirar (só SITE_URGENTE). */
  restanteMin?: number;
  urgente?: boolean;
}

const ORDEM_ALERTA: Record<TipoAlerta, number> = { PENDENCIA_PASSADA: 0, PARTIDA_ENCERRADA: 1, SITE_URGENTE: 2, COMANDA_HOJE: 3 };

export function calcularAlertas(
  reservas: (ReservaLite & { contatoNome: string; recursosAtribuidos?: number[] })[],
  agora: Agora,
  expiracaoMin: number,
): Alerta[] {
  const alertas: Alerta[] = [];
  const fmt = (d: string) => limpaData(d).split("-").reverse().join("/");
  for (const r of reservas) {
    if (!r || r.status === "Cancelada" || r.statusPagamento === "Pago" || r.statusPagamento === "Reembolsado") continue;

    // Pagamento do site correndo contra o relógio.
    if (r.status === "Pendente" && !r.pagarNoLocal && r.createdAt) {
      const decorrido = (agora.ms - new Date(r.createdAt).getTime()) / 60000;
      if (decorrido >= 0 && decorrido < expiracaoMin) {
        const restante = Math.ceil(expiracaoMin - decorrido);
        alertas.push({ tipo: "SITE_URGENTE", reservaId: r.id, restanteMin: restante, urgente: decorrido >= expiracaoMin - 10, mensagem: `Pagamento de ${r.contatoNome} expira em ${restante} min` });
      }
      continue; // pendente expirada: já saiu da agenda
    }

    const data = limpaData(r.data);
    if (data < agora.data) {
      const [y1, m1, d1] = data.split("-").map(Number);
      const [y2, m2, d2] = agora.data.split("-").map(Number);
      const dias = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
      alertas.push({ tipo: "PENDENCIA_PASSADA", reservaId: r.id, mensagem: `Pendência de ${dias} dia(s) atrás: ${r.contatoNome} — ${fmt(data)}` });
    } else if (data === agora.data) {
      const [ini, fim] = intervalo(r);
      if (r.status === "Check-in") {
        if (agora.minutos >= fim) alertas.push({ tipo: "PARTIDA_ENCERRADA", reservaId: r.id, mensagem: `Encerrou: ${r.contatoNome} terminou às ${horaParaExibir(horaDeMinutos(fim))}. Dar baixa!` });
        else alertas.push({ tipo: "COMANDA_HOJE", reservaId: r.id, mensagem: `Em andamento: ${r.contatoNome}${r.recursosAtribuidos?.length ? ` (${r.recursosAtribuidos.join(", ")})` : ""} — pagamento pendente` });
      } else {
        alertas.push({ tipo: "COMANDA_HOJE", reservaId: r.id, mensagem: `Hoje: ${r.contatoNome} às ${horaParaExibir(horaDeMinutos(ini))} — pagamento no local pendente` });
      }
    }
  }
  return alertas.sort((a, b) => ORDEM_ALERTA[a.tipo] - ORDEM_ALERTA[b.tipo]);
}

// ─── pagamento ───────────────────────────────────────────────────────────────

export interface DetalhePagamento {
  method: string;
  amount: number;
}

/** Pagamento misto: a soma das formas tem que fechar com o total (tolerância de 1 centavo). */
export function validarPagamentoMisto(total: number, detalhes: DetalhePagamento[]): { ok: true } | { ok: false; erro: string } {
  if (!detalhes.length) return { ok: false, erro: "Informe ao menos uma forma de pagamento." };
  for (const d of detalhes) {
    if (!(FORMAS_PAGAMENTO as readonly string[]).includes(d.method)) return { ok: false, erro: `Forma de pagamento inválida: ${d.method}.` };
    if (!(d.amount >= 0) || !Number.isFinite(d.amount)) return { ok: false, erro: "Valor inválido numa das formas de pagamento." };
  }
  const soma = detalhes.reduce((s, d) => s + d.amount, 0);
  if (Math.abs(soma - total) > 0.01) return { ok: false, erro: `A soma dos pagamentos (R$ ${soma.toFixed(2)}) deve ser igual ao total (R$ ${total.toFixed(2)}).` };
  return { ok: true };
}

/**
 * Pagamento online aprovado: confirmar ou estornar? Dentro do prazo (mais uma margem) sempre confirma. Passou do
 * prazo: só confirma se a vaga ainda estiver livre contando apenas reservas Confirmadas ou em Check-in; senão estorna.
 */
export function decidirPagamentoAprovado(
  reserva: ReservaLite,
  outras: ReservaLite[],
  cfg: Pick<ConfigAgenda, "qtdRecursos" | "expiracaoPendenteMin">,
  agoraMs: number,
): { acao: "confirmar" | "estornar"; atrasoMin: number } {
  const criada = reserva.createdAt ? new Date(reserva.createdAt).getTime() : agoraMs;
  const atrasoMin = Math.max(0, (agoraMs - criada) / 60000);
  if (atrasoMin <= cfg.expiracaoPendenteMin + MARGEM_PAGAMENTO_ATRASADO_MIN) return { acao: "confirmar", atrasoMin };

  const firmes = outras.filter((o) => o.id !== reserva.id && (o.status === "Confirmada" || o.status === "Check-in"));
  const [ini, fim] = intervalo(reserva);
  for (let h = Math.floor(ini / 60); h < Math.ceil(fim / 60); h++) {
    const ocupados = ocupadosNaHora(h, reserva.data, firmes, agoraMs, cfg.expiracaoPendenteMin);
    if (ocupados + reserva.qtdRecursos > cfg.qtdRecursos) return { acao: "estornar", atrasoMin };
  }
  return { acao: "confirmar", atrasoMin };
}

/** Forma de pagamento gravada a partir do tipo do Mercado Pago. */
export function formaPorTipoMercadoPago(tipo: string | null | undefined): string {
  if (tipo === "bank_transfer") return "PIX";
  if (tipo === "credit_card") return "CREDITO";
  if (tipo === "debit_card") return "DEBITO";
  return "ONLINE";
}

/** Lançamento financeiro da reserva: vale o total só se confirmada/em check-in E paga; senão zera. */
export function valorReconhecido(r: Pick<ReservaLite, "status" | "statusPagamento"> & { valorTotal: number }): number {
  return (r.status === "Confirmada" || r.status === "Check-in") && r.statusPagamento === "Pago" ? centavos(r.valorTotal) : 0;
}
