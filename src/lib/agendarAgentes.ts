/**
 * Junta vários cliques seguidos em Admin > Módulos numa chamada só ao agente de implementação (por empresa).
 * Se o servidor pedir para aguardar (chamada recente), tenta de novo depois.
 */
export type RespostaAgentes = { status: "acionado" | "aguarde" | "ignorado" | "falhou"; segundos?: number; motivo?: string };

const pendentes = new Map<string, ReturnType<typeof setTimeout>>();

export function agendarAgentes(
  tenantId: string,
  chamar: (tenantId: string) => Promise<RespostaAgentes>,
  avisar: (r: RespostaAgentes) => void,
  atrasoMs = 5000,
  tentativas = 3,
): void {
  const anterior = pendentes.get(tenantId);
  if (anterior) clearTimeout(anterior);
  pendentes.set(tenantId, setTimeout(async () => {
    pendentes.delete(tenantId);
    let r: RespostaAgentes;
    try { r = await chamar(tenantId); } catch (e: any) { r = { status: "falhou", motivo: e?.message || "Sem conexão com o servidor." }; }
    if (r.status === "aguarde" && tentativas > 0) {
      // Um clique mais novo já agendou outra chamada: ela cobre esta.
      if (!pendentes.has(tenantId)) agendarAgentes(tenantId, chamar, avisar, ((r.segundos || 30) + 1) * 1000, tentativas - 1);
      return;
    }
    avisar(r.status === "aguarde" ? { status: "falhou", motivo: "O servidor continuou ocupado." } : r);
  }, atrasoMs));
}
