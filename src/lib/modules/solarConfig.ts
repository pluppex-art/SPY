// Configuração do módulo Energia Solar. Preencha DEFAULTS e use useSolarConfig() nas telas.
import { useModuleConfig } from "../moduleConfig";

export const SOLAR_CONFIG_KEY = "solar_config";
export const SOLAR_DEFAULTS: Record<string, Record<string, any>> = {};

export function useSolarConfig(): any {
  return useModuleConfig(SOLAR_CONFIG_KEY, SOLAR_DEFAULTS);
}
