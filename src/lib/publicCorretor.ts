import { supabase } from "./supabase";

export interface PublicCorretorImovel {
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
}

export interface PublicCorretorPortfolio {
  nome: string;
  creci: string | null;
  telefone: string | null;
  email: string | null;
  especialidade: string;
  bio: string | null;
  avaliacao: number;
  totalVendas: number;
  imoveis: PublicCorretorImovel[];
}

// Busca o portfólio de um corretor pelo slug público via RPC SECURITY DEFINER
// (get_public_corretor_portfolio) — nunca faz select direto em
// imobiliario_corretores/products, então não depende de RLS/grants
// anon nessas tabelas para funcionar com segurança.
export async function fetchPublicCorretorPortfolio(slug: string): Promise<PublicCorretorPortfolio | null> {
  if (!supabase || !slug) return null;
  const { data, error } = await supabase.rpc("get_public_corretor_portfolio", { p_slug: slug });
  if (error) {
    console.error("[publicCorretor] erro ao buscar portfólio:", error.message);
    return null;
  }
  return (data as PublicCorretorPortfolio) ?? null;
}
