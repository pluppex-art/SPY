import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mail, Plus, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Modal } from "../../components/ui/modal";
import { SequenciasEmail } from "./SequenciasEmail";
import { csvEngajamento } from "../../lib/csvEngajamento";
import { comoHtml, comOpcaoDeLogo, ehHtml, lerOpcaoDeLogo, MAX_HTML, MAX_TEXTO } from "../../lib/emailHtml";
import { enviarImagemDeEmail } from "../../lib/imagemEmail";
import { EditorConteudoEmail, type FormatoEmail } from "./components/EditorConteudoEmail";
import { PreviaEmail } from "./components/PreviaEmail";
import { FiltrosDoPublico } from "./components/FiltrosDoPublico";
import { ListaDeDestinatarios } from "./components/ListaDeDestinatarios";
import { CampanhasEmail, type Campanha as Campaign } from "./components/CampanhasEmail";
import { DestinatariosDaCampanha } from "./components/DestinatariosDaCampanha";
import { ReenviarCampanha } from "./components/ReenviarCampanha";
import { OpcaoDeContagem } from "./components/OpcaoDeContagem";
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

interface Option { value: string; count: number }
interface Options { sources: Option[]; statuses: Option[]; canais?: Option[]; campanhas?: Option[]; sender: { kind: "tenant" | "platform"; from?: string } }
interface Preview { total: number; semEmail: number; descadastrados: number; repetidos: number; excluidos?: number; sample: { name: string; email: string }[] }


/** Bloco numerado do formulário da campanha. */
function Etapa({ numero, titulo, ajuda, children }: { numero: number; titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-black text-[var(--color-text-primary)]">
        <span className="grid place-items-center w-6 h-6 rounded-full bg-[var(--color-primary-blue)] text-[11px] !text-white">{numero}</span>
        {titulo}{ajuda && <HelpTip label={titulo}>{ajuda}</HelpTip>}
      </h4>
      {children}
    </section>
  );
}

/** O navegador lança TypeError quando a conexão cai no meio do pedido (ex.: ERR_NETWORK_CHANGED). */
const semRede = (e: unknown) => e instanceof TypeError;

const json = async (r: Response) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || "Falha na requisição."); return b; };

