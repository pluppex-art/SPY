import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareOff, RefreshCw, Loader2, Smartphone } from "lucide-react";
import { Button } from "../button";
import { EmptyState } from "../empty-state";
import { supabase } from "../../../lib/supabase";
import { useData } from "../../../contexts/DataContext";
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
  const fimRef = useRef<HTMLDivElement>(null);
  const primeiraCarga = useRef(true);

  const fone = digits(lead?.phone_digits || lead?.phone);
  const chave = fone.length >= 8 ? fone.slice(-8) : "";

  const carregar = useCallback(async (antesDe?: string) => {
    if (!supabase || !chave) { setLoading(false); return; }
    setLoading(true);
    setErro(null);
    try {
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
  }, [chave]);

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

  const nomeDoVendedor = (instId: string | null) => {
    const inst = instId ? instancias[instId] : null;
    const colab = inst?.colaboradorId ? (colaboradores || []).find((c: any) => c.id === inst.colaboradorId) : null;
    return colab?.nome || inst?.name || lead?.seller || "Vendedor";
  };

  const vendedores = useMemo(
    () => [...new Set(msgs.filter((m) => m.sender !== "contact").map((m) => nomeDoVendedor(m.whatsapp_instance_id)))],
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
        <EmptyState icon={MessageSquareOff} title="Nenhuma conversa encontrada" description="Não há mensagens de WhatsApp registradas com o telefone deste lead." className="h-60" />
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
                    {doVendedor && <p className="text-[9px] font-black uppercase tracking-wider opacity-70 mb-0.5">{nomeDoVendedor(m.whatsapp_instance_id)}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.text || <em className="opacity-60">[mídia ou mensagem sem texto]</em>}</p>
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
