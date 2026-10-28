import { getProposalMonthlyTotal, getProposalOneTimeTotal, getProposalDiscountRatio } from "./saleCalculator";

/** Como o valor de uma proposta é APRESENTADO ao cliente (página pública, documento e PDFs).
 *  Regra do produto: recorrente (mensalidade, tipo Netflix) mostra o valor do MÊS — nunca o
 *  total do contrato; parcelado é um total dividido em parcelas ("12x de R$ 997"), sem "/mês";
 *  à vista é o total. Item pontual de uma proposta recorrente (ex.: implantação) aparece à parte. */

export interface ItemParaValor {
  quantidade: number;
  precoUnitario: number;
  billingType?: string | null;
  contractMonths?: number | null;
}

export interface ResumoValorProposta {
  tipo: "recorrente" | "parcelado" | "avista";
  /** Título do bloco de valor ("Investimento mensal", "Investimento total"). */
  rotulo: string;
  valor: number;
  /** "/mês" para recorrente; vazio nos demais. */
  sufixo: string;
  /** Linha de apoio: "Recorrente · 12 ciclos de R$ 1.500,00 = R$ 18.000,00 no contrato", "12x de R$ 997,00", "Pagamento à vista". */
  detalhe: string;
  /** Pagamento único dentro de proposta recorrente (implantação etc.). */
  adicional?: { rotulo: string; valor: number };
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function resumoValorProposta(
  valorProposta: number | null | undefined,
  itens: ItemParaValor[],
  pagamento?: Record<string, any> | null,
): ResumoValorProposta {
  const linhas = (itens || []).map((i) => ({
    preco_unitario: i.precoUnitario,
    quantidade: i.quantidade,
    billing_type: i.billingType ?? null,
    contract_months: i.contractMonths ?? null,
  }));
  const valor = Number(valorProposta) || 0;
  const proporcao = getProposalDiscountRatio(valor, linhas);
  const mensal = getProposalMonthlyTotal(linhas) * proporcao;

  if (mensal > 0) {
    const meses = Math.max(0, ...linhas.map((l) => Number(l.contract_months) || 0));
    const unico = getProposalOneTimeTotal(linhas) * proporcao;
    return {
      tipo: "recorrente",
      rotulo: "Investimento mensal",
      valor: mensal,
      sufixo: "/mês",
      detalhe: meses > 1 ? `Recorrente · ${meses} ciclos de ${brl(mensal)} = ${brl(mensal * meses)} no contrato` : "Recorrente · sem prazo fixo",
      ...(unico > 0 ? { adicional: { rotulo: "Pagamento único (implantação)", valor: unico } } : {}),
    };
  }

  const total = valor > 0 ? valor : getProposalOneTimeTotal(linhas);
  const parcelas = pagamento?.formaPagamento === "parcelado" ? Math.round(Number(pagamento?.parcelas)) || 1 : 1;
  if (parcelas > 1) {
    return { tipo: "parcelado", rotulo: "Investimento total", valor: total, sufixo: "", detalhe: `${parcelas}x de ${brl(total / parcelas)}` };
  }
  return { tipo: "avista", rotulo: "Investimento total", valor: total, sufixo: "", detalhe: "Pagamento à vista" };
}
