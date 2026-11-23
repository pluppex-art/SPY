import { useEffect, useState } from 'react';
import { Check, ChevronRight, Clock, FolderCode, Hash, Pencil, User as UserIcon, X, Zap, Info } from 'lucide-react';
import { Modal } from '../../../components/ui/modal';
import { useData } from '../../../contexts/DataContext';
import { cn } from '../../../lib/utils';
import type { SprintTask, Column, Priority } from '../hooks/useDevSprints';

export interface ColunaSprint { id: Column; label: string; hex: string }

export const TIPOS_SPRINT: { id: SprintTask['type']; label: string; icon: string }[] = [
  { id: 'feature', label: 'Funcionalidade', icon: '✦' },
  { id: 'bug', label: 'Bug', icon: '🐛' },
  { id: 'chore', label: 'Tarefa técnica', icon: '⚙' },
  { id: 'refactor', label: 'Refatoração', icon: '♻' },
];
export const PRIORIDADES_SPRINT: Priority[] = ['crítica', 'alta', 'média', 'baixa'];
export const COR_PRIORIDADE_SPRINT: Record<string, string> = {
  crítica: 'bg-rose-500/10 text-rose-600 border-rose-500/25',
  alta: 'bg-orange-500/10 text-orange-600 border-orange-500/25',
  média: 'bg-amber-500/10 text-amber-600 border-amber-500/25',
  baixa: 'bg-slate-500/10 text-slate-500 border-slate-500/25',
};
export const iniciaisSprint = (nome: string) => nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

const campo = 'w-full h-9 px-3 rounded-xl text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)]';
const rotulo = 'text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]';

const diasDesde = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86_400_000)) : null;
};
const dataHora = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
};

interface Props {
  task: SprintTask | null;
  colunas: ColunaSprint[];
  projetos: { id: string | number; name: string }[];
  onClose: () => void;
  onMover: (id: string | number, col: Column) => Promise<void>;
  onSalvar: (id: string | number, patch: Partial<Pick<SprintTask, 'title' | 'type' | 'priority' | 'points' | 'assignee' | 'tags'>>) => Promise<boolean>;
}

