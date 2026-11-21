import { navSections } from "../components/layout/navData";

/**
 * Páginas ocultas por empresa. Ficam dentro de `tenants.modules` como chaves
 * booleanas `pg:<rota>` = false (ausente = visível), para herdar a mesma proteção
 * do banco que já vale para os módulos (só o operador da plataforma altera).
 */
export const chavePagina = (path: string) => `pg:${path}`;

export const paginaOculta = (modules: Record<string, any> | null | undefined, path: string) =>
  !!modules && modules[chavePagina(path)] === false;

/** A rota atual (ou uma subrota dela) foi ocultada para a empresa? */
export const rotaOculta = (modules: Record<string, any> | null | undefined, pathname: string) => {
  if (!modules) return false;
  return Object.keys(modules).some((k) => {
    if (!k.startsWith("pg:") || modules[k] !== false) return false;
    const p = k.slice(3);
    return pathname === p || pathname.startsWith(`${p}/`);
  });
};

// Chave usada no menu → id do cartão na tela de módulos.
const MODULO_DO_MENU: Record<string, string> = { "catalogo-produtos": "catalogo", automotivo: "concessionaria" };

/** Páginas do menu que pertencem a um módulo (pelo `reqModule` do item ou do grupo). */
export function paginasDoModulo(moduloId: string): { name: string; path: string }[] {
  const lista: { name: string; path: string }[] = [];
  for (const section of navSections as any[]) {
    for (const item of section.items as any[]) {
      if (!item.path) continue;
      const req = item.reqModule ?? section.reqModule;
      if (!req || req === "master") continue;
      if ((MODULO_DO_MENU[req] || req) === moduloId) lista.push({ name: item.name, path: item.path });
    }
  }
  return lista;
}

/** Rotas das partes que uma empresa pode desligar quando não usa (venda rápida, sem proposta/contrato/OS). */
export const ROTA_PROPOSTAS = "/app/crm/propostas";
export const ROTA_ORDENS_SERVICO = "/app/ordens-servico";
