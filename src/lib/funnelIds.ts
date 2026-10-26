/** Id de etapa de um funil do CRM — mesma convenção usada pelo Pipeline, Dashboard e Kanban:
 *  funis padrão têm ids legados; os criados pelo usuário usam `${funilId}-${índiceDaEtapa}`. */
export function getStageId(funilId: string, idx: number): string {
  if (funilId === "funil-comercial-default") return String(idx + 1);
  if (funilId === "funil-sdr-ia-default") return `sdr-${idx + 1}`;
  return `${funilId}-${idx}`;
}

/** Nomes das etapas de um funil (etapasConfig tem prioridade sobre a lista simples). */
export function funilStageNames(funil: any): string[] {
  if (Array.isArray(funil?.etapasConfig) && funil.etapasConfig.length > 0) return funil.etapasConfig.map((e: any) => e.nome);
  return Array.isArray(funil?.etapas) ? funil.etapas : [];
}

/** `pipelineId` gravado no lead: "sdr" para funis de SDR, "comercial" para os demais. */
export function pipelineIdDoFunil(funil: any): "sdr" | "comercial" {
  return funil?.tipo === "sdr_ia" ? "sdr" : "comercial";
}

/** Chave para comparar telefones escritos de jeitos diferentes: DDD + últimos 8 dígitos
 *  (ignora o 55, o 9 extra e formatação). Menos de 10 dígitos: os próprios dígitos. */
export function phoneKey(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length >= 10) return d.slice(0, 2) + d.slice(-8);
  return d;
}
