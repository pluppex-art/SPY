import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Plus, Send, Loader2, FlaskConical, XCircle, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Modal } from "../../components/ui/modal";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { apiFetch } from "../../lib/apiClient";
import { readTableFile } from "../../lib/tableFile";
import { EMAIL_IN_TEXT, parseManualText } from "../../lib/importer";
import { FileSpreadsheet } from "lucide-react";

// Disparo de e-mail em massa: monta o público a partir dos leads da empresa (por origem/status), cria a campanha
// e envia em lotes com progresso. Sai pelo SMTP da empresa (Integrações → SMTP) ou, sem ele, pelo da plataforma.

interface Campaign { id: string; name: string; subject: string; status: string; total: number; sent: number; failed: number; sender: string | null; created_at: string }
interface Option { value: string; count: number }
interface Options { sources: Option[]; statuses: Option[]; sender: { kind: "tenant" | "platform"; from?: string } }
interface Preview { total: number; semEmail: number; descadastrados: number; repetidos: number; sample: { name: string; email: string }[] }

const STATUS_LABEL: Record<string, string> = { ready: "Pronta para enviar", sending: "Enviando", done: "Concluída", cancelled: "Cancelada" };

const json = async (r: Response) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || "Falha na requisição."); return b; };

export default function MarketingEmail() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [check, setCheck] = useState<{ kind: string; host?: string; port?: number; encryption?: string; fromDomain?: string; verified: boolean; error?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const verifySender = async () => {
    setChecking(true);
    try { setCheck(await apiFetch("/api/email-campaigns/sender-check").then(json)); } catch (e: any) { toast.error(e.message); } finally { setChecking(false); }
  };
  const stopRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [inclLeads, setInclLeads] = useState(true);
  const [inclClientes, setInclClientes] = useState(false);
  const [inclContatos, setInclContatos] = useState(false);
  const [inclEquipe, setInclEquipe] = useState(false);
  const [manual, setManual] = useState<{ email: string; name: string }[]>([]);
  const [manualText, setManualText] = useState("");
  const [fileName, setFileName] = useState("");
  const audience = { leads: inclLeads, clientes: inclClientes, contatos: inclContatos, equipe: inclEquipe, sources, statuses, manual };

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

  const load = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([apiFetch("/api/email-campaigns").then(json), apiFetch("/api/email-campaigns/audience-options").then(json)]);
      setCampaigns(c.campaigns || []); setOptions(o);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Prévia do público ao mudar os filtros.
  useEffect(() => {
    if (!open) return;
    setPreviewing(true);
    const t = setTimeout(() => {
      apiFetch("/api/email-campaigns/audience-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience }) })
        .then(json).then(setPreview).catch(() => setPreview(null)).finally(() => setPreviewing(false));
    }, 350);
    return () => clearTimeout(t);
  }, [open, sources, statuses, inclLeads, inclClientes, inclContatos, inclEquipe, manual]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const create = async () => {
    setCreating(true);
    try {
      const r = await apiFetch("/api/email-campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, subject, body, audience }) }).then(json);
      toast.success(`Campanha criada com ${r.total} destinatário(s). Envie um teste para você antes de disparar.`);
      setOpen(false); setName(""); setSubject(""); setBody(""); setSources([]); setStatuses([]); setManual([]); setManualText(""); setFileName(""); setInclLeads(true); setInclClientes(false); setInclContatos(false); setInclEquipe(false);
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setCreating(false); }
  };

  const test = async (c: Campaign) => {
    try {
      const r = await apiFetch(`/api/email-campaigns/${c.id}/test`, { method: "POST" }).then(json);
      toast.success(`Teste enviado para ${r.to}. Confira a caixa de entrada e o spam.`);
    } catch (e: any) { toast.error(e.message); }
  };

  const run = async (c: Campaign) => {
    stopRef.current = false; setRunning(c.id);
    try {
      for (;;) {
        const r = await apiFetch(`/api/email-campaigns/${c.id}/send-batch`, { method: "POST" }).then(json);
        setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, sent: r.sent, failed: r.failed, status: r.status } : x)));
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

  const cancel = async (c: Campaign) => {
    if (!(await confirmDialog({ title: "Cancelar campanha?", description: "Quem ainda não recebeu não receberá. O que já foi enviado não volta.", confirmLabel: "Cancelar campanha", variant: "danger" } as any))) return;
    stopRef.current = true;
    try { await apiFetch(`/api/email-campaigns/${c.id}/cancel`, { method: "POST" }).then(json); await load(); } catch (e: any) { toast.error(e.message); }
  };

  const canCreate = name.trim() && subject.trim() && body.trim() && (preview?.total ?? 0) > 0 && !creating;

  return (
    <PageContainer
      title="E-mail em massa"
      description="Envie um e-mail para leads, clientes, contatos, equipe ou uma lista própria (colada ou de planilha) — com ou sem cadastro no sistema — com descadastro automático."
      actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void load()} className="h-9 px-3 text-xs gap-1.5"><RefreshCw className="w-3.5 h-3.5" /></Button><Button onClick={() => setOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova campanha</Button></div>}
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
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">{STATUS_LABEL[c.status] || c.status}</span>
                </div>
                <div>
                  <div className="h-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden"><div className="h-full bg-[var(--color-primary-blue)] transition-all" style={{ width: `${pct}%` }} /></div>
                  <p className="text-[11px] mt-1 text-[var(--color-text-muted)]">{c.sent} enviado(s) de {c.total}{c.failed > 0 && <span className="text-[var(--color-danger)]"> · {c.failed} falha(s)</span>}</p>
                </div>
                {active && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void test(c)} disabled={running === c.id} className="h-8 px-3 text-xs gap-1.5"><FlaskConical className="w-3.5 h-3.5" /> Enviar teste para mim</Button>
                    {running === c.id
                      ? <Button variant="outline" onClick={() => { stopRef.current = true; }} className="h-8 px-3 text-xs gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando… (pausar)</Button>
                      : <Button onClick={() => void (c.status === "sending" ? run(c) : send(c))} className="h-8 px-3 text-xs font-bold gap-1.5"><Send className="w-3.5 h-3.5" /> {c.status === "sending" ? "Retomar envio" : "Disparar"}</Button>}
                    <Button variant="outline" onClick={() => void cancel(c)} className="h-8 px-3 text-xs gap-1.5 text-[var(--color-danger)]"><XCircle className="w-3.5 h-3.5" /> Cancelar</Button>
                  </div>
                )}
              </Card>
            );
          })}
      </div>

      <Modal isOpen={open} onClose={() => !creating && setOpen(false)} title="Nova campanha de e-mail" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Nome (só para você)
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ex.: Aviso Treinão 14/11" className="h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /></label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Assunto
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Ex.: {{primeiro_nome}}, sua vaga no Treinão está confirmada" className="h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /></label>
          </div>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Mensagem
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={20000} placeholder={"Olá {{primeiro_nome}},\n\nO Treinão acontece neste sábado, dia 14, às 9h...\n\nTe esperamos!"} className="px-2 py-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] resize-y" />
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
            <div className="space-y-1.5 p-3 rounded-xl border border-dashed border-[var(--color-border-default)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[var(--color-text-muted)]">Lista própria (não precisa estar no sistema)</span>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-primary-blue)] cursor-pointer"><FileSpreadsheet className="w-3.5 h-3.5" /> Carregar planilha
                  <input type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => { void onSheet(e.target.files?.[0]); e.target.value = ""; }} /></label>
              </div>
              <textarea value={manualText} onChange={(e) => onManualText(e.target.value)} rows={3} placeholder={"Cole e-mails, um por linha. Pode ser:\nana@email.com\nBruno Alves, bruno@email.com"} className="w-full px-2 py-1.5 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] resize-y" />
              {(fileName || manual.length > 0) && <p className="text-[11px] text-[var(--color-text-muted)]">{fileName || `${manual.length} e-mail(s) colado(s)`} — a planilha só precisa ter uma coluna com e-mail (e, se quiser, uma "Nome").</p>}
            </div>
            <div className="p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)]">
              {previewing ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando…</span>
                : preview ? <><b className="text-[var(--color-text-primary)] text-sm">{preview.total.toLocaleString("pt-BR")}</b> destinatário(s){preview.repetidos + preview.descadastrados + preview.semEmail > 0 && <> · fora da lista: {preview.repetidos} repetido(s), {preview.descadastrados} descadastrado(s), {preview.semEmail} com e-mail inválido</>}
                  {preview.sample.length > 0 && <div className="mt-1 truncate">Ex.: {preview.sample.map((s) => s.email).join(", ")}</div>}</>
                  : "Não foi possível calcular o público."}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={creating} className="h-9 px-4 text-xs">Cancelar</Button>
            <Button onClick={() => void create()} disabled={!canCreate} className="h-9 px-5 text-xs font-bold gap-1.5">{creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Criar campanha</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
