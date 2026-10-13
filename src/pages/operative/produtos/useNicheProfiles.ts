import { useMemo } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { NICHE_PROFILES, resolveNicheProfiles, type NicheProfile } from "./nicheProfiles";

/** Perfis de nicho ativos do tenant (módulos habilitados + tenantNiche), com referência estável. */
export function useNicheProfiles(): NicheProfile[] {
  const { user, isModuleEnabled } = useAuth();
  const niche = user?.tenantNiche;
  const active = resolveNicheProfiles(isModuleEnabled as (k: string) => boolean, niche);
  const sig = active.map(p => p.key).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => sig.split("|").filter(Boolean).map(k => NICHE_PROFILES[k]), [sig]);
}
