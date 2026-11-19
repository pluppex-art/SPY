import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pause, Play, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { confirmDialog } from "../../components/ui/confirm-dialog";

type Api = (path: string, init?: RequestInit) => Promise<Response>;
interface Passo { dias: number; subject: string; body: string }
interface Seq { id: string; name: string; status: string; passos: Passo[]; auto?: { sources: string[]; statuses: string[]; canais: string[] } | null; inscritos: number; ativos: number; concluidos: number; parados: number; enviados: number; falhas: number; abriram: number; clicaram: number }
interface Opt { value: string; count: number }
const json = async (r: Response) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || "Falha na requisição."); return b; };
const campo = "h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";
const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${on ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`;
const novoPasso = (dias: number): Passo => ({ dias, subject: "", body: "" });

/** Sequências de e-mail: vários e-mails em dias seguidos para cada pessoa inscrita. */
export function SequenciasEmail({ open, onClose, api }: { open: boolean; onClose: () => void; api: Api }) {
  const [lista, setLista] = useState<Seq[] | null>(null);
  const [pendente, setPendente] = useState(false);
  const [criando, setCriando] = useState(false);
  const [rodando, setRodando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [passos, setPassos] = useState<Passo[]>([novoPasso(0), novoPasso(3)]);
  const [leads, setLeads] = useState(true); const [clientes, setClientes] = useState(false);
  const [opts, setOpts] = useState<{ sources: Opt[]; statuses: Opt[]; canais?: Opt[] } | null>(null);
  const [sources, setSources] = useState<string[]>([]); const [statuses, setStatuses] = useState<string[]>([]); const [canais, setCanais] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [autoNovos, setAutoNovos] = useState(false);
  const toggle = (l: string[], set: (v: string[]) => void, v: string) => set(l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const audience = { leads, clientes, sources, statuses, canais };

  const carregar = useCallback(async () => {
    try { const r = await api("/api/email-sequences").then(json); setLista(r.sequences || []); setPendente(!!r.pendenteMigracao); } catch (e: any) { toast.error(e.message); setLista([]); }
  }, [api]);
  useEffect(() => { if (open) void carregar(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (criando && !opts) api("/api/email-campaigns/audience-options").then(json).then(setOpts).catch(() => setOpts(null)); }, [criando]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!criando) return; setTotal(null);
    const t = setTimeout(() => { api("/api/email-campaigns/audience-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience }) }).then(json).then((p) => setTotal(p.total)).catch(() => setTotal(null)); }, 350);
    return () => clearTimeout(t);
  }, [criando, leads, clientes, sources, statuses, canais]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPasso = (i: number, p: Partial<Passo>) => setPassos((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const valido = nome.trim() && passos.every((p) => p.subject.trim() && p.body.trim());

  const criar = async () => {
    setSalvando(true);
    try {
      const r = await api("/api/email-sequences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nome, passos, audience, autoInscrever: autoNovos && leads }) }).then(json);
      toast.success(`Sequência criada com ${r.entraram} pessoa(s). O 1º e-mail sai na rotina diária, ou clique em "Enviar agora".`);
      setCriando(false); setNome(""); setPassos([novoPasso(0), novoPasso(3)]); setSources([]); setStatuses([]); setCanais([]); setAutoNovos(false);
      await carregar();
    } catch (e: any) { toast.error(e.message); } finally { setSalvando(false); }
  };
  const agora = async (s: Seq) => {
    setRodando(s.id); let enviados = 0;
    try {
      for (let i = 0; i < 15; i++) {
        const r = await api(`/api/email-sequences/${s.id}/processar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(json);
        enviados += r.enviados;
        if (!r.restantes || r.enviados === 0) { if (r.semCota) toast.warning("Limite diário de envios atingido; o resto sai amanhã."); break; }
      }
      toast.success(enviados ? `${enviados} e-mail(s) enviado(s).` : "Nada no prazo para enviar agora."); await carregar();
    } catch (e: any) { toast.error(e.message); } finally { setRodando(null); }
  };
  const alternarAuto = async (s: Seq) => {
    const ligar = !s.auto;
    if (ligar && !(await confirmDialog({ title: "Ligar entrada automática?", description: "A partir de agora, todo lead novo com e-mail válido entra nesta sequência (na rotina diária). Leads que já existem não entram.", confirmLabel: "Ligar" }))) return;
    try { await api(`/api/email-sequences/${s.id}/auto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: ligar, ...(s.auto || {}) }) }).then(json); await carregar(); } catch (e: any) { toast.error(e.message); }
  };
  const pausar = async (s: Seq) => { try { await api(`/api/email-sequences/${s.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s.status === "active" ? "paused" : "active" }) }).then(json); await carregar(); } catch (e: any) { toast.error(e.message); } };
  const excluir = async (s: Seq) => {
    if (!(await confirmDialog({ title: "Excluir sequência?", description: `"${s.name}" e o histórico de envios dela serão apagados. Quem já recebeu os e-mails não é afetado.`, confirmLabel: "Excluir" }))) return;
    try { await api(`/api/email-sequences/${s.id}`, { method: "DELETE" }).then(json); await carregar(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Sequências de e-mail" description="Vários e-mails em dias seguidos para cada pessoa (ex.: boas-vindas, lembrete 3 dias depois, oferta 7 dias depois). Quem se descadastra sai da sequência." maxWidth="max-w-3xl">
      {!criando ? (
        <div className="space-y-3">
          <div className="flex justify-end"><Button onClick={() => setCriando(true)} className="h-9 px-4 text-xs font-bold gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova sequência</Button></div>
          {pendente && <p className="text-xs text-[var(--color-warning,#b45309)]">As sequências ainda não foram liberadas no banco de dados (migração 20261201).</p>}
          {lista === null ? <p className="text-xs text-[var(--color-text-faint)] py-6 text-center">Carregando…</p>
            : lista.length === 0 && !pendente ? <p className="text-xs text-[var(--color-text-muted)] py-6 text-center">Nenhuma sequência ainda. Crie a primeira.</p>
            : lista.map((s) => (
              <div key={s.id} className="rounded-xl border border-[var(--color-border-default)] p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0"><p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{s.name}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{s.passos.length} e-mail(s) · dias: {s.passos.map((p) => p.dias).join(" → ")}</p></div>
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">{s.status === "active" ? "Ativa" : "Pausada"}</span>
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)]">{s.inscritos} inscrito(s): {s.ativos} em andamento · {s.concluidos} concluído(s) · {s.parados} parado(s) · {s.enviados} e-mail(s) enviado(s){s.enviados > 0 && <> · <b className="text-[var(--color-text-primary)]">{Math.round((s.abriram / s.enviados) * 100)}%</b> abriram · <b className="text-[var(--color-text-primary)]">{Math.round((s.clicaram / s.enviados) * 100)}%</b> clicaram</>}{s.falhas > 0 && <span className="text-[var(--color-danger)]"> · {s.falhas} falha(s)</span>}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void agora(s)} disabled={rodando === s.id || s.status !== "active"} className="h-8 px-3 text-xs gap-1.5">{rodando === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar agora (inclui leads novos)</Button>
                  <Button variant="outline" onClick={() => void alternarAuto(s)} className="h-8 px-3 text-xs gap-1.5">Entrada automática: {s.auto ? "ligada" : "desligada"}</Button>
                  <Button variant="outline" onClick={() => void pausar(s)} className="h-8 px-3 text-xs gap-1.5">{s.status === "active" ? <><Pause className="w-3.5 h-3.5" /> Pausar</> : <><Play className="w-3.5 h-3.5" /> Retomar</>}</Button>
                  <Button variant="outline" onClick={() => void excluir(s)} className="h-8 px-3 text-xs gap-1.5 text-[var(--color-danger)]"><Trash2 className="w-3.5 h-3.5" /> Excluir</Button>
                </div>
              </div>))}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Nome (só para você)
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Boas-vindas a novos leads" className={campo} /></label>
          {passos.map((p, i) => (
            <div key={i} className="rounded-xl border border-[var(--color-border-default)] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[var(--color-text-primary)]">E-mail {i + 1}</p>
                <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                  {i === 0 ? "Sai" : "Sai"} <input type="number" min={0} max={60} value={p.dias} onChange={(e) => setPasso(i, { dias: Math.max(0, Math.min(60, Math.floor(Number(e.target.value) || 0))) })} className={`${campo} w-16`} /> dia(s) {i === 0 ? "depois de a pessoa entrar" : "depois do e-mail anterior"}
                  {passos.length > 1 && <button type="button" onClick={() => setPassos((l) => l.filter((_, j) => j !== i))} className="text-[var(--color-danger)]" aria-label="Remover e-mail"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
              <input value={p.subject} onChange={(e) => setPasso(i, { subject: e.target.value })} maxLength={200} placeholder="Assunto — pode usar {{primeiro_nome}}" className={`${campo} w-full`} />
              <textarea value={p.body} onChange={(e) => setPasso(i, { body: e.target.value })} rows={5} maxLength={20000} placeholder={"Olá {{primeiro_nome}},\n\n..."} className="w-full px-2 py-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] resize-y" />
            </div>))}
          {passos.length < 8 && <Button variant="outline" onClick={() => setPassos((l) => [...l, novoPasso(3)])} className="h-8 px-3 text-xs gap-1.5"><Plus className="w-3.5 h-3.5" /> Adicionar e-mail</Button>}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-[var(--color-text-muted)]">Quem entra na sequência</p>
            <div className="flex flex-wrap gap-x-4 text-xs text-[var(--color-text-primary)]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={leads} onChange={(e) => setLeads(e.target.checked)} /> Leads</label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={clientes} onChange={(e) => setClientes(e.target.checked)} /> Clientes</label>
            </div>
            {leads && opts && (<div className="flex flex-wrap gap-1.5">
              {opts.sources.slice(0, 30).map((o) => <button key={`s${o.value}`} type="button" onClick={() => toggle(sources, setSources, o.value)} className={chip(sources.includes(o.value))}>{o.value || "(sem origem)"} · {o.count}</button>)}
              {opts.statuses.map((o) => <button key={`t${o.value}`} type="button" onClick={() => toggle(statuses, setStatuses, o.value)} className={chip(statuses.includes(o.value))}>Status: {o.value || "—"} · {o.count}</button>)}
              {(opts.canais || []).slice(0, 20).map((o) => <button key={`c${o.value}`} type="button" onClick={() => toggle(canais, setCanais, o.value)} className={chip(canais.includes(o.value))}>Canal: {o.value} · {o.count}</button>)}
            </div>)}
            {leads && <label className="inline-flex items-start gap-1.5 cursor-pointer text-xs text-[var(--color-text-primary)]"><input type="checkbox" className="mt-0.5" checked={autoNovos} onChange={(e) => setAutoNovos(e.target.checked)} /> <span>Também inscrever <b>automaticamente</b> quem virar lead daqui para frente (com esses mesmos filtros de origem, status e canal)</span></label>}
            <p className="text-[11px] text-[var(--color-text-muted)]">{total === null ? "Contando…" : <><b className="text-[var(--color-text-primary)]">{total}</b> pessoa(s) com e-mail válido entram (sem repetidos nem descadastrados).</>}</p>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCriando(false)} className="h-9 px-3 text-xs">Voltar</Button><Button onClick={() => void criar()} disabled={!valido || salvando || !total} className="h-9 px-4 text-xs font-bold">{salvando ? "Criando…" : "Criar sequência"}</Button></div>
        </div>
      )}
    </Modal>
  );
}
