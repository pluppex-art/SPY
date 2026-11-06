import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export type PessoaDoCard = { id: string; nome: string; papel: string | null; principal: boolean };

/** Disparado quando alguém adiciona, edita ou remove uma pessoa do card, para as abas (notas, conversas) atualizarem a lista. */
export const EVENTO_PESSOAS = "spy:lead-pessoas-changed";
export const avisarMudancaDePessoas = () => window.dispatchEvent(new Event(EVENTO_PESSOAS));

/**
 * Pessoas do negócio: o contato principal do lead (id "principal") e as outras pessoas do card (lead_contatos).
 * Usada pelas notas (filtro e dono de cada nota) e pela conversa de WhatsApp (seletor de pessoa).
 */
export function useLeadPessoas(lead: any, nomePrincipal: string): PessoaDoCard[] {
  const [extras, setExtras] = useState<Array<{ id: string; nome: string | null; papel: string | null }>>([]);

  const carregar = useCallback(async () => {
    if (!supabase || !lead?.id) { setExtras([]); return; }
    const { data } = await supabase.from("lead_contatos").select("id, nome, papel").eq("lead_id", lead.id).order("created_at");
    setExtras((data || []) as any[]);
  }, [lead?.id]);

  useEffect(() => {
    carregar();
    window.addEventListener(EVENTO_PESSOAS, carregar);
    return () => window.removeEventListener(EVENTO_PESSOAS, carregar);
  }, [carregar]);

  return [
    { id: "principal", nome: nomePrincipal || lead?.name || "Contato principal", papel: null, principal: true },
    ...extras.map((e) => ({ id: e.id, nome: e.nome || "Sem nome", papel: e.papel, principal: false })),
  ];
}
