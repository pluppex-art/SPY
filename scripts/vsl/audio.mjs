/**
 * Narração, tempos e trilha. A duração de cada fala manda no tempo das cenas: trocar a voz e gerar de novo
 * realinha o vídeo inteiro. Voz própria: coloque o arquivo em scripts/vsl/voz/<vídeo>/<cena>-<n>.(wav|mp3|m4a).
 * Trilha e efeitos são sintetizados aqui (nada de música de terceiros).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SR = 48000;
const VOZ = process.env.VSL_VOZ || "Luciana";
const RITMO = Number(process.env.VSL_RITMO || 0); // 0 = ritmo definido pelo roteiro

/** Decodifica qualquer áudio para amostras mono de 48 kHz. */
function amostras(arquivo) {
  const bruto = execFileSync("ffmpeg", ["-v", "error", "-i", arquivo, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], { maxBuffer: 1 << 28 });
  return new Float32Array(bruto.buffer.slice(bruto.byteOffset, bruto.byteOffset + bruto.byteLength));
}

function narrar(texto, destino, ritmo) {
  execFileSync("say", ["-v", VOZ, "-r", String(RITMO || ritmo), "-o", destino, texto]);
}

/** Tira o silêncio das pontas para as marcas de tempo baterem com a fala. */
function aparar(a) {
  let i = 0, f = a.length - 1;
  while (i < f && Math.abs(a[i]) < 0.004) i++;
  while (f > i && Math.abs(a[f]) < 0.004) f--;
  return a.subarray(Math.max(0, i - 960), Math.min(a.length, f + 2400));
}

/**
 * Narração em blocos (ex.: ElevenLabs): voz/<vídeo>/bloco-1.mp3, bloco-2.mp3... com uma pausa longa entre as falas.
 * Junta os blocos na ordem e corta nas maiores pausas, uma fala por trecho. Para se não der para separar com segurança.
 */
function falasDosBlocos(pasta, quantas) {
  if (!fs.existsSync(pasta)) return null;
  const blocos = fs.readdirSync(pasta).filter((n) => /^bloco-\d+\.(wav|mp3|m4a)$/i.test(n))
    .sort((a, b) => parseInt(a.slice(6), 10) - parseInt(b.slice(6), 10));
  if (!blocos.length) return null;
  const emenda = new Float32Array(Math.round(SR * 1.2));
  const partes = blocos.flatMap((n, i) => [...(i ? [emenda] : []), aparar(amostras(path.join(pasta, n)))]);
  const tudo = new Float32Array(partes.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of partes) { tudo.set(p, pos); pos += p.length; }
  let pico = 0;
  for (const v of tudo) pico = Math.max(pico, Math.abs(v));
  const janela = SR / 100;
  const pausas = [];
  let inicio = null;
  for (let i = 0; i < tudo.length; i += janela) {
    let alto = 0;
    for (let k = i; k < Math.min(i + janela, tudo.length); k++) alto = Math.max(alto, Math.abs(tudo[k]));
    if (alto < pico * 0.025) inicio ??= i;
    else { if (inicio !== null && inicio > 0) pausas.push([inicio, i]); inicio = null; }
  }
  const cortes = pausas.sort((a, b) => b[1] - b[0] - (a[1] - a[0])).slice(0, quantas - 1);
  const menor = Math.min(...cortes.map(([a, b]) => (b - a) / SR));
  if (cortes.length < quantas - 1 || menor < 0.7) {
    throw new Error(`Não separei ${quantas} falas em ${blocos.length} bloco(s): achei ${cortes.filter(([a, b]) => (b - a) / SR >= 0.7).length + 1}. Confira se a pausa <break> ficou entre todas as falas.`);
  }
  cortes.sort((a, b) => a[0] - b[0]);
  const limites = [0, ...cortes.flat(), tudo.length];
  return Array.from({ length: quantas }, (_, i) => aparar(tudo.subarray(limites[i * 2], limites[i * 2 + 1])));
}

// ---------- síntese ----------
const nota = (semitom) => 440 * Math.pow(2, (semitom - 69) / 12);
function somar(destino, inicio, dur, gerar) {
  const i0 = Math.floor(inicio * SR);
  const n = Math.floor(dur * SR);
  for (let k = 0; k < n && i0 + k < destino.length; k++) if (i0 + k >= 0) destino[i0 + k] += gerar(k / SR);
}
let semente = 7;
const ruido = () => { semente = (semente * 16807) % 2147483647; return (semente / 2147483647) * 2 - 1; };

function trilha(total, bpm) {
  const m = new Float32Array(Math.ceil(total * SR));
  const t = 60 / bpm;
  const baixo = [40, 40, 43, 45, 47, 45, 43, 38, 36, 36, 40, 43, 45, 43, 40, 39];
  const acordes = [[52, 55, 59], [48, 52, 55], [45, 48, 52], [47, 51, 54]];
  for (let i = 0; i * t < total; i++) {
    const f = nota(baixo[i % baixo.length]);
    somar(m, i * t, t * 0.9, (x) => (Math.sin(2 * Math.PI * f * x) + 0.35 * Math.sin(4 * Math.PI * f * x)) * Math.exp(-5 * x) * Math.min(1, x * 200) * 0.5);
    let ant = 0;
    somar(m, i * t + t / 2, 0.06, (x) => { const r = ruido(); const alto = r - ant; ant = r; return alto * Math.exp(-70 * x) * 0.09; });
    if (i % 4 === 2) somar(m, i * t, 0.09, (x) => Math.sin(2 * Math.PI * 1900 * x) * Math.exp(-60 * x) * 0.07);
  }
  for (let c = 0; c * t * 4 < total; c++) {
    for (const s of acordes[c % acordes.length]) {
      const f = nota(s);
      const d = t * 4;
      somar(m, c * d, d, (x) => Math.sin(2 * Math.PI * f * x + 0.4 * Math.sin(2 * Math.PI * 0.7 * x)) * Math.min(1, x / 0.6, (d - x) / 0.6) * 0.09);
    }
  }
  return m;
}

