import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(url: string): string {
  try {
    const parsed = new URL((url || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

const supabaseUrlRaw = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKeyRaw = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseUrl = normalizeSupabaseUrl(supabaseUrlRaw);
const supabaseAnonKey = (supabaseAnonKeyRaw || '').trim();

console.log('[Supabase] env VITE_SUPABASE_URL set?', Boolean(supabaseUrlRaw));
console.log('[Supabase] env VITE_SUPABASE_ANON_KEY set?', Boolean(supabaseAnonKeyRaw));

// Initialize client if credentials are configured
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Log Supabase configuration status for debugging
if (supabase) {
  console.log('[Supabase] ✅ Configurado e pronto para uso');
} else {
  console.warn(
    '[Supabase] ⚠️ NÃO CONFIGURADO\n' +
    'URL:', import.meta.env.VITE_SUPABASE_URL ? '✓ Definida' : '✗ Não definida', '\n' +
  'ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? '✓ Definida' : '✗ Não definida', '\n' +
  'Ação: Reinicie o servidor Vite após configurar .env (npm run dev)'
  );
}

// Persistência em sessão para evitar tentativas repetitivas de DNS que geram erros no console
const CONNECTION_CACHE_KEY = 'axis_supabase_connection_status';
let isReachableCache: boolean | null = (() => {
  if (typeof window === 'undefined') return null;
  const saved = sessionStorage.getItem(CONNECTION_CACHE_KEY);
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  return null;
})();

let reachabilityPromise: Promise<boolean> | null = null;

/**
 * Tests if Supabase is actually reachable (not just configured).
 * Returns false if the URL fails to resolve (ERR_NAME_NOT_RESOLVED, timeout, etc.)
 */
export async function isSupabaseReachable(): Promise<boolean> {
  if (isReachableCache !== null) {
    return isReachableCache;
  }

  if (reachabilityPromise) {
    return reachabilityPromise;
  }

  // Se o navegador estiver offline, não tentamos a conexão
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  if (!supabase || !supabaseUrl) return false;

  reachabilityPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      isReachableCache = res.ok || res.status === 400;
    } catch {
      // Falha de resolução de nome (DNS) ou rede
      isReachableCache = false;
    } finally {
      if (typeof window !== 'undefined' && isReachableCache !== null) {
        sessionStorage.setItem(CONNECTION_CACHE_KEY, String(isReachableCache));
      }
      reachabilityPromise = null;
    }
    return isReachableCache;
  })();

  return reachabilityPromise;
}

/**
 * Busca o perfil (tenant, role, etc.) de um usuário autenticado no Supabase Auth.
 * Usado tanto no login quanto na restauração de sessão (onAuthStateChange).
 */
export async function fetchUserProfile(userId: string): Promise<{ success: boolean; error?: string; user?: any }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor.' };

  const { data, error } = await supabase
    .from("users")
    .select(`
      id,
      name,
      email,
      role,
      is_master,
      active,
      tenant_id,
      partner_id,
      phone,
      bio,
      avatar_url,
      two_factor_enabled,
      preferences,
      is_tenant_admin,
      tenants (
        id,
        name,
        niche,
        primary_color
      )
    `)
    .eq("id", userId)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] Erro ao carregar perfil:', error.message);
    return { success: false, error: "Erro ao carregar perfil do usuário." };
  }

  if (!data) {
    return { success: false, error: "Perfil de usuário não encontrado ou inativo." };
  }

  const tenant = Array.isArray(data.tenants) ? data.tenants[0] : (data.tenants as any);
  if (!tenant) {
    return { success: false, error: "Usuário não possui uma empresa (tenant) vinculada." };
  }

  return {
    success: true,
    user: {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantNiche: tenant.niche,
      isMaster: data.is_master,
      partnerId: data.partner_id ?? undefined,
      phone: (data as any).phone ?? undefined,
      bio: (data as any).bio ?? undefined,
      avatarUrl: (data as any).avatar_url ?? undefined,
      twoFactorEnabled: (data as any).two_factor_enabled ?? false,
      preferences: (data as any).preferences ?? {},
      isTenantAdmin: (data as any).is_tenant_admin ?? false,
      tenantPrimaryColor: tenant.primary_color ?? undefined,
    },
  };
}

