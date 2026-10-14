/**
 * capture-lp-shots.mjs — gera screenshots REAIS da interface do SPY com dados 100% FICTÍCIOS
 * ("Studio Aurora Demo") para a landing page (public/lp/*.png).
 *
 * Como funciona: roda o app em modo dev (`npx vite --port 5197`, iniciado por este script se a
 * porta estiver livre) e, no Playwright, intercepta TODA requisição ao Supabase (*.supabase.co)
 * e às rotas /api/* do app, respondendo de fixtures em memória. Sessão fake (JWT não assinado)
 * é injetada no localStorage. Qualquer outro host externo é abortado: nada sai da máquina e
 * nenhum dado de produção é lido.
 *
 * Uso:  node scripts/capture-lp-shots.mjs [tela1 tela2 ...]   (padrão: todas)
 * Requer: playwright em node_modules; `sharp` opcional (senão fica o PNG cru).
 */
import { chromium } from '/Users/gustavohenriqueportilhogodoi/dev/SPY/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/lp');
const PORT = 5197;
const BASE = `http://localhost:${PORT}`;

// ---- env (só lê a URL do projeto para derivar o ref; nada é impresso) ----
function readEnv() {
  const env = {};
  for (const f of ['.env', '.env.local']) {
    try { for (const l of fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')) {
      const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    } } catch {}
  }
  return env;
}
const env = readEnv();
const SUPA_URL = env.VITE_SUPABASE_URL || 'https://demoproj.supabase.co';
const REF = new URL(SUPA_URL).hostname.split('.')[0];

// ---- fixtures ----
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const iso = (offDays = 0, h = 10, m = 0) => { const d = new Date(); d.setDate(d.getDate() + offDays); d.setHours(h, m, 0, 0); return d.toISOString(); };
const ymd = (offDays = 0) => iso(offDays).slice(0, 10);
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const MODULES = { crm: true, sdr: true, advDashboard: true, financeiro: true, marketing: true, produtividade: true,
  rh: true, bi: true, engajamento: true, catalogo: true, aurora: true, educacao: false, clinica: false };

const tenant = { id: TENANT_ID, name: 'Studio Aurora Demo', niche: 'Tecnologia', status: 'Active', primary_color: '#F97316', modules: MODULES, plan: 'pro' };
const userRow = { id: USER_ID, name: 'Marina Alves', email: 'marina@studioaurora.demo', role: 'Diretora Comercial', is_master: false, active: true,
  tenant_id: TENANT_ID, partner_id: null, phone: '(11) 90000-0000', bio: null, avatar_url: null, two_factor_enabled: false,
  preferences: { theme: 'light', pipelineView: 'kanban' }, is_tenant_admin: true, tenants: tenant };

const funil = { id: 'funil-comercial-default', tenant_id: TENANT_ID, nome: 'Funil Comercial', tipo: 'comercial', ativo: true,
  etapas: ['Novo Lead', 'Qualificação', 'Reunião', 'Proposta Enviada', 'Negociação', 'Fechado Ganho'],
  etapas_config: [
    { nome: 'Novo Lead', cor: 'cyan' }, { nome: 'Qualificação', cor: 'indigo' }, { nome: 'Reunião', cor: 'purple' },
    { nome: 'Proposta Enviada', cor: 'amber' }, { nome: 'Negociação', cor: 'orange' }, { nome: 'Fechado Ganho', cor: 'emerald' } ] };

const sellers = ['Marina Alves', 'Rafael Tavares', 'Beatriz Lima', 'Caio Mendes'];
const colaboradores = sellers.concat(['Larissa Prado', 'Diego Ferraz']).map((nome, i) => ({
  id: uid(100 + i), user_id: uid(150 + i), tenant_id: TENANT_ID, nome, cargo: i < 4 ? 'Closer' : 'SDR', departamento: 'Comercial', status: 'Ativo',
  dataAdmissao: ymd(-300 - i * 20), email: nome.split(' ')[0].toLowerCase() + '@studioaurora.demo', desempenho: 70 + i * 4 }));

