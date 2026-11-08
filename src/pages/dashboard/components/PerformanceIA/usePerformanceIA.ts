import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useData } from "../../../../contexts/DataContext";
import { apiFetch } from "../../../../lib/apiClient";
import { parseCurrencyBR } from "../../../../lib/utils";
import { getMRR } from "../../../../lib/revenueMetrics";

type AiRecommendation = any;

export function usePerformanceIA() {
  const { leads, financeEntries, contracts } = useData();

  const [isSimulating, setIsSimulating] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<AiRecommendation[]>([]);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const currentMRR = useMemo(() => {
    if (contracts && contracts.length > 0) {
      return getMRR(contracts);
    }

    // Fallback: estimativa via leads (se MRR for nulo)
    return leads
      .filter((l: any) => l.status === "Fechado")
      .reduce((acc, l: any) => acc + parseCurrencyBR(l.value), 0) / 12; // Exemplo tosco
  }, [contracts, leads]);

  const currentCAC = useMemo(() => {
    const totalSpent = financeEntries
      .filter(
        (f: any) =>
          f.type === "Pagar" &&
          f.status === "Pago" &&
          f.category?.toLowerCase().includes("marketing")
      )
      .reduce((acc: number, f: any) => acc + f.value, 0);

    return leads.length > 0 ? totalSpent / leads.length : 0;
  }, [financeEntries, leads]);

  const currentLTV = currentMRR * 12; // Assumindo 1 ano de LTV pra fins de simulação

  const simulationData = useMemo(() => {
    if (currentMRR === 0 && currentCAC === 0) return [];

    return [
      { name: "Atual", mrr: currentMRR, cac: currentCAC, ltv: currentLTV },
      {
        name: "Simulação A (+20% MRR)",
        mrr: currentMRR * 1.2,
        cac: currentCAC * 0.9,
        ltv: currentLTV * 1.1,
      },
      {
        name: "Simulação B (+40% MRR)",
        mrr: currentMRR * 1.4,
        cac: currentCAC * 1.1,
        ltv: currentLTV * 1.3,
      },
    ];
  }, [currentMRR, currentCAC, currentLTV]);

  const runSimulation = async () => {
    setIsSimulating(true);
    try {
      const dealsCount = leads.filter((l: any) => l.status === "Fechado").length;

      const response = await apiFetch("/api/ai/performance-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mrr: currentMRR,
          cac: currentCAC,
          ltv: currentLTV,
          leadsCount: leads.length,
          dealsCount,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiRecommendations(Array.isArray(data) ? data : []);
        setAiUnavailable(false);
      } else {
        setAiRecommendations([]);
        setAiUnavailable(true);
      }
    } catch {
      setAiRecommendations([]);
      setAiUnavailable(true);
    } finally {
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    if (leads.length > 0 && aiRecommendations.length === 0) runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.length]);

  return {
    leads,
    financeEntries,
    contracts,
    isSimulating,
    aiRecommendations,
    aiUnavailable,
    simulationData,
    runSimulation,
    currentCAC,
    currentLTV,
  };
}

