/**
 * Cargos (áreas) da pessoa e o que eles liberam. Uma pessoa pode ter mais de um cargo
 * (ex.: Administrador + Dev): as permissões são a SOMA dos cargos.
 *
 * - `user.roles` vem de colaboradores.cargos; se vazio, vale o cargo do login (`user.role`).
 * - Cargo sem lista de módulos = sem restrição; basta UM cargo sem restrição para a pessoa não ter restrição.
 * - Nenhum cargo da pessoa existe em Cargos = sem restrição (como sempre foi).
 */

/** Nomes dos cargos da pessoa (os de colaboradores.cargos ou, na falta, o do login). */
export function nomesDosCargos(user: any): string[] {
  const roles: string[] = Array.isArray(user?.roles) ? user.roles.filter(Boolean) : [];
  return roles.length > 0 ? roles : user?.role ? [user.role] : [];
}

/** Registros de Cargos que correspondem aos cargos da pessoa. */
export function cargosDoUsuario(user: any, cargos: any[]): any[] {
  const nomes = nomesDosCargos(user);
  return (cargos || []).filter((c: any) => nomes.includes(c.nome));
}

/** Módulos liberados (soma dos cargos); `null` = sem restrição. */
export function modulosDoCargo(user: any, cargos: any[]): string[] | null {
  const achados = cargosDoUsuario(user, cargos);
  if (achados.length === 0) return null;
  const listas = achados.map((c: any) => (Array.isArray(c.modulos) && c.modulos.length > 0 ? (c.modulos as string[]) : null));
  if (listas.some((l) => l === null)) return null;
  return [...new Set((listas as string[][]).flat())];
}

/** Restrito aos próprios dados? Só se TODOS os cargos da pessoa restringem. */
export function restritoAosProprios(user: any, cargos: any[]): boolean {
  const achados = cargosDoUsuario(user, cargos);
  return achados.length > 0 && achados.every((c: any) => !!c.restringir_aos_proprios_dados);
}
