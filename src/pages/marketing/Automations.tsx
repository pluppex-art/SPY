import { PageContainer } from "../../components/PageContainer";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Plus } from "lucide-react";
import { NovaAutomacaoModal } from "../../components/ui/modals/marketing/NovaAutomacaoModal";
import { toast } from "sonner";
import { WhatsAppTriggersSection } from "./components/Automations/WhatsAppTriggersSection";
import { SystemWorkflowsSection } from "./components/Automations/SystemWorkflowsSection";

export default function Automations() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [systemWorkflows, setSystemWorkflows] = useState<any[]>([]);

  const handleCreateSystemWorkflow = (fieldsData: any) => {
    setSystemWorkflows(prev => [{ title: fieldsData.nome || "Novo Fluxo de Automação", trigger: fieldsData.gatilho, action: fieldsData.acao, active: true }, ...prev]);
    toast.success("Fluxo de automação criado com sucesso!");
    setIsModalOpen(false);
  };

  return (
    <PageContainer
      title="Automação de Fluxos"
      description="Configure regras inteligentes, links e integre com canais externos de comunicação."
      actions={
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 h-9 px-4 text-xs font-medium">
          <Plus className="w-4 h-4" /> Novo Fluxo Vendas
        </Button>
      }
    >
    <div className="space-y-8 pb-16">
      <WhatsAppTriggersSection />
      <SystemWorkflowsSection initialWorkflows={systemWorkflows} />

      <NovaAutomacaoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleCreateSystemWorkflow} />
    </div>
    </PageContainer>
  );
}
