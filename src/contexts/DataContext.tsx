import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { sendPushNotification } from "../lib/notifications";
import { isSupabaseReachable, supabase, fetchTenantPrimaryColor, updateTenantTheme } from '../lib/supabase';
import { DEFAULT_BRAND_COLOR, applyThemeColor } from '../lib/theme';
import { useAuth } from './AuthContext';
import { Lead, Task, Contract, CustomField, LeadScoreTrigger, Squad } from '../types';
import {
  defaultCustomLeadFields,
  defaultFinanceEntries,
  defaultGlobalWebhooks,
  defaultLeads,
  defaultTasks,
  defaultContracts,
  defaultActivitiesOnLoad,
  getDefaultAppointments,
  defaultSquads,
  defaultLeadScoreTriggers,
  defaultProducts
} from './dataMocks';
import { DataContext, DataContextType, LeadActivity, Notification, Appointment, GlobalWebhook, FinanceEntry, Reuniao, Indicacao, AuroraAgent, useData } from './DataContextTypes';
import { apiFetch } from "../lib/apiClient";
import { isDateLocked } from "../pages/finance/lib/financeEngine";
import { parseCurrencyBR } from "../lib/utils";
import { useLocalization } from "./LocalizationContext";
import { friendlyError } from "../lib/friendlyError";
import { OPEN_ENDED_BATCH_CYCLES } from "../lib/saleCalculator";

export { useData };
export type { DataContextType, LeadActivity, Notification, Appointment, GlobalWebhook, FinanceEntry, Reuniao };

// O PostgREST do Supabase limita a 1000 linhas por resposta por padrão — um
// simples `.select('*')` (sem paginação) silenciosamente cortava tenants com
// mais de 1000 linhas numa tabela (ex.: leads/reunioes de uma integração que
// sincroniza um volume grande de uma vez), sem erro nenhum, só mostrando os
// primeiros 1000 registros na tela. Pagina com `.range()` até esgotar.
const PAGE_STEP = 1000;

// A carga inicial busca ~44 tabelas (mais páginas extras de leads/reunioes
// quando precisam paginar) — sem limite, isso disparava 50+ requisições
// simultâneas competindo pelo pool de conexões do Postgres (Supavisor), e
// esse projeto fica em us-west-2: cada requisição individual já carrega
// ~150-250ms de latência de rede sozinha pra quem acessa do Brasil. Mais
// concorrência do que o pool aguenta vira fila, e a fila conta como tempo de
// carregamento pro usuário. Este limitador bota um teto (10 requisições ao
// Supabase por vez) em TODA a carga inicial — inclusive nas páginas extras de
// leads/reunioes, que passam pela mesma fila.
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const runNext = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const task = queue.shift()!;
    task();
  };
  // `fn` retorna o builder do Supabase (PostgrestFilterBuilder), que é
  // "thenable" mas não uma Promise de verdade (falta .catch/.finally) —
  // aceita PromiseLike e normaliza com Promise.resolve.
  return function limit<T>(fn: () => PromiseLike<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        Promise.resolve(fn()).then(resolve, reject).finally(() => {
          active--;
          runNext();
        });
      });
      runNext();
    });
  };
}
// Testado em produção: com 15, um erro real apareceu — log do Postgres
// mostrou "canceling statement due to statement timeout" numa query de
// reunioes (que sozinha leva 21ms) batendo no timeout de 8s do papel
// `authenticated`. 10 ficou validado como seguro por muito tempo depois
// disso. A rajada de timeouts de 2026-09-19 tinha DUAS causas empilhadas:
// o compute "Micro" do Supabase saturando sob ~70 req/min, E o realtime
// disparando refetch de tabela inteira a cada evento (uma sincronização em
// massa gerava dezenas de refetches simultâneos). A causa do realtime foi
// eliminada (patch incremental em vez de refetch — ver applyRealtimeUpsert),
// então reduzir a 6 aqui também ficou excessivo: volta pro nível 10
// validado, que já tinha rodado bem antes desse incidente específico.
const dbLimit = createLimiter(10);

async function fetchPageWithRetry(
  table: string,
  tenantId: string,
  extraFilter: ((query: any) => any) | undefined,
  from: number,
  withCount: boolean
): Promise<{ data: any[] | null; error: any; count: number | null }> {
  let data: any[] | null = null;
  let error: any = null;
  let count: number | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res: any = await dbLimit(() => {
      let query = supabase!.from(table).select('*', withCount ? { count: 'exact' } : undefined).eq('tenant_id', tenantId);
      if (extraFilter) query = extraFilter(query);
      return query.range(from, from + PAGE_STEP - 1);
    });
    data = res.data;
    error = res.error;
    count = res.count ?? null;
    if (!error) break;
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return { data, error, count };
}

// Tabelas grandes (leads/reunioes) precisam de várias páginas pra trazer
// tudo. Buscá-las uma de cada vez (sequencial) fazia a carga inicial somar a
// LATÊNCIA de cada página — com leads (4 páginas) + reunioes (5 páginas)
// dessa forma, só essas duas tabelas já eram 9 round-trips em série. Agora
// a 1ª página vem com `count: 'exact'` (sabe o total sem round-trip extra) e
// as páginas restantes disparam todas em paralelo — 9 round-trips sequenciais
// viram 2 "ondas" (1ª página, depois o resto de uma vez).
//
// Resiliência a falha parcial: cada página tenta de nov o até 3x antes de
// desistir; se mesmo assim uma falhar, devolve o que já foi buscado com
// sucesso nas outras em vez de jogar tudo fora — melhor mostrar 90% dos
// registros do que zerar a tela inteira (e o chamador sabe disso pelo
// `error` retornado, sem precisar que ele seja null pra usar o `data`).
async function fetchAllRowsForTenant(table: string, tenantId: string, extraFilter?: (query: any) => any) {
  const first = await fetchPageWithRetry(table, tenantId, extraFilter, 0, true);
  if (first.error) {
    console.error(`[fetchAllRowsForTenant] Falha ao buscar 1ª página de "${table}" após 3 tentativas.`, first.error);
    return { data: [] as any[], error: first.error };
  }
  const firstPage = first.data ?? [];
  const total = first.count;

  // Sem contagem confiável (não deveria acontecer sem erro, mas por
  // segurança) ou só 1 página — não há o que paralelizar.
  if (total === null || firstPage.length < PAGE_STEP || total <= PAGE_STEP) {
    return { data: firstPage, error: null as any };
  }

  const remainingFroms: number[] = [];
  for (let from = PAGE_STEP; from < total; from += PAGE_STEP) remainingFroms.push(from);

  const rest = await Promise.all(
    remainingFroms.map((from) => fetchPageWithRetry(table, tenantId, extraFilter, from, false))
  );

  let all = firstPage;
  let firstError: any = null;
  for (const page of rest) {
    if (page.error) {
      firstError = firstError ?? page.error;
      console.error(`[fetchAllRowsForTenant] Falha numa página de "${table}" após 3 tentativas — mantendo as demais páginas já obtidas.`, page.error);
      continue;
    }
    if (page.data) all = all.concat(page.data);
  }
  return { data: all, error: firstError };
}

// Aplica um evento realtime (INSERT/UPDATE/DELETE) direto no estado local em
// vez de disparar um refetch da tabela inteira — antes, TODO handler de
// realtime (exceto INSERT de leads) recarregava a tabela completa a cada
// evento. Numa sincronização em massa (ex.: automação reserva → proposta →
// contrato → financeiro, que grava em várias tabelas quase ao mesmo tempo),
// isso disparava um refetch paginado de cada tabela afetada dentro da mesma
// janela de ~1.5s (debounce), somando uma rajada de dezenas de requisições
// simultâneas — foi exatamente essa rajada que saturou o compute do Supabase
// e gerou "statement timeout" em cascata (confirmado nos logs em 2026-09-19).
// DELETE não depende de tenant_id: como o filtro é por id contra o estado já
// carregado, um id de outro tenant simplesmente não bate com nada (no-op).
// Cache de sessão (sessionStorage) pra tabelas de catálogo/configuração que
// mudam pouco (products, crm_funis, squads) — evita reconsultar o Supabase
// toda vez que o usuário troca de tenant e volta (comum em contas
// master/parceiro que alternam entre várias empresas). TTL curto (5min) +
// invalidação ativa: toda vez que um evento realtime dessas tabelas dispara
// um refetch (algo mudou de verdade), o resultado fresco sobrescreve o cache
// também — nunca fica noticeably desatualizado, só evita refetch redundante
// quando NADA mudou.
const CACHE_TTL_MS = 5 * 60 * 1000;
function cacheKey(tenantId: string, table: string) { return `spy_cache:${tenantId}:${table}`; }
function cacheGet(tenantId: string, table: string): any[] | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(tenantId, table));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}
function cacheSet(tenantId: string, table: string, data: any[]) {
  try { sessionStorage.setItem(cacheKey(tenantId, table), JSON.stringify({ data, ts: Date.now() })); } catch { /* sessionStorage indisponível (modo privado, quota) — cache é só otimização, segue sem ele */ }
}
// `useCache=true` (carga inicial): pode servir do cache se fresco.
// `useCache=false` (disparado por evento realtime — algo mudou agora):
// sempre busca fresco, mas ainda atualiza o cache pro próximo hit.
async function cachedFetchAllRowsForTenant(table: string, tenantId: string, useCache: boolean) {
  if (useCache) {
    const cached = cacheGet(tenantId, table);
    if (cached) return { data: cached, error: null as any };
  }
  const res = await fetchAllRowsForTenant(table, tenantId);
  if (!res.error && res.data) cacheSet(tenantId, table, res.data);
  return res;
}

function applyRealtimeUpsert<T extends { id: string }>(
  setter: React.Dispatch<React.SetStateAction<T[]>>,
  payload: any,
  mapRow: (r: any) => T,
  currentTenantId: string | null,
) {
  if (payload.eventType === 'DELETE') {
    const oldId = payload.old?.id;
    if (!oldId) return;
    setter((prev) => prev.filter((item) => item.id !== oldId));
    return;
  }
  const row = payload.new;
  if (!row || !currentTenantId || row.tenant_id !== currentTenantId) return;
  const mapped = mapRow(row);
  setter((prev) => {
    const idx = prev.findIndex((item) => item.id === mapped.id);
    if (idx === -1) return payload.eventType === 'INSERT' ? [mapped, ...prev] : prev;
    const next = prev.slice();
    next[idx] = mapped;
    return next;
  });
}

