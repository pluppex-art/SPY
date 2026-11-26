import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'sonner';
import { buscarRepositorios, type Linguagem, type RepoGitHub } from '../lib/github';
import type { NovoRepositorioPayload } from '../modals/NovoRepositorioDevModal';

export interface DevRepo {
  id: string | number;
  name: string;
  description: string;
  language: string;
  languages: Linguagem[];
  visibility: 'public' | 'private';
  status: 'ativo' | 'arquivado' | 'em desenvolvimento';
  branches: number;
  stars: number;
  forks: number;
  lastCommit: string;
  lastCommitInfo?: string;
  openPRs: number;
  openIssues: number;
  contributors: string[];
  size: string;
  owner?: string;
  isFork?: boolean;
  githubUrl?: string;
  fromGitHub?: boolean;
}

export interface GitHubConnection {
  username: string;
  avatar: string;
  connected_at: string;
}

function rowToRepo(row: any): DevRepo {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    language: row.language || 'TypeScript',
    languages: [],
    visibility: row.visibility as DevRepo['visibility'],
    status: row.status as DevRepo['status'],
    branches: row.branches || 1,
    stars: row.stars || 0,
    forks: row.forks || 0,
    lastCommit: row.last_commit || '',
    openPRs: row.open_prs || 0,
    openIssues: 0,
    contributors: row.contributors || [],
    size: row.size || '0 MB',
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 60) return `${m}m atrás`;
  if (h < 24) return `${h}h atrás`;
  if (d < 30) return `${d} dias atrás`;
  return `${Math.floor(d / 30)} meses atrás`;
}

function ghRepoToDevRepo(gh: RepoGitHub): DevRepo {
  const c = gh.ultimoCommit;
  return {
    id: `gh-${gh.id}`,
    name: gh.nome,
    description: gh.descricao,
    language: gh.linguagem,
    languages: gh.linguagens,
    visibility: gh.privado ? 'private' : 'public',
    status: gh.arquivado ? 'arquivado' : 'ativo',
    branches: gh.branches,
    stars: gh.estrelas,
    forks: gh.forks,
    lastCommit: gh.atualizadoEm ? timeAgo(gh.atualizadoEm) : '—',
    lastCommitInfo: c ? `${c.mensagem}${c.autor ? ` · ${c.autor}` : ''} · ${timeAgo(c.em)}` : undefined,
    openPRs: gh.prsAbertos,
    openIssues: gh.issuesAbertas,
    contributors: gh.autoresRecentes,
    size: formatBytes(gh.tamanhoKb * 1024),
    owner: gh.dono,
    isFork: gh.fork,
    githubUrl: gh.url,
    fromGitHub: true,
  };
}

export function useDevRepositorios() {
  const { activeTenantId } = useAuth();
  const [repos, setRepos] = useState<DevRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [githubConn, setGithubConn] = useState<GitHubConnection | null>(null);
  const [githubErro, setGithubErro] = useState<string | null>(null);
  const [githubAvisos, setGithubAvisos] = useState<string[]>([]);
  const pedido = useRef(0); // resposta de um pedido antigo (outra empresa, ou já desconectado) é descartada

  const recarregar = useCallback(async () => {
    if (!supabase || !activeTenantId) return;
    const este = ++pedido.current;
    const atual = () => pedido.current === este;
    setLoading(true);
    setGithubErro(null);
    setGithubAvisos([]);

    try {
      const [{ data: repoData }, { data: ghData, error: ghError }] = await Promise.all([
        supabase.from('dev_repositories').select('*').eq('tenant_id', activeTenantId).order('created_at', { ascending: false }),
        supabase.from('app_settings').select('value').eq('tenant_id', activeTenantId).eq('key', 'github_config').maybeSingle(),
      ]);
      if (!atual()) return;

      const manuais = (repoData ?? []).map(rowToRepo);
      const cfg: any = typeof ghData?.value === 'string' ? JSON.parse(ghData.value) : ghData?.value;
      if (ghError) setGithubErro('Não foi possível ler a conexão do GitHub.');
      if (!cfg?.pat || !cfg?.username) {
        setGithubConn(null);
        setRepos(manuais);
        return;
      }
      setGithubConn({ username: cfg.username, avatar: cfg.avatar, connected_at: cfg.connected_at });
      setRepos(prev => [...prev.filter(r => r.fromGitHub), ...manuais]);

      const { repos: doGitHub, avisos } = await buscarRepositorios(cfg.pat);
      if (!atual()) return;
      setRepos([...doGitHub.map(ghRepoToDevRepo), ...manuais]);
      setGithubAvisos(doGitHub.length ? avisos : [...avisos, 'O token não enxerga nenhum repositório. Confira se foi criado na conta certa.']);
    } catch (e: any) {
      if (!atual()) return;
      setRepos(prev => prev.filter(r => !r.fromGitHub));
      setGithubErro(e instanceof TypeError ? 'Sem resposta do GitHub. Verifique a conexão e tente de novo.' : e?.message || 'Não foi possível carregar os repositórios.');
    } finally {
      if (atual()) setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    setRepos([]);
    setGithubConn(null);
    void recarregar();
  }, [recarregar]);

  async function addRepo(payload: NovoRepositorioPayload) {
    const visibility = payload.visibility === 'Público' ? 'public' : 'private';
    if (!supabase) {
      setRepos(prev => [{ id: Date.now(), name: payload.name, description: payload.description, language: payload.language, languages: [], visibility, status: 'em desenvolvimento', branches: 1, stars: 0, forks: 0, lastCommit: 'agora', openPRs: 0, openIssues: 0, contributors: [], size: '0 MB' }, ...prev]);
      toast.success('Repositório criado!');
      return;
    }
    if (!activeTenantId) { toast.error('Erro ao criar repositório'); return; }
    const { data, error } = await supabase
      .from('dev_repositories')
      .insert({ name: payload.name, description: payload.description, language: payload.language, visibility, tenant_id: activeTenantId })
      .select()
      .maybeSingle();
    if (error) { toast.error('Erro ao criar repositório'); return; }
    if (data) {
      setRepos(prev => [rowToRepo(data), ...prev]);
      toast.success('Repositório criado!');
    }
  }

  async function disconnectGitHub() {
    if (supabase && activeTenantId) {
      const { error } = await supabase.from('app_settings').delete().eq('tenant_id', activeTenantId).eq('key', 'github_config');
      if (error) { toast.error('Não foi possível desconectar o GitHub.'); return; }
    }
    pedido.current++;
    setLoading(false);
    setGithubConn(null);
    setGithubErro(null);
    setGithubAvisos([]);
    setRepos(prev => prev.filter(r => !r.fromGitHub));
    toast.success('GitHub desconectado.');
  }

  return { repos, loading, addRepo, githubConn, githubErro, githubAvisos, recarregar, disconnectGitHub };
}