const leadsSeed = [
  // [empresa, contato, valor, etapa(1-6), origem, temp, score, prioridade]
  ['Clínica Horizonte Demo', 'Paula Siqueira', 18900, 1, 'Instagram', 'morno', 62, 'Média'],
  ['Construtora Vale Verde', 'Henrique Lacerda', 64500, 1, 'Google Ads', 'frio', 44, 'Baixa'],
  ['Escola Nova Trilha', 'Camila Ribeiro', 12400, 1, 'Indicação', 'morno', 58, 'Média'],
  ['Oficina Quatro Rodas', 'Jorge Ventura', 9800, 2, 'WhatsApp', 'quente', 81, 'Alta'],
  ['Auto Peças Brasa', 'Tatiane Moura', 27300, 2, 'Site', 'morno', 66, 'Média'],
  ['Mercado Bom Preço', 'Anderson Leal', 41200, 2, 'Facebook', 'morno', 63, 'Média'],
  ['Studio Pilates Fluir', 'Renata Cavalcanti', 15600, 3, 'Instagram', 'quente', 85, 'Alta'],
  ['Imobiliária Casa Azul', 'Fábio Brandão', 88000, 3, 'Indicação', 'quente', 88, 'Alta'],
  ['Transportadora Rota Sul', 'Mônica Esteves', 52700, 4, 'LinkedIn', 'quente', 79, 'Alta'],
  ['Rede Sabor & Cia', 'Luciano Pimentel', 33900, 4, 'Google Ads', 'morno', 70, 'Média'],
  ['Academia Impulso', 'Vanessa Campos', 21500, 5, 'WhatsApp', 'quente', 90, 'Alta'],
  ['Laboratório Vita Demo', 'Otávio Rangel', 96000, 5, 'Indicação', 'quente', 92, 'Alta'],
  ['Agência Pixel Norte', 'Isabela Duarte', 24800, 6, 'Site', 'quente', 100, 'Alta'],
  ['Pet Shop Amigo Fiel', 'Gustavo Nascimento', 7900, 6, 'Instagram', 'quente', 100, 'Média'],
];
const leads = leadsSeed.map((s, i) => ({
  id: uid(1000 + i), tenant_id: TENANT_ID, name: s[1], company: s[0], title: `Projeto ${s[0]}`,
  email: s[1].split(' ')[0].toLowerCase() + '@exemplo.demo', phone: `(11) 9${String(8000 + i * 37).padStart(4, '0')}-${String(1000 + i * 53).slice(0, 4)}`,
  status: s[3] === 6 ? 'Fechado' : 'Aberto', value: s[2], date: ymd(-(i % 9) - 1), seller: sellers[i % 4], source: s[4],
  priority: s[7], stageId: String(s[3]), pipelineId: 'comercial', scoreIA: s[6], temperature: s[5], timeIdle: (i * 7) % 48,
  customFields: {}, tags: [], created_at: iso(-(i % 14) - 2), updated_at: iso(-(i % 3)), createdAt: iso(-(i % 14) - 2) }));

const products = [
  ['SPY-001', 'Plano Start — CRM', 'Assinatura', 'Software', 297, 60, true, 'Mensal'],
  ['SPY-002', 'Plano Pro — CRM + Financeiro', 'Assinatura', 'Software', 597, 120, true, 'Mensal'],
  ['SPY-003', 'Plano Scale — Suite completa', 'Assinatura', 'Software', 1297, 260, true, 'Mensal'],
  ['SRV-010', 'Implantação Guiada', 'Serviço', 'Serviços', 2900, 900, false, 'Pontual'],
  ['SRV-011', 'Consultoria de Processos (hora)', 'Serviço', 'Serviços', 320, 110, false, 'Pontual'],
  ['SRV-012', 'Treinamento da Equipe', 'Serviço', 'Serviços', 1800, 600, false, 'Pontual'],
  ['ADD-020', 'Pacote Aurora IA (1 mil msgs)', 'Assinatura', 'Add-ons', 249, 70, true, 'Mensal'],
  ['ADD-021', 'Integração WhatsApp Oficial', 'Assinatura', 'Add-ons', 189, 40, true, 'Mensal'],
  ['ADD-022', 'Usuário adicional', 'Assinatura', 'Add-ons', 49, 8, true, 'Mensal'],
  ['SRV-013', 'Migração de Dados', 'Serviço', 'Serviços', 1500, 500, false, 'Pontual'],
].map((p, i) => ({ id: uid(2000 + i), tenant_id: TENANT_ID, sku: p[0], name: p[1], type: p[2], category: p[3], price: p[4], cost: p[5],
  margin: Math.round((1 - p[5] / p[4]) * 100), commission: 5, active: true, stockMin: 0, stockMax: 0, currentStock: 0, provider: 'Studio Aurora Demo',
  isBestSeller: i === 1, tags: [], is_recurring: p[6], type_attributes: { billingCycle: p[7], isRecurring: p[6] }, created_at: iso(-90), updated_at: iso(-5) }));

