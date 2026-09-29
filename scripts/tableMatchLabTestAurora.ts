/**
 * Teste de regressão do motor de Comparação de Tabelas (Clínicas e Saúde), SEM banco e SEM rede.
 * 70 exames de laboratório + 185 linhas de parceiro com gabarito: sinônimos, abreviações, typos,
 * texto extra e ARMADILHAS (exames parecidos que nunca podem virar correspondência automática).
 *
 *   npx tsx scripts/tableMatchLabTest.ts        → precisão/cobertura + lista de problemas
 *   npx tsx scripts/tableMatchLabTestAurora.ts  → idem com a Aurora real (passa pelo n8n: TABLE_COMPARISON_AI_WEBHOOK_URL do .env)
 *
 * Critério que não pode regredir: "AUTO ERRADO" = 0 (nenhuma automática errada).
 * Dataset sintético — não são dados de nenhum cliente.
 */
import fs from "fs";
import { makeN8nAiJson } from "../server/tableComparisonN8n.ts";
import { buildBaseIndex, matchItem, DEFAULT_MATCH_CONFIG, DEFAULT_FINANCE_RULES } from "../src/lib/tableMatch.ts";
import * as AI from "../server/tableComparisonAi.ts";
import { R, base } from "./tableMatchLabTest.ts";

