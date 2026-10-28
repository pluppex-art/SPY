import { Card } from "../../../../components/ui/card";
import { SectionTitle } from "../../../../components/ui/section-title";
import { Cpu, Scale, DollarSign } from "lucide-react";
import { useLocalization } from "../../../../contexts/LocalizationContext";

export function PerformanceIAEngineCards(props: {
  simulationData: any[];
  isSimulating: boolean;
  currentCAC: number;
  currentLTV: number;
}) {
  const { simulationData, currentCAC, currentLTV } = props;
  const { formatCurrency } = useLocalization();
  const ltvCacRatio = currentCAC > 0 ? currentLTV / currentCAC : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="p-5 bg-gradient-to-br from-[var(--color-primary-blue)] to-[var(--color-primary-blue)]/70 border-none text-[#fff] relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-110 transition-transform">
          <Cpu className="w-16 h-16 text-[#fff]" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-[#fff] animate-pulse" />
            <span className="text-[10px] font-black text-[#fff] uppercase tracking-wider">
              Auditoria Comercial IA
            </span>
          </div>
          <h3 className="text-lg font-black mb-2">Processamento Ativo</h3>
          <p className="text-xs text-[#fff]/80 leading-relaxed font-medium">
            Analisa MRR, CAC e LTV atuais para sugerir cenários de crescimento e gargalos de conversão.
          </p>
        </div>
      </Card>

      <Card className="p-5 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between">
          <SectionTitle as="h4">Razão LTV / CAC</SectionTitle>
          <Scale className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="py-6 flex items-end gap-3 text-[var(--color-text-primary)]">
          <span className="text-5xl font-black font-mono">
            {ltvCacRatio !== null ? ltvCacRatio.toFixed(1) : "—"}
          </span>
          {ltvCacRatio !== null && <span className="text-sm font-bold text-[var(--color-text-muted)] mb-2">x</span>}
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] font-bold tracking-tight">
          {ltvCacRatio === null
            ? "Sem gasto de marketing registrado para calcular o CAC."
            : ltvCacRatio >= 3
              ? "Saudável — acima de 3x é o parâmetro de mercado."
              : "Abaixo do parâmetro de mercado (3x)."}
        </p>
      </Card>

      <Card className="p-5 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between">
          <SectionTitle as="h4">CAC Atual</SectionTitle>
          <DollarSign className="w-4 h-4 text-amber-500" />
        </div>
        <div className="py-6 flex items-end gap-3 text-[var(--color-text-primary)]">
          <span className="text-4xl font-black font-mono">
            {currentCAC > 0 ? formatCurrency(currentCAC) : "—"}
          </span>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] font-bold tracking-tight">
          Custo médio de aquisição por lead, com base nos lançamentos de marketing pagos.
        </p>
      </Card>
    </div>
  );
}

