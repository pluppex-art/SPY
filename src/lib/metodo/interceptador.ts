/**
 * Ponto único por onde uma mudança de etapa passa antes de ser gravada. O MetodoProvider registra quem decide; sem
 * registro (ou fora do método) nada muda. Evita que o DataContext dependa das telas do método.
 */
export type Interceptador = (leadId: string, mudanca: Record<string, any>, aoConcluir?: () => void) => Record<string, any> | null;

let atual: Interceptador | null = null;

export function registrarInterceptador(f: Interceptador): () => void {
  atual = f;
  return () => { if (atual === f) atual = null; };
}

/**
 * Se a mudança é do método, abre a janela própria e devolve o que ainda deve ser gravado normalmente (talvez nada: {}).
 * `aoConcluir` roda só se a pessoa confirmar. Devolve null quando a mudança segue como sempre.
 */
export const interceptar: Interceptador = (leadId, mudanca, aoConcluir) => atual?.(leadId, mudanca, aoConcluir) ?? null;
