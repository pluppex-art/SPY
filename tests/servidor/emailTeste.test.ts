import { test } from "node:test";
import assert from "node:assert/strict";
import { mailDeTeste, marcaDaEmpresa } from "../../server/emailCampaigns.js";
import { montarRemetente } from "../../server/mailer.js";

test("o teste do servidor próprio sai com a marca da empresa, sem a do S.P.Y.", () => {
  const m = mailDeTeste({ nome: "Negocio <Fora>", cor: "#F97316", logo: null });
  assert.equal(m.subject, "Teste de envio — Negocio <Fora>");
  assert.match(m.html, /Negocio &lt;Fora&gt;/);
  assert.doesNotMatch(m.html + m.text, /S\.P\.Y/);
});

test("marca vem da empresa pedida; remetente sem nome ganha o nome dela", async () => {
  const pedidos: string[] = [];
  const db = { from: (t: string) => { const q: any = { select: () => q, eq: (c: string, v: string) => { if (c === "id" || c === "tenant_id") pedidos.push(v); return q; }, maybeSingle: async () => ({ data: t === "tenants" ? { name: "Loja", primary_color: "#000000" } : null }) }; return q; } };
  assert.deepEqual(await marcaDaEmpresa(db, "t2"), { nome: "Loja", cor: "#000000", logo: null });
  assert.deepEqual([...new Set(pedidos)], ["t2"]);
  assert.equal(montarRemetente("marketing@loja.com.br", "Loja"), '"Loja" <marketing@loja.com.br>');
});
