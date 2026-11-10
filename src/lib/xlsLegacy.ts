// Leitor de planilhas Excel ANTIGAS (.xls, formato BIFF/OLE2 do Excel 97-2003) para o importador. Sem dependência
// externa: lê a PRIMEIRA planilha visível e devolve as células como texto (mesmo formato do leitor de .xlsx).
// Suporta texto (inclusive tabelas de strings grandes), números, datas/horas, booleanos e o resultado guardado de
// fórmulas. Não abre arquivo protegido por senha nem outros formatos (use .xlsx ou .csv nesses casos).

const FREESECT = 0xfffffffe;
const MAX_SECTORS = 1_000_000;

class XlsError extends Error {}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const f64 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset + o, 8).getFloat64(0, true);

// ─── Contêiner OLE2 (Compound File) ──────────────────────────────────────────

function readWorkbookStream(file: Uint8Array): Uint8Array {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (file.length < 512 || sig.some((v, i) => file[i] !== v)) throw new XlsError("não é um arquivo .xls válido");
  const sectorSize = 1 << u16(file, 30);
  const miniSize = 1 << u16(file, 32);
  if (sectorSize !== 512 && sectorSize !== 4096) throw new XlsError("formato de contêiner não suportado");
  const totalSectors = Math.floor(file.length / sectorSize);
  const dirStart = u32(file, 48);
  const miniCutoff = u32(file, 56);
  const miniFatStart = u32(file, 60);
  const difatStart = u32(file, 68);
  const numDifat = u32(file, 72);

  const sectorOff = (i: number) => (i + 1) * sectorSize;
  const inRange = (i: number) => i < totalSectors && sectorOff(i) + sectorSize <= file.length;

  // FAT: lista dos setores da FAT = 109 do cabeçalho + cadeia DIFAT.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) { const s = u32(file, 76 + i * 4); if (s < FREESECT && inRange(s)) fatSectors.push(s); }
  let dif = difatStart;
  for (let n = 0; n < numDifat && dif < FREESECT && inRange(dif); n++) {
    const base = sectorOff(dif);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) { const s = u32(file, base + i * 4); if (s < FREESECT && inRange(s)) fatSectors.push(s); }
    dif = u32(file, base + per * 4);
  }
  const fat: number[] = [];
  for (const s of fatSectors) for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(file, sectorOff(s) + i * 4));

  const chain = (start: number): number[] => {
    const out: number[] = [];
    let s = start;
    while (s < FREESECT && out.length < MAX_SECTORS) {
      if (!inRange(s)) throw new XlsError("estrutura do arquivo danificada");
      out.push(s);
      s = fat[s] ?? FREESECT;
    }
    return out;
  };
  const readChain = (start: number): Uint8Array => {
    const secs = chain(start);
    const out = new Uint8Array(secs.length * sectorSize);
    secs.forEach((s, i) => out.set(file.subarray(sectorOff(s), sectorOff(s) + sectorSize), i * sectorSize));
    return out;
  };

  // Diretório: acha a raiz (contém o "mini stream") e o stream "Workbook" (Excel 97+) ou "Book" (Excel 5/95).
  const dir = readChain(dirStart);
  let root: { start: number; size: number } | null = null;
  let wb: { start: number; size: number } | null = null;
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = u16(dir, o + 64);
    if (nameLen < 2 || nameLen > 64) continue;
    let name = "";
    for (let i = 0; i < nameLen / 2 - 1; i++) name += String.fromCharCode(u16(dir, o + i * 2));
    const type = dir[o + 66];
    const entry = { start: u32(dir, o + 116), size: u32(dir, o + 120) };
    if (type === 5 && !root) root = entry;
    if (type === 2 && /^(workbook|book)$/i.test(name) && !wb) wb = entry;
  }
  if (!wb) throw new XlsError("não encontrei a planilha dentro do arquivo");

  if (wb.size < miniCutoff) {
    if (!root) throw new XlsError("estrutura do arquivo danificada");
    const miniStream = readChain(root.start);
    const miniFatBytes = readChain(miniFatStart);
    const miniFat: number[] = [];
    for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) miniFat.push(u32(miniFatBytes, i));
    const out = new Uint8Array(Math.ceil(wb.size / miniSize) * miniSize);
    let s = wb.start, n = 0;
    while (s < FREESECT && n * miniSize < out.length && n < MAX_SECTORS) {
      if ((s + 1) * miniSize > miniStream.length) throw new XlsError("estrutura do arquivo danificada");
      out.set(miniStream.subarray(s * miniSize, (s + 1) * miniSize), n * miniSize);
      s = miniFat[s] ?? FREESECT; n++;
    }
    return out.subarray(0, wb.size);
  }
  return readChain(wb.start).subarray(0, wb.size);
}

