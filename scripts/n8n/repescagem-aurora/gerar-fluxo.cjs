// Monta o código (n8n Workflow SDK) dos dois fluxos da repescagem a partir de regras.cjs.
//   node scripts/n8n/repescagem-aurora/gerar-fluxo.cjs <pasta de saída>
const fs = require('fs');
const path = require('path');

const regras = fs.readFileSync(path.join(__dirname, 'regras.cjs'), 'utf8')
  .split('\n').filter((l) => !/^\s*(\/\/|\/\*\*)/.test(l) && !l.startsWith('module.exports')).join('\n').trim();

// único nó com lógica: junta o que foi lido e devolve o que fazer
const decidirNo = regras + `
const e = $('Entrada').first().json;
let v = {}; try { v = JSON.parse(e.config || '{}'); } catch (x) {}
const c = config(v); const agora = Date.now(); const simular = e.simular === 'sim';
if (!simular && c.ativo !== true) return [];
const linhas = (n) => { const l = $(n).all().map((i) => i.json); if (l.some((x) => x.error)) throw new Error('Repescagem: falha ao ler ' + n); return l.filter((x) => x.id); };
const historico = linhas('Historico');
const msgs = linhas('Mensagens').map((m) => ({ ...m, instancia: m.whatsapp_instance_id, fone: (m.chat_contacts && m.chat_contacts.phone) || '', nome: (m.chat_contacts && m.chat_contacts.name) || '' }));
const cands = candidatos(msgs, historico, c, agora);
const sessao = $('Numero da Aurora').first().json;
const pend = $('Pendentes').all(); const conv = $('Conversa no Numero').all(); const noNumero = {};
pend.forEach((p, i) => { const b = conv[i] && conv[i].json.body; if (p.json.chamada && Array.isArray(b)) noNumero[p.json.chamada] = b; });
const resps = respostas(msgs, historico, c, agora, noNumero);
const emp = linhas('Empresa')[0];
const r = decidir({ cands, resps, c, agora, historico, leads: linhas('Leads'), instancias: linhas('Instancias'), colaboradores: linhas('Colaboradores'), usuarios: linhas('Usuarios').filter((u) => u.active !== false), empresa: emp ? emp.name : '', tenant: e.tenant_id, numeroLigado: sessao.status === 'WORKING' });
if (simular) return [{ json: { simulacao: true, mensagens_lidas: msgs.length, paradas: cands.length, respostas: resps.length, pulados: r.pulados, chamadas: r.acoes.filter((a) => a.tipo === 'chamada').length, numero: sessao.status || 'sem numero', entregues: r.acoes.filter((a) => a.tipo === 'entregue').length, maos: r.acoes.filter((a) => a.tipo === 'mao').length, recusas: r.acoes.filter((a) => a.tipo === 'recusa').length } }];
return r.acoes.map((a) => ({ json: a }));`;

const SB = 'https://snwkzvgompfgqoqbpihe.supabase.co/rest/v1/';
const T = "$('Entrada').first().json.tenant_id";
const j = JSON.stringify;
const credSB = "{ httpHeaderAuth: { id: '5ek4MaGIr0aPSUCv', name: 'Supabase Service Key (HTTP Request)' } }";
const credZap = "{ httpHeaderAuth: { id: 'tzcXTWcCFpiiCWE0', name: 'WAHA API Key' } }";

let x = 0;
const ler = (cons, nome, url, paginas) => `const ${cons} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${j(nome)}, executeOnce: true, alwaysOutputData: true, position: [${(x += 220)}, 0], credentials: ${credSB}, parameters: { url: expr(${j(url)}), authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 20000${paginas ? `, pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'qs', name: 'offset', value: ${j('={{ $pageCount * 1000 }}')} }] }, paginationCompleteWhen: 'other', completeExpression: ${j('={{ !Array.isArray($response.body) || $response.body.length < 1000 }}')}, limitPagesFetched: true, maxRequests: ${paginas} } }` : ''} } } } });`;
const codigo = (cons, nome, js, px, py) => `const ${cons} = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: ${j(nome)}, position: [${px}, ${py}], parameters: { jsCode: ${j(js)} } } });`;
const postar = (cons, nome, url, corpo, cred, px, py) => `const ${cons} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${j(nome)}, onError: 'continueRegularOutput', alwaysOutputData: true, position: [${px}, ${py}], credentials: ${cred}, parameters: { method: 'POST', url: ${j(url)}, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: expr(${j(corpo)}), options: { timeout: 20000 } } } });`;

const historico = `${SB}aurora_audit_log?tenant_id=eq.{{ ${T} }}&action=in.(repescagem_chamada,repescagem_entregue,repescagem_resposta,repescagem_recusa)&or=(action.eq.repescagem_recusa,created_at.gte.{{ $now.minus({ days: 100 }).toUTC().toISO() }})&select=id,action,details,created_at&order=created_at.desc&limit=1000`;
const mensagens = `${SB}chat_messages?tenant_id=eq.{{ ${T} }}&created_at=gte.{{ $now.minus({ days: 16 }).toUTC().toISO() }}&select=id,contact_id,whatsapp_instance_id,sender,text,created_at,chat_contacts(name,phone)&order=created_at.desc&limit=1000`;
const empresa = (tab, sel) => `${SB}${tab}?tenant_id=eq.{{ ${T} }}&select=${sel}&limit=1000`;

