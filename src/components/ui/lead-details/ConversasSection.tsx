import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareOff, RefreshCw, Loader2, Smartphone, FileText, Mic, Film, FileDown } from "lucide-react";
import { Button } from "../button";
import { EmptyState } from "../empty-state";
import { supabase } from "../../../lib/supabase";
import { useData } from "../../../contexts/DataContext";
import { apiFetch } from "../../../lib/apiClient";
import { cn } from "../../../lib/utils";

interface ConversasSectionProps {
  lead: any;
}

interface Msg {
  id: string;
  contact_id: string;
  whatsapp_instance_id: string | null;
  text: string | null;
  sender: "contact" | "human" | string;
  created_at: string;
  /** Preenchido quando a mensagem vem do WAHA (nome do vendedor dono da sessão). */
  vendedor?: string;
  /** Mídia da mensagem (só vem do WAHA): o arquivo é baixado sob demanda pelo servidor. */
  mediaType?: "audio" | "image" | "video" | "document";
  session?: string;
  chat?: string;
}

const PAGE = 300;
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

const diaLabel = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
};
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const midiaUrl = (leadId: string, m: Msg) =>
  `/api/leads/${encodeURIComponent(leadId)}/conversa-whatsapp/midia?session=${encodeURIComponent(m.session || "")}&chat=${encodeURIComponent(m.chat || "")}&messageId=${encodeURIComponent(m.id)}`;

/** Baixa a mídia (com o token do usuário) e devolve uma URL local pra <img>/<audio>. */
function useMidia(leadId: string, m: Msg, auto: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [estado, setEstado] = useState<"idle" | "carregando" | "erro">("idle");
  const carregar = useCallback(async () => {
    if (url || estado === "carregando") return;
    setEstado("carregando");
    try {
      const r = await apiFetch(midiaUrl(leadId, m));
      if (!r.ok) throw new Error(String(r.status));
      setUrl(URL.createObjectURL(await r.blob()));
      setEstado("idle");
    } catch { setEstado("erro"); }
  }, [leadId, m, url, estado]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!auto || !ref.current) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { carregar(); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  return { url, estado, carregar, ref };
}

/** Imagem, áudio (com transcrição por IA sob demanda), vídeo e documento de uma mensagem do WhatsApp. */
function MidiaMensagem({ leadId, m, doVendedor }: { leadId: string; m: Msg; doVendedor: boolean }) {
  const { url, estado, carregar, ref } = useMidia(leadId, m, m.mediaType === "image");
  const [texto, setTexto] = useState<string | null>(null);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [erroT, setErroT] = useState("");
  const btn = cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold cursor-pointer border",
    doVendedor ? "border-white/40 bg-white/15 hover:bg-white/25 text-white" : "border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]");

  const transcrever = async () => {
    setTranscrevendo(true); setErroT("");
    try {
      const r = await apiFetch(`/api/leads/${encodeURIComponent(leadId)}/conversa-whatsapp/transcrever`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: m.session, chat: m.chat, messageId: m.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setTexto(j.texto);
    } catch (e: any) { setErroT(e?.message || "Falha ao transcrever."); }
    finally { setTranscrevendo(false); }
  };

  if (m.mediaType === "image") {
    return (
      <div ref={ref} className="mb-1">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Imagem da conversa" className="rounded-xl max-h-64 max-w-full object-cover" /></a>
        ) : (
          <div className="h-24 w-40 rounded-xl bg-black/10 flex items-center justify-center text-[10px] opacity-70">
            {estado === "erro" ? <button type="button" className={btn} onClick={carregar}>Imagem indisponível · tentar de novo</button> : <Loader2 className="w-4 h-4 animate-spin" />}
          </div>
        )}
      </div>
    );
  }
  if (m.mediaType === "audio") {
    return (
      <div className="mb-1 space-y-1.5 min-w-[220px]">
        {url ? <audio controls src={url} className="h-9 w-full max-w-[260px]" /> : (
          <button type="button" className={btn} onClick={carregar} disabled={estado === "carregando"}>
            {estado === "carregando" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />} {estado === "erro" ? "Áudio indisponível · tentar de novo" : "Ouvir áudio"}
          </button>
        )}
        {texto === null ? (
          <button type="button" className={btn} onClick={transcrever} disabled={transcrevendo}>
            {transcrevendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Transcrever
          </button>
        ) : (
          <p className="text-xs italic whitespace-pre-wrap break-words border-l-2 border-current/40 pl-2 opacity-90">“{texto}”</p>
        )}
        {erroT && <p className="text-[10px] opacity-80">{erroT}</p>}
      </div>
    );
  }
  return (
    <div className="mb-1">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className={btn}><FileDown className="w-3.5 h-3.5" /> Abrir {m.mediaType === "video" ? "vídeo" : "arquivo"}</a>
      ) : (
        <button type="button" className={btn} onClick={carregar} disabled={estado === "carregando"}>
          {estado === "carregando" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : m.mediaType === "video" ? <Film className="w-3.5 h-3.5" /> : <FileDown className="w-3.5 h-3.5" />}
          {estado === "erro" ? "Indisponível · tentar de novo" : m.mediaType === "video" ? "Carregar vídeo" : "Carregar arquivo"}
        </button>
      )}
    </div>
  );
}

