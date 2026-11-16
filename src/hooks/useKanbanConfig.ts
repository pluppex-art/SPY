export interface KanbanColConfig {
  id: string;
  nome: string;
  cor: string;
  iniciarMinimizado: boolean;
}

export const KANBAN_KEYS = {
  marketing: 'axis_kanban_marketing',
  trafego: 'axis_kanban_trafego',
  educacao: 'axis_kanban_educacao',
  tarefas: 'axis_kanban_tarefas',
  sprint: 'axis_kanban_sprint',
} as const;

export const KANBAN_DEFAULTS: Record<string, KanbanColConfig[]> = {
  [KANBAN_KEYS.marketing]: [
    { id: 'ideia', nome: 'Ideias', cor: 'slate', iniciarMinimizado: false },
    { id: 'producao', nome: 'Em Produção', cor: 'blue', iniciarMinimizado: false },
    { id: 'revisao', nome: 'Em Revisão', cor: 'amber', iniciarMinimizado: false },
    { id: 'agendado', nome: 'Agendado', cor: 'purple', iniciarMinimizado: false },
    { id: 'publicado', nome: 'Publicado', cor: 'emerald', iniciarMinimizado: false },
  ],
  [KANBAN_KEYS.trafego]: [
    { id: 'planejamento', nome: 'Planejamento', cor: 'slate', iniciarMinimizado: false },
    { id: 'criativos', nome: 'Criativos', cor: 'blue', iniciarMinimizado: false },
    { id: 'revisao', nome: 'Em Revisão', cor: 'amber', iniciarMinimizado: false },
    { id: 'no_ar', nome: 'No Ar', cor: 'emerald', iniciarMinimizado: false },
    { id: 'otimizacao', nome: 'Otimização', cor: 'purple', iniciarMinimizado: false },
    { id: 'encerrada', nome: 'Encerrada', cor: 'rose', iniciarMinimizado: false },
  ],
  [KANBAN_KEYS.educacao]: [
    { id: 'Rascunho', nome: 'Rascunho', cor: 'slate', iniciarMinimizado: false },
    { id: 'Em Revisão', nome: 'Em Revisão', cor: 'amber', iniciarMinimizado: false },
    { id: 'Publicado', nome: 'Publicado', cor: 'emerald', iniciarMinimizado: false },
  ],
  [KANBAN_KEYS.tarefas]: [
    { id: 'Atrasado', nome: 'Atrasado', cor: 'rose', iniciarMinimizado: false },
    { id: 'Em Aberto', nome: 'Em Aberto', cor: 'amber', iniciarMinimizado: false },
    { id: 'Concluída', nome: 'Concluída', cor: 'emerald', iniciarMinimizado: false },
  ],
  [KANBAN_KEYS.sprint]: [
    { id: 'backlog', nome: 'Backlog', cor: 'slate', iniciarMinimizado: false },
    { id: 'todo', nome: 'A Fazer', cor: 'blue', iniciarMinimizado: false },
    { id: 'inprogress', nome: 'Em Progresso', cor: 'amber', iniciarMinimizado: false },
    { id: 'review', nome: 'Em Review', cor: 'indigo', iniciarMinimizado: false },
    { id: 'done', nome: 'Concluído', cor: 'emerald', iniciarMinimizado: false },
  ],
};

export const KANBAN_COR_CLASS: Record<string, string> = {
  slate: 'bg-slate-500',
  blue: 'bg-blue-500',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-500',
  emerald: 'bg-emerald-500',
  purple: 'bg-purple-500',
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  indigo: 'bg-indigo-500',
  pink: 'bg-pink-500',
};

export const KANBAN_COR_DOT: Record<string, string> = {
  slate: '#64748b',
  blue: '#3b82f6',
  orange: '#f97316',
  cyan: '#06b6d4',
  emerald: '#10b981',
  purple: '#a855f7',
  rose: '#f43f5e',
  amber: '#f59e0b',
  indigo: '#6366f1',
  pink: '#ec4899',
};

export const KANBAN_COR_TOP: Record<string, string> = {
  slate: '#334155',
  blue: '#2563eb',
  orange: '#ea580c',
  cyan: '#0891b2',
  emerald: '#059669',
  purple: '#9333ea',
  rose: '#e11d48',
  amber: '#d97706',
  indigo: '#4f46e5',
  pink: '#db2777',
};

// Configuração das colunas do board é dado de tenant (compartilhado pelo time),
// gravada via `saveAppSetting` em app_settings — lida aqui a partir do mapa já
// carregado pelo DataContext (`useData().appSettings`), nunca de localStorage.
export function readKanbanConfig(appSettings: Record<string, any>, key: string): KanbanColConfig[] {
  const saved = appSettings?.[key];
  return Array.isArray(saved) && saved.length > 0 ? saved : (KANBAN_DEFAULTS[key] ?? []);
}
