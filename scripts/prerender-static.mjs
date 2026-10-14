// Gera versões HTML estáticas das páginas institucionais (/privacidade, /termos) dentro de dist/.
// Motivo: o SPA só renderiza no navegador; robôs que não executam JavaScript (ex.: a verificação de
// app do Google) veem um HTML vazio. Aqui o texto completo vai no HTML bruto; quando o app carrega,
// o React (createRoot) substitui o conteúdo de #root e o usuário vê a página React normal.
// Roda no fim do `npm run build` e FALHA o build se dist/index.html não existir ou não tiver #root.
import { build } from "esbuild";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const dist = join(root, "dist");
const indexPath = join(dist, "index.html");
const SITE = "https://www.spycrm.com.br";

function fail(msg) {
  console.error(`\n[prerender-static] ERRO: ${msg}\n`);
  process.exit(1);
}

if (!existsSync(indexPath)) fail("dist/index.html não existe. Rode `vite build` antes do pré-render.");
const template = await readFile(indexPath, "utf8");
if (!/<div id="root"><\/div>/.test(template)) fail('dist/index.html não contém <div id="root"></div>.');

async function loadDoc(entry, exportName) {
  const out = join(tmpdir(), `spy-prerender-${exportName}-${process.pid}.mjs`);
  await build({ entryPoints: [join(root, entry)], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
  try {
    const mod = await import(pathToFileURL(out).href);
    const doc = mod[exportName];
    if (!doc || !Array.isArray(doc.sections) || !doc.sections.length) fail(`${entry} não exporta ${exportName} com seções.`);
    return doc;
  } finally {
    await rm(out, { force: true });
  }
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STYLE = `<style>
.spy-static{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0b1120;background:#fff;line-height:1.7;font-size:17px}
.spy-static *{box-sizing:border-box}
.spy-static header,.spy-static main,.spy-static footer{max-width:760px;margin:0 auto;padding:0 20px}
.spy-static header{padding-top:20px;padding-bottom:12px;border-bottom:1px solid #e2e8f0}
.spy-static header a{font-weight:700;font-size:20px;color:#c2410c;text-decoration:none}
.spy-static h1{font-size:34px;line-height:1.15;margin:32px 0 8px}
.spy-static h2{font-size:24px;line-height:1.25;margin:40px 0 12px}
.spy-static h3{font-size:18px;margin:22px 0 6px}
.spy-static p,.spy-static li{color:#334155}
.spy-static a{color:#c2410c}
.spy-static ul{padding-left:22px}
.spy-static nav ol{padding-left:22px;columns:1}
.spy-static code{font-size:14px;background:#f1f5f9;padding:2px 6px;border-radius:6px;overflow-wrap:anywhere}
.spy-static footer{margin-top:48px;padding-top:20px;padding-bottom:40px;border-top:1px solid #e2e8f0;font-size:15px}
.spy-static footer a{margin-right:16px}
.spy-static .upd{color:#475569;font-size:15px}
</style>`;

function renderBody(doc) {
  const toc = doc.sections.map((s) => `<li><a href="#${esc(s.id)}">${esc(s.title.replace(/^\d+\.\s*/, ""))}</a></li>`).join("");
  const sections = doc.sections
    .map((s) => `<section id="${esc(s.id)}"><h2>${esc(s.title)}</h2>${s.html.filter(Boolean).join("")}</section>`)
    .join("\n");
  return `${STYLE}<div class="spy-static">
<header><a href="/landing">S.P.Y.</a> <span class="upd">— spycrm.com.br</span></header>
<main id="conteudo">
<h1>${esc(doc.title)}</h1>
<p>${esc(doc.intro)}</p>
<p class="upd">Última atualização: ${esc(doc.updated)}</p>
<nav aria-label="Sumário"><h2>Nesta página</h2><ol>${toc}</ol></nav>
${sections}
</main>
<footer><a href="/privacidade">Política de privacidade</a><a href="/termos">Termos de uso</a><a href="/contato">Contato</a><a href="/landing">S.P.Y.</a></footer>
</div>`;
}

function render(doc) {
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(doc.metaTitle)}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(doc.metaDescription)}" />`);
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(doc.metaTitle)}" />`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(doc.metaDescription)}" />`);
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${SITE}/${doc.slug}" />`);
  html = html.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(doc.metaTitle)}" />`);
  html = html.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(doc.metaDescription)}" />`);
  html = html.replace(/<div id="root"><\/div>/, () => `<div id="root">${renderBody(doc)}</div>`);
  return html;
}

const pages = [
  ["src/pages/landing/pages/privacidadeContent.ts", "PRIVACIDADE"],
  ["src/pages/landing/pages/termosContent.ts", "TERMOS"],
];

for (const [entry, exportName] of pages) {
  const doc = await loadDoc(entry, exportName);
  const html = render(doc);
  const dir = join(dist, doc.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html, "utf8");
  console.log(`[prerender-static] dist/${doc.slug}/index.html (${doc.sections.length} seções, ${(html.length / 1024).toFixed(1)} KB)`);
}
