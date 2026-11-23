import { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { Bot, Workflow, Zap, Settings2, LayoutDashboard, Link2, GraduationCap } from "lucide-react";
import { SectionSidebar, type SectionNavGroup } from "../../components/layout/SectionSidebar";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Área da Inteligência Artificial: a visão geral e as configurações da IA (Aurora, funis, gatilhos, links e
 * treinamento) dentro do mesmo menu lateral, sem sair da área.
 */
export default function IALayout() {
  const { user, isModuleEnabled } = useAuth();
  const crm = isModuleEnabled("crm");
  const grupos = useMemo<SectionNavGroup[]>(() => [
    { title: "Inteligência Artificial", icon: Bot, items: [{ title: "Visão geral", path: "/app/ia", icon: LayoutDashboard, exact: true }] },
    {
      title: "Configurações da IA", icon: Settings2, items: [
        { title: "Aurora: controle, consumo e agentes", path: "/app/ia/aurora", icon: Bot },
        ...(crm ? [
          { title: "Funis e etapas", path: "/app/ia/funis", icon: Workflow },
          { title: "Gatilhos da IA", path: "/app/ia/gatilhos", icon: Zap },
        ] : []),
        { title: "Links para os assistentes", path: "/app/ia/links", icon: Link2 },
        ...(user?.isMaster ? [{ title: "Treinamento dos agentes", path: "/app/ia/treinamento", icon: GraduationCap }] : []),
      ],
    },
  ], [crm, user?.isMaster]);
  return (
    <SectionSidebar heading="Inteligência Artificial" subheading="Aurora e agentes" groups={grupos}>
      <Outlet />
    </SectionSidebar>
  );
}