const pendentes = `const e = $('Entrada').first().json;
let v = {}; try { v = JSON.parse(e.config || '{}'); } catch (x) {}
const modo = v.modoTeste !== false ? 't' : 'r';
const h = $('Historico').all().map((i) => i.json).filter((x) => x.id && x.details);
const feitas = new Set(h.filter((x) => x.action === 'repescagem_resposta' || x.action === 'repescagem_recusa').map((x) => x.details.chamada));
const p = h.filter((x) => x.action === 'repescagem_chamada' && x.details.modo === modo && x.details.destino && Date.now() - Date.parse(x.created_at) < 7 * 86400e3 && !feitas.has(x.id)).slice(0, 60);
return (p.length ? p : [{ id: '', details: { destino: '0' } }]).map((x) => ({ json: { chamada: x.id, chat: x.details.destino + '@c.us' } }));`;
const nomeSessao = "{{ 'aurora-repescagem-' + $('Entrada').first().json.tenant_id.replace(/-/g, '').slice(0, 12) }}";
const lerZap = (cons, nome, url, porItem, px, extra) => `const ${cons} = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: ${j(nome)}, executeOnce: ${!porItem}, alwaysOutputData: true, onError: 'continueRegularOutput', position: [${px}, 0], credentials: ${credZap}, parameters: { url: expr(${j(url)}), authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 20000${extra} } } } });`;

const empresaFluxo = `import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';
const entrada = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.1, config: { name: 'Entrada', position: [0, 0], parameters: { workflowInputs: { values: [{ name: 'tenant_id', type: 'string' }, { name: 'config', type: 'string' }, { name: 'simular', type: 'string' }] } } } });
${ler('historico', 'Historico', historico, 5)}
${ler('mensagens', 'Mensagens', mensagens, 30)}
${ler('instancias', 'Instancias', empresa('whatsapp_instances', 'id,name,phone,colaborador_id,finalidade'))}
${ler('colaboradores', 'Colaboradores', empresa('colaboradores', 'id,user_id,nome,phone,status'))}
${ler('usuarios', 'Usuarios', empresa('users', 'id,name,active,phone') + '&deleted_at=is.null')}
${ler('empresaNome', 'Empresa', `${SB}tenants?id=eq.{{ ${T} }}&select=id,name`)}
${ler('leads', 'Leads', empresa('leads_com_contatos', 'id,name,clientName,status,phone_digits') + '&deleted_at=is.null&status=not.in.(Fechado,Ganho,Ganhou,Perdido,Desqualificado)&order=updated_at.desc', 10)}
${lerZap('numero', 'Numero da Aurora', 'https://waha.spycrm.com.br/api/sessions/' + nomeSessao, false, (x += 220), '')}
${codigo('pend', 'Pendentes', pendentes, (x += 220), 0)}
${lerZap('conversa', 'Conversa no Numero', 'https://waha.spycrm.com.br/api/' + nomeSessao + '/chats/{{ encodeURIComponent($json.chat) }}/messages?limit=20&downloadMedia=false', true, (x += 220), ', response: { response: { fullResponse: true } }')}
${codigo('decidir', 'Decidir', decidirNo, (x += 220), 0)}
const simulacao = node({ type: 'n8n-nodes-base.filter', version: 2.2, config: { name: 'Nao e Simulacao', position: [${(x += 220)}, 0], parameters: { conditions: { options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ id: 's1', leftValue: expr('{{ $json.simulacao !== true }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } } });
const trava = node({ type: 'n8n-nodes-base.redis', version: 1, config: { name: 'Trava de Repeticao', position: [${(x += 220)}, 0], credentials: { redis: { id: 'c0CSFCPnZVIdbZXz', name: 'Redis account' } }, parameters: { operation: 'incr', key: expr(${j(`{{ $json.chave + ':' + ${T} }}`)}), expire: true, ttl: expr('{{ $json.ttl }}') } } });
${codigo('novos', 'Somente Novos', `const todas = $('Nao e Simulacao').all();
return $input.all().map((r, i) => ({ r: r.json, a: todas[i] && todas[i].json })).filter((x) => x.a && Number(Object.values(x.r).find((v) => typeof v === 'number')) === 1).map((x) => ({ json: x.a }));`, (x += 220), 0)}
${codigo('chamadas', 'Separar Chamadas', "return $input.all().map((i) => i.json).filter((a) => a.tipo === 'chamada').map((a) => ({ json: a }));", (x += 220), -240)}
${postar('enviar', 'Chamar o Cliente', 'https://waha.spycrm.com.br/api/sendText', '{{ JSON.stringify({ session: $json.sessao, chatId: $json.destino + "@c.us", text: $json.texto }) }}', credZap, x + 220, -240)}
${codigo('resultado', 'Resultado da Chamada', `const pedidos = $('Separar Chamadas').all();
return $input.all().map((r, i) => { const a = pedidos[i].json; const falhou = !!r.json.error;
  return { json: { tenant_id: $('Entrada').first().json.tenant_id, actor: 'aurora', action: falhou ? 'repescagem_falha' : 'repescagem_chamada', details: { f8: a.f8, modo: a.modo, instancia: a.instancia, cliente: a.cliente, destino: a.destino, lead_id: a.lead_id, vendedor: a.vendedor, erro: falhou ? String(r.json.error.message || r.json.error).slice(0, 200) : undefined } } }; });`, x + 440, -240)}
${postar('regChamada', 'Registrar Chamada', SB + 'aurora_audit_log', '{{ JSON.stringify($json) }}', credSB, x + 660, -240)}
${codigo('popups', 'Separar Popups', `const t = $('Entrada').first().json.tenant_id;
return $input.all().flatMap((i) => (i.json.popups || []).map((p) => ({ json: { tenant_id: t, ...p } })));`, x, 0)}
${postar('criarPopup', 'Criar Popup', SB + 'notifications', '{{ JSON.stringify($json) }}', credSB, x + 220, 0)}
${codigo('avisos', 'Separar Avisos', 'return $input.all().filter((i) => i.json.aviso).map((i) => ({ json: i.json.aviso }));', x, 240)}
${postar('avisar', 'Avisar o Vendedor', 'https://waha.spycrm.com.br/api/sendText', '{{ JSON.stringify({ session: "Aurora-Equipe", chatId: $json.destino + "@c.us", text: $json.texto }) }}', credZap, x + 220, 240)}
${codigo('respostas', 'Separar Respostas', `return $input.all().map((i) => i.json).filter((a) => a.tipo !== 'chamada').map((a) => ({ json: { tenant_id: $('Entrada').first().json.tenant_id, actor: 'aurora', action: 'repescagem_' + ({ mao: 'resposta', recusa: 'recusa', entregue: 'entregue' })[a.tipo], details: { f8: a.f8, modo: a.modo, chamada: a.chamada, instancia: a.instancia, cliente: a.cliente, lead_id: a.lead_id, vendedor: a.vendedor } } }));`, x, 480)}
${postar('regResposta', 'Registrar Resposta', SB + 'aurora_audit_log', '{{ JSON.stringify($json) }}', credSB, x + 220, 480)}
export default workflow('repescagem-aurora-empresa', '[PLUPPEX AI OS] Repescagem Aurora (Empresa)')
  .add(entrada).to(historico).to(mensagens).to(instancias).to(colaboradores).to(usuarios).to(empresaNome).to(leads).to(numero).to(pend).to(conversa).to(decidir).to(simulacao).to(trava).to(novos)
  .add(novos).to(chamadas).to(enviar).to(resultado).to(regChamada)
  .add(novos).to(popups).to(criarPopup)
  .add(novos).to(avisos).to(avisar)
  .add(novos).to(respostas).to(regResposta);
`;