// financeiro: 6 meses de receitas/despesas
const finance = [];
let fi = 0;
const recCats = ['Mensalidades', 'Implantação', 'Consultoria'];
const despCats = ['Folha de pagamento', 'Marketing', 'Infraestrutura', 'Aluguel', 'Impostos', 'Ferramentas'];
const clientes = ['Clínica Horizonte Demo', 'Rede Sabor & Cia', 'Academia Impulso', 'Agência Pixel Norte', 'Studio Pilates Fluir', 'Oficina Quatro Rodas', 'Escola Nova Trilha', 'Auto Peças Brasa'];
for (let mo = -5; mo <= 1; mo++) {
  for (let k = 0; k < 8; k++) {
    const off = mo * 30 + k * 3 - 12;
    const past = off < 0;
    finance.push({ id: uid(3000 + fi++), tenant_id: TENANT_ID, description: `${recCats[k % 3]} — ${clientes[k]}`, category: recCats[k % 3], type: 'Receber',
      value: Math.round(([2970, 5970, 1297, 8900, 2490, 3200, 1800, 4350][k] + mo * 40) * 1.9), date: ymd(off), status: past ? 'Pago' : 'A Vencer', counterparty: clientes[k],
      payment_method: ['Pix', 'Boleto', 'Cartão'][k % 3], competencia_date: ymd(off), tags: [], created_at: iso(off - 5), updated_at: iso(off) });
  }
  for (let k = 0; k < 6; k++) {
    const off = mo * 30 + k * 4 - 10;
    finance.push({ id: uid(3000 + fi++), tenant_id: TENANT_ID, description: despCats[k] + ' — ' + ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul'][(mo + 5) % 7], category: despCats[k], type: 'Pagar',
      value: [14800, 3900, 2100, 4200, 3300, 1250][k], date: ymd(off), status: off < -2 ? 'Pago' : (off < 0 ? 'Atrasado' : 'A Vencer'), counterparty: ['Equipe', 'Meta Ads', 'Cloud', 'Imobiliária Centro', 'Receita Federal', 'SaaS Diversos'][k],
      payment_method: 'Pix', competencia_date: ymd(off), tags: [], created_at: iso(off - 5), updated_at: iso(off) });
  }
}
const financeCategories = [...recCats.map((n, i) => ({ id: uid(3500 + i), tenant_id: TENANT_ID, nome: n, name: n, tipo: 'Receita', type: 'Receber' })),
  ...despCats.map((n, i) => ({ id: uid(3520 + i), tenant_id: TENANT_ID, nome: n, name: n, tipo: 'Despesa', type: 'Pagar' }))];
const bankAccounts = [{ id: uid(3600), tenant_id: TENANT_ID, nome: 'Conta Principal', name: 'Conta Principal', banco: 'Banco Demo', saldo_inicial: 48200, ativo: true, tipo: 'Corrente' }];

const taskSeed = [
  ['Enviar proposta para Casa Azul', 'Em Aberto', 'Alta', 1], ['Ligar para Laboratório Vita', 'A Fazer', 'Alta', 0], ['Revisar contrato Academia Impulso', 'Aguardando', 'Média', 2],
  ['Preparar demo para Rota Sul', 'A Fazer', 'Média', 3], ['Atualizar planilha de metas', 'Em Aberto', 'Baixa', 4], ['Follow-up Pilates Fluir', 'Atrasado', 'Alta', -1],
  ['Onboarding Agência Pixel Norte', 'Concluída', 'Média', -2], ['Cadastrar novos produtos', 'Concluída', 'Baixa', -3], ['Reunião de alinhamento semanal', 'A Fazer', 'Média', 1],
  ['Cobrar boleto em aberto — Escola Nova Trilha', 'Atrasado', 'Alta', -2], ['Criar campanha de reativação', 'Em Aberto', 'Média', 5], ['Treinar novo SDR', 'Aguardando', 'Baixa', 6]];
