import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'sonner';
import type { NovaIssuePayload } from '../modals/NovaIssueDevModal';

export type Severity = 'crítico' | 'alto' | 'médio' | 'baixo';
export type IssueStatus = 'aberto' | 'em andamento' | 'em review' | 'fechado';

export interface DevIssue {
  id: string | number;
  issueNumber: number;
  title: string;
  description: string;
  severity: Severity;
  status: IssueStatus;
  project: string;
  assignee: string;
  reporter: string;
  createdAt: string;
  /** `created_at` do banco, sem formatação (`createdAt` é o texto exibido). */
  createdAtIso?: string;
  comments: number;
  labels: string[];
}

function rowToIssue(row: any): DevIssue {
  return {
    id: row.id,
    issueNumber: row.issue_number || 0,
    title: row.title,
    description: row.description || '',
    severity: row.severity as Severity,
    status: row.status as IssueStatus,
    project: row.project || '',
    assignee: row.assignee || '-',
    reporter: row.reporter || '',
    createdAt: new Date(row.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    createdAtIso: row.created_at,
    comments: row.comments || 0,
    labels: row.labels || [],
  };
}

export function useDevIssues() {
  const { activeTenantId } = useAuth();
  const [issues, setIssues] = useState<DevIssue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase!
        .from('dev_issues')
        .select('*')
        .eq('tenant_id', activeTenantId)
        .order('created_at', { ascending: false });
      if (!error && data !== null) {
        setIssues(data.map(rowToIssue));
      }
      setLoading(false);
    }
    load();
  }, [activeTenantId]);

  async function addIssue(payload: NovaIssuePayload) {
    if (!supabase) {
      const next = Math.max(...issues.map(i => i.issueNumber)) + 1;
      setIssues(prev => [{
        id: Date.now(), issueNumber: next,
        title: payload.title, description: payload.description,
        severity: payload.severity, status: 'aberto',
        project: payload.project, assignee: payload.assignee || '-',
        reporter: '', createdAt: 'agora', createdAtIso: new Date().toISOString(), comments: 0, labels: payload.labels,
      }, ...prev]);
      toast.success('Issue registrado!');
      return;
    }
    const { data, error } = await supabase
      .from('dev_issues')
      .insert({
        tenant_id: activeTenantId,
        title: payload.title, description: payload.description,
        severity: payload.severity, project: payload.project,
        assignee: payload.assignee || '-', labels: payload.labels,
      })
      .select()
      .maybeSingle();
    if (error) { toast.error('Erro ao registrar issue'); return; }
    if (data) {
      setIssues(prev => [rowToIssue(data), ...prev]);
      toast.success('Issue registrado!');
    }
  }

  return { issues, loading, addIssue };
}
