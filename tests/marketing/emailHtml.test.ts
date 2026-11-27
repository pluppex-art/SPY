import { test } from "node:test";
import assert from "node:assert/strict";
import { ehHtml, comoHtml, conferirCorpo, sanitizarHtml, trocarLinks, htmlParaTexto, avisosDoHtml, modeloExemploHtml, comOpcaoDeLogo, lerOpcaoDeLogo, imagemEmHtml, imagemEmTexto, inserirNoHtml, abrirConteudo, corpoDoConteudo, conteudoVazio, MAX_HTML } from "../../src/lib/emailHtml.js";
import { avisosDoEmail } from "../../src/lib/avisosEmail.js";
import { buildMail } from "../../server/emailCampaigns.js";
import { parsePassos } from "../../server/emailSequences.js";

const base = { subject: "Oi {{primeiro_nome}}", name: "Maria Silva", company: "Loja", tenantName: "Empresa X", unsubUrl: "https://s.com/sair?t=1&e=2", utmCampanha: "Natal", track: { base: "https://s.com", rid: "11111111-1111-1111-1111-111111111111" } };

test("reconhece HTML pelo começo; texto comum continua texto", () => {
  for (const h of ["<!doctype html><p>a</p>", "  <html>", "<!-- c -->\n<table>", "﻿<div>x</div>", "<p style='x'>a</p>", "<center>"]) assert.equal(ehHtml(h), true, h);
  for (const t of ["Olá <b>Maria</b>", "<3 obrigado", "<promoção> hoje", "Veja: <div>", ""]) assert.equal(ehHtml(t), false, t);
  assert.equal(ehHtml(comoHtml("Olá <b>x</b>")), true);
  assert.equal(comoHtml(""), "");
});

test("texto longo é cortado como antes; HTML grande demais é recusado em vez de cortado", () => {
  const t = conferirCorpo("a".repeat(30_000)); assert.ok(t.ok && t.corpo.length === 20_000);
  const h = conferirCorpo(`<div>${"a".repeat(50_000)}</div>`); assert.ok(h.ok && h.corpo.length === 50_011);
  const g = conferirCorpo(`<div>${"a".repeat(MAX_HTML)}</div>`); assert.equal(g.ok, false);
  assert.equal(parsePassos([{ subject: "s", body: `<div>${"a".repeat(MAX_HTML)}</div>` }]).ok, false);
});

test("tira script, evento, formulário e link perigoso, sem mexer no resto", () => {
  const sujo = `<div onclick="x()" data-on="1"><scr<script></script>ipt>alert(1)</script><img src="https://a.com/i.png" onerror=alert(1)><a href=" java\tscript:alert(1)">x</a><a href="&#106;avascript:1">y</a><form action="https://m.com"><input name="s"><p title="onload=1">fica</p></form><iframe src="https://m.com"></iframe><meta http-equiv="refresh" content="0;url=x"></div>`;
  const limpo = sanitizarHtml(sujo);
  assert.doesNotMatch(limpo, /<script|onclick|onerror|javascript|<form|<input|<iframe|refresh/i);
  assert.match(limpo, /data-on="1"/);
  assert.match(limpo, /title="onload=1">fica/);
  assert.match(limpo, /src="https:\/\/a\.com\/i\.png"/);
});

test("troca só os links da internet em <a> e <area>", () => {
  const h = `<link href="https://f.com/x.css"><a class="b" href="https://a.com/?x=1&amp;y=2">A</a><a href='mailto:a@b.com'>m</a><area href=https://c.com><img src="https://i.com/a.png">`;
  const vistos: string[] = [];
  const novo = trocarLinks(h, (u) => { vistos.push(u); return `https://t.com/?u=1&v=2`; });
  assert.deepEqual(vistos, ["https://a.com/?x=1&y=2", "https://c.com"]);
  assert.match(novo, /<link href="https:\/\/f\.com\/x\.css">/);
  assert.match(novo, /href="https:\/\/t\.com\/\?u=1&amp;v=2"/);
});

