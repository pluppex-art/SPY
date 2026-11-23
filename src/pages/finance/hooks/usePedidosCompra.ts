import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { friendlyError } from "../../../lib/friendlyError";
import { useAuth } from "../../../contexts/AuthContext";

export type StatusPedido = "Rascunho" | "Aguardando aprovação" | "Aprovado" | "Recebido" | "Cancelado";

export interface ItemPedido {
  id?: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  category_id: string | null;
}

export interface PedidoCompra {
  id: string;
  tenant_id: string;
  numero: number;
  fornecedor: string;
  contato_id: string | null;
  centro_custo_id: string | null;
  solicitante: string | null;
  data_pedido: string;
  previsao_entrega: string | null;
  status: StatusPedido;
  forma_pagamento: string | null;
  parcelas: number;
  primeiro_vencimento: string | null;
  observacoes: string | null;
  total: number;
  aprovado_por: string | null;
  aprovado_em: string | null;
  recebido_em: string | null;
  lancamento_grupo_id: string | null;
  created_at: string;
  itens: ItemPedido[];
}

export type NovoPedido = Pick<PedidoCompra, "fornecedor" | "contato_id" | "centro_custo_id" | "solicitante" | "data_pedido" | "previsao_entrega" | "forma_pagamento" | "parcelas" | "primeiro_vencimento" | "observacoes"> & { itens: ItemPedido[] };

export const totalDosItens = (itens: ItemPedido[]) =>
  Math.round(itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0) * 100) / 100;

/** Pedidos de compra da empresa ativa (com os itens) e as ações de criar, editar, mudar a situação e excluir. */
export function usePedidosCompra() {
  const { activeTenantId: tenantId } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoCompra[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!tenantId || !supabase) { setPedidos([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("finance_pedidos_compra").select("*").eq("tenant_id", tenantId).order("numero", { ascending: false }).limit(1000);
    if (error) { toast.error(`Não foi possível carregar os pedidos: ${friendlyError(error)}`); setLoading(false); return; }
    const ids = (data || []).map((p: any) => p.id);
    let itens: any[] = [];
    if (ids.length > 0) {
      const r = await supabase.from("finance_pedido_compra_itens").select("*").eq("tenant_id", tenantId).in("pedido_id", ids).limit(20000);
      itens = r.data || [];
    }
    setPedidos((data || []).map((p: any) => ({
      ...p,
      total: Number(p.total) || 0,
      itens: itens.filter((i) => i.pedido_id === p.id).map((i) => ({ id: i.id, descricao: i.descricao, quantidade: Number(i.quantidade) || 0, valor_unitario: Number(i.valor_unitario) || 0, category_id: i.category_id ?? null })),
    })));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { carregar(); }, [carregar]);

  const gravarItens = async (pedidoId: string, itens: ItemPedido[]) => {
    await supabase.from("finance_pedido_compra_itens").delete().eq("pedido_id", pedidoId);
    const linhas = itens.filter((i) => i.descricao.trim()).map((i) => ({ tenant_id: tenantId, pedido_id: pedidoId, descricao: i.descricao.trim(), quantidade: Number(i.quantidade) || 1, valor_unitario: Number(i.valor_unitario) || 0, category_id: i.category_id }));
    if (linhas.length > 0) {
      const { error } = await supabase.from("finance_pedido_compra_itens").insert(linhas);
      if (error) throw error;
    }
  };

  const criar = async (novo: NovoPedido): Promise<PedidoCompra | null> => {
    if (!tenantId || !supabase) return null;
    try {
      // Número sequencial por empresa; se dois pedidos saírem juntos, a regra do banco recusa o repetido e tentamos o próximo.
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        const { data: ult } = await supabase.from("finance_pedidos_compra").select("numero").eq("tenant_id", tenantId).order("numero", { ascending: false }).limit(1);
        const numero = (ult?.[0]?.numero ?? 0) + 1;
        const { itens, ...resto } = novo;
        const { data, error } = await supabase.from("finance_pedidos_compra").insert({ ...resto, tenant_id: tenantId, numero, total: totalDosItens(itens) }).select("*").maybeSingle();
        if (error) { if ((error as any).code === "23505") continue; throw error; }
        if (data) await gravarItens(data.id, itens);
        await carregar();
        toast.success(`Pedido #${numero} criado.`);
        return data as any;
      }
      toast.error("Não foi possível gerar o número do pedido. Tente de novo.");
    } catch (err) { toast.error(`Erro ao salvar o pedido: ${friendlyError(err)}`); }
    return null;
  };

  const atualizar = async (id: string, patch: Partial<NovoPedido>): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { itens, ...resto } = patch;
      const corpo: any = { ...resto, updated_at: new Date().toISOString() };
      if (itens) corpo.total = totalDosItens(itens);
      const { error } = await supabase.from("finance_pedidos_compra").update(corpo).eq("id", id);
      if (error) throw error;
      if (itens) await gravarItens(id, itens);
      await carregar();
      return true;
    } catch (err) { toast.error(`Erro ao salvar o pedido: ${friendlyError(err)}`); return false; }
  };

  const mudarStatus = async (id: string, status: StatusPedido, extra: Record<string, any> = {}): Promise<boolean> => {
    if (!supabase) return false;
    const { error } = await supabase.from("finance_pedidos_compra").update({ status, updated_at: new Date().toISOString(), ...extra }).eq("id", id);
    if (error) { toast.error(`Não foi possível atualizar o pedido: ${friendlyError(error)}`); return false; }
    await carregar();
    return true;
  };

  const excluir = async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    const { error } = await supabase.from("finance_pedidos_compra").delete().eq("id", id);
    if (error) { toast.error(`Não foi possível excluir: ${friendlyError(error)}`); return false; }
    await carregar();
    return true;
  };

  return { pedidos, loading, recarregar: carregar, criar, atualizar, mudarStatus, excluir };
}
