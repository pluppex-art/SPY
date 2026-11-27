/**
 * A Aurora "levanta a mão": quando o Agente Secreto ou o relógio dos prazos pede uma repescagem, aparece um pop-up com o
 * lead e o botão para chamar no WhatsApp. O vendedor só manda a mensagem; o agente acompanha a conversa e move o lead.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hand, MessageCircle, X } from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { AuroraCore } from "../ui/auroraCore/AuroraCore";
import { chamadosDaAurora, linkDoWhatsApp, saudacao } from "../../lib/metodo/regras";

export function ChamadoDaAurora() {
  const { notifications, leads, funis, markNotificationAsRead } = useData() as any;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [depois, setDepois] = useState<Set<string>>(new Set()); // "Depois": some até a página ser recarregada
  const [nota, setNota] = useState<{ lead: string; texto: string } | null>(null);
  const fila = useMemo(() => chamadosDaAurora(notifications, user?.id, leads, funis).filter((c) => !depois.has(c.aviso.id)), [notifications, user?.id, leads, funis, depois]);
  const atual = fila[0];
  const leadId: string | undefined = atual?.lead.id;

  useEffect(() => {
    if (!leadId || !supabase) return;
    let vale = true;
    supabase.from("lead_notas").select("texto").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1)
      .then(({ data }: { data: any }) => { if (vale) setNota({ lead: leadId, texto: data?.[0]?.texto ?? "" }); });
    return () => { vale = false; };
  }, [leadId, atual?.aviso.id]);

  if (!atual) return null;
  const { lead, aviso, ids } = atual;
  const whats = linkDoWhatsApp(lead.phone, saudacao(lead.name));
  const atendido = () => ids.forEach((id: string) => markNotificationAsRead(id));
  const adiar = () => setDepois((antes) => new Set([...antes, aviso.id]));
  const abrirLead = () => { adiar(); navigate(`/app/crm/pipeline?leadId=${encodeURIComponent(lead.id)}`); };
  const botao = "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold cursor-pointer";

  return (
    <div role="alertdialog" aria-label={`Aurora: ${aviso.title}`} className="fixed right-3 md:right-6 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] lg:bottom-24 z-[70] w-[calc(100vw-1.5rem)] sm:w-[360px] overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="relative shrink-0">
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[#0b1020]"><AuroraCore mode="idle" size={44} /></span>
          <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-warning text-white ring-2 ring-[var(--color-surface-elevated)]"><Hand className="w-3 h-3" /></span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">Aurora levantou a mão</p>
          <button type="button" onClick={abrirLead} title="Abrir o lead" className="block max-w-full truncate bg-transparent border-0 p-0 text-left text-sm font-black text-[var(--color-text-primary)] hover:underline cursor-pointer">{lead.name || "Lead sem nome"}</button>
        </div>
        {fila.length > 1 && <span className="shrink-0 text-[10px] font-bold text-[var(--color-text-faint)]">1 de {fila.length}</span>}
        <button type="button" onClick={adiar} aria-label="Ver depois" className="shrink-0 self-start bg-transparent border-0 p-1 text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="px-4 pt-3">
        <p className="text-xs font-bold text-[var(--color-text-primary)]">{aviso.title}</p>
        {nota?.lead === lead.id && nota.texto && <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{nota.texto}</p>}
      </div>
      <div className="flex gap-2 p-4">
        {whats
          ? <a href={whats} target="_blank" rel="noreferrer" onClick={atendido} className={`${botao} flex-1 bg-emerald-600 !text-white no-underline hover:bg-emerald-700`}><MessageCircle className="w-4 h-4" /> Chamar no WhatsApp</a>
          : <button type="button" onClick={abrirLead} className={`${botao} flex-1 border-0 bg-[var(--color-primary-blue)] !text-white`}>Abrir o lead</button>}
        <button type="button" onClick={adiar} className={`${botao} border border-[var(--color-border-default)] bg-transparent text-[var(--color-text-muted)]`}>Depois</button>
      </div>
    </div>
  );
}