/**
 * Authenticate a user via Supabase Auth (email/senha reais, não mais comparação
 * client-side contra password_hash em Base64).
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: any; mfaFactorId?: string }> {
  if (!supabase) {
    return { success: false, error: 'Não foi possível conectar ao servidor.' };
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      const msg = authError?.message === 'Invalid login credentials'
        ? 'E-mail ou senha inválidos.'
        : (authError?.message || 'Erro ao autenticar.');
      return { success: false, error: msg };
    }

    // Conta com verificação em duas etapas: a sessão só está em aal1 até o código TOTP ser validado.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factorId = factors?.totp?.find((f) => f.status === 'verified')?.id;
      if (factorId) return { success: false, error: 'MFA_REQUIRED', mfaFactorId: factorId };
    }

    return await finishSignIn(authData.user.id);
  } catch (err) {
    return { success: false, error: "Erro na conexão com o banco de dados." };
  }
}

/** Carrega o perfil e fecha o login (usado direto ou depois do desafio MFA). */
export async function finishSignIn(userId: string): Promise<{ success: boolean; error?: string; user?: any }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor.' };
  const profile = await fetchUserProfile(userId);
  if (!profile.success) {
    // Autenticou no Supabase Auth mas não tem perfil válido em public.users — desfaz a sessão.
    await supabase.auth.signOut();
  }
  return profile;
}

/** Valida o código TOTP da tela de login e conclui a sessão (aal2). */
export async function verifyMfaAndFinish(factorId: string, code: string): Promise<{ success: boolean; error?: string; user?: any }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor.' };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) return { success: false, error: 'Código inválido ou expirado.' };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { success: false, error: 'Sessão inválida.' };
  return finishSignIn(data.user.id);
}

/**
 * Envia o e-mail de recuperação de senha do Supabase Auth. O link do e-mail
 * leva o usuário de volta pra /redefinir-senha, onde updatePassword() é chamado.
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  });
  // Nunca revela se o e-mail existe ou não (evita enumeração de contas) — o
  // Supabase já se comporta assim por padrão, mas mantemos a mensagem genérica
  // mesmo em erro de rede para não vazar esse detalhe por um caminho diferente.
  if (error) return { success: false, error: 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.' };
  return { success: true };
}

/**
 * Define uma nova senha para a sessão de recuperação ativa (o clique no link
 * do e-mail já autentica temporariamente o usuário via Supabase Auth).
 */
export async function updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor.' };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Cria uma conta no Supabase Auth + o perfil correspondente em public.users.
 *
 * Usa um client Supabase secundário e isolado (sem persistir sessão) para o
 * signUp: chamar auth.signUp() no client principal trocaria a sessão ativa do
 * chamador para a conta recém-criada — um problema quando um admin já logado
 * está criando a conta de outra pessoa (ex.: convidar um colaborador).
 */
export async function createUserWithProfile(params: {
  email: string;
  password: string;
  name: string;
  tenantId: string;
  role: string;
  isMaster?: boolean;
  isTenantAdmin?: boolean;
}): Promise<{ success: boolean; error?: string; userId?: string; needsEmailConfirmation?: boolean }> {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) {
    return { success: false, error: 'Não foi possível conectar ao servidor.' };
  }

  const isolatedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: authData, error: authError } = await isolatedClient.auth.signUp({
    email: params.email,
    password: params.password,
  });

  if (authError || !authData.user) {
    return { success: false, error: authError?.message || 'Erro ao criar conta de acesso.' };
  }

  const { error: profileError } = await supabase.from('users').insert({
    id: authData.user.id,
    tenant_id: params.tenantId,
    name: params.name,
    email: params.email,
    role: params.role,
    is_master: params.isMaster ?? false,
    is_tenant_admin: params.isTenantAdmin ?? false,
    active: true,
  });

  if (profileError) {
    return { success: false, error: profileError.message };
  }

  return { success: true, userId: authData.user.id, needsEmailConfirmation: !authData.session };
}

