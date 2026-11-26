/**
 * Filtro de período da janela "Indicadores". Compara sempre pelo DIA no fuso de quem está usando.
 * Aceita data pura (2026-11-26), data e hora ISO, dd/mm/aaaa, Date ou milissegundos.
 */
const doisDigitos = (n: number) => String(n).padStart(2, "0");
const diaDaData = (d: Date) => (Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`);
const valido = (ano: string, mes: string, dia: string) => (+mes >= 1 && +mes <= 12 && +dia >= 1 && +dia <= 31 ? `${ano}-${mes}-${dia}` : null);

export function diaLocal(valor: unknown): string | null {
  if (valor instanceof Date) return diaDaData(valor);
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? diaDaData(new Date(valor)) : null;
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(texto);
  if (iso) {
    const [, ano, mes, dia, resto] = iso;
    // Com fuso informado (Z ou +hh:mm), o instante pode cair em outro dia aqui.
    if (/^[T ]\d{2}.*(Z|[+-]\d{2}(:?\d{2})?)$/i.test(resto)) return diaDaData(new Date(texto.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")));
    return valido(ano, mes, dia);
  }
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
  return br ? valido(br[3], br[2], br[1]) : null;
}

/** Sem início nem fim, tudo entra. Com período, quem não tem data fica de fora. */
export function noPeriodo(valor: unknown, de: string | null, ate: string | null): boolean {
  if (!de && !ate) return true;
  const dia = diaLocal(valor);
  return !!dia && (!de || dia >= de) && (!ate || dia <= ate);
}

export function filtrarPorPeriodo<T>(lista: T[], data: (item: T) => unknown, de: string | null, ate: string | null): T[] {
  return !de && !ate ? lista : lista.filter((item) => noPeriodo(data(item), de, ate));
}
