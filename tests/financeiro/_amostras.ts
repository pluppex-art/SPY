// Gerador de textos de valor "plausíveis" (o que alguém digita ou cola de planilha): BR, EUA, só dígitos, com símbolo nas pontas.
export function amostrasValor(n: number, seed = 777): string[] {
  let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const dig = (k: number) => Array.from({ length: k }, () => Math.floor(rnd() * 10)).join("");
  const grupos = (sep: string) => { const g = Math.floor(rnd() * 3); return String(1 + Math.floor(rnd() * 999)) + Array.from({ length: g }, () => sep + dig(3)).join(""); };
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rnd() * 5);
    let base: string;
    if (k === 0) base = grupos(".") + (rnd() < 0.7 ? "," + dig(1 + Math.floor(rnd() * 2)) : "");       // 1.234.567,89
    else if (k === 1) base = grupos(",") + (rnd() < 0.7 ? "." + dig(1 + Math.floor(rnd() * 2)) : "");  // 1,234,567.89
    else if (k === 2) base = dig(1 + Math.floor(rnd() * 6));                                          // 123456
    else if (k === 3) base = dig(1 + Math.floor(rnd() * 5)) + "," + dig(1 + Math.floor(rnd() * 2));   // 1234,5
    else base = dig(1 + Math.floor(rnd() * 5)) + "." + dig(1 + Math.floor(rnd() * 2));                // 1234.50
    const pre = ["", "R$ ", "R$", "-", "R$ -", "(", " "][Math.floor(rnd() * 7)];
    const pos = pre === "(" ? ")" : ["", " ", "R$"][Math.floor(rnd() * 3)] ;
    out.push(pre + base + (pre === "(" ? pos : pos === "R$" ? "" : pos));
  }
  return out;
}
