// Limite diário da pesquisa do Radar: cada empresa do sistema recebe no máximo LIMITE_POR_DIA resultados por dia.
// O contador fica em app_settings; a chave começa com "integracoes_" para só administradores poderem alterar.
import crypto from "node:crypto";

export const LIMITE_POR_DIA = 50;
const CHAVE = "integracoes_radar_uso";

/** O dia vira à meia-noite de Brasília. */
export const hojeBR = (agora: number = Date.now()) => new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);

type Uso = { dia: string; usados: number; marca: string };

async function ler(db: any, tenantId: string): Promise<Uso | null> {
  const { data, error } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", CHAVE).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as Uso) ?? null;
}

/** Troca o contador só se ninguém mexeu nele desde a leitura (duas buscas ao mesmo tempo não furam o limite). */
async function ajustar(db: any, tenantId: string, agora: number, mudar: (usados: number) => number): Promise<{ antes: number; depois: number }> {
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const atual = await ler(db, tenantId);
    const dia = hojeBR(agora);
    const antes = atual?.dia === dia ? Number(atual.usados) || 0 : 0;
    const depois = Math.max(0, mudar(antes));
    const value: Uso = { dia, usados: depois, marca: crypto.randomUUID() };
    if (!atual) {
      const { error } = await db.from("app_settings").insert({ tenant_id: tenantId, key: CHAVE, value });
      if (!error) return { antes, depois };
      continue;
    }
    const { data, error } = await db.from("app_settings").update({ value }).eq("tenant_id", tenantId).eq("key", CHAVE).eq("value->>marca", atual.marca).select("key");
    if (error) throw new Error(error.message);
    if (data?.length) return { antes, depois };
  }
  throw new Error("Não foi possível registrar o uso do Radar. Tente de novo.");
}

export async function restanteHoje(db: any, tenantId: string, agora: number = Date.now()): Promise<number> {
  const u = await ler(db, tenantId);
  return Math.max(0, LIMITE_POR_DIA - (u?.dia === hojeBR(agora) ? Number(u.usados) || 0 : 0));
}

/** Separa até `pedido` resultados da cota de hoje e devolve quantos foram concedidos (0 = acabou). */
export async function reservar(db: any, tenantId: string, pedido: number, agora: number = Date.now()): Promise<number> {
  const r = await ajustar(db, tenantId, agora, (usados) => Math.min(LIMITE_POR_DIA, usados + pedido));
  return r.depois - r.antes;
}

/** Devolve o que foi separado e não veio. */
export async function devolver(db: any, tenantId: string, sobra: number, agora: number = Date.now()): Promise<void> {
  if (sobra > 0) await ajustar(db, tenantId, agora, (usados) => usados - sobra);
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O endereço é mesmo da cidade pedida? Vale "…, Palmas - TO, …" (Maps) e "PALMAS/TO" (Receita). */
export function naCidade(endereco: string, cidade: string, uf: string): boolean {
  const c = semAcento(cidade.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[,\\-–]\\s*)${c}\\s*[-/–]\\s*${semAcento(uf)}(?![a-z])`).test(semAcento(endereco));
}
