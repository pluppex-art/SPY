/**
 * Módulos que têm um agente próprio no n8n, criado pelo agente de implementação na pasta do cliente.
 * (O Radar o próprio SPY cria; o Agente Interno usa um fluxo central; a Júlia nunca é copiada.)
 */
export const MODULOS_COM_AGENTE = ["agente_secreto", "aurora", "closer", "cs", "chatbot"] as const;

type Modulos = Record<string, unknown> | null | undefined;

export const modulosDeAgenteLigados = (modulos: Modulos): string[] => MODULOS_COM_AGENTE.filter((m) => modulos?.[m] === true);

/** Os que passaram de desligado (ou ausente) para ligado. */
export const modulosDeAgenteNovos = (antes: Modulos, depois: Modulos): string[] => modulosDeAgenteLigados(depois).filter((m) => antes?.[m] !== true);
