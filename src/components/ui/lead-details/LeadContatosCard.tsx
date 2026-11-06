import { useCallback, useEffect, useState } from "react";
import { Users, Plus, Pencil, Trash2, Phone, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../card";
import { Button } from "../button";
import { supabase } from "../../../lib/supabase";
import { confirmDialog } from "../confirm-dialog";
import { friendlyError } from "../../../lib/friendlyError";
import { avisarMudancaDePessoas } from "./useLeadPessoas";
import { MesclarCardsButton } from "./MesclarCardsButton";

type Pessoa = { id: string; nome: string | null; telefone: string; papel: string | null };

const PAPEIS = ["Sócio", "Diretor", "Decisor", "Financeiro", "Comprador", "Operacional"];
const campo =
  "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)]";

/** Mensagem clara para os erros que o banco devolve (número repetido, telefone curto...). */
function erroDaPessoa(e: any): string {
  if (e?.code === "23505") return "Esse número já está em outro card da empresa (ou é o telefone principal de um lead). Para juntar os dois negócios, mescle os cards.";
  if (e?.code === "23514" || /check/i.test(String(e?.message))) return "Informe o telefone com DDD.";
  return friendlyError(e);
}

/**
 * Outras pessoas do mesmo negócio (sócios, financeiro...). O WhatsApp de cada uma aparece na conversa deste card,
 * em vez de criar um card novo para cada pessoa da mesma empresa.
 */
export function LeadContatosCard({ lead }: { lead: any }) {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<{ id: string | null; nome: string; telefone: string; papel: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!supabase || !lead?.id) { setCarregando(false); return; }
    const { data, error } = await supabase.from("lead_contatos").select("id, nome, telefone, papel").eq("lead_id", lead.id).order("created_at");
    if (error) toast.error(`Não foi possível carregar as pessoas do card: ${erroDaPessoa(error)}`);
    setPessoas((data || []) as Pessoa[]);
    setCarregando(false);
  }, [lead?.id]);

  useEffect(() => { setCarregando(true); setForm(null); carregar(); }, [carregar]);

  const salvar = async () => {
    if (!supabase || !form || !lead?.id || !lead?.tenant_id) return;
    const nome = form.nome.trim();
    const telefone = form.telefone.trim();
    if (!nome) { toast.error("Informe o nome da pessoa."); return; }
    if (telefone.replace(/\D/g, "").length < 8) { toast.error("Informe o telefone com DDD."); return; }
    setSalvando(true);
    // Um número = um card por empresa. Confere (com e sem o 55 do país) antes de salvar: o banco só barra o número idêntico.
    const d = telefone.replace(/\D/g, "");
    const variantes = [...new Set([d, d.startsWith("55") ? d.slice(2) : `55${d}`])];
    const [{ data: lDup }, { data: cDup }] = await Promise.all([
      supabase.from("leads").select("id, name").eq("tenant_id", lead.tenant_id).is("deleted_at", null).in("phone_digits", variantes).neq("id", lead.id).limit(1),
      supabase.from("lead_contatos").select("id, nome").eq("tenant_id", lead.tenant_id).in("phone_digits", variantes).neq("id", form.id ?? "00000000-0000-0000-0000-000000000000").limit(1),
    ]);
    if (lDup && lDup.length > 0) {
      setSalvando(false);
      toast.error(`Esse número já é o telefone principal do card "${lDup[0].name}". Para juntar os dois negócios, mescle os cards.`);
      return;
    }
    if (cDup && cDup.length > 0) {
      setSalvando(false);
      toast.error(`Esse número já está cadastrado como "${cDup[0].nome || "outra pessoa"}" em um card da empresa.`);
      return;
    }
    const campos = { nome, telefone, papel: form.papel.trim() || null };
    const { error } = form.id
      ? await supabase.from("lead_contatos").update(campos).eq("id", form.id)
      : await supabase.from("lead_contatos").insert({ ...campos, lead_id: lead.id, tenant_id: lead.tenant_id });
    setSalvando(false);
    if (error) { toast.error(erroDaPessoa(error)); return; }
    toast.success(form.id ? "Pessoa atualizada." : "Pessoa adicionada ao card.");
    setForm(null);
    carregar();
    avisarMudancaDePessoas();
  };

  const remover = async (p: Pessoa) => {
    if (!supabase) return;
    const ok = await confirmDialog({
      title: "Remover pessoa do card?",
      description: `${p.nome || p.telefone} deixa de aparecer neste card. As conversas de WhatsApp dela continuam no WhatsApp.`,
      confirmText: "Remover",
    });
    if (!ok) return;
    const { error } = await supabase.from("lead_contatos").delete().eq("id", p.id);
    if (error) { toast.error(erroDaPessoa(error)); return; }
    toast.success("Pessoa removida.");
    carregar();
    avisarMudancaDePessoas();
  };

  return (
    <Card className="p-3.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
          <Users className="w-3 h-3" /> Pessoas do negócio{lead?.company ? <span className="normal-case tracking-normal font-semibold text-[var(--color-text-faint)]"> · {lead.company}</span> : null}
        </h4>
        <div className="flex items-center gap-1">
          <MesclarCardsButton lead={lead} />
          {!form && (
            <Button size="sm" variant="ghost" onClick={() => setForm({ id: null, nome: "", telefone: "", papel: "" })} aria-label="Adicionar pessoa ao card">
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
            </Button>
          )}
        </div>
      </div>

      <ul className="space-y-1.5 list-none p-0 m-0">
        <li className="flex items-center justify-between gap-2 text-xs rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] px-2.5 py-1.5">
          <span className="min-w-0 truncate font-semibold text-[var(--color-text-primary)]">{lead?.name || "Contato principal"}</span>
          <span className="shrink-0 flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <Phone className="w-3 h-3" />{lead?.phone || "sem telefone"}
            <span className="text-[9px] font-black uppercase tracking-wider text-[var(--color-primary-blue)]">Principal</span>
          </span>
        </li>
        {pessoas.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 text-xs rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] px-2.5 py-1.5">
            <span className="min-w-0 truncate">
              <span className="font-semibold text-[var(--color-text-primary)]">{p.nome || "Sem nome"}</span>
              {p.papel && <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">{p.papel}</span>}
            </span>
            <span className="shrink-0 flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <Phone className="w-3 h-3" />{p.telefone}
              <button type="button" className="p-1 hover:text-[var(--color-text-primary)]" aria-label={`Editar ${p.nome || p.telefone}`}
                onClick={() => setForm({ id: p.id, nome: p.nome || "", telefone: p.telefone, papel: p.papel || "" })}><Pencil className="w-3 h-3" /></button>
              <button type="button" className="p-1 hover:text-rose-400" aria-label={`Remover ${p.nome || p.telefone}`} onClick={() => remover(p)}><Trash2 className="w-3 h-3" /></button>
            </span>
          </li>
        ))}
      </ul>
      {!carregando && pessoas.length === 0 && !form && (
        <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
          Outras pessoas da mesma empresa (sócio, financeiro...) entram aqui, e o WhatsApp delas aparece na conversa deste card.
        </p>
      )}

      {form && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input id="lc-nome" className={campo} placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} aria-label="Nome da pessoa" />
          <input id="lc-fone" className={campo} placeholder="Telefone com DDD" inputMode="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} aria-label="Telefone da pessoa" />
          <input id="lc-papel" className={campo} placeholder="Papel (ex.: Sócio, Diretor)" list="lc-papeis" value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })} aria-label="Papel da pessoa" />
          <datalist id="lc-papeis">{PAPEIS.map((p) => <option key={p} value={p} />)}</datalist>
          <div className="sm:col-span-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setForm(null)} disabled={salvando}><X className="w-3.5 h-3.5 mr-1" /> Cancelar</Button>
            <Button size="sm" onClick={salvar} disabled={salvando}><Check className="w-3.5 h-3.5 mr-1" /> {form.id ? "Salvar" : "Adicionar"}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
