import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Pause, Play, Send, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { FiltrosDoPublico } from "./components/FiltrosDoPublico";
import { EditorConteudoEmail } from "./components/EditorConteudoEmail";
import { PreviaEmail } from "./components/PreviaEmail";
import { abrirConteudo, conteudoVazio, corpoDoConteudo, type ConteudoEmail } from "../../lib/emailHtml";
import { cn } from "../../lib/utils";

type Api = (path: string, init?: RequestInit) => Promise<Response>;
interface Passo { dias: number; subject: string; body: string }
interface Seq { id: string; name: string; status: string; passos: Passo[]; auto?: { sources: string[]; statuses: string[]; canais: string[] } | null; pararAoClicar?: boolean; inscritos: number; ativos: number; concluidos: number; parados: number; enviados: number; falhas: number; abriram: number; clicaram: number }
interface Opt { value: string; count: number }
const json = async (r: Response) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || "Falha na requisição."); return b; };
const campo = "h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";
/** Um e-mail da sequência enquanto está sendo escrito. */
interface PassoEmEdicao { uid: string; dias: number; subject: string; conteudo: ConteudoEmail }
const novoPasso = (dias: number): PassoEmEdicao => ({ uid: crypto.randomUUID(), dias, subject: "", conteudo: conteudoVazio() });
const passosIniciais = () => [novoPasso(0), novoPasso(3)];

