import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState } from 'react';
import { GitBranch, GitFork, GitPullRequest, CircleDot, Star, Lock, Globe, Plus, Clock, Code2, Archive, CheckCircle2, ExternalLink, Unlink, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { NovoRepositorioDevModal, type NovoRepositorioPayload } from "./modals/NovoRepositorioDevModal";
import { ConectarGitHubModal } from "./modals/ConectarGitHubModal";
import { useDevRepositorios } from "./hooks/useDevRepositorios";
import { useAuth } from "../../contexts/AuthContext";
import { somarLinguagens } from "./lib/github";

// Cores usadas só nos repositórios cadastrados à mão (os do GitHub já vêm com a cor da linguagem).
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3B82F6',
  JavaScript: '#F59E0B',
  Python: '#10B981',
  Go: '#06B6D4',
  Rust: '#F97316',
  'C#': '#8B5CF6',
  Dart: '#22D3EE',
};

const STATUS_STYLE: Record<string, string> = {
  ativo: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'em desenvolvimento': 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  arquivado: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

export default function Repositorios() {
  const { user, activeTenantId } = useAuth();
  const { repos, loading, addRepo, githubConn, githubErro, githubAvisos, recarregar, disconnectGitHub } = useDevRepositorios();
  const [search, setSearch] = useState('');
  const [filterVisibility, setFilterVisibility] = useState<'todos' | 'public' | 'private'>('todos');
  const [filterLang, setFilterLang] = useState('');
  const [filterRepoStatus, setFilterRepoStatus] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);

  const handleSaveRepo = async (data: NovoRepositorioPayload) => {
    await addRepo(data);
  };

  // Linguagens de um repositório: todas as que o GitHub detectou, ou a informada no cadastro manual.
  const linguagensDe = (r: (typeof repos)[number]) => r.languages.length ? r.languages.map(l => l.nome) : [r.language].filter(Boolean);
  const langOpcoes = Array.from(new Set(repos.flatMap(linguagensDe))).sort();
  const filtered = repos.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase());
    const matchVis = filterVisibility === 'todos' || r.visibility === filterVisibility;
    const matchLang = !filterLang || linguagensDe(r).includes(filterLang);
    const matchStatus = !filterRepoStatus || r.status === filterRepoStatus;
    return matchSearch && matchVis && matchLang && matchStatus;
  });

  const totalStars = filtered.reduce((s, r) => s + r.stars, 0);
  const totalPRs = filtered.reduce((s, r) => s + r.openPRs, 0);
  const activeRepos = filtered.filter(r => r.status !== 'arquivado').length;
  const ghRepos = repos.filter(r => r.fromGitHub).length;
  const linguagens = somarLinguagens(filtered.map(r => r.languages));

  return (
    <PageContainer
      title="Repositórios"
      description="Gerencie todos os repositórios de código da organização."
      breadcrumb={[{ label: "Dev & Tecnologia", path: "/app/dev/painel" }, { label: "Repositórios" }]}
      actions={
        <div className="flex items-center gap-3">
          {githubConn ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl h-10 px-4">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  @{githubConn.username}
                </span>
                {ghRepos > 0 && (
                  <span className="text-[9px] text-emerald-500/70 font-bold">· {ghRepos} repos</span>
                )}
              </div>
              <button
                onClick={() => void recarregar()}
                disabled={loading}
                title="Atualizar repositórios"
                className="h-10 w-10 flex items-center justify-center rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={disconnectGitHub}
                title="Desconectar GitHub"
                className="h-10 w-10 flex items-center justify-center rounded-xl border border-white/5 hover:bg-white/5 text-slate-500 hover:text-red-400 transition-colors"
              >
                <Unlink className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setIsGitHubModalOpen(true)}
              className="h-10 rounded-xl border-white/5 text-[10px] font-black uppercase tracking-widest gap-2"
            >
              <GitFork className="w-4 h-4" /> Conectar GitHub
            </Button>
          )}
          <Button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-5 text-[10px] font-black uppercase tracking-widest gap-2">
            <Plus className="w-4 h-4" /> Novo Repo
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-10">

        <KpiFilterCard
          id="devRepositorios"
          kpis={[
            { label: "Repositórios", value: filtered.length, icon: Code2, tone: "primary" },
            { label: "Ativos", value: activeRepos, icon: CheckCircle2, tone: "success" },
            { label: "Stars Total", value: totalStars, icon: Star, tone: "warning" },
            { label: "PRs em Aberto", value: totalPRs, icon: GitBranch, tone: "info" },
          ]}
          activeCount={(search ? 1 : 0) + (filterVisibility !== 'todos' ? 1 : 0) + (filterLang ? 1 : 0) + (filterRepoStatus ? 1 : 0)}
          onClear={() => { setSearch(''); setFilterVisibility('todos'); setFilterLang(''); setFilterRepoStatus(''); }}
        >
          <FilterBar>
            <FilterSearch value={search} onChange={setSearch} placeholder="Buscar repositório..." />
            <FilterSelect icon={Code2} value={filterLang} onChange={setFilterLang} allLabel="Todas as linguagens" options={langOpcoes} />
            <FilterSelect icon={Archive} value={filterRepoStatus} onChange={setFilterRepoStatus} allLabel="Todos os status" options={[{ value: 'ativo', label: 'Ativo' }, { value: 'em desenvolvimento', label: 'Em desenvolvimento' }, { value: 'arquivado', label: 'Arquivado' }]} />
            <FilterChips value={filterVisibility} onChange={v => setFilterVisibility(v as any)} allValue="todos" options={[{ value: 'private', label: 'Privados' }, { value: 'public', label: 'Públicos' }]} />
          </FilterBar>
        </KpiFilterCard>

        {githubErro && (
          <div className="flex items-center gap-3 flex-wrap rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <p className="text-xs text-rose-600 dark:text-rose-400 flex-1 min-w-0">{githubErro}</p>
            <Button size="sm" variant="outline" disabled={loading} onClick={() => void recarregar()} className="h-8 text-xs">Tentar de novo</Button>
          </div>
        )}
        {githubAvisos.length > 0 && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 space-y-1">
            {githubAvisos.map(a => <p key={a} className="text-xs text-amber-700 dark:text-amber-400 break-words">{a}</p>)}
          </div>
        )}

        {linguagens.length > 0 && (
          <Card className="bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] p-5 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Linguagens · por volume de código</p>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--color-surface-sunken)]">
              {linguagens.map(l => <div key={l.nome} style={{ width: `${l.pct}%`, backgroundColor: l.cor }} title={`${l.nome} ${l.pct.toFixed(1)}%`} />)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {linguagens.map(l => (
                <button key={l.nome} type="button" onClick={() => setFilterLang(filterLang === l.nome ? '' : l.nome)} title="Filtrar por esta linguagem"
                  className={`flex items-center gap-1.5 text-[11px] font-bold cursor-pointer ${filterLang === l.nome ? 'text-[var(--color-primary-blue)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.cor }} />
                  {l.nome} <span className="font-medium opacity-70">{l.pct < 0.1 ? '<0,1' : l.pct.toFixed(1).replace('.', ',')}%</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Lista */}
        <Card className="bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] overflow-hidden">
          <div className="divide-y divide-[var(--color-border-default)]">
            {loading && ghRepos === 0 && githubConn && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs font-bold text-[var(--color-text-muted)]">
                <Loader2 className="w-4 h-4 animate-spin" /> Buscando repositórios no GitHub...
              </div>
            )}
            {filtered.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
                <Code2 className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm font-bold">Nenhum repositório encontrado</p>
              </div>
            )}
            {filtered.map(repo => (
              <div key={String(repo.id)} className="flex items-start gap-4 p-5 hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                <div className="p-2.5 rounded-xl bg-[var(--color-surface-sunken)] shrink-0">
                  {repo.status === 'arquivado'
                    ? <Archive className="w-4 h-4 text-slate-500" />
                    : <Code2 className="w-4 h-4 text-blue-400" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="text-sm font-black text-[var(--color-text-primary)] break-all">
                      {repo.owner && <span className="font-medium text-[var(--color-text-muted)]">{repo.owner}/</span>}{repo.name}
                    </h4>
                    <div className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded border ${repo.visibility === 'private' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                      {repo.visibility === 'private' ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                      {repo.visibility === 'private' ? 'privado' : 'público'}
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${STATUS_STYLE[repo.status] || ''}`}>
                      {repo.status}
                    </span>
                    {repo.fromGitHub && (
                      <span className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded border border-[var(--color-border-default)] text-[var(--color-text-muted)]">
                        <GitFork className="w-2.5 h-2.5" /> {repo.isFork ? 'Fork' : 'GitHub'}
                      </span>
                    )}
                  </div>

                  {repo.description && <p className="text-xs text-[var(--color-text-muted)] mb-2 line-clamp-1">{repo.description}</p>}
                  {repo.lastCommitInfo && <p className="text-[11px] text-[var(--color-text-faint)] mb-2 line-clamp-1">Último commit: {repo.lastCommitInfo}</p>}

                  <div className="flex items-center gap-x-4 gap-y-1.5 text-[10px] text-[var(--color-text-muted)] font-bold flex-wrap">
                    {repo.languages.length > 0 ? repo.languages.slice(0, 4).map(l => (
                      <div key={l.nome} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.cor }} />
                        {l.nome}
                      </div>
                    )) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LANG_COLORS[repo.language] || '#64748B' }} />
                        {repo.language || 'Sem linguagem'}
                      </div>
                    )}
                    {repo.languages.length > 4 && <span title={repo.languages.slice(4).map(l => l.nome).join(', ')}>+{repo.languages.length - 4}</span>}
                    <div className="flex items-center gap-1" title="Estrelas"><Star className="w-3 h-3" /> {repo.stars}</div>
                    <div className="flex items-center gap-1" title="Forks"><GitFork className="w-3 h-3" /> {repo.forks}</div>
                    <div className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> {repo.branches} {repo.branches === 1 ? 'branch' : 'branches'}</div>
                    {repo.openPRs > 0 && (
                      <div className="flex items-center gap-1 text-indigo-500"><GitPullRequest className="w-3 h-3" /> {repo.openPRs} {repo.openPRs === 1 ? 'PR aberto' : 'PRs abertos'}</div>
                    )}
                    {repo.openIssues > 0 && (
                      <div className="flex items-center gap-1 text-amber-500"><CircleDot className="w-3 h-3" /> {repo.openIssues} {repo.openIssues === 1 ? 'issue aberta' : 'issues abertas'}</div>
                    )}
                    {repo.lastCommit && <div className="flex items-center gap-1" title="Última atualização"><Clock className="w-3 h-3" /> {repo.lastCommit}</div>}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {repo.contributors.length > 0 && (
                    <div className="hidden sm:flex -space-x-1.5" title={`Autores recentes: ${repo.contributors.join(', ')}`}>
                      {repo.contributors.slice(0, 3).map(c => (
                        <div key={c} className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-black uppercase text-white border border-white/10">
                          {c.slice(0, 2)}
                        </div>
                      ))}
                    </div>
                  )}
                  <span className="text-[10px] text-[var(--color-text-muted)] hidden md:block">{repo.size}</span>
                  {repo.githubUrl && (
                    <a
                      href={repo.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir no GitHub"
                      className="p-1.5 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/25 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <NovoRepositorioDevModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRepo}
      />

      <ConectarGitHubModal
        isOpen={isGitHubModalOpen}
        onClose={() => setIsGitHubModalOpen(false)}
        onConnected={() => void recarregar()}
        tenantId={activeTenantId || user?.tenantId}
      />
    </PageContainer>
  );
}
