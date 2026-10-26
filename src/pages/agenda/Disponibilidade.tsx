import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { Clock, Check, Save, Calendar, Coffee, Plus } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../contexts/DataContext";

type DiaSemana = {
  id: string;
  label: string;
  ativo: boolean;
  inicio: string;
  fim: string;
};

const DEFAULT_DIAS: DiaSemana[] = [
  { id: "seg", label: "Segunda-feira", ativo: true, inicio: "09:00", fim: "18:00" },
  { id: "ter", label: "Terça-feira", ativo: true, inicio: "09:00", fim: "18:00" },
  { id: "qua", label: "Quarta-feira", ativo: true, inicio: "09:00", fim: "18:00" },
  { id: "qui", label: "Quinta-feira", ativo: true, inicio: "09:00", fim: "18:00" },
  { id: "sex", label: "Sexta-feira", ativo: true, inicio: "09:00", fim: "18:00" },
  { id: "sab", label: "Sábado", ativo: false, inicio: "09:00", fim: "13:00" },
  { id: "dom", label: "Domingo", ativo: false, inicio: "09:00", fim: "12:00" },
];

const SETTING_KEY = "agenda_disponibilidade";

export default function Disponibilidade() {
  const { appSettings, appSettingsLoaded, saveAppSetting } = useData();

  const [dias, setDias] = useState<DiaSemana[]>(DEFAULT_DIAS);
  const [duracaoPadrao, setDuracaoPadrao] = useState("45");
  const [intervalo, setIntervalo] = useState("15");

  const [almoçoInicio, setAlmocoInicio] = useState("12:00");
  const [almoçoFim, setAlmocoFim] = useState("13:00");

  useEffect(() => {
    if (appSettingsLoaded && appSettings?.[SETTING_KEY]) {
      const saved = appSettings[SETTING_KEY];
      setDias(saved.dias || DEFAULT_DIAS);
      setDuracaoPadrao(saved.duracaoPadrao || "45");
      setIntervalo(saved.intervalo || "15");
    }
  }, [appSettings, appSettingsLoaded]);

  const handleToggleDia = (id: string) => {
    setDias(prev =>
      prev.map(d => (d.id === id ? { ...d, ativo: !d.ativo } : d))
    );
  };

  const handleChangeHora = (id: string, campo: "inicio" | "fim", valor: string) => {
    setDias(prev =>
      prev.map(d => (d.id === id ? { ...d, [campo]: valor } : d))
    );
  };

  const handleSave = async () => {
    try {
      await saveAppSetting(SETTING_KEY, { dias, duracaoPadrao, intervalo, almoçoInicio, almoçoFim });
      toast.success("Grade de horários e disponibilidade salva com sucesso!");
    } catch (e) {
      toast.error("Erro ao salvar disponibilidade.");
    }
  };

  return (
    <PageContainer
      title="Disponibilidade & Horários de Atendimento"
      description="Configure janelas de agendamento para reuniões de SDR, closers, visitas a imóveis e vistorias."
      actions={
        <Button
          onClick={handleSave}
          className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs bg-[var(--color-primary-blue)] text-white hover:opacity-95"
        >
          <Save className="w-3.5 h-3.5" /> Salvar Disponibilidade
        </Button>
      }
    >
      <div className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
        <strong className="font-black">Ainda não aplicado automaticamente.</strong> Esta grade fica salva, mas o agendamento de reuniões ainda não bloqueia horários fora dela.
      </div>
        {/* Duração e Buffer */}
        <div className="p-6 bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl space-y-4 shadow-xs">
          <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--color-primary-blue)]" /> Padrões de Reunião & Intervalos
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Duração da Sessão
              </label>
              <select
                value={duracaoPadrao}
                onChange={e => setDuracaoPadrao(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              >
                <option value="15">15 minutos (Quick Call)</option>
                <option value="30">30 minutos (Diagnóstico)</option>
                <option value="45">45 minutos (Apresentação)</option>
                <option value="60">60 minutos (Fechamento/Visita)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Intervalo entre Sessões
              </label>
              <select
                value={intervalo}
                onChange={e => setIntervalo(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              >
                <option value="5">5 minutos</option>
                <option value="10">10 minutos</option>
                <option value="15">15 minutos (Recomendado)</option>
                <option value="30">30 minutos</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Pausa / Almoço (Início)
              </label>
              <input
                type="time"
                value={almoçoInicio}
                onChange={e => setAlmocoInicio(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)] block mb-1">
                Pausa / Almoço (Fim)
              </label>
              <input
                type="time"
                value={almoçoFim}
                onChange={e => setAlmocoFim(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>
        </div>

        {/* Grade Semanal */}
        <div className="p-6 bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--color-primary-blue)]" /> Grade Semanal de Atendimento
            </h4>
            <span className="text-[11px] text-[var(--color-text-muted)]">
              {dias.filter(d => d.ativo).length} dias ativos na semana
            </span>
          </div>

          <div className="space-y-2.5">
            {dias.map(d => (
              <div
                key={d.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  d.ativo
                    ? "bg-[var(--color-surface)] border-[var(--color-border-default)]"
                    : "bg-[var(--color-surface-sunken)]/40 border-[var(--color-border-subtle)] opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={d.ativo}
                    onChange={() => handleToggleDia(d.id)}
                    className="w-4 h-4 rounded border-[var(--color-border-default)] text-[var(--color-primary-blue)] cursor-pointer"
                  />
                  <span className="text-xs font-bold text-[var(--color-text-primary)] min-w-[130px]">
                    {d.label}
                  </span>
                </div>

                {d.ativo ? (
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">Das</span>
                    <input
                      type="time"
                      value={d.inicio}
                      onChange={e => handleChangeHora(d.id, "inicio", e.target.value)}
                      className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-2 py-1 text-xs font-bold text-[var(--color-text-primary)]"
                    />
                    <span className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">às</span>
                    <input
                      type="time"
                      value={d.fim}
                      onChange={e => handleChangeHora(d.id, "fim", e.target.value)}
                      className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-2 py-1 text-xs font-bold text-[var(--color-text-primary)]"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-[var(--color-text-muted)] italic">Indisponível</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
