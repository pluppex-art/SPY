import { useEffect, useState } from "react";

/** Unidade escolhida para os painéis da Max Data: "" = todas, senão a conexão (principal ou filial). */
export type UnidadeMax = "" | "maxdata:estoque" | "maxdata:notas";
const KEY = "spy_unidade_maxdata";
const ouvintes = new Set<() => void>();
let atual: UnidadeMax = (() => { try { const v = localStorage.getItem(KEY); return v === "maxdata:estoque" || v === "maxdata:notas" ? v : ""; } catch { return ""; } })();

export function setUnidadeMax(v: UnidadeMax) {
  atual = v;
  try { localStorage.setItem(KEY, v); } catch { /* sem armazenamento: vale só nesta sessão */ }
  ouvintes.forEach((f) => f());
}
export const getUnidadeMax = () => atual;

export function useUnidadeMax(): [UnidadeMax, (v: UnidadeMax) => void] {
  const [v, setV] = useState<UnidadeMax>(atual);
  useEffect(() => { const f = () => setV(atual); ouvintes.add(f); return () => { ouvintes.delete(f); }; }, []);
  return [v, setUnidadeMax];
}
