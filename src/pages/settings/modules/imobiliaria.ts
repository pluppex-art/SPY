import { Building2 } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { IMOBILIARIA_CONFIG_KEY, IMOBILIARIA_DEFAULTS } from "../../../lib/modules/imobiliariaConfig";

export const imobiliariaSettings: ModuleDef = {
  moduleId: "imobiliaria",
  title: "Imobiliária",
  icon: Building2,
  storeKey: IMOBILIARIA_CONFIG_KEY,
  defaults: IMOBILIARIA_DEFAULTS,
  sections: [
    {
      id: "comissoes",
      title: "Comissões",
      subtitle: "Valores sugeridos ao registrar uma nova comissão / split.",
      fields: [
        { kind: "number", key: "percentualTotal", label: "Comissão total padrão", suffix: "%", min: 0, max: 100, hint: "Percentual sobre o valor da venda." },
        { kind: "number", key: "splitCorretor", label: "Repasse padrão ao corretor", suffix: "%", min: 0, max: 100, hint: "Parte da comissão que fica com o corretor; o resto é da imobiliária." },
        { kind: "select", key: "statusInicial", label: "Status inicial", options: ["A Receber", "Em Tramitação", "Liquidada"] },
      ],
      validate: (d) => (d.percentualTotal < 0 || d.percentualTotal > 100 || d.splitCorretor < 0 || d.splitCorretor > 100 ? "Os percentuais devem estar entre 0% e 100%." : null),
    },
    {
      id: "imoveis",
      title: "Cadastro de imóveis",
      subtitle: "Tipos disponíveis e valores iniciais do formulário de novo imóvel.",
      fields: [
        { kind: "tags", key: "tipos", label: "Tipos de imóvel", hint: "Aparecem no cadastro e no filtro de imóveis." },
        { kind: "select", key: "operacaoPadrao", label: "Operação padrão", options: ["Venda", "Locação"] },
        { kind: "number", key: "quartosPadrao", label: "Quartos padrão", min: 0, max: 50 },
        { kind: "number", key: "banheirosPadrao", label: "Banheiros padrão", min: 0, max: 50 },
        { kind: "number", key: "vagasPadrao", label: "Vagas padrão", min: 0, max: 50 },
      ],
      validate: (d) => (!d.tipos || d.tipos.length === 0 ? "Mantenha ao menos um tipo de imóvel." : null),
    },
    {
      id: "visitas",
      title: "Visitas",
      subtitle: "Valores iniciais ao agendar uma visita.",
      fields: [
        { kind: "text", key: "horaPadrao", label: "Horário padrão", placeholder: "10:00", hint: "Formato HH:MM." },
        { kind: "select", key: "statusInicial", label: "Status inicial", options: ["Agendada", "Confirmada"] },
      ],
      validate: (d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.horaPadrao ?? "")) ? null : "Informe o horário no formato HH:MM."),
    },
  ],
};
