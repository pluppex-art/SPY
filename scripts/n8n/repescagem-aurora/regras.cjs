// Regras da repescagem pela Aurora (usadas pelos nós Code do n8n e pelos testes: ver gerar-fluxo.cjs).
// A Aurora chama, por um número só dela (que não conversa), o cliente que parou de responder; o vendedor é avisado
// quando a mensagem chega ao cliente e quando ele responde ("levanta a mão").
const PADRAO = { ativo: false, horas: 48, inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5, 6], limiteDia: 10, intervaloDias: 30,
  mensagem: '', modoTeste: true, numeroTeste: '', ativadoEm: '' };
const MENSAGEM_PADRAO = 'Oi, {cliente}! Aqui é a Aurora, assistente de {vendedor}. Nossa conversa ficou parada: ainda posso te ajudar? Responda aqui e {vendedor} chama você pelo WhatsApp de sempre.';
const COMO_SAIR = 'Para não receber mais este tipo de mensagem, responda SAIR.';
const FUSO = -3 * 3600e3; // horário de Brasília
const DIA = 86400e3;
const ESPERA_TESTE_MIN = 5;      // no modo de teste a conversa conta como parada depois de 5 minutos
const PARADA_MAXIMA_DIAS = 15;   // conversa mais velha que isso não é mais chamada
const RESPOSTA_ATE_DIAS = 7;     // resposta depois disso já não é "levantar a mão" da chamada
const FECHADOS = ['Fechado', 'Ganho', 'Ganhou', 'Perdido', 'Desqualificado'];
/** Nome da sessão do número da Aurora desta empresa (o servidor do app usa a mesma conta: ver tests). */
const numeroDaAurora = (tenant) => 'aurora-repescagem-' + String(tenant || '').replace(/-/g, '').slice(0, 12);

const hm = (s, d) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : d; };
function config(v) {
  const c = { ...PADRAO, ...(v || {}) };
  c.horas = Math.max(1, Number(c.horas) || PADRAO.horas);
  c.limiteDia = Math.min(30, Math.max(1, Number(c.limiteDia) || PADRAO.limiteDia));
  c.intervaloDias = Math.max(7, Number(c.intervaloDias) || PADRAO.intervaloDias);
  c.dias = Array.isArray(c.dias) && c.dias.length ? c.dias.map(Number) : PADRAO.dias;
  c.modoTeste = c.modoTeste !== false; // só envia a clientes quando o teste é desligado de propósito
  return c;
}
function noExpediente(t, c) {
  const l = new Date(t + FUSO); const dia = l.getUTCDay() || 7; const min = l.getUTCHours() * 60 + l.getUTCMinutes();
  return c.dias.includes(dia) && min >= hm(c.inicio, 540) && min < hm(c.fim, 1080);
}
const diaLocal = (t) => new Date(t + FUSO).toISOString().slice(0, 10);
const limpo = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const digitos = (p) => String(p || '').replace(/\D/g, '');
const fone8 = (p) => { const d = digitos(p); return d.length >= 8 ? d.slice(-8) : ''; };
/** Número completo para o WhatsApp, ou '' quando não é um telefone (ex.: identificador interno). */
const paraZap = (p) => { let d = digitos(p); if (d.length === 10 || d.length === 11) d = '55' + d; return d.length >= 12 && d.length <= 13 ? d : ''; };

/** O cliente disse que não quer: nunca é chamado de novo, e o vendedor não recebe "levantou a mão". */
function recusa(texto) {
  const s = limpo(texto);
  if (!s) return false;
  return /^(sair|parar|pare|para|stop|cancelar|remover)$/.test(s)
    || /\b(quero sair|nao quero|nao tenho (mais )?interesse|nao (estou|to|tou) (mais )?interessad[oa]|sem interesse|nao me (mande|manda|chame|chama|envie|envia)|nao (mande|manda|envie) mais|pare de|para de (me )?(mandar|chamar|enviar)|me (tira|remove|descadastra)|ja (comprei|fechei|resolvi)|comprei em outro|nao precisa( mais)?|nao preciso( mais)?|nao vou (querer|comprar|fechar))\b/.test(s);
}

