/** Contas do Painel Dev, a partir das tarefas, issues, projetos e ambientes da empresa. */
export interface TarefaPainel { id: string; title: string; type: string; priority: string; points: number | null; column_id: string; project: string | null; project_id?: string | null; created_at: string; updated_at: string | null }
export interface IssuePainel { id: string; title: string; severity: string | null; status: string; created_at: string; updated_at: string | null }

const DIA = 86_400_000;

/** Segunda-feira (00:00, horário local) da semana da data. */
export function inicioDaSemana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function resumoDev(tarefas: TarefaPainel[], issues: IssuePainel[]) {
  const pts = (t: TarefaPainel) => Number(t.points) || 0;
  const abertas = tarefas.filter(t => t.column_id !== 'done');
  return {
    pontosTotal: tarefas.reduce((s, t) => s + pts(t), 0),
    pontosConcluidos: tarefas.filter(t => t.column_id === 'done').reduce((s, t) => s + pts(t), 0),
    tarefasAbertas: abertas.length,
    emAndamento: tarefas.filter(t => t.column_id === 'inprogress' || t.column_id === 'review').length,
    bugsAbertos: abertas.filter(t => t.type === 'bug').length + issues.filter(i => i.status !== 'fechado').length,
  };
}

/**
 * Últimas `n` semanas: tarefas criadas e concluídas. A conclusão usa a data da última atualização da tarefa
 * que está em "Concluído" (o banco não guarda a data em que ela mudou de etapa).
 */
export function porSemana(tarefas: TarefaPainel[], n = 8, hoje = new Date()) {
  const base = inicioDaSemana(hoje);
  return Array.from({ length: n }, (_, i) => {
    const ini = new Date(base.getFullYear(), base.getMonth(), base.getDate() - (n - 1 - i) * 7);
    const fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 7);
    const dentro = (iso: string | null) => { const t = iso ? Date.parse(iso) : NaN; return t >= ini.getTime() && t < fim.getTime(); };
    const feitas = tarefas.filter(t => t.column_id === 'done' && dentro(t.updated_at || t.created_at));
    return {
      semana: ini.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      criadas: tarefas.filter(t => dentro(t.created_at)).length,
      concluidas: feitas.length,
      pontos: feitas.reduce((s, t) => s + (Number(t.points) || 0), 0),
    };
  });
}

export function haQuanto(iso: string, agora = Date.now()): string {
  const ms = agora - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  if (ms < 3_600_000) return `há ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < DIA) return `há ${Math.round(ms / 3_600_000)} h`;
  const d = Math.floor(ms / DIA);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}