// ─── Texto (BIFF) ────────────────────────────────────────────────────────────

const latin1 = new TextDecoder("windows-1252");
const utf16 = new TextDecoder("utf-16le");

/** Leitor da tabela de strings (SST), que se divide em vários registros CONTINUE; nos cortes, o trecho seguinte de um texto começa com 1 byte de flag. */
class SegReader {
  private si = 0;
  private pos = 0;
  constructor(private segs: Uint8Array[]) {}
  private ensure(): boolean {
    while (this.si < this.segs.length && this.pos >= this.segs[this.si].length) { this.si++; this.pos = 0; }
    return this.si < this.segs.length;
  }
  eof() { return !this.ensure(); }
  u8(): number { if (!this.ensure()) throw new XlsError("tabela de textos truncada"); return this.segs[this.si][this.pos++]; }
  u16(): number { const a = this.u8(); return a | (this.u8() << 8); }
  u32(): number { const a = this.u16(); return (a | (this.u16() << 16)) >>> 0; }
  skip(n: number) { while (n > 0) { if (!this.ensure()) return; const t = Math.min(n, this.segs[this.si].length - this.pos); this.pos += t; n -= t; } }
  /** Lê `cch` caracteres; cruzando um corte, relê o flag (comprimido/UTF-16) do novo trecho. */
  chars(cch: number, high: boolean): string {
    let out = "";
    while (cch > 0) {
      if (!this.ensure()) throw new XlsError("tabela de textos truncada");
      const seg = this.segs[this.si];
      const width = high ? 2 : 1;
      const can = Math.min(cch, Math.floor((seg.length - this.pos) / width));
      if (can > 0) {
        const bytes = seg.subarray(this.pos, this.pos + can * width);
        out += high ? utf16.decode(bytes) : latin1.decode(bytes);
        this.pos += can * width; cch -= can;
      }
      if (cch > 0) { // o texto continua no próximo CONTINUE
        this.si++; this.pos = 0;
        if (this.si >= this.segs.length) throw new XlsError("tabela de textos truncada");
        high = (this.segs[this.si][this.pos++] & 1) === 1;
      }
    }
    return out;
  }
}

/** XLUnicodeString de um registro comum: [cch][flags][...chars]. Devolve o texto e onde terminou. */
function readUStr(d: Uint8Array, o: number, cchBytes: 1 | 2): { s: string; end: number } {
  const cch = cchBytes === 2 ? u16(d, o) : d[o];
  o += cchBytes;
  const flags = d[o++];
  const high = (flags & 1) === 1;
  let cRun = 0, cbExt = 0;
  if (flags & 8) { cRun = u16(d, o); o += 2; }
  if (flags & 4) { cbExt = u32(d, o); o += 4; }
  const n = cch * (high ? 2 : 1);
  const bytes = d.subarray(o, o + n);
  return { s: high ? utf16.decode(bytes) : latin1.decode(bytes), end: o + n + cRun * 4 + cbExt };
}

// ─── Números e datas ─────────────────────────────────────────────────────────

