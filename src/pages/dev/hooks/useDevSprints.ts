import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'sonner';
import type { TarefaSprintPayload } from '../modals/NovaTarefaSprintModal';
import { friendlyError } from "../../../lib/friendlyError";
import { fetchAllRows } from "../../../lib/pgrst";
import { enviarAnexos, apagarAnexo, type Anexo } from "../lib/anexos";

export type Priority = 'crítica' | 'alta' | 'média' | 'baixa';
export type Column = 'backlog' | 'todo' | 'inprogress' | 'review' | 'done';

export interface SprintTask {
  id: string | number;
  title: string;
  type: 'feature' | 'bug' | 'chore' | 'refactor';
  priority: Priority;
  points: number;
  assignee: string;
  tags: string[];
  column: Column;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  /** O que precisa ser feito. */
  description: string;
  /** O que aconteceu / mensagem de erro. */
  errorDetail: string;
  checklist: PassoTarefa[];
  attachments: Anexo[];
  /** De onde veio o pedido (ex.: Agente Secreto Interno). */
  source: OrigemTarefa | null;
}

export interface PassoTarefa { texto: string; feito: boolean }
export interface OrigemTarefa { origem?: string; solicitante?: string; grupo?: string; mensagem?: string; recebido_em?: string }
export type PatchTarefa = Partial<Pick<SprintTask, 'title' | 'type' | 'priority' | 'points' | 'assignee' | 'tags' | 'description' | 'errorDetail' | 'checklist' | 'attachments'>>;

const COL_MAP: Record<string, Column> = {
  'Backlog': 'backlog', 'A Fazer': 'todo', 'Em Progresso': 'inprogress',
  'Em Review': 'review', 'Concluído': 'done',
};



function rowToTask(row: any): SprintTask {
  return {
    id: row.id,
    title: row.title,
    type: row.type as SprintTask['type'],
    priority: row.priority as Priority,
    points: row.points || 1,
    assignee: row.assignee || '',
    tags: row.tags || [],
    column: row.column_id as Column,
    projectId: row.project_id ?? row.project ?? null,
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
    description: row.description ?? '',
    errorDetail: row.error_detail ?? '',
    checklist: Array.isArray(row.checklist) ? row.checklist.filter((p: any) => p && typeof p.texto === 'string') : [],
    attachments: Array.isArray(row.attachments) ? row.attachments.filter((a: any) => a && (a.path || a.url)).map((a: any) => ({ ...a, nome: String(a.nome || 'anexo') })) : [],
    source: row.source && typeof row.source === 'object' ? row.source : null,
  };
}

