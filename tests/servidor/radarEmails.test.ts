/** E-mails do Radar: leitura da pesquisa, e-mail no site da empresa e lista própria da campanha. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerResultadosDoRadar, melhorEmail, emailDoSite, baixarPagina, registerRadarEmailRoutes } from "../../server/radarEmails.js";
import { parseAudience, dedupeCandidates } from "../../server/emailCampaigns.js";
import { criarFakeDb, criarFakeApp } from "../agendamento/fakeDb.js";

test("pesquisa do Radar: lê o e-mail quando vem, no campo próprio ou no lugar do telefone", () => {
  const r = lerResultadosDoRadar([
    "3 empresa(s)",
    "- Clínica Sorriso — Rua A, Palmas — avaliação Google: 4.8 — contato: (63) 3000-0000 — site: https://sorriso.com.br — whatsapp_chatid: 6330000000@c.us",
    "- ACME LTDA (Acme) — Palmas/TO — contato: (63) 3111-1111 — email: Contato@Acme.com.br — CNPJ 123",
    "- BETA LTDA — Palmas/TO — contato: beta@gmail.com — CNPJ 456",
  ].join("\n"));
  assert.deepEqual(r.map((x) => [x.empresa, x.contato, x.email]), [["Clínica Sorriso", "(63) 3000-0000", ""], ["ACME LTDA (Acme)", "(63) 3111-1111", "contato@acme.com.br"], ["BETA LTDA", "", "beta@gmail.com"]]);
  assert.equal(r[0].whatsapp, "6330000000");
});

test("e-mail da página: prefere o do domínio, aceita gmail e ignora enfeite e terceiros soltos", () => {
  const html = `<img src="logo@2x.png"> <script>x="abc@sentry.io"</script> feito por dev@agencia.com.br  <a href="mailto:loja@gmail.com">e</a> comercial@empresa.com.br seuemail@exemplo.com`;
  assert.equal(melhorEmail(html, "www.empresa.com.br")?.email, "comercial@empresa.com.br");
  assert.equal(melhorEmail(`<a href="mailto:loja%40gmail.com">e</a> dev@agencia.com.br`, "empresa.com.br")?.email, "loja@gmail.com");
  assert.equal(melhorEmail("feito por dev@agencia.com.br", "empresa.com.br"), null);
  assert.equal(melhorEmail("noreply@empresa.com.br", "empresa.com.br"), null);
  // proteção do Cloudflare: primeiro byte é a chave
  const cf = "2a" + [..."oi@empresa.com.br"].map((c) => (c.charCodeAt(0) ^ 0x2a).toString(16).padStart(2, "0")).join("");
  assert.equal(melhorEmail(`<span data-cfemail="${cf}">[email]</span>`, "empresa.com.br")?.email, "oi@empresa.com.br");
});

test("site: procura na página de contato do mesmo site e não visita redes sociais", async () => {
  const vistas: string[] = [];
  const baixar = async (url: string) => {
    vistas.push(url);
    if (url.endsWith("/fale-conosco")) return { url, html: "vendas@empresa.com.br" };
    return { url: "https://empresa.com.br/", html: '<a href="/fale-conosco">Fale</a> <a href="https://outro.com/contato">x</a>' };
  };
  assert.equal(await emailDoSite("empresa.com.br", baixar), "vendas@empresa.com.br");
  assert.deepEqual(vistas, ["https://empresa.com.br/", "https://empresa.com.br/fale-conosco"]);
  assert.equal(await emailDoSite("https://instagram.com/loja", baixar), "");
  assert.equal(await emailDoSite("nao encontrado", baixar), "");
  assert.equal(vistas.length, 2);
});

test("site: destinos internos são recusados", async () => {
  for (const u of ["http://127.0.0.1/", "http://169.254.169.254/latest", "http://localhost/", "http://10.0.0.5/"]) await assert.rejects(() => baixarPagina(u), /permitid/i);
});

test("campanha: empresa da lista própria entra com o nome da empresa", () => {
  const aud = parseAudience({ leads: false, manual: [{ email: "A@x.com.br", name: "", company: "Acme" }] });
  assert.deepEqual(aud.manual, [{ email: "A@x.com.br", name: "", company: "Acme" }]);
  const { rows } = dedupeCandidates([{ id: "manual", email: "A@x.com.br", name: "", company: "Acme" }, { id: "manual", email: "a@x.com.br" }], new Set());
  assert.deepEqual(rows.map((r) => [r.email, r.company]), [["a@x.com.br", "Acme"]]);
});

test("rotas: só as empresas salvas da própria empresa, com e-mail válido; e-mails por site", async () => {
  const db = criarFakeDb({ radar_empresas_frias: [
    { id: "1", tenant_id: "T", razao_social: "ACME LTDA", nome_fantasia: "Acme", email: "oi@acme.com.br", municipio: "PALMAS", uf: "TO", created_at: "2026-11-02" },
    { id: "2", tenant_id: "T", razao_social: "SEM", email: null, created_at: "2026-11-03" },
    { id: "3", tenant_id: "OUTRA", razao_social: "ALHEIA", email: "x@alheia.com.br", created_at: "2026-11-04" },
  ] });
  const { app, chamar } = criarFakeApp();
  const passa = (_q: any, _s: any, n: any) => n?.();
  registerRadarEmailRoutes(app, { requireUser: passa, resolveRequestedTenantId: async () => "T", limiter: passa, supabaseService: db, baixar: async (url) => ({ url, html: "contato@acme.com.br" }) });
  const salvas = await chamar("GET", "/api/radar/empresas-salvas");
  assert.deepEqual(salvas.corpo.empresas, [{ empresa: "Acme", email: "oi@acme.com.br", detalhe: "PALMAS/TO" }]);
  const sites = await chamar("POST", "/api/radar/emails", { body: { sites: ["acme.com.br", "acme.com.br", ""] } });
  assert.deepEqual(sites.corpo.emails, { "acme.com.br": "contato@acme.com.br" });
  assert.equal((await chamar("POST", "/api/radar/emails", { body: {} })).status, 400);
});
