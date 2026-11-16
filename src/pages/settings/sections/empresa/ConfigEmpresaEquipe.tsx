import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Users, ExternalLink, UserPlus } from "lucide-react";

import { HelpTip } from "../../../../components/ui/help-tip";
export function ConfigEmpresaEquipe() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">Equipe & Convites <HelpTip label="Sobre Equipe & Convites">Convide novas pessoas para a sua empresa no SPY e gerencie o acesso de cada uma.</HelpTip></h1>
        </div>
        <Button 
          onClick={() => window.location.href = "/app/equipe"}
          className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
        >
          <UserPlus className="w-4 h-4 mr-1" /> Convidar Membro
        </Button>
      </div>

      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          O gerenciamento completo de equipe, permissões individuais e convites ativos está centralizado no módulo principal de Equipe.
        </p>
        <Button 
          onClick={() => window.location.href = "/app/equipe"} 
          variant="outline"
          className="mt-4 h-9 px-4 text-xs font-bold gap-2 text-[var(--color-text-primary)] border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]"
        >
          Ir para Gestão de Equipe <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </Card>
    </div>
  );
}
