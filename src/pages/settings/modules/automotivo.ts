import { Car } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { AUTOMOTIVO_CONFIG_KEY, AUTOMOTIVO_DEFAULTS, FORMAS_PAGAMENTO_TROCA } from "../../../lib/modules/automotivoConfig";

export const automotivoSettings: ModuleDef = {
  moduleId: "automotivo",
  title: "Automotivo",
  icon: Car,
  storeKey: AUTOMOTIVO_CONFIG_KEY,
  defaults: AUTOMOTIVO_DEFAULTS,
  sections: [
    {
      id: "avaliacoes",
      title: "Avaliações de veículos",
      subtitle: "Regras da avaliação de veículos de entrada / compra.",
      fields: [
        { kind: "number", key: "ofertaPctFipe", label: "Oferta automática (% da FIPE)", hint: "Usada quando a oferta não é digitada: FIPE x este percentual.", min: 1, max: 150, suffix: "%" },
        { kind: "text", key: "avaliadorPadrao", label: "Vistoriador padrão", hint: "Preenche o campo ao abrir uma nova avaliação." },
        { kind: "text", key: "clientePadrao", label: "Nome quando o proprietário não é informado" },
        { kind: "toggle", key: "exigirFipe", label: "Exigir valor da Tabela FIPE" },
        { kind: "toggle", key: "exigirProprietario", label: "Exigir proprietário / cliente" },
      ],
      validate: (d) => (Number(d.ofertaPctFipe) > 0 ? null : "Informe um percentual de oferta maior que zero."),
    },
    {
      id: "testdrive",
      title: "Test-drives",
      subtitle: "Padrões e exigências ao agendar um test-drive.",
      fields: [
        { kind: "text", key: "horaPadrao", label: "Horário padrão (HH:MM)", hint: "Usado quando o horário não é escolhido.", placeholder: "14:00" },
        { kind: "toggle", key: "exigirCnh", label: "Exigir CNH validada para agendar", hint: "A caixa de CNH começa desmarcada e precisa ser confirmada." },
        { kind: "toggle", key: "exigirTelefone", label: "Exigir telefone do cliente" },
        { kind: "toggle", key: "exigirConsultor", label: "Exigir consultor acompanhante" },
      ],
      validate: (d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.horaPadrao ?? "")) ? null : "Horário inválido. Use o formato HH:MM."),
    },
    {
      id: "consignacao",
      title: "Consignações",
      subtitle: "Comissão e exigências no cadastro de veículos consignados.",
      fields: [
        { kind: "number", key: "comissaoPadraoPct", label: "Comissão padrão da loja", hint: "Preenche o campo ao abrir uma nova consignação.", min: 0, max: 100, suffix: "%" },
        { kind: "toggle", key: "exigirTelefone", label: "Exigir telefone do proprietário" },
        { kind: "toggle", key: "exigirValorPedido", label: "Exigir valor pedido" },
      ],
    },
    {
      id: "trocas",
      title: "Trocas",
      subtitle: "Padrões das negociações com veículo na entrada.",
      fields: [
        { kind: "select", key: "formaPagamentoPadrao", label: "Forma de pagamento padrão", options: FORMAS_PAGAMENTO_TROCA },
        { kind: "toggle", key: "exigirTelefone", label: "Exigir telefone do cliente" },
        { kind: "toggle", key: "exigirValorEntrada", label: "Exigir valor do veículo de entrada" },
      ],
    },
    {
      id: "painel",
      title: "Painel",
      subtitle: "O que aparece no painel geral.",
      fields: [
        { kind: "number", key: "testDrivesProximos", label: "Test-drives listados no painel", hint: "Quantidade de próximos test-drives exibidos.", min: 1, max: 20 },
      ],
    },
  ],
};
