import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Plus, Send, Loader2, FlaskConical, XCircle, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Modal } from "../../components/ui/modal";
import { csvEngajamento } from "../../lib/csvEngajamento";
import { avisosDoEmail } from "../../lib/avisosEmail";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { HelpTip } from "../../components/ui/help-tip";
import { useData } from "../../contexts/DataContext";
import { apiFetch } from "../../lib/apiClient";
import { useAuth } from "../../contexts/AuthContext";
import { readTableFile } from "../../lib/tableFile";
import { EMAIL_IN_TEXT, parseManualText } from "../../lib/importer";
import { FileSpreadsheet } from "lucide-react";

// Disparo de e-mail em massa: monta o público a partir dos leads da empresa (por origem/status), cria a campanha
// e envia em lotes com progresso. Sai pelo SMTP da empresa (Integrações → SMTP) ou, sem ele, pelo da plataforma.

interface Campaign { id: string; name: string; subject: string; status: string; total: number; sent: number; failed: number; opened?: number; clicked?: number; agendada_para?: string | null; subject_b?: string | null; sender: string | null; created_at: string }
interface Option { value: string; count: number }
interface Options { sources: Option[]; statuses: Option[]; canais?: Option[]; campanhas?: Option[]; sender: { kind: "tenant" | "platform"; from?: string } }
interface Preview { total: number; semEmail: number; descadastrados: number; repetidos: number; excluidos?: number; sample: { name: string; email: string }[] }

const STATUS_LABEL: Record<string, string> = { ready: "Pronta para enviar", sending: "Enviando", done: "Concluída", cancelled: "Cancelada" };

const json = async (r: Response) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || "Falha na requisição."); return b; };

