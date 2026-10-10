// Configuração do módulo Clínica (documento "clinica_config" em app_settings). Genérico para qualquer clínica;
// os padrões reproduzem o comportamento que as telas já tinham.
import { useModuleConfig } from "../moduleConfig";

export const CLINICA_CONFIG_KEY = "clinica_config";

export const PRONTUARIO_CAMPOS: Record<string, string> = {
  "Profissional responsável": "profissional",
  "Queixa principal": "queixa_principal",
  "Histórico / evolução": "historico",
  "Diagnóstico": "diagnostico",
  "Prescrição": "prescricao",
  "Exames solicitados": "exames_solicitados",
  "Observações": "observacoes",
};

export const STATUS_PLANO = ["Em Elaboração", "Aprovado pelo Paciente", "Em Andamento", "Concluído"];

export const CLINICA_DEFAULTS: Record<string, Record<string, any>> = {
  agenda: {
    horaInicio: "08:00",
    horaFim: "18:00",
    almocoInicio: "12:00",
    almocoFim: "13:00",
    intervaloMin: 30,
    salaPadrao: "Consultório 01",
    tipoPadrao: "Consulta",
    restringirAoHorario: false,
    bloquearConflito: false,
  },
  prontuario: {
    exigirQueixaOuDiagnostico: true,
    camposObrigatorios: [],
  },
  planos: {
    sessoesPadrao: 4,
    statusInicial: "Aprovado pelo Paciente",
  },
  estoque: {
    minimoPadrao: 0,
    percentualCritico: 50,
  },
};

export interface ClinicaConfig {
  agenda: { horaInicio: string; horaFim: string; almocoInicio: string; almocoFim: string; intervaloMin: number; salaPadrao: string; tipoPadrao: string; restringirAoHorario: boolean; bloquearConflito: boolean };
  prontuario: { exigirQueixaOuDiagnostico: boolean; camposObrigatorios: string[] };
  planos: { sessoesPadrao: number; statusInicial: string };
  estoque: { minimoPadrao: number; percentualCritico: number };
}

export function useClinicaConfig(): ClinicaConfig {
  return useModuleConfig<ClinicaConfig>(CLINICA_CONFIG_KEY, CLINICA_DEFAULTS);
}

const toMin = (t: string, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
};
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Horários da grade da agenda (padrão: 08:00–11:30 e 13:00–17:30, de 30 em 30 min). */
export function buildSlots(a: ClinicaConfig["agenda"]): string[] {
  const ini = toMin(a.horaInicio, 480), fim = toMin(a.horaFim, 1080);
  const li = toMin(a.almocoInicio, 720), lf = toMin(a.almocoFim, 780);
  const step = Math.max(5, Number(a.intervaloMin) || 30);
  const out: string[] = [];
  for (let m = ini; m < fim; m += step) if (!(m >= li && m < lf)) out.push(fmt(m));
  return out;
}

export function dentroDoHorario(a: ClinicaConfig["agenda"], hhmm: string): boolean {
  const m = toMin(hhmm, -1);
  if (m < 0) return true;
  return m >= toMin(a.horaInicio, 480) && m < toMin(a.horaFim, 1080) && !(m >= toMin(a.almocoInicio, 720) && m < toMin(a.almocoFim, 780));
}