test("envio: dados da pessoa escapados, cliques contados, descadastro no lugar escolhido e pixel", () => {
  const body = `<!doctype html><html><head><style>.a{}</style></head><body><h1>Olá {{primeiro_nome}} da {{empresa}}</h1><a href="https://loja.com/oferta">Ver</a> <a href="{{descadastro}}">sair</a></body></html>`;
  const m = buildMail({ ...base, body, company: "<img src=x onerror=1> & Cia" });
  assert.equal(m.subject, "Oi Maria");
  assert.match(m.html, /Olá Maria da &lt;img src=x onerror=1&gt; &amp; Cia/);
  assert.match(m.html, /href="https:\/\/s\.com\/api\/email\/c\/1111/);
  assert.match(m.html, /href="https:\/\/s\.com\/sair\?t=1&amp;e=2">sair/);
  assert.doesNotMatch(m.html, /Não quero mais receber/);
  assert.match(m.html, /\/api\/email\/o\/1111[^"]*"[^>]*><\/body><\/html>$/);
  assert.match(m.text, /Olá Maria da/);
  assert.match(m.text, /Ver \(https:\/\/loja\.com\/oferta\)/);
  assert.match(m.text, /sair \(https:\/\/s\.com\/sair/);
  assert.doesNotMatch(m.text, /\.a\{\}|api\/email\/c/);
});

test("sem o marcador num link, o rodapé de saída é sempre acrescentado; pedaço de HTML vira documento", () => {
  for (const body of ["<div>Olá</div>", "<div>Saia em {{descadastro}}</div>", `<div><!-- <a href="x"> -->Olá</div>`, `<div data-href="{{descadastro}}">Olá</div>`]) {
    const m = buildMail({ ...base, body, track: undefined });
    assert.match(m.html, /^<!doctype html>/, body);
    assert.match(m.html, /Não quero mais receber/, body);
    assert.doesNotMatch(m.html, /\u0001|\{\{|api\/email\/o\//, body);
  }
});

test("avisos do HTML e modelo de exemplo prontos para enviar", () => {
  const a = avisosDoHtml(`<div><img src="foto.png"><img src="data:image/png;base64,AA"><script></script></div>`).map((x) => x.texto).join(" | ");
  assert.match(a, /2 imagem\(ns\) não vão aparecer/); assert.match(a, /serão removidos/); assert.match(a, /Quase sem texto/);
  const modelo = modeloExemploHtml({ nome: "A & B", cor: "vermelho", logo: "javascript:1" });
  assert.equal(ehHtml(modelo), true);
  assert.match(modelo, /A &amp; B/); assert.doesNotMatch(modelo, /javascript|vermelho/);
  assert.deepEqual(avisosDoHtml(modelo), []);
  assert.match(buildMail({ ...base, body: modelo }).html, /Quero saber mais/);
  assert.doesNotMatch(htmlParaTexto(modelo), /</);
});

test("mensagem de texto continua como antes", () => {
  const m = buildMail({ ...base, body: "Olá {{nome}}\n\n**oferta** <b>não é html</b>" });
  assert.match(m.html, /<strong>oferta<\/strong> &lt;b&gt;não é html&lt;\/b&gt;/);
});

test("logo: aparece no texto por padrão e some quando desligada; no HTML só entra quando pedida", () => {
  const com = { ...base, track: undefined, tenantLogo: "https://cdn.x.com/logo.png" };
  assert.match(buildMail({ ...com, body: "Olá" }).html, /logo\.png/);
  const sem = comOpcaoDeLogo("Olá {{nome}}", false);
  assert.deepEqual(lerOpcaoDeLogo(sem), { conteudo: "Olá {{nome}}", mostrar: false });
  const m = buildMail({ ...com, body: sem });
  assert.doesNotMatch(m.html + m.text, /logo\.png|sem_logo/);
  const html = "<!doctype html><html><body style=\"margin:0\"><p>Oi</p></body></html>";
  assert.doesNotMatch(buildMail({ ...com, body: html }).html, /logo\.png/);
  const pedida = comOpcaoDeLogo(html, true);
  assert.equal(ehHtml(pedida), true);
  assert.deepEqual(lerOpcaoDeLogo(pedida), { conteudo: html, mostrar: true });
  assert.equal(comOpcaoDeLogo(pedida, true), pedida);
  assert.match(buildMail({ ...com, body: pedida }).html, /<body style="margin:0"><div[^>]*><p[^>]*><img src="https:\/\/cdn\.x\.com\/logo\.png"/);
  assert.doesNotMatch(buildMail({ ...com, tenantLogo: null, body: pedida }).html, /<img src="https:\/\/cdn/);
  assert.equal(comOpcaoDeLogo("  ", false), "");
});

test("imagem no texto: aparece, o clique é contado no link e o endereço da foto não é rastreado", () => {
  const url = "https://abc.supabase.co/storage/v1/object/public/products/t1/email/a.jpg";
  const m = buildMail({ ...base, body: `Veja\n\n${imagemEmTexto(url, "Tênis [novo]", "https://loja.com/t?a=1&b=2")}\n\n${imagemEmTexto(url, "Só foto")}` });
  assert.equal(m.html.split(`<img src="${url}"`).length - 1, 2);
  assert.match(m.html, /<a href="https:\/\/s\.com\/api\/email\/c\/[^"]+"><img src="[^"]+" alt="Tênis {2}novo"/);
  assert.match(m.text, /Tênis {2}novo: https:\/\/loja\.com\/t\?a=1&b=2/);
  assert.doesNotMatch(m.text, /supabase/);
  assert.equal(avisosDoEmail("Oi", imagemEmTexto(url, "x")).some((a) => /muitos links/.test(a.texto)), false);
});

test("imagem no HTML: entra no cursor sem partir marcação, ou antes do fim", () => {
  const trecho = imagemEmHtml("https://a.com/i.png", "A \"B\"", "https://a.com/?x=1&y=2");
  assert.match(trecho, /alt="A &quot;B&quot;"/); assert.match(trecho, /href="https:\/\/a\.com\/\?x=1&amp;y=2"/);
  const doc = "<html><body><p>um</p></body></html>";
  assert.match(inserirNoHtml(doc, "[X]"), /<\/p>\n\[X\]\n<\/body>/);
  assert.match(inserirNoHtml(doc, "[X]", doc.indexOf("um")), /<p>\n\[X\]\num<\/p>/);
  assert.match(inserirNoHtml(doc, "[X]", doc.indexOf("<p>") + 2), /<p>\n\[X\]\num<\/p>/);
  assert.equal(inserirNoHtml("", "[X]"), "<div>[X]</div>");
});

test("sequência: o que foi gravado reabre no editor e volta igual", () => {
  for (const corpo of ["Olá {{nome}}", "{{sem_logo}}\nOlá", "<div>Oi</div>", "<!--spy:logo-no-topo-->\n<div>Oi</div>"]) assert.equal(corpoDoConteudo(abrirConteudo(corpo)), corpo);
  assert.deepEqual(abrirConteudo("<div>Oi</div>"), { formato: "html", texto: "", html: "<div>Oi</div>", logo: { texto: true, html: false } });
  assert.equal(corpoDoConteudo(conteudoVazio()), "");
  assert.equal(corpoDoConteudo({ ...conteudoVazio(), formato: "html", html: "  " }), "");
  const p = parsePassos([{ subject: "a", body: "<!--spy:logo-no-topo-->\n<div>Oi</div>" }, { subject: "b", body: "{{sem_logo}}\nOi", dias: 3 }]);
  assert.ok(p.ok && p.passos[0].body.startsWith("<!--spy") && p.passos[1].body.startsWith("{{sem_logo}}"));
});