/**
 * Liga/desliga o acesso de um usuário a trocar entre empresas clientes (seletor de tenant
 * na Sidebar) — usado no cadastro/edição de membro da equipe. Escrever em `partners`/
 * `tenant_partners` é restrito a master via RLS (is_super_admin()), então só funciona quando
 * quem está chamando é master; a UI que aciona isso (NovoMembroModal/EditarColabModal) já
 * esconde o toggle pra quem não é.
 *
 * Padrão "achar ou criar": cada tenant pode já ter (ou não) uma organização parceira própria
 * auto-vinculada a si mesma (bootstrap de sessões anteriores, nem todo tenant tem) — em vez
 * de assumir que existe, acha ou cria sob demanda. Genérico: funciona pra qualquer tenant,
 * não hardcoded pra nenhum específico.
 */
export async function setUserPartnerTenantAccess(
  userId: string,
  tenantId: string,
  tenantName: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor.' };

  if (!enabled) {
    const { error } = await supabase.from('users').update({ partner_id: null }).eq('id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  try {
    let partnerId: string | null = null;
    const { data: existingPartner } = await supabase
      .from('partners').select('id').eq('tenant_id', tenantId).maybeSingle();

    if (existingPartner?.id) {
      partnerId = existingPartner.id;
    } else {
      const { data: created, error: createErr } = await supabase
        .from('partners').insert({ tenant_id: tenantId, name: `${tenantName} (Parceiro)` })
        .select('id').single();
      if (createErr || !created) return { success: false, error: createErr?.message || 'Falha ao criar organização parceira.' };
      partnerId = created.id;
    }

    const { data: existingLink } = await supabase
      .from('tenant_partners').select('id').eq('tenant_id', tenantId).eq('partner_id', partnerId).maybeSingle();
    if (!existingLink) {
      const { error: linkErr } = await supabase.from('tenant_partners').insert({ tenant_id: tenantId, partner_id: partnerId });
      if (linkErr) return { success: false, error: linkErr.message };
    }

    const { error: userErr } = await supabase.from('users').update({ partner_id: partnerId }).eq('id', userId);
    if (userErr) return { success: false, error: userErr.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro desconhecido ao configurar acesso parceiro.' };
  }
}

/**
 * Fetch all active tenants from database and transform to TenantModules format
 */
export async function fetchTenants() {
  if (!supabase) {
    console.warn('[Tenants] Supabase não está configurado, usando dados padrão');
    return {};
  }

  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, niche, status, modules")
      .eq("status", "Active")
      .order("name", { ascending: true });

    if (error) {
      if (error.code === '42501') {
        console.warn('[Tenants] ⚠️ Sem permissão RLS na tabela tenants — usando módulos demo locais. Execute o SQL de setup no Supabase SQL Editor para habilitar dados reais.');
      } else {
        console.error('[Tenants] ❌ Erro ao carregar tenants:', error.message, error.code);
      }
      return {};
    }

    console.log(`[Tenants] 📦 Rows retornadas pelo Supabase: ${data?.length ?? 0}`, data?.map((t: any) => t.name));

    if (!data || data.length === 0) {
      console.warn('[Tenants] ⚠️ Supabase retornou array vazio — verifique RLS na tabela tenants. Execute no SQL Editor: CREATE POLICY "anon_read_tenants" ON public.tenants FOR SELECT TO anon USING (true);');
      return {};
    }

    const tenantModules: Record<string, any> = {};

    data.forEach((tenant: any) => {
      tenantModules[tenant.name] = tenant.modules || {
        crm: true,
        sdr: tenant.niche === "Master" || tenant.niche === "Tecnologia",
        advDashboard: tenant.niche === "Master"
      };
    });

    console.log('[Tenants] ✅ Carregados do banco de dados:', Object.keys(tenantModules));
    return tenantModules;
  } catch (err) {
    console.error('[Tenants] ❌ Erro ao carregar tenants:', err);
    return {};
  }
}

/**
 * Returns a map of tenant name → tenant UUID for all active tenants
 */
export async function fetchTenantIdMap(): Promise<Record<string, string>> {
  if (!supabase) return {};
  try {
    const { data } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('status', 'Active');
    if (!data) return {};
    return Object.fromEntries(data.map((t: any) => [t.name, t.id]));
  } catch {
    return {};
  }
}

/** Tenant Pluppex (dona comercial do S.P.Y.) — mesmo id fixo já usado em
 * src/pages/marketing/EEmpreendaEditor.tsx para acesso cross-tenant, e
 * exportado (achado M1, auditoria 2026-09-21) pra gatear a exibição do
 * conteúdo "E-EMPREENDA+" nas telas genéricas de Marketing (Formulários,
 * Landing Pages) — antes aparecia pra qualquer tenant, mesmo mostrando dados
 * vazios/quebrando ao salvar pra quem não é a própria Pluppex. */
export const PLUPPEX_TENANT_ID = "27ef95ee-84dd-499e-9f25-cd9baecb5fe4";

export interface SpyLicenseProduct {
  id: string;
  productName: string;
  /** Rótulo do plano extraído do produto (ex.: "Start"), exibido no dropdown. */
  label: string;
  /** Valor persistido em tenants.plan (slug em minúsculas, ex.: "start"). */
  value: string;
  price: number;
}

/**
 * Busca os planos de licença do S.P.Y. a partir do catálogo de produtos real
 * da Pluppex (tabela `products`, módulo Catálogo de Produtos & SKUs) — em vez
 * de uma lista fixa no front, os planos oferecidos no provisionamento de
 * tenant vêm do que a Pluppex de fato cadastrou como produto de licença.
 */
export async function fetchSpyLicenseProducts(): Promise<SpyLicenseProduct[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, price')
      .eq('tenant_id', PLUPPEX_TENANT_ID)
      .eq('active', true)
      .ilike('name', '%S.P.Y%');
    if (error || !data) return [];
    return data
      .map((p: any) => {
        const parts = String(p.name).split('|');
        const tier = (parts.length > 1 ? parts[parts.length - 1] : p.name).trim();
        return {
          id: p.id,
          productName: p.name,
          label: tier,
          value: tier.toLowerCase(),
          price: Number(p.price) || 0,
        };
      })
      .sort((a, b) => a.price - b.price);
  } catch {
    return [];
  }
}

