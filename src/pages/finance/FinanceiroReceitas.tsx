import GenericFinanceiroList from "./GenericFinanceiroList";

/** Tudo o que entra — recebido, a vencer, pendente ou atrasado (abas de status). Substitui as antigas Receitas + Contas a Receber. */
export default function FinanceiroReceitas() {
  return (
    <GenericFinanceiroList
      title="Receitas"
      desc="Tudo o que entra — recebido, a vencer, pendente ou atrasado. Use as abas de status para filtrar."
      type="Receber"
    />
  );
}
