// Carga e atualização das atividades de leads (a maior tabela que o app abre).
//
// Duas regras aqui evitam o "statement timeout" visto em produção (27/11/2026: milhares de erros 500 em um dia):
//  - paginar pela data, com cursor: o banco lê só o trecho de cada página. Com offset, cada página relia a empresa
//    inteira (60 mil linhas, uma conferência de permissão por linha) e várias páginas em paralelo estouravam o tempo;
//  - aviso ao vivo aplica só a linha que mudou: antes, cada atividade registrada fazia todo mundo baixar tudo de novo.

/** O histórico importado de outro CRM fica fora da carga geral e só entra ao abrir o lead. */
export const ehHistoricoImportado = (a: any) => String(a?.id ?? "").startsWith("kommo-evt-");

/** Banco usa `lead_id`; a tela lê `leadId`. Mais recentes primeiro. */
export const normalizarAtividades = <T = any>(linhas: any[]): T[] =>
  linhas.map((r) => ({ ...r, leadId: r.leadId ?? r.lead_id }))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))) as T[];

type Pagina = { data: any[] | null; error: any };

/**
 * Busca tudo, da mais nova para a mais antiga. `buscar(ate, pular)` traz uma página com created_at <= `ate`
 * (null = sem limite), em ordem de data e id, pulando as `pular` primeiras — que são as do mesmo instante já recebidas.
 * Se uma página falhar, devolve o que já chegou (as mais recentes) junto com o erro.
 */
export async function paginarPorData(buscar: (ate: string | null, pular: number) => Promise<Pagina>, tamanho = 1000): Promise<{ data: any[]; error: any }> {
  const tudo: any[] = [];
  let ate: string | null = null;
  let pular = 0;
  for (;;) {
    const { data, error } = await buscar(ate, pular);
    if (error) return { data: tudo, error };
    const pagina = data ?? [];
    tudo.push(...pagina);
    if (pagina.length < tamanho) return { data: tudo, error: null };
    const ultima: string | null = pagina[pagina.length - 1].created_at ?? null;
    if (!ultima || ultima === ate) { pular += pagina.length; continue; }
    pular = pagina.filter((r) => r.created_at === ultima).length;
    ate = ultima;
  }
}

export type EventoDeAtividade = { eventType: string; new?: any; old?: any };

/** Aplica um lote de avisos ao vivo na lista. Devolve a MESMA lista quando nada muda, para não redesenhar a tela. */
export function aplicarEventosDeAtividade<T extends { id: string }>(atual: T[], eventos: EventoDeAtividade[], tenantId: string): T[] {
  const mapa = new Map<string, any>(atual.map((a) => [a.id, a]));
  // Leads cujo histórico importado está aberto: só neles o histórico novo entra.
  let comHistorico: Set<string> | null = null;
  const abertos = () => (comHistorico ??= new Set((atual as any[]).filter(ehHistoricoImportado).map((a) => String(a.leadId))));
  let mudou = false;
  for (const e of eventos) {
    if (e.eventType === "DELETE") { if (e.old?.id && mapa.delete(e.old.id)) mudou = true; continue; }
    const linha = e.new;
    if (!linha?.id || linha.tenant_id !== tenantId) continue;
    const antes = mapa.get(linha.id);
    if (!antes && ehHistoricoImportado(linha) && !abertos().has(String(linha.lead_id))) continue;
    mapa.set(linha.id, { ...antes, ...linha, leadId: linha.lead_id ?? antes?.leadId });
    mudou = true;
  }
  return mudou ? normalizarAtividades<T>([...mapa.values()]) : atual;
}