/**
 * Cria um novo tenant parceiro junto com o usuário administrador inicial
 * desse tenant (e-mail/senha reais no Supabase Auth). Passa pelo backend
 * (rota /api/admin/tenant) porque quem define e-mail/senha aqui é o Master,
 * não a própria empresa se auto-cadastrando — a conta precisa nascer já
 * confirmada via Admin API, o que exige a service role key (nunca exposta
 * no client). Isso também evita depender do e-mail de confirmação do
 * Supabase, que saía apontando para a Site URL configurada lá, não para o
 * domínio do S.P.Y..
 */
export async function createTenantAdmin(
  tenantName: string,
  niche: string,
  adminEmail: string,
  adminPassword: string,
  options?: { plan?: string; primaryColor?: string; timezone?: string; modules?: Record<string, boolean>; implementationId?: string }
): Promise<{ success: boolean; error?: string; tenantId?: string; empresaDadosSalvos?: boolean; vinculada?: boolean }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor' };
  try {
    const session = await getSessionWithTimeout();
    if (!session?.access_token) return { success: false, error: 'Sessão inválida.' };
    const res = await fetch('/api/admin/tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ tenantName, niche, adminEmail, adminPassword, ...options }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Erro ao cadastrar empresa.' };
    return { success: true, tenantId: data.tenantId, empresaDadosSalvos: data.empresaDadosSalvos, vinculada: data.vinculada };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro desconhecido' };
  }
}

/**
 * Lista tenants ativos com id/nome/nicho — usado pela tela de gestão de
 * empresas parceiras (editar/excluir), que precisa do id (não só do nome
 * usado por fetchTenants) e do nicho para pré-preencher o formulário de edição.
 */
export async function fetchTenantsDetailed(): Promise<{ id: string; name: string; niche: string; primary_color: string | null; plan: string | null }[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, niche, primary_color, plan')
      .eq('status', 'Active')
      .order('name', { ascending: true });
    if (error || !data) return [];
    return data as { id: string; name: string; niche: string; primary_color: string | null; plan: string | null }[];
  } catch {
    return [];
  }
}

/**
 * Atualiza nome/nicho de um tenant existente.
 */
