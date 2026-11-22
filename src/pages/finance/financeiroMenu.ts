import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Inbox, TrendingDown, Waves, CreditCard, PieChart, FolderTree, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Menu do Financeiro em dois modos, compartilhado entre o menu lateral principal e a tela do Financeiro:
 *  - "resumo": a lista curta aparece dentro do menu lateral principal, sob "Financeiro";
 *  - "avancado": a tela do Financeiro abre o submenu completo ao lado.
 */
export type ModoMenuFinanceiro = "resumo" | "avancado";

export interface ItemMenuFinanceiro {
  title: string;
  path: string;
  icon: LucideIcon;
  matchPaths?: string[];
}

const B = "/app/financeiro";

export const ITENS_RESUMO_FINANCEIRO: ItemMenuFinanceiro[] = [
  { title: "Painel Geral", path: `${B}/dashboard`, icon: LayoutDashboard, matchPaths: [`${B}/dashboard`, `${B}/visao-geral`, `${B}/resumo`, `${B}/agenda`, `${B}/busca`] },
  { title: "Receita", path: `${B}/receitas`, icon: Inbox },
  { title: "Despesa", path: `${B}/despesas`, icon: TrendingDown },
  { title: "Fluxo de Caixa", path: `${B}/fluxo-caixa`, icon: Waves },
  { title: "Banco", path: `${B}/bancos`, icon: CreditCard },
  { title: "DRE", path: `${B}/dre`, icon: PieChart },
];
export const ITEM_AVANCADO_FINANCEIRO = { title: "Avançado", icon: Star };
export const ITEM_CONFIG_FINANCEIRO: ItemMenuFinanceiro = {
  title: "Configuração", path: `${B}/contatos`, icon: FolderTree,
  matchPaths: [`${B}/contatos`, `${B}/plano-contas`, `${B}/tags`, `${B}/importar`],
};

const MODO_KEY = "spy_financeiro_modo_menu";
const EVENTO = "spy-financeiro-modo";

function lerModo(): ModoMenuFinanceiro {
  try { return localStorage.getItem(MODO_KEY) === "avancado" ? "avancado" : "resumo"; } catch { return "resumo"; }
}

/** Modo atual do menu do Financeiro; trocar em qualquer lugar atualiza todos que usam o hook. */
export function useModoMenuFinanceiro(): [ModoMenuFinanceiro, (m: ModoMenuFinanceiro) => void] {
  const [modo, setModo] = useState<ModoMenuFinanceiro>(lerModo);
  useEffect(() => {
    const sync = () => setModo(lerModo());
    window.addEventListener(EVENTO, sync);
    return () => window.removeEventListener(EVENTO, sync);
  }, []);
  const escolher = useCallback((m: ModoMenuFinanceiro) => {
    try { localStorage.setItem(MODO_KEY, m); } catch { /* sem storage: vale só nesta sessão */ }
    setModo(m);
    window.dispatchEvent(new Event(EVENTO));
  }, []);
  return [modo, escolher];
}