const tasks = taskSeed.map((t, i) => ({ id: uid(4000 + i), tenant_id: TENANT_ID, lead_id: leads[i % leads.length].id, assigned_to: colaboradores[i % 4].user_id, title: t[0],
  description: '', status: t[1], priority: t[2], due_date: iso(t[3], 17), created_at: iso(-5), updated_at: iso(-1) }));

const reunTipos = ['Reunião', 'Demonstração', 'Follow-up', 'Fechamento'];
const reunioes = [[0, 9, 0], [0, 14, 30], [1, 10, 0], [1, 16, 0], [2, 11, 0], [3, 15, 0], [4, 9, 30], [-1, 10, 0], [-2, 14, 0], [5, 11, 0], [2, 16, 30], [6, 10, 0]].map((r, i) => ({
  id: uid(5000 + i), tenant_id: TENANT_ID, leadId: leads[(i * 2) % leads.length].id, leadName: leads[(i * 2) % leads.length].name, companyName: leads[(i * 2) % leads.length].company,
  leadEmail: 'contato@exemplo.demo', closerName: sellers[i % 4], closerEmail: 'closer@studioaurora.demo', scheduledAt: iso(r[0], r[1], r[2]), durationMinutes: 45,
  meetLink: 'https://meet.example.com/demo', status: r[0] < 0 ? 'Concluída' : 'Agendada', pauta: 'Apresentação da solução', createdAt: iso(-6), tipo: reunTipos[i % 4], escopo: 'Cliente', convidados: [] }));

const proposalSeed = [
  ['Casa Azul', 'Plano Scale — Suite completa', 'Enviada', 88000, 'Fábio Brandão', true], ['Laboratório Vita Demo', 'Plano Scale + Aurora IA', 'Enviada', 96000, 'Otávio Rangel', true],
  ['Academia Impulso', 'Plano Pro — CRM + Financeiro', 'Aceita', 21500, 'Vanessa Campos', true], ['Transportadora Rota Sul', 'Plano Pro + Add-ons', 'Enviada', 52700, 'Mônica Esteves', false],
  ['Rede Sabor & Cia', 'Plano Start — CRM', 'Rascunho', 33900, 'Luciano Pimentel', false], ['Agência Pixel Norte', 'Plano Scale — Suite completa', 'Aceita', 24800, 'Isabela Duarte', true],
  ['Pet Shop Amigo Fiel', 'Plano Start — CRM', 'Aceita', 7900, 'Gustavo Nascimento', true], ['Escola Nova Trilha', 'Plano Pro — CRM + Financeiro', 'Recusada', 12400, 'Camila Ribeiro', true],
];
const proposals = proposalSeed.map((p, i) => ({ id: uid(6000 + i), tenant_id: TENANT_ID, cliente: p[0], titulo: p[1], status: p[2], valor: p[3], vendedor: sellers[i % 4],
  created_at: iso(-(i * 2) - 7), updated_at: iso(-i), first_viewed_at: p[5] ? iso(-i - 1) : null, view_count: p[5] ? 3 : 0, pagamento: {}, validade: ymd(10 - i) }));
const proposalItems = proposals.map((pr, i) => ({ id: uid(6500 + i), tenant_id: TENANT_ID, proposal_id: pr.id, product_id: (products.find((x) => pr.titulo.startsWith(x.name.split(' — ')[0] + ' — ') || x.name === pr.titulo) || products[1]).id, product_name: (products.find((x) => x.name === pr.titulo) || products[1]).name,
  quantidade: 1, preco_unitario: pr.valor, billing_type: 'Mensal', contract_months: 12 }));
