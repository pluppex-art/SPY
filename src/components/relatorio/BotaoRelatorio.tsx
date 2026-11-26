/** Botão "Gerar relatório" dos painéis. O visualizador só é baixado quando alguém clica. */
import { lazy, Suspense, useState } from "react";
import { FileBarChart } from "lucide-react";
import { Button } from "../ui/button";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { cargoPermiteModulo, modulosDoCargo } from "../../lib/accessControl";
import { areasPermitidas, type AreaId } from "../../lib/relatorio";
import { cn } from "../../lib/utils";

const Visualizador = lazy(() => import("./RelatorioVisualizador"));

export function BotaoRelatorio({ area = "geral", periodo, className }: {
  /** Área do painel; "geral" reúne todas as que a pessoa pode ver. */
  area?: AreaId | "geral";
  /** Período filtrado na tela, para o relatório começar igual (null = sem limite). */
  periodo?: { de: string | null; ate: string | null };
  className?: string;
}) {
  const { user, isModuleEnabled } = useAuth();
  const { cargos } = useData();
  const [aberto, setAberto] = useState(false);

  // Mesma regra do menu: módulo ligado na empresa e liberado pelo cargo (o master não é limitado por cargo).
  const modulosCargo = user?.isMaster ? null : modulosDoCargo(user, cargos);
  const permitidas = areasPermitidas((m) => isModuleEnabled(m as any) && cargoPermiteModulo(modulosCargo, m));
  const areas = area === "geral" ? permitidas : [area];

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)} className={cn("h-9 px-3.5 text-xs font-bold gap-1.5 print:hidden", className)}>
        <FileBarChart className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Gerar relatório
      </Button>
      {aberto && (
        <Suspense fallback={null}>
          <Visualizador areas={areas} periodo={periodo} onFechar={() => setAberto(false)} />
        </Suspense>
      )}
    </>
  );
}
