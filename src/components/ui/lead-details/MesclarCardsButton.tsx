import { useEffect, useState } from "react";
import { GitMerge, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../modal";
import { Button } from "../button";
import { supabase } from "../../../lib/supabase";
import { confirmDialog } from "../confirm-dialog";
import { friendlyError } from "../../../lib/friendlyError";
import { avisarMudancaDePessoas } from "./useLeadPessoas";

type Candidato = { id: string; name: string | null; company: string | null; phone: string | null; status: string | null };

/** Remove caracteres que quebram o filtro `or` do PostgREST. */
const limpaBusca = (v: string) => v.replace(/[,()%*\\]/g, " ").trim();

const campo =
  "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)]";

/**
 * Mesclar cards: o card aberto é o PRINCIPAL (quem entrou em contato primeiro). O card escolhido é unido a ele:
 * tudo dele passa para este card (notas, tarefas, propostas, contratos, reuniões, histórico, WhatsApp) e a pessoa dele
 * vira uma "pessoa do negócio" daqui.
 */
export function MesclarCardsButton({ lead }: { lead: any }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<Candidato[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [escolhido, setEscolhido] = useState<Candidato | null>(null);
  const [mesclando, setMesclando] = useState(false);

  useEffect(() => {
    if (!aberto || !supabase || !lead?.id || !lead?.tenant_id) return;
    const q = limpaBusca(busca);
    let vivo = true;
    setCarregando(true);
    const t = setTimeout(async () => {
      let query = supabase!.from("leads").select("id, name, company, phone, status")
        .eq("tenant_id", lead.tenant_id).is("deleted_at", null).neq("id", lead.id).limit(8);
      if (q.length >= 2) query = query.or(`name.ilike.%${q}%,company.ilike.%${q}%,phone.ilike.%${q}%`);
      else if (lead.company && String(lead.company).trim().length >= 2) query = query.ilike("company", String(lead.company).trim());
      else { if (vivo) { setLista([]); setCarregando(false); } return; }
      const { data } = await query;
      if (vivo) { setLista((data || []) as Candidato[]); setCarregando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [aberto, busca, lead?.id, lead?.tenant_id, lead?.company]);

  const fechar = () => { setAberto(false); setBusca(""); setLista([]); setEscolhido(null); };

  const mesclar = async () => {
    if (!supabase || !escolhido || !lead?.id) return;
    const ok = await confirmDialog({
      title: "Mesclar estes cards?",
      description: `"${escolhido.name || "Sem nome"}" deixa de existir como card e tudo dele passa para "${lead.name}". Esta ação não pode ser desfeita pela tela.`,
      confirmText: "Mesclar",
    });
    if (!ok) return;
    setMesclando(true);
    const { data, error } = await supabase.rpc("merge_leads", { p_target: lead.id, p_source: escolhido.id });
    setMesclando(false);
    if (error) { toast.error(error.message && /[áéíóúãõç]/i.test(error.message) ? error.message : friendlyError(error)); return; }
    toast.success(`Cards mesclados. ${(data as any)?.pessoa_criada ? `${escolhido.name || "A pessoa"} agora é uma pessoa deste card.` : ""}`.trim());
    avisarMudancaDePessoas();
    fechar();
  };

  if (!supabase) return null;

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setAberto(true)} aria-label="Mesclar cards">
        <GitMerge className="w-3.5 h-3.5 mr-1" /> Mesclar cards
      </Button>
      <Modal
        isOpen={aberto}
        onClose={fechar}
        title="Mesclar cards"
        description={`Escolha o card que será unido a "${lead?.name}". Este card, o de quem entrou em contato primeiro, é o que permanece.`}
        maxWidth="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={fechar} disabled={mesclando}>Cancelar</Button>
            <Button onClick={mesclar} disabled={!escolhido || mesclando}>{mesclando ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <GitMerge className="w-3.5 h-3.5 mr-1" />} Mesclar</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input id="mc-busca" className={campo} placeholder="Buscar por nome, empresa ou telefone" value={busca} onChange={(e) => { setBusca(e.target.value); setEscolhido(null); }} aria-label="Buscar o card a mesclar" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
            {limpaBusca(busca).length >= 2 ? "Resultados" : lead?.company ? `Cards da mesma empresa (${lead.company})` : "Digite para buscar"}
          </p>
          <ul className="list-none p-0 m-0 space-y-1.5 max-h-56 overflow-y-auto">
            {carregando && <li className="text-xs text-[var(--color-text-muted)]">Buscando…</li>}
            {!carregando && lista.length === 0 && <li className="text-xs text-[var(--color-text-muted)]">Nenhum card encontrado.</li>}
            {lista.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setEscolhido(c)}
                  aria-pressed={escolhido?.id === c.id}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-all ${escolhido?.id === c.id ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10" : "border-[var(--color-border-default)] bg-[var(--color-surface)] hover:border-[var(--color-primary-blue)]/50"}`}
                >
                  <span className="font-semibold text-[var(--color-text-primary)]">{c.name || "Sem nome"}</span>
                  <span className="block text-[var(--color-text-muted)]">{[c.company, c.phone, c.status].filter(Boolean).join(" · ") || "sem dados"}</span>
                </button>
              </li>
            ))}
          </ul>
          {escolhido && (
            <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 text-xs space-y-1.5">
              <p><strong>Permanece:</strong> {lead?.name}</p>
              <p><strong>Será unido a ele:</strong> {escolhido.name || "Sem nome"}</p>
              <p className="text-[var(--color-text-muted)]">
                Notas, tarefas, propostas, contratos, reuniões, histórico e a conversa de WhatsApp passam para este card.
                {escolhido.name || escolhido.phone ? ` ${escolhido.name || "A pessoa"} vira uma pessoa do negócio, com as notas dela na própria aba.` : ""}
                {" "}O funil, a etapa e o responsável deste card não mudam.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
