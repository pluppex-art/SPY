import { useMemo } from "react";
import { Terminal, Rocket } from "lucide-react";
import { useDevPainel } from "./hooks/useDevPainel";
import { useDevProjectsForFilter } from "./hooks/useDevProjectsForFilter";
import { useAmbientes } from "./hooks/useAmbientes";
import { resumoDev, porSemana } from "./lib/painelDev";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { DevKPIs } from "./components/DevKPIs";
import { SprintVelocityChart } from "./components/SprintVelocityChart";
import { TarefasSemanaChart } from "./components/TarefasSemanaChart";
import { DevRecentActivity } from "./components/DevRecentActivity";
import { DevEnvironmentStatus } from "./components/DevEnvironmentStatus";
import { BotaoRelatorio } from "../../components/relatorio/BotaoRelatorio";

export default function PainelDev() {
  const navigate = useNavigate();
  const { tarefas, issues, loading } = useDevPainel();
  const projetos = useDevProjectsForFilter();
  const { environments } = useAmbientes();
  const resumo = useMemo(() => resumoDev(tarefas, issues), [tarefas, issues]);
  const semanas = useMemo(() => porSemana(tarefas), [tarefas]);
  const nomes = useMemo(() => new Map(projetos.map((p) => [String(p.id), p.name])), [projetos]);
  return (
    <PageContainer
      title="Painel Dev & Tecnologia"
      description="Visão geral do desenvolvimento da empresa selecionada: tarefas do sprint, bugs, pendências e a situação dos ambientes."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <BotaoRelatorio area="dev" />
          <Button onClick={() => navigate("/app/dev/sprints")} variant="outline" className="h-10 rounded-xl border-white/5 text-xs gap-2">
            <Terminal className="w-4 h-4" /> Sprint Atual
          </Button>
          <Button onClick={() => toast.info("Disparo de deploy pela plataforma ainda não disponível — em breve.")} className="rounded-xl h-10 px-6 text-xs gap-2">
            <Rocket className="w-4 h-4" /> Novo Deploy
          </Button>
        </div>
      }
    >
      <div className="max-w-[1700px] mx-auto space-y-6 pb-10">
        <DevKPIs resumo={resumo} loading={loading} ambientes={{ operacionais: environments.filter((e) => e.status === "operacional").length, total: environments.length }} />

        <div className="grid lg:grid-cols-3 gap-6">
          <SprintVelocityChart dados={semanas} />
          <TarefasSemanaChart dados={semanas} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <DevRecentActivity tarefas={tarefas} issues={issues} projetos={nomes} loading={loading} />
          <DevEnvironmentStatus />
        </div>
      </div>
    </PageContainer>
  );
}
