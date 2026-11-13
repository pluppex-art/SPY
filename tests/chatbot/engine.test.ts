import { test } from "node:test";
import assert from "node:assert/strict";
import { runChatbot, normalizeText, validateAnswer } from "../../src/lib/chatbot/engine";
import { validateFlow } from "../../src/lib/chatbot/validate";
import type { ChatbotFlow, SessionState } from "../../src/lib/chatbot/types";

// Fluxo sintético só para exercitar o motor (código), não dado de cliente.
const flow: ChatbotFlow = {
  start: "boas_vindas",
  nodes: {
    boas_vindas: { id: "boas_vindas", type: "message", text: "Olá! Sou o assistente da loja.", next: "menu" },
    menu: {
      id: "menu",
      type: "menu",
      text: "Como posso ajudar?",
      variable: "assunto",
      options: [
        { id: "o1", label: "Orçamento", next: "pergunta_nome" },
        { id: "o2", label: "Catálogo", next: "catalogo" },
        { id: "o3", label: "Falar com atendente", next: "humano" },
      ],
    },
    pergunta_nome: { id: "pergunta_nome", type: "question", text: "Qual o seu nome?", variable: "nome", validation: "text", next: "pergunta_email" },
    pergunta_email: { id: "pergunta_email", type: "question", text: "E o seu e-mail, {{nome}}?", variable: "email", validation: "email", error_text: "E-mail inválido, tente de novo.", next: "lead" },
    lead: { id: "lead", type: "create_lead", next: "fim" },
    fim: { id: "fim", type: "end", text: "Obrigado, {{nome}}! Em breve entraremos em contato." },
    catalogo: { id: "catalogo", type: "media", kind: "document", url: "https://exemplo.com/catalogo.pdf", filename: "catalogo.pdf", caption: "Nosso catálogo", next: "menu" },
    humano: { id: "humano", type: "handoff", text: "Chamando um atendente…" },
  },
};

const NOW = Date.parse("2026-11-19T12:00:00Z");
const PHONE = "5563999990000";
const run = (session: SessionState | null, text: string, now = NOW) => runChatbot({ flow, session, text, phone: PHONE, now });
const texts = (r: ReturnType<typeof run>) => r.actions.filter((a) => a.kind === "send_text").map((a) => (a as { text: string }).text);

test("primeira mensagem: manda boas-vindas + menu e espera a escolha", () => {
  const r = run(null, "oi");
  assert.equal(texts(r).length, 2);
  assert.match(texts(r)[1], /1\. Orçamento\n2\. Catálogo\n3\. Falar com atendente/);
  assert.equal(r.session.current_node, "menu");
  assert.equal(r.session.status, "active");
  assert.equal(r.session.vars.telefone, PHONE);
});

test("menu aceita número, texto exato e texto parcial único (sem acento)", () => {
  const base = run(null, "oi").session;
  assert.equal(run(base, "1").session.current_node, "pergunta_nome");
  assert.equal(run(base, "ORÇAMENTO").session.current_node, "pergunta_nome");
  assert.equal(run(base, "orcamento!").session.current_node, "pergunta_nome");
  assert.equal(run(base, "cat").session.current_node, "menu", "'cat' < 3 chars... ainda cai em Catálogo e volta ao menu");
});

test("opção inválida reenvia o menu sem avançar", () => {
  const base = run(null, "oi").session;
  const r = run(base, "9");
  assert.equal(r.session.current_node, "menu");
  assert.match(texts(r)[0], /Não entendi/);
  assert.match(texts(r)[0], /1\. Orçamento/);
});

test("fluxo completo: pergunta nome, valida e-mail, cria lead e encerra com variáveis", () => {
  let s = run(null, "oi").session;
  s = run(s, "1").session;
  assert.equal(s.vars.assunto, "Orçamento");
  s = run(s, "Maria Silva").session;
  assert.equal(s.vars.nome, "Maria Silva");

  const bad = run(s, "isso-nao-e-email");
  assert.equal(bad.session.current_node, "pergunta_email");
  assert.deepEqual(texts(bad), ["E-mail inválido, tente de novo."]);

  const ok = run(bad.session, "Maria@Exemplo.com");
  assert.equal(ok.session.status, "finished");
  assert.equal(ok.session.vars.email, "maria@exemplo.com");
  const lead = ok.actions.find((a) => a.kind === "create_lead");
  assert.ok(lead && lead.kind === "create_lead");
  assert.equal(lead.vars.nome, "Maria Silva");
  assert.equal(lead.vars.telefone, PHONE);
  assert.deepEqual(texts(ok), ["Obrigado, Maria Silva! Em breve entraremos em contato."]);
});

test("lead é criado uma única vez mesmo se o caminho for percorrido de novo na mesma conversa", () => {
  const looped: ChatbotFlow = {
    start: "lead",
    nodes: {
      lead: { id: "lead", type: "create_lead", next: "lead2" },
      lead2: { id: "lead2", type: "create_lead", next: "fim" },
      fim: { id: "fim", type: "end" },
    },
  };
  const r = runChatbot({ flow: looped, session: null, text: "x", phone: PHONE, now: NOW });
  assert.equal(r.actions.filter((a) => a.kind === "create_lead").length, 1);
});

