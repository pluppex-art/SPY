import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ToggleLeft, ToggleRight, Lock, Unlock, ChevronDown, Users,
} from "lucide-react";
import { Card } from "../../../../components/ui/card";
import { useData } from "../../../../contexts/DataContext";
import { toast } from "sonner";

interface CloserConfig {
  id: string;
  name: string;
  email: string;
  active: boolean;
  leadTypes: string[];
  blocked: boolean;
}

interface GlobalConfig {
  distributionMode: string;
  blockOnMultipleClients: boolean;
  multiClientThreshold: number;
}

const GLOBAL_CONFIG_KEY = "rodizio_global_config";
const LEAD_TYPES_DEFAULT = ["Instagram", "WhatsApp", "Indicação", "Site", "Google Ads", "Cold Call", "LinkedIn", "Orgânico"];
const DEFAULT_GLOBAL: GlobalConfig = { distributionMode: "round-robin", blockOnMultipleClients: false, multiClientThreshold: 2 };
const DISTRIBUTION_MODES = [
  { value: "round-robin", label: "Round-Robin",  desc: "Cada lead vai para o próximo closer na fila" },
  { value: "priority",    label: "Prioridade",   desc: "Leads vão para o closer com menos atendimentos ativos" },
  { value: "manual",      label: "Manual",       desc: "Admin distribui manualmente cada lead" },
];

