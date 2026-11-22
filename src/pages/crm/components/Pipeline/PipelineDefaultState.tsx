import { Card } from "../../../../components/ui/card";
import { Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

export function PipelineDefaultState() {
  return (
    <Card className="p-6 border-warning/25 bg-warning/5 flex items-center gap-4">
      <Settings2 className="w-8 h-8 text-warning shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-bold text-[var(--color-text-primary)]">Nenhum funil configurado</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Configure seus funis nas configurações de Vendas.</p>
      </div>
      <Link
        to="/app/configuracoes/crm/funis"
        className="shrink-0 px-4 py-2 bg-warning/10 border border-warning/25 text-warning text-[10px] font-black uppercase tracking-widest rounded-[var(--radius-control)] hover:bg-warning/20 transition-all"
      >
        Configurar →
      </Link>
    </Card>
  );
}