const BUILTIN_DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateFormatString = (f: string) => /[dmyhs]/i.test(f.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "").replace(/General/gi, ""));

function rkValue(rk: number): number {
  let v: number;
  if (rk & 2) v = rk >> 2; // inteiro de 30 bits (com sinal)
  else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(4, (rk & 0xfffffffc) >>> 0, true);
    v = buf.getFloat64(0, true);
  }
  return rk & 1 ? v / 100 : v;
}

const two = (n: number) => String(n).padStart(2, "0");
function serialToDate(serial: number, date1904: boolean): string {
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(base + Math.round(serial * 86_400_000));
  if (Number.isNaN(d.getTime())) return String(serial);
  const hasTime = Math.abs(serial - Math.floor(serial)) > 1e-9;
  const day = `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
  const time = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}${d.getUTCSeconds() ? `:${two(d.getUTCSeconds())}` : ""}`;
  if (serial >= 0 && serial < 1) return time;
  return hasTime ? `${day} ${time}` : day;
}

function numText(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return String(Number(n.toPrecision(15)));
}

// ─── BIFF ────────────────────────────────────────────────────────────────────

function* records(wb: Uint8Array, start: number): Generator<{ id: number; d: Uint8Array }> {
  let o = start;
  while (o + 4 <= wb.length) {
    const id = u16(wb, o), len = u16(wb, o + 2);
    if (o + 4 + len > wb.length) return;
    yield { id, d: wb.subarray(o + 4, o + 4 + len) };
    o += 4 + len;
  }
}

