import { GraduationCap } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { EDUCACAO_CONFIG_KEY, EDUCACAO_DEFAULTS } from "../../../lib/modules/educacaoConfig";

export const educacaoSettings: ModuleDef = {
  moduleId: "educacao",
  title: "Educação",
  icon: GraduationCap,
  storeKey: EDUCACAO_CONFIG_KEY,
  defaults: EDUCACAO_DEFAULTS,
  sections: [
    {
      id: "matricula",
      title: "Matrícula e mensalidades",
      subtitle: "Valores sugeridos ao matricular um aluno (as parcelas são geradas com eles).",
      fields: [
        { kind: "number", key: "diaVencimentoPadrao", label: "Dia de vencimento padrão", min: 1, max: 28, hint: "Entre 1 e 28." },
        { kind: "number", key: "parcelasPadrao", label: "Quantidade de parcelas padrão", min: 1, max: 60 },
      ],
    },
    {
      id: "turmas",
      title: "Turmas",
      subtitle: "Padrões ao criar uma nova turma.",
      fields: [
        { kind: "number", key: "vagasPadrao", label: "Vagas por turma", min: 1, max: 1000 },
        { kind: "select", key: "turnoPadrao", label: "Turno padrão", options: ["Manhã", "Tarde", "Noite"] },
      ],
    },
    {
      id: "notas",
      title: "Notas e aprovação",
      subtitle: "Faixas de cor/indicador das notas e da média do aluno.",
      fields: [
        { kind: "number", key: "notaAprovacao", label: "Nota mínima para aprovação", min: 0, max: 100, hint: "Notas a partir daqui aparecem como aprovado (verde)." },
        { kind: "number", key: "notaRecuperacao", label: "Nota mínima para recuperação", min: 0, max: 100, hint: "Entre este valor e a aprovação aparece como recuperação (amarelo); abaixo, reprovado." },
        { kind: "number", key: "notaMaxima", label: "Nota máxima aceita", min: 1, max: 100, hint: "Limite ao lançar notas." },
      ],
      validate: (d) => Number(d.notaRecuperacao) > Number(d.notaAprovacao) ? "A nota de recuperação não pode ser maior que a de aprovação." : null,
    },
    {
      id: "presenca",
      title: "Frequência",
      subtitle: "Controle de presença nas turmas.",
      fields: [
        { kind: "number", key: "frequenciaMinima", label: "Frequência/progresso mínimo (%)", min: 0, max: 100, suffix: "%", hint: "Alunos abaixo disso ficam em vermelho na chamada da turma." },
      ],
    },
    {
      id: "certificados",
      title: "Certificados",
      subtitle: "Aparência do código de autenticação dos certificados emitidos.",
      fields: [
        { kind: "text", key: "prefixoCodigo", label: "Prefixo do código", placeholder: "AX-", hint: "Ex.: o código fica PREFIXO + 12 caracteres." },
      ],
    },
  ],
};
