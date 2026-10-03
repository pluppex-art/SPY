import type { OrdemServico, OsDepartamento, OsFunil, OsPrioridade, OsStatus } from "./osTypes";

export const rowToDepartamento = (r: any): OsDepartamento => ({
  id: r.id,
  nome: r.nome,
  cor: r.cor || "blue",
  ordem: r.ordem ?? 0,
  ativo: r.ativo ?? true,
});

export const rowToFunil = (r: any): OsFunil => ({
  id: r.id,
  departamentoId: r.departamento_id,
  nome: r.nome,
  etapas: Array.isArray(r.etapas) ? r.etapas : [],
  padrao: !!r.padrao,
  ativo: r.ativo ?? true,
});

// Mapeia public.ordens_servico (colunas legadas: responsavel, data_prevista, status...).
export const rowToOrdem = (r: any): OrdemServico => ({
  id: r.id,
  numero: Number(r.numero) || 0,
  titulo: r.titulo,
  descricao: r.descricao || "",
  status: (r.status as OsStatus) || "Aberta",
  departamentoId: r.departamento_id ?? null,
  funilId: r.funil_id ?? null,
  etapaId: r.etapa_id ?? null,
  prioridade: (r.prioridade as OsPrioridade) || "Normal",
  solicitanteNome: r.solicitante_nome || "",
  responsavelNome: r.responsavel || "",
  clienteNome: r.cliente_nome || "",
  prazo: r.data_prevista || null,
  dataConclusao: r.data_conclusao || null,
  valorTotal: Number(r.valor_total) || 0,
  campos: r.campos && typeof r.campos === "object" ? r.campos : {},
  origemTipo: r.origem_tipo ?? null,
  origemId: r.origem_id ?? null,
  clienteId: (r.campos && typeof r.campos === "object" && r.campos.cliente_id) || null,
  createdAt: r.created_at,
});

