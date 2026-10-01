import { useState } from "react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Clock, ShieldAlert, Sparkles, Check, AlertTriangle, ArrowRight, UserCheck, Flame } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";

interface SLARule {
  priority: "Alta" | "Média" | "Baixa";
  limitHours: number;
  alertBeforeMinutes: number;
  autoReassign: boolean;
  active: boolean;
  color: string;
}

const SLA_SETTING_KEY = "crm_sla_rules";
const DEFAULT_SLA_RULES: SLARule[] = [
  { priority: "Alta", limitHours: 2, alertBeforeMinutes: 30, autoReassign: true, active: true, color: "var(--color-danger)" },
  { priority: "Média", limitHours: 8, alertBeforeMinutes: 60, autoReassign: false, active: true, color: "var(--color-warning)" },
  { priority: "Baixa", limitHours: 24, alertBeforeMinutes: 120, autoReassign: false, active: true, color: "var(--color-primary-blue)" },
];

export function ConfigCRMSLA() {
  const { appSettings, saveAppSetting } = useData();
  const savedRules: SLARule[] | undefined = appSettings?.[SLA_SETTING_KEY];
  const [localRules, setLocalRules] = useState<SLARule[] | null>(null);
  const slaRules = localRules ?? savedRules ?? DEFAULT_SLA_RULES;

  const [activePriority, setActivePriority] = useState<"Alta" | "Média" | "Baixa">("Alta");

  const currentRule = slaRules.find(r => r.priority === activePriority) || slaRules[0];

  const updateCurrentRule = (updates: Partial<SLARule>) => {
    setLocalRules(slaRules.map(r => r.priority === activePriority ? { ...r, ...updates } : r));
  };

  const handleSaveSla = async () => {
    await saveAppSetting(SLA_SETTING_KEY, slaRules);
    toast.success("Regras de SLA salvas com sucesso!");
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 sm:space-y-8 p-1 sm:p-2 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
            Configuração de SLA & Alertas <Clock className="text-[var(--color-primary-blue)] w-5 h-5" />
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">Garanta conversões rápidas cobrando sua equipe de vendas caso o tempo de primeiro contato estoure.</p>
        </div>
        <Button onClick={handleSaveSla} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs w-full sm:w-auto">
          Salvar Configurações
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left editor: form controls */}
        <Card className="lg:col-span-3 p-4 sm:p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col justify-between rounded-2xl relative overflow-hidden shadow-sm">
          <div className="space-y-6">
            <div className="border-b border-[var(--color-border-subtle)] pb-4 space-y-3">
              <h3 className="text-xs font-black text-[var(--color-primary-blue)] uppercase tracking-widest font-mono">Definir por Complexidade</h3>
              
              {/* Tabs for Priority Selection */}
              <div className="flex flex-wrap gap-1.5 p-1 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-border-subtle)] w-full sm:w-fit">
                {(["Alta", "Média", "Baixa"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setActivePriority(p)}
                    className={`flex-1 sm:flex-initial text-center px-2 sm:px-4 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all uppercase tracking-normal cursor-pointer ${
                      activePriority === p
                        ? p === "Alta" ? "bg-danger text-white" : p === "Média" ? "bg-warning text-white" : "bg-[var(--color-primary-blue)] text-white"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Config Form Elements for Selected Priority */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-[var(--color-surface-sunken)] p-3 rounded-xl border border-[var(--color-border-subtle)] gap-3">
                <div className="space-y-0.5 max-w-[80%]">
                  <span className="text-xs text-[var(--color-text-primary)] font-bold block">Meta de SLA Ativa</span>
                  <span className="text-[10px] text-[var(--color-text-muted)] block leading-tight">Monitorar tempo limite para leads de prioridade {activePriority}.</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={currentRule.active}
                  onChange={(e) => updateCurrentRule({ active: e.target.checked })}
                  className="w-4 h-4 text-[var(--color-primary-blue)] rounded border-[var(--color-border-default)] bg-[var(--color-surface)] cursor-pointer shrink-0"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5 bg-[var(--color-surface-sunken)] p-3 sm:p-4 border border-[var(--color-border-subtle)] rounded-xl">
                  <label className="text-[10px] text-[var(--color-text-muted)] uppercase font-black block">Espera Máxima (SLA)</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input 
                      type="number" 
                      value={currentRule.limitHours} 
                      onChange={(e) => updateCurrentRule({ limitHours: parseInt(e.target.value) || 0 })}
                      className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg p-2 text-sm text-[var(--color-text-primary)] w-20 sm:w-24 font-mono font-bold text-center" 
                      min="1"
                    />
                    <span className="text-xs text-[var(--color-text-muted)] font-semibold">horas</span>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-faint)] block leading-tight">Tempo máximo até o primeiro contato</span>
                </div>

                <div className="space-y-1.5 bg-[var(--color-surface-sunken)] p-3 sm:p-4 border border-[var(--color-border-subtle)] rounded-xl">
                  <label className="text-[10px] text-[var(--color-text-muted)] uppercase font-black block">Aviso Prévio</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input 
                      type="number" 
                      value={currentRule.alertBeforeMinutes} 
                      onChange={(e) => updateCurrentRule({ alertBeforeMinutes: parseInt(e.target.value) || 0 })}
                      className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg p-2 text-sm text-[var(--color-text-primary)] w-20 sm:w-24 font-mono font-bold text-center" 
                      min="5"
                      step="5"
                    />
                    <span className="text-xs text-[var(--color-text-muted)] font-semibold">minutos</span>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-faint)] block leading-tight">Emitir alerta antes do vencimento</span>
                </div>
              </div>

              {/* Action Rules */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-black text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-warning" /> Ações em Caso de Estouro
                </h4>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-[var(--color-text-primary)] block">Reatribuição Automática</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] block">Transferir o lead para a fila geral ou outro corretor disponível.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={currentRule.autoReassign}
                    onChange={(e) => updateCurrentRule({ autoReassign: e.target.checked })}
                    className="w-4 h-4 text-[var(--color-primary-blue)] rounded border-[var(--color-border-default)] bg-[var(--color-surface)] cursor-pointer shrink-0"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Right card: Live Preview */}
        <Card className="lg:col-span-2 p-5 sm:p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--color-border-subtle)]">
              <span className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Prévia Visual do Lead
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--color-text-primary)]">Lead em Atendimento</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/20">
                  Prioridade {activePriority}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                Limite de resposta definido para <strong>{currentRule.limitHours}h</strong> com alerta aos <strong>{currentRule.alertBeforeMinutes}m</strong>.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
