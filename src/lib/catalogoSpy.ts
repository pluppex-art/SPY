// Adicionais e módulos vendidos no checkout. O preço vem do catálogo (tabela products); aqui fica só o que cada
// item liga na empresa e as contas de mensal/anual, usadas igual no servidor e na tela.

export const DESCONTO_ANUAL = 20; // % sobre 12 mensalidades, pagas de uma vez (a implantação não muda)
export const QTD_MAXIMA = 50;
export type Ciclo = "monthly" | "yearly";

export interface DefinicaoItem { grupo: "adicional" | "modulo" | "segmento"; modulos: string[]; quantidade?: boolean }

const def = (grupo: DefinicaoItem["grupo"], modulos: string[], quantidade = false): DefinicaoItem => ({ grupo, modulos, quantidade });

/** SKU do produto → o que liga na empresa. `quantidade` = dá para comprar várias unidades. */
export const ITENS_SPY: Record<string, DefinicaoItem> = {
  "SPY-ADD-USUARIO": def("adicional", ["agente_secreto", "aurora"], true),
  "SPY-ADD-AURORA": def("adicional", ["aurora"], true),
  "SPY-ADD-RADAR": def("adicional", ["radar", "radar_grupos"]),
  "SPY-ADD-INTERNO": def("adicional", ["agente_interno"], true),
  "SPY-ADD-JULIA": def("adicional", ["julia"], true),
  "SPY-ADD-CLOSER": def("adicional", ["closer"]),
  "SPY-ADD-CS": def("adicional", ["cs"]),
  "SPY-MOD-FINANCEIRO": def("modulo", ["financeiro"]),
  "SPY-MOD-MARKETING": def("modulo", ["marketing"]),
  "SPY-MOD-CHATBOT": def("modulo", ["chatbot"]),
  "SPY-MOD-RH": def("modulo", ["rh"]),
  "SPY-MOD-ENGAJAMENTO": def("modulo", ["engajamento"]),
  "SPY-MOD-BI": def("modulo", ["bi"]),
  "SPY-MOD-AGENDAMENTO": def("modulo", ["agendamento"]),
  "SPY-MOD-IMOBILIARIA": def("segmento", ["imobiliaria"]),
  "SPY-MOD-AUTOMOTIVO": def("segmento", ["concessionaria", "automotivo"]),
  "SPY-MOD-VAREJO": def("segmento", ["varejo"]),
  "SPY-MOD-SOLAR": def("segmento", ["solar"]),
  "SPY-MOD-CLINICA": def("segmento", ["clinica"]),
  "SPY-MOD-EDUCACAO": def("segmento", ["educacao"]),
};

/** Item à venda, com o preço do catálogo. */
export interface ItemVenda { sku: string; nome: string; descricao: string; mensalCents: number; implCents: number }
/** Item dentro de um pedido ou de uma assinatura. */
export interface ItemPedido { sku: string; nome: string; qtd: number; mensalCents: number; implCents: number }

export const cicloValido = (v: unknown): Ciclo => (v === "yearly" ? "yearly" : "monthly");

/** Valor de um ciclo a partir da mensalidade: o próprio mês, ou o ano com desconto. */
export const precoDoCiclo = (mensalCents: number, ciclo: Ciclo) =>
  ciclo === "yearly" ? Math.round((mensalCents * 12 * (100 - DESCONTO_ANUAL)) / 100) : mensalCents;

const quantidadeDe = (sku: string, v: unknown) => (ITENS_SPY[sku]?.quantidade ? Math.min(QTD_MAXIMA, Math.max(0, Math.floor(Number(v) || 0))) : Number(v) > 0 ? 1 : 0);

/** Pedido vindo do navegador → itens válidos, com o preço do CATÁLOGO (nunca o enviado). Desconhecidos são ignorados. */
export function escolherItens(pedido: unknown, catalogo: ItemVenda[]): ItemPedido[] {
  const qtds = new Map<string, number>();
  for (const p of Array.isArray(pedido) ? pedido.slice(0, 60) : []) {
    const sku = String((p as any)?.sku ?? "");
    if (!Object.prototype.hasOwnProperty.call(ITENS_SPY, sku)) continue;
    qtds.set(sku, quantidadeDe(sku, (qtds.get(sku) ?? 0) + (Number((p as any)?.qtd ?? 1) || 0)));
  }
  return catalogo.flatMap((c) => {
    const qtd = qtds.get(c.sku) ?? 0;
    return qtd > 0 ? [{ sku: c.sku, nome: c.nome, qtd, mensalCents: c.mensalCents, implCents: c.implCents }] : [];
  });
}

/** Lê itens gravados no banco, descartando linhas estragadas. */
export function itensGravados(v: unknown): ItemPedido[] {
  return (Array.isArray(v) ? v : []).flatMap((i: any) => {
    const sku = String(i?.sku ?? "");
    const qtd = Math.floor(Number(i?.qtd) || 0);
    if (!ITENS_SPY[sku] || qtd < 1) return [];
    return [{ sku, nome: String(i.nome ?? sku), qtd, mensalCents: Math.max(0, Math.round(Number(i.mensalCents) || 0)), implCents: Math.max(0, Math.round(Number(i.implCents) || 0)) }];
  });
}

/** Renovação cobra o preço de hoje; item que saiu do catálogo mantém o preço gravado. */
export const reprecificar = (itens: ItemPedido[], catalogo: ItemVenda[]): ItemPedido[] =>
  itens.map((i) => {
    const c = catalogo.find((x) => x.sku === i.sku);
    return c ? { ...i, nome: c.nome, mensalCents: c.mensalCents, implCents: c.implCents } : i;
  });