export async function updateTenantInfo(
  tenantId: string,
  updates: { name?: string; niche?: string }
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor' };
  try {
    const { error } = await supabase.from('tenants').update(updates).eq('id', tenantId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro desconhecido' };
  }
}

/**
 * Atualiza o plano (start/autopilot/autonomous) de um tenant — usado pela tela de Modulos
 * pra controlar quais agentes da Aurora aparecem como inclusos no plano atual do tenant.
 * Ver useToolRegistry (min_plan_tier) e memoria gtech_aurora_spi_evolution_audit.
 */
export async function updateTenantPlan(
  tenantId: string,
  plan: 'start' | 'autopilot' | 'autonomous'
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor' };
  try {
    const { error } = await supabase.from('tenants').update({ plan }).eq('id', tenantId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro desconhecido' };
  }
}

/**
 * Busca só a cor de marca (primary_color) de um tenant — usado pra aplicar o
 * tema visual assim que a sessão troca de tenant ativo (DataContext).
 */
export async function fetchTenantPrimaryColor(tenantId: string): Promise<string | null> {
  if (!supabase || !tenantId) return null;
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('primary_color')
      .eq('id', tenantId)
      .maybeSingle();
    if (error || !data) return null;
    return data.primary_color ?? null;
  } catch {
    return null;
  }
}

/**
 * Atualiza a cor de marca (tema) de um tenant — uma das 4 cores do S.P.Y.
 * (ver src/lib/theme.ts) ou qualquer hex customizado.
 */
export async function updateTenantTheme(
  tenantId: string,
  hex: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor' };
  try {
    const { error } = await supabase.from('tenants').update({ primary_color: hex }).eq('id', tenantId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro desconhecido' };
  }
}

/**
 * supabase.auth.getSession() faz uma chamada de rede para renovar o token
 * quando ele está perto de expirar — se essa chamada travar, tudo que
 * depende dela trava junto sem nunca lançar um erro visível. Corta esse
 * risco com um timeout, em vez de confiar que a chamada sempre resolve.
 */
async function getSessionWithTimeout(timeoutMs = 8000) {
  const result = await Promise.race([
    supabase!.auth.getSession(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Tempo esgotado ao verificar sessão.')), timeoutMs)),
  ]);
  return result.data.session;
}

/**
 * Busca o usuário administrador de um tenant (para a tela de edição poder
 * pré-carregar o e-mail atual antes de permitir trocar e-mail/senha).
 */
export async function fetchTenantAdminUser(
  tenantId: string
): Promise<{ success: boolean; user?: { id: string; email: string; name: string }; error?: string }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor' };
  try {
    const session = await getSessionWithTimeout();
    if (!session?.access_token) return { success: false, error: 'Sessão inválida.' };
    const res = await fetch(`/api/admin/tenant-admin-user/${tenantId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Erro ao buscar administrador.' };
    return { success: true, user: data.user };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro desconhecido' };
  }
}

/**
 * Troca e-mail e/ou senha de login do administrador de um tenant. Passa pelo
 * backend (rota /api/admin/tenant-user/:id/credentials) porque alterar
 * credenciais de OUTRO usuário no Supabase Auth exige a Admin API, que só
 * funciona com a service role key — nunca exposta no client.
 */
export async function updateTenantUserCredentials(
  userId: string,
  updates: { email?: string; password?: string }
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor' };
  try {
    const session = await getSessionWithTimeout();
    if (!session?.access_token) return { success: false, error: 'Sessão inválida.' };
    const res = await fetch(`/api/admin/tenant-user/${userId}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Erro ao atualizar credenciais.' };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro desconhecido' };
  }
}

/**
 * "Exclui" um tenant parceiro. Em vez de um DELETE físico (que órfãos leads,
 * usuários e demais registros ligados por tenant_id), marcamos como Inactive —
 * mesmo campo `status` que fetchTenants já usa para filtrar a lista ativa, então
 * o tenant desaparece da tela imediatamente sem destruir o histórico dele.
 */
export async function deactivateTenant(tenantId: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor' };
  try {
    const { error } = await supabase.from('tenants').update({ status: 'Inactive' }).eq('id', tenantId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro desconhecido' };
  }
}

/**
 * Atualiza os módulos ativos de um tenant no banco de dados
 */
export async function updateTenantModulesInDB(tenantName: string, modules: any) {
  if (!supabase) return { success: false, error: 'Não foi possível conectar ao servidor' };

  try {
    const { error } = await supabase
      .from("tenants")
      .update({ modules })
      .eq("name", tenantName);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[Tenants] ❌ Erro ao salvar módulos:', err);
    return { success: false, error: err };
  }
}
