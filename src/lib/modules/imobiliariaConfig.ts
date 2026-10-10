// Configuração do módulo Imobiliária. Preencha DEFAULTS e use useImobiliariaConfig() nas telas.
import { useModuleConfig } from "../moduleConfig";

export const IMOBILIARIA_CONFIG_KEY = "imobiliaria_config";
export const IMOBILIARIA_DEFAULTS: Record<string, Record<string, any>> = {};

export function useImobiliariaConfig(): any {
  return useModuleConfig(IMOBILIARIA_CONFIG_KEY, IMOBILIARIA_DEFAULTS);
}
