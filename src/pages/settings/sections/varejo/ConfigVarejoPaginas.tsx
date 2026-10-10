import { FORMAS_PAGAMENTO } from "../../../../lib/varejoConfig";
import { VarejoConfigForm } from "./VarejoConfigForm";

export function ConfigVarejoPDV() {
  return (
    <VarejoConfigForm
      section="pdv"
      title="Caixa & PDV"
      subtitle="Regras da frente de caixa: o que é obrigatório numa venda e até onde o operador pode ir."
      validate={(d) => (d.descontoMaximoPct < 0 || d.descontoMaximoPct > 100 ? "O desconto máximo deve estar entre 0% e 100%." : null)}
      fields={[
        { kind: "toggle", key: "exigirCliente", label: "Exigir cliente na venda", hint: "Impede finalizar sem identificar o cliente." },
        { kind: "toggle", key: "exigirVendedor", label: "Exigir vendedor", hint: "Impede finalizar vendas no \"Balcão\" sem escolher um vendedor (comissão e relatórios)." },
        { kind: "toggle", key: "permitirVendaSemEstoque", label: "Permitir vender sem estoque", hint: "Útil para encomendas; o estoque pode ficar negativo." },
        { kind: "toggle", key: "descontoLivre", label: "Desconto livre", hint: "Desligue para limitar o desconto ao teto abaixo." },
        { kind: "number", key: "descontoMaximoPct", label: "Desconto máximo por venda", suffix: "%", min: 0, max: 100, hint: "Só vale com o desconto livre desligado." },
        { kind: "toggle", key: "sons", label: "Sons do PDV", hint: "Bipes de confirmação e erro no caixa." },
      ]}
    />
  );
}

export function ConfigVarejoPagamentos() {
  return (
    <VarejoConfigForm
      section="pagamentos"
      title="Formas de pagamento"
      subtitle="Quais formas aparecem no caixa e como funciona o crediário."
      validate={(d) => (d.habilitadas.length === 0 ? "Mantenha ao menos uma forma de pagamento." : null)}
      fields={[
        { kind: "multi", key: "habilitadas", label: "Formas habilitadas no caixa", options: [...FORMAS_PAGAMENTO] },
        { kind: "select", key: "padrao", label: "Forma padrão", options: [...FORMAS_PAGAMENTO], hint: "Já vem selecionada ao abrir uma venda (precisa estar habilitada)." },
        { kind: "number", key: "crediarioPrazoPadraoDias", label: "Prazo padrão do crediário", suffix: "dias", min: 1, max: 365 },
        { kind: "toggle", key: "crediarioExigeCliente", label: "Crediário exige cliente identificado", hint: "Recomendado: sem cliente não há como cobrar." },
      ]}
    />
  );
}

export function ConfigVarejoEstoque() {
  return (
    <VarejoConfigForm
      section="estoque"
      title="Estoque"
      subtitle="Mínimo padrão e alertas usados no controle de estoque."
      validate={(d) => (d.estoqueMinimoPadrao < 0 ? "O estoque mínimo não pode ser negativo." : null)}
      fields={[
        { kind: "number", key: "estoqueMinimoPadrao", label: "Estoque mínimo padrão", suffix: "unidades", min: 0, hint: "Vale para produtos que não têm mínimo próprio." },
        { kind: "toggle", key: "alertaEstoqueBaixo", label: "Alertar estoque baixo", hint: "Destaca os produtos que chegaram ao mínimo." },
      ]}
    />
  );
}

export function ConfigVarejoCupom() {
  return (
    <VarejoConfigForm
      section="cupom"
      title="Cupom & recibo"
      subtitle="O que aparece no comprovante impresso da venda."
      fields={[
        { kind: "toggle", key: "mostrarDadosEmpresa", label: "Mostrar dados da empresa", hint: "Razão social, CNPJ e endereço (vêm de Empresa → Dados da empresa)." },
        { kind: "text", key: "cabecalho", label: "Cabeçalho", placeholder: "Ex.: Loja Centro — Tel. (11) 0000-0000", multiline: true },
        { kind: "toggle", key: "mostrarVendedor", label: "Mostrar vendedor" },
        { kind: "text", key: "mensagemTroca", label: "Política de troca", placeholder: "Ex.: Trocas em até 7 dias com o cupom.", multiline: true },
        { kind: "text", key: "rodape", label: "Rodapé", placeholder: "Obrigado pela preferência!", multiline: true },
      ]}
    />
  );
}

export function ConfigVarejoCompras() {
  return (
    <VarejoConfigForm
      section="compras"
      title="Compras & preços"
      subtitle="Prazo padrão dos pedidos de compra e proteção de margem."
      validate={(d) => (d.margemMinimaPct < 0 || d.margemMinimaPct >= 100 ? "A margem mínima deve estar entre 0% e 99%." : null)}
      fields={[
        { kind: "number", key: "prazoEntregaPadraoDias", label: "Prazo de entrega padrão", suffix: "dias", min: 0 },
        { kind: "number", key: "margemMinimaPct", label: "Margem mínima de lucro", suffix: "%", min: 0, max: 99, hint: "Avisa ao precificar abaixo disso (0 = sem aviso)." },
      ]}
    />
  );
}

export function ConfigVarejoFiscal() {
  return (
    <VarejoConfigForm
      section="fiscal"
      title="Notas fiscais"
      subtitle="Como o módulo trata a nota fiscal de saída (NFC-e) na venda e a nota de entrada na compra."
      validate={(d) => (!Number.isInteger(d.serieNfce) || d.serieNfce < 1 ? "A série deve ser um número inteiro a partir de 1." : null)}
      fields={[
        { kind: "toggle", key: "exigirCpfNaNota", label: "Exigir CPF/CNPJ do cliente na nota", hint: "O caixa só finaliza a venda com o documento preenchido." },
        { kind: "toggle", key: "mostrarEspelhoNfce", label: "Mostrar espelho da NFC-e no cupom", hint: "Aba de pré-visualização da NFC-e depois da venda. É uma simulação: a emissão real na SEFAZ ainda não está ligada." },
        { kind: "toggle", key: "vincularItensAutomaticamente", label: "Vincular itens da nota de entrada ao catálogo", hint: "Ao importar o XML, casa cada item com o produto por código de barras, SKU ou nome (só quando não há dúvida)." },
        { kind: "select", key: "regimeTributario", label: "Regime tributário", options: ["Simples Nacional", "MEI", "Lucro Presumido", "Lucro Real"], hint: "Guardado para a emissão fiscal quando for ligada." },
        { kind: "select", key: "ambiente", label: "Ambiente de emissão", options: ["Homologação", "Produção"], hint: "Guardado para a emissão fiscal quando for ligada. Use Homologação para testes." },
        { kind: "number", key: "serieNfce", label: "Série da NFC-e", min: 1, hint: "Guardado para a emissão fiscal quando for ligada." },
      ]}
    />
  );
}
