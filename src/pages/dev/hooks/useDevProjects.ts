import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'sonner';
import type { NovoProjetoPayload } from '../modals/NovoProjetoDevModal';
import { generateProjectBacklogAI } from '../lib/generateProjectBacklogAI';

export interface DevProject {
  id: string;

  name: string;
  description: string;
  status: string;
  progress: number;
  stack: string[];
  team: string[];
  lastCommit: string;
  openIssues: number;
  sprints: number;
  stars: number;
}

function rowToProject(row: any): DevProject {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    status: row.status,
    progress: row.progress || 0,
    stack: row.stack || [],
    team: row.team || [],
    lastCommit: row.last_commit || '',
    openIssues: row.open_issues || 0,
    sprints: row.sprints || 0,
    stars: row.stars || 0,
  };
}

export function useDevProjects() {
  const { activeTenantId } = useAuth();
  const [projects, setProjects] = useState<DevProject[]>([]);
  const [loading, setLoading] = useState(false);


  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase!
        .from('dev_projects')
        .select('*')
        .eq('tenant_id', activeTenantId)
        .order('created_at', { ascending: false });
      if (!error && data !== null) {
        setProjects(data.map(rowToProject));
      }
      setLoading(false);
    }
    load();
  }, [activeTenantId]);

  async function addProject(payload: NovoProjetoPayload) {
  if (!supabase) {
    setProjects(prev => [
      {
        ...(payload as any),
        id: String(Date.now()),
        progress: 0,
        team: [],
        lastCommit: 'agora',
        openIssues: 0,
        sprints: 0,
        stars: 0,
      },
      ...prev,
    ]);
    toast.success('Projeto criado!');
    return;
  }


    // 1) cria projeto
    const { data: projectRow, error: projectError } = await supabase
      .from('dev_projects')
      .insert({
        tenant_id: activeTenantId,
        name: payload.name,
        description: payload.description,
        status: payload.status,
        stack: payload.stack,
        team: [],
        progress: 0,
        sprints: 1,
      })
      .select()
      .maybeSingle();

    if (projectError || !projectRow) {
      toast.error('Erro ao criar projeto');
      return;
    }

    const projectId = projectRow.id;

    // 2) cria backlog (tasks) diretamente na sprint
    // Como o schema atual não tem tabela dev_sprints separada,
    // usamos sprint_id = projectId como "chave" de sprint atual.
    const sprintId = projectId;

    const AI_TASKS_FALLBACK = [
      { title: 'Levantamento de requisitos e escopo', type: 'chore' as const, priority: 'alta' as const, points: 3, tags: ['requisitos', 'planejamento'] },
      { title: 'Setup inicial do projeto e padrão de desenvolvimento', type: 'chore' as const, priority: 'média' as const, points: 2, tags: ['setup', 'devops'] },
      { title: 'Implementação do fluxo principal do projeto', type: 'feature' as const, priority: 'alta' as const, points: 5, tags: ['core', 'feature'] },
      { title: 'Testes e validações (unitários/e2e) essenciais', type: 'chore' as const, priority: 'média' as const, points: 4, tags: ['testes', 'qualidade'] },
      { title: 'Documentação e handoff final', type: 'chore' as const, priority: 'baixa' as const, points: 2, tags: ['docs'] },
    ];

    const backlogAIInput = {
      productName: payload.name,
      description: payload.description,
    };

    let backlogTasks: Array<{
      title: string;
      type: 'feature' | 'bug' | 'chore' | 'refactor';
      priority: 'crítica' | 'alta' | 'média' | 'baixa';
      points: number;
      tags: string[];
    }> = AI_TASKS_FALLBACK;

    try {
      // Escolhe provider com base nas chaves configuradas no runtime
      const generated = await generateProjectBacklogAI(backlogAIInput);


      backlogTasks = (generated.tasks || []).slice(0, 10).map(t => ({


        title: t.title,
        type: t.type,
        priority: t.priority,
        points: Math.max(1, Math.min(13, Math.round(t.points || 1))),
        tags: Array.isArray(t.tags) ? t.tags.slice(0, 5) : [],
      }));

      if (backlogTasks.length === 0) backlogTasks = AI_TASKS_FALLBACK;
    } catch (e: any) {
      // Se a IA falhar por chave inválida, cria backlog mínimo mas não deve “quebrar” a criação.
      const msg = String(e?.message || e);
      console.error('Falha ao gerar backlog por IA:', e);

      if (msg.includes('GEMINI_API_KEY_INVALID')) {
        toast.error('Chave Gemini inválida. Criando backlog mínimo.');
        backlogTasks = AI_TASKS_FALLBACK;
      } else {
        toast.error('Falha ao gerar backlog por IA. Criando backlog mínimo.');
        backlogTasks = AI_TASKS_FALLBACK;
      }
    }





    const { error: tasksError } = await supabase
      .from('dev_sprint_tasks')
      .insert(
        backlogTasks.map(t => ({
          title: t.title,
          type: t.type,
          priority: t.priority,
          points: t.points,
          assignee: '—',
          tags: t.tags,
          column_id: 'backlog',
          project: projectId,
          sprint_id: sprintId,
          tenant_id: activeTenantId,
        }))
      );

    if (tasksError) {
      toast.error('Erro ao gerar backlog');
      return;
    }

    // 3) persiste projeto e recomputa progress (0 pois tudo começa em backlog)
    const { error: updError } = await supabase
      .from('dev_projects')
      .update({ progress: 0, sprints: 1 })
      .eq('id', String(projectId))
      .eq('tenant_id', activeTenantId);


    if (updError) {
      toast.error('Erro ao atualizar progresso do projeto');
      return;
    }

    setProjects(prev => [rowToProject(projectRow), ...prev]);
    toast.success('Projeto criado e backlog gerado!');
  }


  async function updateProject(payload: {
    id: string;

    name: string;
    description: string;
    status: string;
    stack: string[];
  }) {
    if (!supabase) {
      setProjects((prev) =>
        prev.map((p) =>
          String(p.id) === String(payload.id)
            ? {
                ...p,
                name: payload.name,
                description: payload.description,
                status: payload.status,
                stack: payload.stack,
              }
            : p
        )
      );
      toast.success('Projeto atualizado!');
      return;
    }

    const { error } = await supabase
      .from('dev_projects')
      .update({
        name: payload.name,
        description: payload.description,
        status: payload.status,
        stack: payload.stack,
        updated_at: new Date().toISOString(),
      })
      .eq('id', String(payload.id))
      .eq('tenant_id', activeTenantId);


    if (error) {
      toast.error('Erro ao atualizar projeto');
      return;
    }

    setProjects((prev) =>
      prev.map((p) =>
        String(p.id) === String(payload.id)
          ? { ...p, name: payload.name, description: payload.description, status: payload.status, stack: payload.stack }
          : p
      )
    );

    toast.success('Projeto atualizado!');
  }

  async function deleteProject(projectId: string) {

    if (!supabase) {
      setProjects((prev) => prev.filter((p) => String(p.id) !== String(projectId)));
      toast.success('Projeto apagado!');
      return;
    }

    // As tasks devem ser removidas em cascata (ON DELETE CASCADE).
    // Se por algum motivo não estiver ativo, remover manualmente dev_sprint_tasks antes.
    const { error } = await supabase.from('dev_projects').delete().eq('id', String(projectId)).eq('tenant_id', activeTenantId);


    if (error) {
      toast.error('Erro ao apagar projeto');
      return;
    }

    setProjects((prev) => prev.filter((p) => String(p.id) !== String(projectId)));
    toast.success('Projeto apagado!');
  }

  return { projects, loading, addProject, updateProject, deleteProject };
}
