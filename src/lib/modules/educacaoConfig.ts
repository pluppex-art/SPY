// Configuração do módulo Educação. Preencha DEFAULTS e use useEducacaoConfig() nas telas.
import { useModuleConfig } from "../moduleConfig";

export const EDUCACAO_CONFIG_KEY = "educacao_config";
export const EDUCACAO_DEFAULTS: Record<string, Record<string, any>> = {};

export function useEducacaoConfig(): any {
  return useModuleConfig(EDUCACAO_CONFIG_KEY, EDUCACAO_DEFAULTS);
}
