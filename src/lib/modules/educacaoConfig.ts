// Configuração do módulo Educação (escolas/cursos). Genérica; os padrões reproduzem o comportamento original das telas.
import { useModuleConfig } from "../moduleConfig";

export const EDUCACAO_CONFIG_KEY = "educacao_config";
export const EDUCACAO_DEFAULTS: Record<string, Record<string, any>> = {
  matricula: { diaVencimentoPadrao: 10, parcelasPadrao: 12 },
  turmas: { vagasPadrao: 30, turnoPadrao: "Manhã" },
  notas: { notaAprovacao: 7, notaRecuperacao: 5, notaMaxima: 10 },
  presenca: { frequenciaMinima: 50 },
  certificados: { prefixoCodigo: "AX-" },
};

export interface EducacaoConfig {
  matricula: { diaVencimentoPadrao: number; parcelasPadrao: number };
  turmas: { vagasPadrao: number; turnoPadrao: string };
  notas: { notaAprovacao: number; notaRecuperacao: number; notaMaxima: number };
  presenca: { frequenciaMinima: number };
  certificados: { prefixoCodigo: string };
}

export function useEducacaoConfig(): EducacaoConfig {
  return useModuleConfig<EducacaoConfig>(EDUCACAO_CONFIG_KEY, EDUCACAO_DEFAULTS);
}
