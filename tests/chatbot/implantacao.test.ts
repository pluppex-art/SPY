import { test } from "node:test";
import assert from "node:assert/strict";
import { CHATBOT_TEMPLATES } from "../../src/lib/chatbot/templates.js";
import { runChatbot } from "../../src/lib/chatbot/engine.js";
import { validateFlow } from "../../src/lib/chatbot/validate.js";
import { validateField } from "../../src/lib/chatbot/validateValue.js";
import { allFields } from "../../src/lib/implementationForm.js";
import { tenantReadiness } from "../../src/lib/implementationTenant.js";
import type { SessionState } from "../../src/lib/chatbot/types.js";

const flow = CHATBOT_TEMPLATES.find((t) => t.id === "implantacao")!.flow;
const campos = new Map(allFields().map((f) => [f.id, f]));

test("fluxo sem erro nem aviso; destinos e opções iguais aos do formulário", () => {
  assert.deepEqual(validateFlow(flow), []);
  for (const n of Object.values(flow.nodes)) {
    if (n.type === "save_data") for (const m of n.map) assert.ok(campos.has(m.field), m.field);
    if (n.type === "menu" && n.variable) {
      for (const o of n.options) assert.equal(validateField(campos.get(n.variable)!, o.label).ok, true, `${n.variable}: ${o.label}`);
    }
  }
});

/** Conversa inteira: responde cada pergunta (ou menu, pelo texto da opção) até o bot parar de perguntar. */
function conversar(respostas: Record<string, string | string[]>, seed?: Record<string, string>) {
  let sessao: SessionState | null = null, texto = "oi";
  const falas: string[] = [], acoes: any[] = [], usadas: Record<string, number> = {};
  for (let i = 0; i < 80; i++) {
    const r = runChatbot({ flow, session: sessao, text: texto, phone: "5563999998888", now: 1_000_000 + i * 1000, seed: { bot_nome: "Ana", ...seed } });
    sessao = r.session; acoes.push(...r.actions);
    for (const a of r.actions) if (a.kind === "send_text") falas.push(a.text);
    if (sessao.status !== "active") return { sessao, falas, acoes };
    const no = sessao.current_node!;
    const dada = respostas[no];
    assert.ok(dada !== undefined, `sem resposta para ${no}`);
    texto = Array.isArray(dada) ? dada[usadas[no] ?? 0] : dada;
    usadas[no] = (usadas[no] ?? 0) + 1;
  }
  throw new Error("a conversa não terminou");
}

const base = {
  nome_fantasia: "Loja Sol", razao_social: "Sol Comércio Ltda", cnpj: "11.222.333/0001-81", endereco: "Rua 1, 10, Centro, Palmas, 77000-000",
  segmento: "Varejo", operacao_descricao: "Atende no WhatsApp e cobra por Pix", estrutura: "Uma empresa só", resp_nome: "Ana Souza", resp_cargo: "Sócia",
  resp_email: "ana@sol.com", qtd_usuarios: "5", usuarios_lista: "depois", etapas_funil: "Novo → Fechado", origens_leads: "Instagram", meta_mensal: "50000",
  importar_base: "Não", whats_usa: "Sim", whats_tipo: "1", whats_numero: "63 99999-8888", meta_usa: "Não", google_usa: "Não", agenda_usa: "Sim",
  ia_tom: "Consultivo", ia_horario: "8h às 18h", conferir: "1",
};

test("caminho completo: grava dados válidos, suficientes para criar o ambiente", () => {
  const { sessao, falas, acoes } = conversar(base);
  assert.equal(sessao.status, "finished");
  const salvar = acoes.find((a) => a.kind === "save_data");
  assert.equal(salvar.provision, true);
  const dados: Record<string, any> = {};
  for (const m of salvar.map) {
    const bruto = salvar.vars[m.variable];
    if (!bruto) continue;
    const r = validateField(campos.get(m.field)!, bruto);
    assert.ok(r.ok, `${m.field}: ${bruto}`);
    if (r.ok) dados[m.field] = r.value;
  }
  assert.deepEqual(tenantReadiness(dados), { ready: true, missing: [] });
  assert.equal(dados.usuarios_lista, undefined);
  assert.equal(dados.whats_tipo, "WhatsApp Business (app)");
  const tudo = falas.join("\n");
  assert.match(tudo, /Aqui é Ana/);
  assert.match(tudo, /15 dias antes/);
  assert.match(tudo, /CNPJ: 11\.222\.333\/0001-81/);
});

test("cada estrutura leva à sua explicação e grava os detalhes", () => {
  const casos = [["Matriz com filiais", "unidades", /cada filial fica separada/], ["Atendo vários clientes", "carteira", /cada cliente atendido/], ["Empresas separadas", "outras_empresas", /próprio ambiente/]] as const;
  for (const [opcao, no, explica] of casos) {
    const { falas, acoes } = conversar({ ...base, estrutura: opcao, [no]: "Norte e Sul" });
    assert.match(falas.join("\n"), explica);
    assert.equal(acoes.find((a) => a.kind === "save_data").vars.estrutura_detalhes, "Norte e Sul");
  }
});

test("corrigir um dado volta ao resumo com o valor novo; chamar a equipe grava sem criar o ambiente", () => {
  const c = conversar({ ...base, conferir: ["Corrigir e-mail", "Está tudo certo"], corrigir_email: "nova@sol.com" });
  assert.equal(c.acoes.find((a) => a.kind === "save_data").vars.resp_email, "nova@sol.com");
  assert.match(c.falas.join("\n"), /E-mail: nova@sol\.com/);
  const h = conversar({ ...base, conferir: "Falar com a equipe" });
  assert.deepEqual([h.sessao.status, h.acoes.find((a) => a.kind === "save_data").provision, h.acoes.some((a) => a.kind === "handoff")], ["handoff", undefined, true]);
});

test("o que o SPY já sabe não é perguntado de novo", () => {
  const { falas } = conversar(base, { nome_fantasia: "Loja Sol", estrutura: "Uma empresa só", whats_usa: "Sim" });
  assert.ok(!falas.some((f) => f.startsWith("Como se chama") || f.startsWith("Como é a estrutura") || f.startsWith("Vocês vão usar o WhatsApp")));
});
