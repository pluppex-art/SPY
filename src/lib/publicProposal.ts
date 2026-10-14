import { supabase } from "./supabase";

export interface PublicProposalItem {
  productName: string;
  quantidade: number;
  precoUnitario: number;
  billingType?: string | null;
}

export interface PublicProposalEmpresaDados {
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  inscricaoEstadual?: string;
  endereco?: string;
  emailContato?: string;
  telefoneContato?: string;
  website?: string;
  logoUrl?: string;
}

export interface PublicProposal {
  id?: string;
  titulo: string;
  cliente: string | null;
  valor: number | null;
  status: string | null;
  validade: string | null;
  tipo: string;
  conteudoTexto: string | null;
  criadaEm: string;
  vendedor?: string | null;
  tenantId?: string | null;
  tenantName?: string | null;
  tenantPrimaryColor?: string | null;
  tenantNiche?: string | null;
  empresaDados?: PublicProposalEmpresaDados | null;
  itens: PublicProposalItem[];
}

// Busca uma proposta pelo view_token público.
// 1º Tenta via endpoint de backend (/api/public-proposal/:token) que traz o branding completo do Tenant.
// 2º Fallback para RPC RPC SECURITY DEFINER (get_public_proposal) se a API não estiver respondendo.
export async function fetchPublicProposal(token: string): Promise<PublicProposal | null> {
  if (!token) return null;

  try {
    const res = await fetch(`/api/public-proposal/${token}`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.titulo) {
        return data as PublicProposal;
      }
    }
  } catch (err) {
    console.warn("[publicProposal] API route indisponível, tentando RPC direto...", err);
  }

  // Fallback via RPC Supabase
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("get_public_proposal", { p_token: token });
    if (error) {
      console.error("[publicProposal] erro ao buscar proposta via RPC:", error.message);
      return null;
    }
    return (data as PublicProposal) ?? null;
  } catch (rpcErr) {
    console.error("[publicProposal] RPC falhou:", rpcErr);
    return null;
  }
}

export async function acceptPublicProposal(
  token: string,
  clientData?: { clientName?: string; clientDoc?: string }
): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(`/api/public-proposal/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientData || {}),
    });
    if (res.ok) {
      return true;
    }
  } catch (err) {
    console.warn("[publicProposal] Falha ao enviar aceite via API:", err);
  }
  return false;
}
