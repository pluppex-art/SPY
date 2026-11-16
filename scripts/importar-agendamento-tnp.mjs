// Importa as reservas (e, se faltar, a configuração) do Tô Na Pista para o módulo Agendamento do SPY.
//
//   SEGURO POR PADRÃO: sem --executar só LÊ e mostra o que faria (nada é gravado).
//
// Uso:
//   SPY_SUPABASE_URL="https://xxxx.supabase.co" \
//   SPY_SUPABASE_SERVICE_KEY="..." \
//   TENANT_ID="uuid-da-empresa-no-spy" \
//   node scripts/importar-agendamento-tnp.mjs              # simulação
//   node scripts/importar-agendamento-tnp.mjs --executar   # grava de verdade
//
// Regras:
//  * Idempotente: cada reserva guarda o id de origem em `externo_id`; rodar de novo não duplica.
//  * Mantém o id da reserva quando ele é um UUID (assim o check-in por unidade, que usa o id, continua valendo).
//  * NÃO cria lançamentos financeiros nem leads: o sync-to-spy antigo já criou (lançamento `tnp_fat_<id>`, lead por telefone).
//    O módulo reaproveita esse lançamento se a reserva for alterada depois.
//  * NÃO copia a chave do Mercado Pago do Tô Na Pista; o pagamento online fica DESLIGADO até você ligar em Configurações.
//  * Não passa pela regra de capacidade (é histórico): reservas já existentes entram como estão.

import { randomUUID } from "node:crypto";

const TNP_URL = "https://rmirkhebjgvsqqenszts.supabase.co";
const TNP_KEY = "sb_publishable_h9bKTMYVO5RvO5eBQZTsNQ_zyZBQCc3"; // chave pública (a mesma do site), só leitura
const SPY_URL = (process.env.SPY_SUPABASE_URL || "").replace(/\/$/, "");
const SPY_KEY = process.env.SPY_SUPABASE_SERVICE_KEY || "";
const TENANT = process.env.TENANT_ID || "";
const EXECUTAR = process.argv.includes("--executar");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!SPY_URL || !SPY_KEY || !UUID.test(TENANT)) {
  console.error("Defina SPY_SUPABASE_URL, SPY_SUPABASE_SERVICE_KEY e TENANT_ID (uuid) antes de rodar.");
  process.exit(1);
}