test("mídia: envia o documento e volta ao menu", () => {
  const s = run(null, "oi").session;
  const r = run(s, "2");
  assert.equal(r.actions[0].kind, "send_media");
  assert.equal(r.actions[0].kind === "send_media" && r.actions[0].filename, "catalogo.pdf");
  assert.equal(r.session.current_node, "menu");
});

test("handoff por nó: avisa, marca handoff e depois o bot fica em silêncio", () => {
  const s = run(null, "oi").session;
  const r = run(s, "3");
  assert.equal(r.session.status, "handoff");
  assert.ok(r.actions.some((a) => a.kind === "handoff" && a.reason === "node"));

  const silent = run(r.session, "alguém aí?", NOW + 60_000);
  assert.deepEqual(silent.actions, []);
  assert.equal(silent.note, "handoff_silencio");
});

test("handoff por palavra-chave em qualquer ponto do fluxo", () => {
  let s = run(null, "oi").session;
  s = run(s, "1").session; // aguardando nome
  const r = run(s, "Atendente");
  assert.equal(r.session.status, "handoff");
  assert.ok(r.actions.some((a) => a.kind === "handoff" && a.reason === "keyword"));
});

test("depois do prazo de handoff o bot volta a atender do início", () => {
  const s = run(null, "oi").session;
  const handoff = run(s, "3").session;
  const r = run(handoff, "oi de novo", NOW + 25 * 3_600_000);
  assert.equal(r.session.status, "active");
  assert.equal(r.session.current_node, "menu");
});

test("palavra de reinício e timeout recomeçam; conversa concluída também", () => {
  let s = run(null, "oi").session;
  s = run(s, "1").session;
  assert.equal(run(s, "menu").session.current_node, "menu");
  assert.equal(run(s, "qualquer coisa", NOW + 13 * 3_600_000).session.current_node, "menu");
  const done = { ...s, status: "finished" as const, current_node: null };
  assert.equal(run(done, "oi").session.current_node, "menu");
});

test("nó removido no editor no meio da conversa: recomeça em vez de travar", () => {
  const stale: SessionState = { status: "active", current_node: "no_que_nao_existe_mais", vars: { telefone: PHONE }, last_input_at: new Date(NOW).toISOString() };
  assert.equal(run(stale, "oi", NOW + 1000).session.current_node, "menu");
});

test("ciclo sem espera é cortado em vez de travar o workflow", () => {
  const cycle: ChatbotFlow = {
    start: "a",
    nodes: { a: { id: "a", type: "message", text: "a", next: "b" }, b: { id: "b", type: "message", text: "b", next: "a" } },
  };
  const r = runChatbot({ flow: cycle, session: null, text: "x", phone: PHONE, now: NOW });
  assert.equal(r.note, "loop");
  assert.ok(r.actions.length <= 50);
});

test("fluxo vazio ou sem início não responde nada", () => {
  const r = runChatbot({ flow: { start: null, nodes: {} }, session: null, text: "oi", phone: PHONE, now: NOW });
  assert.deepEqual(r.actions, []);
  assert.equal(r.note, "fluxo_vazio");
});

test("mídia/áudio (texto vazio) numa pergunta é tratado como resposta inválida", () => {
  let s = run(null, "oi").session;
  s = run(s, "1").session;
  const r = run(s, "");
  assert.equal(r.session.current_node, "pergunta_nome");
  assert.equal(r.actions.length, 1);
});

test("variáveis: nome reservado 'telefone' não pode ser sobrescrito por resposta", () => {
  const f: ChatbotFlow = {
    start: "q",
    nodes: { q: { id: "q", type: "question", text: "?", variable: "telefone", validation: "text", next: "fim" }, fim: { id: "fim", type: "end" } },
  };
  const s1 = runChatbot({ flow: f, session: null, text: "x", phone: PHONE, now: NOW }).session;
  const s2 = runChatbot({ flow: f, session: s1, text: "999", phone: PHONE, now: NOW + 1000 }).session;
  assert.equal(s2.vars.telefone, PHONE);
});

test("normalizeText / validateAnswer", () => {
  assert.equal(normalizeText("  Orçamento!! "), "orcamento");
  assert.equal(validateAnswer("phone", "(63) 99999-0000"), "63999990000");
  assert.equal(validateAnswer("phone", "123"), null);
  assert.equal(validateAnswer("number", "12,5"), "12.5");
  assert.equal(validateAnswer("number", "doze"), null);
  assert.equal(validateAnswer("text", "   "), null);
});

test("validateFlow: fluxo de exemplo não tem erro; destinos quebrados e ciclos são erros", () => {
  assert.equal(validateFlow(flow).filter((i) => i.level === "error").length, 0);

  const broken: ChatbotFlow = {
    start: "a",
    nodes: {
      a: { id: "a", type: "message", text: "a", next: "zzz" },
      c1: { id: "c1", type: "message", text: "x", next: "c2" },
      c2: { id: "c2", type: "message", text: "y", next: "c1" },
    },
  };
  const issues = validateFlow(broken);
  assert.ok(issues.some((i) => i.level === "error" && /não existe/.test(i.message)));
  assert.ok(issues.some((i) => i.level === "warning" && /solto/.test(i.message)));

  const cyc: ChatbotFlow = { start: "c1", nodes: broken.nodes };
  const cycIssues = validateFlow(cyc).filter((i) => /Ciclo/.test(i.message));
  assert.equal(cycIssues.length, 1, "o ciclo é reportado uma vez só");
});
