import { navSections } from "../components/layout/navData";
import { modulosDoCargo } from "./cargosUsuario";

export { modulosDoCargo };

/**
 * Regra única de acesso por perfil (cargo) às páginas do sistema.
 * Usada pelo menu lateral, pelo menu do celular e pelo bloqueio de rotas (Layout) — assim o que está
 * escondido no menu também não abre digitando o endereço.
 *
 * - O cargo guarda a lista de módulos liberados em `cargos.modulos`; lista vazia = sem restrição.
 * - O usuário se liga ao cargo pelo nome (`users.role` = `cargos.nome`).
 * - Master não é restringido por cargo.
 */

const FAMILIA_CATALOGO = ["catalogo", "imobiliaria", "automotivo", "concessionaria", "varejo"];

/** O módulo do menu (ex.: "agenda", "catalogo-produtos") é liberado por algum módulo do cargo? */
export function cargoPermiteModulo(modulos: string[] | null, mod: string): boolean {
  if (!modulos) return true;
  return modulos.some(
    (m) =>
      m === mod ||
      (mod === "catalogo-produtos" && FAMILIA_CATALOGO.includes(m)) ||
      ((mod === "automotivo" || mod === "concessionaria") && (m === "automotivo" || m === "concessionaria")) ||
      // Agenda e Documentos fazem parte do CRM (mesma equivalência já usada para os módulos da empresa).
      ((mod === "agenda" || mod === "documentos") && m === "crm"),
  );
}

type ItemRota = { path: string; modulo: string };

const ITENS_COM_MODULO: ItemRota[] = (() => {
  const lista: ItemRota[] = [];
  for (const secao of navSections as any[]) {
    for (const item of secao.items || []) {
      if (!item.path) continue;
      const modulo = item.reqModule ?? secao.reqModule;
      if (!modulo || modulo === "master") continue; // master/sem módulo: tratados por outras regras
      lista.push({ path: item.path, modulo });
    }
  }
  // Mais específico primeiro (ex.: /app/crm/pipeline antes de /app/crm).
  return lista.sort((a, b) => b.path.length - a.path.length);
})();

/** Módulo exigido por uma rota (pela entrada do menu mais específica); `null` = rota livre. */
export function moduloDaRota(pathname: string): string | null {
  const achado = ITENS_COM_MODULO.find((i) => pathname === i.path || pathname.startsWith(`${i.path}/`));
  return achado ? achado.modulo : null;
}
