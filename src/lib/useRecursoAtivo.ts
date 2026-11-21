import { useAuth } from "../contexts/AuthContext";
import { paginaOculta } from "./paginasOcultas";

/** A empresa usa esta parte do sistema? Falso quando a página foi desligada em Admin > Módulos (ex.: sem propostas, venda direta para Ganho). */
export function useRecursoAtivo(rota: string): boolean {
  const { getTenantModules, activeTenantName, user } = useAuth();
  const modulos = getTenantModules(activeTenantName || user?.tenantName || "") as Record<string, any>;
  return !paginaOculta(modulos, rota);
}
