import { AbasPagina } from "../../../components/ui/abas-pagina";
import { Gauge, Map, Target, AlertTriangle, Brain, LineChart, Users, Unlink } from "lucide-react";

// Tabs da Central de Receita — pedido explícito do usuário: trocar as abas
// antigas do Dashboard (Comercial/Marketing/Retenção/BI, ver
// DashboardActionsTabs.tsx — mantidas intactas e com seu próprio tipo porque
// o Dashboard.tsx antigo, não roteado mas preservado por reversibilidade,
// ainda depende delas) pelas 5 novas telas da suíte, E trocar de conteúdo na
// MESMA página (sem navegar pra outra rota) — por isso é um componente de
// aba LOCAL à Central de Receita, não uma extensão do tab system antigo.
export type RevenueTabId = "central" | "mapaReceita" | "oportunidades" | "vazamentos" | "ruptura" | "aurora" | "previsao" | "vendedores";

// Ordem pedida: Mapa da Receita (principal), Previsão & Decisão, Vendedores, e o resto.
const TABS: { id: RevenueTabId; label: string; icon: typeof Gauge }[] = [
  { id: "mapaReceita", label: "Mapa da Receita", icon: Map },
  { id: "previsao", label: "Previsão & Decisão", icon: LineChart },
  { id: "vendedores", label: "Vendedores", icon: Users },
  { id: "central", label: "Central de Receita", icon: Gauge },
  { id: "oportunidades", label: "Oportunidades", icon: Target },
  { id: "vazamentos", label: "Vazamentos de Receita", icon: AlertTriangle },
  { id: "ruptura", label: "Ruptura", icon: Unlink },
  { id: "aurora", label: "Inteligência Aurora", icon: Brain },
];

export function RevenueTabs(props: { activeTab: RevenueTabId; onTabChange: (id: RevenueTabId) => void }) {
  return <AbasPagina abas={TABS} value={props.activeTab} onChange={props.onTabChange} ariaLabel="Central de Receita" />;
}
