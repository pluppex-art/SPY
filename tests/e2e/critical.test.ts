/**
 * Testes de ponta a ponta dos fluxos críticos (SOMENTE LEITURA — nada é criado nem alterado).
 *
 * Rodar:  E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
 * Variáveis: E2E_BASE_URL (padrão http://localhost:5199 — suba antes com `npx vite --port 5199`),
 *            E2E_EMAIL / E2E_PASSWORD (usuário de teste; sem eles os testes com login são pulados),
 *            VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (lidos de .env.local se não vierem do ambiente).
 * Cobre: login, rotas principais sem erro, isolamento entre empresas (API e banco) e saúde do servidor.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

function loadEnvFile(path: string) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\n]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* arquivo opcional */ }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const BASE = process.env.E2E_BASE_URL || "http://localhost:5199";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const logged = Boolean(EMAIL && PASSWORD);

let browser: Browser;
let page: Page;
const jsErrors: string[] = [];
const badResponses: string[] = [];

before(async () => {
  browser = await chromium.launch();
  page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  page.on("pageerror", (e) => jsErrors.push(String(e).slice(0, 160)));
  page.on("response", (r) => {
    if (r.url().includes("supabase.co") && r.status() >= 400) badResponses.push(`${r.status()} ${r.url().split("/rest/v1/")[1]?.slice(0, 80) ?? r.url().slice(0, 90)}`);
  });
});
after(async () => { await browser?.close(); });

test("login leva ao app", { skip: !logged }, async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL!);
  await page.fill('input[type="password"]', PASSWORD!);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
  assert.match(page.url(), /\/app\//);
});

for (const rota of ["/app/dashboard", "/app/tarefas", "/app/automacoes", "/app/equipe", "/app/configuracoes"]) {
  test(`rota ${rota} abre sem erro de JS nem de banco`, { skip: !logged }, async () => {
    jsErrors.length = 0; badResponses.length = 0;
    await page.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.innerText.length > 400, null, { timeout: 90_000 });
    await page.waitForTimeout(3500);
    assert.deepEqual(jsErrors, [], `erros de JS: ${jsErrors.join(" | ")}`);
    assert.deepEqual([...new Set(badResponses)], [], `respostas >= 400 do banco: ${[...new Set(badResponses)].join(" | ")}`);
  });
}

test("API recusa empresa que a pessoa não pertence (isolamento)", { skip: !logged }, async () => {
  const token = await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (/^sb-.*-auth-token$/.test(k)) { try { return JSON.parse(localStorage.getItem(k) || "{}").access_token as string; } catch { return null; } }
    }
    return null;
  });
  assert.ok(token, "sem token de sessão");
  const estranha = "00000000-0000-4000-8000-000000000001";
  // Pessoa comum recebe 403. Conta master pode "visualizar" qualquer empresa (200), mas uma empresa que
  // não existe nunca pode devolver dados: lista vazia.
  const r = await fetch(`${BASE}/api/whatsapp/instances?tenantId=${estranha}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 200) {
    const corpo: any = await r.json();
    assert.ok(Array.isArray(corpo) && corpo.length === 0, "empresa inexistente devolveu dados");
  } else {
    assert.ok([400, 403, 404].includes(r.status), `devolveu ${r.status} (esperado 403 ou lista vazia)`);
  }
});

test("sem login não lê lead_funis nem chama funções de dados", { skip: !(SB_URL && SB_ANON) }, async () => {
  const h = { apikey: SB_ANON!, Authorization: `Bearer ${SB_ANON}` };
  const r1 = await fetch(`${SB_URL}/rest/v1/lead_funis?select=lead_id&limit=1`, { headers: h });
  const body = r1.ok ? await r1.json() : [];
  assert.ok(!r1.ok || (Array.isArray(body) && body.length === 0), "anônimo conseguiu ler lead_funis");
  const r2 = await fetch(`${SB_URL}/rest/v1/rpc/finalizar_venda`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ p_venda_id: "00000000-0000-4000-8000-000000000001" }) });
  assert.ok([401, 403, 404].includes(r2.status), `finalizar_venda anônimo devolveu ${r2.status}`);
});

test("saúde do servidor responde em JSON", async () => {
  const r = await fetch(`${BASE}/api/health/deep`);
  assert.ok([200, 503].includes(r.status));
  const j: any = await r.json();
  assert.ok("checks" in j && "ok" in j);
});
