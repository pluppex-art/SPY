/** Campanhas de e-mail em cartões ou em lista, com busca, filtro por situação, ações e exclusão de várias. */
import { useEffect, useState } from "react";
import { Copy, Download, LayoutGrid, List, Loader2, MoreHorizontal, Pause, Pencil, Play, Search, Send, Trash2, Users, XCircle, FlaskConical } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { ViewToggle } from "../../../components/ui/view-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";

export interface Campanha { id: string; name: string; subject: string; status: string; total: number; sent: number; failed: number; opened?: number; clicked?: number; agendada_para?: string | null; subject_b?: string | null; sender: string | null; created_at: string }
export interface AcoesDaCampanha {
  disparar: (c: Campanha) => void;
  retomar: (c: Campanha) => void;
  pausar: () => void;
  reenviar: (c: Campanha) => void;
  destinatarios: (c: Campanha) => void;
  testar: (c: Campanha) => void;
  editar: (c: Campanha) => void;
  duplicar: (c: Campanha) => void;
  exportar: (c: Campanha) => void;
  cancelar: (c: Campanha) => void;
  excluir: (lista: Campanha[]) => Promise<boolean>;
}

type Visao = "cartoes" | "lista";
const CHAVE_VISAO = "spy_email_campanhas_visao";
const lerVisao = (): Visao => { try { return localStorage.getItem(CHAVE_VISAO) === "lista" ? "lista" : "cartoes"; } catch { return "cartoes"; } };

const SITUACOES = [
  { id: "todas", titulo: "Todas" },
  { id: "ready", titulo: "Prontas" },
  { id: "sending", titulo: "Enviando" },
  { id: "done", titulo: "Enviadas" },
  { id: "cancelled", titulo: "Canceladas" },
] as const;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const pct = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 100) : 0);

