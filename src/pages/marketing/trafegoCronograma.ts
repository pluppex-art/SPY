// Cronograma e ritmo de gasto de uma campanha de tráfego. Só usa o que a campanha já tem (início, fim, orçamento): nada é inventado.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DIA = 86_400_000;
const emDias = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / DIA);

export type TomCronograma = "neutro" | "info" | "ok" | "alerta" | "perigo";

export interface Cronograma {
  /** Total de dias da campanha (início e fim contam); null sem as duas datas. */
  duracao: number | null;
  /** Dias já corridos (0 antes de começar); null sem início. */
  decorridos: number | null;
  /** 0–100; null sem as duas datas. */
  progresso: number | null;
  rotulo: string;
  tom: TomCronograma;
  /** Orçamento por dia (média planejada); null sem duração. */
  orcamentoPorDia: number | null;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** `encerrada`: a campanha já está na etapa de encerramento, então passar do fim é normal e não é alerta. */
export function calcularCronograma(c: { publishDateISO: string; endDateISO: string; value: number }, hojeISO: string, encerrada = false): Cronograma {
  const ini = ISO.test(c.publishDateISO) ? c.publishDateISO : "";
  const fim = ISO.test(c.endDateISO) ? c.endDateISO : "";
  const hoje = ISO.test(hojeISO) ? emDias(hojeISO) : null;
  if (!ini || hoje === null) {
    return { duracao: null, decorridos: null, progresso: null, rotulo: "Sem data de início", tom: "neutro", orcamentoPorDia: null };
  }
  const i = emDias(ini);
  const f = fim && emDias(fim) >= i ? emDias(fim) : null;
  const duracao = f === null ? null : f - i + 1;
  const decorridos = Math.max(0, hoje - i + 1);
  const orcamentoPorDia = duracao && c.value > 0 ? Math.round((c.value / duracao) * 100) / 100 : null;

  if (hoje < i) {
    return { duracao, decorridos: 0, progresso: duracao ? 0 : null, rotulo: `Começa em ${plural(i - hoje, "dia", "dias")}`, tom: "info", orcamentoPorDia };
  }
  if (f !== null && hoje > f) {
    return { duracao, decorridos: duracao, progresso: 100, rotulo: encerrada ? "Período concluído" : `Prazo vencido há ${plural(hoje - f, "dia", "dias")}`, tom: encerrada ? "ok" : "perigo", orcamentoPorDia };
  }
  if (f === null) return { duracao, decorridos, progresso: null, rotulo: `No ${decorridos}º dia, sem data final`, tom: "ok", orcamentoPorDia };
  const falta = f - hoje;
  return {
    duracao, decorridos, progresso: Math.min(100, Math.round((decorridos / (duracao as number)) * 100)),
    rotulo: falta === 0 ? "Último dia" : `Termina em ${plural(falta, "dia", "dias")}`,
    tom: falta <= 2 ? "alerta" : "ok", orcamentoPorDia,
  };
}

/** AAAA-MM-DD de hoje no horário de Brasília (a tela do usuário). */
export const hojeBrasilia = (agora = Date.now()) => new Date(agora - 3 * 3_600_000).toISOString().slice(0, 10);

export const dataCurta = (iso: string) => (ISO.test(iso) ? iso.split("-").reverse().join("/") : "—");