const EFEITOS = {
  ding: (m, s) => { for (const [f, d] of [[1046, 0], [1568, 0.09]]) somar(m, s + d, 0.45, (x) => Math.sin(2 * Math.PI * f * x) * Math.exp(-9 * x) * 0.5); },
  pop: (m, s) => somar(m, s, 0.14, (x) => Math.sin(2 * Math.PI * (380 + 2600 * x) * x) * Math.exp(-28 * x) * 0.55),
  alerta: (m, s) => { for (const d of [0, 0.22]) somar(m, s + d, 0.18, (x) => (Math.sin(2 * Math.PI * 880 * x) + 0.5 * Math.sin(2 * Math.PI * 1320 * x)) * Math.exp(-10 * x) * 0.45); },
  vuush: (m, s) => { let y = 0; somar(m, s, 0.6, (x) => { y += (0.02 + 0.5 * x) * (ruido() - y); return y * Math.sin((Math.PI * x) / 0.6) * 0.5; }); },
  carimbo: (m, s) => { somar(m, s, 0.35, (x) => Math.sin(2 * Math.PI * (120 - 150 * x) * x) * Math.exp(-14 * x) * 0.9); somar(m, s, 0.05, (x) => ruido() * Math.exp(-80 * x) * 0.4); },
  tecla: (m, s) => { for (let i = 0; i < 14; i++) somar(m, s + i * 0.085, 0.03, (x) => ruido() * Math.exp(-190 * x) * 0.28); },
};

function gravarWav(arquivo, a) {
  const b = Buffer.alloc(44 + a.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + a.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(a.length * 2, 40);
  for (let i = 0; i < a.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, a[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(arquivo, b);
}

export function prepararAudio(roteiro, raiz, saida) {
  const pasta = path.join(saida, `falas-${roteiro.id}`);
  fs.mkdirSync(pasta, { recursive: true });
  const propria = path.join(raiz, "voz", roteiro.id);
  let relogio = 0;
  const vozes = [];
  const efeitos = [];
  const emBlocos = falasDosBlocos(propria, roteiro.cenas.reduce((s, c) => s + c.falas.length, 0));
  let ordem = 0;
  const cenas = roteiro.cenas.map((c) => {
    let t = c.entrada ?? 0.45;
    const falas = c.falas.map((f, n) => {
      const fala = typeof f === "string" ? { texto: f } : f;
      const gravada = ["wav", "mp3", "m4a"].map((e) => path.join(propria, `${c.id}-${n}.${e}`)).find((p) => fs.existsSync(p));
      const doBloco = emBlocos?.[ordem++];
      let arquivo = gravada;
      if (!arquivo && !doBloco) {
        arquivo = path.join(pasta, `${c.id}-${n}.aiff`);
        narrar(fala.dito || fala.texto, arquivo, roteiro.ritmo || 185);
      }
      const a = gravada || !doBloco ? aparar(amostras(arquivo)) : doBloco;
      const ini = t;
      const fim = ini + a.length / SR;
      t = fim + (fala.pausa ?? 0.22);
      vozes.push([relogio + ini, a]);
      return { ini, fim, legenda: fala.texto };
    });
    const dur = Math.max(c.minimo ?? 0, t + (c.cauda ?? 0.6));
    const cena = { id: c.id, ini: relogio, dur, falas };
    for (const [tipo, marca] of c.sons || []) {
      const m = typeof marca === "number" ? null : /^f(\d+)(\$)?([+-][\d.]+)?$/.exec(marca);
      const local = m ? (m[2] ? falas[+m[1]].fim : falas[+m[1]].ini) + Number(m[3] || 0) : marca;
      efeitos.push([tipo, relogio + local]);
    }
    relogio += dur;
    return cena;
  });

  const voz = new Float32Array(Math.ceil(relogio * SR));
  for (const [ini, a] of vozes) somar(voz, ini, a.length / SR, (x) => a[Math.round(x * SR)] || 0);
  let pico = 0;
  for (const v of voz) pico = Math.max(pico, Math.abs(v));
  const ganho = pico ? 0.82 / pico : 1;

  const musica = trilha(relogio, roteiro.bpm || 96);
  const fx = new Float32Array(voz.length);
  for (const [tipo, em] of efeitos) EFEITOS[tipo](fx, em);

  // a trilha abaixa quando há voz
  const mix = new Float32Array(voz.length);
  let presenca = 0;
  for (let i = 0; i < mix.length; i++) {
    const v = voz[i] * ganho;
    presenca = Math.max(Math.abs(v) > 0.02 ? 1 : 0, presenca - 1 / (SR * 0.5));
    const fade = Math.min(1, i / SR, (mix.length - i) / (SR * 1.5));
    mix[i] = v + (musica[i] || 0) * (0.34 - 0.2 * presenca) * fade + fx[i] * 0.4;
  }
  const trilhaWav = path.join(saida, `${roteiro.id}.wav`);
  gravarWav(trilhaWav, mix);
  const tempos = { total: relogio, cenas };
  fs.writeFileSync(path.join(saida, `${roteiro.id}-tempos.json`), JSON.stringify(tempos, null, 1));
  return { tempos, trilhaWav };
}
