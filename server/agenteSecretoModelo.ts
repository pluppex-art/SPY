/**
 * Sessões-modelo para copiar o webhook (n8n) ao criar a sessão do Agente Secreto de um colaborador.
 * Preferência: sessões pessoais de colaboradores da empresa (padrão de sempre); na falta delas — empresa nova, ainda sem
 * nenhum colaborador com sessão — a sessão do Agente Secreto da própria empresa, criada pelo agente de implementação
 * (ex.: "agente_secreto-luminar"). Nunca de outra empresa: o webhook é o do workflow desta empresa.
 */
export interface SessaoInstancia { name: string; webhook_url?: string | null; colaborador_id?: string | null }

const NOME_AGENTE_SECRETO = /agente[-_ ]?secreto/i;

export function sessoesModelo(sessoes: SessaoInstancia[], limite = 6): SessaoInstancia[] {
  const pessoais = sessoes.filter((s) => s.colaborador_id);
  const daEmpresa = sessoes.filter((s) => !s.colaborador_id && NOME_AGENTE_SECRETO.test(s.name || ""));
  return [...pessoais, ...daEmpresa].slice(0, limite);
}