const agendador = (idEmpresa) => `import { workflow, node, trigger } from '@n8n/workflow-sdk';
const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 5 minutos', position: [0, 0], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } } });
const configuradas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Empresas Configuradas', executeOnce: true, alwaysOutputData: true, position: [220, 0], credentials: ${credSB}, parameters: { url: ${j(SB + 'app_settings?key=eq.crm_repescagem_aurora&select=tenant_id,value')}, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 20000 } } } });
${codigo('ligadas', 'Somente Ligadas', "return $input.all().map((i) => i.json).filter((r) => r.tenant_id && r.value && r.value.ativo === true).map((r) => ({ json: { tenant_id: r.tenant_id, config: JSON.stringify(r.value) } }));", 440, 0)}
const processar = node({ type: 'n8n-nodes-base.executeWorkflow', version: 1.2, config: { name: 'Processar Empresa', onError: 'continueRegularOutput', position: [660, 0], parameters: { mode: 'each', workflowId: { __rl: true, mode: 'id', value: ${j(idEmpresa)} }, workflowInputs: { mappingMode: 'defineBelow', matchingColumns: [], value: { tenant_id: '={{ $json.tenant_id }}', config: '={{ $json.config }}', simular: '' }, schema: [{ id: 'tenant_id', displayName: 'tenant_id', type: 'string', display: true }, { id: 'config', displayName: 'config', type: 'string', display: true }, { id: 'simular', displayName: 'simular', type: 'string', display: true }] }, options: { waitForSubWorkflow: true } } } });
export default workflow('repescagem-aurora-agendador', '[PLUPPEX AI OS] Repescagem Aurora (Agendador)')
  .add(relogio).to(configuradas).to(ligadas).to(processar);
`;

const saida = process.argv[2] || '.';
fs.writeFileSync(path.join(saida, 'empresa.workflow.js'), empresaFluxo);
fs.writeFileSync(path.join(saida, 'agendador.workflow.js'), agendador(process.argv[3] || 'ID_DO_FLUXO_DA_EMPRESA'));
fs.writeFileSync(path.join(saida, 'decidir.js'), decidirNo);