/** Detalhes da task do sprint em painel lateral, no mesmo desenho dos detalhes do lead: cabeçalho, etapas clicáveis e edição dos campos. */
export function TarefaSprintPainel({ task, colunas, projetos, onClose, onMover, onSalvar }: Props) {
  const { colaboradores } = useData();
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<SprintTask['type']>('feature');
  const [prioridade, setPrioridade] = useState<Priority>('média');
  const [pontos, setPontos] = useState('1');
  const [responsavel, setResponsavel] = useState('');
  const [tags, setTags] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setEditando(false);
    if (!task) return;
    setTitulo(task.title); setTipo(task.type); setPrioridade(task.priority); setPontos(String(task.points));
    setResponsavel(task.assignee === '?' || task.assignee === '-' ? '' : task.assignee); setTags((task.tags || []).join(', '));
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null;
  const t = task;
  const idx = colunas.findIndex((c) => c.id === t.column);
  const col = colunas[idx];
  const hex = col?.hex ?? '#64748b';
  const tipoInfo = TIPOS_SPRINT.find((x) => x.id === t.type);
  const projeto = projetos.find((p) => String(p.id) === String(t.projectId));
  const nomes = Array.from(new Set([...(colaboradores as any[]).map((c) => String(c.nome || '').trim()).filter(Boolean), ...(responsavel ? [responsavel] : [])])).sort();
  const parado = diasDesde(t.updatedAt);

  const salvar = async () => {
    setSalvando(true);
    const ok = await onSalvar(t.id, { title: titulo, type: tipo, priority: prioridade, points: Number(pontos) || 0, assignee: responsavel, tags: tags.split(',') });
    setSalvando(false);
    if (ok) setEditando(false);
  };

  const info: [string, string][] = [
    ['Projeto', projeto?.name ?? '—'],
    ['Tipo', tipoInfo ? `${tipoInfo.icon} ${tipoInfo.label}` : t.type],
    ['Pontos', `${t.points} ${t.points === 1 ? 'ponto' : 'pontos'}`],
    ['Responsável', t.assignee && t.assignee !== '?' ? t.assignee : 'Sem responsável'],
    ['Criada em', dataHora(t.createdAt)],
    ['Última atualização', dataHora(t.updatedAt)],
  ];

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-[546px]" position="right" overlay="light" noPadding
      footer={
        editando ? (
          <div className="flex items-center justify-end w-full gap-2">
            <button type="button" onClick={() => setEditando(false)} className="px-4 py-2 rounded-[var(--radius-control)] text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer bg-transparent border-none">Cancelar</button>
            <button type="button" disabled={salvando || !titulo.trim()} onClick={salvar} className="px-4 py-2 rounded-[var(--radius-control)] bg-[var(--color-primary-blue)] !text-white text-xs font-bold cursor-pointer border-none disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar alterações'}</button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-[var(--radius-control)] text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer bg-transparent border-none">Fechar</button>
            <button type="button" onClick={() => setEditando(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-control)] bg-[var(--color-primary-blue)] !text-white text-xs font-bold cursor-pointer border-none"><Pencil className="w-3.5 h-3.5" /> Editar task</button>
          </div>
        )
      }
    >
      <div className="flex flex-col h-full overflow-hidden bg-[var(--color-surface)] animate-in fade-in duration-150">
        <div className="h-[3px] shrink-0" style={{ backgroundColor: hex }} />
        <div className="shrink-0 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border-default)]">
          <div className="flex items-center justify-between px-5 pt-3.5 pb-2.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border" style={{ color: hex, borderColor: `${hex}55`, backgroundColor: `${hex}14` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: hex }} /> {col?.label ?? t.column}
            </span>
            <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-3.5 px-5 pb-3.5">
            <div className="w-12 h-12 rounded-full grid place-items-center text-sm font-black shrink-0 select-none bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" title={t.assignee || 'Sem responsável'}>{iniciaisSprint(t.assignee === '?' ? '' : t.assignee)}</div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-[var(--color-text-primary)] leading-tight break-words">{t.title}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)]">{tipoInfo ? `${tipoInfo.icon} ${tipoInfo.label}` : t.type}</span>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase', COR_PRIORIDADE_SPRINT[t.priority])}>▲ {t.priority}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-[var(--color-primary-blue)]"><Zap className="w-3 h-3" />{t.points} pts</span>
              </div>
            </div>
          </div>
          <div className="px-5 pb-3.5 overflow-x-auto scrollbar-none border-t border-[var(--color-border-subtle)] pt-2.5">
            <div className="flex items-center min-w-max">
              {colunas.map((c, i) => {
                const ativa = c.id === t.column, passada = idx > i;
                return (
                  <div key={c.id} className="flex items-center">
                    <button type="button" onClick={() => { if (!ativa) void onMover(t.id, c.id); }}
                      className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-control)] text-[10px] font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer border',
                        ativa ? 'bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30 font-black shadow-sm'
                          : passada ? 'text-success border-transparent hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]'
                          : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]')}>
                      {ativa && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-blue)] animate-pulse shrink-0" />}
                      {passada && <span className="w-3.5 h-3.5 rounded-full bg-success/15 grid place-items-center shrink-0"><Check className="w-2 h-2 text-success" /></span>}
                      {c.label}
                    </button>
                    {i < colunas.length - 1 && <ChevronRight className="w-3 h-3 text-[var(--color-text-faint)] shrink-0 mx-0.5" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin px-5 py-4 space-y-4">
          {editando ? (
            <div className="space-y-3">
              <div className="space-y-1.5"><label className={rotulo}>Título</label><textarea rows={3} value={titulo} onChange={(e) => setTitulo(e.target.value)} className={cn(campo, 'h-auto py-2 resize-none')} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className={rotulo}>Tipo</label><select value={tipo} onChange={(e) => setTipo(e.target.value as SprintTask['type'])} className={campo}>{TIPOS_SPRINT.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
                <div className="space-y-1.5"><label className={rotulo}>Prioridade</label><select value={prioridade} onChange={(e) => setPrioridade(e.target.value as Priority)} className={campo}>{PRIORIDADES_SPRINT.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
                <div className="space-y-1.5"><label className={rotulo}>Pontos</label><input type="number" min="0" max="100" value={pontos} onChange={(e) => setPontos(e.target.value)} className={campo} /></div>
                <div className="space-y-1.5"><label className={rotulo}>Responsável</label><select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}><option value="">Sem responsável</option>{nomes.map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
              </div>
              <div className="space-y-1.5"><label className={rotulo}>Tags (separadas por vírgula)</label><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="api, urgente, frontend" className={campo} /></div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Zap, r: 'Pontos', v: String(t.points) },
                  { icon: Clock, r: 'Sem mexer há', v: parado === null ? '—' : parado === 0 ? 'hoje' : `${parado} ${parado === 1 ? 'dia' : 'dias'}` },
                  { icon: FolderCode, r: 'Projeto', v: projeto?.name ?? '—' },
                ].map((k) => (
                  <div key={k.r} className="flex items-center gap-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl px-3 py-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-[var(--color-primary-blue)]/10 grid place-items-center shrink-0"><k.icon className="w-3 h-3 text-[var(--color-primary-blue)]" /></div>
                    <div className="min-w-0"><div className="text-xs font-black text-[var(--color-text-primary)] leading-none truncate">{k.v}</div><div className="text-[8px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider mt-1">{k.r}</div></div>
                  </div>
                ))}
              </div>

              <section className="space-y-1.5">
                <h3 className={rotulo}>Responsável</h3>
                <div className="flex items-center gap-3 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl p-3">
                  <div className="w-9 h-9 rounded-full grid place-items-center text-xs font-black bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)] shrink-0">{iniciaisSprint(t.assignee === '?' ? '' : t.assignee)}</div>
                  <div className="min-w-0"><p className="text-sm font-bold text-[var(--color-text-primary)] truncate flex items-center gap-1.5"><UserIcon className="w-3.5 h-3.5 text-[var(--color-text-faint)]" />{t.assignee && t.assignee !== '?' ? t.assignee : 'Sem responsável'}</p></div>
                </div>
              </section>

              <section className="space-y-1.5">
                <h3 className={rotulo}>Tags</h3>
                {t.tags?.length ? <div className="flex flex-wrap gap-1.5">{t.tags.map((g) => <span key={g} className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] px-2 py-1 rounded-lg"><Hash className="w-2.5 h-2.5" />{g}</span>)}</div> : <p className="text-xs italic text-[var(--color-text-faint)]">Sem tags.</p>}
              </section>

              <section className="space-y-1.5">
                <h3 className={rotulo}>Ficha da task</h3>
                <dl className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden bg-[var(--color-surface-elevated)] text-xs">
                  {info.map(([k, v]) => (<div key={k} className="flex items-center justify-between gap-3 px-3 py-2"><dt className="text-[var(--color-text-faint)] font-semibold">{k}</dt><dd className="font-bold text-[var(--color-text-primary)] text-right truncate">{v}</dd></div>))}
                </dl>
              </section>

              <p className="flex items-start gap-1.5 text-[10px] text-[var(--color-text-faint)]"><Info className="w-3 h-3 shrink-0 mt-0.5" />A data de atualização muda a cada edição ou troca de etapa; use para achar task parada.</p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
