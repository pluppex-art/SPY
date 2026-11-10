import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./apiClient";

// Níveis de fidelidade dos clientes da empresa ativa (Bronze/Prata/Ouro...), calculados no servidor pelas compras na
// janela configurada. Ver server/loyalty.ts e Configurações › CRM › Fidelidade.

export interface FidelidadeNivel { nome: string; cor: string; min: number; clientes: number }
export interface FidelidadeConfig { enabled: boolean; janela: "mes" | "12m" | "total"; fonte: "vendas" | "financeiro"; niveis: { nome: string; min: number; cor: string }[] }
export interface FidelidadeData {
  config: FidelidadeConfig;
  porCliente: Record<string, { nivel: string; cor: string; compras: number; valor: number }>;
  resumo: FidelidadeNivel[];
}

export function useFidelidade(tenantId: string | null | undefined) {
  const [data, setData] = useState<FidelidadeData | null>(null);
  const [loading, setLoading] = useState(false);
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;
  const reload = useCallback(async () => {
    if (!tenantId) return;
    const t = tenantId;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/crm/fidelidade?tenantId=${encodeURIComponent(t)}`);
      const j = r.ok ? await r.json() : null;
      if (tenantRef.current === t) setData(j);
    } catch { if (tenantRef.current === t) setData(null); } finally { if (tenantRef.current === t) setLoading(false); }
  }, [tenantId]);
  useEffect(() => { setData(null); void reload(); }, [reload]);
  return { data, loading, reload };
}

export const JANELA_LABEL: Record<string, string> = { mes: "no mês", "12m": "nos últimos 12 meses", total: "no histórico" };
