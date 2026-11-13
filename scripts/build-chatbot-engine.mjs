// Gera o corpo do motor do chatbot para colar no nó Code do workflow n8n "[SPY] Chatbot - Motor".
// Mesmo arquivo (src/lib/chatbot/engine.ts) que o simulador do editor e os testes usam.
// Uso: node scripts/build-chatbot-engine.mjs [arquivo-de-saida]
import { build } from "esbuild";
import { writeFileSync } from "node:fs";

const out = process.argv[2] || "dist/chatbot-engine.n8n.js";
const result = await build({
  entryPoints: ["src/lib/chatbot/engine.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "ChatbotEngine",
  target: "es2020",
  minify: true,
  charset: "utf8",
  legalComments: "none",
});
writeFileSync(out, result.outputFiles[0].text);
console.log(`${out}: ${result.outputFiles[0].text.length} bytes`);
