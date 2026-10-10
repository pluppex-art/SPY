// Configurações do módulo Varejo & PDV — um único documento por empresa em app_settings (chave "varejo_config").
// Genérico para qualquer loja: nada aqui é específico de um cliente. Os padrões reproduzem o comportamento
// que o PDV já tinha antes das configurações existirem, então quem não configurar nada não vê diferença.
import { useMemo } from "react";
import { useData } from "../contexts/DataContext";

export const FORMAS_PAGAMENTO = ["Dinheiro", "Pix", "Cartão de Crédito", "Cartão de Débito", "Misto", "A Prazo (Crediário)"] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export interface VarejoConfig {
  pdv: {
    exigirCliente: boolean;          // identificar o cliente em toda venda
    exigirVendedor: boolean;         // impedir venda no "Balcão" sem vendedor escolhido
    permitirVendaSemEstoque: boolean;
    descontoMaximoPct: number;       // 0–100; acima disso a venda é bloqueada (0 = sem desconto permitido)
    descontoLivre: boolean;          // true ignora o teto acima
    sons: boolean;
  };
  pagamentos: {
    habilitadas: FormaPagamento[];
    padrao: FormaPagamento;
    crediarioPrazoPadraoDias: number;
    crediarioExigeCliente: boolean;
  };
  estoque: {
    estoqueMinimoPadrao: number;     // usado quando o produto não tem mínimo próprio
    alertaEstoqueBaixo: boolean;
  };
  cupom: {
    mostrarDadosEmpresa: boolean;
    cabecalho: string;
    rodape: string;
    mensagemTroca: string;
    mostrarVendedor: boolean;
  };
  fiscal: {
    mostrarEspelhoNfce: boolean;     // aba "NFC-e" (espelho) no cupom
    exigirCpfNaNota: boolean;        // CPF/CNPJ do cliente obrigatório para finalizar a venda
    vincularItensAutomaticamente: boolean; // notas de entrada: casar itens com o catálogo por EAN/SKU/nome
    regimeTributario: "Simples Nacional" | "MEI" | "Lucro Presumido" | "Lucro Real";
    ambiente: "Homologação" | "Produção";
    serieNfce: number;
  };
  compras: {
    prazoEntregaPadraoDias: number;
    margemMinimaPct: number;         // aviso ao precificar abaixo disso
  };
}

export const VAREJO_CONFIG_KEY = "varejo_config";

export const DEFAULT_VAREJO_CONFIG: VarejoConfig = {
  pdv: { exigirCliente: false, exigirVendedor: false, permitirVendaSemEstoque: false, descontoMaximoPct: 100, descontoLivre: true, sons: true },
  pagamentos: { habilitadas: [...FORMAS_PAGAMENTO], padrao: "Dinheiro", crediarioPrazoPadraoDias: 30, crediarioExigeCliente: true },
  estoque: { estoqueMinimoPadrao: 5, alertaEstoqueBaixo: true },
  cupom: { mostrarDadosEmpresa: true, cabecalho: "", rodape: "Obrigado pela preferência!", mensagemTroca: "", mostrarVendedor: true },
  fiscal: { mostrarEspelhoNfce: true, exigirCpfNaNota: false, vincularItensAutomaticamente: true, regimeTributario: "Simples Nacional", ambiente: "Homologação", serieNfce: 1 },
  compras: { prazoEntregaPadraoDias: 7, margemMinimaPct: 0 },
};

/** Junta o que está salvo com os padrões (campos novos nunca quebram configurações antigas). */
export function mergeVarejoConfig(saved: Partial<VarejoConfig> | undefined | null): VarejoConfig {
  const s = (saved ?? {}) as any;
  const d = DEFAULT_VAREJO_CONFIG as any;
  const out: any = {};
  for (const k of Object.keys(d)) out[k] = { ...d[k], ...(s[k] ?? {}) };
  const hab = (out.pagamentos.habilitadas as string[]).filter((f): f is FormaPagamento => (FORMAS_PAGAMENTO as readonly string[]).includes(f));
  out.pagamentos.habilitadas = hab.length ? hab : [...FORMAS_PAGAMENTO];
  if (!out.pagamentos.habilitadas.includes(out.pagamentos.padrao)) out.pagamentos.padrao = out.pagamentos.habilitadas[0];
  return out as VarejoConfig;
}

export function useVarejoConfig(): VarejoConfig {
  const { appSettings } = useData();
  const saved = appSettings?.[VAREJO_CONFIG_KEY];
  return useMemo(() => mergeVarejoConfig(saved), [saved]);
}
