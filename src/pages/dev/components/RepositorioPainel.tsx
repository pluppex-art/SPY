import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, GitBranch, Globe, Loader2, Lock, X } from 'lucide-react';
import { Modal } from '../../../components/ui/modal';
import { cn } from '../../../lib/utils';
import { blocosDoReadme, resumoDoProjeto, type DetalhesRepo, type ItemAberto } from '../lib/github';
import type { DevRepo } from '../hooks/useDevRepositorios';

const LIMITE_README = 20_000;
const rotulo = 'text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]';
const chip = 'text-[10px] font-bold px-2 py-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]';
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section className="space-y-2"><p className={rotulo}>{titulo}</p>{children}</section>;
}

function Abertos({ itens, vazio }: { itens: ItemAberto[]; vazio: string }) {
  if (!itens.length) return <p className="text-xs italic text-[var(--color-text-faint)]">{vazio}</p>;
  return (
    <ul className="space-y-1.5">
      {itens.map((i) => (
        <li key={i.numero}>
          <a href={i.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 py-2 hover:border-[var(--color-primary-blue)]">
            <p className="text-xs font-bold text-[var(--color-text-primary)] break-words">#{i.numero} {i.titulo}</p>
            <p className="text-[10px] text-[var(--color-text-muted)]">{i.autor ? `${i.autor} · ` : ''}atualizado em {data(i.em)}</p>
          </a>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  repo: DevRepo | null;
  onClose: () => void;
  detalhar: (repo: DevRepo) => Promise<DetalhesRepo>;
}

/** Painel lateral do repositório: o que é o projeto (descrição, tecnologias, README) e o que está acontecendo nele. */
export function RepositorioPainel({ repo, onClose, detalhar }: Props) {
  const [aba, setAba] = useState<'sobre' | 'atividade'>('sobre');
  const [detalhes, setDetalhes] = useState<DetalhesRepo | null>(null);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => { setAba('sobre'); }, [repo?.id]);
  useEffect(() => {
    setDetalhes(null);
    setErro('');
    if (!repo?.fromGitHub) return;
    let valeu = true;
    detalhar(repo)
      .then((d) => { if (valeu) setDetalhes(d); })
      .catch((e) => { if (valeu) setErro(e instanceof TypeError ? 'Sem resposta do GitHub. Verifique a conexão.' : e.message); });
    return () => { valeu = false; };
  }, [repo?.id, tentativa]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!repo) return null;
  const carregando = !!repo.fromGitHub && !detalhes && !erro;
  const resumo = resumoDoProjeto(repo.description, detalhes?.readme ?? '');
  const readme = detalhes?.readme ?? '';
  const info: [string, string][] = [
    ['Dono', repo.owner || '—'],
    ['Criado em', data(detalhes?.criadoEm ?? null)],
    ['Última atualização', repo.lastCommit || '—'],
    ['Tamanho', repo.size],
    ['Branches', String(repo.branches)],
    ['Commits', detalhes ? detalhes.totalCommits.toLocaleString('pt-BR') : '—'],
    ['Estrelas / forks', `${repo.stars} / ${repo.forks}`],
    ['Licença', detalhes?.licenca || '—'],
  ];

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-[546px]" position="right" overlay="light" noPadding
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-[var(--radius-control)] text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer bg-transparent border-none">Fechar</button>
          {repo.githubUrl && (
            <a href={repo.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-control)] bg-[var(--color-primary-blue)] !text-white text-xs font-bold">
              <ExternalLink className="w-3.5 h-3.5" /> Abrir no GitHub
            </a>
          )}
        </div>
      }
    >
      <div className="flex flex-col h-full overflow-hidden bg-[var(--color-surface)] animate-in fade-in duration-150">
        <div className="shrink-0 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border-default)] px-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-black text-[var(--color-text-primary)] break-all">{repo.name}</h2>
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-muted)] mt-0.5">
                {repo.visibility === 'private' ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                {repo.visibility === 'private' ? 'Privado' : 'Público'} · {repo.status}{repo.isFork ? ' · fork' : ''}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer bg-transparent border-none"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-4 mt-3">
            {([['sobre', 'Sobre o projeto'], ['atividade', 'Atividade']] as const).map(([id, nome]) => (
              <button key={id} type="button" onClick={() => setAba(id)} className={cn('pb-2.5 text-xs font-bold cursor-pointer bg-transparent border-0 border-b-2', aba === id ? 'border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]' : 'border-transparent text-[var(--color-text-muted)]')}>{nome}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {erro && (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-600 dark:text-rose-400 space-y-1.5">
              <p className="break-words">{erro}</p>
              <button type="button" onClick={() => setTentativa((n) => n + 1)} className="font-bold underline cursor-pointer bg-transparent border-none p-0 text-inherit">Tentar de novo</button>
            </div>
          )}
          {carregando && <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]"><Loader2 className="w-4 h-4 animate-spin" /> Buscando detalhes no GitHub...</div>}

          {aba === 'sobre' ? (
            <>
              <Secao titulo="O que é o projeto">
                <p className={cn('text-sm leading-relaxed break-words whitespace-pre-line', resumo ? 'text-[var(--color-text-primary)]' : 'italic text-[var(--color-text-faint)]')}>
                  {resumo || (carregando ? '…' : 'Este repositório não tem descrição nem texto no README. Preencha a descrição no GitHub para aparecer aqui.')}
                </p>
                {detalhes?.site && <a href={detalhes.site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-primary-blue)] hover:underline break-all"><Globe className="w-3.5 h-3.5 shrink-0" />{detalhes.site}</a>}
              </Secao>

              {!!(detalhes?.tecnologias.length || detalhes?.topicos.length) && (
                <Secao titulo="Tecnologias e temas">
                  <div className="flex flex-wrap gap-1.5">{Array.from(new Set([...detalhes!.tecnologias, ...detalhes!.topicos])).map((t) => <span key={t} className={chip}>{t}</span>)}</div>
                </Secao>
              )}

              {(repo.languages.length > 0 || repo.language) && (
                <Secao titulo="Linguagens">
                  <div className="flex flex-wrap gap-1.5">
                    {repo.languages.length
                      ? repo.languages.map((l) => {
                          const total = repo.languages.reduce((s, x) => s + x.bytes, 0);
                          return <span key={l.nome} className={cn(chip, 'flex items-center gap-1.5')}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.cor }} />{l.nome}{total > 0 && <span className="opacity-60">{Math.round((l.bytes / total) * 100)}%</span>}</span>;
                        })
                      : <span className={chip}>{repo.language}</span>}
                  </div>
                </Secao>
              )}

              <div className="grid grid-cols-2 gap-2">
                {info.map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 py-2">
                    <p className={rotulo}>{k}</p>
                    <p className="text-xs font-bold text-[var(--color-text-primary)] break-words">{v}</p>
                  </div>
                ))}
              </div>

              {readme && (
                <Secao titulo="README">
                  <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3.5 space-y-2 text-xs leading-relaxed text-[var(--color-text-primary)] break-words">
                    {blocosDoReadme(readme.slice(0, LIMITE_README)).map((b, i) =>
                      b.tipo === 'titulo' ? <h3 key={i} className="text-[13px] font-black pt-1.5">{b.texto}</h3>
                      : b.tipo === 'item' ? <p key={i} className="pl-4 -indent-3">• {b.texto}</p>
                      : b.tipo === 'codigo' ? <pre key={i} className="overflow-x-auto rounded-lg bg-[var(--color-surface-sunken)] p-2.5 text-[11px] font-mono">{b.texto}</pre>
                      : <p key={i}>{b.texto}</p>)}
                    {readme.length > LIMITE_README && <p className="italic text-[var(--color-text-muted)]">README cortado aqui. O texto completo está no GitHub.</p>}
                  </div>
                </Secao>
              )}
            </>
          ) : !repo.fromGitHub ? (
            <p className="text-xs italic text-[var(--color-text-faint)]">Repositório cadastrado à mão: não há atividade do GitHub.</p>
          ) : detalhes && (
            <>
              <Secao titulo="Últimos commits">
                {detalhes.commits.length === 0 ? <p className="text-xs italic text-[var(--color-text-faint)]">Nenhum commit.</p> : (
                  <ol className="space-y-2 border-l border-[var(--color-border-default)] pl-3">
                    {detalhes.commits.map((c) => (
                      <li key={c.url}>
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="block hover:text-[var(--color-primary-blue)] text-[var(--color-text-primary)]"><p className="text-xs font-bold break-words">{c.mensagem}</p></a>
                        <p className="text-[10px] text-[var(--color-text-muted)]">{c.autor ? `${c.autor} · ` : ''}{data(c.em)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Secao>
              <Secao titulo={`Pull requests abertos (${repo.openPRs})`}><Abertos itens={detalhes.prs} vazio="Nenhum PR aberto." /></Secao>
              <Secao titulo={`Issues abertas (${repo.openIssues})`}><Abertos itens={detalhes.issues} vazio="Nenhuma issue aberta." /></Secao>
              <Secao titulo={`Branches (${repo.branches})`}>
                <div className="flex flex-wrap gap-1.5">
                  {detalhes.branches.map((b) => <span key={b} className={cn(chip, 'flex items-center gap-1 break-all')}><GitBranch className="w-3 h-3 shrink-0" />{b}</span>)}
                  {repo.branches > detalhes.branches.length && <span className={chip}>+{repo.branches - detalhes.branches.length}</span>}
                </div>
              </Secao>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
