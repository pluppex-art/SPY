import { Stethoscope } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { CLINICA_CONFIG_KEY, CLINICA_DEFAULTS, PRONTUARIO_CAMPOS, STATUS_PLANO } from "../../../lib/modules/clinicaConfig";

const hhmm = /^\d{1,2}:\d{2}$/;

export const clinicaSettings: ModuleDef = {
  moduleId: "clinica",
  title: "Clínica",
  icon: Stethoscope,
  storeKey: CLINICA_CONFIG_KEY,
  defaults: CLINICA_DEFAULTS,
  sections: [
    {
      id: "agenda",
      title: "Agenda médica",
      subtitle: "Horário de atendimento, intervalo entre consultas e padrões do agendamento.",
      fields: [
        { kind: "text", key: "horaInicio", label: "Início do atendimento", placeholder: "08:00", hint: "Formato HH:MM." },
        { kind: "text", key: "horaFim", label: "Fim do atendimento", placeholder: "18:00", hint: "Formato HH:MM." },
        { kind: "text", key: "almocoInicio", label: "Início da pausa", placeholder: "12:00", hint: "Sem horários na grade entre o início e o fim da pausa. Deixe igual ao fim para não ter pausa." },
        { kind: "text", key: "almocoFim", label: "Fim da pausa", placeholder: "13:00" },
        { kind: "number", key: "intervaloMin", label: "Intervalo da agenda", min: 5, max: 240, suffix: "min", hint: "Distância entre os horários da grade." },
        { kind: "text", key: "salaPadrao", label: "Sala padrão do agendamento" },
        { kind: "text", key: "tipoPadrao", label: "Tipo padrão do atendimento" },
        { kind: "toggle", key: "restringirAoHorario", label: "Só agendar dentro do horário de atendimento", hint: "Bloqueia horários fora do expediente e da pausa no novo agendamento." },
        { kind: "toggle", key: "bloquearConflito", label: "Impedir dois agendamentos no mesmo horário com o mesmo profissional" },
      ],
      validate: (d) => {
        for (const k of ["horaInicio", "horaFim", "almocoInicio", "almocoFim"]) if (!hhmm.test(String(d[k] ?? ""))) return "Use o formato HH:MM nos horários (ex.: 08:00).";
        if (d.horaFim <= d.horaInicio) return "O fim do atendimento deve ser depois do início.";
        return null;
      },
    },
    {
      id: "prontuario",
      title: "Prontuário",
      subtitle: "Campos obrigatórios ao registrar uma entrada no prontuário.",
      fields: [
        { kind: "toggle", key: "exigirQueixaOuDiagnostico", label: "Exigir queixa principal ou diagnóstico", hint: "Regra atual: ao menos um dos dois precisa estar preenchido." },
        { kind: "multi", key: "camposObrigatorios", label: "Campos sempre obrigatórios", options: Object.keys(PRONTUARIO_CAMPOS) },
      ],
    },
    {
      id: "planos",
      title: "Planos de tratamento",
      subtitle: "Valores iniciais ao criar um novo plano.",
      fields: [
        { kind: "number", key: "sessoesPadrao", label: "Número de sessões padrão", min: 1, max: 200 },
        { kind: "select", key: "statusInicial", label: "Status inicial do plano", options: STATUS_PLANO },
      ],
    },
    {
      id: "estoque",
      title: "Estoque de insumos",
      subtitle: "Quantidade mínima e criticidade dos itens.",
      fields: [
        { kind: "number", key: "minimoPadrao", label: "Quantidade mínima padrão", min: 0, hint: "Se maior que 0, o campo de quantidade mínima passa a ser opcional e usa este valor." },
        { kind: "number", key: "percentualCritico", label: "Crítico abaixo de", min: 1, max: 100, suffix: "% do mínimo", hint: "Itens abaixo do mínimo ficam Crítico quando passam a ter menos que esse percentual; senão, Alerta." },
      ],
    },
  ],
};
