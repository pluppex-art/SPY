import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import type { PropostaClienteBranding } from "../../pages/crm/utils/proposalClientPdf";

/** Marca/empresa do tenant ativo para renderizar o documento do cliente (mesma regra do editor). */
export function usePropostaBranding(): PropostaClienteBranding {
  const { tenantPrimaryColor, appSettings } = useData();
  const { activeTenantName } = useAuth();
  const empresaDados = appSettings?.empresa_dados || {};
  return {
    brandColor: tenantPrimaryColor || "#2563EB",
    tenantName: empresaDados?.nomeFantasia || empresaDados?.razaoSocial || activeTenantName || "Empresa Proponente",
    empresaDados,
    logoUrl: empresaDados?.logoUrl,
  };
}
