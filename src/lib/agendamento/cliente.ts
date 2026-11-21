/** Ponte entre as telas e o servidor do Agendamento: tipos, conversão de linhas do banco e chamadas autenticadas. */
import { apiFetch } from "../apiClient";
import { formatBRL } from "../dinheiro";
import type { ConfigAgenda, ReservaLite, StatusPagamento, StatusReserva } from "./engine";

export interface ConfigLinha {
  tenant_id: string; slug: string | null; ativo: boolean; nome_estabelecimento: string | null; endereco: string | null; telefone: string | null; whatsapp: string | null; logo_url: string | null;
  recurso_singular: string; recurso_plural: string; qtd_recursos: number; pessoas_por_recurso: number; preco_dia_util: number; preco_fim_semana: number; dias_fim_semana: number[];
  horarios: { aberto: boolean; inicio: number; fim: number }[]; datas_bloqueadas: string[]; tipos_evento: string[]; expiracao_pendente_min: number; fuso: string; pagamento_online: boolean;
  mesas_ativo: boolean; mesas_max_por_dia: number; cadeiras_max: number; permissoes_equipe: Record<"criar" | "editar" | "cancelar" | "receber" | "sem_contato", boolean>;
}

export interface Reserva extends ReservaLite {
  grupoId: string; qtdPessoas: number; valorTotal: number; tipoEvento: string | null; observacoes: string | null; formaPagamento: string | null; detalhesPagamento: { method: string; amount: number }[];
  comanda: string | null; mesaCadeiras: number | null; aniversariante: string | null; checkinIds: string[]; noshowIds: string[]; recursosAtribuidos: number[]; origem: string;
  criadoPorNome: string | null; contatoNome: string; contatoTelefone: string | null; contatoEmail: string | null; motivoCancelamento: string | null; leadId: string | null;
}

export function linhaParaReserva(r: any): Reserva {
  return {
    id: r.id, grupoId: r.grupo_id, data: String(r.data).slice(0, 10), hora: r.hora, duracao: Number(r.duracao), qtdRecursos: r.qtd_recursos, qtdPessoas: r.qtd_pessoas ?? 0, valorTotal: Number(r.valor_total) || 0,
    status: r.status as StatusReserva, statusPagamento: r.status_pagamento as StatusPagamento, pagarNoLocal: !!r.pagar_no_local, createdAt: r.created_at, mesa: !!r.mesa,
    tipoEvento: r.tipo_evento ?? null, observacoes: r.observacoes ?? null, formaPagamento: r.forma_pagamento ?? null, detalhesPagamento: Array.isArray(r.detalhes_pagamento) ? r.detalhes_pagamento : [],
    comanda: r.comanda ?? null, mesaCadeiras: r.mesa_cadeiras ?? null, aniversariante: r.aniversariante ?? null, checkinIds: r.checkin_ids ?? [], noshowIds: r.noshow_ids ?? [],
    recursosAtribuidos: r.recursos_atribuidos ?? [], origem: r.origem ?? "equipe", criadoPorNome: r.criado_por_nome ?? null, contatoNome: r.contato_nome ?? "", contatoTelefone: r.contato_telefone ?? null,
    contatoEmail: r.contato_email ?? null, motivoCancelamento: r.motivo_cancelamento ?? null, leadId: r.lead_id ?? null,
  };
}

export function configParaEngine(c: ConfigLinha): ConfigAgenda {
  return { qtdRecursos: c.qtd_recursos, pessoasPorRecurso: c.pessoas_por_recurso, precoDiaUtil: Number(c.preco_dia_util), precoFimSemana: Number(c.preco_fim_semana), diasFimSemana: c.dias_fim_semana,
    horarios: c.horarios, datasBloqueadas: c.datas_bloqueadas ?? [], expiracaoPendenteMin: c.expiracao_pendente_min, mesasMaxPorDia: c.mesas_max_por_dia, cadeirasMax: c.cadeiras_max };
}

export const reaisBR = (v: number) => formatBRL(v);
export const dataBR = (iso: string) => iso.split("-").reverse().join("/");
export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const FORMAS = [{ id: "DINHEIRO", rotulo: "Dinheiro" }, { id: "PIX", rotulo: "Pix" }, { id: "DEBITO", rotulo: "Débito" }, { id: "CREDITO", rotulo: "Crédito" }] as const;

export class ErroApi extends Error { constructor(m: string, public status: number, public code?: string) { super(m); } }

/** Chama uma rota do Agendamento da equipe. Lança ErroApi com a mensagem pronta para mostrar ao usuário. */
let tenantAtivo: string | undefined;
/** Empresa que está sendo vista (master/parceiro pode estar em outra que não a do próprio login): vai em toda chamada. */
export const definirTenantAtivo = (id: string | undefined) => { tenantAtivo = id; };

export async function chamar<T = any>(metodo: "GET" | "POST" | "PUT" | "PATCH", caminho: string, corpo?: unknown): Promise<T> {
  if (tenantAtivo) caminho += `${caminho.includes("?") ? "&" : "?"}tenantId=${encodeURIComponent(tenantAtivo)}`;
  const r = await apiFetch(caminho, { method: metodo, headers: corpo ? { "Content-Type": "application/json" } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroApi(j?.error || "Não foi possível concluir. Tente novamente.", r.status, j?.code);
  return j as T;
}
