import { useState, useEffect } from "react";
import { FileText, RefreshCw, Users, CheckCircle2, ToggleLeft, ToggleRight, RotateCcw } from "lucide-react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { supabase } from "../../../../lib/supabase";
import { toast } from "sonner";

interface SdrColaborador { id: string; nome: string; phone: string; cargo: string; status: string; }
interface FormRodizioConfig { current_index: number; active_sdr_ids: string[] | null; }

export function TabFormularioSDR({ tenantId }: { tenantId: string }) {
  const [sdrs, setSdrs] = useState<SdrColaborador[]>([]);
  const [config, setConfig] = useState<FormRodizioConfig>({ current_index: 0, active_sdr_ids: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, [tenantId]);

  async function loadData() {
    setLoading(true);
    if (supabase) {
      const [resSdr, resCfg] = await Promise.all([
        supabase.from("colaboradores").select("id, nome, phone, cargo, status").eq("tenant_id", tenantId).eq("cargo", "SDR").eq("status", "Ativo").order("nome"),
        supabase.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "form_rodizio_empreenda").maybeSingle(),
      ]);
      if (resSdr.data) setSdrs(resSdr.data as SdrColaborador[]);
      if (resCfg.data?.value) setConfig(resCfg.data.value as FormRodizioConfig);
    }
    setLoading(false);
  }

  async function saveConfig(newConfig: FormRodizioConfig) {
    setSaving(true);
    if (supabase) {
      await supabase.from("app_settings").upsert({
        id: `${tenantId}_form_rodizio`, tenant_id: tenantId,
        key: "form_rodizio_empreenda", value: newConfig,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    }
    setSaving(false);
    setConfig(newConfig);
    toast.success("Rodízio atualizado com sucesso.");
  }

  function toggleSdr(id: string) {
    const active = config.active_sdr_ids ?? sdrs.map(s => s.id);
    const newIds = active.includes(id) ? active.filter(x => x !== id) : [...active, id];
    saveConfig({ ...config, active_sdr_ids: newIds.length === sdrs.length ? null : newIds });
  }

  async function resetCounter() {
    await saveConfig({ ...config, current_index: 0 });
    toast.success("Contador resetado. O próximo lead vai para o primeiro SDR na fila.");
  }

  const activeSdrIds = config.active_sdr_ids ?? sdrs.map(s => s.id);
  const activeSDRs = sdrs.filter(s => activeSdrIds.includes(s.id));
  const nextSdr = activeSDRs[config.current_index % Math.max(activeSDRs.length, 1)];

  return (
    <div className="space-y-6">
      {nextSdr && (
        <Card className="flex items-center gap-4 p-4 bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/20 shadow-sm">
          <div className="w-9 h-9 rounded-full bg-[var(--color-primary-blue)] text-white flex items-center justify-center text-xs font-bold shrink-0">
            {nextSdr.nome.split(" ").map(n => n[0]).join("").substring(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-[var(--color-primary-blue)] uppercase tracking-wider mb-0.5">Próximo na fila</p>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">{nextSdr.nome}</p>
            <p className="text-xs text-[var(--color-text-muted)] font-mono">{nextSdr.phone} · Lead #{config.current_index + 1}</p>
          </div>
          <Button 
            variant="outline"
            size="xs"
            onClick={resetCounter} 
            disabled={saving} 
            className="h-8 px-3 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            <RotateCcw className="w-3 h-3" /> Resetar Fila
          </Button>
        </Card>
      )}

      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
        <div className="flex items-start gap-3 p-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]">
          <div className="p-2 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-bold text-[var(--color-text-primary)]">SDRs no Formulário</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 font-medium">Leads via landing page são distribuídos em round-robin entre os SDRs ativos abaixo.</p>
          </div>
          {saving && <RefreshCw className="w-4 h-4 text-[var(--color-primary-blue)] animate-spin shrink-0 mt-0.5" />}
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center gap-2 opacity-50">
            <RefreshCw className="w-5 h-5 text-[var(--color-primary-blue)] animate-spin" />
            <p className="text-xs text-[var(--color-text-muted)] font-medium">Carregando SDRs...</p>
          </div>
        ) : sdrs.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-2 text-center">
            <Users className="w-8 h-8 text-[var(--color-text-muted)] opacity-50" />
            <p className="text-xs font-bold text-[var(--color-text-primary)]">Nenhum SDR ativo cadastrado</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Cadastre colaboradores com cargo "SDR" no módulo Equipe.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {sdrs.map(sdr => {
              const isActive = activeSdrIds.includes(sdr.id);
              const isNext = nextSdr?.id === sdr.id;
              const initials = sdr.nome.split(" ").map(n => n[0]).join("").substring(0, 2);
              return (
                <div key={sdr.id} className={`flex items-center gap-4 px-5 py-3.5 transition-opacity ${isActive ? "" : "opacity-40"}`}>
                  <div className="w-8 h-8 rounded-full bg-[var(--color-primary-blue)] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[var(--color-text-primary)]">{sdr.nome}</span>
                      {isNext && isActive && (
                        <span className="text-[9px] font-bold text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 px-2 py-0.5 rounded uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Próximo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5">{sdr.phone}</p>
                  </div>
                  <button type="button" onClick={() => toggleSdr(sdr.id)} disabled={saving} className="cursor-pointer">
                    {isActive ? <ToggleRight className="w-7 h-7 text-[var(--color-primary-blue)]" /> : <ToggleLeft className="w-7 h-7 text-[var(--color-text-muted)]" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