export default function MarketingEmail() {
  // Empresa ATIVA (master/parceiro troca de empresa na barra): toda chamada leva o tenantId. Sem isso o servidor
  // cai na empresa do próprio usuário e a tela mostraria leads/campanhas de outra empresa.
  const { activeTenantId, activeTenantName } = useAuth();
  const { appSettings, saveAppSetting } = useData();
  const modelos: { id: string; nome: string; assunto: string; corpo: string }[] = Array.isArray(appSettings?.email_modelos) ? appSettings.email_modelos : [];
  const [modeloId, setModeloId] = useState("");
  const [seqAberto, setSeqAberto] = useState(false);
  const [subjectB, setSubjectB] = useState("");
  const exportar = async (c: Campaign) => {
    try {
      const { linhas } = await apiFetchTenant(`/api/email-campaigns/${c.id}/engajamento`).then(json);
      const url = URL.createObjectURL(new Blob(["\ufeff" + csvEngajamento(linhas)], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = `${c.name.replace(/[^\w\-]+/g, "_").slice(0, 50) || "campanha"}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e.message); }
  };
  const [reenvio, setReenvio] = useState<Campaign | null>(null);
  const [vendo, setVendo] = useState<Campaign | null>(null);
  /** Campanha aberta no formulário para edição (nulo = campanha nova). */
  const [editando, setEditando] = useState<Campaign | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [rastrear, setRastrear] = useState(true);
  const [descAberto, setDescAberto] = useState(false);
  const [descItens, setDescItens] = useState<{ email: string; created_at: string; motivo?: string | null }[] | null>(null);
  const [descNovo, setDescNovo] = useState("");
  const apiFetchTenant = (path: string, init?: RequestInit) => {
    if (!activeTenantId) return Promise.reject(new Error("Empresa não identificada."));
    return apiFetch(`${path}${path.includes("?") ? "&" : "?"}tenantId=${encodeURIComponent(activeTenantId)}`, init);
  };
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
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
  const [bodyHtml, setBodyHtml] = useState("");
  const [formato, setFormato] = useState<FormatoEmail>("texto");
  // A logo aparece por padrão no texto; no HTML do cliente, só quando pedida.
  const [logoNo, setLogoNo] = useState({ texto: true, html: false });
  /** O que realmente vai no e-mail, conforme o formato escolhido. */
  const corpo = comOpcaoDeLogo(formato === "html" ? comoHtml(bodyHtml.trim()) : body, logoNo[formato]);
  const abrirCorpo = (v: string) => {
    const { conteudo, mostrar } = lerOpcaoDeLogo(v);
    const html = ehHtml(conteudo);
    setFormato(html ? "html" : "texto"); setBody(html ? "" : conteudo); setBodyHtml(html ? conteudo : "");
    setLogoNo((p) => ({ ...p, [html ? "html" : "texto"]: mostrar }));
  };
  const corDaTela = () => getComputedStyle(document.documentElement).getPropertyValue("--color-primary-blue").trim();
  const marca = { nome: activeTenantName || "Sua empresa", cor: corDaTela(), logo: appSettings?.empresa_dados?.logoUrl ?? null };
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
    setOpen(false); setReenvio(null); setVendo(null); setEditando(null);
    // O que estava sendo escrito é de uma empresa: não passa para outra.
    setName(""); setSubject(""); setSubjectB(""); setBody(""); setBodyHtml(""); setFormato("texto"); setModeloId(""); setAgendarPara(""); setLogoNo({ texto: true, html: false });
    if (activeTenantId) void load();
  }, [activeTenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prévia do público ao mudar os filtros.
  useEffect(() => {
    if (!open || editando) return;
    setPreviewing(true);
    const t0 = activeTenantId;
    const t = setTimeout(() => {
      apiFetchTenant("/api/email-campaigns/audience-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience }) })
        .then(json).then((p) => { if (tenantRef.current === t0) setPreview(p); }).catch(() => setPreview(null)).finally(() => setPreviewing(false));
    }, 350);
    return () => clearTimeout(t);
  }, [open, editando, activeTenantId, sources, statuses, canais, campanhas, inclLeads, inclClientes, inclContatos, inclEquipe, manual, excluir]); // eslint-disable-line react-hooks/exhaustive-deps


  const create = async () => {
    setCreating(true);
    try {
      const r = await apiFetchTenant("/api/email-campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, subject, body: corpo, audience, rastrear, ...(subjectB.trim() ? { subjectB: subjectB.trim() } : {}), ...(agendarPara ? { agendarPara } : {}) }) }).then(json);
      toast.success(agendarPara ? `Campanha agendada para ${agendarPara.split("-").reverse().join("/")} (${r.total} destinatário(s)). Envie um teste para você antes.` : `Campanha criada com ${r.total} destinatário(s). Envie um teste para você antes de disparar.`);
      setOpen(false); limparFormulario();
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setCreating(false); }
  };

  const limparFormulario = () => {
    setEditando(null); setName(""); setSubject(""); setSubjectB(""); setBody(""); setBodyHtml(""); setFormato("texto"); setLogoNo({ texto: true, html: false }); setModeloId(""); setAgendarPara(""); setRastrear(true);
    setSources([]); setStatuses([]); setCanais([]); setCampanhas([]); setManual([]); setManualText(""); setFileName(""); setExcluir([]); setShowList(false);
    setInclLeads(true); setInclClientes(false); setInclContatos(false); setInclEquipe(false);
  };
  const novaCampanha = () => { if (editando) limparFormulario(); setOpen(true); };
  const fecharFormulario = () => { setOpen(false); if (editando) limparFormulario(); };
  const editar = async (c: Campaign) => {
    try {
      const r = await apiFetchTenant(`/api/email-campaigns/${c.id}`).then(json);
      limparFormulario(); setEditando(c); setName(r.name); setSubject(r.subject); setSubjectB(r.subjectB || ""); abrirCorpo(r.body); setRastrear(r.rastrear !== false);
      setReenvio(null); setOpen(true);
    } catch (e: any) { toast.error(e.message); }
  };
  const salvarEdicao = async (depoisReenviar: boolean) => {
    if (!editando) return; setSalvando(true);
    try {
      await apiFetchTenant(`/api/email-campaigns/${editando.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, subject, body: corpo, subjectB: subjectB.trim(), rastrear }) }).then(json);
      const atualizada = { ...editando, name: name.trim(), subject: subject.trim(), subject_b: subjectB.trim() || null, sem_rastreio: !rastrear };
      toast.success("Campanha atualizada.");
      setOpen(false); limparFormulario(); await load();
      if (depoisReenviar) setReenvio(atualizada);
    } catch (e: any) { toast.error(e.message); } finally { setSalvando(false); }
  };

  const test = async (c: Campaign) => {
    const aviso = toast.loading("Enviando o teste…");
    try {
      const r = await apiFetchTenant(`/api/email-campaigns/${c.id}/test`, { method: "POST" }).then(json);
      toast.success(`Teste enviado para ${r.to}.`, { id: aviso, duration: 15000, description: `O servidor de e-mail aceitou a mensagem. Não chegou em alguns minutos? Procure no spam e na aba Promoções${options?.sender.from ? ` e veja se voltou uma recusa para ${options.sender.from}` : ""}.` });
    } catch (e: any) { toast.error(e.message, { id: aviso }); }
  };

  /** Reenvia a própria campanha para o grupo ou as pessoas escolhidas. */
  const reenviarNaCampanha = async (c: Campaign, corpoPedido: { quem: string; emails?: string[]; subject?: string; rastrear?: boolean }) => {
    if (running) { toast.error("Espere o envio atual terminar (ou pause)."); return false; }
    try {
      const r = await apiFetchTenant(`/api/email-campaigns/${c.id}/reenviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoPedido) }).then(json);
      toast.success(`${r.requeued} envio(s) na fila.`);
      setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "sending", agendada_para: null } : x)));
      void run({ ...c, status: "sending" });
      return true;
    } catch (e: any) {
      if (!semRede(e)) { toast.error(e.message); return false; }
      // O pedido pode ter chegado antes de a conexão cair: não incentive um segundo reenvio.
      toast.warning("A conexão caiu durante o reenvio. Antes de tentar de novo, veja se a campanha aparece como Enviando: se sim, já está na fila.", { duration: 15000 });
      void load();
      return false;
    }
  };
  const reenviarSelecionados = async (c: Campaign, emails: string[]) => {
    if (!(await confirmDialog({ title: "Reenviar?", description: emails.length === 1 ? `"${c.subject}" vai de novo para ${emails[0]}.` : `"${c.subject}" vai de novo para ${emails.length} pessoas.`, confirmLabel: "Reenviar" }))) return false;
    return reenviarNaCampanha(c, { quem: "selecionados", emails });
  };
  const excluirCampanhas = async (lista: Campaign[]) => {
    const uma = lista.length === 1;
    if (!(await confirmDialog({ title: uma ? "Excluir campanha?" : `Excluir ${lista.length} campanhas?`, description: `${uma ? `"${lista[0].name}" sai` : "Elas saem"} da lista e o que ainda não foi enviado não será enviado. Quem já recebeu não é afetado.`, confirmLabel: "Excluir", variant: "danger" }))) return false;
    let falhou = 0;
    for (const c of lista) {
      try { await apiFetchTenant(`/api/email-campaigns/${c.id}`, { method: "DELETE" }).then(json); setCampaigns((prev) => prev.filter((x) => x.id !== c.id)); }
      catch (e: any) { falhou++; toast.error(`${c.name}: ${e.message}`); }
    }
    if (lista.length > falhou) toast.success(lista.length - falhou === 1 ? "Campanha excluída." : `${lista.length - falhou} campanhas excluídas.`);
    await load();
    return falhou === 0;
  };

  const run = async (c: Campaign) => {
    stopRef.current = false; setRunning(c.id);
    try {
      for (let quedas = 0; ;) {
        let r: any;
        try { r = await apiFetchTenant(`/api/email-campaigns/${c.id}/send-batch`, { method: "POST" }).then(json); quedas = 0; }
        catch (e) { // conexão caiu: pedir de novo é seguro (o servidor nunca pega a mesma pessoa duas vezes)
          if (!semRede(e) || stopRef.current || ++quedas > 4) throw e;
          await new Promise((ok) => setTimeout(ok, 2000 * quedas));
          continue;
        }
        setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, sent: r.sent, failed: r.failed, status: r.status } : x)));
        if (r.cota) { toast.warning(r.cota.porHora ? `Ritmo de ${r.cota.porHora} e-mails por hora atingido. O restante sai sozinho na próxima hora.` : `Limite de ${r.cota.limite} e-mails em 24h atingido${r.cota.proprio ? "" : " (SMTP da plataforma — cadastre o seu em Integrações → SMTP para enviar mais)"}. O restante sai sozinho quando liberar.`, { duration: 12000 }); break; }
        if (r.done) { toast.success(`Envio concluído: ${r.sent} enviado(s), ${r.failed} falha(s).`); break; }
        if (stopRef.current) { toast.info("Envio pausado. Você pode retomar quando quiser."); break; }
        if (r.aguardando) { toast.info(`${r.pending} envio(s) na espera. Saem sozinhos, não precisa manter a página aberta.`, { duration: 12000 }); break; }
      }
    } catch (e: any) {
      if (semRede(e)) toast.warning("A conexão caiu. O que está na fila continua saindo sozinho em até 5 minutos.", { duration: 12000 });
      else toast.error(`${e.message} — o envio pode ser retomado.`);
    }
    finally { setRunning(null); void load(); }
  };

  const send = async (c: Campaign) => {
    if (!(await confirmDialog({ title: "Disparar campanha?", description: `Vai enviar "${c.subject}" para ${c.total} pessoa(s). Pode fechar a página: o que faltar continua saindo sozinho.`, confirmLabel: "Enviar agora" }))) return;
    void run(c);
  };

  const pausar = (c: Campaign) => {
    stopRef.current = true; // fica gravado também no servidor, para a rotina automática não continuar o envio
    void apiFetchTenant(`/api/email-campaigns/${c.id}/pausar`, { method: "POST" }).then(json).catch((e: any) => toast.error(`Não foi possível pausar: ${e.message}`));
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
    const csv = ["E-mail;Data;Motivo", ...(descItens || []).map((d) => `${d.email};${new Date(d.created_at).toLocaleDateString("pt-BR")};${d.motivo === "invalido" ? "Endereço inexistente" : "Descadastro"}`)].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "descadastrados.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const usarModelo = (id: string) => {
    setModeloId(id);
    const m = modelos.find((x) => x.id === id);
    if (m) { setSubject(m.assunto); abrirCorpo(m.corpo); if (!name.trim()) setName(m.nome); }
  };
  const salvarModelo = async () => {
    if (!subject.trim() || !corpo.trim()) { toast.error("Preencha o assunto e o conteúdo antes de salvar como modelo."); return; }
    const nome = (name.trim() || subject.trim()).slice(0, 60);
    const existente = modelos.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
    const novo = { id: existente?.id ?? crypto.randomUUID(), nome, assunto: subject.trim().slice(0, 200), corpo: corpo.trim().slice(0, ehHtml(corpo) ? MAX_HTML : MAX_TEXTO) };
    const lista = [...modelos.filter((x) => x.id !== novo.id), novo].slice(-30);
    // Os modelos carregam junto com as configurações da empresa: o conjunto tem um teto.
    if (JSON.stringify(lista).length > 1_500_000) { toast.error("Os modelos salvos ficaram grandes demais. Exclua algum que não usa mais antes de salvar este."); return; }
    await saveAppSetting("email_modelos", lista);
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
      limparFormulario(); setName(`${r.name} (cópia)`.slice(0, 120)); setSubject(r.subject); abrirCorpo(r.body); setRastrear(r.rastrear !== false); setOpen(true);
    } catch (e: any) { toast.error(e.message); }
  };

  const canCreate = name.trim() && subject.trim() && corpo.trim() && (preview?.total ?? 0) > 0 && !creating && !previewing;
  const falta = [!name.trim() && "nome", !subject.trim() && "assunto", !corpo.trim() && "conteúdo", !(preview?.total ?? 0) && "público"].filter(Boolean) as string[];

  return (
    <PageContainer
      title="E-mail em massa"
      description="Envie um e-mail para leads, clientes, contatos, equipe ou uma lista própria (colada ou de planilha) — com ou sem cadastro no sistema — com descadastro automático."
      actions={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setSeqAberto(true)} className="h-9 px-3 text-xs">Sequências</Button><Button variant="outline" onClick={() => void abrirDescadastros()} className="h-9 px-3 text-xs">Descadastrados</Button><Button variant="outline" onClick={() => void load()} className="h-9 px-3 text-xs gap-1.5"><RefreshCw className="w-3.5 h-3.5" /></Button><Button onClick={novaCampanha} className="h-9 px-4 text-xs font-bold gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova campanha</Button></div>}
    >
      <div className="space-y-4 max-w-[1500px]">
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
          ) : (
            <CampanhasEmail key={activeTenantId ?? ""} campanhas={campaigns} enviando={running} acoes={{
              disparar: (c) => void send(c), retomar: (c) => void run(c), pausar: (c) => pausar(c),
              reenviar: setReenvio, destinatarios: setVendo, testar: (c) => void test(c), editar: (c) => void editar(c),
              duplicar: (c) => void duplicar(c), exportar: (c) => void exportar(c), cancelar: (c) => void cancel(c), excluir: excluirCampanhas,
            }} />
          )}
      </div>

      <DestinatariosDaCampanha campanha={vendo} api={apiFetchTenant} remetente={options?.sender.from ?? null} onFechar={() => setVendo(null)} onReenviar={reenviarSelecionados} />
      <ReenviarCampanha campanha={reenvio} onFechar={() => setReenvio(null)} onEditar={(c) => void editar(c)}
        onConfirmar={(c, quem, mudancas) => reenviarNaCampanha(c, { quem, ...mudancas })} />

      {/* A chave recomeça o formulário ao trocar de empresa: nada de uma passa para outra. */}
      <SequenciasEmail key={activeTenantId ?? ""} open={seqAberto} onClose={() => setSeqAberto(false)} api={apiFetchTenant} marca={marca}
        enviarImagem={(arquivo) => enviarImagemDeEmail(activeTenantId || "", arquivo)} />
      <Modal isOpen={descAberto} onClose={() => setDescAberto(false)} title="Descadastrados" description="Quem pediu para sair nunca mais recebe campanhas: o sistema pula essas pessoas em qualquer envio. Esta lista não pode ser desfeita por aqui." maxWidth="max-w-lg">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={descNovo} onChange={(e) => setDescNovo(e.target.value)} placeholder="Bloquear um e-mail à mão" className="flex-1 h-9 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" />
            <Button onClick={() => void bloquearEmail()} disabled={!descNovo.trim()} className="h-9 px-3 text-xs">Bloquear</Button>
          </div>
          {descItens === null ? <Loader2 className="w-4 h-4 animate-spin" /> : descItens.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">Ninguém se descadastrou ainda.</p> : (<>
            <div className="flex items-center justify-between text-xs"><b className="text-[var(--color-text-primary)]">{descItens.length.toLocaleString("pt-BR")} pessoa(s)</b><Button variant="outline" onClick={exportarDescadastros} className="h-8 px-3 text-xs">Exportar planilha</Button></div>
            <ul className="max-h-72 overflow-auto divide-y divide-[var(--color-border-default)] text-xs">{descItens.slice(0, 300).map((d) => <li key={d.email} className="flex justify-between py-1.5"><span className="text-[var(--color-text-primary)] break-all">{d.email}{d.motivo === "invalido" && <span className="ml-2 text-[10px] text-[var(--color-text-faint)]">(endereço inexistente)</span>}</span><span className="text-[var(--color-text-muted)] shrink-0 ml-3">{new Date(d.created_at).toLocaleDateString("pt-BR")}</span></li>)}</ul>
            {descItens.length > 300 && <p className="text-[11px] text-[var(--color-text-muted)]">Mostrando os 300 mais recentes. A planilha tem todos.</p>}
          </>)}
        </div>
      </Modal>

      <Modal isOpen={open} onClose={() => !creating && !salvando && fecharFormulario()} closeOnBackdrop={false} title={editando ? "Editar campanha" : "Nova campanha de e-mail"} maxWidth="max-w-6xl"
        footer={editando ? <>
          <span className="mr-auto text-[11px] text-[var(--color-text-faint)]">Quem recebe não muda. A alteração vale no próximo envio.</span>
          <Button variant="outline" onClick={fecharFormulario} disabled={salvando} className="h-9 px-4 text-xs">Cancelar</Button>
          {(editando.status === "done" || editando.status === "cancelled") && <Button variant="outline" onClick={() => void salvarEdicao(true)} disabled={salvando || !name.trim() || !subject.trim() || !corpo.trim()} className="h-9 px-4 text-xs font-bold">Salvar e reenviar</Button>}
          <Button onClick={() => void salvarEdicao(false)} disabled={salvando || !name.trim() || !subject.trim() || !corpo.trim()} className="h-9 px-5 text-xs font-bold gap-1.5">{salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar alterações</Button>
        </> : <>
          {!canCreate && !creating && falta.length > 0 && <span className="mr-auto text-[11px] text-[var(--color-text-faint)]">Para criar, falta: {falta.join(", ")}.</span>}
          <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--color-text-muted)]" title="Sai sozinha a partir das 9h do dia escolhido">Enviar em (9h)
            <input type="date" value={agendarPara} min={new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)} onChange={(e) => setAgendarPara(e.target.value)} className="h-9 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" />
            <HelpTip label="Agendamento">Deixe em branco para disparar você mesmo quando quiser. Com uma data, a campanha sai sozinha no envio automático das 10h (Brasília) desse dia, mesmo com o sistema fechado. Você ainda pode enviar antes pelo botão.</HelpTip>
          </label>
          <Button variant="outline" onClick={fecharFormulario} disabled={creating} className="h-9 px-4 text-xs">Cancelar</Button>
          <Button onClick={() => void create()} disabled={!canCreate} className="h-9 px-5 text-xs font-bold gap-1.5">{creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {agendarPara ? "Agendar campanha" : "Criar campanha"}</Button>
        </>}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] items-start">
          <div className="space-y-5 min-w-0">
          <Etapa numero={1} titulo="Campanha">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Nome (só para você)
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ex.: Aviso Treinão 14/11" className="h-9 px-3 rounded-xl text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /></label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Assunto
                <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Ex.: {{primeiro_nome}}, sua vaga está confirmada" className="h-9 px-3 rounded-xl text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /></label>
            </div>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Assunto B (opcional, teste A/B)
              <input value={subjectB} onChange={(e) => setSubjectB(e.target.value)} maxLength={200} placeholder="Preencha para testar outro assunto: metade recebe o A e metade o B" className="h-9 px-3 rounded-xl text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /></label>
            <OpcaoDeContagem ligada={rastrear} onMudar={setRastrear} />
          </Etapa>

          <Etapa numero={2} titulo="Conteúdo">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-2.5 text-[11px] font-bold text-[var(--color-text-muted)]">
              <span>Modelos da empresa</span>
              <select aria-label="Modelo salvo" value={modeloId} onChange={(e) => usarModelo(e.target.value)} className="h-8 flex-1 min-w-[160px] px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]">
                <option value="">{modelos.length ? "Escolher um modelo salvo…" : "Nenhum modelo salvo ainda"}</option>
                {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}{ehHtml(m.corpo) ? " · HTML" : " · texto"}</option>)}
              </select>
              <Button type="button" variant="outline" onClick={() => void salvarModelo()} disabled={!subject.trim() || !corpo.trim()} title="Guarda o assunto e o conteúdo para reaproveitar. Usa o nome da campanha como nome do modelo." className="h-8 px-3 text-xs">Salvar como modelo</Button>
              {modeloId && <Button type="button" variant="ghost" onClick={() => void excluirModelo()} className="h-8 px-2 text-xs text-[var(--color-danger)]">Excluir</Button>}
            </div>
            <EditorConteudoEmail key={activeTenantId ?? ""} formato={formato} onFormato={setFormato} texto={body} onTexto={setBody} html={bodyHtml} onHtml={setBodyHtml} assunto={subject} marca={marca}
              mostrarLogo={logoNo[formato]} onMostrarLogo={(v) => setLogoNo((p) => ({ ...p, [formato]: v }))} enviarImagem={(arquivo) => enviarImagemDeEmail(activeTenantId || "", arquivo)} />
          </Etapa>

          {!editando && (
          <Etapa numero={3} titulo="Quem recebe" ajuda="Pode ser gente que está no sistema ou não: marque as fontes e/ou use uma lista própria.">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--color-text-primary)]">
              {([["Leads", inclLeads, setInclLeads], ["Clientes", inclClientes, setInclClientes], ["Contatos das empresas", inclContatos, setInclContatos], ["Equipe (usuários do sistema)", inclEquipe, setInclEquipe]] as const).map(([l, v, set]) => (
                <label key={l} className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {l}</label>))}
            </div>
            {inclLeads && <p className="text-[11px] text-[var(--color-text-muted)]">Leads: sem nada marcado, entram todos com e-mail. Marque para filtrar.</p>}
            {inclLeads && options && (
              <FiltrosDoPublico grupos={[
                { titulo: "Origem", opcoes: options.sources, marcados: sources, onMarcados: setSources, vazio: "(sem origem)" },
                { titulo: "Status", opcoes: options.statuses, marcados: statuses, onMarcados: setStatuses },
                { titulo: "Canal", opcoes: options.canais ?? [], marcados: canais, onMarcados: setCanais },
                { titulo: "Campanha", opcoes: options.campanhas ?? [], marcados: campanhas, onMarcados: setCampanhas },
              ]} />
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
              {/* Enquanto recalcula, a lista continua na tela (não some nem volta ao topo a cada retirada). */}
              {previewing && !preview ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando…</span>
                : preview ? <><b className="text-[var(--color-text-primary)] text-sm">{preview.total.toLocaleString("pt-BR")}</b> destinatário(s){previewing && <Loader2 className="inline w-3.5 h-3.5 ml-1 align-text-bottom animate-spin" />}{preview.repetidos + preview.descadastrados + preview.semEmail > 0 && <> · fora da lista: {preview.repetidos} repetido(s), {preview.descadastrados} descadastrado(s), {preview.semEmail} com e-mail inválido</>}
                  {!!preview.excluidos && <> · {preview.excluidos} retirado(s) por você</>}
                  {(preview.sample.length > 0 || excluir.length > 0) && (
                    <div className="mt-1.5">
                      <button type="button" onClick={() => setShowList((v) => !v)} className="font-bold text-[var(--color-primary-blue)] bg-transparent border-none cursor-pointer p-0">{showList ? "Ocultar lista" : "Ver e retirar destinatários"}</button>
                      {excluir.length > 0 && <button type="button" onClick={() => setExcluir([])} className="ml-3 font-bold text-[var(--color-text-muted)] bg-transparent border-none cursor-pointer p-0">Desfazer retiradas ({excluir.length})</button>}
                      {showList && <ListaDeDestinatarios itens={preview.sample.filter((s) => !excluir.includes(s.email))} onRetirar={(emails) => setExcluir((p) => [...new Set([...p, ...emails])])} />}
                      {showList && preview.total > preview.sample.length && <p className="mt-1">Mostrando os {preview.sample.length} primeiros de {preview.total}. Ao retirar, os próximos aparecem.</p>}
                    </div>)}</>
                  : "Não foi possível calcular o público."}
            </div>
          </Etapa>
          )}
          </div>
          <div className="lg:sticky lg:top-0 min-w-0">
            <PreviaEmail assunto={subject} corpo={corpo} api={apiFetchTenant} />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