const contractSeed = [
  ['Academia Impulso', 'Plano Pro', 1790, 2, 'Ativo', 2], ['Agência Pixel Norte', 'Plano Scale', 3890, 3, 'Ativo', 5], ['Pet Shop Amigo Fiel', 'Plano Start', 890, 1, 'Ativo', 1],
  ['Clínica Horizonte Demo', 'Plano Pro', 1790, 5, 'Ativo', null], ['Studio Pilates Fluir', 'Plano Scale', 3890, 8, 'Ativo', null], ['Rede Sabor & Cia', 'Plano Pro', 1790, 11, 'Ativo', null],
  ['Oficina Quatro Rodas', 'Plano Start', 890, 15, 'Ativo', null], ['Escola Nova Trilha', 'Plano Pro', 1790, 20, 'Inadimplente', null], ['Auto Peças Brasa', 'Plano Start', 890, 25, 'Ativo', null],
  ['Mercado Bom Preço', 'Plano Scale', 3890, 40, 'Ativo', null], ['Construtora Vale Verde', 'Plano Pro', 1790, 70, 'Ativo', null], ['Imobiliária Prime Demo', 'Plano Scale', 3890, 100, 'Ativo', null],
  ['Laboratório Aurora Demo', 'Plano Start', 890, 130, 'Ativo', null], ['Transportes Lume', 'Plano Pro', 1790, 160, 'Ativo', null],
];
const contracts = contractSeed.map((c, i) => ({ id: uid(6800 + i), tenant_id: TENANT_ID, title: `${c[1]} - ${c[0]}`, notes: `Cliente: ${c[0]} | Plano: ${c[1]}`, status: c[4],
  mrr_value: c[2], value: c[2] * 12, signed_date: ymd(-c[3]), end_date: ymd(365 - c[3]), proposal_id: c[5] != null ? proposals[c[5]].id : null, created_at: iso(-c[3]), updated_at: iso(-1) }));
const clientesRows = ['Academia Impulso', 'Agência Pixel Norte', 'Pet Shop Amigo Fiel', 'Studio Pilates Fluir', 'Clínica Horizonte Demo', 'Rede Sabor & Cia'].map((n, i) => ({
  id: uid(7000 + i), tenant_id: TENANT_ID, name: n, email: 'contato@' + n.toLowerCase().replace(/[^a-z]/g, '') + '.demo', phone: '(11) 98888-00' + (10 + i), status: 'Ativo', created_at: iso(-60 - i * 9), updated_at: iso(-3) }));

const TABLES = {
  users: [userRow], tenants: [tenant], crm_funis: [funil], leads, products, finance_entries: finance, finance_categories: financeCategories,
  finance_bank_accounts: bankAccounts, tasks, reunioes, proposals, proposal_items: proposalItems, contracts, clientes: clientesRows, colaboradores,
};

// ---- Aurora ----
const AURORA_Q = 'Como está o faturamento do mês e quais negociações merecem atenção hoje?';
const curMonth = ymd(0).slice(0, 7);
const brl = (n) => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
const recPago = finance.filter((f) => f.type === 'Receber' && f.date.startsWith(curMonth) && f.status === 'Pago').reduce((a, f) => a + f.value, 0);
const recAberto = finance.filter((f) => f.type === 'Receber' && f.date.startsWith(curMonth) && f.status !== 'Pago').reduce((a, f) => a + f.value, 0);
const AURORA_A = `Faturamento do mês: ${brl(recPago)} recebidos e ${brl(recAberto)} a vencer.

Atenção hoje:
1. Laboratório Vita Demo (R$ 96.000) está em Negociação há 6 dias sem contato.
2. Academia Impulso (R$ 21.500) aguarda a assinatura do contrato.
3. Escola Nova Trilha está inadimplente (R$ 1.790/mês) e pede cobrança.

Quer que eu agende um follow-up com o Otávio e envie o lembrete de cobrança por WhatsApp?`;

// ---- roteamento ----
function jwt() {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', email: userRow.email, exp: 4102444800, iat: 1700000000 })}.demo-signature`;
}
const authUser = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: userRow.email, app_metadata: {}, user_metadata: {}, created_at: iso(-200) };
const session = { access_token: jwt(), refresh_token: 'demo-refresh', token_type: 'bearer', expires_in: 3153600000, expires_at: 4102444800, user: authUser };

const json = (route, body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });

function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'or', 'and'].includes(k)) continue;
    const m = v.match(/^(eq|neq|gte|lte|gt|lt|in|is|ilike|like)\.(.*)$/); if (!m) continue;
    const [, op, val] = m;
    out = out.filter((r) => {
      if (!(k in r)) return true; // coluna desconhecida: não filtra
      const x = r[k];
      if (op === 'eq') return String(x) === val;
      if (op === 'neq') return String(x) !== val;
      if (op === 'is') return val === 'null' ? x == null : String(x) === val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').includes(String(x));
      if (op === 'gte') return String(x) >= val;
      if (op === 'lte') return String(x) <= val;
      return true;
    });
  }
  return out;
}