/** Lê a 1ª planilha visível de um .xls e devolve as linhas como matriz de texto. */
export function readXlsMatrix(buffer: ArrayBuffer): string[][] {
  try {
    const wb = readWorkbookStream(new Uint8Array(buffer));

    // ── Globais: versão, planilhas, formatos, tabela de textos
    let biff8 = true, date1904 = false;
    const sheets: { off: number; type: number; state: number }[] = [];
    const xfFmt: number[] = [];
    const customFmt = new Map<number, string>();
    const sstSegs: Uint8Array[] = [];
    let inSst = false;
    let first = true;
    for (const r of records(wb, 0)) {
      if (first) { first = false; if (r.id !== 0x809) throw new XlsError("arquivo .xls fora do padrão"); biff8 = u16(r.d, 0) >= 0x0600; continue; }
      if (r.id === 0x2f) throw new XlsError("arquivo protegido por senha");
      if (r.id === 0x3c) { if (inSst) sstSegs.push(r.d); continue; }
      inSst = false;
      if (r.id === 0x0a) break; // fim das globais
      if (r.id === 0x22) date1904 = u16(r.d, 0) === 1;
      else if (r.id === 0x85) sheets.push({ off: u32(r.d, 0), state: r.d[4], type: r.d[5] });
      else if (r.id === 0xe0) xfFmt.push(u16(r.d, 2));
      else if (r.id === 0x41e) customFmt.set(u16(r.d, 0), biff8 ? readUStr(r.d, 2, 2).s : latin1.decode(r.d.subarray(3, 3 + r.d[2])));
      else if (r.id === 0xfc) { sstSegs.push(r.d); inSst = true; }
    }
    const sheet = sheets.find((s) => s.type === 0 && s.state === 0) ?? sheets.find((s) => s.type === 0);
    if (!sheet) throw new XlsError("não encontrei nenhuma planilha");

    // Tabela de textos
    const sst: string[] = [];
    if (sstSegs.length) {
      const rd = new SegReader(sstSegs);
      rd.u32(); // total de referências
      const unique = rd.u32();
      for (let i = 0; i < unique && !rd.eof(); i++) {
        const cch = rd.u16();
        const flags = rd.u8();
        const cRun = flags & 8 ? rd.u16() : 0;
        const cbExt = flags & 4 ? rd.u32() : 0;
        sst.push(rd.chars(cch, (flags & 1) === 1));
        rd.skip(cRun * 4 + cbExt);
      }
    }

    const isDate = (xf: number) => {
      const f = xfFmt[xf];
      if (f === undefined) return false;
      return BUILTIN_DATE_FMT.has(f) || (customFmt.has(f) && isDateFormatString(customFmt.get(f)!));
    };
    const numberCell = (n: number, xf: number) => (isDate(xf) ? serialToDate(n, date1904) : numText(n));

    // ── Planilha
    const cells = new Map<number, Map<number, string>>();
    let maxCol = 0;
    const put = (r: number, c: number, v: string) => {
      if (v === "" ) return;
      let row = cells.get(r); if (!row) { row = new Map(); cells.set(r, row); }
      row.set(c, v); if (c > maxCol) maxCol = c;
    };
    let pendingFormula: { r: number; c: number } | null = null;
    let started = false;
    for (const rec of records(wb, sheet.off)) {
      const { id, d } = rec;
      if (!started) { if (id !== 0x809) throw new XlsError("planilha fora do padrão"); started = true; continue; }
      if (id === 0x0a) break;
      if (id === 0xfd && d.length >= 10) put(u16(d, 0), u16(d, 2), sst[u32(d, 6)] ?? "");
      else if (id === 0x204 && d.length >= 8) put(u16(d, 0), u16(d, 2), biff8 ? readUStr(d, 6, 2).s : latin1.decode(d.subarray(8, 8 + u16(d, 6))));
      else if (id === 0x203 && d.length >= 14) put(u16(d, 0), u16(d, 2), numberCell(f64(d, 6), u16(d, 4)));
      else if (id === 0x27e && d.length >= 10) put(u16(d, 0), u16(d, 2), numberCell(rkValue(u32(d, 6)), u16(d, 4)));
      else if (id === 0xbd && d.length >= 6) {
        const row = u16(d, 0), c0 = u16(d, 2), n = Math.floor((d.length - 6) / 6);
        for (let i = 0; i < n; i++) put(row, c0 + i, numberCell(rkValue(u32(d, 4 + i * 6 + 2)), u16(d, 4 + i * 6)));
      } else if (id === 0x06 && d.length >= 14) { // fórmula: usa o resultado guardado
        const row = u16(d, 0), col = u16(d, 2), xf = u16(d, 4);
        if (d[12] === 0xff && d[13] === 0xff) {
          if (d[6] === 0) pendingFormula = { r: row, c: col }; // texto vem no registro STRING seguinte
          else if (d[6] === 1) put(row, col, d[8] ? "VERDADEIRO" : "FALSO");
        } else put(row, col, numberCell(f64(d, 6), xf));
      } else if (id === 0x207 && pendingFormula) {
        put(pendingFormula.r, pendingFormula.c, biff8 ? readUStr(d, 0, 2).s : latin1.decode(d.subarray(2, 2 + u16(d, 0))));
        pendingFormula = null;
      } else if (id === 0x205 && d.length >= 8 && d[7] === 0) put(u16(d, 0), u16(d, 2), d[6] ? "VERDADEIRO" : "FALSO");
    }

    const rowsIdx = [...cells.keys()].sort((a, b) => a - b);
    if (!rowsIdx.length) return [];
    const matrix: string[][] = [];
    for (let r = rowsIdx[0]; r <= rowsIdx[rowsIdx.length - 1]; r++) {
      const row = cells.get(r);
      const line: string[] = [];
      for (let c = 0; c <= maxCol; c++) line.push((row?.get(c) ?? "").trim());
      matrix.push(line);
    }
    return matrix;
  } catch (e) {
    if (e instanceof XlsError) throw new Error(`Não consegui ler este arquivo .xls (${e.message}). Abra no Excel e salve como .xlsx ou .csv.`);
    throw new Error("Não consegui ler este arquivo .xls. Abra no Excel e salve como .xlsx ou .csv.");
  }
}