const env = fs.readFileSync(new URL("../.env", import.meta.url).pathname, "utf8");
process.env.TABLE_COMPARISON_AI_WEBHOOK_URL ||= (env.match(/^TABLE_COMPARISON_AI_WEBHOOK_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const n8nAi = makeN8nAiJson();
if (!n8nAi) throw new Error("TABLE_COMPARISON_AI_WEBHOOK_URL não configurada");
// Tenant de teste fixo (só identifica o consumo no limitador; nada é gravado no banco pelo teste).
const TENANT = process.env.TEST_TENANT_ID || "27ef95ee-84dd-499e-9f25-cd9baecb5fe4";
let calls = 0;
async function aiJson(prompt: string, _sys: string, _schema: unknown, mode: "match" | "expand"): Promise<string> {
  calls++;
  return n8nAi!(prompt, { tenantId: TENANT, mode });
}

const cfg = DEFAULT_MATCH_CONFIG;
const index = buildBaseIndex(base as any, [], cfg);
const baseById = new Map(base.map((b: any) => [b.id, b]));
const nameOf = (id: string | null) => (id ? (baseById.get(id) as any)?.nome : "—");

type Row = { nome: string; cod: string | null; exp: any; kind: string; m: ReturnType<typeof matchItem>; final: { status: string; id: string | null; score: number; note: string } };
const rows: Row[] = R.map(([nome, cod, exp, kind]: any) => {
  const m = matchItem({ nome, codigo: cod }, index);
  return { nome, cod, exp, kind, m, final: { status: m.status, id: m.exame_base_id, score: m.score, note: "" } };
});

(async () => {
  try {
  // 1) itens com candidatos (revisão/não identificado) → julgamento da Aurora
  const withCand = rows.filter((r) => r.m.status !== "automatico" && r.m.candidates.length > 0);
  const noCand = rows.filter((r) => r.m.status !== "automatico" && r.m.candidates.length === 0);
  console.log(`Deterministico: auto=${rows.filter((r) => r.m.status === "automatico").length} | com candidatos p/ Aurora=${withCand.length} | sem candidato (expansão)=${noCand.length}`);

  for (let i = 0; i < withCand.length; i += 15) {
    const chunk = withCand.slice(i, i + 15);
    const inputs = chunk.map((r, idx) => ({
      i: idx, parceiro_nome: r.nome, parceiro_codigo: r.cod, valor_parceiro: 10,
      deterministico: { score: r.m.score, motivo: r.m.reason.slice(0, 200) },
      candidatos: r.m.candidates.slice(0, 3).map((c) => { const b: any = baseById.get(c.exame_base_id); return { id: b.id, nome: b.nome, codigo: b.codigo_interno, sinonimos: (b.nomes_alternativos || []).slice(0, 6), categoria: null, material: null, unidade: null }; }),
    }));
    const raw = await aiJson(AI.buildAuroraBatchPrompt(inputs as any), AI.AURORA_MATCH_SYSTEM_PROMPT, AI.AURORA_RESPONSE_SCHEMA, "match");
    const verdicts = AI.parseAuroraResponse(raw, new Set(inputs.map((x) => x.i)));
    chunk.forEach((r, idx) => {
      const d = AI.decideWithAurora({ status: r.m.status, exame_base_id: r.m.exame_base_id, score: r.m.score, motivo: r.m.reason, evidencias: [], candidatos: r.m.candidates, nome_parceiro: r.nome, valor_parceiro: 10 },
        verdicts.get(idx), { reviewThreshold: cfg.reviewThreshold, autoThreshold: cfg.autoThreshold, aiAutoAccept: false, baseById: baseById as any, rules: DEFAULT_FINANCE_RULES });
      const u: any = d.update;
      if (d.kind === "sugerido") r.final = { status: u.status, id: u.exame_base_id, score: u.score, note: "aurora-sugeriu" };
      else if (d.kind === "rebaixado") r.final = { status: "nao_identificado", id: null, score: 0, note: "aurora-rebaixou" };
      else r.final.note = "aurora-incerta";
    });
  }
  // 2) itens sem candidato → expansão de nome
  for (let i = 0; i < noCand.length; i += 20) {
    const chunk = noCand.slice(i, i + 20);
    const inputs = chunk.map((r, idx) => ({ i: idx, parceiro_nome: r.nome, parceiro_codigo: r.cod }));
    const raw = await aiJson(AI.buildExpandBatchPrompt(inputs), AI.AURORA_EXPAND_SYSTEM_PROMPT, AI.AURORA_EXPAND_SCHEMA, "expand");
    const verdicts = AI.parseExpandResponse(raw, new Set(inputs.map((x) => x.i)));
    chunk.forEach((r, idx) => {
      const d = AI.decideFromExpansion({ nome_parceiro: r.nome, codigo_parceiro: r.cod, valor_parceiro: 10, evidencias: [] }, verdicts.get(idx),
        { index, baseById: baseById as any, reviewThreshold: cfg.reviewThreshold, rules: DEFAULT_FINANCE_RULES });
      const u: any = d.update;
      if (d.kind === "sugerido") r.final = { status: u.status, id: u.exame_base_id, score: u.score, note: "aurora-expandiu" };
      else r.final.note = "aurora-incerta";
    });
  }

  // 3) avaliação final
  const good = (r: Row, id: string | null) => { const set = Array.isArray(r.exp) ? r.exp : r.exp === null ? [] : [r.exp]; return id !== null && set.includes(Number(id.slice(1))); };
  let autoOk = 0, autoBad = 0, revOk = 0, revBadTrap = 0, revBadExisting = 0, none = 0, missed = 0;
  const lines: string[] = [];
  for (const r of rows) {
    const f = r.final;
    if (f.status === "automatico") { good(r, f.id) ? autoOk++ : (autoBad++, lines.push(`🔴 AUTO ERRADO "${r.nome}" → ${nameOf(f.id)}`)); }
    else if (f.status === "revisao") {
      if (good(r, f.id)) revOk++;
      else if (r.exp === null) { revBadTrap++; lines.push(`🟠 sugeriu p/ revisão algo que NÃO existe: "${r.nome}" → ${nameOf(f.id)} (${f.score}%) [${f.note}] {${r.kind}}`); }
      else { revBadExisting++; lines.push(`🟠 sugestão errada em revisão: "${r.nome}" → ${nameOf(f.id)} (${f.score}%) [${f.note}]`); }
    } else { none++; if (typeof r.exp === "number") { missed++; lines.push(`⚪ ainda sem correspondência: "${r.nome}" (esperado ${nameOf("b" + r.exp)}) [${f.note || "regras"}]`); } }
  }
  const expected = rows.filter((r) => typeof r.exp === "number").length;
  console.log(`\nChamadas à IA: ${calls}`);
  console.log(`AUTOMÁTICAS: ${autoOk + autoBad} (corretas ${autoOk}, erradas ${autoBad})  ← a Aurora nunca promove a automático (aiAutoAccept=false)`);
  console.log(`REVISÃO com o exame certo sugerido: ${revOk}`);
  console.log(`REVISÃO com sugestão errada: ${revBadExisting + revBadTrap} (${revBadTrap} p/ exame que não existe, ${revBadExisting} p/ exame errado) — humano revisa antes de valer`);
  console.log(`NÃO IDENTIFICADOS: ${none} (dos quais ${missed} existiam na base)`);
  console.log(`Exames que existem na base e chegaram ao lugar certo (auto ou revisão): ${(rows.filter((r) => typeof r.exp === "number" && ["automatico", "revisao"].includes(r.final.status) && good(r, r.final.id)).length)}/${expected}`);
  console.log("\n" + lines.join("\n"));
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/limite_tokens|429|indispon/i.test(msg)) console.error("\nIA indisponível ou limite de tokens da empresa atingido (a IA roda no n8n).");
    else console.error("\nFalha ao chamar a Aurora:", msg.slice(0, 300));
    process.exit(1);
  }
})();