export function useDevSprints(projectId?: string | null) {
  const { activeTenantId } = useAuth();
  const [tasks, setTasks] = useState<SprintTask[]>([]);


  const [loading, setLoading] = useState(false);

  // As colunas de detalhes entram pela migração 20261221; enquanto ela não for aplicada, a tela avisa e
  // continua funcionando só com os campos básicos.
  const [detalhesDisponiveis, setDetalhesDisponiveis] = useState(true);
  useEffect(() => {
    if (!supabase) return;
    supabase.from('dev_sprint_tasks').select('description,error_detail,checklist,attachments,source').limit(1)
      .then(({ error }) => { if (error && /42703|PGRST204|column/i.test(`${error.code} ${error.message}`)) setDetalhesDisponiveis(false); });
  }, []);


  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    // Evita que a resposta de um filtro antigo sobrescreva a do filtro atual.
    let cancelled = false;
    setTasks([]);

    async function load() {
      setLoading(true);
      // Sem projeto = "Todos os projetos": traz as tarefas da empresa inteira.
      const data = await fetchAllRows(() => {
        const q = supabase!.from('dev_sprint_tasks').select('*').eq('tenant_id', activeTenantId);
        // Suporta o schema novo (project_id) e legado (project)
        return (projectId ? q.or(`project_id.eq.${projectId},project.eq.${projectId}`) : q)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true });
      });
      if (cancelled) return;
      setTasks(data.map(rowToTask));
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [projectId, activeTenantId]);


  async function addTask(payload: TarefaSprintPayload) {
    const column = (COL_MAP[payload.column] || 'backlog') as Column;

    if (!projectId) {
      toast.error('Selecione um projeto para adicionar tarefas.');
      return;
    }

    if (!supabase) {
      setTasks(prev => [...prev, { id: Date.now(), title: payload.title, type: payload.type, priority: payload.priority, points: payload.points, assignee: payload.assignee || '?', tags: [], column, projectId: projectId ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), description: payload.description || '', errorDetail: payload.errorDetail || '', checklist: [], attachments: [], source: null }]);
      toast.success('Tarefa adicionada!');
      return;
    }

    const { data, error } = await supabase
      .from('dev_sprint_tasks')
      .insert({
        tenant_id: activeTenantId,
        title: payload.title,
        type: payload.type,
        priority: payload.priority,
        points: payload.points,
        assignee: payload.assignee || '',
        tags: [],
        column_id: column,
        project: projectId,
        sprint_id: projectId,
        ...(detalhesDisponiveis ? { description: payload.description || null, error_detail: payload.errorDetail || null } : {}),
      })
      .select()
      .maybeSingle();

    if (error) { toast.error('Erro ao adicionar tarefa'); return; }
    if (data) {
      let nova = rowToTask(data);
      if (detalhesDisponiveis && payload.files?.length && activeTenantId) {
        const { anexos, falhas } = await enviarAnexos(activeTenantId, nova.id, payload.files);
        if (anexos.length) {
          const { error: anexoError } = await supabase.from('dev_sprint_tasks').update({ attachments: anexos }).eq('id', nova.id).eq('tenant_id', activeTenantId);
          if (anexoError) falhas.push(...anexos.map(a => a.nome));
          else nova = { ...nova, attachments: anexos };
        }
        if (falhas.length) toast.error(`Não foi possível anexar: ${falhas.join(', ')}`);
      }
      setTasks(prev => [...prev, nova]);
      toast.success('Tarefa adicionada!');
    }
  }


  async function moveTask(id: string | number, column: Column) {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, column } : t)));
    if (!supabase) return;

    // Atualiza card
    const { error: moveError } = await supabase
      .from('dev_sprint_tasks')
      .update({ column_id: column })
      .eq('id', id)
      .eq('tenant_id', activeTenantId);

    if (moveError) {
      console.error('[Supabase] move dev_sprint_tasks error:', moveError.message);
      toast.error(`Erro ao mover tarefa: ${friendlyError(moveError)}`);
    }

    // Recalcula progresso do projeto (100% automático)
    // Progresso = cards concluídos / total backlog do projeto
    // Em "Todos os projetos", o projeto é o da própria tarefa movida.
    const taskProjectId = projectId || tasks.find(t => t.id === id)?.projectId;
    if (!taskProjectId) return;

    const { data: tasksAfter } = await supabase
      .from('dev_sprint_tasks')
      .select('column_id, points')
      .eq('project', taskProjectId)
      .eq('tenant_id', activeTenantId);

    if (!tasksAfter) return;

    const backlogPoints = tasksAfter
      .filter((t: any) => t.column_id === 'backlog')
      .reduce((s: number, t: any) => s + (t.points || 0), 0);

    const donePoints = tasksAfter
      .filter((t: any) => t.column_id === 'done')
      .reduce((s: number, t: any) => s + (t.points || 0), 0);

    const nextProgress = backlogPoints > 0 ? Math.round((donePoints / backlogPoints) * 100) : 0;

    const { error: progressError } = await supabase
      .from('dev_projects')
      .update({ progress: nextProgress })
      .eq('id', taskProjectId)
      .eq('tenant_id', activeTenantId);

    if (progressError) {
      console.error('[Supabase] update dev_projects progress error:', progressError.message);
    }
  }


  /** Edita os campos do card (inclusive descrição, erro, passos e anexos). A etapa muda por moveTask. */
  async function updateTask(id: string | number, patch: PatchTarefa): Promise<boolean> {
    const antes = tasks.find(t => t.id === id);
    if (!antes) return false;
    if (patch.title !== undefined && !patch.title.trim()) { toast.error('O título não pode ficar vazio.'); return false; }
    const limpo = {
      ...patch,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.points !== undefined ? { points: Math.max(0, Math.min(100, Math.round(Number(patch.points) || 0))) } : {}),
      ...(patch.tags !== undefined ? { tags: Array.from(new Set(patch.tags.map(t => t.trim().replace(/^#/, '')).filter(Boolean))).slice(0, 12) } : {}),
    };
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...limpo } : t)));
    if (!supabase) return true;
    const { errorDetail, ...resto } = limpo;
    const colunas = { ...resto, ...(errorDetail !== undefined ? { error_detail: errorDetail } : {}) };
    const { error } = await supabase.from('dev_sprint_tasks').update(colunas).eq('id', id).eq('tenant_id', activeTenantId);
    if (error) {
      setTasks(prev => prev.map(t => (t.id === id ? antes : t)));
      toast.error(`Não foi possível salvar: ${friendlyError(error)}`);
      return false;
    }
    return true;
  }

  /** Envia arquivos e acrescenta aos anexos da tarefa. */
  async function addAttachments(id: string | number, files: File[]) {
    if (!activeTenantId) return;
    const { anexos, falhas } = await enviarAnexos(activeTenantId, id, files);
    if (falhas.length) toast.error(`Não foi possível anexar: ${falhas.join(', ')}`);
    if (!anexos.length) return;
    // Relê do banco antes de gravar, para não apagar anexo incluído por outra pessoa ou pelo agente.
    const { data } = await supabase!.from('dev_sprint_tasks').select('attachments').eq('id', id).eq('tenant_id', activeTenantId).maybeSingle();
    const atuais: Anexo[] = Array.isArray(data?.attachments) ? data!.attachments : [];
    await updateTask(id, { attachments: [...atuais, ...anexos] });
  }

  async function removeAttachment(id: string | number, anexo: Anexo) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    if (await updateTask(id, { attachments: t.attachments.filter(a => a !== anexo) })) await apagarAnexo(anexo);
  }

  return { tasks, loading, addTask, moveTask, updateTask, addAttachments, removeAttachment, detalhesDisponiveis };
}