export function TabClosersCRM() {
  const { colaboradores, updateColaborador, appSettings, saveAppSetting } = useData();
  const [expandedCloser, setExpanded] = useState<string | null>(null);

  const global: GlobalConfig = useMemo(
    () => ({ ...DEFAULT_GLOBAL, ...(appSettings?.[GLOBAL_CONFIG_KEY] || {}) }),
    [appSettings]
  );

  // Fonte única: colaboradores com cargo "Closer" e status Ativo no RH.
  // Um colaborador marcado como Inativo em RH some daqui automaticamente.
  const closers: CloserConfig[] = useMemo(() => (
    colaboradores
      .filter((c: any) => (c.cargo || "").toLowerCase().includes("closer") && c.status === "Ativo")
      .map((c: any) => ({
        id: c.id,
        name: c.nome,
        email: c.email || "",
        active: c.rotation_active ?? true,
        blocked: c.rotation_blocked ?? false,
        leadTypes: c.rotation_lead_types?.length ? c.rotation_lead_types : LEAD_TYPES_DEFAULT,
      }))
  ), [colaboradores]);

  const updateGlobal = (patch: Partial<GlobalConfig>) => {
    const next = { ...global, ...patch };
    saveAppSetting(GLOBAL_CONFIG_KEY, next);
    toast.success("Regras de distribuição atualizadas!");
  };

  const toggleActive = (id: string, name: string) => {
    const closer = closers.find(c => c.id === id);
    updateColaborador(id, { rotation_active: !(closer?.active ?? true) });
    toast.success(`Status de ${name} alterado.`);
  };

  const toggleBlocked = (id: string, name: string) => {
    const closer = closers.find(c => c.id === id);
    updateColaborador(id, { rotation_blocked: !(closer?.blocked ?? false) });
    toast.success(`Trava de ${name} atualizada.`);
  };

  const toggleLeadType = (id: string, type: string) => {
    const closer = closers.find(c => c.id === id);
    if (!closer) return;
    const leadTypes = closer.leadTypes.includes(type)
      ? closer.leadTypes.filter(t => t !== type)
      : [...closer.leadTypes, type];
    updateColaborador(id, { rotation_lead_types: leadTypes });
  };

  return (
    <div className="space-y-6">
      {/* Distribution Mode Card */}
      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Modo de Distribuição</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Selecione o algoritmo de repasse automático de leads para os closers.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DISTRIBUTION_MODES.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => updateGlobal({ distributionMode: m.value })}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                global.distributionMode === m.value
                  ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)] text-[var(--color-text-primary)]"
                  : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:border-[var(--color-border-default)]/80"
              }`}
            >
              <div className="font-bold text-xs text-[var(--color-text-primary)]">{m.label}</div>
              <div className="text-[11px] text-[var(--color-text-muted)] mt-1">{m.desc}</div>
            </button>
          ))}
        </div>

        <div className="pt-4 border-t border-[var(--color-border-subtle)] space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl mt-0.5 ${global.blockOnMultipleClients ? "bg-danger/10" : "bg-[var(--color-surface-sunken)]"}`}>
                {global.blockOnMultipleClients ? <Lock className="w-4 h-4 text-danger" /> : <Unlock className="w-4 h-4 text-[var(--color-text-muted)]" />}
              </div>
              <div>
                <p className="text-xs font-bold text-[var(--color-text-primary)]">Bloquear closer com múltiplos atendimentos em paralelo</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 max-w-sm">Closers atendendo {global.multiClientThreshold}+ leads simultâneos saem temporariamente da fila até liberarem capacidade.</p>
              </div>
            </div>
            <button type="button" onClick={() => updateGlobal({ blockOnMultipleClients: !global.blockOnMultipleClients })} className="shrink-0 cursor-pointer">
              {global.blockOnMultipleClients ? <ToggleRight className="w-7 h-7 text-danger" /> : <ToggleLeft className="w-7 h-7 text-[var(--color-text-muted)]" />}
            </button>
          </div>

          {global.blockOnMultipleClients && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex items-center gap-3 pt-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)] shrink-0">Bloquear a partir de:</label>
              <div className="flex items-center gap-1.5">
                <button 
                  type="button" 
                  onClick={() => global.multiClientThreshold > 1 && updateGlobal({ multiClientThreshold: global.multiClientThreshold - 1 })} 
                  className="w-7 h-7 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] font-bold flex items-center justify-center hover:bg-[var(--color-surface-elevated)] cursor-pointer"
                >
                  -
                </button>
                <span className="text-xs font-bold font-mono text-[var(--color-text-primary)] w-6 text-center">{global.multiClientThreshold}</span>
                <button 
                  type="button" 
                  onClick={() => updateGlobal({ multiClientThreshold: global.multiClientThreshold + 1 })} 
                  className="w-7 h-7 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] font-bold flex items-center justify-center hover:bg-[var(--color-surface-elevated)] cursor-pointer"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">clientes simultâneos</span>
            </motion.div>
          )}
        </div>
      </Card>

      {/* Closers on Rotation */}
      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
        <div className="flex items-start gap-3 p-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]">
          <div className="p-2 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-primary)]">Closers na Rotação</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 font-medium">Controle individual de disponibilidade e tipos de lead permitidos.</p>
          </div>
        </div>

        {closers.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-2 text-center">
            <Users className="w-8 h-8 text-[var(--color-text-muted)] opacity-50" />
            <p className="text-xs font-bold text-[var(--color-text-primary)]">Nenhum closer ativo encontrado</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Adicione membros com o cargo "Closer" no módulo de Equipe.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {closers.map(closer => {
              const isExpanded = expandedCloser === closer.id;
              const initials = closer.name.split(" ").map(n => n[0]).join("").substring(0, 2);
              return (
                <div key={closer.id} className={`transition-colors ${closer.active ? "" : "opacity-50"}`}>
                  <div className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-primary-blue)] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[var(--color-text-primary)]">{closer.name}</span>
                        {closer.blocked && global.blockOnMultipleClients && (
                          <span className="text-[9px] font-bold text-danger bg-danger/10 border border-danger/20 px-2 py-0.5 rounded uppercase flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Bloqueado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
                        {closer.leadTypes.length === LEAD_TYPES_DEFAULT.length ? "Todos os tipos de lead"
                          : closer.leadTypes.length === 0 ? "Nenhum tipo selecionado"
                          : `${closer.leadTypes.slice(0, 3).join(", ")}${closer.leadTypes.length > 3 ? ` +${closer.leadTypes.length - 3}` : ""}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {global.blockOnMultipleClients && (
                        <button type="button" onClick={() => toggleBlocked(closer.id, closer.name)} className="p-1.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)] transition-colors cursor-pointer">
                          {closer.blocked ? <Lock className="w-4 h-4 text-danger" /> : <Unlock className="w-4 h-4 text-[var(--color-text-muted)]" />}
                        </button>
                      )}
                      <button type="button" onClick={() => toggleActive(closer.id, closer.name)} className="cursor-pointer">
                        {closer.active ? <ToggleRight className="w-7 h-7 text-[var(--color-primary-blue)]" /> : <ToggleLeft className="w-7 h-7 text-[var(--color-text-muted)]" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : closer.id)}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${isExpanded ? "bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="border-t border-[var(--color-border-subtle)] overflow-hidden">
                        <div className="px-5 py-4 bg-[var(--color-surface-sunken)]/50 space-y-2">
                          <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Tipos de Lead Habilitados</p>
                          <div className="flex flex-wrap gap-1.5">
                            {LEAD_TYPES_DEFAULT.map(type => {
                              const selected = closer.leadTypes.includes(type);
                              return (
                                <button 
                                  key={type} 
                                  type="button"
                                  onClick={() => toggleLeadType(closer.id, type)}
                                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer border ${selected ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30" : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]"}`}
                                >
                                  {type}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
