// Configuração do módulo Energia Solar (documento "solar_config" em app_settings). Genérico para qualquer
// integradora. Os padrões reproduzem os valores que antes eram fixos nas telas.
import { useModuleConfig } from "../moduleConfig";

export const SOLAR_CONFIG_KEY = "solar_config";

export const SOLAR_DEFAULTS: Record<string, Record<string, any>> = {
  dimensionamento: { hsp: 4.5, eficienciaPct: 80, economiaPct: 85 },
  projetos: { potenciaPadraoKwp: 5, geracaoPorKwp: 125, precoPorKwp: 3800 },
  distribuidoras: {
    concessionarias: ["CPFL Paulista", "CPFL Piratininga", "Enel SP", "Enel RJ", "CEMIG", "Neoenergia Elektro", "Light", "Copel"],
    padrao: "CPFL Paulista",
    prazoPadrao: "Em análise regulatória",
  },
  operacao: {
    servicos: [
      "Limpeza e Lavagem de Módulos",
      "Inspeção de Inversor & String Box",
      "Termografia e Reaperto de Conexões",
      "Diagnóstico de Queda de Geração",
      "Substituição de Fusível / DPS",
    ],
    potenciaPadrao: "10 kWp",
    tiposTelhado: ["Metálico Trapezoidal", "Cerâmico Colonial", "Fibrocimento", "Laje de Concreto", "Usinas em Solo"],
    responsavelPadrao: "Eng. Responsável",
  },
};

export function useSolarConfig(): any {
  return useModuleConfig(SOLAR_CONFIG_KEY, SOLAR_DEFAULTS);
}