const unmocked = new Set();
export async function installMocks(context, log) {
  await context.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      if (url.pathname.startsWith('/api/')) return handleApi(route, req, url, log);
      return route.continue();
    }
    if (host.endsWith('.supabase.co')) return handleSupabase(route, req, url, log);
    if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') return route.abort(); // sem rede externa (fallback de fonte local)
    return route.abort();
  });
}

async function handleSupabase(route, req, url, log) {
  const p = url.pathname; const method = req.method();
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (p.startsWith('/auth/v1/user')) return json(route, authUser);
  if (p.startsWith('/auth/v1/')) return json(route, session);
  if (p.startsWith('/rest/v1/rpc/')) { log?.(`rpc ${p}`); return json(route, null); }
  if (p.startsWith('/rest/v1/')) {
    const table = p.replace('/rest/v1/', '');
    if (method !== 'GET' && method !== 'HEAD') {
      let body = null; try { body = req.postDataJSON(); } catch {}
      return json(route, body ?? [], 201);
    }
    let rows = TABLES[table];
    if (!rows) unmocked.add(table);
    rows = applyFilters(rows ?? [], url.searchParams);
    const accept = req.headers()['accept'] || '';
    const range = req.headers()['range'];
    let slice = rows;
    if (range) { const [a, b] = range.split('-').map(Number); slice = rows.slice(a, b + 1); }
    const headers = { 'content-range': `${rows.length ? 0 : '*'}-${Math.max(rows.length - 1, 0)}/${rows.length}` };
    if (method === 'HEAD') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers } });
    if (accept.includes('vnd.pgrst.object')) return json(route, slice[0] ?? null, slice[0] ? 200 : 406, { 'access-control-expose-headers': 'content-range', ...headers });
    return json(route, slice, 200, { 'access-control-expose-headers': 'content-range', ...headers });
  }
  return json(route, {});
}

function handleApi(route, req, url, log) {
  const p = url.pathname;
  if (p === '/api/ai/aurora-chat') return json(route, { output: AURORA_A });
  if (p.startsWith('/api/public-proposal/')) {
    const pr = proposals[0];
    return json(route, { id: pr.id, titulo: 'Plano Scale — Suite completa', cliente: 'Imobiliária Casa Azul', valor: 88000, status: 'Enviada', validade: ymd(10), tipo: 'comercial',
      conteudoTexto: 'Proposta comercial para implantação da suíte S.P.Y. com CRM, Financeiro e Aurora IA.', criadaEm: iso(-3), vendedor: 'Marina Alves', tenantId: TENANT_ID,
      tenantName: 'Studio Aurora Demo', tenantPrimaryColor: '#F97316', tenantNiche: 'Tecnologia', empresaDados: null,
      itens: [{ productName: 'Plano Scale — Suite completa (assinatura)', quantidade: 12, precoUnitario: 6500 }, { productName: 'Implantação Guiada', quantidade: 1, precoUnitario: 10000 }] });
  }
  if (p === '/api/dashboard/summary') {
    const ativos = contracts.filter((c) => c.status === 'Ativo'); const risco = contracts.filter((c) => c.status === 'Inadimplente');
    const mrr = ativos.reduce((a, c) => a + c.mrr_value, 0); const open = leads.filter((l) => l.status === 'Aberto');
    return json(route, { totalRevenue: mrr, conversionRate: 28.6, activeLeadsCount: open.length, churnRate: 2.1, valorPipelineAberto: open.reduce((a, l) => a + l.value, 0),
      leadsQuentes: open.filter((l) => l.temperature === 'quente').length, mrrAtivo: mrr, mrrEmRisco: risco.reduce((a, c) => a + c.mrr_value, 0), taxaInadimplencia: 4.2,
      contractsAtivosCount: ativos.length, contractsEmRiscoCount: risco.length, contractsTotalCount: contracts.length });
  }
  log?.(`api ${req.method()} ${p}`);
  return json(route, {}, 200);
}

export { TABLES, AURORA_Q, session, REF, BASE, PORT, ROOT, OUT, unmocked };

