import { useEffect, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";
import { ehDepartamentoImplementacao } from "../implementationOs";

/** O tenant ativo tem o departamento "Implementação" na Ordem de Serviço? Então o trabalho de implementar
 * vive na OS, e o menu/página de Implementações do CRM não precisa existir como um segundo lugar. */
export function useUsaOsImplementacao(): boolean {
  const { activeTenantId } = useAuth();
  const [usa, setUsa] = useState(false);

  useEffect(() => {
    let vivo = true;
    setUsa(false);
    if (!supabase || !activeTenantId) return;
    supabase
      .from("os_departamentos")
      .select("nome")
      .eq("tenant_id", activeTenantId)
      .eq("ativo", true)
      .then(({ data }) => { if (vivo) setUsa((data ?? []).some(d => ehDepartamentoImplementacao(d.nome))); });
    return () => { vivo = false; };
  }, [activeTenantId]);

  return usa;
}
