import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Na Vercel o servidor roda em Node ESM puro: import relativo SEM ".js" derruba a função inteira (ERR_MODULE_NOT_FOUND) e todas
 * as rotas da API devolvem 500. Os testes com tsx e o build do Vite aceitam sem extensão, então este teste confere à mão:
 * todo arquivo alcançável a partir de server.ts / server/*.ts precisa importar com extensão.
 */
test("arquivos que o servidor carrega só usam import relativo com extensão (.js/.json)", () => {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const importsDe = (arq: string) => [...fs.readFileSync(arq, "utf8").matchAll(/(?:from|import)\s+["'](\.{1,2}\/[^"']+)["']/g)].map((m) => m[1]);
  const fila = [path.join(raiz, "server.ts"), ...fs.readdirSync(path.join(raiz, "server")).filter((f) => f.endsWith(".ts")).map((f) => path.join(raiz, "server", f))];
  const vistos = new Set<string>(); const ruins: string[] = [];
  while (fila.length) {
    const f = fila.pop()!;
    if (vistos.has(f) || !fs.existsSync(f)) continue;
    vistos.add(f);
    for (const imp of importsDe(f)) {
      const alvo = path.resolve(path.dirname(f), imp);
      if (/\.(js|json)$/.test(imp)) { const ts = alvo.replace(/\.js$/, ".ts"); if (imp.endsWith(".js")) for (const c of [ts, ts + "x"]) if (fs.existsSync(c)) { fila.push(c); break; } continue; }
      ruins.push(`${path.relative(raiz, f)} → ${imp}`);
      for (const c of [alvo + ".ts", alvo + ".tsx", path.join(alvo, "index.ts")]) if (fs.existsSync(c)) { fila.push(c); break; }
    }
  }
  assert.deepEqual(ruins, [], `import sem extensão (quebra na Vercel):\n${ruins.join("\n")}`);
  assert.ok(vistos.size > 20); // garante que o teste realmente percorreu o servidor
});
