// Configuração do módulo Desenvolvimento. Preencha DEFAULTS e use useDevConfig() nas telas.
import { useModuleConfig } from "../moduleConfig";

export const DEV_CONFIG_KEY = "dev_config";
export const DEV_DEFAULTS: Record<string, Record<string, any>> = {};

export function useDevConfig(): any {
  return useModuleConfig(DEV_CONFIG_KEY, DEV_DEFAULTS);
}
