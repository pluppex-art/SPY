import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { useIndicadores } from "./hooks/useIndicadores";
import { IndicadoresKPIs } from "./components/Indicadores/IndicadoresKPIs";
import { IndicadoresCharts } from "./components/Indicadores/IndicadoresCharts";
import { IndicadoresScheduler } from "./components/Indicadores/IndicadoresScheduler";
import { IndicadoresChannels } from "./components/Indicadores/IndicadoresChannels";

export default function Indicadores() {
  const {
    schedules, selectedKPI, setSelectedKPI, criticalKPIs,
    newEmail, setNewEmail, newWeekday, setNewWeekday, newTime, setNewTime,
    handleCreateSchedule, handleToggleSchedule, handleDeleteSchedule,
    simulateRunAndDownloadCSV, kpiCards, monthlyData, pieData,
  } = useIndicadores();

  return (
    <PageContainer
      title="BI & Analytics S.P.Y."
      description="Aprofunde-se nos indicadores (KPIs) da empresa, na projeção de faturamento e na governança dos dados."
      actions={
        <div className="flex gap-2">
          <Button onClick={() => window.print()} variant="outline" className="border-white/10 bg-[var(--color-surface-elevated)] text-slate-300 h-11 px-6 rounded-xl font-bold uppercase tracking-widest text-[10px]">
            Exportar PDF
          </Button>
          <select className="bg-[var(--color-surface-elevated)] border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest outline-none focus:border-blue-500 text-white h-11">
            <option>Anual (2026)</option>
            <option>Semestre 1</option>
            <option>Semestre 2</option>
          </select>
        </div>
      }
    >
      <div className="space-y-8 pb-12">
        <IndicadoresKPIs
          kpiCards={kpiCards}
          criticalKPIs={criticalKPIs}
          selectedKPI={selectedKPI}
          onSelectKPI={setSelectedKPI}
          onCloseKPI={() => setSelectedKPI(null)}
        />
        <IndicadoresCharts monthlyData={monthlyData} pieData={pieData} />
        <IndicadoresScheduler
          schedules={schedules}
          newEmail={newEmail} onEmailChange={setNewEmail}
          newWeekday={newWeekday} onWeekdayChange={setNewWeekday}
          newTime={newTime} onTimeChange={setNewTime}
          onCreateSchedule={handleCreateSchedule}
          onToggleSchedule={handleToggleSchedule}
          onDeleteSchedule={handleDeleteSchedule}
          onSimulateRun={simulateRunAndDownloadCSV}
        />
        <IndicadoresChannels />
      </div>
    </PageContainer>
  );
}