// A RPC finalizar_venda (varejo) grava type 'Receita'/status 'Recebido'; o app usa 'Receber'/'Pago'.
const normalizeFinanceEntry = (r: any): FinanceEntry => ({
  ...r,
  type: r.type === 'Receita' ? 'Receber' : r.type === 'Despesa' ? 'Pagar' : r.type,
  status: r.status === 'Recebido' ? 'Pago' : r.status,
});

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, authLoading, updatePreferences, activeTenantId, activeFilialId } = useAuth();
  const { formatCurrency } = useLocalization();
  const tenantId = activeTenantId;

  // Tabelas com segregação por filial: quando uma filial está ativa (activeFilialId),
  // a lista exposta pelo contexto já vem filtrada — linhas sem filial_id (legado, ou
  // nunca atribuídas) continuam visíveis em qualquer filial para não sumir dado antigo.
  function filterByFilial<T>(list: T[]): T[] {
    if (!activeFilialId) return list;
    return list.filter((item: any) => !item.filial_id || item.filial_id === activeFilialId);
  }

  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    const saved = user?.preferences?.theme;
    if (saved === 'dark' || saved === 'light') setTheme(saved);
  }, [user?.preferences?.theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    updatePreferences({ theme: next });
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const DEFAULT_SIDEBAR_MODULES = {
    crm: true,
    educacao: true,
    produtividade: true,
    financeiro: true,
    catalogo: true,
    marketing: true,
    engajamento: true,
    rh: true,
    bi: true,
    clinica: true,
  };

  const [sidebarModules, setSidebarModulesState] = useState<Record<string, boolean>>(DEFAULT_SIDEBAR_MODULES);

  const [customLeadFields, setCustomLeadFields] = useState<CustomField[]>(defaultCustomLeadFields);

  const updateCustomLeadFields = (fields: CustomField[]) => {
    setCustomLeadFields(fields);
    syncSetting('customLeadFields', fields);
  };

  const [leadScoreTriggers, setLeadScoreTriggers] = useState<LeadScoreTrigger[]>(defaultLeadScoreTriggers);

  const updateLeadScoreTriggers = (triggers: LeadScoreTrigger[]) => {
    setLeadScoreTriggers(triggers);
    syncSetting('leadScoreTriggers', triggers);
  };

  const [financeEntriesRaw, setFinanceEntries] = useState<FinanceEntry[]>(defaultFinanceEntries as FinanceEntry[]);
  const financeEntries = useMemo(() => filterByFilial(financeEntriesRaw), [financeEntriesRaw, activeFilialId]);

  // Mapa genérico key -> value de app_settings, para telas de configuração
  // que não precisam de um campo dedicado no contexto (ver saveAppSetting).
  const [appSettings, setAppSettings] = useState<Record<string, any>>({});
  // Sinaliza que a busca inicial de app_settings já rodou (mesmo que não
  // exista nenhuma linha ainda) — telas que fazem auto-save de config
  // hidratada usam isso pra saber quando é seguro persistir, em vez de
  // inferir "carregou" só pela presença de uma chave específica (que nunca
  // existiria pra um tenant novo, travando o auto-save pra sempre).
  const [appSettingsLoaded, setAppSettingsLoaded] = useState(false);

  const syncSetting = async (key: string, value: any) => {
    setAppSettings(prev => ({ ...prev, [key]: value }));
    if (!supabase || !tenantId) return;
    try {
      // Escopado por tenant explicitamente — sem isso, duas empresas usando a
      // mesma "key" (ex.: "spy_sidebar_modules") acabariam lendo/sobrescrevendo
      // a configuração uma da outra.
      const { data } = await supabase.from('app_settings').select('id').eq('key', key).eq('tenant_id', tenantId).maybeSingle();
      const { error } = data
        ? await supabase.from('app_settings').update({ value }).eq('id', data.id)
        : await supabase.from('app_settings').insert({ key, value, tenant_id: tenantId });
      if (error) {
        console.error(`Supabase sync setting failed for ${key}:`, error.message);
      }
    } catch (err) {
      console.error(`Supabase sync setting failed for ${key}:`, err);
    }
  };

  const saveAppSetting = async (key: string, value: any) => {
    if (supabase) {
      await syncSetting(key, value);
    }
  };

  const setSidebarModules = async (modules: Record<string, boolean>) => {
    setSidebarModulesState(modules);
    await saveAppSetting('spy_sidebar_modules', modules);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('spy_modules_changed', { detail: modules }));
    }
  };

  const [globalWebhooks, setGlobalWebhooks] = useState<GlobalWebhook[]>(defaultGlobalWebhooks);

  const addGlobalWebhook = (webhook: Omit<GlobalWebhook, 'id'>) => {
    const newVal = [{ ...webhook, id: `w${Math.random().toString(36).substring(2, 9)}` }, ...globalWebhooks];
    setGlobalWebhooks(newVal);
    syncSetting('globalWebhooks', newVal);
  };

  const updateGlobalWebhook = (id: string, updates: Partial<GlobalWebhook>) => {
    const newVal = globalWebhooks.map(w => w.id === id ? { ...w, ...updates } : w);
    setGlobalWebhooks(newVal);
    syncSetting('globalWebhooks', newVal);
  };

  const deleteGlobalWebhook = (id: string) => {
    const newVal = globalWebhooks.filter(w => w.id !== id);
    setGlobalWebhooks(newVal);
    syncSetting('globalWebhooks', newVal);
  };

  const toggleGlobalWebhook = (id: string) => {
    const newVal = globalWebhooks.map(w => w.id === id ? { ...w, active: !w.active } : w);
    setGlobalWebhooks(newVal);
    syncSetting('globalWebhooks', newVal);
  };

  // Tema de cor por tenant: uma das 4 cores de marca do S.P.Y. (ou hex custom),
  // escolhida em Configurações → Empresa → Tema e persistida em tenants.primary_color.
  // Só o token de destaque principal muda por tenant — o resto da paleta (fundo,
  // accent cyan) é identidade fixa do produto, não do cliente.
  const [tenantPrimaryColor, setTenantPrimaryColorState] = useState<string>(DEFAULT_BRAND_COLOR);

  useEffect(() => {
    let cancelled = false;
    async function loadTenantColor() {
      if (!tenantId) {
        setTenantPrimaryColorState(DEFAULT_BRAND_COLOR);
        return;
      }
      const hex = await fetchTenantPrimaryColor(tenantId);
      if (!cancelled && hex) {
        setTenantPrimaryColorState(hex);
        applyThemeColor(hex);
      }
    }
    loadTenantColor();
    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => {
    applyThemeColor(tenantPrimaryColor);
  }, [tenantPrimaryColor]);

  const updateTenantPrimaryColor = async (hex: string) => {
    setTenantPrimaryColorState(hex);
    applyThemeColor(hex);
    if (!tenantId) return { success: false, error: 'Nenhum tenant ativo' };
    const result = await updateTenantTheme(tenantId, hex);
    if (!result.success) toast.error(result.error || 'Erro ao salvar tema.');
    return result;
  };

  const [leadsRaw, setLeads] = useState<Lead[]>(defaultLeads);

  const [tasksRaw, setTasks] = useState<Task[]>(defaultTasks);

  const [contractsRaw, setContracts] = useState<Contract[]>(defaultContracts);
  // A reconciliação de propostas aceitas (mais abaixo) precisa saber se a
  // carga REAL de `contracts` já terminou, não só olhar pra `contracts` —
  // esse array nunca é null/undefined (começa com defaultContracts, não
  // vazio de verdade), então um guard tipo `!contracts` nunca segura nada.
  // Sem essa flag, `proposals` podia terminar de carregar antes de
  // `contracts` (agora que cada tabela aplica de forma independente) e a
  // reconciliação achava "nenhum contrato existente" e recriava um
  // duplicado — rejeitado pela constraint única do banco (erro 409 visto
  // em produção), mas ainda assim uma falha real toda vez que acontecia.
  const [contractsLoaded, setContractsLoaded] = useState(false);
  // Mesmo motivo do contractsLoaded acima, pro lado de `proposals`: sem
  // isso, a reconciliação podia rodar com `proposals` ainda contendo dados
  // do tenant ANTERIOR (troca de tenant, carregamento independente).
  const [proposalsLoaded, setProposalsLoaded] = useState(false);

  const [leadActivities, setLeadActivities] = useState<LeadActivity[]>([]);
  // O banco guarda `lead_id`; a UI (linha do tempo do lead) lê `leadId`. Sem esse mapeamento nenhuma
  // atividade carregada do banco aparecia. Mais recentes primeiro, como no histórico da Kommo.
  const normalizeActivities = (rows: any[]): LeadActivity[] =>
    rows.map((r) => ({ ...r, leadId: r.leadId ?? r.lead_id }))
      .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || ''))) as LeadActivity[];

  const [whatsappWebhookUrl, setWhatsappWebhookUrl] = useState<string>("");

  const [appointmentsRaw, setAppointments] = useState<Appointment[]>(() => getDefaultAppointments() as Appointment[]);

  const leads = useMemo(() => filterByFilial(leadsRaw), [leadsRaw, activeFilialId]);
  // Ticket médio dos leads Fechado do tenant — usado só como ESTIMATIVA de
  // exibição pra leads "Novo" sem valor/produto ainda (ex.: cliente cadastrado
  // que nunca reservou/comprou). Nunca escreve em leads.value nem entra em
  // somas reais de receita/pipeline (getPipelineValue, dashboard summary) —
  // só o card mostra, com marcação visual de "estimado", pra não misturar com
  // valor de venda de verdade. Mesma regra pra qualquer tenant, não hardcoded.
  const avgWonTicket = useMemo(() => {
    const won = leads.filter(l => l.status === "Fechado" && parseCurrencyBR(l.value) > 0);
    if (won.length === 0) return 0;
    return won.reduce((s, l) => s + parseCurrencyBR(l.value), 0) / won.length;
  }, [leads]);
  const tasks = useMemo(() => filterByFilial(tasksRaw), [tasksRaw, activeFilialId]);
  const contracts = useMemo(() => filterByFilial(contractsRaw), [contractsRaw, activeFilialId]);
  const appointments = useMemo(() => filterByFilial(appointmentsRaw), [appointmentsRaw, activeFilialId]);

  const [squads, setSquads] = useState<Squad[]>(defaultSquads);

  const addSquad = async (squad: Omit<Squad, 'id'>) => {
    const newSquad = { ...squad, id: crypto.randomUUID() };
    setSquads(prev => [...prev, newSquad]);
    if (!supabase) {
      toast.success('Squad criado com sucesso!');
      return;
    }
    if (supabase) {
      try {
        const { id, nome, departamento, focoComercial, membros, leader, cor, logo, membrosFuncoes, clientes } = newSquad as any;
        const { error } = await supabase.from('squads').insert({
          id, nome,
          ...(tenantId ? { tenant_id: tenantId } : {}),
          departamento: departamento || 'Geral',
          foco_comercial: focoComercial || '',
          membros: membros || [],
          leader: leader || '',
          cor: cor || '#6366f1',
          logo: logo || '',
          membros_funcoes: membrosFuncoes || {},
          clientes: clientes || [],
        });
        if (error) {
          console.error("Supabase add squad failed:", error.message);
          toast.error(`Erro ao criar squad: ${friendlyError(error)}`);
          setSquads(prev => prev.filter(s => s.id !== newSquad.id));
        } else {
          toast.success('Squad criado com sucesso!');
        }
      } catch (err) {
        console.error("Supabase add squad failed:", err);
        toast.error('Erro ao criar squad.');
        setSquads(prev => prev.filter(s => s.id !== newSquad.id));
      }
    }
  };

  const updateSquad = async (id: string, updates: Partial<Squad>) => {
    setSquads(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    if (supabase) {
      try {
        const payload: any = { ...updates };
        if ('focoComercial' in payload) { payload.foco_comercial = payload.focoComercial; delete payload.focoComercial; }
        if ('membrosFuncoes' in payload) { payload.membros_funcoes = payload.membrosFuncoes; delete payload.membrosFuncoes; }
        await supabase.from('squads').update(payload).eq('id', id);
      } catch (err) {
        console.error("Supabase update squad failed:", err);
      }
    }
  };

  const deleteSquad = async (id: string) => {
    setSquads(prev => prev.filter(s => s.id !== id));
    toast.info('Squad removido.');
    if (supabase) {
      try {
        await supabase.from('squads').delete().eq('id', id);
      } catch (err) {
        console.error("Supabase delete squad failed:", err);
      }
    }
  };

  const updateWhatsappWebhookUrl = (url: string) => {
    setWhatsappWebhookUrl(url);
  };

  // ─── Funis do CRM (crm_funis) ────────────────────────────────────────────
  // Substitui o antigo "axis_funis_config" (localStorage + app_settings sem
  // filtro de tenant) pela tabela dedicada que já existia sem uso.
  const [funis, setFunis] = useState<any[]>([]);

  const rowToFunil = (r: any) => ({
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    etapas: r.etapas || [],
    etapasConfig: r.etapas_config?.length ? r.etapas_config : undefined,
    ativo: r.ativo,
    clientIds: r.client_ids || [],
    sdrEtapaEntrada: r.sdr_etapa_entrada || '',
    sdrEtapaHandoff: r.sdr_etapa_handoff || '',
    sdrScoreMinimo: r.sdr_score_minimo ?? 65,
    sdrDelayResposta: r.sdr_delay_resposta ?? 2,
    sdrMsgBoasVindas: r.sdr_msg_boas_vindas || '',
    sdrCriterioDesqualificacao: r.sdr_criterio_desqualificacao || 'sem_interesse',
  });

  const funilToRow = (f: any) => ({
    ...(f.id ? { id: f.id } : {}),
    ...(f.nome !== undefined ? { nome: f.nome } : {}),
    ...(f.tipo !== undefined ? { tipo: f.tipo } : {}),
    ...(f.etapas !== undefined ? { etapas: f.etapas } : {}),
    ...(f.etapasConfig !== undefined ? { etapas_config: f.etapasConfig || [] } : {}),
    ...(f.ativo !== undefined ? { ativo: f.ativo } : {}),
    ...(f.clientIds !== undefined ? { client_ids: f.clientIds || [] } : {}),
    ...(f.sdrEtapaEntrada !== undefined ? { sdr_etapa_entrada: f.sdrEtapaEntrada } : {}),
    ...(f.sdrEtapaHandoff !== undefined ? { sdr_etapa_handoff: f.sdrEtapaHandoff } : {}),
    ...(f.sdrScoreMinimo !== undefined ? { sdr_score_minimo: f.sdrScoreMinimo } : {}),
    ...(f.sdrDelayResposta !== undefined ? { sdr_delay_resposta: f.sdrDelayResposta } : {}),
    ...(f.sdrMsgBoasVindas !== undefined ? { sdr_msg_boas_vindas: f.sdrMsgBoasVindas } : {}),
    ...(f.sdrCriterioDesqualificacao !== undefined ? { sdr_criterio_desqualificacao: f.sdrCriterioDesqualificacao } : {}),
  });

  const fetchFunis = async () => {
    if (!supabase || !tenantId) return;
    const { data } = await cachedFetchAllRowsForTenant('crm_funis', tenantId, false);
    if (data) setFunis(data.map(rowToFunil));
  };

  // A tabela real `contracts` não tem client/plan/date — desfaz o mapeamento
  // inverso gravado por addContract/updateContract (notes/title/signed_date).
  // Precisa ser usado tanto na carga inicial quanto no listener realtime
  // abaixo; sem isso em algum dos dois, o estado local vira linhas cruas do
  // Postgres (client/plan/date undefined) e qualquer comparação por esses
  // campos (ex.: reconciliação de propostas aceitas) nunca bate.
  const rowToContract = (r: any): Contract => {
    const notesMatch = /^Cliente:\s*(.*?)\s*\|\s*Plano:\s*(.*)$/.exec(r.notes || "");
    const titleParts = typeof r.title === "string" ? r.title.split(" - ") : [];
    const client = notesMatch?.[1] || (titleParts.length > 1 ? titleParts.slice(1).join(" - ") : "Cliente");
    const plan = notesMatch?.[2] || titleParts[0] || "Contrato";
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(r.signed_date || "");
    const date = dateMatch ? `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}` : "";
    const endDateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(r.end_date || "");
    const endDate = endDateMatch ? `${endDateMatch[3]}/${endDateMatch[2]}/${endDateMatch[1]}` : null;
    return {
      id: r.id,
      client,
      plan,
      mrr: r.mrr_value ?? r.value ?? 0,
      // `r.value` é o total do contrato (recorrente + avulso/implantação) —
      // existia gravado no banco desde sempre (ver addContract/updateContract
      // abaixo), mas nunca era lido de volta pro objeto usado na tela, então
      // Contratos/Propostas não tinham como mostrar "total" separado de "MRR".
      totalValue: r.value !== undefined && r.value !== null ? Number(r.value) : undefined,
      status: r.status,
      date,
      endDate,
      description: r.description ?? null,
      progress: 100,
      proposalId: r.proposal_id ?? null,
      cancelledAt: r.cancelled_at ?? null,
    };
  };

  const fetchContracts = async () => {
    if (!supabase || !tenantId) return;
    const { data } = await fetchAllRowsForTenant('contracts', tenantId);
    if (data) setContracts(data.map(rowToContract));
  };

  // Mesmo problema do rowToContract acima, mas pro caso onde a carga inicial
  // já tinha o mapeamento certo (snake_case → camelCase) e só o listener
  // realtime usava fetchTableData genérico — qualquer INSERT/UPDATE/DELETE
  // ao vivo nessas tabelas substituía o estado por linhas cruas do Postgres,
  // apagando os campos mapeados (nome do médico, produtos vinculados, etc.)
  // até o próximo reload da página.
  const mapLeadRow = (r: any) => ({
    ...r,
    // updateLead gravava productIds só em customFields.productIds (bug corrigido
    // acima) — leads editados antes do fix ficaram com a coluna real desatualizada
    // e o vínculo verdadeiro preso em customFields. Prioriza customFields quando
    // não vazio pra esses registros já mostrarem o valor certo sem precisar de
    // migração manual; uma vez editados de novo, a coluna real é reescrita e os
    // dois convergem.
    productIds: (r.customFields?.productIds?.length ? r.customFields.productIds : r.productIds) || [],
    scoreIA: r.scoreIA ?? r.score_ia ?? 50,
    tags: Array.isArray(r.tags) ? r.tags : (r.customFields?.tags || []),
  });

  const mapAppointmentRow = (r: any): Appointment => ({
    id: r.id, time: r.time, patient: r.patient, patientId: r.patient_id ?? null,
    drId: r.dr_id, drName: r.dr_name, status: r.status, type: r.type,
    room: r.room, specialty: r.specialty, phone: r.phone, date: r.date, notes: r.notes,
  });

  const mapSquadRow = (r: any): Squad => ({
    id: r.id, nome: r.nome,
    departamento: r.departamento || 'Geral',
    focoComercial: r.foco_comercial || '',
    membros: r.membros || [],
    leader: r.leader || '',
    cor: r.cor || '#6366f1',
    logo: r.logo || '',
    membrosFuncoes: r.membros_funcoes || {},
    clientes: r.clientes || [],
  });

  const mapProductRow = (p: any) => {
    // `recurrence`/`billingCycle`/`contractMonths`/`hasImplementation` não são
    // colunas reais (só `is_recurring`/`recurring_period`/`implementation_fee`
    // existem na tabela) — o formulário de produto grava esses campos dentro
    // de type_attributes. Sem "desachatar" de volta aqui, eles só existem no
    // objeto local otimista antes do primeiro reload; depois de recarregar do
    // Supabase, `product.contractMonths` sumia (existia só como
    // `product.typeAttributes.contractMonths`), quebrando qualquer leitura que
    // dependesse do campo direto (ex.: cálculo de data de término do contrato).
    const ta = p.typeAttributes || p.type_attributes || {};
    return {
      ...p,
      typeAttributes: ta,
      recurrence: p.recurrence ?? p.is_recurring ?? ta.isRecurring,
      billingCycle: p.billingCycle ?? ta.billingCycle,
      contractMonths: p.contractMonths ?? ta.contractMonths,
      hasImplementation: p.hasImplementation ?? ta.hasImplementation,
      implementationFee: p.implementationFee ?? p.implementation_fee ?? ta.implementationFee,
      hasLoyalty: p.hasLoyalty ?? ta.hasLoyalty,
      loyaltyMonths: p.loyaltyMonths ?? ta.loyaltyMonths,
      earlyTerminationFeePercent: p.earlyTerminationFeePercent ?? ta.earlyTerminationFeePercent,
      attachments: Array.isArray(p.attachments) ? p.attachments : [],
    };
  };

  const fetchLeads = async () => {
    if (!supabase || !tenantId) return;
    const { data } = await fetchAllRowsForTenant('leads', tenantId);
    if (data) setLeads(data.map(mapLeadRow));
  };

  // `reunioes` já passou de 1000 linhas (histórico migrado do to na pista) —
  // usa o mesmo helper paginado do fetchLeads. fetchTableData (select sem
  // .range) cortaria de volta pra 1000 a cada evento realtime.
  const fetchReunioes = async () => {
    if (!supabase || !tenantId) return;
    const { data } = await fetchAllRowsForTenant('reunioes', tenantId);
    if (data) setReunioes(data as Reuniao[]);
  };

  const fetchAppointments = async () => {
    if (!supabase || !tenantId) return;
    const { data } = await fetchAllRowsForTenant('appointments', tenantId);
    if (data) setAppointments(data.map(mapAppointmentRow));
  };

  const fetchSquads = async () => {
    if (!supabase || !tenantId) return;
    const { data } = await cachedFetchAllRowsForTenant('squads', tenantId, false);
    if (data) setSquads(data.map(mapSquadRow));
  };

  const fetchProducts = async () => {
    if (!supabase || !tenantId) return;
    const { data } = await cachedFetchAllRowsForTenant('products', tenantId, false);
    if (data) setProducts(data.map(mapProductRow));
  };

  // Inclui nichos globais (tenant_id null) + os do tenant ativo — não dá pra usar
  // fetchTableData genérico aqui porque ele só filtra por .eq('tenant_id', tenantId).
  const fetchNichos = async () => {
    if (!supabase || !tenantId) return;
    const { data } = await supabase.from('nichos').select('*').or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    if (data) setNichos(data);
  };

  const addFunil = async (f: any) => {
    const newFunil = { ...f, id: f.id || crypto.randomUUID() };
    setFunis(prev => [...prev, newFunil]);
    if (supabase) {
      const { error } = await supabase.from('crm_funis').insert(funilToRow(newFunil));
      if (error) { console.error('[Supabase] insert crm_funis error:', error.message); toast.error(`Erro ao salvar funil: ${friendlyError(error)}`); }
    }
  };

  const updateFunil = async (id: string, updates: any) => {
    setFunis(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    if (supabase) {
      const { error } = await supabase.from('crm_funis').update(funilToRow(updates)).eq('id', id);
      if (error) console.error('[Supabase] update crm_funis error:', error.message);
    }
  };

  const deleteFunil = async (id: string) => {
    setFunis(prev => prev.filter(f => f.id !== id));
    if (supabase) {
      const { error } = await supabase.from('crm_funis').delete().eq('id', id);
      if (error) console.error('[Supabase] delete crm_funis error:', error.message);
    }
  };

  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [marketingAutomations, setMarketingAutomations] = useState<any[]>([]);
  const [marketingContent, setMarketingContent] = useState<any[]>([]);
  const [marketingCampaigns, setMarketingCampaigns] = useState<any[]>([]);
  const [marketingLandingPages, setMarketingLandingPages] = useState<any[]>([]);
  const [marketingForms, setMarketingForms] = useState<any[]>([]);
  const [productsRaw, setProducts] = useState<any[]>(defaultProducts);

  const [proposalsRaw, setProposals] = useState<any[]>([]);
  const [proposalItems, setProposalItems] = useState<any[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [colaboradoresRaw, setColaboradores] = useState<any[]>([]);
  const [squadMetas, setSquadMetas] = useState<any[]>([]);
  const [financialGoals, setFinancialGoals] = useState<any[]>([]);
  const [cargos, setCargos] = useState<any[]>([]);
  const [empresaFiliais, setEmpresaFiliais] = useState<any[]>([]);
  const [nichos, setNichos] = useState<any[]>([]);
  const [financeCategories, setFinanceCategories] = useState<any[]>([]);
  const [financeBudgets, setFinanceBudgets] = useState<any[]>([]);
  const [implementations, setImplementations] = useState<any[]>([]);
  const [financeBankAccounts, setFinanceBankAccounts] = useState<any[]>([]);
  const [financeTransfers, setFinanceTransfers] = useState<any[]>([]);
  const [financeCentrosCusto, setFinanceCentrosCusto] = useState<any[]>([]);
  const [financeAttachments, setFinanceAttachments] = useState<any[]>([]);
  const [financePeriodLocks, setFinancePeriodLocks] = useState<any[]>([]);
  const [financeAuditLog, setFinanceAuditLog] = useState<any[]>([]);
  const [financeCommissionEntries, setFinanceCommissionEntries] = useState<any[]>([]);
  const [scheduledExports, setScheduledExports] = useState<any[]>([]);
  const [educationContent, setEducationContent] = useState<any[]>([]);
  const [clienteBase, setClienteBase] = useState<any[]>([]);
  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([]);
  const [auroraAgents, setAuroraAgents] = useState<AuroraAgent[]>([]);

  const products = useMemo(() => filterByFilial(productsRaw), [productsRaw, activeFilialId]);
  const proposals = useMemo(() => filterByFilial(proposalsRaw), [proposalsRaw, activeFilialId]);
  const colaboradores = useMemo(() => filterByFilial(colaboradoresRaw), [colaboradoresRaw, activeFilialId]);

  // Espelho síncrono de `proposalsRaw` (sem filtro de filial — soma de valor de um
  // lead precisa contar TODAS as propostas dele, independente da visão de filial
  // ativa) — lido dentro de createProposalWithItems/deleteProposal/updateProposal
  // logo depois de chamar proposalCrud.add/del/update, cujo setState é assíncrono
  // e ainda não refletiu no próximo render nesse ponto do código.
  const proposalsRef = React.useRef(proposalsRaw);
  proposalsRef.current = proposalsRaw;

  // Única fonte de verdade pro valor de um lead: soma de `valor` de todas as
  // propostas vinculadas a ele. Substitui os 3 caminhos antigos que ora somavam,
  // ora sobrescreviam `lead.value` de formas inconsistentes (ver comentários em
  // createProposalWithItems/deleteProposal/syncAcceptedProposal) — somar sempre
  // a partir do zero é idempotente por natureza, então roda quantas vezes for
  // preciso sem risco de duplicar ou "esquecer" de subtrair valor.
  const sumProposalsValueForLead = (leadId: string, snapshot: any[]) =>
    snapshot
      .filter((p: any) => p.lead_id === leadId)
      .reduce((sum: number, p: any) => sum + (Number(p.valor) || 0), 0);

  // Persistence & Supabase Synchronization
  //
  // Filtra por tenantId explicitamente aqui, além do que a RLS já garante —
  // contas de parceiro (G-Tech, Nicolas Rocha, Pluppex Holding) têm
  // has_tenant_access() verdadeiro para vários tenants ao mesmo tempo (fase 4
  // de parceiros), então um select('*') sem esse filtro devolve linhas de
  // todos os tenants que a conta pode acessar, não só o tenant ativo na tela.
  // Usada por ~20 handlers de realtime (tasks, proposals, colaboradores etc.)
  // — reaproveita o helper paginado pra não recair no corte de 1000 linhas
  // assim que qualquer evento realtime disparar um refetch dessas tabelas.
  const fetchTableData = async (tableName: string, setter: React.Dispatch<React.SetStateAction<any[]>>) => {
    if (!supabase || !tenantId) return;
    const { data } = await fetchAllRowsForTenant(tableName, tenantId);
    if (data) setter(data);
  };

  useEffect(() => {
    let channel: any = null;

    // Sincronizações em massa (ex.: migração de reservas do to na pista pro
    // Spy) disparam dezenas de eventos UPDATE em `leads`/`reunioes` por
    // minuto. Sem debounce, cada evento refazia um fetch completo da tabela
    // (agora sem limite de 1000 linhas — vários round-trips paginados),
    // deixando o app extremamente pesado enquanto a migração roda. Agrupa
    // rajadas de eventos da mesma tabela num único refetch.
    const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
    const debouncedRefetch = (key: string, fn: () => void, waitMs = 1500) => {
      clearTimeout(debounceTimers[key]);
      debounceTimers[key] = setTimeout(fn, waitMs);
    };

    async function setupRealtime() {
      // Sem tenantId ainda (sessão não resolveu) — não assina; o efeito reroda
      // quando tenantId chega (está nas deps abaixo), e as closures capturadas
      // aqui precisam do valor atual de tenantId, não de um valor congelado.
      if (!supabase || !tenantId) return;

      channel = supabase.channel('global-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
          // Patch incremental em vez de refetch da tabela inteira — ver
          // applyRealtimeUpsert acima. INSERT ainda mostra o toast de aviso.
          if (payload.eventType === 'INSERT' && payload.new && (payload.new as any).tenant_id === tenantId) {
            toast.info(`Novo lead: ${payload.new.name}`, { description: 'Recebido via Realtime' });
          }
          applyRealtimeUpsert(setLeads, payload, (r) => mapLeadRow(r) as Lead, tenantId);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => debouncedRefetch('tasks', () => fetchTableData('tasks', setTasks)))
        // NÃO usa applyRealtimeUpsert aqui de propósito: a reconciliação de
        // propostas aceitas (syncAcceptedProposal, ~2177) depende de
        // `contracts` no array de deps e roda um loop sobre TODAS as
        // propostas aceitas (~3288 em produção) toda vez que essa referência
        // muda. Patch incremental atualiza `contracts` instantaneamente a
        // cada evento — cada UPDATE de contrato disparava a reconciliação de
        // novo, que podia gerar OUTRO update, que disparava outro evento
        // realtime, num loop de feedback quase instantâneo (visto em
        // produção em 2026-09-20: centenas de PATCH simultâneos em
        // /contracts, ERR_INSUFFICIENT_RESOURCES no navegador). O debounce
        // de 1.5s do refetch completo é o que segura esse loop — mantém.
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => debouncedRefetch('contracts', fetchContracts))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_entries' }, (payload) => applyRealtimeUpsert(setFinanceEntries, payload, (r) => normalizeFinanceEntry(r), tenantId))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'squads' }, () => debouncedRefetch('squads', fetchSquads))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => debouncedRefetch('appointments', fetchAppointments))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => debouncedRefetch('products', fetchProducts))
        // Achado real: `clientes` nunca teve realtime — a tela de Base de
        // Clientes nem usava esse `clienteBase` (mantinha uma busca própria,
        // isolada, só carregada uma vez no mount — ver Clientes.tsx). Editar
        // a cidade/setor/CNPJ de um lead vinculado (sincroniza em
        // updateLead acima) só aparecia lá depois de recarregar a página.
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => debouncedRefetch('clientes', () => fetchTableData('clientes', setClienteBase)))
        // Mesmo motivo do handler de `contracts` acima — `proposals` também
        // está no array de deps da reconciliação.
        .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, () => debouncedRefetch('proposals', () => fetchTableData('proposals', setProposals)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_items' }, (payload) => applyRealtimeUpsert(setProposalItems, payload, (r) => r, tenantId))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'turmas' }, () => debouncedRefetch('turmas', () => fetchTableData('turmas', setTurmas)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => debouncedRefetch('students', () => fetchTableData('students', setStudents)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'colaboradores' }, () => debouncedRefetch('colaboradores', () => fetchTableData('colaboradores', setColaboradores)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_metas' }, () => debouncedRefetch('squad_metas', () => fetchTableData('squad_metas', setSquadMetas)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_goals' }, () => debouncedRefetch('financial_goals', () => fetchTableData('financial_goals', setFinancialGoals)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cargos' }, () => debouncedRefetch('cargos', () => fetchTableData('cargos', setCargos)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'certificates' }, () => debouncedRefetch('certificates', () => fetchTableData('certificates', setCertificates)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reunioes' }, (payload) => applyRealtimeUpsert(setReunioes, payload, (r) => r as Reuniao, tenantId))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_funis' }, () => debouncedRefetch('crm_funis', fetchFunis))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'empresa_filiais' }, () => debouncedRefetch('empresa_filiais', () => fetchTableData('empresa_filiais', setEmpresaFiliais)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'nichos' }, () => debouncedRefetch('nichos', fetchNichos))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_categories' }, () => debouncedRefetch('finance_categories', () => fetchTableData('finance_categories', setFinanceCategories)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_budgets' }, () => debouncedRefetch('finance_budgets', () => fetchTableData('finance_budgets', setFinanceBudgets)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'implementations' }, () => debouncedRefetch('implementations', () => fetchTableData('implementations', setImplementations)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_bank_accounts' }, () => debouncedRefetch('finance_bank_accounts', () => fetchTableData('finance_bank_accounts', setFinanceBankAccounts)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_transfers' }, () => debouncedRefetch('finance_transfers', () => fetchTableData('finance_transfers', setFinanceTransfers)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_centros_custo' }, () => debouncedRefetch('finance_centros_custo', () => fetchTableData('finance_centros_custo', setFinanceCentrosCusto)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_attachments' }, () => debouncedRefetch('finance_attachments', () => fetchTableData('finance_attachments', setFinanceAttachments)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_period_locks' }, () => debouncedRefetch('finance_period_locks', () => fetchTableData('finance_period_locks', setFinancePeriodLocks)))
        // Log de auditoria cresce indefinidamente por natureza — mantém o
        // mesmo limite de 500 mais recentes da carga inicial (fetchTableData
        // buscaria a tabela inteira, o que não faz sentido pra um audit log).
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'finance_audit_log' }, () => debouncedRefetch('finance_audit_log', async () => {
          if (!supabase || !tenantId) return;
          const { data } = await supabase.from('finance_audit_log').select('*').eq('tenant_id', tenantId).order('data_hora', { ascending: false }).limit(500);
          if (data) setFinanceAuditLog(data);
        }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_commission_entries' }, () => debouncedRefetch('finance_commission_entries', () => fetchTableData('finance_commission_entries', setFinanceCommissionEntries)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_exports' }, () => debouncedRefetch('scheduled_exports', () => fetchTableData('scheduled_exports', setScheduledExports)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'education_content' }, () => debouncedRefetch('education_content', () => fetchTableData('education_content', setEducationContent)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'indicacoes' }, () => debouncedRefetch('indicacoes', () => fetchTableData('indicacoes', setIndicacoes as any)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'aurora_agents' }, () => debouncedRefetch('aurora_agents', () => fetchTableData('aurora_agents', setAuroraAgents as any)))
        .subscribe();
    }

    setupRealtime();

    return () => {
      Object.values(debounceTimers).forEach(clearTimeout);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [tenantId]);

  // Marca quando a busca AUTORITATIVA de leads (fetchAllRowsForTenant,
  // paginada, sem cap) já terminou — usado pela prévia cacheada abaixo pra
  // nunca sobrescrever dado fresco com uma prévia potencialmente mais velha
  // chegando atrasada.
  const leadsAuthoritativeLoadedRef = React.useRef(false);
  // Mesma ideia, pro load de clientes — usado pela reconciliação de leads
  // ganhos abaixo, pra não rodar antes de `clienteBase` ter carregado de
  // verdade (ver clientesAuthoritativeLoadedRef mais abaixo).
  const clientesAuthoritativeLoadedRef = React.useRef(false);
  // Mesma ideia, pro preview de products (ver GET /api/operative/produtos-list).
  const productsAuthoritativeLoadedRef = React.useRef(false);
  // Mesma ideia, pro preview de reuniões (ver GET /api/crm/reunioes-list).
  const reunioesAuthoritativeLoadedRef = React.useRef(false);
  // Mesma ideia, pro preview de lançamentos financeiros (ver GET /api/finance/entries-list).
  const financeEntriesAuthoritativeLoadedRef = React.useRef(false);
  // Mesma ideia, pro preview de tarefas (ver GET /api/operative/tasks-list).
  const tasksAuthoritativeLoadedRef = React.useRef(false);
  // Mesma ideia, só que compartilhada entre as ~19 tabelas menores cobertas
  // pelo preview genérico (ver GET /api/data/table-preview) — uma chave por
  // nome de tabela em vez de um useRef por tabela.
  const genericPreviewAuthoritativeLoadedRef = React.useRef<Record<string, boolean>>({});

  useEffect(() => {
    // Agora que a carga pagina de verdade (várias requisições sequenciais
    // por tabela em vez de uma só), fica bem mais fácil um master trocar de
    // tenant (switchTenant) ANTES da carga anterior terminar. Sem essa
    // flag, quando a resposta antiga finalmente chegava, ela sobrescrevia
    // com os dados do tenant ERRADO por cima do que já tinha carregado
    // corretamente pro tenant novo — exatamente o sintoma de "não consigo
    // ver só os dados do tenant escolhido". `cancelled` é fechado sobre o
    // tenantId desta execução do efeito; vira true assim que o efeito
    // reroda (tenant mudou) ou desmonta, e barra os setState tardios.
    let cancelled = false;

    // BUG real (reportado: 409 "contracts_proposal_id_unique" toda vez que o
    // master troca pro tenant to na pista): `contractsLoaded` fica `true`
    // depois do PRIMEIRO carregamento (tenant A) e nunca era resetado ao
    // trocar de tenant — então ao entrar no tenant B, a flag já dizia "pronto"
    // mesmo com `contracts` ainda contendo os dados do tenant A (ou vazio),
    // e a reconciliação de propostas aceitas rodava cedo demais, achava
    // "nenhum contrato existente" e tentava recriar um duplicado. Reseta
    // aqui, toda vez que o efeito reroda (ou seja, toda troca de tenant).
    setContractsLoaded(false);
    setProposalsLoaded(false);

    // BUG real (reportado: dados financeiros de OUTRO tenant aparecendo na
    // tela — conta master/parceiro trocando de empresa, ex.: Pluppex →
    // To Na Pista): nada aqui limpava o estado das tabelas de negócio no
    // INÍCIO da troca de tenant — cada `apply()` só sobrescrevia quando a
    // busca daquela tabela específica terminava. Enquanto isso não
    // acontecia (rede lenta, erro, retry), a tela continuava mostrando os
    // dados do tenant ANTERIOR como se fossem do tenant atual — pior ainda
    // se alguma busca falhasse de vez (o dado antigo nunca sumia). Zera
    // tudo aqui, ANTES de disparar qualquer fetch, pra nunca misturar dado
    // de um tenant com a tela de outro, mesmo que a carga nova demore ou
    // falhe parcialmente.
    setLeads([]);
    leadsAuthoritativeLoadedRef.current = false;
    setTasks([]);
    tasksAuthoritativeLoadedRef.current = false;
    setContracts([]);
    setLeadActivities([]);
    setFinanceEntries([]);
    financeEntriesAuthoritativeLoadedRef.current = false;
    setAppointments([]);
    setSquads([]);
    setNotifications([]);
    setMarketingLandingPages([]);
    setProducts([]);
    productsAuthoritativeLoadedRef.current = false;
    setProposals([]);
    setProposalItems([]);
    setTurmas([]);
    setStudents([]);
    setColaboradores([]);
    setSquadMetas([]);
    setCertificates([]);
    setCargos([]);
    setClienteBase([]);
    clientesAuthoritativeLoadedRef.current = false;
    setReunioes([]);
    reunioesAuthoritativeLoadedRef.current = false;
    setFinancialGoals([]);
    setFunis([]);
    setEmpresaFiliais([]);
    setScheduledExports([]);
    setNichos([]);
    nicheModulesRef.current = { tenantId: null, started: false };
    reconciledProposalIdsRef.current.clear();
    reconciledWonLeadIdsRef.current.clear();
    setFinanceCategories([]);
    setFinanceBudgets([]);
    setImplementations([]);
    setFinanceBankAccounts([]);
    setFinanceCentrosCusto([]);
    setFinanceAttachments([]);
    setFinanceTransfers([]);
    setFinancePeriodLocks([]);
    setFinanceAuditLog([]);
    setFinanceCommissionEntries([]);
    setMarketingAutomations([]);
    setMarketingForms([]);
    setMarketingContent([]);
    setMarketingCampaigns([]);
    setEducationContent([]);
    setAuroraAgents([]);
    // `indicacoes` e as configs abaixo (sidebarModules/customLeadFields/
    // leadScoreTriggers/appSettings/globalWebhooks/whatsappWebhookUrl) tinham
    // ficado de fora deste bloco — mesma classe do bug documentado acima,
    // só que descoberta depois numa auditoria de multi-tenancy: sem isso,
    // ficam mostrando o valor do tenant ANTERIOR até a busca nova do tenant
    // atual terminar.
    setIndicacoes([]);
    genericPreviewAuthoritativeLoadedRef.current = {};
    setSidebarModulesState(DEFAULT_SIDEBAR_MODULES);
    setCustomLeadFields(defaultCustomLeadFields);
    setLeadScoreTriggers(defaultLeadScoreTriggers);
    setAppSettings({});
    setAppSettingsLoaded(false);
    setGlobalWebhooks(defaultGlobalWebhooks);
    setWhatsappWebhookUrl("");

    async function loadInitialData() {
      // Aguarda a sessão resolver e o tenant ser conhecido antes de buscar
      // dados — evita disparar a carga como "anon" (RLS devolveria tudo
      // vazio) numa corrida contra o login, já que este efeito não reroda
      // sozinho depois (dependências abaixo cobrem isso quando o tenant muda).
      if (supabase && !authLoading && tenantId) {
        console.log('[DataContext] 🔄 Carregando dados do Supabase (tenant ' + tenantId + ')...');

        // Cada tabela aplica seu próprio setState assim que TERMINA, sem
        // esperar as outras ~43 — antes (Promise.all + destructuring), a
        // tela só recebia QUALQUER dado depois que a tabela mais lenta de
        // todas terminasse, mesmo que leads/produtos/etc. já estivessem
        // prontos há segundos. `leads` fica primeiro na lista de propósito:
        // como o dbLimit é FIFO, é dos primeiros a pegar uma vaga na fila de
        // 10 requisições simultâneas e aparecer na tela.
        const jobs: Array<{ name: string; promise: Promise<any>; apply: (res: any) => void }> = [
          {
            name: 'leads',
            promise: fetchAllRowsForTenant('leads', tenantId),
            // `data` pode vir parcial (algumas páginas obtidas, uma falhou mesmo
            // após retry) — ainda assim é melhor que a lista vazia/anterior.
            apply: (res) => {
              if (res.data) setLeads((res.data as any[]).map(mapLeadRow) as Lead[]);
              leadsAuthoritativeLoadedRef.current = true;
            },
          },
          { name: 'tasks', promise: fetchAllRowsForTenant('tasks', tenantId), apply: (res) => { if (res.data) setTasks(res.data as Task[]); tasksAuthoritativeLoadedRef.current = true; } },
          // Faltava esse hidrate — `contracts` nunca era populado a partir do
          // Supabase na carga inicial (só via evento realtime de escrita na
          // tabela), então a cada refresh da página o estado local começava
          // vazio. Isso fazia a reconciliação de propostas aceitas (Propostas.tsx)
          // achar "nenhum contrato existente" toda vez e recriar um duplicado
          // + disparar notificação de novo contrato a cada entrada na tela.
          { name: 'contracts', promise: fetchAllRowsForTenant('contracts', tenantId), apply: (res) => { if (res.data) setContracts(res.data.map(rowToContract)); setContractsLoaded(true); } },
          { name: 'lead_activities', promise: fetchAllRowsForTenant('lead_activities', tenantId), apply: (res) => { if (res.data) setLeadActivities(normalizeActivities(res.data)); } },
          { name: 'finance_entries', promise: fetchAllRowsForTenant('finance_entries', tenantId), apply: (res) => { if (res.data) setFinanceEntries((res.data as any[]).map(normalizeFinanceEntry)); financeEntriesAuthoritativeLoadedRef.current = true; } },
          { name: 'appointments', promise: fetchAllRowsForTenant('appointments', tenantId), apply: (res) => { if (res.data) setAppointments(res.data.map(mapAppointmentRow)); } },
          { name: 'squads', promise: cachedFetchAllRowsForTenant('squads', tenantId, true), apply: (res) => { if (res.data) setSquads(res.data.map(mapSquadRow)); } },
          { name: 'notifications', promise: fetchAllRowsForTenant('notifications', tenantId), apply: (res) => { if (res.data) setNotifications(res.data as Notification[]); } },
          { name: 'marketing_landing_pages', promise: fetchAllRowsForTenant('marketing_landing_pages', tenantId), apply: (res) => { if (res.data) setMarketingLandingPages(res.data); } },
          {
            name: 'app_settings',
            // Inclui linhas globais (tenant_id IS NULL) + as do tenant ativo, explicitamente —
            // sem esse filtro, contas master/parceiro (has_tenant_access verdadeiro pra vários
            // tenants) recebiam via RLS configurações de TODOS os tenants acessíveis misturadas
            // num único mapa por key (ver merge abaixo), fazendo "configs grudarem" ao trocar de empresa.
            promise: dbLimit(() => supabase.from('app_settings').select('*').or(`tenant_id.eq.${tenantId},tenant_id.is.null`)),
            apply: (res) => {
              if (!res.data) return;
              const settingsMap: Record<string, any> = {};
              // Processa as linhas globais (tenant_id null) primeiro, depois as do tenant ativo —
              // assim, se a mesma key existir nos dois níveis, o valor específico do tenant sempre
              // vence o default global, em vez de depender da ordem que o Postgres devolveu.
              const orderedSettings = [...res.data].sort((a: any, b: any) =>
                (a.tenant_id === null ? 0 : 1) - (b.tenant_id === null ? 0 : 1)
              );
              orderedSettings.forEach((setting: any) => {
                settingsMap[setting.key] = setting.value;
                switch (setting.key) {
                  case 'globalWebhooks': setGlobalWebhooks(setting.value); break;
                  case 'customLeadFields': setCustomLeadFields(setting.value); break;
                  case 'leadScoreTriggers': setLeadScoreTriggers(setting.value); break;
                }
              });
              // Lê a chave nova; se o tenant ainda não tem nada salvo nela (rename
              // Axis → S.P.Y.), cai pra chave antiga em vez de perder a preferência
              // de sidebar já salva.
              const sidebarModules = settingsMap['spy_sidebar_modules'] ?? settingsMap['axis_sidebar_modules'];
              if (sidebarModules !== undefined) setSidebarModulesState(sidebarModules);
              setAppSettings(settingsMap);
              setAppSettingsLoaded(true);
            },
          },
          { name: 'products', promise: cachedFetchAllRowsForTenant('products', tenantId, true), apply: (res) => { if (res.data) setProducts(res.data.map(mapProductRow)); productsAuthoritativeLoadedRef.current = true; } },
          { name: 'proposals', promise: fetchAllRowsForTenant('proposals', tenantId), apply: (res) => { if (res.data) setProposals(res.data); setProposalsLoaded(true); } },
          { name: 'proposal_items', promise: fetchAllRowsForTenant('proposal_items', tenantId), apply: (res) => { if (res.data) setProposalItems(res.data); } },
          // Carga inicial (não lazy de nicho): a página CRM > Implementações não
          // chama ensureNicheModulesLoaded, e sem a lista carregada ela mostra
          // clientes que já têm implementação como "aguardando início".
          { name: 'implementations', promise: fetchAllRowsForTenant('implementations', tenantId), apply: (res) => { if (res.data) setImplementations(res.data); } },
          // turmas/students: só usados nas páginas de Educação — movidos pro
          // lazy load de nicho (ensureNicheModulesLoaded) abaixo.
          {
            name: 'colaboradores',
            promise: fetchAllRowsForTenant('colaboradores', tenantId),
            apply: (res) => {
              if (res.error) console.error('[Supabase] colaboradores load error:', res.error.message);
              else if (res.data) setColaboradores(res.data);
            },
          },
          // squad_metas: nenhuma página do app lê esse campo hoje — não vale
          // buscar toda carga. certificates/financial_goals/scheduled_exports:
          // só usados em Educação/Indicadores — lazy load de nicho abaixo.
          { name: 'cargos', promise: fetchAllRowsForTenant('cargos', tenantId), apply: (res) => { if (res.data) setCargos(res.data); } },
          { name: 'clientes', promise: fetchAllRowsForTenant('clientes', tenantId), apply: (res) => { if (res.data) setClienteBase(res.data); clientesAuthoritativeLoadedRef.current = true; } },
          { name: 'reunioes', promise: fetchAllRowsForTenant('reunioes', tenantId), apply: (res) => { if (res.data) setReunioes(res.data as Reuniao[]); reunioesAuthoritativeLoadedRef.current = true; } },
          { name: 'crm_funis', promise: cachedFetchAllRowsForTenant('crm_funis', tenantId, true), apply: (res) => { if (res.data) setFunis(res.data.map(rowToFunil)); } },
          { name: 'empresa_filiais', promise: fetchAllRowsForTenant('empresa_filiais', tenantId), apply: (res) => { if (res.data) setEmpresaFiliais(res.data); } },
          {
            name: 'nichos',
            // Nichos globais (tenant_id null) + os do tenant ativo, mesmo motivo do app_settings acima.
            promise: dbLimit(() => supabase.from('nichos').select('*').or(`tenant_id.eq.${tenantId},tenant_id.is.null`)),
            apply: (res) => { if (res.data) setNichos(res.data); },
          },
          { name: 'finance_commission_entries', promise: fetchAllRowsForTenant('finance_commission_entries', tenantId), apply: (res) => { if (res.data) setFinanceCommissionEntries(res.data); } },
          { name: 'indicacoes', promise: fetchAllRowsForTenant('indicacoes', tenantId), apply: (res) => { if (res.data) setIndicacoes(res.data as Indicacao[]); } },
        ];

        // Prévia rápida de `leads` via GET /api/crm/leads-list (cache Redis,
        // TTL curto) — pinta o Pipeline/Kanban antes da busca paginada real
        // (job 'leads' acima) terminar. Roda em paralelo, nunca substitui a
        // busca real, e é descartada se a autoritativa já tiver chegado
        // primeiro (mais comum em tenants pequenos, onde a busca real já é
        // rápida) ou se o tenant tiver mudado nesse meio tempo.
        apiFetch(`/api/crm/leads-list?tenantId=${encodeURIComponent(tenantId)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (cancelled || leadsAuthoritativeLoadedRef.current || !json?.data) return;
            setLeads((json.data as any[]).map(mapLeadRow) as Lead[]);
          })
          .catch(() => { /* silencioso — a busca autoritativa (job 'leads' acima) segue normalmente */ });

        // Mesma ideia pro catálogo de produtos — cobre o primeiro carregamento
        // de uma aba nova, antes do sessionStorage (cachedFetchAllRowsForTenant)
        // ter qualquer coisa pra servir.
        apiFetch(`/api/operative/produtos-list?tenantId=${encodeURIComponent(tenantId)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (cancelled || productsAuthoritativeLoadedRef.current || !json?.data) return;
            setProducts((json.data as any[]).map(mapProductRow));
          })
          .catch(() => { /* silencioso — a busca autoritativa (job 'products' acima) segue normalmente */ });

        // Mesma ideia pra agenda de reuniões — hoje é a maior tabela do maior
        // tenant (ver comentário no endpoint sobre as colunas excluídas).
        apiFetch(`/api/crm/reunioes-list?tenantId=${encodeURIComponent(tenantId)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (cancelled || reunioesAuthoritativeLoadedRef.current || !json?.data) return;
            setReunioes(json.data as Reuniao[]);
          })
          .catch(() => { /* silencioso — a busca autoritativa (job 'reunioes' acima) segue normalmente */ });

        // Mesma ideia pros lançamentos financeiros — alimenta várias telas
        // de listagem do Financeiro de uma vez só (ver comentário no endpoint).
        apiFetch(`/api/finance/entries-list?tenantId=${encodeURIComponent(tenantId)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (cancelled || financeEntriesAuthoritativeLoadedRef.current || !json?.data) return;
            setFinanceEntries((json.data as any[]).map(normalizeFinanceEntry));
          })
          .catch(() => { /* silencioso — a busca autoritativa (job 'finance_entries' acima) segue normalmente */ });

        // Mesma ideia pras tarefas — WorkloadBento.tsx precisa do array
        // completo pra desenhar o board por responsável/status.
        apiFetch(`/api/operative/tasks-list?tenantId=${encodeURIComponent(tenantId)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (cancelled || tasksAuthoritativeLoadedRef.current || !json?.data) return;
            setTasks(json.data as Task[]);
          })
          .catch(() => { /* silencioso — a busca autoritativa (job 'tasks' acima) segue normalmente */ });

        // Preview genérico (GET /api/data/table-preview) pras ~19 tabelas
        // menores restantes — um fetch por tabela, mesma lógica de
        // "supersede se a busca real ainda não chegou" de leads/produtos/
        // reuniões/lançamentos/tarefas acima, só que sem endpoint dedicado
        // por tabela. `contracts`/`proposals` ficam de fora de propósito
        // (ver comentário no endpoint).
        const genericPreviewTables: [string, (data: any[]) => void][] = [
          ['notifications', setNotifications],
          ['proposal_items', setProposalItems],
          ['lead_activities', (d: any[]) => setLeadActivities(normalizeActivities(d))],
          ['colaboradores', setColaboradores],
          ['students', setStudents],
          ['turmas', setTurmas],
          ['finance_bank_accounts', setFinanceBankAccounts],
          ['finance_transfers', setFinanceTransfers],
          ['finance_attachments', setFinanceAttachments],
          ['finance_commission_entries', setFinanceCommissionEntries],
          ['marketing_automations', setMarketingAutomations],
          ['marketing_forms', setMarketingForms],
          ['marketing_content', setMarketingContent],
          ['marketing_campaigns', setMarketingCampaigns],
          ['education_content', setEducationContent],
          ['aurora_agents', setAuroraAgents],
          ['indicacoes', setIndicacoes],
          ['scheduled_exports', setScheduledExports],
          ['finance_period_locks', setFinancePeriodLocks],
        ];
        genericPreviewTables.forEach(([table, setter]) => {
          apiFetch(`/api/data/table-preview?table=${table}&tenantId=${encodeURIComponent(tenantId)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
              if (cancelled || genericPreviewAuthoritativeLoadedRef.current[table] || !json?.data) return;
              setter(json.data);
            })
            .catch(() => { /* silencioso — a busca autoritativa (job correspondente acima) segue normalmente */ });
        });

        // Falha total (retries esgotados, ex.: timeout do banco sob carga)
        // resolvia silenciosamente com `data: []` — a tela ficava mostrando
        // "vazio" (ou o estado anterior, dependendo do timing) sem NENHUM
        // aviso, o que já foi confundido com "dado do tenant errado
        // aparecendo" quando na real era só uma falha de carregamento não
        // sinalizada. Acumula os nomes que falharam de verdade e avisa uma
        // vez só (não um toast por tabela) depois que tudo assentar.
        const failedTables: string[] = [];
        jobs.forEach(({ name, promise, apply }) => {
          promise
            .then((res: any) => {
              // Tenant mudou (ou o componente desmontou) enquanto essa tabela
              // ainda estava em voo — descarta a resposta atrasada em vez de
              // aplicar dados do tenant errado por cima do certo.
              if (cancelled) return;
              if (res?.error) failedTables.push(name);
              apply(res);
              // Usado pelo preview genérico abaixo (GET /api/data/table-preview)
              // pra nunca sobrescrever dado fresco com uma prévia atrasada —
              // marca qualquer tabela como "chegou de verdade", sem custo pras
              // que não têm preview (a chave fica só sem uso).
              genericPreviewAuthoritativeLoadedRef.current[name] = true;
            })
            .catch((err: any) => {
              if (!cancelled) failedTables.push(name);
              console.error(`[DataContext] ❌ Falha ao carregar "${name}":`, err);
            });
        });

        Promise.allSettled(jobs.map((j) => j.promise)).then(() => {
          if (cancelled) return;
          console.log('[DataContext] ✅ Dados carregados do Supabase.');
          if (failedTables.length > 0) {
            toast.error(`Alguns dados não carregaram (${failedTables.join(', ')}) — atualize a página pra tentar de novo.`, { duration: 8000 });
          }
        });
      }
    }
    loadInitialData();
    return () => { cancelled = true; };
  }, [authLoading, tenantId]);

  // Financeiro (bancos/transferências/centros de custo/anexos/categorias/
  // auditoria), Marketing (automações/formulários/conteúdo) e Educação/Aurora
  // (conteúdo, agentes) não entram na carga inicial — são módulos de nicho,
  // não usados por toda empresa que usa o Spy (verificado: nenhum consumidor
  // fora das próprias telas desses módulos). Cada tela chama isso no mount;
  // a ref evita disparar de novo se a tela remontar ou várias telas do mesmo
  // módulo chamarem em sequência.
  const nicheModulesRef = React.useRef<{ tenantId: string | null; started: boolean }>({ tenantId: null, started: false });
  const ensureNicheModulesLoaded = React.useCallback(() => {
    if (!supabase || !tenantId) return;
    if (nicheModulesRef.current.started && nicheModulesRef.current.tenantId === tenantId) return;
    nicheModulesRef.current = { tenantId, started: true };

    const nicheJobs: Array<{ name: string; promise: Promise<any>; apply: (res: any) => void }> = [
      { name: 'finance_bank_accounts', promise: fetchAllRowsForTenant('finance_bank_accounts', tenantId), apply: (res) => { if (res.data) setFinanceBankAccounts(res.data); } },
      { name: 'finance_transfers', promise: fetchAllRowsForTenant('finance_transfers', tenantId), apply: (res) => { if (res.data) setFinanceTransfers(res.data); } },
      { name: 'finance_period_locks', promise: fetchAllRowsForTenant('finance_period_locks', tenantId), apply: (res) => { if (res.data) setFinancePeriodLocks(res.data); } },
      {
        name: 'finance_audit_log',
        promise: dbLimit(() => supabase.from('finance_audit_log').select('*').eq('tenant_id', tenantId).order('data_hora', { ascending: false }).limit(500)),
        apply: (res) => { if (res.data) setFinanceAuditLog(res.data); },
      },
      { name: 'finance_centros_custo', promise: fetchAllRowsForTenant('finance_centros_custo', tenantId), apply: (res) => { if (res.data) setFinanceCentrosCusto(res.data); } },
      { name: 'finance_attachments', promise: fetchAllRowsForTenant('finance_attachments', tenantId), apply: (res) => { if (res.data) setFinanceAttachments(res.data); } },
      { name: 'finance_categories', promise: fetchAllRowsForTenant('finance_categories', tenantId), apply: (res) => { if (res.data) setFinanceCategories(res.data); } },
      { name: 'finance_budgets', promise: fetchAllRowsForTenant('finance_budgets', tenantId), apply: (res) => { if (res.data) setFinanceBudgets(res.data); } },
      { name: 'marketing_automations', promise: fetchAllRowsForTenant('marketing_automations', tenantId), apply: (res) => { if (res.data) setMarketingAutomations(res.data); } },
      { name: 'marketing_forms', promise: fetchAllRowsForTenant('marketing_forms', tenantId), apply: (res) => { if (res.data) setMarketingForms(res.data); } },
      { name: 'marketing_content', promise: fetchAllRowsForTenant('marketing_content', tenantId, (q: any) => q.is('deleted_at', null)), apply: (res) => { if (res.data) setMarketingContent(res.data); } },
      { name: 'marketing_campaigns', promise: fetchAllRowsForTenant('marketing_campaigns', tenantId), apply: (res) => { if (res.data) setMarketingCampaigns(res.data); } },
      { name: 'education_content', promise: fetchAllRowsForTenant('education_content', tenantId), apply: (res) => { if (res.data) setEducationContent(res.data); } },
      { name: 'aurora_agents', promise: fetchAllRowsForTenant('aurora_agents', tenantId), apply: (res) => { if (res.data) setAuroraAgents(res.data as AuroraAgent[]); } },
      { name: 'turmas', promise: fetchAllRowsForTenant('turmas', tenantId), apply: (res) => { if (res.data) setTurmas(res.data); } },
      { name: 'students', promise: fetchAllRowsForTenant('students', tenantId), apply: (res) => { if (res.data) setStudents(res.data); } },
      { name: 'certificates', promise: fetchAllRowsForTenant('certificates', tenantId), apply: (res) => { if (res.data) setCertificates(res.data); } },
      { name: 'squad_metas', promise: fetchAllRowsForTenant('squad_metas', tenantId), apply: (res) => { if (res.data) setSquadMetas(res.data); } },
      { name: 'financial_goals', promise: fetchAllRowsForTenant('financial_goals', tenantId), apply: (res) => { if (res.data) setFinancialGoals(res.data); } },
      { name: 'scheduled_exports', promise: fetchAllRowsForTenant('scheduled_exports', tenantId), apply: (res) => { if (res.data) setScheduledExports(res.data); } },
    ];

    nicheJobs.forEach(({ name, promise, apply }) => {
      promise
        .then((res: any) => {
          if (nicheModulesRef.current.tenantId !== tenantId) return;
          apply(res);
        })
        .catch((err: any) => console.error(`[DataContext] ❌ Falha ao carregar módulo de nicho "${name}":`, err));
    });
  }, [tenantId]);

  const notifiedRemindersRef = React.useRef<Record<string, boolean>>({});

  useEffect(() => {
    const checkTeleconsultations = () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      appointments.forEach(apt => {
        if (apt.type === 'Teleconsulta' && apt.date === todayStr && apt.status !== 'Finalizado') {
          const [hour, minute] = apt.time.split(':').map(Number);
          const aptTime = new Date();
          aptTime.setHours(hour, minute, 0, 0);

          const diffMs = aptTime.getTime() - now.getTime();
          const diffMins = Math.floor(diffMs / 60000);

          if (diffMins >= 28 && diffMins <= 32 && !notifiedRemindersRef.current[apt.id]) {
            notifiedRemindersRef.current[apt.id] = true;
            const message = `Olá ${apt.patient}, aqui é da S.P.Y. Telemedicina. Lembramos que sua teleconsulta com ${apt.drName} inicia em 30 minutos. Prepare sua conexão!`;
            console.log(`[WHATSAPP AUTOMÁTICO] Enviando para ${apt.phone || 'N/A'}: ${message}`);

            toast.info(`Lembrete WhatsApp enviado para ${apt.patient}`, {
              description: "Teleconsulta em 30 minutos.",
              icon: "📱"
            });

            addNotification({
              title: "Lembrete de Teleconsulta Enviado",
              description: `Mensagem de WhatsApp disparada para ${apt.patient} (${apt.phone}).`,
              type: "info",
            });
          }
        }
      });
    };

    const interval = setInterval(checkTeleconsultations, 30000);
    return () => clearInterval(interval);
  }, [appointments]);

  // Automated background checker for cold leads (Score IA < 40)
  const handledColdLeadsRef = React.useRef<Record<string, boolean>>({});
  const leadsRef = React.useRef(leads);
  leadsRef.current = leads;
  const tasksRef = React.useRef(tasks);
  tasksRef.current = tasks;
  const leadScoreTriggersRef = React.useRef(leadScoreTriggers);
  leadScoreTriggersRef.current = leadScoreTriggers;

  useEffect(() => {
    const checkColdLeads = () => {
      leadsRef.current.forEach(lead => {
        if (lead.id && !handledColdLeadsRef.current[lead.id] && lead.scoreIA !== undefined && lead.scoreIA < 40) {
          const nurturingTaskTitle = `Nutrição de Reengajamento: ${lead.name}`;
          // Sem coluna `tags` na tabela `tasks` — dedupe por lead_id + prefixo do
          // título (ambos colunas reais), em vez da antiga tag "reengajamento".
          const hasNurturingTask = tasksRef.current.some(t =>
            t.lead_id === lead.id && t.title === nurturingTaskTitle
          );

          if (!hasNurturingTask) {
            handledColdLeadsRef.current[lead.id] = true;
            const tomorrow9am = new Date();
            tomorrow9am.setDate(tomorrow9am.getDate() + 1);
            tomorrow9am.setHours(9, 0, 0, 0);
            const newTask: Omit<Task, 'id'> = {
              title: nurturingTaskTitle,
              description: "Tipo: E-mail — automação de reengajamento (lead frio, Score IA < 40).",
              lead_id: lead.id,
              due_date: tomorrow9am.toISOString(),
              status: "Em Aberto",
              priority: "Média",
            };

            addTask(newTask);

            addNotification({
              title: "Reengajamento Iniciado",
              description: `Automação detectou o lead frio '${lead.name}' (Score IA: ${lead.scoreIA}) e gerou uma tarefa de Nutrição.`,
              type: "info",
            }, true);
          } else {
            handledColdLeadsRef.current[lead.id] = true;
          }
        }
      });
    };

    const timer = setTimeout(checkColdLeads, 10000);
    const interval = setInterval(checkColdLeads, 60000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  // Motor real dos Gatilhos de Lead Score IA (Configurações > CRM > Gatilhos IA):
  const movedByTriggerRef = React.useRef<Record<string, true>>({});
  useEffect(() => {
    const checkLeadScoreTriggers = () => {
      if (leadScoreTriggersRef.current.length === 0) return;
      leadsRef.current.forEach(lead => {
        if (lead.pipelineId !== 'sdr' || lead.scoreIA === undefined) return;
        for (const trigger of leadScoreTriggersRef.current) {
          const matches = trigger.condition === 'greater'
            ? lead.scoreIA >= trigger.scoreThreshold
            : lead.scoreIA <= trigger.scoreThreshold;
          if (!matches) continue;
          if (lead.stageId === trigger.targetStageId) continue;
          const key = `${lead.id}-${trigger.id}-${trigger.targetStageId}`;
          if (movedByTriggerRef.current[key]) continue;
          movedByTriggerRef.current[key] = true;
          moveLead(lead.id, trigger.targetStageId, 0);
          addNotification({
            title: "Gatilho de Lead Score Aplicado",
            description: `${lead.name} (Score IA: ${lead.scoreIA}) foi movido automaticamente para a etapa configurada no gatilho.`,
            type: "info",
          }, true);
          break;
        }
      });
    };
    const timer = setTimeout(checkLeadScoreTriggers, 12000);
    const interval = setInterval(checkLeadScoreTriggers, 60000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  // Automated background checker for squad goals (90% threshold)
  const notifiedSquadsRef = React.useRef<Record<string, boolean>>({});
  useEffect(() => {
    squads.forEach(sq => {
      if (!sq.meta || !sq.faturamentoAlcancado) return;
      const percentage = (sq.faturamentoAlcancado / sq.meta) * 100;
      if (percentage >= 90 && !notifiedSquadsRef.current[sq.id]) {
        addNotification({
          title: "Meta Próxima (90%+)",
          description: `O ${sq.nome} atingiu 90% da meta mensal! Faturamento atual: ${formatCurrency(sq.faturamentoAlcancado)}`,
          type: "success",
        }, true);
        toast.success(`Alerta de Meta: ${sq.nome} atingiu 90%!`, {
          description: "Excelente desempenho do time.",
          duration: 10000
        });
        notifiedSquadsRef.current[sq.id] = true;
      } else if (percentage < 90) {
        notifiedSquadsRef.current[sq.id] = false;
      }
    });
  }, [squads]);

  const simulateNewLeadAssignment = () => {
    const uniqueSellers = Array.from(new Set(leads.map(l => l.seller).filter(Boolean)));
    if (leads.length === 0 || uniqueSellers.length === 0) return;
    const randomSeller = uniqueSellers[Math.floor(Math.random() * uniqueSellers.length)];
    const randomLead = leads[Math.floor(Math.random() * leads.length)];
    updateLead(randomLead.id, { seller: randomSeller });
  };

  const simulateOverdueTask = () => {
    if (leads.length === 0) return;
    const randomLead = leads[Math.floor(Math.random() * leads.length)];
    const uniqueSellers = Array.from(new Set(leads.map(l => l.seller).filter(Boolean)));
    const randomSellerName = uniqueSellers.length > 0
      ? uniqueSellers[Math.floor(Math.random() * uniqueSellers.length)]
      : "";
    const randomSellerColaborador = (colaboradores as any[]).find(c => c.nome === randomSellerName);

    const today9am = new Date();
    today9am.setHours(9, 0, 0, 0);

    const newTask: Omit<Task, 'id'> = {
      title: "Retornar contato com lead",
      description: "Tipo: Call",
      lead_id: randomLead.id,
      due_date: today9am.toISOString(),
      status: "Atrasado",
      priority: "Alta",
      assigned_to: randomSellerColaborador?.user_id,
    };
    addTask(newTask);
  };

  const triggerScoreRecalculation = async (leadId: string, currentLeadsList?: Lead[], currentActivitiesList?: LeadActivity[]) => {
    const listLeads = currentLeadsList || leads;
    const listActivities = currentActivitiesList || leadActivities;
    const targetLead = listLeads.find(l => l.id === leadId);
    if (!targetLead) return;

    try {
      const response = await apiFetch("/api/leads/calculate-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: targetLead, activities: listActivities })
      });
      if (response.ok) {
        const result = await response.json();
        setLeads(prev => prev.map(l => l.id === leadId ? {
          ...l,
          scoreIA: result.scoreIA,
          temperature: result.temperature,
          iaSummary: result.iaSummary,
          stageId: (l.pipelineId === 'sdr' && (!l.stageId || l.stageId === 's1' || l.stageId === 's2')) ? 's_qual' : l.stageId
        } : l));

        if (supabase) {
          const updatedStage = (targetLead.pipelineId === 'sdr' && (!targetLead.stageId || targetLead.stageId === 's1' || targetLead.stageId === 's2')) ? 's_qual' : targetLead.stageId;
          await supabase.from('leads').update({
            scoreIA: result.scoreIA,
            temperature: result.temperature,
            iaSummary: result.iaSummary,
            stageId: updatedStage
          }).eq('id', leadId);
        }
      }
    } catch (err) {
      console.error("Failed to run AI score calculation service:", err);
    }
  };

  const addLead = async (lead: Omit<Lead, 'id'>) => {
    const effectiveTenantId = tenantId || user?.tenantId || "default";
    const newId = crypto.randomUUID();
    const newLead = { ...lead, id: newId, scoreIA: 50 };
    setLeads(prev => [newLead, ...prev]);
    toast.success('Novo lead adicionado com sucesso!');
    addNotification({
      title: "Novo Lead",
      description: `${lead.name} da empresa ${lead.company || "lead"} foi adicionado.`,
      link_url: `/app/crm/pipeline?leadId=${newId}`,
      type: "success"
    });

    if (supabase) {
      try {
        const rawValue = parseCurrencyBR(lead.value);

        const dbPayload = {
          id: newId,
          name: lead.name,
          company: lead.company ?? '',
          email: lead.email ?? '',
          phone: lead.phone ?? '',
          cnpj: lead.cnpj ?? '',
          seller: lead.seller ?? '',
          title: lead.title ?? '',
          date: lead.date ?? '',
          status: lead.status ?? 'Novo',
          priority: lead.priority ?? 'Média',
          temperature: lead.temperature ?? undefined,
          value: rawValue,
          stageId: lead.stageId ?? '1',
          pipelineId: lead.pipelineId ?? 'comercial',
          scoreIA: 50,
          tenant_id: effectiveTenantId,
          filial_id: activeFilialId,
          tenantName: lead.tenantName ?? '',
          lead_interesse_cliente: lead.lead_interesse_cliente ?? '',
          customFields: lead.customFields ?? {},
          clientId: lead.clientId ?? '',
          clientName: lead.clientName ?? '',
          source: lead.source ?? '',
          productIds: lead.productIds ?? [],
        };

        const { error } = await supabase.from('leads').insert(dbPayload);
        if (error) {
          console.error("Supabase add lead failed:", error.message, error.details);
        }
      } catch (err) {
        console.error("Supabase add lead failed:", err);
      }
    }
    setTimeout(() => { triggerScoreRecalculation(newLead.id, [newLead]); }, 400);
  };

  // Trava contra corrida assíncrona: `!lead.clientId` (usado tanto aqui quanto
  // na reconciliação logo após updateLead) depende do estado local `leads`,
  // que fica defasado enquanto o `updateLead(lead.id, { clientId })` de
  // createClientFromWonLead ainda está em voo (é assíncrono) — sem essa trava
  // por id, a reconciliação podia rodar de novo nesse meio-tempo e criar um
  // cliente duplicado pro mesmo lead.
  const reconciledWonLeadIdsRef = React.useRef<Set<string>>(new Set());

  // Ao ganhar um lead (status -> "Fechado"), cria (ou vincula, se já existir por
  // e-mail/CNPJ) o registro correspondente na Base de Clientes, evitando duplicar
  // clientes quando mais de um lead da mesma empresa fecha negócio.
  const createClientFromWonLead = async (lead: Lead) => {
    // BUG real (visto em produção: lead "Fabiano Fagundes" — To Na Pista
    // Boliche — sumido da Base de Clientes): `lead.clientId` confiava cego
    // que o registro apontado ainda existia. Excluir um cliente pela tela
    // de Clientes (handleDeleteCliente) removia só a linha em `clientes`,
    // sem limpar `clientId` nos leads que apontavam pra ela — o lead ficava
    // "vinculado" pra sempre a um cliente que não existe mais, e nem a
    // reconciliação nem uma nova tentativa manual recriava o registro.
    // Confirma que o clientId aponta pra um cliente que existe de verdade
    // antes de aceitar como "já vinculado".
    if (!supabase || !tenantId) return;
    if (lead.clientId && clienteBase.some((c: any) => c.id === lead.clientId)) return;
    try {
      const documento = lead.cnpj || null;
      let existing: any = null;
      if (documento) {
        const { data } = await supabase.from('clientes').select('id, name').eq('tenant_id', tenantId).eq('documento', documento).maybeSingle();
        existing = data;
      } else if (lead.email) {
        const { data } = await supabase.from('clientes').select('id, name').eq('tenant_id', tenantId).eq('email', lead.email).maybeSingle();
        existing = data;
      }

      let clientId = existing?.id;
      let clientName = existing?.name;

      if (!existing) {
        // BUG real: cliente novo (criado automaticamente ao ganhar um lead)
        // sempre nascia com "São Paulo/SP" e telefone/e-mail fictícios
        // ((11) 99999-9999, contato@empresa.com) quando o lead não tinha
        // esses dados — parecia dado real, mas era invenção, e o DDD 11
        // reforçava a aparência de "tudo vira São Paulo" mesmo pra tenants
        // de outras cidades (ex.: Palmas/TO). Sem endereço estruturado do
        // tenant ainda (empresa_dados só tem um campo de endereço livre),
        // o certo é deixar em branco em vez de inventar — nulo é honesto,
        // "São Paulo" fixo é um dado errado.
        const newClient = {
          name: lead.company || lead.name,
          industry: "Tecnologia",
          city: null,
          state: null,
          phone: lead.phone || null,
          email: lead.email || null,
          documento,
          status: "Ativo",
          tenant_id: tenantId,
        };
        const { data: inserted, error } = await supabase.from('clientes').insert(newClient).select().maybeSingle();
        if (error) { console.error("Erro ao criar cliente a partir do lead ganho:", error.message); return; }
        if (inserted) {
          clientId = inserted.id;
          clientName = inserted.name;
          setClienteBase(prev => [inserted, ...prev]);
        }
      }

      if (clientId) {
        updateLead(lead.id, { clientId, clientName });
        addNotification({
          title: "Novo Cliente na Base",
          description: `${clientName} foi adicionado à Base de Clientes a partir do lead ganho "${lead.name}".`,
          link_url: "/app/crm/clientes",
          type: "success",
        });
        toast.success(existing ? "Lead vinculado a um cliente já existente na base." : "Cliente adicionado à Base de Clientes!");
      }
    } catch (err) {
      console.error("Falha ao converter lead ganho em cliente:", err);
    }
  };

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    let hasStatusOrStageChange = false;
    let becameWon = false;
    // Capturado dentro do updater para repassar pro recálculo de score abaixo —
    // sem isso, o setTimeout usava a variável `leads` do closure desta render
    // (o estado ANTES deste update), e reescrevia o stageId antigo no Supabase
    // ~400ms depois, revertendo silenciosamente qualquer mudança de coluna do
    // Kanban (ex: soltar em "Ganho" e o lead voltar pra "Contrato" ao recarregar).
    let mergedLead: Lead | undefined;
    setLeads(prev => {
      const target = prev.find(l => l.id === id);
      if (target && (
        (updates.status !== undefined && updates.status !== target.status) ||
        (updates.stageId !== undefined && updates.stageId !== target.stageId)
      )) {
        hasStatusOrStageChange = true;
      }

      return prev.map(l => {
        if (l.id === id) {
          const updatedLead = { ...l, ...updates };
          mergedLead = updatedLead;
          if (l.pipelineId === 'sdr' && updates.pipelineId === 'comercial') {
            const tempLabel = updatedLead.temperature ? updatedLead.temperature.toUpperCase() : 'Não avaliada';
            toast.success('Lead Qualificado!', {
              description: `${updatedLead.name} foi movido para o Comercial com temperatura ${tempLabel}.`
            });
            addNotification({
              title: "Lead Qualificado (SDR -> Comercial)",
              description: `O lead ${updatedLead.name} foi qualificado pela Master AI com temperatura ${tempLabel} e enviado ao pipeline comercial.`,
              link_url: "/app/pipeline",
              type: "success",
            });
          }
          if (updates.status === 'Fechado' && l.status !== 'Fechado') {
            becameWon = true;
            addNotification({
              title: "Automação: E-mail de Boas Vindas",
              description: `Boas vindas enviadas para ${updatedLead.name} por ter se tornado cliente!`,
              type: "success",
            });
            toast.success("E-mail de Boas Vindas enviado!");
          }
          return updatedLead;
        }
        return l;
      });
    });

    if (supabase) {
      try {
        // Strip unknown / non-DB fields and fix value type
        const { customTags, probability, ...safeUpdates } = updates as any;
        if (safeUpdates.value !== undefined) {
          safeUpdates.value = parseCurrencyBR(safeUpdates.value);
        }
        // `productIds` é coluna real em `leads` (mesma usada por addLead) — gravar
        // dentro de customFields.productIds (como antes) nunca chegava na coluna
        // de fato lida por mapLeadRow/addLead, deixando o vínculo de produto do
        // lead sempre desatualizado após a primeira edição via updateLead.
        if (safeUpdates.scoreIA !== undefined && safeUpdates.score_ia === undefined) {
          safeUpdates.score_ia = safeUpdates.scoreIA;
        }
        const { error } = await supabase.from('leads').update(safeUpdates).eq('id', id);
        if (error) {
          console.error("Supabase update lead failed:", error.message);
          toast.error(`Erro ao salvar lead: ${friendlyError(error)}`);
        }
      } catch (err) {
        console.error("Supabase update lead failed:", err);
        toast.error("Erro ao salvar lead.");
      }
    }
    if (hasStatusOrStageChange) {
      setTimeout(() => { triggerScoreRecalculation(id, mergedLead ? [mergedLead] : undefined); }, 400);
    }
    // Achado real: editar Cidade/Setor/CNPJ no Detalhe do Lead nunca refletia
    // na Base de Clientes — são registros DIFERENTES (leads.customFields/
    // leads.cnpj x clientes.city/industry/documento), sem sincronia nenhuma
    // entre os dois. Um cliente criado automaticamente ao ganhar um lead
    // nasce com city=null de propósito (nunca inventa "São Paulo", ver
    // createClientFromWonLead acima) — Localização/Setor/Documento só
    // existiam na Base de Clientes se alguém preenchesse manualmente por lá.
    // Sempre que o lead tem um valor real e já está vinculado a um cliente,
    // propaga pros campos correspondentes de `clientes` também — só nessa
    // direção (lead -> cliente) e só com valor não-vazio, nunca apaga um dado
    // que o cliente já tinha só porque o campo do lead ficou em branco.
    if (supabase) {
      const clienteAlvo = mergedLead?.clientId;
      if (clienteAlvo) {
        const novaCidade = (updates.customFields as any)?.cidade;
        const novoSetor = (updates.customFields as any)?.setor;
        const novoDocumento = updates.cnpj;
        const patch: Record<string, string> = {};
        if (typeof novaCidade === "string" && novaCidade.trim()) patch.city = novaCidade.trim();
        // `clientes.industry` na tela de Clientes (NovoClienteModal.tsx) é um
        // select fixo de 8 setores genéricos — o CNAE fiscal real do CNPJ
        // (ex.: "Desenvolvimento de programas de computador sob encomenda")
        // é bem mais específico que isso. Grava o valor real mesmo assim
        // (nunca força numa das 8 categorias — isso seria inventar uma
        // classificação que ninguém confirmou); o select desse modal só não
        // vai mostrar nenhuma opção pré-marcada quando o texto não bater com
        // uma delas, o dado em si fica correto na tabela/detalhe do cliente.
        if (typeof novoSetor === "string" && novoSetor.trim()) patch.industry = novoSetor.trim();
        if (typeof novoDocumento === "string" && novoDocumento.trim()) patch.documento = novoDocumento.trim();

        if (Object.keys(patch).length > 0) {
          supabase.from("clientes").update(patch).eq("id", clienteAlvo).then(({ error }) => {
            if (!error) {
              setClienteBase(prev => prev.map((c: any) => c.id === clienteAlvo ? { ...c, ...patch } : c));
            }
          });
        }
      }
    }
    // BUG real (visto em produção: "Wemerson Carvalho"/"Guruseg" duplicados
    // na Base de Clientes, criados ~200ms um do outro): esta chamada nunca
    // marcava `reconciledWonLeadIdsRef` antes de disparar
    // createClientFromWonLead — só a reconciliação em lote (useEffect logo
    // abaixo) marcava. Quando um lead vira "Fechado" ao vivo, o setLeads
    // otimista aqui MUDA `leads`, o que dispara de novo aquele useEffect
    // (dependência [leads, clienteBase]) antes desta chamada terminar (é
    // assíncrona) — o efeito via o lead como "ainda pendente" (guard não
    // marcada) e processava o MESMO lead de novo, em paralelo: duas
    // consultas "cliente já existe" corriam antes de qualquer INSERT
    // commitar, nenhuma via a outra, as duas inseriam. Marcar a guard AQUI
    // (síncrono, antes do primeiro await) fecha a corrida pros dois lados.
    if (becameWon && mergedLead && !reconciledWonLeadIdsRef.current.has(mergedLead.id)) {
      reconciledWonLeadIdsRef.current.add(mergedLead.id);
      createClientFromWonLead(mergedLead);
    }
  };

  // Reconciliação: leads "Fechado" sem cliente vinculado ainda (relatado pela
  // equipe: "Base de Clientes" mostrando menos clientes do que leads
  // realmente ganhos). createClientFromWonLead só disparava de dentro do
  // updateLead() do próprio front, na transição AO VIVO de status — um lead
  // que vira Fechado por qualquer outro caminho (SQL direto, migração,
  // reconciliação de proposta) nunca ganhava retroativamente um registro em
  // `clientes`. Roda globalmente assim que os leads do tenant carregam
  // (mesmo padrão de reconciliação de proposals/contracts acima), sequencial
  // (não Promise.all) pra evitar duas leads da mesma empresa disparando
  // consultas de "cliente já existe" concorrentes e criando dois clientes
  // pro mesmo documento/e-mail. `!l.clientId` sozinho não basta — um
  // clientId "órfão" (cliente excluído depois, sem limpar a referência no
  // lead) precisa ser tratado como não vinculado também; só dá pra saber
  // isso depois que `clienteBase` carregou de verdade.
  useEffect(() => {
    if (!leadsAuthoritativeLoadedRef.current || !clientesAuthoritativeLoadedRef.current) return;
    const pending = (leads || []).filter(
      (l: any) =>
        l.status === 'Fechado' &&
        (!l.clientId || !clienteBase.some((c: any) => c.id === l.clientId)) &&
        !reconciledWonLeadIdsRef.current.has(l.id)
    );
    if (pending.length === 0) return;
    (async () => {
      for (const l of pending) {
        if (reconciledWonLeadIdsRef.current.has(l.id)) continue;
        reconciledWonLeadIdsRef.current.add(l.id);
        await createClientFromWonLead(l);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, clienteBase]);

  const deleteLead = async (id: string) => {
    const removed = leads.find(l => l.id === id);
    setLeads(prev => prev.filter(l => l.id !== id));
    if (supabase) {
      const { data, error } = await supabase.from('leads').delete().eq('id', id).select('id');
      if (error || !data || data.length === 0) {
        console.error("Supabase delete lead failed:", error?.message ?? 'nenhuma linha afetada');
        toast.error(error ? `Erro ao remover lead: ${friendlyError(error)}` : 'Não foi possível remover o lead — sem permissão ou registro não encontrado.');
        if (removed) setLeads(prev => prev.some(l => l.id === id) ? prev : [removed, ...prev]);
        return;
      }
    }
    toast.info('Lead removido.');
  };

  const moveLead = async (leadId: string, destStageId: string, index: number) => {
    setLeads(prev => {
      const lead = prev.find(l => l.id === leadId);
      if (!lead) return prev;
      const otherLeads = prev.filter(l => l.id !== leadId);
      const updatedLead = { ...lead, stageId: destStageId };

      if (destStageId === 's_qual' && lead.pipelineId === 'sdr') {
        addNotification({
          title: "Análise Master AI Concluída",
          description: `O lead ${lead.name} foi movido para Qualificação IA. A análise estrutural da Master AI foi finalizada.`,
          type: "success",
          link_url: `/app/pipeline?search=${encodeURIComponent(lead.name)}`
        });
      }
      return [...otherLeads, updatedLead];
    });

    if (supabase) {
      try {
        await supabase.from('leads').update({ stageId: destStageId }).eq('id', leadId);
      } catch (err) {
        console.error("Supabase move lead failed:", err);
      }
    }
    setTimeout(() => { triggerScoreRecalculation(leadId); }, 400);
  };

  // Colunas reais da tabela `tasks` — qualquer outro campo (ex.: convidados/
  // calendarLink, usados só pra feedback imediato de Google Calendar na UI)
  // é decorativo no estado local e NUNCA deve ir pro insert/update do Supabase,
  // ou o Postgres rejeita a linha inteira com "column does not exist".
  const TASK_COLUMNS = [
    'id', 'tenant_id', 'lead_id', 'assigned_to', 'creator_id', 'title',
    'description', 'status', 'priority', 'due_date', 'completed_at',
    'created_at', 'updated_at', 'deleted_at', 'filial_id',
  ] as const;

  const pickTaskColumns = (obj: Record<string, any>) => {
    const picked: Record<string, any> = {};
    for (const key of TASK_COLUMNS) {
      if (key in obj) picked[key] = obj[key];
    }
    return picked;
  };

  const addTask = async (task: Omit<Task, 'id'>) => {
    const newTask: Task = { ...task, id: crypto.randomUUID() };
    if (tenantId) newTask.tenant_id = tenantId;
    if (user?.id) newTask.creator_id = user.id;
    newTask.filial_id = activeFilialId ?? null;
    setTasks(prev => [newTask, ...prev]);
    addNotification({
      title: "Nova Tarefa",
      description: `Agendada: ${task.title}`,
      link_url: task.lead_id ? `/app/crm/pipeline?leadId=${task.lead_id}` : `/app/tarefas`,
      type: "info"
    }, true);

    if (supabase) {
      const { error } = await supabase.from('tasks').insert(pickTaskColumns(newTask));
      if (error) {
        console.error("[Supabase] insert tasks error:", error.message, error.details);
        setTasks(prev => prev.filter(t => t.id !== newTask.id));
        toast.error(`Erro ao salvar tarefa: ${friendlyError(error)}`);
        return;
      }
    }
    toast.success('Tarefa agendada!');
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    const previousTask = tasks.find(t => t.id === id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    if (supabase) {
      const { error } = await supabase.from('tasks').update(pickTaskColumns(updates)).eq('id', id);
      if (error) {
        console.error("[Supabase] update tasks error:", error.message, error.details);
        if (previousTask) setTasks(prev => prev.map(t => t.id === id ? previousTask : t));
        toast.error(`Erro ao atualizar tarefa: ${friendlyError(error)}`);
      }
    }
  };

  const deleteTask = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    toast.info('Tarefa removida.');
    if (supabase) {
      try {
        await supabase.from('tasks').delete().eq('id', id);
      } catch (err) {
        console.error("Supabase delete task failed:", err);
      }
    }
  };

  const addContract = async (contract: Omit<Contract, 'id'>, options: { silent?: boolean } = {}) => {
    const newContract: any = { ...contract, id: crypto.randomUUID() };
    if (tenantId) newContract.tenant_id = tenantId;
    newContract.filial_id = activeFilialId;
    setContracts(prev => [...prev, newContract]);
    // `silent` existe pra reconciliação em background (Propostas.tsx sincronizando
    // propostas antigas já aceitas) — sem isso, um contrato criado por reconciliação
    // disparava toast + notificação de "Novo Contrato" toda vez que a tela recarregava.
    if (!options.silent) {
      toast.success('Contrato registrado!');
      addNotification({
        title: "Novo Contrato",
        description: `Cliente: ${contract.client}`,
        type: "success"
      });
    }

    if (supabase) {
      // `contracts` real não tem client/plan/mrr/date/progress — mapeia pros campos
      // reais (title/value/mrr_value/signed_date), guardando cliente/plano em `notes`
      // já que não existem colunas próprias pra eles. Sem esse remapeamento o insert
      // falhava em 100% dos casos (0 linhas na tabela em produção).
      const mrrNumber = parseCurrencyBR(contract.mrr);
      // `value` guarda o total do contrato (recorrente + avulso/implantação);
      // `mrr_value` é só a parcela recorrente — são a mesma coisa apenas
      // quando o contrato não tem componente avulso (totalValue omitido).
      const totalValue = contract.totalValue !== undefined ? parseCurrencyBR(contract.totalValue) : mrrNumber;
      const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(contract.date);
      const signedDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : (/^\d{4}-\d{2}-\d{2}$/.test(contract.date) ? contract.date : null);
      const endDateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(contract.endDate || "");
      const endDate = endDateMatch ? `${endDateMatch[3]}-${endDateMatch[2]}-${endDateMatch[1]}` : (/^\d{4}-\d{2}-\d{2}$/.test(contract.endDate || "") ? contract.endDate : null);
      const { error } = await supabase.from('contracts').insert({
        id: newContract.id,
        ...(tenantId ? { tenant_id: tenantId } : {}),
        filial_id: newContract.filial_id,
        title: `${contract.plan} - ${contract.client}`,
        value: totalValue,
        mrr_value: mrrNumber,
        status: contract.status,
        proposal_id: contract.proposalId ?? null,
        ...(signedDate ? { signed_date: signedDate } : {}),
        end_date: endDate,
        description: contract.description ?? null,
        notes: `Cliente: ${contract.client} | Plano: ${contract.plan}`,
      });
      if (error) {
        console.error("Supabase add contract failed:", error.message);
        toast.error(`Erro ao registrar contrato: ${friendlyError(error)}`);
      }
    }
  };

  const updateContract = async (id: string, updates: Partial<Contract>, options: { silent?: boolean } = {}) => {
    // Cancelamento carimba `cancelled_at` automaticamente (uma vez só) — é o
    // dado que a projeção de receita (getRevenueProjection) usa pra medir
    // churn real ao longo do tempo; sem isso não dá pra saber quando um
    // contrato realmente parou de contar como recorrente.
    const current = contracts.find(c => c.id === id);
    const willCancelNow = updates.status === 'Cancelado' && current?.status !== 'Cancelado' && !current?.cancelledAt;
    if (willCancelNow) updates = { ...updates, cancelledAt: new Date().toISOString() };

    setContracts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    if (!current) return;
    const merged = { ...current, ...updates };
    if (!options.silent) toast.success('Contrato atualizado!');
    if (supabase) {
      // Mesmo remapeamento do addContract — a tabela real não tem client/plan/mrr/date.
      const mrrNumber = parseCurrencyBR(merged.mrr);
      const totalValue = merged.totalValue !== undefined ? parseCurrencyBR(merged.totalValue) : mrrNumber;
      const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(merged.date || "");
      const signedDate = dateMatch
        ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
        : (/^\d{4}-\d{2}-\d{2}$/.test(merged.date || "") ? merged.date : null);
      const endDateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(merged.endDate || "");
      const endDate = endDateMatch
        ? `${endDateMatch[3]}-${endDateMatch[2]}-${endDateMatch[1]}`
        : (/^\d{4}-\d{2}-\d{2}$/.test(merged.endDate || "") ? merged.endDate : null);
      const { error } = await supabase.from('contracts').update({
        title: `${merged.plan} - ${merged.client}`,
        value: totalValue,
        mrr_value: mrrNumber,
        status: merged.status,
        proposal_id: merged.proposalId ?? null,
        ...(willCancelNow ? { cancelled_at: updates.cancelledAt } : {}),
        ...(signedDate ? { signed_date: signedDate } : {}),
        end_date: endDate,
        description: merged.description ?? null,
        notes: `Cliente: ${merged.client} | Plano: ${merged.plan}`,
      }).eq('id', id);
      if (error) {
        console.error("Supabase update contract failed:", error.message);
        toast.error(`Erro ao atualizar contrato: ${friendlyError(error)}`);
      }
    }
  };

  const deleteContract = async (id: string) => {
    setContracts(prev => prev.filter(c => c.id !== id));
    toast.info('Contrato removido.');
    if (supabase) {
      try {
        await supabase.from('contracts').delete().eq('id', id);
      } catch (err) {
        console.error("Supabase delete contract failed:", err);
      }
    }
  };

  // Antes só existia em memória (setNotifications, sem nenhuma escrita no
  // Supabase) — sumia a cada refresh e "marcar como lida" nunca persistia de
  // verdade. Agora grava direto na tabela (colunas reais: title, description,
  // type, link_url, is_read, created_at — sem `category`, que nunca existiu
  // como coluna). Otimista: atualiza o estado local primeiro, igual todo
  // outro mutator deste arquivo, e só loga se a escrita no Supabase falhar.
  const addNotification = (notification: Omit<Notification, 'id' | 'is_read' | 'created_at'>, push?: boolean) => {
    const newNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      is_read: false,
      created_at: new Date().toISOString(),
    };
    if (push) {
      sendPushNotification(newNotification.title, newNotification.description);
    }
    setNotifications(prev => [newNotification, ...prev]);
    if (supabase && tenantId) {
      supabase.from('notifications').insert({
        id: newNotification.id,
        tenant_id: tenantId,
        title: newNotification.title,
        description: newNotification.description,
        type: newNotification.type,
        link_url: newNotification.link_url || null,
        is_read: false,
      }).then(({ error }: { error: any }) => {
        if (error) console.error('[Notifications] Falha ao persistir:', error.message);
      });
    }
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    if (supabase) {
      supabase.from('notifications').update({ is_read: true }).eq('id', id).then(({ error }: { error: any }) => {
        if (error) console.error('[Notifications] Falha ao marcar como lida:', error.message);
      });
    }
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    if (supabase && tenantId) {
      supabase.from('notifications').update({ is_read: true }).eq('tenant_id', tenantId).eq('is_read', false)
        .then(({ error }: { error: any }) => {
          if (error) console.error('[Notifications] Falha ao marcar todas como lidas:', error.message);
        });
    }
  };

  const addLeadActivity = async (leadId: string, type: 'Ligação' | 'E-mail' | 'Reunião' | 'Outro', title: string, description: string, seller: string, customDate?: string, files?: { name: string; size: string; }[]) => {
    const newActivity: LeadActivity = {
      id: crypto.randomUUID(),
      leadId,
      type,
      title,
      description,
      date: customDate || `Hoje, ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      seller,
      files
    };
    const updatedActivities = [newActivity, ...leadActivities];
    setLeadActivities(updatedActivities);

    if (supabase) {
      // `lead_activities` não tem coluna `files` nem `leadId` (camelCase) — a FK real é
      // `lead_id`, NOT NULL. Sem esse remapeamento o insert falhava em 100% dos casos.
      const { error } = await supabase.from('lead_activities').insert({
        id: newActivity.id,
        lead_id: leadId,
        type: newActivity.type,
        title: newActivity.title,
        description: newActivity.description,
        date: newActivity.date,
        seller: newActivity.seller,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });
      if (error) {
        console.error("Supabase add lead activity failed:", error.message);
        toast.error(`Erro ao registrar atividade: ${friendlyError(error)}`);
      }
    }
    triggerScoreRecalculation(leadId, leads, updatedActivities);
  };

  const getSmartInsight = async (context: string, data: any): Promise<string> => {
    try {
      const response = await apiFetch("/api/ai/generic-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, data })
      });
      if (!response.ok) throw new Error("IA offline");
      const result = await response.json();
      return result.insight || "Análise concluída com sucesso.";
    } catch (err) {
      return "Erro na conexão com o motor neural da Master IA.";
    }
  };

  // `billingCycle` do formulário de produto é em português pra exibição
  // (Mensal/Trimestral/Semestral/Anual) — a coluna real `recurring_period`
  // precisa de um valor estável independente de idioma.
  const billingCycleToRecurringPeriod = (cycle: any): string => {
    switch (String(cycle || "").toLowerCase()) {
      case "trimestral": return "quarterly";
      case "semestral": return "semiannual";
      case "anual": return "yearly";
      default: return "monthly";
    }
  };

  const createCrudHelper = (tableName: string, stateSetter: React.Dispatch<React.SetStateAction<any[]>>, filialAware = false) => {
    return {
      add: async (item: any) => {
        // tenant_id sempre vem do tenant ATIVO (não do que o caller calculou) — garante
        // que criar um registro enquanto um master estiver "dentro" de outro cliente
        // grava nesse cliente, não no tenant de login do master. filial_id só é
        // carimbado em tabelas que de fato têm essa coluna (filialAware).
        const stamped = {
          ...item,
          id: item.id || crypto.randomUUID(),
          ...(tenantId ? { tenant_id: tenantId } : {}),
          ...(filialAware && activeFilialId && item.filial_id === undefined ? { filial_id: activeFilialId } : {}),
        };
        stateSetter(prev => [stamped, ...prev]);
        if (supabase) {
          let payloadToDb = stamped;
          if (tableName === 'products') {
            const allowed = [
              'id', 'sku', 'name', 'category', 'type', 'price', 'cost', 'margin', 'commission',
              'active', 'stockMin', 'stockMax', 'currentStock', 'dimensions', 'weight', 'material',
              'description', 'provider', 'isBestSeller', 'tags', 'tenant_id', 'currency',
              'type_attributes', 'attachments', 'is_recurring', 'recurring_period', 'implementation_fee'
            ];
            const pCopy: any = { ...stamped };
            if (pCopy.typeAttributes && !pCopy.type_attributes) pCopy.type_attributes = pCopy.typeAttributes;
            // `is_recurring`/`recurring_period`/`implementation_fee` são colunas reais
            // (não só jsonb) — sem gravar aqui também, o MRR (que lê a coluna, não o
            // type_attributes) nunca sabe se o produto é recorrente ou avulso.
            const ta = pCopy.type_attributes || {};
            if (ta.isRecurring !== undefined || pCopy.is_recurring !== undefined) {
              pCopy.is_recurring = pCopy.is_recurring ?? !!ta.isRecurring;
              pCopy.recurring_period = pCopy.is_recurring ? (pCopy.recurring_period ?? billingCycleToRecurringPeriod(ta.billingCycle)) : null;
            }
            if (ta.implementationFee !== undefined || pCopy.implementation_fee !== undefined) {
              pCopy.implementation_fee = Number(pCopy.implementation_fee ?? ta.implementationFee) || 0;
            }
            payloadToDb = Object.fromEntries(Object.entries(pCopy).filter(([k]) => allowed.includes(k)));
            if (payloadToDb.price !== undefined) payloadToDb.price = Number(payloadToDb.price) || 0;
            if (payloadToDb.cost !== undefined) payloadToDb.cost = Number(payloadToDb.cost) || 0;
            if (payloadToDb.commission !== undefined) payloadToDb.commission = Number(payloadToDb.commission) || 0;
          }
          const { error } = await supabase.from(tableName).insert(payloadToDb);
          if (error) {
            console.error(`[Supabase] insert ${tableName} error:`, error.message, error.details);
            toast.error(`Erro ao salvar: ${friendlyError(error)}`);
            stateSetter(prev => prev.filter(x => x.id !== stamped.id));
          }
        }
        return stamped;
      },
      update: async (id: string, updates: any) => {
        // Atualiza estado local imediatamente (optimistic update)
        let previousItem: any;
        stateSetter(prev => { previousItem = prev.find(item => item.id === id); return prev.map(item => item.id === id ? { ...item, ...updates } : item); });
        if (supabase) {
          // Remove campos que podem causar conflito com triggers do banco
          let safeUpdates = { ...updates };
          delete safeUpdates.updated_at;
          if (tableName === 'products') {
            const allowed = [
              'id', 'sku', 'name', 'category', 'type', 'price', 'cost', 'margin', 'commission',
              'active', 'stockMin', 'stockMax', 'currentStock', 'dimensions', 'weight', 'material',
              'description', 'provider', 'isBestSeller', 'tags', 'tenant_id', 'currency',
              'type_attributes', 'attachments', 'is_recurring', 'recurring_period', 'implementation_fee'
            ];
            if (safeUpdates.typeAttributes && !safeUpdates.type_attributes) {
              safeUpdates.type_attributes = safeUpdates.typeAttributes;
            }
            const ta = safeUpdates.type_attributes || {};
            if (ta.isRecurring !== undefined || safeUpdates.is_recurring !== undefined) {
              safeUpdates.is_recurring = safeUpdates.is_recurring ?? !!ta.isRecurring;
              safeUpdates.recurring_period = safeUpdates.is_recurring ? (safeUpdates.recurring_period ?? billingCycleToRecurringPeriod(ta.billingCycle)) : null;
            }
            if (ta.implementationFee !== undefined || safeUpdates.implementation_fee !== undefined) {
              safeUpdates.implementation_fee = Number(safeUpdates.implementation_fee ?? ta.implementationFee) || 0;
            }
            safeUpdates = Object.fromEntries(Object.entries(safeUpdates).filter(([k]) => allowed.includes(k)));
            if (safeUpdates.price !== undefined) safeUpdates.price = Number(safeUpdates.price) || 0;
            if (safeUpdates.cost !== undefined) safeUpdates.cost = Number(safeUpdates.cost) || 0;
            if (safeUpdates.commission !== undefined) safeUpdates.commission = Number(safeUpdates.commission) || 0;
          }
          const { error } = await supabase.from(tableName).update(safeUpdates).eq('id', id);
          if (error) {
            console.error(`[Supabase] update ${tableName} error:`, error.message);
            if (error.message?.includes('updated_at')) {
              console.warn(`[Supabase] Trigger issue on ${tableName} — execute a migration 20260827_fix_colaboradores_updated_at.sql no Supabase SQL Editor`);
            }
            toast.error(`Erro ao salvar alterações: ${friendlyError(error)}`);
            if (previousItem) stateSetter(prev => prev.map(item => item.id === id ? previousItem : item));
          }
        }
      },
      del: async (id: string) => {
        const removed = await new Promise<any>(resolve => {
          stateSetter(prev => {
            resolve(prev.find(item => item.id === id));
            return prev.filter(item => item.id !== id);
          });
        });
        if (!supabase) return true;
        // .select() força o Postgrest a devolver as linhas afetadas — sem isso, um DELETE
        // filtrado a 0 linhas pela RLS (tenant errado, sem permissão) retorna error: null
        // e pareceria bem-sucedido mesmo sem apagar nada no banco.
        const { data, error } = await supabase.from(tableName).delete().eq('id', id).select('id');
        if (error) {
          console.error(`[Supabase] delete ${tableName} error:`, error.message);
          toast.error(`Erro ao remover: ${friendlyError(error)}`);
          if (removed) stateSetter(prev => [removed, ...prev]);
          return false;
        }
        if (!data || data.length === 0) {
          console.error(`[Supabase] delete ${tableName}: nenhuma linha afetada (id=${id})`);
          toast.error('Não foi possível remover — sem permissão ou registro não encontrado.');
          if (removed) stateSetter(prev => [removed, ...prev]);
          return false;
        }
        return true;
      }
    };
  };

  const productCrud = createCrudHelper('products', setProducts, true);
  const proposalCrud = createCrudHelper('proposals', setProposals, true);
  const proposalItemCrud = createCrudHelper('proposal_items', setProposalItems);

  // Cria uma proposta e seus itens (produtos do catálogo ou avulsos) numa única chamada —
  // usado tanto pela tela de Propostas quanto pelo botão "Vender" no catálogo de Produtos.
  const createProposalWithItems = async (payload: {
    titulo: string;
    cliente: string;
    valor: number;
    validade?: string | null;
    status?: string;
    vendedor: string;
    leadId?: string | null;
    tipo?: 'itens' | 'texto' | 'arquivo';
    conteudoTexto?: string | null;
    linkPdf?: string | null;
    itens?: Array<{ productId?: string | null; descricao: string; quantidade: number; precoUnitario: number; billingType?: 'recurring' | 'one_time'; contractMonths?: number | null; frequency?: string | null }>;
  }) => {
    const proposalId = crypto.randomUUID();
    // Traz o decisor do lead vinculado (Lead Details -> Contato/Decisor +
    // Cargo do Decisor) pra dentro da proposta — copiado agora, não um
    // vínculo ao vivo: a proposta é um documento emitido, então se o decisor
    // mudar depois no lead, a proposta já gerada mantém o que valia quando
    // foi criada.
    const linkedLeadForDecisor = payload.leadId ? (leads || []).find((l: any) => l.id === payload.leadId) : null;
    const stampedProposal = await proposalCrud.add({
      id: proposalId,
      titulo: payload.titulo,
      cliente: payload.cliente,
      valor: payload.valor,
      validade: payload.validade || null,
      status: payload.status || 'Enviada',
      vendedor: payload.vendedor,
      lead_id: payload.leadId || null,
      tipo: payload.tipo || 'itens',
      conteudo_texto: payload.conteudoTexto || null,
      link_pdf: payload.linkPdf || null,
      decisor_nome: linkedLeadForDecisor?.name || null,
      decisor_cargo: linkedLeadForDecisor?.customFields?.currentRole || null,
    });
    for (const item of payload.itens || []) {
      await proposalItemCrud.add({
        id: crypto.randomUUID(),
        proposal_id: proposalId,
        product_id: item.productId || null,
        product_name: item.descricao,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario,
        // Sem isso, todo item cai no default 'recurring' da coluna e uma taxa
        // de implantação/setup entra somando no MRR igual a uma mensalidade.
        billing_type: item.billingType || 'recurring',
        // Prazo REAL fechado nesta venda (pode ser diferente da duração padrão
        // do catálogo do produto) — usado depois pra calcular a data de
        // término do contrato com o prazo que foi de fato negociado.
        contract_months: item.contractMonths ?? null,
        // Frequência do ciclo (mensal/trimestral/semestral/anual/personalizado)
        // — distinta de contract_months (vigência total). Ver saleCalculator.ts.
        frequency: item.frequency ?? null,
      });
    }
    // Sincroniza valor/produtos de volta no lead vinculado — sem isso, o card
    // do Kanban e o cabeçalho do lead ficam com valor zerado mesmo com uma
    // proposta real (e aceita) vinculada, porque eles leem `leads.value` /
    // `leads.productIds` diretamente, não a tabela `proposals`. `value` é
    // recalculado como a SOMA de todas as propostas do lead (não só esta) —
    // gravar só `payload.valor` aqui sobrescrevia (em vez de somar) o valor de
    // qualquer proposta anterior já vinculada ao mesmo lead.
    if (payload.leadId) {
      const productIds = (payload.itens || [])
        .map(item => item.productId)
        .filter((id): id is string => !!id);
      const currentLead = (leads || []).find((l: any) => l.id === payload.leadId);
      const mergedProductIds = [...new Set([...(currentLead?.productIds || []), ...productIds])];
      const snapshot = [...proposalsRef.current.filter((p: any) => p.id !== proposalId), stampedProposal];
      const totalValue = sumProposalsValueForLead(payload.leadId, snapshot);
      await updateLead(payload.leadId, {
        value: totalValue,
        ...(mergedProductIds.length > 0 ? { productIds: mergedProductIds } : {}),
      });
    }
    return proposalId;
  };

  // Acrescenta itens a uma proposta JÁ existente (botão de lápis na aba Produtos do
  // lead) em vez de criar uma segunda proposta pro mesmo cliente. Soma `addedValor` ao
  // valor da proposta e deixa updateProposal recalcular o valor do lead (soma de todas
  // as propostas dele).
  const addItemsToProposal = async (
    proposalId: string,
    itens: Array<{ productId?: string | null; descricao: string; quantidade: number; precoUnitario: number; billingType?: 'recurring' | 'one_time'; contractMonths?: number | null; frequency?: string | null }>,
    addedValor: number,
  ) => {
    const prop = proposalsRef.current.find((p: any) => p.id === proposalId);
    if (!prop) throw new Error('Proposta não encontrada.');
    for (const item of itens) {
      await proposalItemCrud.add({
        id: crypto.randomUUID(),
        proposal_id: proposalId,
        product_id: item.productId || null,
        product_name: item.descricao,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario,
        billing_type: item.billingType || 'recurring',
        contract_months: item.contractMonths ?? null,
        frequency: item.frequency ?? null,
      });
    }
    await updateProposal(proposalId, { valor: (Number(prop.valor) || 0) + addedValor });
  };

  // Troca itens de uma proposta existente: apaga `removeIds`, insere `itens` e ajusta o
  // valor da proposta por `valorDelta` (o valor pode carregar desconto que as linhas não têm).
  const replaceProposalItems = async (
    proposalId: string,
    removeIds: string[],
    itens: Array<{ productId?: string | null; descricao: string; quantidade: number; precoUnitario: number; billingType?: 'recurring' | 'one_time'; contractMonths?: number | null; frequency?: string | null }>,
    valorDelta: number,
  ) => {
    const prop = proposalsRef.current.find((p: any) => p.id === proposalId);
    if (!prop) throw new Error('Proposta não encontrada.');
    for (const id of removeIds) await proposalItemCrud.del(id);
    for (const item of itens) {
      await proposalItemCrud.add({
        id: crypto.randomUUID(),
        proposal_id: proposalId,
        product_id: item.productId || null,
        product_name: item.descricao,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario,
        billing_type: item.billingType || 'recurring',
        contract_months: item.contractMonths ?? null,
        frequency: item.frequency ?? null,
      });
    }
    if (valorDelta !== 0) await updateProposal(proposalId, { valor: Math.max(0, (Number(prop.valor) || 0) + valorDelta) });
  };

  // Edita itens que JÁ estão numa proposta (quantidade/preço) e/ou remove itens, e
  // ajusta o valor da proposta pela diferença (não recalcula do zero: o valor da
  // proposta pode carregar desconto/implantação que não estão nas linhas). Lançamentos
  // financeiros já gerados NÃO são alterados.
  const editProposalItems = async (
    proposalId: string,
    edits: Array<{ id: string; quantidade: number; preco_unitario: number }>,
    removedIds: string[],
  ) => {
    const prop = proposalsRef.current.find((p: any) => p.id === proposalId);
    if (!prop) throw new Error('Proposta não encontrada.');
    let delta = 0;
    for (const e of edits) {
      const old = (proposalItems || []).find((pi: any) => pi.id === e.id && pi.proposal_id === proposalId);
      if (!old) continue;
      delta += e.quantidade * e.preco_unitario - (Number(old.quantidade) || 0) * (Number(old.preco_unitario) || 0);
      await proposalItemCrud.update(e.id, { quantidade: e.quantidade, preco_unitario: e.preco_unitario });
    }
    for (const id of removedIds) {
      const old = (proposalItems || []).find((pi: any) => pi.id === id && pi.proposal_id === proposalId);
      if (!old) continue;
      delta -= (Number(old.quantidade) || 0) * (Number(old.preco_unitario) || 0);
      await proposalItemCrud.del(id);
    }
    if (delta !== 0) await updateProposal(proposalId, { valor: Math.max(0, (Number(prop.valor) || 0) + delta) });
  };

  // Excluir uma proposta precisa limpar TUDO que só existe por causa dela —
  // senão fica resíduo: valor "preso" no lead (achado real: lead do Murilo/
  // Geplan Contabilidade mostrando R$22.729 sem nenhuma proposta restante),
  // cobranças a receber órfãs no financeiro (geradas pelo AddProdutoLeadModal
  // ou pelo aceite da proposta em syncAcceptedProposal) e o contrato
  // auto-gerado ao aceitar. proposal_items é FK ON DELETE CASCADE no banco
  // (já limpa sozinho); o resto precisa de limpeza explícita aqui.
  const deleteProposal = async (id: string) => {
    const prop = (proposals || []).find((p: any) => p.id === id);
    const ok = await proposalCrud.del(id);
    if (ok) {
      setProposalItems(prev => prev.filter((pi: any) => pi.proposal_id !== id));

      // Lançamentos financeiros gerados a partir desta proposta (recorrência/
      // parcelamento do AddProdutoLeadModal, contrato/implantação do aceite) —
      // sem proposal_id não dava pra saber quais eram, então ficavam "receita
      // fantasma" a receber por um negócio que não existe mais.
      const linkedEntryIds = (financeEntries as any[])
        .filter((f: any) => f.proposal_id === id)
        .map((f: any) => f.id);
      if (linkedEntryIds.length > 0) {
        setFinanceEntries(prev => prev.filter((f: any) => !linkedEntryIds.includes(f.id)));
        if (supabase) {
          const { error } = await supabase.from('finance_entries').delete().in('id', linkedEntryIds);
          if (error) console.error('[Supabase] delete finance_entries by proposal_id error:', error.message);
        }
      }

      // Contrato auto-gerado ao aceitar esta proposta (syncAcceptedProposal) —
      // só existe por causa dela, então some junto.
      const linkedContractIds = (contracts as any[])
        .filter((c: any) => c.proposalId === id)
        .map((c: any) => c.id);
      if (linkedContractIds.length > 0) {
        setContracts(prev => prev.filter((c: any) => !linkedContractIds.includes(c.id)));
        if (supabase) {
          const { error } = await supabase.from('contracts').delete().in('id', linkedContractIds);
          if (error) console.error('[Supabase] delete contracts by proposal_id error:', error.message);
        }
      }

      if (prop?.lead_id) {
        const snapshot = proposalsRef.current.filter((p: any) => p.id !== id);
        const totalValue = sumProposalsValueForLead(prop.lead_id, snapshot);
        const leadStillHasProposals = snapshot.some((p: any) => p.lead_id === prop.lead_id);
        const leadNow = (leads || []).find((l: any) => l.id === prop.lead_id);

        if (!leadStillHasProposals && leadNow?.status === 'Fechado') {
          // BUG real (achado: "Rodrigo Magalhães" continuava "Fechado" e com
          // um cliente fantasma na Base de Clientes mesmo depois da proposta
          // que o fechou ser excluída): apagar a proposta já zerava o valor,
          // mas nunca desfazia o "ganho" em si — status, clientId e as
          // marcas de venda em customFields (parcelas/forma de pagamento/
          // etc., gravadas por AddProdutoLeadModal) ficavam presas, como se
          // o negócio ainda tivesse acontecido. Só desfaz quando não sobra
          // NENHUMA proposta real pro lead — se ainda houver outra proposta
          // de verdade, o lead continua Fechado por causa dela.
          const cf = leadNow?.customFields || {};
          const {
            parcelas, valorParcela, billingType, frequency, numberOfCycles, cycleAmount,
            setupAmount, firstChargeAmount, totalProjectedAmount, formaPagamento, installments,
            dataPagamento, detalhesPagamento, tags, ...restCustomFields
          } = cf;
          const cleanedTags = Array.isArray(tags) ? tags.filter((t: string) => t !== 'Venda') : undefined;
          await updateLead(prop.lead_id, {
            value: totalValue,
            status: 'Em Aberto',
            clientId: null,
            clientName: null,
            customFields: { ...restCustomFields, ...(cleanedTags && cleanedTags.length > 0 ? { tags: cleanedTags } : {}) },
          });
        } else {
          await updateLead(prop.lead_id, { value: totalValue });
        }
      }
    }
    return ok;
  };

  // Wrapper sobre proposalCrud.update: quando `valor` é editado manualmente
  // (Editor de Contrato — "Editar Proposta"), precisa recalcular o valor do
  // lead vinculado (soma de todas as propostas dele) na hora — senão o card
  // do Kanban e o cabeçalho do lead ficam mostrando o valor antigo até o
  // usuário mexer em outra coisa que dispare uma re-sincronização.
  const updateProposal = async (id: string, updates: any) => {
    await proposalCrud.update(id, updates);
    if (updates.valor !== undefined) {
      const prop = proposalsRef.current.find((p: any) => p.id === id);
      const leadId = prop?.lead_id;
      if (leadId) {
        const snapshot = proposalsRef.current.map((p: any) => p.id === id ? { ...p, valor: updates.valor } : p);
        const totalValue = sumProposalsValueForLead(leadId, snapshot);
        await updateLead(leadId, { value: totalValue });
      }
    }
  };

  const turmaCrud = createCrudHelper('turmas', setTurmas);
  const reuniaoCrud = createCrudHelper('reunioes', setReunioes as any);
  const studentCrud = createCrudHelper('students', setStudents);
  const colabCrud = createCrudHelper('colaboradores', setColaboradores, true);
  const mktCampCrud = createCrudHelper('marketing_campaigns', setMarketingCampaigns);
  const mktContCrud = createCrudHelper('marketing_content', setMarketingContent);
  const mktLpCrud = createCrudHelper('marketing_landing_pages', setMarketingLandingPages);
  const mktFormsCrud = createCrudHelper('marketing_forms', setMarketingForms);
  const mktAutoCrud = createCrudHelper('marketing_automations', setMarketingAutomations);
  const squadMetaCrud = createCrudHelper('squad_metas', setSquadMetas);
  const cargoCrud = createCrudHelper('cargos', setCargos);
  const auroraAgentCrud = createCrudHelper('aurora_agents', setAuroraAgents);
  const toggleAuroraAgent = (id: string) => {
    const current = auroraAgents.find(a => a.id === id);
    if (!current) return;
    auroraAgentCrud.update(id, {
      active: !current.active,
      ...(current.active ? { deactivated_at: new Date().toISOString() } : { deactivated_at: null }),
    });
  };
  const empresaFilialCrud = createCrudHelper('empresa_filiais', setEmpresaFiliais);
  const nichoCrud = createCrudHelper('nichos', setNichos);
  const financeCategoryCrud = createCrudHelper('finance_categories', setFinanceCategories);
  const financeBudgetCrud = createCrudHelper('finance_budgets', setFinanceBudgets);
  const implementationCrud = createCrudHelper('implementations', setImplementations);
  // `finance_budgets` tem um índice único (tenant_id, category_id, mes) — um
  // `add()` puro quebraria com conflito se o usuário já tinha orçado aquela
  // categoria nesse mês. Decide update/add pelo estado local (já carregado
  // do tenant inteiro, sem custo de rede extra pra checar).
  const upsertFinanceBudget = async (categoryId: string, mes: string, valorOrcado: number) => {
    const existing = (financeBudgets as any[]).find((b: any) => b.category_id === categoryId && b.mes === mes);
    if (existing) {
      await financeBudgetCrud.update(existing.id, { valor_orcado: valorOrcado });
    } else {
      await financeBudgetCrud.add({ category_id: categoryId, mes, valor_orcado: valorOrcado });
    }
  };
  const financeBankAccountCrud = createCrudHelper('finance_bank_accounts', setFinanceBankAccounts);
  const financeTransferCrud = createCrudHelper('finance_transfers', setFinanceTransfers);
  const financePeriodLockCrud = createCrudHelper('finance_period_locks', setFinancePeriodLocks);
  const financeCentroCustoCrud = createCrudHelper('finance_centros_custo', setFinanceCentrosCusto);
  const financeAttachmentCrud = createCrudHelper('finance_attachments', setFinanceAttachments);
  const clienteBaseCrud = createCrudHelper('clientes', setClienteBase);

  // Diff campo a campo pro log de auditoria — só entram os campos que de
  // fato mudaram, e nunca os de controle interno (id/tenant/filial/created_at).
  const buildFinanceAuditDiff = (before: any, after: any): Record<string, { old: any; new: any }> => {
    const diff: Record<string, { old: any; new: any }> = {};
    const ignorar = new Set(['id', 'tenant_id', 'filial_id', 'created_at']);
    const chaves = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const k of chaves) {
      if (ignorar.has(k)) continue;
      const a = before?.[k] ?? null, b = after?.[k] ?? null;
      if (JSON.stringify(a) !== JSON.stringify(b)) diff[k] = { old: a, new: b };
    }
    return diff;
  };

  const writeFinanceAuditLog = async (params: { tipo_acao: 'CRIACAO' | 'ATUALIZACAO' | 'EXCLUSAO'; descricao_alvo: string; diff: Record<string, { old: any; new: any }> }) => {
    if (!supabase || !tenantId || Object.keys(params.diff).length === 0 && params.tipo_acao === 'ATUALIZACAO') return;
    const row = {
      tenant_id: tenantId,
      usuario_id: user?.id || null,
      usuario_nome: (user as any)?.name || null,
      tipo_item: 'TRANSACAO' as const,
      tipo_acao: params.tipo_acao,
      descricao_alvo: params.descricao_alvo,
      diff: params.diff,
    };
    const { data, error } = await supabase.from('finance_audit_log').insert(row).select().single();
    if (error) { console.error('[Supabase] finance_audit_log insert error:', error.message); return; }
    if (data) setFinanceAuditLog(prev => [data, ...prev]);
  };

  // Transação paga dentro de um período bloqueado é imutável — pendente no
  // mesmo intervalo continua livre (spec §9.1).
  const checkFinanceEntryLock = (entry: { status?: string; date?: string } | undefined): boolean => {
    if (!entry || entry.status !== 'Pago') return false;
    return isDateLocked(entry.date, financePeriodLocks as any[]);
  };

  // "Definir como principal" precisa desmarcar a conta principal anterior
  // primeiro — o índice único parcial no banco (uma só is_principal=true por
  // tenant) rejeita duas contas principais ao mesmo tempo.
  const setContaPrincipal = async (id: string) => {
    const atual = financeBankAccounts.find((a: any) => a.is_principal);
    if (atual && atual.id !== id) await financeBankAccountCrud.update(atual.id, { is_principal: false });
    await financeBankAccountCrud.update(id, { is_principal: true });
  };
  const financeCommissionEntryCrud = createCrudHelper('finance_commission_entries', setFinanceCommissionEntries);
  const scheduledExportCrud = createCrudHelper('scheduled_exports', setScheduledExports);
  const educationContentCrud = createCrudHelper('education_content', setEducationContent);
  const certCrud = createCrudHelper('certificates', setCertificates);
  const indicacaoCrud = createCrudHelper('indicacoes', setIndicacoes as any);

  // Lançamentos gerados automaticamente (aceite de proposta, AddProdutoLeadModal)
  // só preenchiam o texto livre `category` — `category_id` (o vínculo real com
  // finance_categories, usado pelo DRE) ficava sempre nulo. Acha uma categoria já
  // existente com esse nome+tipo (mesmo padrão de match usado em
  // FinanceiroImportarMovimentacoes.tsx) ou cria uma na hora — nunca inventa um
  // id de categoria que não existe.
  const resolveFinanceCategoryId = async (nome: string, tipo: 'Receita' | 'Despesa'): Promise<string | null> => {
    const norm = (s: string) => String(s || "").trim().toLowerCase();
    const existing = (financeCategories as any[]).find((c: any) => c.tipo === tipo && norm(c.nome) === norm(nome));
    if (existing) return existing.id;
    const created = await financeCategoryCrud.add({ nome, tipo, subtipo: null });
    return created?.id ?? null;
  };

  const addFinanceEntry = async (entry: Omit<FinanceEntry, 'id'>, options: { silent?: boolean } = {}) => {
    if (checkFinanceEntryLock(entry)) {
      toast.error("Este período está bloqueado para fechamento — não é possível lançar transações pagas nessa data.");
      return;
    }
    const newEntry: any = { ...entry, id: crypto.randomUUID() };
    if (tenantId) newEntry.tenant_id = tenantId;
    newEntry.filial_id = activeFilialId;
    setFinanceEntries(prev => [newEntry, ...prev]);
    if (supabase) {
      const { error } = await supabase.from('finance_entries').insert(newEntry);
      if (error) {
        console.error("Supabase add finance_entries failed:", error.message, error.details);
        toast.error(`Erro ao salvar lançamento: ${friendlyError(error)}`);
        return;
      }
    }
    writeFinanceAuditLog({ tipo_acao: 'CRIACAO', descricao_alvo: newEntry.description || 'Lançamento financeiro', diff: buildFinanceAuditDiff(null, newEntry) });
    if (!options.silent) toast.success(`${entry.type === 'Pagar' ? 'Despesa' : 'Receita'} registrada!`);
  };

  // Sincroniza o valor de volta no lead vinculado e garante contrato + fatura
  // a receber para uma proposta aceita, além de recalcular plano real
  // (produtos do catálogo) e data de término do contrato. Vivia dentro da
  // página Propostas.tsx — só rodava (reconciliação incluída) enquanto essa
  // página estivesse montada, então abrir direto /financeiro/faturas (que
  // renderiza a mesma lista de contratos por outra rota) nunca corrigia
  // contratos antigos. Centralizado aqui pra rodar uma vez só, globalmente,
  // pra qualquer tela que use `contracts`/`proposals` — a mesma fonte de
  // verdade em vez de cada página reimplementar (ou esquecer) essa sincronização.
  // Trava contra loop de feedback da reconciliação — ver comentário no uso
  // abaixo (dentro do bloco `jaExiste`).
  const reconciledProposalIdsRef = React.useRef<Set<string>>(new Set());

  const syncAcceptedProposal = async (prop: any, { silent = false }: { silent?: boolean } = {}) => {
    // BUG real (visto em produção: contrato/lançamento de "Casa Sao Paulo" e
    // "To Na Pista Boliche" — clientes REAIS da Pluppex — aparecendo com
    // tenant_id do To Na Pista): essa reconciliação roda automaticamente
    // sempre que `proposals`/`contracts` mudam, sem checar se `prop` de fato
    // pertence ao tenant ativo. Numa conta master/parceiro trocando de
    // tenant, uma janela onde `proposals` ainda tinha dados do tenant
    // ANTERIOR (antes do fix de limpar estado na troca) deixava essa função
    // processar uma proposta de um tenant enquanto `tenantId` (ambiente) já
    // era outro — daí `addContract`/`addFinanceEntry` carimbavam o registro
    // novo com o tenant ERRADO, e os lookups de `contracts`/`leads` abaixo
    // (também escopados pro tenant ativo) nunca encontravam o contrato já
    // existente, recriando o lançamento financeiro a cada re-execução.
    // Bloqueia aqui a causa raiz: nunca processa proposta de outro tenant.
    if (prop.tenant_id && tenantId && prop.tenant_id !== tenantId) return false;
    const linkedItems = (proposalItems || []).filter((pi: any) => pi.proposal_id === prop.id);

    // Idempotência real: vínculo estável por proposal_id (trava também no
    // banco via índice único) em vez de comparar client/plan por texto — uma
    // proposta ou contrato renomeado depois não quebra mais a checagem e
    // recria um duplicado. Contratos antigos sem proposal_id (criados antes
    // dessa coluna existir) ainda caem no fallback por nome, uma única vez.
    const norm = (s: any) => String(s || "").trim().toLowerCase();
    const existingContract = (contracts || []).find((c: any) =>
      c.proposalId === prop.id ||
      (!c.proposalId && norm(c.client) === norm(prop.cliente) && norm(c.plan) === norm(prop.titulo))
    );
    const jaExiste = !!existingContract;

    // Recalcula o valor do lead como soma de TODAS as propostas dele (mesma
    // função usada em createProposalWithItems/deleteProposal/updateProposal) —
    // idempotente por natureza, então roda em toda re-execução da reconciliação
    // sem precisar de uma trava separada pra evitar somar o mesmo valor várias
    // vezes (bug antigo: leads da Fabiano Fagundes/To Na Pista Boliche e
    // Hermando/Casa Sao Paulo com o valor real somado 5x por causa de uma
    // trava que dependia de `contracts`, que ficava defasado durante rajadas
    // de re-execução do efeito).
    if (!jaExiste && prop.lead_id) {
      const productIds = linkedItems.map((pi: any) => pi.product_id).filter(Boolean);
      const lead = (leads || []).find((l: any) => l.id === prop.lead_id);
      const totalValue = sumProposalsValueForLead(prop.lead_id, proposalsRef.current);
      const newProductIds = [...new Set([...(lead?.productIds || []), ...productIds])];
      updateLead(prop.lead_id, {
        value: totalValue,
        ...(newProductIds.length > 0 ? { productIds: newProductIds } : {}),
      });
    }

    // MRR real = só os itens recorrentes da proposta; implantação/setup entra
    // à parte, não conta como receita recorrente mensal (Fase 2). Sem itens
    // detalhados (proposta sem produtos, ex.: texto/arquivo), cai tudo como
    // recorrente — mesmo comportamento de antes.
    const recurringTotal = linkedItems.length > 0
      ? linkedItems.filter((pi: any) => pi.billing_type !== 'one_time').reduce((s: number, pi: any) => s + (Number(pi.preco_unitario) || 0) * (Number(pi.quantidade) || 1), 0)
      : (prop.valor || 0);
    const oneTimeTotal = linkedItems.filter((pi: any) => pi.billing_type === 'one_time').reduce((s: number, pi: any) => s + (Number(pi.preco_unitario) || 0) * (Number(pi.quantidade) || 1), 0);

    // `prop.titulo` é só o título genérico da proposta ("Proposta Comercial —
    // Cliente X"), não o plano/produto vendido — usar isso como "Plano" do
    // contrato escondia o produto real do catálogo. O plano do contrato passa
    // a ser os produtos de fato vinculados na proposta (proposal_items.product_name),
    // caindo no título só quando a proposta não tem itens estruturados (texto/arquivo).
    const planLabel = linkedItems.length > 0
      ? [...new Set(linkedItems.map((pi: any) => pi.product_name).filter(Boolean))].join(" + ")
      : (prop.titulo || "Proposta Comercial");

    // Duração do contrato (em meses). Prioriza o prazo REALMENTE fechado nesta
    // venda (proposal_items.contract_months — pode ter sido negociado
    // diferente do padrão do catálogo, ex.: licença de 12 meses fechada por 4
    // meses com pagamento adiantado); só cai pro padrão do produto do catálogo
    // em propostas antigas, criadas antes desse campo existir.
    const linkedProducts = linkedItems
      .map((pi: any) => (products || []).find((p: any) => p.id === pi.product_id))
      .filter(Boolean);
    const contractMonths =
      linkedItems
        .map((pi: any) => Number(pi.contract_months) || 0)
        .filter((m: number) => m > 0)
        .sort((a: number, b: number) => b - a)[0]
      ?? linkedProducts
        .map((p: any) => Number(p.contractMonths) || 0)
        .filter((m: number) => m > 0)
        .sort((a: number, b: number) => b - a)[0];

    // Proposta pode ter sido fechada com desconto (ex.: permuta/cortesia
    // negociada no modal Novo Produto) — `prop.valor` já reflete isso, mas
    // `recurringTotal`/`oneTimeTotal` acima vêm do preço de catálogo CHEIO
    // dos itens (proposal_items não guarda o desconto, só o preço unitário).
    // Sem distribuir esse desconto proporcionalmente aqui, o contrato
    // gerado ao aceitar a proposta reaparecia pelo valor cheio, ignorando o
    // desconto já fechado com o cliente. Achado real: negócio "permuta" com
    // Murilo (Geplan Contabilidade) — contrato anual negociado a R$4.367
    // reaparecendo como R$11.964 (preço de catálogo) assim que a proposta
    // era aceita.
    const undiscountedItemsTotal = recurringTotal + oneTimeTotal;
    const discountRatio = undiscountedItemsTotal > 0 && prop.valor
      ? Math.min(1, prop.valor / undiscountedItemsTotal)
      : 1;
    const recurringTotalFinal = recurringTotal * discountRatio;
    const oneTimeTotalFinal = oneTimeTotal * discountRatio;
    // `mrr` precisa ser a mensalidade de verdade. `recurringTotalFinal` é o
    // total do PERÍODO INTEIRO (preco_unitario × quantidade, onde
    // quantidade já é meses × unidades num item recorrente — ver
    // AddProdutoLeadModal), não uma mensalidade — sem dividir pelos meses
    // do contrato, o card de MRR mostrava o valor total do contrato inteiro
    // como se fosse a mensalidade (ex.: contrato anual de R$11.964
    // aparecendo como "MRR: R$11.964", quando a mensalidade real era ~R$997).
    // Sem prazo (contractMonths nulo) o item grava um lote inicial de OPEN_ENDED_BATCH_CYCLES ciclos, então divide por isso e não superestima o MRR.
    const monthlyMrr = contractMonths && contractMonths > 0
      ? recurringTotalFinal / contractMonths
      : linkedItems.length > 0 ? recurringTotalFinal / OPEN_ENDED_BATCH_CYCLES : recurringTotalFinal;

    if (jaExiste) {
      // Backfill: contratos criados ANTES das correções de plano/data de
      // término (fase de auditoria) ficaram presos com o título genérico da
      // proposta e sem data de término — corrige aqui, sem re-somar valor no
      // lead nem duplicar nada (só plan/endDate/proposalId). Carimba
      // proposalId também nos que só tinham o vínculo por nome, senão o match
      // por nome quebra assim que o `plan` muda e recria um duplicado na
      // próxima reconciliação.
      const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(existingContract.date || "");
      const baseDate = dm ? new Date(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1])) : new Date();
      const backfillEndDate = contractMonths
        ? new Date(baseDate.getFullYear(), baseDate.getMonth() + contractMonths, baseDate.getDate()).toLocaleDateString("pt-BR")
        : null;
      // BUG real (rajada em produção 2026-09-20: PATCH em milhares de
      // contratos de uma vez): essas comparações eram por string crua
      // (`!==`), sem o mesmo norm() usado no match de `jaExiste` acima —
      // qualquer espaço/maiúscula invisível divergente entre `planLabel`/
      // `prop.titulo` (recalculados a cada passada) e o valor já salvo
      // fazia `updates` nunca ficar vazio, então TODO contrato "aceito"
      // era re-atualizado em TODA execução da reconciliação — e
      // updateContract muda `contracts`, que é dependência do próprio
      // useEffect que chama isso, reexecutando a reconciliação de novo,
      // num loop sem nenhum limitador de rede pra segurar (diferente do
      // debounce que só existe pro refetch disparado por realtime).
      const updates: any = {};
      if (planLabel && norm(planLabel) !== norm(existingContract.plan)) updates.plan = planLabel;
      if (backfillEndDate && backfillEndDate !== existingContract.endDate) updates.endDate = backfillEndDate;
      if (!existingContract.proposalId) updates.proposalId = prop.id;
      // Descrição = título original da proposta ("Proposta Comercial — Cliente
      // X") — separado do plano (produto do catálogo) desde a correção acima.
      if (prop.titulo && norm(prop.titulo) !== norm(existingContract.description)) updates.description = prop.titulo;
      // Segunda trava, independente da causa exata da divergência: cada
      // proposta só é reconciliada UMA VEZ por sessão, mesmo que o efeito
      // reexecute (contracts mudando é esperado — não pode virar gatilho
      // pra reprocessar tudo de novo).
      if (Object.keys(updates).length > 0 && !reconciledProposalIdsRef.current.has(prop.id)) {
        reconciledProposalIdsRef.current.add(prop.id);
        updateContract(existingContract.id, updates, { silent: true });
      }
      return false;
    }

    const signedDate = new Date();
    const endDate = contractMonths
      ? new Date(signedDate.getFullYear(), signedDate.getMonth() + contractMonths, signedDate.getDate()).toLocaleDateString("pt-BR")
      : null;

    // Preenche os vínculos reais que dá pra derivar sem inventar nada: a
    // categoria (mesmo nome já usado no texto livre `category`, agora também
    // como category_id de verdade — o DRE lê o id, não o texto) e o contato
    // (cliente já vinculado ao lead desta proposta, se existir). Conta
    // bancária/centro de custo ficam de fora de propósito — não tem como
    // adivinhar qual conta ou centro de custo o usuário quis sem perguntar.
    const contratoCategoryId = await resolveFinanceCategoryId("Contrato / Recorrente", "Receita");
    const implantacaoCategoryId = await resolveFinanceCategoryId("Implantação / Setup", "Receita");
    const leadForContato = prop.lead_id ? (leads || []).find((l: any) => l.id === prop.lead_id) : null;
    const contatoId = leadForContato?.clientId || null;

    addContract({
      client: prop.cliente || "Cliente",
      plan: planLabel || prop.titulo || "Proposta Comercial",
      description: prop.titulo || null,
      mrr: formatCurrency(monthlyMrr),
      totalValue: recurringTotalFinal + oneTimeTotalFinal,
      status: "Ativo",
      date: signedDate.toLocaleDateString("pt-BR"),
      endDate,
      progress: 100,
      proposalId: prop.id,
    }, { silent });

    addFinanceEntry({
      description: `Contrato: ${prop.titulo} (${prop.cliente})`,
      category: "Contrato / Recorrente",
      category_id: contratoCategoryId,
      contato_id: contatoId,
      value: recurringTotalFinal,
      type: "Receber",
      date: new Date().toISOString().slice(0, 10),
      status: "A Vencer",
      // Vincula à proposta que gerou esta cobrança — sem isso, excluir a
      // proposta não tinha como encontrar (e limpar) este lançamento.
      proposal_id: prop.id,
    }, { silent });

    // Implantação/setup é receita única — lançamento à parte, não recorrente,
    // pra não poluir relatórios de MRR/receita recorrente com valor avulso.
    if (oneTimeTotalFinal > 0) {
      addFinanceEntry({
        description: `Implantação/Setup: ${prop.titulo} (${prop.cliente})`,
        category: "Implantação / Setup",
        category_id: implantacaoCategoryId,
        contato_id: contatoId,
        value: oneTimeTotalFinal,
        type: "Receber",
        date: new Date().toISOString().slice(0, 10),
        status: "A Vencer",
        proposal_id: prop.id,
      }, { silent });
    }

    if (!silent) toast.success("🎉 Proposta Aceita! Contrato ativado e fatura a receber gerada no financeiro!");
    return true;
  };

  // Reconciliação: propostas "Aceita" sem contrato correspondente (aceitas
  // antes dessa sincronização existir) ou com contrato desatualizado (plano
  // genérico / sem data de término, de antes da correção) — roda globalmente
  // assim que os dados do tenant carregam, não depende de nenhuma página
  // específica estar montada.
  useEffect(() => {
    if (!proposals || proposals.length === 0 || !contractsLoaded || !proposalsLoaded) return;
    (proposals as any[])
      .filter((p) => p.status === "Aceita")
      .forEach((p) => syncAcceptedProposal(p, { silent: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals, contracts, contractsLoaded, proposalsLoaded]);

  const deleteFinanceEntry = async (id: string) => {
    const before = financeEntries.find(f => f.id === id);
    if (checkFinanceEntryLock(before)) {
      toast.error("Este lançamento está pago dentro de um período bloqueado — não pode ser excluído.");
      return;
    }
    setFinanceEntries(prev => prev.filter(f => f.id !== id));
    if (supabase) {
      const { error } = await supabase.from('finance_entries').delete().eq('id', id);
      if (error) {
        console.error("Supabase delete finance_entries failed:", error.message);
        toast.error(`Erro ao remover lançamento: ${friendlyError(error)}`);
        return;
      }
    }
    if (before) writeFinanceAuditLog({ tipo_acao: 'EXCLUSAO', descricao_alvo: before.description || 'Lançamento financeiro', diff: buildFinanceAuditDiff(before, null) });
    toast.info('Lançamento financeiro removido.');
  };

  const updateFinanceEntry = async (id: string, updates: Partial<FinanceEntry>) => {
    const before = financeEntries.find(f => f.id === id);
    if (checkFinanceEntryLock(before)) {
      toast.error("Este lançamento está pago dentro de um período bloqueado — não pode ser editado.");
      return;
    }
    setFinanceEntries(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    if (supabase) {
      const { error } = await supabase.from('finance_entries').update(updates).eq('id', id);
      if (error) {
        console.error("Supabase update finance_entries failed:", error.message);
        toast.error(`Erro ao atualizar lançamento: ${friendlyError(error)}`);
        return;
      }
    }
    if (before) writeFinanceAuditLog({ tipo_acao: 'ATUALIZACAO', descricao_alvo: before.description || 'Lançamento financeiro', diff: buildFinanceAuditDiff(before, { ...before, ...updates }) });
  };

  const addAppointment = async (apt: Omit<Appointment, 'id'>) => {
    const newApt: any = { ...apt, id: crypto.randomUUID() };
    if (tenantId) newApt.tenant_id = tenantId;
    newApt.filial_id = activeFilialId;
    setAppointments(prev => [newApt, ...prev]);
    toast.success('Agendamento realizado!');
    if (supabase) {
      try {
        const { id, patient, patientId, phone, drId, drName, specialty, room, type, status, date, time } = newApt as any;
        await supabase.from('appointments').insert({
          id, patient, patient_id: patientId ?? null, phone, dr_id: drId, dr_name: drName, specialty, room, type, status, date, time,
          tenant_id: newApt.tenant_id, filial_id: newApt.filial_id,
        });
      } catch (err) {
        console.error("Supabase add appointment failed:", err);
      }
    }
  };

  const updateAppointment = async (id: string, updates: Partial<Appointment>) => {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    if (supabase) {
      try {
        const payload: any = { ...updates };
        if ('drId' in payload) payload.dr_id = payload.drId;
        if ('drName' in payload) payload.dr_name = payload.drName;
        if ('patientId' in payload) payload.patient_id = payload.patientId;
        delete payload.drId; delete payload.drName; delete payload.patientId;
        await supabase.from('appointments').update(payload).eq('id', id);
      } catch (err) {
        console.error("Supabase update appointment failed:", err);
      }
    }
  };

  const deleteAppointment = async (id: string) => {
    setAppointments(prev => prev.filter(a => a.id !== id));
    toast.info('Agendamento removido.');
    if (supabase) {
      try {
        await supabase.from('appointments').delete().eq('id', id);
      } catch (err) {
        console.error("Supabase delete appointment failed:", err);
      }
    }
  };

  return (
    <DataContext.Provider value={{
      leads, avgWonTicket, tasks, contracts, notifications, leadActivities, financeEntries, appointments,
      theme, toggleTheme,
      addLead, updateLead, deleteLead, moveLead,
      addTask, updateTask, deleteTask, addContract, updateContract, deleteContract,
      addNotification, markNotificationAsRead, markAllNotificationsAsRead,
      addLeadActivity,
      getSmartInsight,
      addFinanceEntry, deleteFinanceEntry, updateFinanceEntry,
      addAppointment, updateAppointment, deleteAppointment,
      simulateNewLeadAssignment,
      simulateOverdueTask,
      whatsappWebhookUrl,
      setWhatsappWebhookUrl: updateWhatsappWebhookUrl,
      customLeadFields,
      setCustomLeadFields: updateCustomLeadFields,
      leadScoreTriggers,
      setLeadScoreTriggers: updateLeadScoreTriggers,
      sidebarModules,
      setSidebarModules,
      tenantPrimaryColor,
      updateTenantPrimaryColor,
      saveAppSetting,
      ensureNicheModulesLoaded,
      appSettings,
      appSettingsLoaded,
      globalWebhooks,
      addGlobalWebhook,
      updateGlobalWebhook,
      deleteGlobalWebhook,
      toggleGlobalWebhook,
      squads,
      updateSquad,
      addSquad,
      deleteSquad,
      funis,
      addFunil,
      updateFunil,
      deleteFunil,
      empresaFiliais,
      addEmpresaFilial: empresaFilialCrud.add,
      updateEmpresaFilial: empresaFilialCrud.update,
      deleteEmpresaFilial: empresaFilialCrud.del,
      nichos,
      addNicho: nichoCrud.add,
      updateNicho: nichoCrud.update,
      deleteNicho: nichoCrud.del,
      financeCategories,
      addFinanceCategory: financeCategoryCrud.add,
      updateFinanceCategory: financeCategoryCrud.update,
      deleteFinanceCategory: financeCategoryCrud.del,
      resolveFinanceCategoryId,
      financeBudgets,
      upsertFinanceBudget,
      deleteFinanceBudget: financeBudgetCrud.del,
      implementations,
      addImplementation: implementationCrud.add,
      updateImplementation: implementationCrud.update,
      deleteImplementation: implementationCrud.del,
      financeBankAccounts,
      addFinanceBankAccount: financeBankAccountCrud.add,
      updateFinanceBankAccount: financeBankAccountCrud.update,
      deleteFinanceBankAccount: financeBankAccountCrud.del,
      setContaPrincipal,
      financeTransfers,
      addFinanceTransfer: financeTransferCrud.add,
      updateFinanceTransfer: financeTransferCrud.update,
      deleteFinanceTransfer: financeTransferCrud.del,
      financePeriodLocks,
      addFinancePeriodLock: financePeriodLockCrud.add,
      deleteFinancePeriodLock: financePeriodLockCrud.del,
      financeAuditLog,
      financeCentrosCusto,
      addFinanceCentroCusto: financeCentroCustoCrud.add,
      updateFinanceCentroCusto: financeCentroCustoCrud.update,
      deleteFinanceCentroCusto: financeCentroCustoCrud.del,
      financeAttachments,
      addFinanceAttachment: financeAttachmentCrud.add,
      deleteFinanceAttachment: financeAttachmentCrud.del,
      addClienteBase: clienteBaseCrud.add,
      updateClienteBase: clienteBaseCrud.update,
      deleteClienteBase: clienteBaseCrud.del,
      financeCommissionEntries,
      addFinanceCommissionEntry: financeCommissionEntryCrud.add,
      updateFinanceCommissionEntry: financeCommissionEntryCrud.update,
      deleteFinanceCommissionEntry: financeCommissionEntryCrud.del,
      scheduledExports,
      addScheduledExport: scheduledExportCrud.add,
      updateScheduledExport: scheduledExportCrud.update,
      deleteScheduledExport: scheduledExportCrud.del,
      educationContent,
      addEducationContent: educationContentCrud.add,
      updateEducationContent: educationContentCrud.update,
      deleteEducationContent: educationContentCrud.del,
      addCertificate: certCrud.add,
      updateCertificate: certCrud.update,
      deleteCertificate: certCrud.del,
      marketingAutomations,
      setMarketingAutomations,
      addMarketingAutomation: mktAutoCrud.add,
      updateMarketingAutomation: mktAutoCrud.update,
      deleteMarketingAutomation: mktAutoCrud.del,
      marketingContent,
      setMarketingContent,
      addMarketingContent: mktContCrud.add,
      updateMarketingContent: mktContCrud.update,
      deleteMarketingContent: mktContCrud.del,
      marketingCampaigns,
      setMarketingCampaigns,
      addMarketingCampaign: mktCampCrud.add,
      updateMarketingCampaign: mktCampCrud.update,
      deleteMarketingCampaign: mktCampCrud.del,
      marketingLandingPages,
      setMarketingLandingPages,
      addMarketingLandingPage: mktLpCrud.add,
      updateMarketingLandingPage: mktLpCrud.update,
      deleteMarketingLandingPage: mktLpCrud.del,
      marketingForms,
      setMarketingForms,
      addMarketingForm: mktFormsCrud.add,
      updateMarketingForm: mktFormsCrud.update,
      deleteMarketingForm: mktFormsCrud.del,
      products,
      setProducts,
      addProduct: productCrud.add,
      updateProduct: productCrud.update,
      deleteProduct: productCrud.del,
      proposals,
      setProposals,
      addProposal: proposalCrud.add,
      updateProposal,
      deleteProposal,
      proposalItems,
      createProposalWithItems,
      addItemsToProposal,
      editProposalItems,
      replaceProposalItems,
      syncAcceptedProposal,
      certificates,
      setCertificates,
      turmas,
      setTurmas,
      addTurma: turmaCrud.add,
      updateTurma: turmaCrud.update,
      deleteTurma: turmaCrud.del,
      reunioes,
      addReuniao: (r: Omit<Reuniao, 'id' | 'createdAt'>) => reuniaoCrud.add({ ...r, createdAt: new Date().toISOString() }),
      updateReuniao: reuniaoCrud.update,
      deleteReuniao: reuniaoCrud.del,
      indicacoes,
      addIndicacao: indicacaoCrud.add,
      updateIndicacao: indicacaoCrud.update,
      deleteIndicacao: indicacaoCrud.del,
      students,
      setStudents,
      addStudent: studentCrud.add,
      updateStudent: studentCrud.update,
      deleteStudent: studentCrud.del,
      colaboradores,
      setColaboradores,
      addColaborador: colabCrud.add,
      updateColaborador: colabCrud.update,
      deleteColaborador: colabCrud.del,
      squadMetas,
      setSquadMetas,
      addSquadMeta: squadMetaCrud.add,
      updateSquadMeta: squadMetaCrud.update,
      deleteSquadMeta: squadMetaCrud.del,
      financialGoals,
      cargos,
      setCargos,
      addCargo: cargoCrud.add,
      updateCargo: cargoCrud.update,
      deleteCargo: cargoCrud.del,
      auroraAgents,
      addAuroraAgent: auroraAgentCrud.add,
      updateAuroraAgent: auroraAgentCrud.update,
      deleteAuroraAgent: auroraAgentCrud.del,
      toggleAuroraAgent,
      clienteBase,
      setClienteBase,
    }}>
      {children}
    </DataContext.Provider>
  );
}