export function somaItens(itens: ItemPedido[], ciclo: Ciclo) {
  return {
    recorrente: itens.reduce((s, i) => s + precoDoCiclo(i.mensalCents, ciclo) * i.qtd, 0),
    implantacao: itens.reduce((s, i) => s + i.implCents * i.qtd, 0),
  };
}

/** Módulos que os itens ligam, no formato de tenants.modules. */
export const modulosDosItens = (itens: { sku: string }[]): Record<string, true> =>
  Object.fromEntries(itens.flatMap((i) => ITENS_SPY[i.sku]?.modulos ?? []).map((m) => [m, true as const]));

/** Item de quantidade única cujos módulos a empresa já tem: não faz sentido vender de novo. */
export const jaAtivo = (sku: string, modulos: Record<string, unknown> | null | undefined) =>
  !!ITENS_SPY[sku] && !ITENS_SPY[sku].quantidade && ITENS_SPY[sku].modulos.every((m) => modulos?.[m] === true);

/** Soma uma compra ao que a assinatura já tinha. Nada é removido. */
export function unirItens(atuais: ItemPedido[], novos: ItemPedido[], modo: "somar" | "substituir"): ItemPedido[] {
  const mapa = new Map(atuais.map((i) => [i.sku, i]));
  for (const n of novos) {
    const a = mapa.get(n.sku);
    const qtd = a && modo === "somar" && ITENS_SPY[n.sku]?.quantidade ? a.qtd + n.qtd : n.qtd;
    mapa.set(n.sku, { ...n, qtd });
  }
  return [...mapa.values()];
}

const DIA = 86_400_000;
/** Compra no meio do período: cobra só os dias que faltam. Sem período em curso, cobra o ciclo inteiro. */
export function proporcional(valorDoCicloCents: number, fimDoPeriodo: string | null | undefined, ciclo: Ciclo, agora = Date.now()) {
  const fim = fimDoPeriodo ? new Date(fimDoPeriodo).getTime() : Number.NaN;
  if (!(fim > agora) || valorDoCicloCents <= 0) return Math.max(0, valorDoCicloCents);
  const fracao = Math.min(1, (fim - agora) / ((ciclo === "yearly" ? 365 : 30) * DIA));
  return Math.round(valorDoCicloCents * fracao);
}

/** Item que libera um módulo bloqueado (usado pelo cadeado). */
export function skuDoModulo(modulo: string): string | null {
  const direto: Record<string, string> = {
    aurora: "SPY-ADD-AURORA", agente_secreto: "SPY-ADD-USUARIO", radar: "SPY-ADD-RADAR", radar_grupos: "SPY-ADD-RADAR",
    concessionaria: "SPY-MOD-AUTOMOTIVO", automotivo: "SPY-MOD-AUTOMOTIVO",
  };
  return direto[modulo] ?? Object.keys(ITENS_SPY).find((sku) => ITENS_SPY[sku].modulos.includes(modulo)) ?? null;
}

/** Nome e resumo para a tela de bloqueio, mesmo quando o item ainda não está no catálogo. */
export const SOBRE_O_MODULO: Record<string, [nome: string, texto: string]> = {
  "SPY-ADD-USUARIO": ["Agente Secreto de Vendas", "Acompanha o WhatsApp conectado de cada vendedor e alimenta o funil."],
  "SPY-ADD-AURORA": ["Aurora", "Assistente de inteligência artificial que responde sobre a operação."],
  "SPY-ADD-RADAR": ["Radar de busca e grupos", "Busca empresas no Google Maps e acompanha os grupos de WhatsApp cadastrados."],
  "SPY-ADD-INTERNO": ["Agente Secreto Interno", "Transforma as mensagens dos grupos da equipe em tarefas, ordens de serviço e pedidos."],
  "SPY-ADD-JULIA": ["Júlia, vendedora de IA", "Atende e qualifica quem chega."],
  "SPY-ADD-CLOSER": ["Agente Closer", "Conduz o fechamento das vendas."],
  "SPY-ADD-CS": ["Sucesso do Cliente", "Acompanha os clientes depois da venda."],
  "SPY-MOD-FINANCEIRO": ["Financeiro", "Contas a pagar e a receber, cobranças, fluxo de caixa e DRE."],
  "SPY-MOD-MARKETING": ["Marketing", "Campanhas, conteúdo, analytics, landing pages e formulários."],
  "SPY-MOD-CHATBOT": ["Chatbot", "Atendimento automático por mensagens."],
  "SPY-MOD-RH": ["Equipe e RH", "Colaboradores, cargos e permissões de acesso."],
  "SPY-MOD-ENGAJAMENTO": ["Engajamento", "Chat, modelos de mensagem e automações de contato."],
  "SPY-MOD-BI": ["Inteligência e BI", "Indicadores e relatórios executivos."],
  "SPY-MOD-AGENDAMENTO": ["Agendamento online", "O cliente marca o horário por um link."],
  "SPY-MOD-IMOBILIARIA": ["Imobiliária", "Proprietários, captações, empreendimentos, corretores e visitas."],
  "SPY-MOD-AUTOMOTIVO": ["Automotivo", "Captações, avaliações, consignações, trocas e test-drives."],
  "SPY-MOD-VAREJO": ["Varejo", "Frente de caixa, estoque, fornecedores, compras e notas de entrada."],
  "SPY-MOD-SOLAR": ["Energia Solar", "Projetos, vistorias, análise de fatura, instalações e homologações."],
  "SPY-MOD-CLINICA": ["Clínica", "Agenda médica, pacientes, prontuários, telemedicina e faturamento."],
  "SPY-MOD-EDUCACAO": ["Educação", "Turmas, alunos, conteúdo, certificados e mensalidades."],
};
