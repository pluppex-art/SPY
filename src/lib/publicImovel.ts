import { supabase } from "./supabase";

export interface PublicImovel {
  id: string;
  titulo: string;
  tipo: string;
  operacao: string;
  status: string;
  valor: number;
  bairro: string;
  cidade: string;
  area: number;
  quartos: number;
  banheiros: number;
  vagas: number;
  descricao: string | null;
  corretorNome: string | null;
  corretorTelefone: string | null;
  corretorEmail: string | null;
  corretorCreci: string | null;
  corretorSlug: string | null;
}

// Busca um imóvel pelo id via RPC SECURITY DEFINER (get_public_imovel) — nunca
// faz select direto em products/imobiliario_corretores, então não
// depende de RLS/grants anon nessas tabelas. Cada chamada também incrementa
// o contador `visitas` do imóvel no banco (é a mesma métrica exibida na
// tela interna de Produtos (tipo Imóvel)).
export async function fetchPublicImovel(id: string): Promise<PublicImovel | null> {
  if (!supabase || !id) return null;
  const { data, error } = await supabase.rpc("get_public_imovel", { p_id: id });
  if (error) {
    console.error("[publicImovel] erro ao buscar imóvel:", error.message);
    return null;
  }
  return (data as PublicImovel) ?? null;
}
