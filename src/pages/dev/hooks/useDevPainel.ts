import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchAllRows } from '../../../lib/pgrst';
import type { TarefaPainel, IssuePainel } from '../lib/painelDev';

export function useDevPainel() {
  const { activeTenantId } = useAuth();
  const [dados, setDados] = useState<{ tarefas: TarefaPainel[]; issues: IssuePainel[] }>({ tarefas: [], issues: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !activeTenantId) { setLoading(false); return; }
    let vivo = true;
    setLoading(true);
    setDados({ tarefas: [], issues: [] });
    const todas = <T,>(tabela: string, colunas: string) => fetchAllRows<T>(() =>
      supabase!.from(tabela).select(colunas).eq('tenant_id', activeTenantId).order('created_at', { ascending: false }).order('id'));
    Promise.all([
      todas<TarefaPainel>('dev_sprint_tasks', 'id,title,type,priority,points,column_id,project,project_id,created_at,updated_at'),
      todas<IssuePainel>('dev_issues', 'id,title,severity,status,created_at,updated_at'),
    ]).then(([tarefas, issues]) => { if (vivo) { setDados({ tarefas, issues }); setLoading(false); } });
    return () => { vivo = false; };
  }, [activeTenantId]);

  return { ...dados, loading };
}