/**
 * Visualização (somente leitura) da conversa de WhatsApp entre o vendedor e o
 * cliente. As mensagens vêm de chat_messages (gravadas pelo webhook da
 * instância); o vínculo com o lead é pelo telefone — só os últimos 8 dígitos
 * contam, porque o número é guardado com formatos diferentes ("+55639294-0613",
 * "5561995215212"). A visibilidade é a mesma do resto do sistema (RLS por tenant).
 */
export function ConversasSection({ lead }: ConversasSectionProps) {
  const { colaboradores } = useData() as any;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [instancias, setInstancias] = useState<Record<string, { name: string; colaboradorId: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // "waha" = lido ao vivo do WAHA (completo, inclui o que o vendedor manda pelo celular); "banco" = só o que o webhook gravou.
  // Por que o WAHA não devolveu nada (mostrado quando também não há nada salvo no banco).
  const [motivoWaha, setMotivoWaha] = useState<string>("");
  const [fonte, setFonte] = useState<"waha" | "banco">("banco");
  const fimRef = useRef<HTMLDivElement>(null);
  const primeiraCarga = useRef(true);

  const fone = digits(lead?.phone_digits || lead?.phone);
  const chave = fone.length >= 8 ? fone.slice(-8) : "";

  const carregar = useCallback(async (antesDe?: string) => {
    if (!supabase || !chave) { setLoading(false); return; }
    setLoading(true);
    setErro(null);
    try {
      // 1) WAHA ao vivo (o webhook não grava o que o vendedor envia pelo celular, então o banco é incompleto).
      if (!antesDe) setMotivoWaha("");
      if (!antesDe && lead?.id) {
        try {
          const r = await apiFetch(`/api/leads/${encodeURIComponent(lead.id)}/conversa-whatsapp`);
          if (!r.ok) {
            setMotivoWaha(r.status === 502 ? "O WAHA não respondeu (erro no gateway)." : `A consulta ao WAHA falhou (HTTP ${r.status}).`);
          } else {
            const j = await r.json();
            if (j.source === "none") {
              setMotivoWaha(
                j.reason === "waha_nao_configurado" ? "O servidor não está ligado ao WAHA (falta configurar WAHA_API_URL no deploy)."
                : j.reason === "sem_sessao_conectada" ? "Nenhuma sessão de WhatsApp conectada neste tenant."
                : j.reason === "sem_telefone" ? "Lead sem telefone válido." : "")
            } else if (j.source === "waha" && (!j.messages || j.messages.length === 0)) {
              setMotivoWaha(`O WAHA foi consultado (sessões: ${(j.sessoes || []).join(", ") || "—"}) e não há mensagens com o número ...${j.digits_final}.`);
            }
            if (j.source === "waha" && Array.isArray(j.messages) && j.messages.length > 0) {
              setFonte("waha");
              setTemMais(false);
              setMsgs(j.messages.map((m: any) => ({ id: m.id, contact_id: "", whatsapp_instance_id: null, text: m.text, sender: m.fromMe ? "human" : "contact", created_at: m.created_at, vendedor: m.vendedor, mediaType: m.mediaType, session: m.session, chat: m.chat })));
              return;
            }
          }
        } catch { /* sem WAHA: cai no banco */ }
      }
      setFonte("banco");
      // Pré-filtro no banco pelos 4 últimos dígitos (contíguos em qualquer formatação) e
      // conferência exata dos 8 últimos no cliente.
      const { data: contatos, error: eC } = await supabase
        .from("chat_contacts")
        .select("id, phone")
        .ilike("phone", `%${chave.slice(-4)}%`)
        .limit(200);
      if (eC) throw eC;
      const ids = (contatos || []).filter((c: any) => digits(c.phone).slice(-8) === chave).map((c: any) => c.id);
      if (ids.length === 0) { setMsgs([]); setTemMais(false); return; }

      let q = supabase
        .from("chat_messages")
        .select("id, contact_id, whatsapp_instance_id, text, sender, created_at")
        .in("contact_id", ids)
        .order("created_at", { ascending: false })
        .limit(PAGE + 1);
      if (antesDe) q = q.lt("created_at", antesDe);
      const { data, error } = await q;
      if (error) throw error;
      const lote = (data || []) as Msg[];
      setTemMais(lote.length > PAGE);
      const pagina = lote.slice(0, PAGE).reverse();
      setMsgs((prev) => (antesDe ? [...pagina, ...prev] : pagina));

      const instIds = [...new Set(pagina.map((m) => m.whatsapp_instance_id).filter(Boolean))] as string[];
      if (instIds.length > 0) {
        const { data: inst } = await supabase.from("whatsapp_instances").select("id, name, colaborador_id").in("id", instIds);
        setInstancias((prev) => {
          const next = { ...prev };
          (inst || []).forEach((i: any) => { next[i.id] = { name: i.name, colaboradorId: i.colaborador_id ?? null }; });
          return next;
        });
      }
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar as conversas.");
    } finally {
      setLoading(false);
    }
  }, [chave, lead?.id]);

  useEffect(() => {
    primeiraCarga.current = true;
    setMsgs([]);
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (primeiraCarga.current && msgs.length > 0) {
      fimRef.current?.scrollIntoView();
      primeiraCarga.current = false;
    }
  }, [msgs]);

  const nomeDoVendedor = (instId: string | null, direto?: string) => {
    if (direto) return direto;
    const inst = instId ? instancias[instId] : null;
    const colab = inst?.colaboradorId ? (colaboradores || []).find((c: any) => c.id === inst.colaboradorId) : null;
    return colab?.nome || inst?.name || lead?.seller || "Vendedor";
  };

  const vendedores = useMemo(
    () => [...new Set(msgs.filter((m) => m.sender !== "contact").map((m) => nomeDoVendedor(m.whatsapp_instance_id, m.vendedor)))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [msgs, instancias, colaboradores],
  );

  if (!chave) {
    return (
      <div className="px-5 py-4">
        <EmptyState icon={MessageSquareOff} title="Lead sem telefone" description="Cadastre o telefone do lead para ver as conversas de WhatsApp." className="h-60" />
      </div>
    );
  }

  let diaAtual = "";
  return (
    <div className="px-5 py-4 space-y-3 animate-in fade-in duration-200">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)]">Conversas · WhatsApp</h4>
          <p className="text-[11px] text-[var(--color-text-muted)] truncate flex items-center gap-1">
            <Smartphone className="w-3 h-3 shrink-0" />
            {vendedores.length > 0 ? `Vendedor: ${vendedores.join(", ")}` : "Somente leitura"}
            <span className={fonte === "waha" ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400 font-bold"}>· {fonte === "waha" ? "WAHA ao vivo" : "Histórico salvo (pode estar incompleto)"}</span>
            {msgs.length > 0 && <span className="text-[var(--color-text-faint)]">· {msgs.length}{temMais ? "+" : ""} mensagens</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[11px] font-bold shrink-0" onClick={() => carregar()} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Atualizar
        </Button>
      </div>

      {erro ? (
        <EmptyState icon={MessageSquareOff} title="Erro ao carregar" description={erro} className="h-60" />
      ) : loading && msgs.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando conversas…
        </div>
      ) : msgs.length === 0 ? (
        <EmptyState icon={MessageSquareOff} title="Nenhuma conversa encontrada" description={motivoWaha || "Não há mensagens de WhatsApp registradas com o telefone deste lead."} className="h-60" />
      ) : (
        <div className="max-h-[55vh] overflow-y-auto bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3.5 space-y-2">
          {temMais && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" disabled={loading} onClick={() => carregar(msgs[0]?.created_at)}>
                Carregar mensagens anteriores
              </Button>
            </div>
          )}
          {msgs.map((m) => {
            const dia = diaLabel(m.created_at);
            const separador = dia !== diaAtual;
            diaAtual = dia;
            const doVendedor = m.sender !== "contact";
            return (
              <div key={m.id}>
                {separador && (
                  <div className="flex justify-center my-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] px-2.5 py-0.5 rounded-full">{dia}</span>
                  </div>
                )}
                <div className={cn("flex", doVendedor ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "px-3 py-2 rounded-2xl text-xs max-w-[82%] leading-relaxed",
                      doVendedor
                        ? "bg-[var(--color-primary-blue)] text-white rounded-tr-none"
                        : "bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] rounded-tl-none shadow-sm",
                    )}
                  >
                    {doVendedor && <p className="text-[9px] font-black uppercase tracking-wider opacity-70 mb-0.5">{nomeDoVendedor(m.whatsapp_instance_id, m.vendedor)}</p>}
                    {m.mediaType && lead?.id && <MidiaMensagem leadId={lead.id} m={m} doVendedor={doVendedor} />}
                    {(m.text || !m.mediaType) && <p className="whitespace-pre-wrap break-words">{m.text || <em className="opacity-60">[mensagem sem texto]</em>}</p>}
                    <span className="text-[9px] opacity-60 block mt-1 text-right">{hora(m.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={fimRef} />
        </div>
      )}
    </div>
  );
}