/** Sequências de e-mail: vários e-mails em dias seguidos para cada pessoa inscrita. */
export function SequenciasEmail({ open, onClose, api, marca, enviarImagem }: {
  open: boolean; onClose: () => void; api: Api;
  marca: { nome: string; cor?: string | null; logo?: string | null };
  enviarImagem: (arquivo: File) => Promise<string>;
}) {
  const [lista, setLista] = useState<Seq[] | null>(null);
  const [pendente, setPendente] = useState(false);
  const [criando, setCriando] = useState(false);
  const [rodando, setRodando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [passos, setPassos] = useState<PassoEmEdicao[]>(passosIniciais);
  // Um e-mail aberto por vez: é o que aparece na pré-visualização.
  const [abertoUid, setAbertoUid] = useState<string | null>(null);
  const [leads, setLeads] = useState(true); const [clientes, setClientes] = useState(false);
  const [opts, setOpts] = useState<{ sources: Opt[]; statuses: Opt[]; canais?: Opt[] } | null>(null);
  const [sources, setSources] = useState<string[]>([]); const [statuses, setStatuses] = useState<string[]>([]); const [canais, setCanais] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [autoNovos, setAutoNovos] = useState(false);
  const [pararClicar, setPararClicar] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [inscId, setInscId] = useState<{ id: string; nome: string } | null>(null);
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

  const setPasso = (uid: string, p: Partial<PassoEmEdicao>) => setPassos((l) => l.map((x) => (x.uid === uid ? { ...x, ...p } : x)));
  // O editor responde depois de ler arquivos: a mudança vale sobre o estado mais novo, no e-mail certo.
  const mudarConteudo = (uid: string, muda: (c: ConteudoEmail) => Partial<ConteudoEmail>) => setPassos((l) => l.map((x) => (x.uid === uid ? { ...x, conteudo: { ...x.conteudo, ...muda(x.conteudo) } } : x)));
  const aberto = passos.find((p) => p.uid === abertoUid) ?? passos[0];
  const incompleto = passos.findIndex((p) => !p.subject.trim() || !corpoDoConteudo(p.conteudo));
  const valido = !!inscId || !!nome.trim() && incompleto < 0;
  const paraEnviar = (): Passo[] => passos.map((p) => ({ dias: p.dias, subject: p.subject, body: corpoDoConteudo(p.conteudo) }));
  const adicionar = () => { const p = novoPasso(3); setPassos((l) => [...l, p]); setAbertoUid(p.uid); };
  const topo = useRef<HTMLDivElement>(null);

  const editar = (s: Seq) => { setEditId(s.id); setNome(s.name); setPassos(s.passos.map((p) => ({ uid: crypto.randomUUID(), dias: p.dias, subject: p.subject, conteudo: abrirConteudo(p.body) }))); setAbertoUid(null); setCriando(true); };
  const fecharForm = () => { setCriando(false); setEditId(null); setInscId(null); setNome(""); setPassos(passosIniciais()); setAbertoUid(null); };
  const criar = async () => {
    setSalvando(true);
    try {
      if (inscId) {
        const r = await api(`/api/email-sequences/${inscId.id}/inscrever`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience }) }).then(json);
        toast.success(`${r.entraram} pessoa(s) inscrita(s)${r.jaEstavam ? ` (${r.jaEstavam} já estavam na sequência)` : ""}. O 1º e-mail sai na rotina diária ou em "Enviar agora".`);
        fecharForm(); await carregar(); return;
      }
      if (editId) {
        await api(`/api/email-sequences/${editId}/editar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nome, passos: paraEnviar() }) }).then(json);
        toast.success("Sequência atualizada. Quem já está nela segue do ponto onde parou."); fecharForm(); await carregar(); return;
      }
      const r = await api("/api/email-sequences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nome, passos: paraEnviar(), audience, autoInscrever: autoNovos && leads, pararAoClicar: pararClicar }) }).then(json);
      toast.success(`Sequência criada com ${r.entraram} pessoa(s). O 1º e-mail sai na rotina diária, ou clique em "Enviar agora".`);
      fecharForm(); setSources([]); setStatuses([]); setCanais([]); setAutoNovos(false); setPararClicar(false);
      await carregar();
    } catch (e: any) { toast.error(e.message); } finally { setSalvando(false); }
  };
  const agora = async (s: Seq) => {
    setRodando(s.id); let enviados = 0;
    try {
      for (let i = 0; i < 15; i++) {
        const r = await api(`/api/email-sequences/${s.id}/processar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(json);
        enviados += r.enviados;
        if (!r.restantes || (r.enviados + r.encerrados + r.falhas) === 0) { if (r.semCota) toast.warning("Limite diário de envios atingido; o resto sai amanhã."); break; }
      }
      toast.success(enviados ? `${enviados} e-mail(s) enviado(s).` : "Nada no prazo para enviar agora."); await carregar();
    } catch (e: any) { toast.error(e.message); } finally { setRodando(null); }
  };
  const alternarAuto = async (s: Seq) => {
    const ligar = !s.auto;
    if (ligar && !(await confirmDialog({ title: "Ligar entrada automática?", description: "A partir de agora, todo lead novo com e-mail válido entra nesta sequência (na rotina diária). Leads que já existem não entram.", confirmLabel: "Ligar" }))) return;
    try { await api(`/api/email-sequences/${s.id}/auto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: ligar, ...(s.auto || {}) }) }).then(json); await carregar(); } catch (e: any) { toast.error(e.message); }
  };
  const alternarParar = async (s: Seq) => { try { await api(`/api/email-sequences/${s.id}/parar-ao-clicar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !s.pararAoClicar }) }).then(json); await carregar(); } catch (e: any) { toast.error(e.message); } };
  const pausar = async (s: Seq) => { try { await api(`/api/email-sequences/${s.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s.status === "active" ? "paused" : "active" }) }).then(json); await carregar(); } catch (e: any) { toast.error(e.message); } };
  const excluir = async (s: Seq) => {
    if (!(await confirmDialog({ title: "Excluir sequência?", description: `"${s.name}" e o histórico de envios dela serão apagados. Quem já recebeu os e-mails não é afetado.`, confirmLabel: "Excluir" }))) return;
    try { await api(`/api/email-sequences/${s.id}`, { method: "DELETE" }).then(json); await carregar(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Modal isOpen={open} onClose={onClose} closeOnBackdrop={!criando} title="Sequências de e-mail" description="Vários e-mails em dias seguidos para cada pessoa (ex.: boas-vindas, lembrete 3 dias depois, oferta 7 dias depois). Quem se descadastra sai da sequência." maxWidth={criando && !inscId ? "max-w-6xl" : "max-w-3xl"}
      footer={criando ? <>
        {!inscId && !valido && <span className="mr-auto text-[11px] text-[var(--color-text-faint)]">{!nome.trim() ? "Para salvar, dê um nome à sequência." : `Para salvar, preencha o assunto e o conteúdo do e-mail ${incompleto + 1}.`}</span>}
        <Button variant="outline" onClick={fecharForm} className="h-9 px-3 text-xs">Voltar</Button>
        <Button onClick={() => void criar()} disabled={!valido || salvando || ((!editId || !!inscId) && !total)} className="h-9 px-4 text-xs font-bold">{salvando ? "Salvando…" : inscId ? "Inscrever" : editId ? "Salvar alterações" : "Criar sequência"}</Button>
      </> : undefined}>
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
                  <Button variant="outline" onClick={() => { setInscId({ id: s.id, nome: s.name }); setCriando(true); }} className="h-8 px-3 text-xs gap-1.5">Inscrever mais pessoas</Button>
                  <Button variant="outline" onClick={() => editar(s)} className="h-8 px-3 text-xs gap-1.5">Editar e-mails</Button>
                  <Button variant="outline" onClick={() => void alternarAuto(s)} className="h-8 px-3 text-xs gap-1.5">Entrada automática: {s.auto ? "ligada" : "desligada"}</Button>
                  <Button variant="outline" onClick={() => void alternarParar(s)} className="h-8 px-3 text-xs gap-1.5">Parar ao clicar: {s.pararAoClicar ? "sim" : "não"}</Button>
                  <Button variant="outline" onClick={() => void pausar(s)} className="h-8 px-3 text-xs gap-1.5">{s.status === "active" ? <><Pause className="w-3.5 h-3.5" /> Pausar</> : <><Play className="w-3.5 h-3.5" /> Retomar</>}</Button>
                  <Button variant="outline" onClick={() => void excluir(s)} className="h-8 px-3 text-xs gap-1.5 text-[var(--color-danger)]"><Trash2 className="w-3.5 h-3.5" /> Excluir</Button>
                </div>
              </div>))}
        </div>
      ) : (
        <div className={cn("grid gap-5 items-start", !inscId && "lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]")}>
        <div className="space-y-3 min-w-0" ref={topo}>
          {!inscId && (<>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Nome (só para você)
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Boas-vindas a novos leads" className={campo} /></label>
          {passos.map((p, i) => {
            const estaAberto = p.uid === aberto.uid;
            return (
            <div key={p.uid} className={cn("rounded-xl border", estaAberto ? "border-[var(--color-primary-blue)]" : "border-[var(--color-border-default)]")}>
              <div className="flex items-center justify-between gap-2 p-3">
                <button type="button" aria-expanded={estaAberto} onClick={() => setAbertoUid(p.uid)} className="flex flex-1 min-w-0 items-center gap-2 bg-transparent border-0 p-0 text-left cursor-pointer">
                  <span className={cn("grid place-items-center w-6 h-6 shrink-0 rounded-full text-[11px] font-black", estaAberto ? "bg-[var(--color-primary-blue)] !text-white" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]")}>{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-[var(--color-text-primary)]">{p.subject.trim() || `E-mail ${i + 1}`}</span>
                    <span className="block text-[11px] text-[var(--color-text-muted)]">Dia +{p.dias} · {p.conteudo.formato === "html" ? "HTML" : "texto"}{!p.subject.trim() || !corpoDoConteudo(p.conteudo) ? " · falta preencher" : ""}</span>
                  </span>
                  {!estaAberto && <ChevronDown className="w-4 h-4 ml-auto shrink-0 text-[var(--color-text-faint)]" />}
                </button>
                {passos.length > 1 && <button type="button" onClick={async () => { if (corpoDoConteudo(p.conteudo) && !(await confirmDialog({ title: `Remover o e-mail ${i + 1}?`, description: "O conteúdo escrito nele será perdido.", confirmLabel: "Remover", variant: "danger" }))) return; setPassos((l) => l.filter((x) => x.uid !== p.uid)); }} className="shrink-0 bg-transparent border-0 p-1 cursor-pointer text-[var(--color-danger)]" aria-label={`Remover e-mail ${i + 1}`}><Trash2 className="w-3.5 h-3.5" /></button>}
              </div>
              {estaAberto && (
                <div className="space-y-3 border-t border-[var(--color-border-subtle)] p-3">
                  <label className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">Sai
                    <input type="number" min={0} max={60} value={p.dias} onChange={(e) => setPasso(p.uid, { dias: Math.max(0, Math.min(60, Math.floor(Number(e.target.value) || 0))) })} className={`${campo} w-16`} />
                    dia(s) {i === 0 ? "depois de a pessoa entrar" : "depois do e-mail anterior"}
                  </label>
                  <input aria-label={`Assunto do e-mail ${i + 1}`} value={p.subject} onChange={(e) => setPasso(p.uid, { subject: e.target.value })} maxLength={200} placeholder="Assunto — pode usar {{primeiro_nome}}" className={`${campo} w-full`} />
                  <EditorConteudoEmail key={p.uid} assunto={p.subject} marca={marca} enviarImagem={enviarImagem}
                    formato={p.conteudo.formato} onFormato={(formato) => mudarConteudo(p.uid, () => ({ formato }))}
                    texto={p.conteudo.texto} onTexto={(texto) => mudarConteudo(p.uid, () => ({ texto }))}
                    html={p.conteudo.html} onHtml={(html) => mudarConteudo(p.uid, () => ({ html }))}
                    mostrarLogo={p.conteudo.logo[p.conteudo.formato]} onMostrarLogo={(v) => mudarConteudo(p.uid, (c) => ({ logo: { ...c.logo, [c.formato]: v } }))} />
                </div>)}
            </div>); })}
          {passos.length < 8 && <Button variant="outline" onClick={adicionar} className="h-8 px-3 text-xs gap-1.5"><Plus className="w-3.5 h-3.5" /> Adicionar e-mail</Button>}
          </>)}
          {editId && !inscId ? <p className="text-[11px] text-[var(--color-text-muted)]">Quem já está na sequência continua de onde parou. Mudar o público não é possível aqui: crie outra sequência.</p> : <div className="space-y-2">
            <p className="text-[11px] font-bold text-[var(--color-text-muted)]">Quem entra na sequência{inscId ? ` "${inscId.nome}"` : ""}</p>
            <div className="flex flex-wrap gap-x-4 text-xs text-[var(--color-text-primary)]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={leads} onChange={(e) => setLeads(e.target.checked)} /> Leads</label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={clientes} onChange={(e) => setClientes(e.target.checked)} /> Clientes</label>
            </div>
            {leads && opts && (
              <FiltrosDoPublico grupos={[
                { titulo: "Origem", opcoes: opts.sources, marcados: sources, onMarcados: setSources, vazio: "(sem origem)" },
                { titulo: "Status", opcoes: opts.statuses, marcados: statuses, onMarcados: setStatuses },
                { titulo: "Canal", opcoes: opts.canais || [], marcados: canais, onMarcados: setCanais },
              ]} />
            )}
            {!inscId && <label className="inline-flex items-start gap-1.5 cursor-pointer text-xs text-[var(--color-text-primary)]"><input type="checkbox" className="mt-0.5" checked={pararClicar} onChange={(e) => setPararClicar(e.target.checked)} /> <span><b>Parar</b> de enviar para quem clicar em um link de algum e-mail (já demonstrou interesse)</span></label>}
            {leads && !inscId && <label className="inline-flex items-start gap-1.5 cursor-pointer text-xs text-[var(--color-text-primary)]"><input type="checkbox" className="mt-0.5" checked={autoNovos} onChange={(e) => setAutoNovos(e.target.checked)} /> <span>Também inscrever <b>automaticamente</b> quem virar lead daqui para frente (com esses mesmos filtros de origem, status e canal)</span></label>}
            <p className="text-[11px] text-[var(--color-text-muted)]">{total === null ? "Contando…" : <><b className="text-[var(--color-text-primary)]">{total}</b> pessoa(s) com e-mail válido entram (sem repetidos nem descadastrados).</>}</p>
          </div>}
        </div>
        {!inscId && (
          <div className="lg:sticky lg:top-0 min-w-0">
            <PreviaEmail key={aberto.uid} assunto={aberto.subject} corpo={corpoDoConteudo(aberto.conteudo)} api={api} />
          </div>
        )}
        </div>
      )}
    </Modal>
  );
}
