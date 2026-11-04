/** Motivos padrão (iguais para todos os clientes do SPY) de perda de lead e de cancelamento de contrato.
 *  O texto escolhido é gravado como está em `leads.lost_reason` / `contracts.cancel_reason`; "Outro" guarda o texto livre. */

export const MOTIVOS_PERDA_LEAD = [
  "Preço / sem orçamento",
  "Escolheu um concorrente",
  "Sem resposta / sumiu",
  "Sem interesse agora",
  "Fora do perfil",
  "Contato inválido ou duplicado",
] as const;

export const MOTIVOS_CANCELAMENTO = [
  "Preço / orçamento",
  "Foi para um concorrente",
  "Insatisfação com o serviço ou produto",
  "Não usa mais / não precisa mais",
  "Inadimplência",
  "Encerramento da empresa",
] as const;

export const MOTIVO_OUTRO = "Outro";

/** Junta a opção escolhida com o texto livre: "Outro: <texto>" quando for "Outro". Vazio vira null. */
export function montarMotivo(opcao: string, outroTexto: string): string | null {
  if (!opcao) return null;
  if (opcao !== MOTIVO_OUTRO) return opcao;
  const t = outroTexto.trim();
  return t ? `${MOTIVO_OUTRO}: ${t}` : MOTIVO_OUTRO;
}

/** Inverso de montarMotivo, para preencher o formulário com um motivo já salvo. */
export function separarMotivo(motivo: string | null | undefined, lista: readonly string[]): { opcao: string; outro: string } {
  if (!motivo) return { opcao: "", outro: "" };
  if (lista.includes(motivo)) return { opcao: motivo, outro: "" };
  if (motivo === MOTIVO_OUTRO) return { opcao: MOTIVO_OUTRO, outro: "" };
  if (motivo.startsWith(`${MOTIVO_OUTRO}: `)) return { opcao: MOTIVO_OUTRO, outro: motivo.slice(MOTIVO_OUTRO.length + 2) };
  return { opcao: MOTIVO_OUTRO, outro: motivo };
}

/** Agrupa um motivo para os gráficos: todos os "Outro: texto" viram "Outro". */
export function categoriaDoMotivo(motivo: string | null | undefined): string {
  if (!motivo) return "Sem motivo registrado";
  return motivo.startsWith(`${MOTIVO_OUTRO}:`) ? MOTIVO_OUTRO : motivo;
}
