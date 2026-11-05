import React, { useEffect } from "react";
import { toast } from "sonner";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
import { modulosDoCargo } from "../lib/cargosUsuario";

// Mesmos aliases do Sidebar/MobileNav para chaves de módulo equivalentes.
const MODULE_ALIASES: Record<string, string[]> = {
  automotivo: ["automotivo", "concessionaria"],
  concessionaria: ["automotivo", "concessionaria"],
  solar: ["solar", "energia-solar"],
  "energia-solar": ["solar", "energia-solar"],
  clinica: ["clinica", "clinicas"],
};

function ModuleDisabledRedirect() {
  useEffect(() => {
    toast.info("Este módulo não está habilitado para a sua empresa.");
  }, []);
  return <Navigate to="/app" replace />;
}

export function ProtectedRoute({
  children,
  requireMaster = false,
  requirePartner = false,
  requireTenantAdmin = false,
  requireModule,
}: {
  children: React.ReactElement;
  requireMaster?: boolean;
  /** G-Tech (master) ou organização parceira (ex.: Pluppex) — ver public.users.partner_id. */
  requirePartner?: boolean;
  /** Admin do próprio tenant (isTenantAdmin) ou master — telas que configuram
   * cargos/permissões/governança financeira do próprio tenant, não só "tem sessão". */
  requireTenantAdmin?: boolean;
  /** Chave de módulo (ex.: "clinica", "educacao") — bloqueia a rota pra quem
   * tem cargo com módulos restritos e esse módulo não incluso. Mesma lógica
   * já usada pra esconder item de menu no Sidebar.tsx, aplicada agora também
   * na rota (achado CR3: dado sensível de paciente/aluno era só "escondido
   * do menu", mas acessível digitando a URL). */
  requireModule?: string;
}) {
  const { user, authLoading, allTenantModules, activeTenantName } = useAuth();
  const { cargos } = useData();
  const location = useLocation();

  // Aguarda a sessão do Supabase Auth ser resolvida (getSession) antes de
  // decidir — evita um redirect falso para /login em cada refresh de página
  // enquanto a sessão real ainda está sendo carregada.
  if (authLoading) {
    return null;
  }

  if (!user) {
    // If not logged in, redirect to login page with the return url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Defesa em profundidade: o RLS já bloqueia dados de outros tenants no banco,
  // mas rotas administrativas de plataforma (ex.: /app/admin) não deveriam nem
  // renderizar pra quem não é master — sem isso, a única barreira era a RLS.
  if (requireMaster && !user.isMaster) {
    return <Navigate to="/app" replace />;
  }

  // Mesma defesa em profundidade para páginas de parceiros (ex.: /app/parceiros):
  // só G-Tech (master) e organizações parceiras (partner_id preenchido, hoje só
  // a Pluppex) devem sequer renderizar a tela — o resto já é barrado pela RLS
  // (tenant_partners) e pela RPC platform_metrics_overview, mas sem essa guarda
  // de rota qualquer usuário logado via qualquer tenant chegava a montar a página.
  if (requirePartner && !user.isMaster && !user.partnerId) {
    return <Navigate to="/app" replace />;
  }

  // CR1/A2 (auditoria 2026-09-21): telas que configuram cargos, permissões
  // por módulo, bloqueio de período financeiro, auditoria financeira e squads
  // não tinham nenhum gate — qualquer colaborador do tenant podia abri-las e,
  // no caso de Cargos/Permissões, se autoconceder qualquer módulo. A RLS
  // também passou a exigir is_tenant_admin/is_master pra escrita nessas
  // tabelas (ver migrations 20260921_cr1_*), isso aqui é a defesa em
  // profundidade equivalente no frontend.
  if (requireTenantAdmin && !user.isMaster && !user.isTenantAdmin) {
    return <Navigate to="/app" replace />;
  }

  if (requireModule && !user.isMaster && !user.partnerId) {
    // Só bloqueia quando o tenant já foi carregado — evita falso bloqueio no refresh
    // enquanto fetchTenants ainda não respondeu.
    const tenantName = (activeTenantName || user.tenantName || "").toLowerCase();
    const key = Object.keys(allTenantModules).find((k) => k.toLowerCase() === tenantName);
    if (key) {
      const mods = allTenantModules[key] || {};
      const aliases = MODULE_ALIASES[requireModule] || [requireModule];
      if (!aliases.some((a) => !!mods[a])) return <ModuleDisabledRedirect />;
    }
  }

  if (requireModule && !user.isMaster) {
    const cargoModulos: string[] | null = modulosDoCargo(user, cargos as any[]);
    const aliasesCargo = MODULE_ALIASES[requireModule] || [requireModule];
    if (cargoModulos && !cargoModulos.some((m) => aliasesCargo.includes(m))) {
      return <Navigate to="/app" replace />;
    }
  }

  return children;
}
