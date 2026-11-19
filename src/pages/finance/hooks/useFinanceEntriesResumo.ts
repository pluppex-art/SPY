import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { fetchAllRows } from "../../../lib/pgrst";
import { useAuth } from "../../../contexts/AuthContext";

export type StatusFinanceiro = "Pago" | "Parcial" | "Pendente" | "Atrasado";

export interface LancamentoResumo {
  id: string;
  description: string;
  category: string | null;
  status: string;
  value: number;
  type: "Pagar" | "Receber";
  date: string | null; // YYYY-MM-DD (date_normalized)
  counterparty: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  payment_method: string | null;
}

const COLUNAS =
  "id,description,category,status,value,type,date_normalized,counterparty,installment_group_id,installment_number,installment_total,payment_method";

/** Hoje no fuso local, no formato YYYY-MM-DD (mesmo formato de date_normalized). */
export function hojeISO(ref: Date = new Date()): string {
  const m = String(ref.getMonth() + 1).padStart(2, "0");
  const d = String(ref.getDate()).padStart(2, "0");
  return `${ref.getFullYear()}-${m}-${d}`;
}

/** Pago / Pendente (vence hoje ou depois) / Atrasado (venceu e não foi pago). */
export function statusDoLancamento(l: Pick<LancamentoResumo, "status" | "date">, hoje = hojeISO()): StatusFinanceiro {
  if (l.status === "Pago") return "Pago";
  if (l.date && l.date < hoje) return "Atrasado";
  return "Pendente";
}

/**
 * Carrega os lançamentos do tenant numa projeção estreita — alimenta as telas
 * de resumo (Central, Agenda, Compras). Tudo vem de `finance_entries`: lançou
 * uma vez, aparece em todas as áreas.
 */
export function useFinanceEntriesResumo() {
  const { activeTenantId: tenantId, activeFilialId } = useAuth();
  const [rows, setRows] = useState<LancamentoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!supabase || !tenantId) return;
    setLoading(true);
    setErro(null);
    try {
      const data = await fetchAllRows<any>(() => {
        let q = supabase!.from("finance_entries").select(COLUNAS).eq("tenant_id", tenantId).order("id");
        if (activeFilialId) q = q.eq("filial_id", activeFilialId);
        return q;
      });
      setRows(
        data.map((r: any) => ({
          id: r.id,
          description: r.description || "",
          category: r.category ?? null,
          status: r.status,
          value: Number(r.value) || 0,
          type: r.type,
          date: r.date_normalized ?? null,
          counterparty: r.counterparty ?? null,
          installment_group_id: r.installment_group_id ?? null,
          installment_number: r.installment_number ?? null,
          installment_total: r.installment_total ?? null,
          payment_method: r.payment_method ?? null,
        })),
      );
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar os lançamentos.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, activeFilialId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const hoje = useMemo(() => hojeISO(), []);
  return { rows, loading, erro, recarregar: carregar, hoje };
}