async function rest(base, key, tabela, params = "", init = {}) {
  const r = await fetch(`${base}/rest/v1/${tabela}${params ? `?${params}` : ""}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${tabela} → HTTP ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}
async function todas(base, key, tabela, select = "*", order = "id") {
  const out = []; const passo = 1000;
  for (let de = 0; ; de += passo) {
    const lote = await rest(base, key, tabela, `select=${encodeURIComponent(select)}&order=${order}&limit=${passo}&offset=${de}`);
    out.push(...lote);
    if (lote.length < passo) break;
  }
  return out;
}

const dataISO = (v) => { const m = String(v ?? "").match(/^(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; const br = String(v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})/); return br ? `${br[3]}-${br[2]}-${br[1]}` : null; };
const horaHHMM = (v) => { const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };
const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");
const STATUS = { pendente: "Pendente", confirmada: "Confirmada", "check-in": "Check-in", checkin: "Check-in", cancelada: "Cancelada", "no-show": "No-show", "no show": "No-show" };
const PAGTO = { pendente: "Pendente", pago: "Pago", reembolsado: "Reembolsado", "pendente estorno": "Pendente Estorno" };

function converter(r, clientes) {
  const data = dataISO(r.date), hora = horaHHMM(r.time);
  if (!data) return { erro: "data inválida" };
  if (!hora) return { erro: "hora inválida" };
  const status = STATUS[String(r.status ?? "Pendente").trim().toLowerCase()];
  if (!status) return { erro: `status desconhecido: ${r.status}` };
  const statusPag = PAGTO[String(r.payment_status ?? "Pendente").trim().toLowerCase()];
  if (!statusPag) return { erro: `status de pagamento desconhecido: ${r.payment_status}` };
  const duracao = Math.round(Math.max(1, Number(r.duration) || 1) * 10) / 10;
  if (duracao > 24) return { erro: "duração acima de 24h" };
  const cli = clientes.get(r.client_id) || {};
  const id = UUID.test(String(r.id)) ? String(r.id) : randomUUID();
  // Se o id mudou, os ids de unidade (`<id>_HH:00_n`) precisam acompanhar.
  const remapUid = (u) => (id === r.id ? u : String(u).replace(String(r.id), id));
  return {
    linha: {
      id, tenant_id: TENANT, grupo_id: randomUUID(), data, hora, duracao, qtd_recursos: Math.max(1, Number(r.lane_count) || 1), qtd_pessoas: Math.max(0, Number(r.people_count) || 0),
      valor_total: Math.max(0, Number(r.total_value) || 0), tipo_evento: r.event_type || null, observacoes: r.observations || null, status, status_pagamento: statusPag,
      forma_pagamento: r.payment_method || null, detalhes_pagamento: Array.isArray(r.payment_details) ? r.payment_details.map((d) => ({ method: d.method ?? d.metodo, amount: Number(d.amount ?? d.valor) || 0 })) : [],
      pagar_no_local: !!r.pay_on_site, comanda: r.comanda_id ? String(r.comanda_id) : null, mesa: !!r.has_table_reservation, mesa_cadeiras: r.table_seat_count ? Number(r.table_seat_count) : null,
      aniversariante: r.birthday_name || null, checkin_ids: (r.checked_in_ids || []).map(remapUid), noshow_ids: (r.no_show_ids || []).map(remapUid),
      recursos_atribuidos: (Array.isArray(r.pistas_usadas) ? r.pistas_usadas : []).map(Number).filter(Number.isInteger), origem: "importacao",
      contato_nome: String(r.client_name || cli.name || "Cliente").slice(0, 120), contato_telefone: soDigitos(cli.phone) || null, contato_email: String(cli.email || "").trim().toLowerCase() || null,
      externo_id: String(r.id), created_at: r.created_at || new Date().toISOString(),
    },
  };
}

(async () => {
  console.log(EXECUTAR ? "MODO EXECUÇÃO — vai gravar no SPY.\n" : "SIMULAÇÃO — nada será gravado (use --executar para gravar).\n");
  const tenant = (await rest(SPY_URL, SPY_KEY, "tenants", `select=id,name&id=eq.${TENANT}`))[0];
  if (!tenant) throw new Error("TENANT_ID não existe no SPY.");
  console.log(`Empresa de destino: ${tenant.name}`);

  const [reservas, clientesLista, existentes, cfgExistente] = await Promise.all([
    todas(TNP_URL, TNP_KEY, "reservas", "*", "created_at"),
    todas(TNP_URL, TNP_KEY, "clientes", "id,name,email,phone"),
    todas(SPY_URL, SPY_KEY, "agendamento_reservas", "externo_id", "id").then((l) => new Set(l.filter((x) => x.externo_id).map((x) => x.externo_id))).catch(() => { throw new Error("A tabela agendamento_reservas não existe: aplique antes a migração 20261122_agendamento.sql."); }),
    rest(SPY_URL, SPY_KEY, "agendamento_config", `select=tenant_id&tenant_id=eq.${TENANT}`),
  ]);
  const clientes = new Map(clientesLista.map((c) => [c.id, c]));
  console.log(`Tô Na Pista: ${reservas.length} reservas, ${clientesLista.length} clientes. Já importadas antes: ${existentes.size}.\n`);

  const novas = [], puladas = [], jaExiste = [];
  for (const r of reservas) {
    if (existentes.has(String(r.id))) { jaExiste.push(r.id); continue; }
    const c = converter(r, clientes);
    if (c.erro) puladas.push({ id: r.id, motivo: c.erro }); else novas.push(c.linha);
  }

  const porStatus = {}; let valor = 0, min = "9999", max = "0000";
  for (const l of novas) { porStatus[l.status] = (porStatus[l.status] || 0) + 1; if (l.status_pagamento === "Pago") valor += l.valor_total; min = l.data < min ? l.data : min; max = l.data > max ? l.data : max; }
  console.log(`A importar: ${novas.length} · já existentes (ignoradas): ${jaExiste.length} · com problema (puladas): ${puladas.length}`);
  if (novas.length) console.log(`Período: ${min} a ${max} · total pago: R$ ${valor.toFixed(2)}\nPor status:`, porStatus);
  if (puladas.length) { console.log("\nPuladas (corrija na origem ou ignore):"); for (const p of puladas.slice(0, 30)) console.log(`  - ${p.id}: ${p.motivo}`); if (puladas.length > 30) console.log(`  … e mais ${puladas.length - 30}`); }
  const semContato = novas.filter((l) => !l.contato_telefone && !l.contato_email).length;
  if (semContato) console.log(`\nAviso: ${semContato} reserva(s) sem telefone/e-mail do cliente (entram assim mesmo).`);

  // Configuração: só cria se a empresa ainda não tiver (nunca sobrescreve o que já foi configurado no SPY).
  if (cfgExistente.length === 0) {
    const [cfg] = await rest(TNP_URL, TNP_KEY, "configuracoes", "select=*&limit=1");
    const horas = await rest(TNP_URL, TNP_KEY, "configuracao_horarios", "select=*&order=day_of_week.asc").catch(() => []);
    const horarios = Array.from({ length: 7 }, (_, i) => { const h = horas.find((x) => x.day_of_week === i); return h ? { aberto: !!h.is_open, inicio: Math.min(23, Number(h.start_hour) || 0), fim: Math.min(23, Number(h.end_hour) || 0) } : { aberto: i !== 1, inicio: 18, fim: 0 }; });
    const nome = cfg?.establishment_name || tenant.name;
    const slug = String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    const linhaCfg = { tenant_id: TENANT, slug: slug.length >= 3 ? slug : null, ativo: false, nome_estabelecimento: nome, endereco: cfg?.address || null, telefone: cfg?.phone || null, whatsapp: cfg?.whatsapp_link || null, logo_url: /^https:\/\//i.test(cfg?.logo_url || "") ? cfg.logo_url : null,
      qtd_recursos: Number(cfg?.active_lanes) || 6, preco_dia_util: Number(cfg?.weekday_price) || 0, preco_fim_semana: Number(cfg?.weekend_price) || 0, horarios, datas_bloqueadas: (cfg?.blocked_dates || []).map(dataISO).filter(Boolean), pagamento_online: false };
    console.log(`\nConfiguração: a empresa ainda não tem — ${EXECUTAR ? "criando" : "seria criada"} (página pública DESLIGADA, pagamento online DESLIGADO, endereço "${linhaCfg.slug}"). Preço/h: R$ ${linhaCfg.preco_dia_util} / R$ ${linhaCfg.preco_fim_semana}, ${linhaCfg.qtd_recursos} pistas.`);
    if (EXECUTAR) await rest(SPY_URL, SPY_KEY, "agendamento_config", "", { method: "POST", body: JSON.stringify(linhaCfg), headers: { Prefer: "return=minimal" } });
  } else console.log("\nConfiguração: já existe no SPY — não será alterada.");

  if (!EXECUTAR) { console.log("\nSimulação concluída. Nada foi gravado."); return; }
  let ok = 0;
  for (let i = 0; i < novas.length; i += 200) {
    const lote = novas.slice(i, i + 200);
    await rest(SPY_URL, SPY_KEY, "agendamento_reservas", "", { method: "POST", body: JSON.stringify(lote), headers: { Prefer: "return=minimal" } });
    ok += lote.length; console.log(`  ${ok}/${novas.length} gravadas`);
  }
  console.log(`\nConcluído: ${ok} reservas importadas. Pode rodar de novo sem duplicar.`);
})().catch((e) => { console.error("\nERRO:", e.message); process.exit(1); });
