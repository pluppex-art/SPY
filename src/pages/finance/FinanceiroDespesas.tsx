import GenericFinanceiroList from "./GenericFinanceiroList";

/** Tudo o que sai — pago, a vencer, pendente ou atrasado (abas de status). Substitui as antigas Despesas + Contas a Pagar. */
export default function FinanceiroDespesas() {
  return (
    <GenericFinanceiroList
      title="Despesas"
      desc="Tudo o que sai — pago, a vencer, pendente ou atrasado. Use as abas de status para filtrar."
      type="Pagar"
    />
  );
}