const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return /^[A-Za-zÀ-ÿ'-]{2,}$/.test(p) ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''; };

function montarMensagem(c, d) {
  let t = String(c.mensagem || '').trim() || MENSAGEM_PADRAO;
  const cliente = primeiroNome(d.cliente);
  if (!cliente) t = t.replace(/,?\s*\{cliente\}/g, '');
  t = t.replace(/\{cliente\}/g, cliente).replace(/\{vendedor\}/g, primeiroNome(d.vendedor) || 'a nossa equipe').replace(/\{empresa\}/g, d.empresa || 'nossa empresa');
  return /\bSAIR\b/.test(t) ? t : t + '\n\n' + COMO_SAIR;
}

/** Agrupa as mensagens por cliente (8 últimos dígitos), em ordem. */
function conversas(msgs) {
  const por = {};
  for (const m of msgs) {
    const f8 = fone8(m.fone);
    if (f8) (por[f8] = por[f8] || []).push(m);
  }
  for (const l of Object.values(por)) l.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return por;
}
const registros = (historico, acao) => historico.filter((h) => h.action === acao && h.details && h.details.f8);
const modoDe = (c) => (c.modoTeste ? 't' : 'r');

/** Clientes que pararam de responder e podem ser chamados (ainda sem conferir lead e vendedor). */
function candidatos(msgs, historico, c, agora) {
  const teste8 = c.modoTeste ? fone8(c.numeroTeste) : '';
  if (c.modoTeste && !teste8) return [];
  const espera = c.modoTeste ? ESPERA_TESTE_MIN * 60e3 : c.horas * 3600e3;
  const desde = c.ativadoEm ? Date.parse(c.ativadoEm) : NaN;
  if (!c.modoTeste && (!noExpediente(agora, c) || Number.isNaN(desde))) return []; // sem data de ativação não há envio em massa do histórico
  const modo = modoDe(c);
  const recusados = new Set(registros(historico, 'repescagem_recusa').filter((h) => h.details.modo === modo).map((h) => h.details.f8));
  const intervalo = c.modoTeste ? 3600e3 : c.intervaloDias * DIA;
  const chamados = new Set(registros(historico, 'repescagem_chamada').filter((h) => h.details.modo === modo && agora - Date.parse(h.created_at) < intervalo).map((h) => h.details.f8));
  const out = [];
  for (const [f8, l] of Object.entries(conversas(msgs))) {
    if (c.modoTeste && f8 !== teste8) continue;
    if (recusados.has(f8) || chamados.has(f8)) continue;
    const ult = l[l.length - 1];
    if (ult.sender === 'contact') continue; // quem está devendo resposta é a loja: isso é outro aviso
    const doCliente = l.filter((m) => m.sender === 'contact');
    if (!doCliente.length) continue; // nunca abordar quem nunca falou
    if (doCliente.slice(-3).some((m) => recusa(m.text))) continue;
    const quando = Date.parse(ult.created_at);
    const parada = agora - quando;
    if (parada < espera || parada > PARADA_MAXIMA_DIAS * DIA) continue;
    if (!c.modoTeste && quando < desde) continue;
    const fone = paraZap(ult.fone);
    if (!fone || !ult.instancia) continue;
    out.push({ f8, fone, nome: ult.nome || '', instancia: ult.instancia, contact_id: ult.contact_id, paradaDesde: ult.created_at });
  }
  return out.sort((a, b) => Date.parse(b.paradaDesde) - Date.parse(a.paradaDesde));
}

/** Depois da chamada: a mensagem chegou ao cliente? ele respondeu? (no número da Aurora ou no do vendedor) */
function respostas(msgs, historico, c, agora, noNumero) {
  const modo = modoDe(c);
  const feito = (acoes) => new Set(acoes.flatMap((a) => registros(historico, a)).map((h) => h.details.chamada));
  const respondidas = feito(['repescagem_resposta', 'repescagem_recusa']);
  const entregues = feito(['repescagem_entregue']);
  const por = conversas(msgs);
  const out = [];
  for (const h of registros(historico, 'repescagem_chamada')) {
    const d = h.details; const em = Date.parse(h.created_at);
    if (d.modo !== modo || agora - em > RESPOSTA_ATE_DIAS * DIA || respondidas.has(h.id)) continue;
    const doNumero = (noNumero && noNumero[h.id]) || [];
    const novas = [
      ...doNumero.filter((m) => !m.fromMe && Number(m.timestamp) * 1000 > em).map((m) => ({ em: Number(m.timestamp) * 1000, text: m.body || '[áudio ou arquivo]' })),
      ...(por[d.f8] || []).filter((m) => m.sender === 'contact' && Date.parse(m.created_at) > em).map((m) => ({ em: Date.parse(m.created_at), text: m.text })),
    ].sort((a, b) => a.em - b.em);
    const base = { f8: d.f8, chamada: h.id, instancia: d.instancia, nome: d.cliente || '', fone: d.destino || '' };
    if (novas.length) out.push({ ...base, texto: String(novas[0].text || '').slice(0, 200), tipo: novas.some((m) => recusa(m.text)) ? 'recusa' : 'mao' });
    // 2 = chegou no aparelho, 3 = lida
    else if (!entregues.has(h.id) && doNumero.some((m) => m.fromMe && Number(m.ack) >= 2 && Number(m.timestamp) * 1000 > em - 180e3)) out.push({ ...base, texto: '', tipo: 'entregue' });
  }
  return out;
}

/** Junta candidatos e respostas com lead, vendedor e limites, e diz o que fazer. */
function decidir({ cands, resps, c, agora, historico, leads, instancias, colaboradores, usuarios, empresa, tenant, numeroLigado }) {
  const modo = modoDe(c);
  const internos = new Set([...colaboradores.map((x) => fone8(x.phone)), ...instancias.map((x) => fone8(x.phone))].filter(Boolean));
  const dono = (instancia) => {
    const i = instancias.find((x) => x.id === instancia);
    const col = i && colaboradores.find((x) => String(x.id) === String(i.colaborador_id));
    if (!i || !col || (col.status && limpo(col.status) !== 'ativo')) return null;
    const userIds = [...new Set(usuarios.filter((u) => u.id === col.user_id || limpo(u.name) === limpo(col.nome)).map((u) => u.id))];
    return { sessao: i.name, nome: col.nome, fone: paraZap(i.phone || col.phone), userIds, vendas: !i.finalidade || i.finalidade === 'vendas' };
  };
  const leadAberto = (f8) => leads.find((l) => fone8(l.phone_digits) === f8 && !FECHADOS.includes(l.status)) || null;
  const acoes = [];
  const pulados = { interno: 0, sem_lead: 0, sem_vendedor: 0, limite: 0, numero_desligado: 0 };

  const hoje = diaLocal(agora);
  const usadas = registros(historico, 'repescagem_chamada').filter((h) => h.details.modo === modo && diaLocal(Date.parse(h.created_at)) === hoje).length;
  let nestaRodada = 0; // um número só envia: uma chamada a cada rodada, para não parecer disparo em massa
  for (const x of cands) {
    if (!c.modoTeste && internos.has(x.f8)) { pulados.interno++; continue; }
    const lead = leadAberto(x.f8);
    if (!c.modoTeste && !lead) { pulados.sem_lead++; continue; }
    const v = dono(x.instancia);
    if (!v || !v.vendas) { pulados.sem_vendedor++; continue; }
    if (!numeroLigado) { pulados.numero_desligado++; continue; }
    if (nestaRodada >= 1 || usadas >= c.limiteDia) { pulados.limite++; continue; }
    nestaRodada++;
    const cliente = (lead && (lead.clientName || lead.name)) || x.nome;
    acoes.push({ tipo: 'chamada', chave: 'repesc:' + modo + ':' + x.f8, ttl: c.modoTeste ? 3600 : 86400, modo, f8: x.f8, instancia: x.instancia, cliente,
      lead_id: lead ? lead.id : null, vendedor: v.nome, sessao: numeroDaAurora(tenant), destino: x.fone, texto: montarMensagem(c, { cliente, vendedor: v.nome, empresa }) });
  }

  for (const r of resps) {
    const v = dono(r.instancia);
    if (!v) { pulados.sem_vendedor++; continue; }
    const lead = leadAberto(r.f8);
    const cliente = (lead && (lead.clientName || lead.name)) || r.nome || 'cliente';
    const link = lead ? '/app/crm/pipeline?leadId=' + lead.id : '/app/crm/pipeline';
    const mao = r.tipo === 'mao';
    const chegou = r.tipo === 'entregue';
    const titulo = chegou ? 'Aurora chamou o cliente' : mao ? 'Cliente levantou a mão' : 'Cliente pediu para não ser chamado';
    const descricao = chegou ? cliente + ' recebeu a mensagem da Aurora. Se responder, você é avisado.'
      : mao ? cliente + ' respondeu: “' + r.texto + '”. Fale agora para fazer a repescagem.'
      : cliente + ' respondeu: “' + r.texto + '”. A Aurora não vai chamar este cliente de novo.';
    const link2 = r.fone ? '\nhttps://wa.me/' + r.fone : '';
    const zap = (chegou ? '📨 *Aurora chamou o cliente*\n*' + cliente + '* recebeu a mensagem. Se responder, eu aviso.' + link2
      : '🙋 *Cliente levantou a mão*\n*' + cliente + '* respondeu: "' + r.texto + '"\nFale agora pelo seu WhatsApp:' + link2) + '\n\n_Aurora · SPY_';
    const teste = paraZap(c.numeroTeste);
    const meus = c.modoTeste ? usuarios.filter((u) => fone8(u.phone) && fone8(u.phone) === fone8(teste)).map((u) => u.id) : v.userIds;
    const destino = c.modoTeste ? teste : v.fone;
    acoes.push({ tipo: r.tipo, chave: 'repesc:' + (chegou ? 'entrega:' : 'resp:') + modo + ':' + r.chamada, ttl: RESPOSTA_ATE_DIAS * 86400 + 86400, modo, f8: r.f8, chamada: r.chamada, instancia: r.instancia, cliente, lead_id: lead ? lead.id : null, vendedor: v.nome,
      popups: meus.map((id) => ({ user_id: id, title: (c.modoTeste ? '[TESTE] ' : '') + titulo, description: descricao, type: mao ? 'warning' : 'info', link_url: link, is_read: false })),
      // a recusa fica só no sistema; o WhatsApp do vendedor é para agir
      aviso: (mao || chegou) && destino ? { destino, texto: (c.modoTeste ? '[TESTE] Iria para ' + v.nome + '\n' : '') + zap } : null });
  }
  return { acoes, pulados };
}

module.exports = { numeroDaAurora, PADRAO, MENSAGEM_PADRAO, COMO_SAIR, config, noExpediente, recusa, montarMensagem, candidatos, respostas, decidir, fone8, paraZap };
