// Configuração do módulo Automotivo. Preencha DEFAULTS e use useAutomotivoConfig() nas telas.
import { useModuleConfig } from "../moduleConfig";

export const AUTOMOTIVO_CONFIG_KEY = "automotivo_config";
export const AUTOMOTIVO_DEFAULTS: Record<string, Record<string, any>> = {};

export function useAutomotivoConfig(): any {
  return useModuleConfig(AUTOMOTIVO_CONFIG_KEY, AUTOMOTIVO_DEFAULTS);
}