function Situacao({ c }: { c: Campanha }) {
  const [texto, cor] = c.status === "ready" && c.agendada_para ? [`Agendada ${dia(c.agendada_para)}`, "bg-amber-500/15 text-amber-700 dark:text-amber-400"]
    : c.status === "ready" ? ["Pronta", "bg-sky-500/15 text-sky-700 dark:text-sky-400"]
      : c.status === "sending" ? ["Enviando", "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]"]
        : c.status === "done" ? ["Enviada", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"]
          : ["Cancelada", "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"];
  return <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black uppercase", cor)}>{texto}</span>;
}

const Barra = ({ c }: { c: Campanha }) => (
  <div className="h-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
    <div className="h-full bg-[var(--color-primary-blue)] transition-all" style={{ width: `${pct(c.sent + c.failed, c.total)}%` }} />
  </div>
);

/** Botão principal conforme a situação, destinatários e o menu com o resto. */
function Acoes({ c, rodando, ocupado, acoes, compacto }: { c: Campanha; rodando: boolean; ocupado: boolean; acoes: AcoesDaCampanha; compacto?: boolean }) {
  const botao = "h-8 px-3 text-[11px] font-bold gap-1.5";
  const principal = rodando ? <Button variant="outline" onClick={acoes.pausar} className={botao}><Pause className="w-3.5 h-3.5" /> Pausar</Button>
    : c.status === "sending" ? <Button onClick={() => acoes.retomar(c)} disabled={ocupado} className={botao}><Play className="w-3.5 h-3.5" /> Retomar</Button>
      : c.status === "ready" ? <Button onClick={() => acoes.disparar(c)} disabled={ocupado} className={botao}><Send className="w-3.5 h-3.5" /> Disparar</Button>
        : <Button onClick={() => acoes.reenviar(c)} disabled={ocupado} className={botao}><Send className="w-3.5 h-3.5" /> Reenviar</Button>;
  return (
    <div className={cn("flex items-center gap-1.5", compacto ? "flex-nowrap" : "flex-wrap")}>
      {principal}
      <Button variant="outline" onClick={() => acoes.destinatarios(c)} title="Quem recebeu" aria-label={`Destinatários de ${c.name}`} className={botao}>
        <Users className="w-3.5 h-3.5" /> {!compacto && "Destinatários"}
      </Button>
      <Button variant="outline" onClick={() => acoes.testar(c)} disabled={rodando} title="Enviar um teste para mim" aria-label={`Enviar teste de ${c.name}`} className={botao}>
        <FlaskConical className="w-3.5 h-3.5" /> {!compacto && "Teste"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label={`Mais ações de ${c.name}`} className="h-8 px-2"><MoreHorizontal className="w-4 h-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs">
          <DropdownMenuItem disabled={rodando || c.status === "sending"} onSelect={() => acoes.editar(c)}><Pencil className="w-3.5 h-3.5" /> Editar</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => acoes.duplicar(c)}><Copy className="w-3.5 h-3.5" /> Duplicar</DropdownMenuItem>
          <DropdownMenuItem disabled={!c.sent} onSelect={() => acoes.exportar(c)}><Download className="w-3.5 h-3.5" /> Exportar planilha</DropdownMenuItem>
          {(c.status === "ready" || c.status === "sending") && <DropdownMenuItem danger onSelect={() => acoes.cancelar(c)}><XCircle className="w-3.5 h-3.5" /> Cancelar envio</DropdownMenuItem>}
          <DropdownMenuItem danger disabled={rodando} onSelect={() => void acoes.excluir([c])}><Trash2 className="w-3.5 h-3.5" /> Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CampanhasEmail({ campanhas, enviando, acoes }: { campanhas: Campanha[]; /** Id da campanha sendo enviada nesta tela. */ enviando: string | null; acoes: AcoesDaCampanha }) {
  const [visao, setVisao] = useState<Visao>(lerVisao);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<string>("todas");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  useEffect(() => { try { localStorage.setItem(CHAVE_VISAO, visao); } catch { /* sem armazenamento: só não lembra */ } }, [visao]);

  const visiveis = campanhas.filter((c) => (situacao === "todas" || c.status === situacao) && (!busca || semAcento(`${c.name} ${c.subject}`).includes(semAcento(busca))));
  // Só o que está à vista é excluído, e a que está sendo enviada nunca.
  const escolhidas = visiveis.filter((c) => marcadas.has(c.id) && c.id !== enviando);
  const todasMarcadas = visiveis.length > 0 && visiveis.every((c) => marcadas.has(c.id));
  const marcar = (ids: string[], sim: boolean) => setMarcadas((antes) => { const n = new Set(antes); for (const id of ids) { if (sim) n.add(id); else n.delete(id); } return n; });
  const caixa = (c: Campanha) => <input type="checkbox" aria-label={`Selecionar ${c.name}`} checked={marcadas.has(c.id)} onChange={(e) => marcar([c.id], e.target.checked)} className="cursor-pointer" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <label className="flex items-center gap-2 h-10 px-3 flex-1 min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]">
          <Search className="w-4 h-4 shrink-0 text-[var(--color-text-faint)]" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar campanha pelo nome ou assunto" aria-label="Buscar campanha" className="w-full bg-transparent border-0 outline-none p-0 text-xs text-[var(--color-text-primary)]" />
        </label>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {SITUACOES.map((s) => {
            const n = s.id === "todas" ? campanhas.length : campanhas.filter((c) => c.status === s.id).length;
            if (s.id !== "todas" && !n && situacao !== s.id) return null;
            const ativa = situacao === s.id;
            return (
              <button key={s.id} type="button" aria-pressed={ativa} onClick={() => setSituacao(s.id)}
                className={cn("shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold cursor-pointer", ativa ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)] !text-white" : "bg-transparent border-[var(--color-border-default)] text-[var(--color-text-muted)]")}>
                {s.titulo} · {n}
              </button>
            );
          })}
        </div>
        <ViewToggle value={visao} onChange={setVisao} options={[{ id: "cartoes", label: "Cartões", icon: LayoutGrid }, { id: "lista", label: "Lista", icon: List }]} />
      </div>

      {visiveis.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-2 font-bold text-[var(--color-text-muted)] cursor-pointer">
            <input type="checkbox" checked={todasMarcadas} onChange={(e) => marcar(visiveis.map((c) => c.id), e.target.checked)} />
            {escolhidas.length ? `${escolhidas.length} selecionada${escolhidas.length > 1 ? "s" : ""}` : "Selecionar todas"}
          </label>
          {escolhidas.length > 0 && (
            <Button variant="danger" onClick={() => void acoes.excluir(escolhidas).then((ok) => { if (ok) setMarcadas(new Set()); })} className="h-8 px-3 text-[11px] gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Excluir selecionadas ({escolhidas.length})</Button>
          )}
        </div>
      )}

      {visiveis.length === 0 ? (
        <Card className="p-8 text-center text-xs text-[var(--color-text-muted)]">Nenhuma campanha com esse filtro.</Card>
      ) : visao === "cartoes" ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visiveis.map((c) => (
            <Card key={c.id} className={cn("p-4 flex flex-col gap-3 min-w-0", marcadas.has(c.id) && "ring-2 ring-[var(--color-primary-blue)]")}>
              <div className="flex items-start gap-2.5">
                <span className="pt-0.5">{caixa(c)}</span>
                <div className="flex-1 min-w-0">
                  <h4 title={c.name} className="text-sm font-bold text-[var(--color-text-primary)] truncate">{c.name}</h4>
                  <p title={c.subject} className="text-xs text-[var(--color-text-muted)] truncate">{c.subject}</p>
                  <p className="text-[11px] text-[var(--color-text-faint)]">Criada em {dia(c.created_at)}</p>
                </div>
                <Situacao c={c} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {([["Enviados", `${c.sent}/${c.total}`], ["Abriram", c.sent ? `${pct(c.opened || 0, c.sent)}%` : "—"], ["Clicaram", c.sent ? `${pct(c.clicked || 0, c.sent)}%` : "—"]] as const).map(([r, v]) => (
                  <div key={r} className="rounded-lg bg-[var(--color-surface-sunken)] py-2">
                    <p className="text-sm font-black tabular-nums text-[var(--color-text-primary)]">{v}</p>
                    <p className="text-[10px] font-bold uppercase text-[var(--color-text-muted)]">{r}</p>
                  </div>
                ))}
              </div>
              <Barra c={c} />
              {c.failed > 0 && <button type="button" onClick={() => acoes.destinatarios(c)} className="self-start bg-transparent border-0 p-0 text-[11px] font-bold text-[var(--color-danger)] cursor-pointer hover:underline">{c.failed} falha(s): ver motivo</button>}
              {enviando === c.id && <p className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-primary-blue)]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando… mantenha a página aberta.</p>}
              <div className="mt-auto"><Acoes c={c} rodando={enviando === c.id} ocupado={!!enviando && enviando !== c.id} acoes={acoes} /></div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden lg:grid grid-cols-[24px_minmax(0,1fr)_130px_110px_80px_80px_auto] items-center gap-3 px-3 py-2 bg-[var(--color-surface-sunken)] text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
            <span /><span>Campanha</span><span>Situação</span><span className="text-right">Enviados</span><span className="text-right">Abriram</span><span className="text-right">Clicaram</span><span className="w-[240px] text-right">Ações</span>
          </div>
          <ul className="m-0 p-0 list-none divide-y divide-[var(--color-border-subtle)]">
            {visiveis.map((c) => (
              <li key={c.id} className={cn("grid grid-cols-[24px_minmax(0,1fr)_auto] lg:grid-cols-[24px_minmax(0,1fr)_130px_110px_80px_80px_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 text-xs", marcadas.has(c.id) && "bg-[var(--color-primary-blue)]/10")}>
                {caixa(c)}
                <div className="min-w-0">
                  <p title={c.name} className="font-bold text-[var(--color-text-primary)] truncate">{c.name}</p>
                  <p title={c.subject} className="text-[11px] text-[var(--color-text-muted)] truncate">{dia(c.created_at)} · {c.subject}</p>
                </div>
                <div><Situacao c={c} /></div>
                <p className="col-start-2 col-span-2 lg:col-span-1 lg:col-start-auto lg:text-right tabular-nums text-[var(--color-text-primary)]">
                  <span className="lg:hidden text-[var(--color-text-muted)]">Enviados </span>{c.sent}/{c.total}{c.failed > 0 && <span className="text-[var(--color-danger)]"> · {c.failed} ✕</span>}
                  <span className="lg:hidden text-[var(--color-text-muted)]"> · abriram {c.sent ? `${pct(c.opened || 0, c.sent)}%` : "—"} · clicaram {c.sent ? `${pct(c.clicked || 0, c.sent)}%` : "—"}</span>
                </p>
                <p className="hidden lg:block text-right tabular-nums text-[var(--color-text-primary)]">{c.sent ? `${pct(c.opened || 0, c.sent)}%` : "—"}</p>
                <p className="hidden lg:block text-right tabular-nums text-[var(--color-text-primary)]">{c.sent ? `${pct(c.clicked || 0, c.sent)}%` : "—"}</p>
                <div className="col-start-2 col-span-2 lg:col-span-1 lg:col-start-auto lg:w-[240px] flex lg:justify-end"><Acoes compacto c={c} rodando={enviando === c.id} ocupado={!!enviando && enviando !== c.id} acoes={acoes} /></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
