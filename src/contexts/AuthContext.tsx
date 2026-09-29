import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { supabase, fetchTenants, fetchTenantIdMap, fetchUserProfile, updateTenantModulesInDB } from "../lib/supabase";

export type TenantNiche = "Master" | "Solar" | "Imobiliária" | "Clínica" | "Tecnologia" | "Parceira";

export interface UserSession {
  /** public.users.id — ausente em sessões demo (sem Supabase Auth real). */
  id?: string;
  name: string;
  email: string;
  role: string;
  tenantId?: string;
  tenantName: string;
  tenantNiche: TenantNiche;
  isMaster: boolean;
  /** Admin master do PRÓPRIO tenant (distinto de isMaster, que é global/plataforma) —
   *  origem: public.users.is_tenant_admin. Controla quem pode trocar de filial. */
  isTenantAdmin?: boolean;
  /** Preenchido só para usuários de organizações parceiras (G-Tech, Pluppex Holding,
   *  outras parceiras) — origem: public.users.partner_id / public.partners. */
  partnerId?: string;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  twoFactorEnabled?: boolean;
  preferences?: Record<string, any>;
}

export type TenantModules = Record<string, boolean>;

interface AuthContextType {
  user: UserSession | null;
  authLoading: boolean;
  login: (user: UserSession) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updatePreferences: (partial: Record<string, any>) => Promise<void>;
  isModuleEnabled: (moduleName: keyof TenantModules) => boolean;
  updateTenantModules: (tenantName: string, modules: TenantModules) => Promise<void>;
  getTenantModules: (tenantName: string) => TenantModules;
  allTenantModules: Record<string, TenantModules>;
  tenantIdMap: Record<string, string>;
  /** Tenant "ativo" na sessão — igual ao tenant do usuário logado, a menos que um
   *  master tenha trocado de cliente via switchTenant(). */
  activeTenantId?: string;
  activeTenantName?: string;
  switchTenant: (id: string, name: string) => void;
  /** Filial ativa dentro do tenant ativo — null = "Todas as filiais" (sem filtro). */
  activeFilialId: string | null;
  activeFilialName: string | null;
  switchFilial: (filial: { id: string; name: string } | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Sessões demo (Acesso Demonstração) não passam pelo Supabase Auth — não há
// JWT/cookie real para o supabase-js persistir sozinho entre reloads. Guardamos
// aqui como fallback (sessionStorage, não localStorage: some ao fechar a aba)
// para essas sessões, e como rede de segurança caso o client do Supabase não
// esteja configurado no ambiente.
const SPY_SESSION_KEY = "spy_user_session";

function readSavedSession(): UserSession | null {
  try {
    const raw = sessionStorage.getItem(SPY_SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch {
    return null;
  }
}

// Módulos padrão dos tenants demo — carregados localmente como fallback quando Supabase não está acessível.
// "G-Tech Master" era o tenant master original (pré-multi-tenant real); excluído
// em 2026-09-22 — Pluppex é hoje a dona comercial/operadora da plataforma (ver
// PLUPPEX_TENANT_ID em lib/supabase.ts), então assume o papel de fallback aqui.
const DEFAULT_TENANT_MODULES: Record<string, TenantModules> = {
  "PLUPPEX DIGITAL MACHINES LTDA": {
    crm: true, sdr: true, advDashboard: true, financeiro: true, marketing: true,
    educacao: true, clinica: true, produtividade: true, rh: true, bi: true,
    engajamento: true, catalogo: true, dev: true, aurora: true
  },
  "SolarCorp Engenharia": {
    crm: true, financeiro: true, produtividade: true, marketing: true, bi: true, rh: true, engajamento: true
  },
  "Imobiliária Prime": {
    crm: true, financeiro: true, produtividade: true, marketing: true, bi: true, rh: true, catalogo: true, imobiliaria: true
  },
  "Clínica Vida": {
    clinica: true, crm: true, financeiro: true, produtividade: true, rh: true, engajamento: true, bi: true
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  // Começa "true" até a sessão do Supabase Auth (getSession) ser resolvida —
  // evita redirecionar para /login por uma fração de segundo em cada refresh
  // enquanto a sessão real (cookie/localStorage do próprio supabase-js) carrega.
  const [authLoading, setAuthLoading] = useState(true);

  // Estado inicial = só o fallback local, sempre substituído pelos tenants reais do Supabase
  const [allTenantModules, setAllTenantModules] = useState<Record<string, TenantModules>>(DEFAULT_TENANT_MODULES);
  // tenantIdMap: name → UUID (ex: "PLUPPEX DIGITAL MACHINES LTDA" → "27ef95ee-...")
  const [tenantIdMap, setTenantIdMap] = useState<Record<string, string>>({});

  // Override de tenant/filial "ativos" — só divergem do tenant/sem-filial do próprio
  // usuário quando um master troca de cliente (switchTenant) ou um admin do tenant
  // troca de filial (switchFilial). Resetados sempre que a sessão muda (login/logout).
  const [tenantOverride, setTenantOverride] = useState<{ id: string; name: string } | null>(null);
  const [filialOverride, setFilialOverride] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setTenantOverride(null);
    setFilialOverride(null);
  }, [user?.id]);

  const activeTenantId = tenantOverride?.id ?? user?.tenantId;
  const activeTenantName = tenantOverride?.name ?? user?.tenantName;
  const activeFilialId = filialOverride?.id ?? null;
  const activeFilialName = filialOverride?.name ?? null;

  // Master troca pra qualquer tenant; usuário de organização parceira (partnerId setado)
  // só troca pra tenants vinculados em tenant_partners — RLS em `tenants` (has_tenant_access)
  // já garante isso no fetchTenantIdMap() que popula as opções, então aqui só bloqueia quem
  // não tem nenhum dos dois papéis.
  const switchTenant = (id: string, name: string) => {
    if (!user?.isMaster && !user?.partnerId) return;
    setTenantOverride(id === user.tenantId ? null : { id, name });
    setFilialOverride(null);
  };

  const switchFilial = (filial: { id: string; name: string } | null) => {
    if (!(user?.isMaster || user?.isTenantAdmin)) return;
    setFilialOverride(filial);
  };

  // Fonte de verdade da sessão: Supabase Auth (JWT real), não mais localStorage
  // próprio. O localStorage usado internamente pelo supabase-js já persiste a
  // sessão entre reloads — não duplicamos esse estado aqui.
  useEffect(() => {
    if (!supabase) {
      setUser(readSavedSession());
      setAuthLoading(false);
      return;
    }

    let active = true;

    const applySession = async (userId: string | undefined) => {
      if (!userId) {
        // Sem sessão real do Supabase Auth (JWT) — NUNCA cair pro objeto salvo em
        // sessionStorage aqui: esse objeto é só um cache de conveniência (ver
        // login()) e não tem verificação nenhuma por trás. Confiar nele sem uma
        // sessão real permitiria a qualquer um escrever
        // sessionStorage.setItem('spy_user_session', '{"isMaster":true,...}')
        // no console do navegador e a UI passar a tratar como admin (RLS ainda
        // bloquearia o acesso a dado real, mas nenhuma tela/ação client-side
        // deveria confiar nisso).
        if (active) setUser(null);
        return;
      }
      const profile = await fetchUserProfile(userId);
      if (!active) return;
      setUser(profile.success ? (profile.user as UserSession) : null);
    };

    supabase.auth.getSession().then(async ({ data }) => {
      await applySession(data.session?.user?.id);
      if (active) setAuthLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user?.id);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Carrega os tenants e as configurações de módulos do banco
  useEffect(() => {
    const loadTenantsFromDB = async () => {
      console.log('[AuthContext] 🔄 Carregando tenants do banco de dados (sempre)...');
      const [dbTenants, idMap] = await Promise.all([fetchTenants(), fetchTenantIdMap()]);

      if (Object.keys(dbTenants).length > 0) {
        console.log('[AuthContext] ✅ Tenants do banco carregados:', Object.keys(dbTenants));
        // Antes injetava incondicionalmente um "G-Tech Master" fixo aqui, mesmo
        // depois do tenant real ter sido excluído — fazia um tenant fantasma
        // reaparecer em todo dropdown/seletor de tenant (QualificationBlock,
        // NewLeadModal) pra sempre, em toda sessão. Os tenants reais do banco já
        // vêm completos em `dbTenants` — nenhum merge extra é necessário.
        setAllTenantModules(dbTenants);
      } else {
        console.warn('[AuthContext] ⚠️ Nenhum tenant encontrado no banco — usando módulos padrão (fallback) até o Supabase responder');
      }

      if (Object.keys(idMap).length > 0) {
        setTenantIdMap(idMap);
      }
    };

    loadTenantsFromDB();
  }, []);

  const login = (session: UserSession) => {
    // A autenticação real (supabase.auth.signInWithPassword/signUp) já aconteceu
    // em signIn()/registerPartner() antes de chamar login() — aqui só refletimos
    // o perfil resolvido no estado local; onAuthStateChange mantém a sessão
    // sincronizada em refreshes futuros. Também guardamos localmente para que
    // sessões demo (sem JWT real do Supabase) sobrevivam a um reload da página.
    sessionStorage.setItem(SPY_SESSION_KEY, JSON.stringify(session));
    setUser(session);
  };

  const logout = () => {
    sessionStorage.removeItem(SPY_SESSION_KEY);
    // Tokens do Google (GIS) e caches por tenant não devem sobreviver ao logout do SPY.
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("axis_google_token:")).forEach((k) => localStorage.removeItem(k));
      Object.keys(sessionStorage).filter((k) => k.startsWith("spy_cache:")).forEach((k) => sessionStorage.removeItem(k));
    } catch { /* storage indisponível */ }
    setUser(null);
    supabase?.auth.signOut();
  };

  // Re-busca o perfil em public.users — usado depois que uma tela (ex.: Meu
  // Perfil) grava mudanças direto na tabela, pra refletir em todo o app
  // (Topbar etc.) sem duplicar o dado em localStorage/eventos customizados.
  const refreshUser = async () => {
    if (!user?.id) return;
    const profile = await fetchUserProfile(user.id);
    if (profile.success) setUser(profile.user as UserSession);
  };

  // Preferências de UI por usuário (tema, sons, colunas de kanban, etc.) —
  // gravadas em public.users.preferences, nunca em localStorage.
  const updatePreferences = async (partial: Record<string, any>) => {
    if (!user) return;
    const merged = { ...(user.preferences || {}), ...partial };
    setUser({ ...user, preferences: merged });
    if (!supabase || !user.id) return;
    const { error } = await supabase.from("users").update({ preferences: merged }).eq("id", user.id);
    if (error) console.error('[AuthContext] Falha ao salvar preferências:', error.message);
  };

  const getTenantModules = (tenant: string): TenantModules => {
    // Match exato (case-insensitive) apenas — um match por substring (.includes) permitia que
    // tenants com nomes parecidos colidissem (ex.: "Solar" e "SolarCorp Engenharia" seriam
    // tratados como o mesmo tenant), vazando módulos de um cliente para outro.
    const keys = Object.keys(allTenantModules);
    const matchedKey = keys.find(k => k.toLowerCase() === tenant.toLowerCase());
    if (matchedKey) {
      return allTenantModules[matchedKey];
    }
    return { crm: true, sdr: false, advDashboard: false };
  };

  const isModuleEnabled = (moduleName: keyof TenantModules): boolean => {
    if (!user) return false;
    // Master também respeita o módulo real do próprio tenant — antes havia um bypass
    // incondicional aqui, o que fazia o toggle de módulos em "Empresas Parceiras" nunca
    // refletir no próprio sidebar de quem está testando (sempre master). Acesso
    // administrativo (Painel G-Tech, Configurações) não depende de isModuleEnabled,
    // então master não perde acesso a essas telas por causa disso. Usa o tenant ATIVO
    // (activeTenantName) para respeitar os módulos do cliente que o master estiver
    // visualizando no momento, não necessariamente o seu próprio tenant de login.
    const modules = getTenantModules(activeTenantName || user.tenantName);
    return !!modules[moduleName];
  };

  const updateTenantModules = async (tenant: string, modules: TenantModules) => {
    // 1. Atualiza o estado local para feedback imediato na UI
    setAllTenantModules(prev => {
      const keys = Object.keys(prev);
      const matchedKey = keys.find(k => k.toLowerCase() === tenant.toLowerCase()) || tenant;
      return {
        ...prev,
        [matchedKey]: modules
      };
    });

    // 2. Persiste no banco de dados (Supabase)
    const result = await updateTenantModulesInDB(tenant, modules);

    if (!result.success) {
      console.error('[AuthContext] Falha ao persistir módulos no banco');
    }
  };

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout, refreshUser, updatePreferences, isModuleEnabled, updateTenantModules, getTenantModules, allTenantModules, tenantIdMap, activeTenantId, activeTenantName, switchTenant, activeFilialId, activeFilialName, switchFilial }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
