import { Terminal, Rocket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { DevKPIs } from "./components/DevKPIs";
import { SprintVelocityChart } from "./components/SprintVelocityChart";
import { DeploysChart } from "./components/DeploysChart";
import { DevRecentActivity } from "./components/DevRecentActivity";
import { DevEnvironmentStatus } from "./components/DevEnvironmentStatus";

export default function PainelDev() {
  const navigate = useNavigate();
  return (
    <PageContainer
      title="Painel Dev & Tecnologia"
      description="Visão geral do desenvolvimento: sprints, deploys (publicações), issues e a saúde dos ambientes."
      actions={
        <div className="flex items-center gap-3">
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
        <DevKPIs />

        <div className="grid lg:grid-cols-3 gap-6">
          <SprintVelocityChart />
          <DeploysChart />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <DevRecentActivity />
          <DevEnvironmentStatus />
        </div>
      </div>
    </PageContainer>
  );
}
