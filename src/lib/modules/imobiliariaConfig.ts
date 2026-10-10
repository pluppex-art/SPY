// Configuração do módulo Imobiliária. Preencha DEFAULTS e use useImobiliariaConfig() nas telas.
import { useModuleConfig } from "../moduleConfig";

export const IMOBILIARIA_CONFIG_KEY = "imobiliaria_config";
export const IMOBILIARIA_DEFAULTS: Record<string, Record<string, any>> = {
  comissoes: { percentualTotal: 6, splitCorretor: 50, statusInicial: "A Receber" },
  imoveis: {
    tipos: ["Apartamento", "Casa", "Cobertura", "Kitnet", "Comercial", "Terreno"],
    operacaoPadrao: "Venda",
    quartosPadrao: 2,
    banheirosPadrao: 1,
    vagasPadrao: 1,
  },
  visitas: { horaPadrao: "10:00", statusInicial: "Agendada" },
};

export function useImobiliariaConfig(): any {
  return useModuleConfig(IMOBILIARIA_CONFIG_KEY, IMOBILIARIA_DEFAULTS);
}
