/** Chave para comparar nomes de vendedor digitados de formas diferentes: "Rômulo" = "Romulo", "Maria Eduarda" = "MariaEduarda". */
export const sellerKey = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Lista de vendedores sem repetição: variações do mesmo nome viram uma opção só. O nome exibido é o do cadastro
 * de colaboradores quando existe; senão a variação mais usada (empate: a que tem acento/espaço, mais legível).
 */
export function uniqueSellers(names: unknown[], colaboradores: { nome?: string }[] = []): string[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const n of names) {
    const nome = String(n ?? "").trim();
    if (!nome) continue;
    const k = sellerKey(nome);
    if (!k) continue;
    const g = grupos.get(k) ?? new Map<string, number>();
    g.set(nome, (g.get(nome) ?? 0) + 1);
    grupos.set(k, g);
  }
  const doCadastro = new Map<string, string>();
  for (const c of colaboradores) if (c?.nome) doCadastro.set(sellerKey(c.nome), c.nome.trim());
  const legivel = (s: string) => (/[^\x00-\x7F]/.test(s) ? 1 : 0) + (/\s/.test(s) ? 1 : 0);
  return [...grupos.entries()]
    .map(([k, g]) => doCadastro.get(k) ?? [...g.entries()].sort((a, b) => b[1] - a[1] || legivel(b[0]) - legivel(a[0]))[0][0])
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export const sameSeller = (a: unknown, b: unknown): boolean => sellerKey(a) === sellerKey(b);
