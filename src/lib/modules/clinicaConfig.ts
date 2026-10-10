// Configuração do módulo Clínica. Preencha DEFAULTS e use useClinicaConfig() nas telas.
import { useModuleConfig } from "../moduleConfig";

export const CLINICA_CONFIG_KEY = "clinica_config";
export const CLINICA_DEFAULTS: Record<string, Record<string, any>> = {};

export function useClinicaConfig(): any {
  return useModuleConfig(CLINICA_CONFIG_KEY, CLINICA_DEFAULTS);
}
