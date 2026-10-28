import { Card } from "../../../../components/ui/card";
import { SectionTitle } from "../../../../components/ui/section-title";
import { Button } from "../../../../components/ui/button";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line, Area } from "recharts";
import { Play, RefreshCw, Zap, Inbox, Lightbulb } from "lucide-react";
import { motion } from "motion/react";

export function PerformanceIAWhatIfSimulator(props: {
  isSimulating: boolean;
  runSimulation: () => void;
  simulationData: Array<{ name: string; mrr: number; cac: number; ltv: number }>;
  aiRecommendations: any[];
}) {
  const { isSimulating, runSimulation, simulationData, aiRecommendations } = props;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-10">
          <div>
            <SectionTitle>
              <Play className="w-5 h-5 text-[var(--color-primary-blue)]" /> Simulador de Cenários
            </SectionTitle>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">Modele o crescimento alterando variáveis críticas de aquisição.</p>
          </div>
          <Button
            onClick={runSimulation}
            disabled={isSimulating || simulationData.length === 0}
            className="bg-[var(--color-primary-blue)] hover:opacity-90 text-white rounded-xl px-6 h-12 text-xs font-black uppercase tracking-wider gap-2 disabled:opacity-50"
          >
            {isSimulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
            {isSimulating ? "Simulando..." : "Executar Simulação"}
          </Button>
        </div>

        {simulationData.length === 0 ? (
          <div className="h-[340px] flex flex-col items-center justify-center gap-4 opacity-40">
            <Inbox className="w-12 h-12 text-[var(--color-text-muted)]" />
            <p className="text-xs font-black text-[var(--color-text-muted)] uppercase tracking-wider text-center">
              Simulador indisponível.
              <br />Cadastre dados financeiros e contratos reais.
            </p>
          </div>
        ) : (
          <>
            <div className="h-[340px] w-full min-w-0 -mx-4">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                <ComposedChart data={simulationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff03" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b30" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b30" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid #ffffff05", borderRadius: "16px" }}
                    itemStyle={{ fontSize: "10px", fontWeight: "bold" }}
                  />
                  <Bar dataKey="mrr" fill="#312e81" radius={[8, 8, 0, 0]} barSize={40} />
                  <Line type="monotone" dataKey="ltv" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: "#8b5cf6" }} />
                  <Area type="monotone" dataKey="cac" fill="#10b981" stroke="#10b981" fillOpacity={0.1} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      <Card className="p-5 h-full flex flex-col shadow-sm">
        <SectionTitle as="h4" className="mb-4">
          <Lightbulb className="w-4 h-4 text-amber-500" /> Recomendações Aurora
        </SectionTitle>

        {simulationData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs font-black text-[var(--color-text-muted)] text-center uppercase">Aguardando dados...</p>
          </div>
        ) : (
          <div
            className={`flex-1 space-y-6 transition-all duration-500 ${isSimulating ? "opacity-30 blur-sm" : "opacity-100"}`}
          >
            {(aiRecommendations.length > 0
              ? aiRecommendations
              : [{
                  title: "Analisando...",
                  desc: "Master IA está lendo seus indicadores de performance.",
                  impact: "--",
                  color: "text-[var(--color-text-muted)]",
                }]
            ).map((rec, i) => (
              <div key={i} className="p-5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl group hover:bg-[var(--color-surface-sunken)] transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-[13px] font-black text-[var(--color-text-primary)]">{rec.title}</h5>
                  <span className={`text-[10px] font-black ${rec.color} bg-[var(--color-surface-sunken)] px-2 py-0.5 rounded-full`}>
                    {rec.impact}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] font-medium leading-relaxed">{rec.desc}</p>
              </div>
            ))}
          </div>
        )}

        <Button
          onClick={runSimulation}
          disabled={isSimulating || simulationData.length === 0}
          variant="outline"
          className="w-full mt-8 border-[var(--color-border-default)] text-[10px] font-black uppercase tracking-wider h-12 rounded-2xl hover:bg-[var(--color-surface-sunken)] disabled:opacity-50"
        >
          {isSimulating ? "Executando..." : "Executar Nova Auditoria"}
        </Button>
      </Card>
    </div>
  );
}

