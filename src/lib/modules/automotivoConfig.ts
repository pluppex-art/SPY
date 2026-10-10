// Configuração do módulo Automotivo (concessionária / revenda). Genérico: nada específico de cliente.
// Os padrões reproduzem exatamente o comportamento que as telas já tinham antes das configurações.
import { useModuleConfig } from "../moduleConfig";

export const AUTOMOTIVO_CONFIG_KEY = "automotivo_config";

export const FORMAS_PAGAMENTO_TROCA = ["Financiamento Bancário", "À Vista via Pix", "Cartão de Crédito", "Consórcio Contemplado"];

export interface AutomotivoConfig {
  avaliacoes: { ofertaPctFipe: number; avaliadorPadrao: string; clientePadrao: string; exigirFipe: boolean; exigirProprietario: boolean };
  testdrive: { horaPadrao: string; exigirCnh: boolean; exigirTelefone: boolean; exigirConsultor: boolean };
  consignacao: { comissaoPadraoPct: number; exigirTelefone: boolean; exigirValorPedido: boolean };
  trocas: { formaPagamentoPadrao: string; exigirTelefone: boolean; exigirValorEntrada: boolean };
  painel: { testDrivesProximos: number };
}

export const AUTOMOTIVO_DEFAULTS: Record<string, Record<string, any>> = {
  avaliacoes: { ofertaPctFipe: 88, avaliadorPadrao: "Vistoriador Interno", clientePadrao: "Cliente Balcão", exigirFipe: false, exigirProprietario: false },
  testdrive: { horaPadrao: "14:00", exigirCnh: false, exigirTelefone: false, exigirConsultor: false },
  consignacao: { comissaoPadraoPct: 5, exigirTelefone: false, exigirValorPedido: false },
  trocas: { formaPagamentoPadrao: "Financiamento Bancário", exigirTelefone: false, exigirValorEntrada: false },
  painel: { testDrivesProximos: 5 },
};

export function useAutomotivoConfig(): AutomotivoConfig {
  return useModuleConfig<AutomotivoConfig>(AUTOMOTIVO_CONFIG_KEY, AUTOMOTIVO_DEFAULTS);
}
