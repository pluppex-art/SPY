/**
 * Departamentos disponíveis nas tarefas (tarefa de cliente OU interna de qualquer área).
 * Junta os departamentos padrão, os que as pessoas da equipe já usam e os que já aparecem em tarefas.
 */
export const DEPARTAMENTOS_TAREFA_PADRAO = [
  "Comercial", "Marketing", "Dev", "Tráfego", "Conteúdo", "Operações",
  "Atendimento", "Financeiro", "RH", "Diretoria",
];

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function listarDepartamentosTarefa(colaboradores: any[], tarefas: any[] = []): string[] {
  const vistos = new Map<string, string>();
  const add = (nome: unknown) => {
    const n = String(nome ?? "").trim();
    if (n && !vistos.has(norm(n))) vistos.set(norm(n), n);
  };
  DEPARTAMENTOS_TAREFA_PADRAO.forEach(add);
  (colaboradores || []).forEach((c) => c?.status !== "Desligado" && add(c?.departamento));
  (tarefas || []).forEach((t) => add(t?.departamento));
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export const mesmoDepartamento = (a: unknown, b: unknown) => !!norm(a) && norm(a) === norm(b);

/** Tipos de tarefa por escopo: o que é feito com um cliente x o que é trabalho interno de uma área. */
export const TIPOS_TAREFA_CLIENTE = [
  "Reunião Presencial", "Call Online", "Acompanhamento (Follow-up)", "Demonstração",
  "Envio Docs", "Ligação", "Visita Comercial", "Proposta", "Entrega ao cliente", "Suporte ao cliente",
];
export const TIPOS_TAREFA_INTERNA = [
  "Tarefa interna", "Reunião interna", "Revisão", "Planejamento", "Entrega / Produção",
  "Suporte interno", "Administrativo", "Financeiro", "Contratação / RH", "Melhoria de processo",
];
