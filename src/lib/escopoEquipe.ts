import { cargosDoUsuario } from "./cargosUsuario";

/**
 * Quem cada pessoa enxerga na Equipe & RH (a página é aberta a todos; o que muda é a lista):
 * - Estratégico (e administrador/master): todos.
 * - Tático (líderes e gerentes): as pessoas do próprio departamento e do próprio squad.
 * - Operacional (e quem não tem cargo cadastrado): só o próprio perfil e o próprio squad.
 * Em todos os casos a pessoa vê quem é do mesmo squad que ela.
 */
export type EscopoEquipe = "todos" | "departamento" | "proprio";
export type NivelPessoa = "Estratégico" | "Tático" | "Operacional";

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const semSquad = (s: unknown) => !norm(s) || norm(s) === "sem squad";

/** Maior nível entre os cargos da pessoa; sem cargo cadastrado = Operacional (o mais restrito). */
export function nivelDaPessoa(user: any, cargos: any[]): NivelPessoa {
  const niveis = cargosDoUsuario(user, cargos).map((c: any) => c.nivel);
  if (niveis.includes("Estratégico")) return "Estratégico";
  if (niveis.includes("Tático")) return "Tático";
  return "Operacional";
}

export function escopoEquipe(user: any, cargos: any[]): EscopoEquipe {
  if (user?.isMaster || user?.isTenantAdmin) return "todos";
  const nivel = nivelDaPessoa(user, cargos);
  return nivel === "Estratégico" ? "todos" : nivel === "Tático" ? "departamento" : "proprio";
}

/** O cadastro de colaborador da própria pessoa (pelo login ou, na falta, pelo e-mail). */
export function colaboradorDoUsuario(user: any, colaboradores: any[]): any | null {
  const lista = colaboradores || [];
  return (
    lista.find((c: any) => user?.id && c.user_id === user.id) ??
    lista.find((c: any) => user?.email && c.email && norm(c.email) === norm(user.email)) ??
    null
  );
}

export function colaboradoresVisiveis(user: any, cargos: any[], colaboradores: any[]): any[] {
  const lista = colaboradores || [];
  const escopo = escopoEquipe(user, cargos);
  if (escopo === "todos") return lista;
  const eu = colaboradorDoUsuario(user, lista);
  if (!eu) return [];
  return lista.filter((c: any) => {
    if (c.id === eu.id) return true;
    if (!semSquad(eu.squad) && norm(c.squad) === norm(eu.squad)) return true;
    return escopo === "departamento" && !!norm(eu.departamento) && norm(c.departamento) === norm(eu.departamento);
  });
}

/** Squads que a pessoa vê: todos (escopo amplo) ou o próprio squad, os que lidera e os do departamento (Tático). */
export function squadsVisiveis(user: any, cargos: any[], colaboradores: any[], squads: any[]): any[] {
  const lista = squads || [];
  const escopo = escopoEquipe(user, cargos);
  if (escopo === "todos") return lista;
  const eu = colaboradorDoUsuario(user, colaboradores);
  if (!eu) return [];
  return lista.filter((s: any) => {
    if (!semSquad(eu.squad) && (norm(s.nome) === norm(eu.squad) || norm(s.name) === norm(eu.squad))) return true;
    if (norm(s.leader) && norm(s.leader) === norm(eu.nome)) return true;
    if ((s.membros || []).some((m: string) => norm(m) === norm(eu.nome))) return true;
    return escopo === "departamento" && !!norm(eu.departamento) && norm(s.departamento) === norm(eu.departamento);
  });
}

export const ROTULO_ESCOPO: Record<EscopoEquipe, string> = {
  todos: "Equipe: toda a empresa",
  departamento: "Equipe: próprio departamento e squad",
  proprio: "Equipe: só o próprio perfil e squad",
};
