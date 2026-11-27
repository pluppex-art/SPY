/**
 * Gera os vídeos de venda (VSL) do S.P.Y.
 *   node scripts/vsl/gerar.mjs varejo                  -> vídeo completo em scripts/vsl/saida/
 *   node scripts/vsl/gerar.mjs varejo --quadros 3,12   -> só imagens desses segundos, para conferir
 * Requer: macOS (comando say), ffmpeg e o playwright do projeto.
 */
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prepararAudio } from "./audio.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, "saida");
const FPS = 30;
const PARTES = Number(process.env.VSL_PARTES || 4);

const [nome, ...resto] = process.argv.slice(2);
const arquivoRoteiro = path.join(AQUI, "roteiros", `${nome}.js`);
if (!nome || !fs.existsSync(arquivoRoteiro)) {
  console.error("Uso: node scripts/vsl/gerar.mjs <varejo|consultiva> [--quadros 1,2,3]");
  process.exit(1);
}
fs.mkdirSync(SAIDA, { recursive: true });

// O roteiro é o mesmo arquivo no Node (falas e sons) e no navegador (telas).
const contexto = { window: {} };
contexto.window.window = contexto.window;
vm.createContext(contexto.window);
for (const f of [path.join(AQUI, "desenho.js"), arquivoRoteiro]) vm.runInContext(fs.readFileSync(f, "utf8"), contexto.window, { filename: f });
const roteiro = contexto.window.ROTEIRO;

console.log(`• narração e trilha de "${nome}"`);
const { tempos, trilhaWav } = prepararAudio(roteiro, AQUI, SAIDA);
console.log(`  duração: ${tempos.total.toFixed(1)} s em ${tempos.cenas.length} cenas`);

const navegador = await chromium.launch({ args: ["--allow-file-access-from-files", "--font-render-hinting=none"] });
async function abrir() {
  const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 } });
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(e.message));
  await pagina.goto(`${pathToFileURL(path.join(AQUI, "palco.html"))}?roteiro=${nome}`, { waitUntil: "networkidle" });
  if (erros.length) throw new Error(erros.join("\n"));
  await pagina.evaluate(async (t) => {
    window.montar(window.ROTEIRO, t);
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
    await Promise.all([...document.images].map((i) => i.decode().catch(() => { throw new Error(`imagem não abriu: ${i.src}`); })));
  }, tempos);
  return pagina;
}

const iQ = resto.indexOf("--quadros");
if (iQ >= 0) {
  const pagina = await abrir();
  for (const s of resto[iQ + 1].split(",").map(Number)) {
    await pagina.evaluate((t) => window.desenhar(t), s);
    const destino = path.join(SAIDA, `${nome}-${String(s).replace(".", "_")}s.jpg`);
    await pagina.screenshot({ path: destino, type: "jpeg", quality: 85 });
    console.log(destino);
  }
  await navegador.close();
  process.exit(0);
}

const quadros = Math.ceil(tempos.total * FPS);
const porParte = Math.ceil(quadros / PARTES);
let feitos = 0;
console.log(`• desenhando ${quadros} quadros em ${PARTES} partes`);
const pedacos = await Promise.all(Array.from({ length: PARTES }, async (_, p) => {
  const pagina = await abrir();
  const destino = path.join(SAIDA, `${nome}-parte${p}.mp4`);
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), destino], { stdio: ["pipe", "inherit", "inherit"] });
  const fim = new Promise((ok, erro) => ff.on("close", (c) => (c === 0 ? ok() : erro(new Error(`ffmpeg saiu com ${c}`)))));
  for (let q = p * porParte; q < Math.min(quadros, (p + 1) * porParte); q++) {
    await pagina.evaluate((t) => window.desenhar(t), q / FPS);
    const img = await pagina.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once("drain", r));
    if (++feitos % 300 === 0) console.log(`  ${feitos}/${quadros}`);
  }
  ff.stdin.end();
  await fim;
  await pagina.close();
  return destino;
}));
await navegador.close();

const lista = path.join(SAIDA, `${nome}-lista.txt`);
fs.writeFileSync(lista, pedacos.map((p) => `file '${p}'`).join("\n"));
const final = path.join(SAIDA, `spy-vsl-${nome}.mp4`);
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lista, "-i", trilhaWav,
  "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", final]);
for (const p of [...pedacos, lista]) fs.rmSync(p);
console.log(`✔ ${final} (${(fs.statSync(final).size / 1e6).toFixed(1)} MB)`);
