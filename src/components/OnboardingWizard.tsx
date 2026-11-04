import { useState } from "react";
import { CheckCircle2, ChevronRight, Sparkles, X } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContextTypes";
import { updateTenantModulesInDB } from "../lib/supabase";
import { DEMO_PRESETS } from "../pages/settings/constants/demoPresets";
import { toast } from "sonner";

const STAGE_COLORS = ["blue", "cyan", "purple", "amber", "emerald", "pink", "orange", "rose"];

// Wizard de primeiro acesso — mostrado uma vez por tenant (controlado pela
// app_setting "onboarding_completed", tenant-scoped) para quem acabou de ter
// sua empresa cadastrada. Antes deste componente não existia NENHUM fluxo de
// onboarding: DEMO_PRESETS já existia com dados reais de nicho/módulos/etapas
// de funil, mas nunca era importado em lugar nenhum — um preset "morto".
// Aqui ele vira funcionalidade real: aplicar um preset ativa módulos de
// verdade (updateTenantModulesInDB, mesma função usada pelo painel master de
// Configurações → Módulos) e cria um funil real (crm_funis, via addFunil do
// DataContext) — nada é decorativo ou só front-end.
export function OnboardingWizard() {
  const { user } = useAuth();
  const { appSettings, appSettingsLoaded, saveAppSetting, addFunil, setSidebarModules } = useData();

  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Desativado por ora: DEMO_PRESETS cobre só 5 nichos (Varejo/Solar/Clínica/
  // Imobiliária/Automotivo), bem menos que os nichos reais suportados no restante do
  // app (ver NICHES em NovoTenantModal.tsx) — mostrar a lista incompleta
  // como se fosse definitiva confundia o onboarding. Reativar quando os
  // presets cobrirem todos os nichos.
  const DISABLED = true;

  const alreadyCompleted = Boolean(appSettings?.onboarding_completed);
  const shouldShow = !DISABLED && appSettingsLoaded && !alreadyCompleted && !dismissed && user && !user.isMaster;

  if (!shouldShow) return null;

  const selected = DEMO_PRESETS.find((p) => p.id === selectedId) || null;

  const finish = async () => {
    await saveAppSetting("onboarding_completed", true);
    setDismissed(true);
  };

  const handleSkip = () => {
    finish();
  };

  const handleApply = async () => {
    if (!selected || !user?.tenantName) return;
    setApplying(true);
    try {
      const result = await updateTenantModulesInDB(user.tenantName, selected.modules);
      if (!result.success) {
        toast.error("Erro ao ativar módulos — tente novamente ou configure manualmente depois.");
      } else {
        setSidebarModules(selected.modules as any);
      }

      await addFunil({
        nome: `Funil Comercial — ${selected.name}`,
        tipo: "comercial",
        ativo: true,
        etapas: selected.stages.map((s) => s.name),
        etapasConfig: selected.stages.map((s, i) => ({
          cor: STAGE_COLORS[i % STAGE_COLORS.length],
          nome: s.name,
          iniciarMinimizado: false,
        })),
      });

      toast.success(`Preset "${selected.name}" aplicado! Módulos ativados e funil comercial criado.`);
      await finish();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao aplicar preset.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-[var(--color-border-subtle)] flex items-center justify-between bg-[var(--color-surface-sunken)]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--color-primary-blue)]" />
            <div>
              <h2 className="text-base font-black text-[var(--color-text-primary)]">Bem-vindo ao S.P.Y. CRM</h2>
              <p className="text-xs text-[var(--color-text-muted)]">Vamos configurar sua empresa em 2 passos rápidos.</p>
            </div>
          </div>
          <button onClick={handleSkip} className="w-8 h-8 rounded-full bg-[var(--color-surface)] border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70dvh] overflow-y-auto">
          {step === "pick" && (
            <>
              <p className="text-xs text-[var(--color-text-muted)]">
                Escolha o modelo mais parecido com o seu negócio. Isso ativa os módulos certos e cria um funil de vendas inicial — você pode ajustar tudo depois.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DEMO_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  const isSelected = selectedId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedId(preset.id)}
                      className={`text-left p-4 rounded-xl border transition-all ${isSelected ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] hover:border-[var(--color-border-strong)]"}`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${preset.bgAccent}`}>
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <p className="text-xs font-bold text-[var(--color-text-primary)]">{preset.name}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-1 line-clamp-2">{preset.description}</p>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between items-center pt-2">
                <button onClick={handleSkip} className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]">
                  Pular por agora
                </button>
                <Button disabled={!selected} onClick={() => setStep("confirm")} className="h-9 px-4 text-xs font-bold gap-1.5">
                  Continuar <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </>
          )}

          {step === "confirm" && selected && (
            <>
              <p className="text-xs text-[var(--color-text-muted)]">
                Confirme o que será ativado para <strong className="text-[var(--color-text-primary)]">{user?.tenantName}</strong>:
              </p>
              <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] p-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Módulos ativados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(selected.modules).filter(([, v]) => v).map(([k]) => (
                      <span key={k} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">{k}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Funil comercial inicial</p>
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                    {selected.stages.map((s, i) => (
                      <span key={s.id} className="flex items-center gap-1">
                        <span className="font-semibold text-[var(--color-text-primary)]">{s.name}</span>
                        {i < selected.stages.length - 1 && <ChevronRight className="w-3 h-3" />}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center pt-2">
                <button onClick={() => setStep("pick")} className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]">
                  Voltar
                </button>
                <Button onClick={handleApply} disabled={applying} className="h-9 px-4 text-xs font-bold gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {applying ? "Aplicando..." : "Aplicar e Concluir"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
