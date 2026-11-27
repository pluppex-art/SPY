/** Em funil com o método, cada coluna mostra primeiro quem estourou o prazo e, entre iguais, o lead quente. */
import { useMemo } from "react";
import { pesoDeAtencao } from "../../lib/metodo/regras";
import { useMetodo } from "./MetodoProvider";

export function useOrdemDoQuadro(funil: any): ((a: any, b: any) => number) | undefined {
  const metodo = useMetodo();
  const ativo = !!funil?.metodoAtivo;
  return useMemo(() => (ativo ? (a: any, b: any) => pesoDeAtencao(metodo.info(a)?.estado, a.temperature) - pesoDeAtencao(metodo.info(b)?.estado, b.temperature) : undefined), [ativo, metodo]);
}