export default function MarketingEmail() {
  // Empresa ATIVA (master/parceiro troca de empresa na barra): toda chamada leva o tenantId. Sem isso o servidor
  // cai na empresa do próprio usuário e a tela mostraria leads/campanhas de outra empresa.
  const { activeTenantId } = useAuth();
  const { appSettings, saveAppSetting } = useData();
  const modelos: { id: string; nome: string; assunto: string; corpo: string }[] = Array.isArray(appSettings?.email_modelos) ? appSettings.email_modelos : [];
  const [modeloId, setModeloId] = useState("");
  const [subjectB, setSubjectB] = useState("");
  const [abRes, setAbRes] = useState<Record<string, any>>({});
  const [previa, setPrevia] = useState<{ subject: string; html: string } | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const verPrevia = async () => {
    setCarregandoPrevia(true);
    try { setPrevia(await apiFetchTenant("/api/email-campaigns/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body }) }).then(json)); }
    catch (e: any) { toast.error(e.message); } finally { setCarregandoPrevia(false); }
  };
  const exportar = async (c: Campaign) => {
    try {
      const { linhas } = await apiFetchTenant(`/api/email-campaigns/${c.id}/engajamento`).then(json);
      const url = URL.createObjectURL(new Blob(["\ufeff" + csvEngajamento(linhas)], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = `${c.name.replace(/[^\w\-]+/g, "_").slice(0, 50) || "campanha"}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e.message); }
  };
  const reenviar = async (c: Campaign) => {
    if (!(await confirmDialog({ title: "Reenviar para quem não abriu?", description: `Cria uma nova campanha só com quem recebeu "${c.name}" e não abriu nem clicou. Você confere e dispara em seguida.`, confirmLabel: "Criar reenvio" }))) return;
    try { const r = await apiFetchTenant(`/api/email-campaigns/${c.id}/reenviar-nao-abriram`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(json); toast.success(`Reenvio criado com ${r.total} pessoa(s). Envie um teste e dispare.`); await load(); }
    catch (e: any) { toast.error(e.message); }
  };
  const verAB = async (id: string) => {
    try { setAbRes((p) => ({ ...p, [id]: null })); const r = await apiFetchTenant(`/api/email-campaigns/${id}/ab`).then(json); setAbRes((p) => ({ ...p, [id]: r })); }
    catch (e: any) { toast.error(e.message); setAbRes((p) => { const n = { ...p }; delete n[id]; return n; }); }
  };
  const [descAberto, setDescAberto] = useState(false);
  const [descItens, setDescItens] = useState<{ email: string; created_at: string }[] | null>(null);
  const [descNovo, setDescNovo] = useState("");
  const apiFetchTenant = (path: string, init?: RequestInit) => {
    if (!activeTenantId) return Promise.reject(new Error("Empresa não identificada."));
    return apiFetch(`${path}${path.includes("?") ? "&" : "?"}tenantId=${encodeURIComponent(activeTenantId)}`, init);
  };
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Record<string, { email: string; error: string | null }[] | null>>({});
  const [check, setCheck] = useState<{ kind: string; host?: string; port?: number; encryption?: string; fromDomain?: string; verified: boolean; error?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const verifySender = async () => {
    setChecking(true);
    try { setCheck(await apiFetchTenant("/api/email-campaigns/sender-check").then(json)); } catch (e: any) { toast.error(e.message); } finally { setChecking(false); }
  };
  const stopRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [canais, setCanais] = useState<string[]>([]);
  const [campanhas, setCampanhas] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [inclLeads, setInclLeads] = useState(true);
  const [inclClientes, setInclClientes] = useState(false);
  const [inclContatos, setInclContatos] = useState(false);
  const [inclEquipe, setInclEquipe] = useState(false);
  const [manual, setManual] = useState<{ email: string; name: string }[]>([]);
  const [manualText, setManualText] = useState("");
  const [fileName, setFileName] = useState("");
  const [excluir, setExcluir] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);
  const audience = { leads: inclLeads, clientes: inclClientes, contatos: inclContatos, equipe: inclEquipe, sources, statuses, canais, campanhas, manual, excluir };

  const onManualText = (t: string) => { setManualText(t); setFileName(""); setManual(parseManualText(t)); };
  const onSheet = async (file?: File | null) => {
    if (!file) return;
    try {
      const t = await readTableFile(file, { maxBytes: 20 * 1024 * 1024, maxRows: 50_000 });
      const nameCol = t.headers.findIndex((h) => /nome|name/i.test(h));
      const people: { email: string; name: string }[] = [];
      for (const r of t.rows) {
        const idx = r.findIndex((c) => EMAIL_IN_TEXT.test(c));
        if (idx < 0) continue;
        const email = r[idx].match(EMAIL_IN_TEXT)![0].toLowerCase();
        people.push({ email, name: nameCol >= 0 && nameCol !== idx ? r[nameCol] : "" });
      }
      if (!people.length) { toast.error("Não encontrei nenhum e-mail nessa planilha."); return; }
      setManual(people); setManualText(""); setFileName(`${file.name} · ${people.length} e-mail(s)`);
    } catch (e: any) { toast.error(e?.message || "Não consegui ler a planilha."); }
  };
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [agendarPara, setAgendarPara] = useState("");

  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;
  const load = useCallback(async () => {
    const t = activeTenantId;
    try {
      const [c, o] = await Promise.all([apiFetchTenant("/api/email-campaigns").then(json), apiFetchTenant("/api/email-campaigns/audience-options").then(json)]);
      if (tenantRef.current !== t) return; // trocou de empresa no meio: descarta a resposta da anterior
      setCampaigns(c.campaigns || []); setOptions(o);
    } catch (e: any) { if (tenantRef.current === t) toast.error(e.message); } finally { if (tenantRef.current === t) setLoading(false); }
  }, [activeTenantId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setCampaigns([]); setOptions(null); setCheck(null); setPreview(null); setLoading(true);
    setExcluir([]); setManual([]); setManualText(""); setFileName(""); setSources([]); setStatuses([]); setCanais([]); setCampanhas([]);
    setOpen(false);
    if (activeTenantId) void load();
  }, [activeTenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prévia do público ao mudar os filtros.
  useEffect(() => {
    if (!open) return;
    setPreviewing(true);
    const t0 = activeTenantId;
    const t = setTimeout(() => {
      apiFetchTenant("/api/email-campaigns/audience-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience }) })
        .then(json).then((p) => { if (tenantRef.current === t0) setPreview(p); }).catch(() => setPreview(null)).finally(() => setPreviewing(false));
    }, 350);
    return () => clearTimeout(t);
  }, [open, activeTenantId, sources, statuses, canais, campanhas, inclLeads, inclClientes, inclContatos, inclEquipe, manual, excluir]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const create = async () => {
    setCreating(true);
    try {
      const r = await apiFetchTenant("/api/email-campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, subject, body, audience, ...(subjectB.trim() ? { subjectB: subjectB.trim() } : {}), ...(agendarPara ? { agendarPara } : {}) }) }).then(json);
      toast.success(agendarPara ? `Campanha agendada para ${agendarPara.split("-").reverse().join("/")} (${r.total} destinatário(s)). Envie um teste para você antes.` : `Campanha criada com ${r.total} destinatário(s). Envie um teste para você antes de disparar.`);
      setAgendarPara("");
      setOpen(false); setName(""); setSubject(""); setSubjectB(""); setBody(""); setSources([]); setStatuses([]); setManual([]); setManualText(""); setFileName(""); setExcluir([]); setShowList(false); setInclLeads(true); setInclClientes(false); setInclContatos(false); setInclEquipe(false);
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setCreating(false); }
  };

  const test = async (c: Campaign) => {
    try {
      const r = await apiFetchTenant(`/api/email-campaigns/${c.id}/test`, { method: "POST" }).then(json);
      toast.success(`Teste enviado para ${r.to}. Confira a caixa de entrada e o spam.`);
    } catch (e: any) { toast.error(e.message); }
  };

  const run = async (c: Campaign) => {
    stopRef.current = false; setRunning(c.id);
    try {
      for (;;) {
        const r = await apiFetchTenant(`/api/email-campaigns/${c.id}/send-batch`, { method: "POST" }).then(json);
        setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, sent: r.sent, failed: r.failed, status: r.status } : x)));
        if (r.cota) { toast.warning(`Limite de ${r.cota.limite} e-mails em 24h atingido${r.cota.proprio ? "" : " (SMTP da plataforma — cadastre o seu em Integrações → SMTP para enviar mais)"}. O restante sai sozinho quando liberar.`); break; }
        if (r.done) { toast.success(`Envio concluído: ${r.sent} enviado(s), ${r.failed} falha(s).`); break; }
        if (stopRef.current) { toast.info("Envio pausado. Você pode retomar quando quiser."); break; }
      }
    } catch (e: any) { toast.error(`${e.message} — o envio pode ser retomado.`); }
    finally { setRunning(null); void load(); }
  };

  const send = async (c: Campaign) => {
    if (!(await confirmDialog({ title: "Disparar campanha?", description: `Vai enviar "${c.subject}" para ${c.total} pessoa(s). Mantenha esta página aberta até terminar (se fechar, é só retomar).`, confirmLabel: "Enviar agora" }))) return;
    void run(c);
  };

  const verFalhas = async (c: Campaign) => {
    if (falhas[c.id]) { setFalhas((f) => ({ ...f, [c.id]: null })); return; }
    try { const r = await apiFetchTenant(`/api/email-campaigns/${c.id}/failures`).then(json); setFalhas((f) => ({ ...f, [c.id]: r.failures })); } catch (e: any) { toast.error(e.message); }
  };
  const reenviarFalhas = async (c: Campaign) => {
    try {
      const r = await apiFetchTenant(`/api/email-campaigns/${c.id}/retry-failed`, { method: "POST" }).then(json);
      if (!r.requeued) { toast.info("Não há falhas para reenviar."); return; }
      setFalhas((f) => ({ ...f, [c.id]: null }));
      toast.success(`${r.requeued} envio(s) voltaram para a fila.`);
      void run({ ...c, status: "sending" });
    } catch (e: any) { toast.error(e.message); }
  };

  const cancel = async (c: Campaign) => {
    if (!(await confirmDialog({ title: "Cancelar campanha?", description: "Quem ainda não recebeu não receberá. O que já foi enviado não volta.", confirmLabel: "Cancelar campanha", variant: "danger" } as any))) return;
    stopRef.current = true;
    try { await apiFetchTenant(`/api/email-campaigns/${c.id}/cancel`, { method: "POST" }).then(json); await load(); } catch (e: any) { toast.error(e.message); }
  };

  const abrirDescadastros = async () => {
    setDescAberto(true); setDescItens(null);
    try { setDescItens((await apiFetchTenant("/api/email-campaigns/descadastros").then(json)).itens); } catch (e: any) { toast.error(e.message); setDescItens([]); }
  };
  const bloquearEmail = async () => {
    try {
      await apiFetchTenant("/api/email-campaigns/descadastros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: descNovo }) }).then(json);
      toast.success("E-mail bloqueado: não receberá mais campanhas."); setDescNovo("");
      setDescItens((await apiFetchTenant("/api/email-campaigns/descadastros").then(json)).itens);
    } catch (e: any) { toast.error(e.message); }
  };
  const exportarDescadastros = () => {
    const csv = ["E-mail;Data", ...(descItens || []).map((d) => `${d.email};${new Date(d.created_at).toLocaleDateString("pt-BR")}`)].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "descadastrados.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const usarModelo = (id: string) => {
    setModeloId(id);
    const m = modelos.find((x) => x.id === id);
    if (m) { setSubject(m.assunto); setBody(m.corpo); if (!name.trim()) setName(m.nome); }
  };
  const salvarModelo = async () => {
    if (!subject.trim() || !body.trim()) { toast.error("Escreva o assunto e a mensagem antes de salvar como modelo."); return; }
    const nome = (name.trim() || subject.trim()).slice(0, 60);
    const existente = modelos.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
    const novo = { id: existente?.id ?? crypto.randomUUID(), nome, assunto: subject.trim().slice(0, 200), corpo: body.trim().slice(0, 20000) };
    await saveAppSetting("email_modelos", [...modelos.filter((x) => x.id !== novo.id), novo].slice(-30));
    setModeloId(novo.id);
    toast.success(existente ? `Modelo “${nome}” atualizado.` : `Modelo “${nome}” salvo.`);
  };
  const excluirModelo = async () => {
    const m = modelos.find((x) => x.id === modeloId);
    if (!m || !(await confirmDialog({ title: "Excluir modelo?", description: `O modelo “${m.nome}” será removido. As campanhas já criadas não mudam.`, confirmLabel: "Excluir", variant: "danger" }))) return;
    await saveAppSetting("email_modelos", modelos.filter((x) => x.id !== modeloId));
    setModeloId("");
  };
  const duplicar = async (c: Campaign) => {
    try {
      const r = await apiFetchTenant(`/api/email-campaigns/${c.id}`).then(json);
      setName(`${r.name} (cópia)`.slice(0, 120)); setSubject(r.subject); setBody(r.body); setModeloId(""); setOpen(true);
    } catch (e: any) { toast.error(e.message); }
  };

  const canCreate = name.trim() && subject.trim() && body.trim() && (preview?.total ?? 0) > 0 && !creating;

  return (
    <PageContainer
      title="E-mail em massa"
      description="Envie um e-mail para leads, clientes, contatos, equipe ou uma lista própria (colada ou de planilha) — com ou sem cadastro no sistema — com descadastro automático."
      actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void abrirDescadastros()} className="h-9 px-3 text-xs">Descadastrados</Button><Button variant="outline" onClick={() => void load()} className="h-9 px-3 text-xs gap-1.5"><RefreshCw className="w-3.5 h-3.5" /></Button><Button onClick={() => setOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova campanha</Button></div>}
    >
      <div className="space-y-4 max-w-4xl">
        {options && (
          <Card className="p-4 flex items-start gap-3 text-xs">
            {options.sender.kind === "tenant"
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-[var(--color-success)] shrink-0" />
              : <AlertTriangle className="w-4 h-4 mt-0.5 text-[var(--color-warning)] shrink-0" />}
            <div className="text-[var(--color-text-muted)]">
              {options.sender.kind === "tenant"
                ? <>Os e-mails saem do seu SMTP (<b className="text-[var(--color-text-primary)]">{options.sender.from}</b>).</>
                : <>Você ainda não configurou o seu SMTP: os e-mails sairiam pelo remetente da <b className="text-[var(--color-text-primary)]">plataforma S.P.Y.</b>. Para listas grandes, o ideal é enviar do domínio da sua empresa — configure em <Link to="/app/configuracoes/integracoes/smtp" className="font-bold text-[var(--color-primary-blue)]">Integrações › SMTP</Link>.</>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => void verifySender()} disabled={checking} className="h-7 px-2.5 text-[11px] gap-1.5">{checking && <Loader2 className="w-3 h-3 animate-spin" />} Verificar conexão do remetente</Button>
                {check && (check.verified
                  ? <span className="font-bold text-[var(--color-success)]">Conexão OK · {check.host}:{check.port} ({check.encryption}) · domínio {check.fromDomain}</span>
                  : <span className="font-bold text-[var(--color-danger)]">Falhou{check.host ? ` em ${check.host}:${check.port}` : ""}: {check.error}</span>)}
              </div>
            </div>
          </Card>
        )}

        {loading ? <div className="py-16 text-center text-sm text-[var(--color-text-faint)]">Carregando…</div>
          : campaigns.length === 0 ? (
            <Card className="p-10 text-center space-y-2"><Mail className="w-9 h-9 mx-auto text-[var(--color-primary-blue)]" /><p className="text-sm font-bold text-[var(--color-text-primary)]">Nenhuma campanha ainda</p><p className="text-xs text-[var(--color-text-muted)]">Crie a primeira: escolha o público, escreva a mensagem e dispare.</p></Card>
          ) : campaigns.map((c) => {
            const pct = c.total ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0;
            const active = c.status === "ready" || c.status === "sending";
            return (
              <Card key={c.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[var(--color-text-primary)] truncate">{c.name}</h4>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">Assunto: {c.subject}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">{c.status === "ready" && c.agendada_para ? `Agendada para ${new Date(c.agendada_para).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : STATUS_LABEL[c.status] || c.status}</span>
                </div>
                <div>
                  <div className="h-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden"><div className="h-full bg-[var(--color-primary-blue)] transition-all" style={{ width: `${pct}%` }} /></div>
                  <p className="text-[11px] mt-1 text-[var(--color-text-muted)]">{c.sent} enviado(s) de {c.total}{c.failed > 0 && <span className="text-[var(--color-danger)]"> · {c.failed} falha(s)</span>}</p>
                  {c.sent > 0 && c.opened !== undefined && (
                    <p className="text-[11px] mt-0.5 text-[var(--color-text-muted)] flex items-center gap-1.5">
                      <span><b className="text-[var(--color-text-primary)]">{Math.round(((c.opened || 0) / c.sent) * 100)}%</b> abriram ({c.opened || 0})</span>
                      <span>·</span>
                      <span><b className="text-[var(--color-text-primary)]">{Math.round(((c.clicked || 0) / c.sent) * 100)}%</b> clicaram ({c.clicked || 0})</span>
                      <HelpTip label="Aberturas e cliques">Aberturas são estimativas: alguns apps de e-mail baixam as imagens sozinhos (contam a mais) e outros bloqueiam (contam a menos). Cliques em links do texto são mais confiáveis.</HelpTip>
                    </p>
                  )}
                </div>
                {c.sent > 0 && (
                  <Button variant="outline" onClick={() => void exportar(c)} className="h-8 px-3 text-xs gap-1.5">Exportar planilha (quem abriu/clicou)</Button>
                )}
                {c.status === "done" && c.sent > 0 && c.opened !== undefined && (c.opened || 0) < c.sent && (
                  <Button variant="outline" onClick={() => void reenviar(c)} className="h-8 px-3 text-xs gap-1.5"><Send className="w-3.5 h-3.5" /> Reenviar para quem não abriu</Button>
                )}
                {c.subject_b && c.sent > 0 && (
                  <div className="text-[11px] text-[var(--color-text-muted)]">
                    {abRes[c.id] === undefined ? <button onClick={() => void verAB(c.id)} className="font-bold text-[var(--color-primary-blue)] underline">Ver resultado do teste A/B</button>
                      : abRes[c.id] === null ? "Carregando…"
                      : abRes[c.id].ab && (
                        <div className="grid sm:grid-cols-2 gap-2">
                          {(["a", "b"] as const).map((v) => {
                            const x = abRes[c.id][v]; const pct = (n: number) => (x.enviados ? Math.round((n / x.enviados) * 100) : 0);
                            return <div key={v} className="rounded-lg bg-[var(--color-surface-sunken)] p-2"><p className="font-bold text-[var(--color-text-primary)] truncate">{v.toUpperCase()}: {v === "a" ? abRes[c.id].assuntoA : abRes[c.id].assuntoB}</p><p>{x.enviados} enviado(s) · <b>{pct(x.abriram)}%</b> abriram · <b>{pct(x.clicaram)}%</b> clicaram</p></div>;
                          })}
                        </div>)}
                  </div>
                )}
                {active && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void test(c)} disabled={running === c.id} className="h-8 px-3 text-xs gap-1.5"><FlaskConical className="w-3.5 h-3.5" /> Enviar teste para mim</Button>
                    {running === c.id
                      ? <Button variant="outline" onClick={() => { stopRef.current = true; }} className="h-8 px-3 text-xs gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando… (pausar)</Button>
                      : <Button onClick={() => void (c.status === "sending" ? run(c) : send(c))} className="h-8 px-3 text-xs font-bold gap-1.5"><Send className="w-3.5 h-3.5" /> {c.status === "sending" ? "Retomar envio" : "Disparar"}</Button>}
                    <Button variant="outline" onClick={() => void cancel(c)} className="h-8 px-3 text-xs gap-1.5 text-[var(--color-danger)]"><XCircle className="w-3.5 h-3.5" /> Cancelar</Button>
                  </div>
                )}
                <div><Button variant="ghost" onClick={() => void duplicar(c)} className="h-7 px-2 text-[11px] text-[var(--color-text-muted)]">Duplicar campanha</Button></div>
                {c.failed > 0 && c.status !== "cancelled" && running !== c.id && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void verFalhas(c)} className="h-8 px-3 text-xs">{falhas[c.id] ? "Ocultar falhas" : `Ver as ${c.failed} falha(s)`}</Button>
                      <Button variant="outline" onClick={() => void reenviarFalhas(c)} className="h-8 px-3 text-xs">Reenviar falhas</Button>
                    </div>
                    {falhas[c.id] && (
                      <ul className="text-[11px] text-[var(--color-text-muted)] space-y-0.5 max-h-40 overflow-auto">
                        {falhas[c.id]!.map((f, i) => <li key={i}><b className="text-[var(--color-text-primary)]">{f.email}</b> — {f.error || "erro desconhecido"}</li>)}
                        {c.failed > 50 && <li>…mostrando as primeiras 50.</li>}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
      </div>

      <Modal isOpen={!!previa} onClose={() => setPrevia(null)} title="Pré-visualização" description="Exemplo com nome fictício. Nada foi enviado." maxWidth="max-w-2xl">
        {previa && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-text-muted)]">Assunto: <b className="text-[var(--color-text-primary)]">{previa.subject}</b></p>
            <iframe title="Pré-visualização do e-mail" sandbox="" srcDoc={previa.html} className="w-full h-[460px] rounded-lg border border-[var(--color-border-default)] bg-white" />
          </div>)}
      </Modal>
      <Modal isOpen={descAberto} onClose={() => setDescAberto(false)} title="Descadastrados" description="Quem pediu para sair nunca mais recebe campanhas: o sistema pula essas pessoas em qualquer envio. Esta lista não pode ser desfeita por aqui." maxWidth="max-w-lg">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={descNovo} onChange={(e) => setDescNovo(e.target.value)} placeholder="Bloquear um e-mail à mão" className="flex-1 h-9 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" />
            <Button onClick={() => void bloquearEmail()} disabled={!descNovo.trim()} className="h-9 px-3 text-xs">Bloquear</Button>
          </div>
          {descItens === null ? <Loader2 className="w-4 h-4 animate-spin" /> : descItens.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">Ninguém se descadastrou ainda.</p> : (<>
            <div className="flex items-center justify-between text-xs"><b className="text-[var(--color-text-primary)]">{descItens.length.toLocaleString("pt-BR")} pessoa(s)</b><Button variant="outline" onClick={exportarDescadastros} className="h-8 px-3 text-xs">Exportar planilha</Button></div>
            <ul className="max-h-72 overflow-auto divide-y divide-[var(--color-border-default)] text-xs">{descItens.slice(0, 300).map((d) => <li key={d.email} className="flex justify-between py-1.5"><span className="text-[var(--color-text-primary)] break-all">{d.email}</span><span className="text-[var(--color-text-muted)] shrink-0 ml-3">{new Date(d.created_at).toLocaleDateString("pt-BR")}</span></li>)}</ul>
            {descItens.length > 300 && <p className="text-[11px] text-[var(--color-text-muted)]">Mostrando os 300 mais recentes. A planilha tem todos.</p>}
          </>)}
        </div>
      </Modal>

      <Modal isOpen={open} onClose={() => !creating && setOpen(false)} title="Nova campanha de e-mail" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-[var(--color-text-muted)]">
            <span>Modelo</span>
            <select value={modeloId} onChange={(e) => usarModelo(e.target.value)} className="h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] max-w-[220px]">
              <option value="">{modelos.length ? "Escolher um modelo salvo…" : "Nenhum modelo salvo"}</option>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <Button type="button" variant="outline" onClick={() => void salvarModelo()} className="h-9 px-3 text-xs">Salvar como modelo</Button>
            {modeloId && <Button type="button" variant="ghost" onClick={() => void excluirModelo()} className="h-9 px-3 text-xs text-[var(--color-danger)]">Excluir modelo</Button>}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Nome (só para você)
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ex.: Aviso Treinão 14/11" className="h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /></label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Assunto
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Ex.: {{primeiro_nome}}, sua vaga no Treinão está confirmada" className="h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /></label>
          </div>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Assunto B (opcional — teste A/B)
            <input value={subjectB} onChange={(e) => setSubjectB(e.target.value)} maxLength={200} placeholder="Preencha para testar outro assunto: metade recebe o A e metade o B" className="h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /></label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Mensagem
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={20000} placeholder={"Olá {{primeiro_nome}},\n\nO Treinão acontece neste sábado, dia 14, às 9h...\n\nTe esperamos!"} className="px-2 py-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] resize-y" />
            <button type="button" onClick={() => void verPrevia()} disabled={!body.trim() || carregandoPrevia} className="self-start text-[11px] font-bold text-[var(--color-primary-blue)] underline disabled:opacity-50">{carregandoPrevia ? "Carregando…" : "Ver como o e-mail vai ficar"}</button>
            {avisosDoEmail(subject, body).length > 0 && (
              <ul className="space-y-0.5 font-normal">{avisosDoEmail(subject, body).map((v) => (
                <li key={v.texto} className={v.nivel === "atencao" ? "text-[var(--color-warning,#b45309)]" : "text-[var(--color-text-muted)]"}>{v.nivel === "atencao" ? "⚠ " : "💡 "}{v.texto}</li>))}</ul>)}
            <span className="font-normal">Use <code>{"{{nome}}"}</code>, <code>{"{{primeiro_nome}}"}</code> e <code>{"{{empresa}}"}</code>. O link para sair da lista é adicionado sozinho no rodapé.</span></label>

          <div className="space-y-2">
            <p className="text-[11px] font-bold text-[var(--color-text-muted)]">Quem recebe — pode ser gente que está no sistema ou não. Marque as fontes e/ou use uma lista própria.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--color-text-primary)]">
              {([["Leads", inclLeads, setInclLeads], ["Clientes", inclClientes, setInclClientes], ["Contatos das empresas", inclContatos, setInclContatos], ["Equipe (usuários do sistema)", inclEquipe, setInclEquipe]] as const).map(([l, v, set]) => (
                <label key={l} className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {l}</label>))}
            </div>
            {inclLeads && <p className="text-[11px] text-[var(--color-text-muted)]">Leads: sem filtro = todos com e-mail. Filtre por origem (ex.: o evento) e/ou status:</p>}
            {inclLeads && options && options.sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{options.sources.slice(0, 40).map((o) => (
                <button key={`s-${o.value}`} type="button" onClick={() => toggle(sources, setSources, o.value)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${sources.includes(o.value) ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>{o.value || "(sem origem)"} · {o.count}</button>))}</div>
            )}
            {inclLeads && options && options.statuses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{options.statuses.map((o) => (
                <button key={`t-${o.value}`} type="button" onClick={() => toggle(statuses, setStatuses, o.value)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${statuses.includes(o.value) ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>Status: {o.value || "—"} · {o.count}</button>))}</div>
            )}
            {inclLeads && options && (options.canais?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">{options.canais!.slice(0, 40).map((o) => (
                <button key={`c-${o.value}`} type="button" onClick={() => toggle(canais, setCanais, o.value)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${canais.includes(o.value) ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>Canal: {o.value} · {o.count}</button>))}</div>
            )}
            {inclLeads && options && (options.campanhas?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">{options.campanhas!.slice(0, 40).map((o) => (
                <button key={`k-${o.value}`} type="button" onClick={() => toggle(campanhas, setCampanhas, o.value)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${campanhas.includes(o.value) ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>Campanha: {o.value} · {o.count}</button>))}</div>
            )}
            <div className="space-y-1.5 p-3 rounded-xl border border-dashed border-[var(--color-border-default)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[var(--color-text-muted)]">Lista própria (não precisa estar no sistema)</span>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-primary-blue)] cursor-pointer"><FileSpreadsheet className="w-3.5 h-3.5" /> Carregar planilha
                  <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => { void onSheet(e.target.files?.[0]); e.target.value = ""; }} /></label>
              </div>
              <textarea value={manualText} onChange={(e) => onManualText(e.target.value)} rows={3} placeholder={"Cole e-mails, um por linha. Pode ser:\nana@email.com\nBruno Alves, bruno@email.com"} className="w-full px-2 py-1.5 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] resize-y" />
              {(fileName || manual.length > 0) && <p className="text-[11px] text-[var(--color-text-muted)]">{fileName || `${manual.length} e-mail(s) colado(s)`} — a planilha só precisa ter uma coluna com e-mail (e, se quiser, uma "Nome").</p>}
            </div>
            <div className="p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)]">
              {previewing ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando…</span>
                : preview ? <><b className="text-[var(--color-text-primary)] text-sm">{preview.total.toLocaleString("pt-BR")}</b> destinatário(s){preview.repetidos + preview.descadastrados + preview.semEmail > 0 && <> · fora da lista: {preview.repetidos} repetido(s), {preview.descadastrados} descadastrado(s), {preview.semEmail} com e-mail inválido</>}
                  {!!preview.excluidos && <> · {preview.excluidos} retirado(s) por você</>}
                  {preview.sample.length > 0 && (
                    <div className="mt-1.5">
                      <button type="button" onClick={() => setShowList((v) => !v)} className="font-bold text-[var(--color-primary-blue)] bg-transparent border-none cursor-pointer p-0">{showList ? "Ocultar lista" : "Ver e retirar destinatários"}</button>
                      {excluir.length > 0 && <button type="button" onClick={() => setExcluir([])} className="ml-3 font-bold text-[var(--color-text-muted)] bg-transparent border-none cursor-pointer p-0">Desfazer retiradas ({excluir.length})</button>}
                      {showList && (
                        <ul className="mt-1.5 max-h-40 overflow-auto divide-y divide-[var(--color-border-subtle)] rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
                          {preview.sample.map((s) => (
                            <li key={s.email} className="flex items-center justify-between gap-2 px-2 py-1">
                              <span className="truncate"><span className="text-[var(--color-text-primary)] font-medium">{s.email}</span>{s.name && <span> · {s.name}</span>}</span>
                              <button type="button" aria-label={`Retirar ${s.email}`} onClick={() => setExcluir((p) => [...p, s.email])} className="shrink-0 font-bold text-[var(--color-danger)] bg-transparent border-none cursor-pointer">Retirar</button>
                            </li>))}
                        </ul>)}
                      {showList && preview.total > preview.sample.length && <p className="mt-1">Mostrando os {preview.sample.length} primeiros de {preview.total}.</p>}
                    </div>)}</>
                  : "Não foi possível calcular o público."}
            </div>
          </div>
          <div className="flex justify-end items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={creating} className="h-9 px-4 text-xs">Cancelar</Button>
            <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--color-text-muted)]">Enviar em
              <input type="date" value={agendarPara} min={new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)} onChange={(e) => setAgendarPara(e.target.value)} className="h-9 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" />
              <HelpTip label="Agendamento">Deixe em branco para disparar você mesmo quando quiser. Com uma data, a campanha sai sozinha no envio automático das 10h (Brasília) desse dia, mesmo com o sistema fechado. Você ainda pode enviar antes pelo botão.</HelpTip>
            </label>
            <Button onClick={() => void create()} disabled={!canCreate} className="h-9 px-5 text-xs font-bold gap-1.5">{creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Criar campanha</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
