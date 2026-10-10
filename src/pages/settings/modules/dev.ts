import { Code2 } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import {
  DEV_CONFIG_KEY, DEV_DEFAULTS, DEV_TIPOS_TAREFA, DEV_PRIORIDADES, DEV_COLUNAS_TAREFA,
  DEV_SEVERIDADES, DEV_STATUS_PROJETO, DEV_VISIBILIDADES,
} from "../../../lib/modules/devConfig";

export const devSettings: ModuleDef = {
  moduleId: "dev",
  title: "Desenvolvimento",
  icon: Code2,
  storeKey: DEV_CONFIG_KEY,
  defaults: DEV_DEFAULTS,
  sections: [
    {
      id: "sprint",
      title: "Sprint e tarefas",
      subtitle: "Valores iniciais ao criar uma tarefa no sprint e capacidade do time. As colunas do quadro ficam em Produtividade → Funis & Kanbans.",
      fields: [
        { kind: "select", key: "tipoPadrao", label: "Tipo padrão da tarefa", options: DEV_TIPOS_TAREFA },
        { kind: "select", key: "prioridadePadrao", label: "Prioridade padrão", options: DEV_PRIORIDADES },
        { kind: "select", key: "colunaPadrao", label: "Coluna de destino padrão", options: DEV_COLUNAS_TAREFA },
        { kind: "number", key: "pontosPadrao", label: "Story points padrão", min: 1, max: 100, suffix: "pts" },
        { kind: "number", key: "pontosMaximo", label: "Máximo de story points por tarefa", min: 1, max: 100, suffix: "pts" },
        { kind: "number", key: "capacidadePontos", label: "Capacidade do sprint", hint: "0 = sem limite. Quando o total de pontos do projeto passa disso, o contador do sprint fica em alerta.", min: 0, max: 10000, suffix: "pts" },
      ],
      validate: d => (Number(d.pontosPadrao) > Number(d.pontosMaximo) ? "O padrão de story points não pode ser maior que o máximo." : null),
    },
    {
      id: "issues",
      title: "Issues e bugs",
      subtitle: "Padrões do formulário de reporte de issue.",
      fields: [
        { kind: "select", key: "severidadePadrao", label: "Severidade padrão", options: DEV_SEVERIDADES },
        { kind: "tags", key: "labelsSugeridas", label: "Labels sugeridas", hint: "Aparecem como atalhos ao reportar uma issue." },
      ],
    },
    {
      id: "projetos",
      title: "Projetos",
      subtitle: "Padrões ao criar um novo projeto.",
      fields: [
        { kind: "select", key: "statusInicial", label: "Status inicial do projeto", options: DEV_STATUS_PROJETO },
        { kind: "tags", key: "stacksSugeridas", label: "Tecnologias sugeridas (stack)", hint: "Opções de seleção rápida no cadastro do projeto." },
      ],
    },
    {
      id: "repositorios",
      title: "Repositórios",
      subtitle: "Padrões ao criar um novo repositório.",
      fields: [
        { kind: "select", key: "visibilidadePadrao", label: "Visibilidade padrão", options: DEV_VISIBILIDADES },
        { kind: "tags", key: "linguagens", label: "Linguagens disponíveis" },
        { kind: "text", key: "linguagemPadrao", label: "Linguagem padrão", hint: "Precisa estar na lista de linguagens acima; senão usa a primeira." },
      ],
    },
  ],
};
