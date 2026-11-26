// ZIP sem compressão (método "store"), o suficiente para juntar arquivos que já vêm comprimidos (.gz, imagens).
// Sem dependência externa. Limite do formato simples: 4 GB e 65 535 arquivos.

const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Devolve os pedaços do ZIP (para montar um Blob sem copiar tudo de novo). */
export function montarZip(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array[] {
  if (arquivos.length > 0xffff) throw new Error("Arquivos demais para um ZIP só.");
  const partes: Uint8Array[] = [], central: Uint8Array[] = [];
  let posicao = 0;
  const cabecalho = (tamanho: number, campos: [number, number, 2 | 4][]) => {
    const b = new Uint8Array(tamanho), v = new DataView(b.buffer);
    for (const [onde, valor, bytes] of campos) bytes === 2 ? v.setUint16(onde, valor, true) : v.setUint32(onde, valor, true);
    return b;
  };
  for (const a of arquivos) {
    const nome = new TextEncoder().encode(a.nome), crc = crc32(a.dados), n = a.dados.length;
    if (posicao + n > 0xfffffff0) throw new Error("Backup grande demais para um ZIP só (limite de 4 GB). Use os links.");
    const local = cabecalho(30, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [12, 0x21, 2], [14, crc, 4], [18, n, 4], [22, n, 4], [26, nome.length, 2]]);
    partes.push(local, nome, a.dados);
    central.push(cabecalho(46, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [14, 0x21, 2], [16, crc, 4], [20, n, 4], [24, n, 4], [28, nome.length, 2], [42, posicao, 4]]), nome);
    posicao += local.length + nome.length + n;
  }
  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = cabecalho(22, [[0, 0x06054b50, 4], [8, arquivos.length, 2], [10, arquivos.length, 2], [12, tamanhoCentral, 4], [16, posicao, 4]]);
  return [...partes, ...central, fim];
}
