import { Sun } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { SOLAR_CONFIG_KEY, SOLAR_DEFAULTS } from "../../../lib/modules/solarConfig";

export const solarSettings: ModuleDef = {
  moduleId: "solar",
  title: "Energia Solar",
  icon: Sun,
  storeKey: SOLAR_CONFIG_KEY,
  defaults: SOLAR_DEFAULTS,
  sections: [
    {
      id: "dimensionamento",
      title: "Dimensionamento",
      subtitle: "Parâmetros da estimativa na Análise de Fatura (potência do sistema e economia).",
      fields: [
        { kind: "number", key: "hsp", label: "Horas de sol pleno (HSP)", hint: "Média diária de irradiação da sua região.", min: 1, max: 8, suffix: "h/dia" },
        { kind: "number", key: "eficienciaPct", label: "Eficiência do sistema", hint: "Considera perdas de cabos, inversor, sujeira e temperatura.", min: 50, max: 100, suffix: "%" },
        { kind: "number", key: "economiaPct", label: "Economia sobre a fatura", hint: "Parte da fatura que o sistema deve eliminar.", min: 1, max: 100, suffix: "%" },
      ],
    },
    {
      id: "projetos",
      title: "Projetos",
      subtitle: "Valores sugeridos ao cadastrar um projeto quando potência, geração ou valor não são informados.",
      fields: [
        { kind: "number", key: "potenciaPadraoKwp", label: "Potência padrão", min: 0.1, suffix: "kWp" },
        { kind: "number", key: "geracaoPorKwp", label: "Geração mensal por kWp", hint: "Estima a geração (kWh/mês) a partir da potência.", min: 1, suffix: "kWh/kWp" },
        { kind: "number", key: "precoPorKwp", label: "Preço por kWp", hint: "Estima o valor do contrato a partir da potência.", min: 1, suffix: "R$/kWp" },
      ],
    },
    {
      id: "distribuidoras",
      title: "Concessionárias e homologação",
      subtitle: "Lista de concessionárias usada em Projetos e Homologações.",
      fields: [
        { kind: "tags", key: "concessionarias", label: "Concessionárias", hint: "Aparecem nas listas de seleção." },
        { kind: "text", key: "padrao", label: "Concessionária padrão", hint: "Deve constar na lista acima." },
        { kind: "text", key: "prazoPadrao", label: "Prazo padrão da concessionária", hint: "Usado quando o protocolo é registrado sem prazo." },
      ],
    },
    {
      id: "operacao",
      title: "Vistorias e manutenções",
      subtitle: "Opções e valores padrão de vistorias e ordens de manutenção.",
      fields: [
        { kind: "tags", key: "servicos", label: "Tipos de serviço de manutenção" },
        { kind: "text", key: "potenciaPadrao", label: "Potência padrão da usina", hint: "Usada na manutenção quando a potência não é informada." },
        { kind: "tags", key: "tiposTelhado", label: "Tipos de telhado / solo" },
        { kind: "text", key: "responsavelPadrao", label: "Responsável padrão da vistoria", hint: "Usado quando nenhum responsável é informado." },
      ],
    },
  ],
};
