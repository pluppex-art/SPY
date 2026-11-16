import { useEffect, useState } from "react";

/** Unidade da Max Data que vale agora — vem da FILIAL escolhida na barra lateral (conexão ligada a ela); "" = todas as filiais.
 *  ("maxdata:nenhuma" = a filial escolhida não tem conexão da Max Data). Antes: Unidade escolhida para os painéis da Max Data: "" = todas, senão a conexão (principal ou filial). */
export type UnidadeMax = "" | "maxdata:estoque" | "maxdata:notas" | "maxdata:nenhuma";
const ouvintes = new Set<() => void>();
let atual: UnidadeMax = "";

export function setUnidadeMax(v: UnidadeMax) {
  atual = v;
  ouvintes.forEach((f) => f());
}
export const getUnidadeMax = () => atual;

export function useUnidadeMax(): [UnidadeMax, (v: UnidadeMax) => void] {
  const [v, setV] = useState<UnidadeMax>(atual);
  useEffect(() => { const f = () => setV(atual); ouvintes.add(f); return () => { ouvintes.delete(f); }; }, []);
  return [v, setUnidadeMax];
}