// ---- execução ----
// vw/vh = viewport de layout; o PNG final sempre sai 1600x1000 (deviceScaleFactor = 1600/vw).
const SCREENS = {
  pipeline:   { path: '/app/crm/pipeline', wait: 'Fechado Ganho', vw: 2150, vh: 1344, cropY: 1235 },
  financeiro: { path: '/app/financeiro/dashboard', vw: 2400, vh: 1500, cropY: 1372 },
  'financeiro-movimentacoes': { path: '/app/financeiro/transacoes', vw: 2000, vh: 1250, cropY: 1160 },
  dashboard:  { path: '/app/dashboard', vw: 2000, vh: 1500 },
  produtos:   { path: '/app/produtos', wait: 'Plano Pro', vw: 2000, vh: 1500, cropY: 1315 },
  propostas:  { path: '/app/crm/propostas', vw: 2000, vh: 1250, cropY: 1215 },
  contratos:  { path: '/app/crm/contratos', vw: 2000, vh: 1250, cropY: 1195 },
  agenda:     { path: '/app/agenda/reunioes', vw: 2000, vh: 1330, cropY: 1275 },
  tarefas:    { path: '/app/tarefas', vw: 2000, vh: 1420 },
  aurora:     { path: '/app/dashboard', vw: 1920, vh: 1200, aurora: true },
  'proposta-publica': { path: '/proposta/demo-token-aurora', vw: 1600, vh: 1150, publico: true },
  'catalogo-nicho': { path: '/app/produtos', wait: 'Plano Pro', vw: 1600, vh: 1000, varejo: true, novoProduto: true },
};
const BUBBLE = 'button:has(canvas), button[aria-label*="Aurora" i]';

async function waitPort() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  const wanted = process.argv.slice(2);
  const names = wanted.length ? wanted : Object.keys(SCREENS);
  let vite = null;
  try { await fetch(BASE); } catch {
    vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    if (!(await waitPort())) throw new Error('vite não subiu');
  }
  const browser = await chromium.launch();
  fs.mkdirSync(OUT, { recursive: true });
  const baseModules = { ...MODULES };

  for (const name of names) {
    const s = SCREENS[name]; if (!s) { console.log('tela desconhecida', name); continue; }
    // variante varejo: muda niche/módulos do tenant fictício só para esta captura
    tenant.niche = s.varejo ? 'Varejo' : 'Tecnologia';
    tenant.modules = s.varejo ? { ...baseModules, varejo: true } : baseModules;
    const context = await browser.newContext({ viewport: { width: s.vw, height: s.vh }, deviceScaleFactor: 1600 / s.vw, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });
    await context.addInitScript(([key, sess]) => {
      try { localStorage.setItem(key, sess); localStorage.setItem('theme', 'light'); } catch {}
    }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
    await installMocks(context, (m) => process.env.DEBUG_LP && console.log('  ', m));
    const page = await context.newPage();
    page.on('pageerror', (e) => process.env.DEBUG_LP && console.log('  pageerror', e.message));
    try { await page.routeWebSocket(/.*/, (ws) => ws.close()); } catch {}
    await page.goto(BASE + s.path, { waitUntil: 'domcontentloaded' });
    if (s.wait) await page.getByText(s.wait).first().waitFor({ timeout: 25000 }).catch(() => console.log(`  (${name}) texto "${s.wait}" não apareceu`));
    await page.waitForTimeout(4500);
    if (s.aurora) {
      await page.locator(BUBBLE).last().click().catch(() => {});
      await page.waitForTimeout(800);
      const ta = page.locator('textarea').last();
      await ta.fill(AURORA_Q).catch(() => {});
      await ta.press('Enter').catch(() => {});
      await page.waitForTimeout(3500);
    }
    if (s.novoProduto) {
      await page.getByText('Cadastrar Produto').first().click().catch(() => {});
      await page.waitForTimeout(1500);
      await page.getByText(/Varejo|Físico/).first().click().catch(() => {});
      await page.waitForTimeout(1000);
    }
    // sem balão flutuante (Aurora/ajuda) nem toasts
    await page.addStyleTag({ content: '[data-sonner-toaster], vite-error-overlay { display:none !important }' }).catch(() => {});
    await page.evaluate(() => document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && r.width < 140 && r.height < 140 && r.right > innerWidth - 150 && r.bottom > innerHeight - 150) el.style.setProperty('display', 'none', 'important');
    })).catch(() => {});
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, ...(s.cropY ? { clip: { x: 0, y: 0, width: s.vw, height: s.cropY } } : {}) });
    console.log(name, fs.statSync(file).size);
    await context.close();
  }
  console.log('tabelas sem fixture requisitadas:', [...unmocked].join(', '));
  await browser.close();
  vite?.kill();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
