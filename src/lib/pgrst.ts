/**
 * Limpa texto digitado pelo usuário antes de interpolar em filtros `.or()` / `.ilike` do PostgREST.
 * Vírgula, parênteses, %, * e \ fazem parte da sintaxe do filtro: sem remover, quebram a consulta
 * (ou permitem injetar condições). Troca por espaço e apara.
 */
export const limpaBusca = (v: string): string => (v ?? "").replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Busca TODAS as linhas de uma consulta em blocos (.range), contornando o limite de 1000 do PostgREST.
 * `build` deve devolver uma consulta nova e ORDENADA de forma estável (inclua uma coluna única, ex.: id).
 * Em erro, devolve o que já foi lido.
 */
export async function fetchAllRows<T = any>(build: () => any, chunk = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += chunk) {
    const { data, error } = await build().range(from, from + chunk - 1);
    if (error || !data) break;
    out.push(...(data as T[]));
    if (data.length < chunk) break;
  }
  return out;
}
