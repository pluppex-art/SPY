import { useState, useEffect } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import {
  Sliders, Sun, Moon, Laptop, Globe, Palette,
  Volume2, VolumeX, Columns3, Check, Save
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../contexts/AuthContext";
import { useData } from "../../../../contexts/DataContext";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { BRAND_COLORS, MIN_BRAND_CONTRAST, contrastWithWhite, normalizeBrandHex } from "../../../../lib/theme";
import { Logo } from "../../../../components/ui/Logo";

const PREF_KEY = "systemPreferences";

interface SystemPreferences {
  theme: "light" | "dark" | "system";
  language: string;
  currency: string;
  soundEnabled: boolean;
  defaultCrmView: "kanban" | "list";
}

const DEFAULT_PREFS: SystemPreferences = {
  theme: "dark",
  language: "pt-BR",
  currency: "BRL",
  soundEnabled: true,
  defaultCrmView: "kanban",
};

export function ConfigPreferenciasSistema() {
  const { user, updatePreferences } = useAuth();
  const { tenantPrimaryColor, updateTenantPrimaryColor } = useData();
  const { t, setLanguage, setCurrency, ratesLoading, ratesStale } = useLocalization();
  const canEditBrandColor = !!(user?.isMaster || user?.isTenantAdmin);
  const [prefs, setPrefs] = useState<SystemPreferences>({
    ...DEFAULT_PREFS,
    ...(user?.preferences?.[PREF_KEY] || {}),
  });

  useEffect(() => {
    if (user?.preferences?.[PREF_KEY]) {
      setPrefs({ ...DEFAULT_PREFS, ...user.preferences[PREF_KEY] });
    }
  }, [user?.preferences]);

  const persist = (updated: SystemPreferences) => {
    setPrefs(updated);
    updatePreferences({ [PREF_KEY]: updated, theme: updated.theme === "system" ? "dark" : updated.theme });
  };

  const handleLanguageChange = (lang: string) => {
    const updated = { ...prefs, language: lang };
    persist(updated);
    setLanguage(lang as "pt-BR" | "en-US" | "es-ES");
    const labels: Record<string, string> = {
      "pt-BR": "Português (Brasil)",
      "en-US": "English (United States)",
      "es-ES": "Español",
    };
    toast.success(`Idioma da plataforma definido para ${labels[lang] || lang}`);
  };

  const handleCurrencyChange = (curr: string) => {
    const updated = { ...prefs, currency: curr };
    persist(updated);
    setCurrency(curr as "BRL" | "USD" | "EUR");
    const labels: Record<string, string> = {
      BRL: "Real Brasileiro (R$ - BRL)",
      USD: "Dólar Americano ($ - USD)",
      EUR: "Euro (€ - EUR)",
    };
    toast.success(`Moeda padrão definida para ${labels[curr] || curr}`);
  };

  const applyTheme = (newTheme: "light" | "dark" | "system") => {
    persist({ ...prefs, theme: newTheme });

    const root = document.documentElement;
    if (newTheme === "dark") {
      root.classList.add("dark");
    } else if (newTheme === "light") {
      root.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) root.classList.add("dark");
      else root.classList.remove("dark");
    }
  };

  const handleSave = () => {
    persist(prefs);
    toast.success("Preferências do sistema salvas com sucesso!");
  };

  const handlePickBrandColor = async (hex: string) => {
    if (!canEditBrandColor || hex === tenantPrimaryColor) return;
    const result = await updateTenantPrimaryColor(hex);
    if (result.success) toast.success("Cor do tema atualizada.");
  };

  // Cor personalizada: o cliente escolhe qualquer cor (seletor ou hex). Só grava ao "Aplicar".
  const isPresetColor = BRAND_COLORS.some((c) => c.hex.toLowerCase() === tenantPrimaryColor.toLowerCase());
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState(tenantPrimaryColor);
  const customHex = normalizeBrandHex(customInput);
  const customContrast = customHex ? contrastWithWhite(customHex) : 0;
  const customTooLight = !!customHex && customContrast < MIN_BRAND_CONTRAST;
  const applyCustomColor = async () => {
    if (!customHex || customTooLight) return;
    await handlePickBrandColor(customHex);
    setCustomOpen(false);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          {t("Preferências do Sistema")} <Sliders className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t("Personalize a interface, modos de visualização, idioma, moeda e alertas visuais do S.P.Y..")}
        </p>
      </div>

      {/* Theme Selector */}
      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 pb-2 border-b border-[var(--color-border-subtle)]">
          <Sun className="w-4 h-4 text-[var(--color-primary-blue)]" /> {t("Aparência & Tema")}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { id: "dark", label: "Modo Escuro (Dark)", icon: Moon, desc: "Tema padrão com alto contraste" },
            { id: "light", label: "Modo Claro (Light)", icon: Sun, desc: "Superfície clara para ambientes iluminados" },
            { id: "system", label: "Seguir Sistema", icon: Laptop, desc: "Alterna automaticamente com o SO" },
          ].map((opt) => {
            const isSelected = prefs.theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => applyTheme(opt.id as any)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isSelected
                    ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)] text-[var(--color-primary-blue)] shadow-xs"
                    : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:border-[var(--color-border-default)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <opt.icon className={`w-5 h-5 ${isSelected ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)]"}`} />
                  {isSelected && <Check className="w-4 h-4 text-[var(--color-primary-blue)]" />}
                </div>
                <div>
                  <p className="text-xs font-bold">{t(opt.label)}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{t(opt.desc)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Brand Color */}
      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 pb-2 border-b border-[var(--color-border-subtle)]">
          <Palette className="w-4 h-4 text-[var(--color-primary-blue)]" /> {t("Cor de marca")}
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] -mt-2">
          {t("Cor de destaque do S.P.Y. para a sua empresa. Vale para todos os usuários deste tenant.")}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {BRAND_COLORS.map((c) => {
            const isSelected = tenantPrimaryColor.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.id}
                type="button"
                disabled={!canEditBrandColor}
                onClick={() => handlePickBrandColor(c.hex)}
                className={`p-4 rounded-xl border text-left transition-all flex flex-col items-center gap-3 ${
                  isSelected
                    ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 shadow-xs"
                    : "border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:border-[var(--color-border-default)]"
                } ${canEditBrandColor ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full shadow-inner" style={{ backgroundColor: c.hex }} />
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-primary-blue)] flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-xs font-bold text-[var(--color-text-primary)]">{c.label}</p>
              </button>
            );
          })}

          {/* Personalizada */}
          <button
            type="button"
            disabled={!canEditBrandColor}
            onClick={() => { setCustomInput(tenantPrimaryColor); setCustomOpen((v) => !v); }}
            className={`p-4 rounded-xl border text-left transition-all flex flex-col items-center gap-3 ${
              !isPresetColor
                ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 shadow-xs"
                : "border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:border-[var(--color-border-default)]"
            } ${canEditBrandColor ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
          >
            <div className="relative">
              <div
                className="w-10 h-10 rounded-full shadow-inner"
                style={!isPresetColor
                  ? { backgroundColor: tenantPrimaryColor }
                  : { background: "conic-gradient(#f43f5e, #f59e0b, #10b981, #06b6d4, #2563eb, #7c3aed, #f43f5e)" }}
              />
              {!isPresetColor && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-primary-blue)] flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </div>
            <p className="text-xs font-bold text-[var(--color-text-primary)]">{t("Personalizar")}</p>
          </button>
        </div>

        {customOpen && canEditBrandColor && (
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] p-4 space-y-3 animate-in fade-in duration-200">
            <p className="text-xs font-bold text-[var(--color-text-primary)]">{t("Escolha qualquer cor para a sua marca")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={customHex ?? tenantPrimaryColor}
                onChange={(e) => setCustomInput(e.target.value)}
                className="w-12 h-10 rounded-lg border border-[var(--color-border-default)] bg-transparent cursor-pointer p-0.5"
                aria-label={t("Seletor de cor")}
              />
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="#2563EB"
                maxLength={7}
                className="w-32 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
              {customHex && (
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ backgroundColor: customHex, color: customTooLight ? "#0f172a" : "#ffffff" }}
                >
                  {t("Prévia do botão")}
                </span>
              )}
              <Button type="button" onClick={applyCustomColor} disabled={!customHex || customTooLight} className="h-9 px-4 text-xs font-medium">
                {t("Aplicar cor")}
              </Button>
            </div>
            {!customHex && customInput.trim() !== "" && (
              <p className="text-[11px] text-danger">{t("Digite uma cor válida no formato #RRGGBB (ex.: #0EA5E9).")}</p>
            )}
            {customTooLight && (
              <p className="text-[11px] text-warning">{t("Essa cor é clara demais: o texto branco dos botões e do menu ficaria ilegível. Escolha uma cor mais escura.")}</p>
            )}
          </div>
        )}

        {!canEditBrandColor && (
          <p className="text-xs text-[var(--color-text-faint)]">
            {t("Só administradores da empresa podem alterar a cor de marca.")}
          </p>
        )}

        <div className="flex items-center gap-4 p-5 rounded-xl bg-[#0B1120] shadow-[0_0_28px_-8px_var(--color-primary-blue)]">
          <Logo variant="full" color={tenantPrimaryColor} size={40} />
        </div>
        <p className="text-[11px] text-[var(--color-text-faint)] -mt-2">
          {t("É assim que sua marca aparece no modo escuro — o brilho acompanha a cor escolhida.")}
        </p>
      </Card>

      {/* Regional & Formats */}
      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 pb-2 border-b border-[var(--color-border-subtle)]">
          <Globe className="w-4 h-4 text-[var(--color-primary-blue)]" /> {t("Idioma & Moeda")}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 block">{t("Idioma da Plataforma")}</label>
            <select
              value={prefs.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-medium"
            >
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en-US">English (United States)</option>
              <option value="es-ES">Español</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 block">{t("Moeda Padrão")}</label>
            <select
              value={prefs.currency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-medium"
            >
              <option value="BRL">Real Brasileiro (R$ - BRL)</option>
              <option value="USD">Dólar Americano ($ - USD)</option>
              <option value="EUR">Euro (€ - EUR)</option>
            </select>
            <p className="text-[10px] text-[var(--color-text-faint)] mt-1.5 flex items-center gap-1">
              {ratesLoading
                ? t("Atualizando cotação...")
                : ratesStale
                ? t("Não foi possível atualizar a cotação agora — usando o último valor conhecido.")
                : t("Conversão com cotação de câmbio em tempo real.")}
            </p>
          </div>
        </div>
      </Card>

      {/* CRM & Workspace Experience */}
      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 pb-2 border-b border-[var(--color-border-subtle)]">
          <Columns3 className="w-4 h-4 text-[var(--color-primary-blue)]" /> {t("Visualização & Alertas do CRM")}
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
            <div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">{t("Visualização Inicial do Pipeline")}</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">{t("Escolha entre visão Kanban (colunas) ou Lista tabular ao abrir o CRM.")}</p>
            </div>
            <div className="flex gap-1.5 bg-[var(--color-surface-elevated)] p-1 rounded-lg border border-[var(--color-border-default)]">
              <button
                type="button"
                onClick={() => persist({ ...prefs, defaultCrmView: "kanban" })}
                className={`px-3 py-1 text-xs font-bold rounded cursor-pointer transition-all ${prefs.defaultCrmView === "kanban" ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
              >
                Kanban
              </button>
              <button
                type="button"
                onClick={() => persist({ ...prefs, defaultCrmView: "list" })}
                className={`px-3 py-1 text-xs font-bold rounded cursor-pointer transition-all ${prefs.defaultCrmView === "list" ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
              >
                {t("Lista")}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
            <div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">{t("Alertas Sonoros")}</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">{t("Emitir som sutil ao receber novo lead ou notificação urgente.")}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const updated = { ...prefs, soundEnabled: !prefs.soundEnabled };
                persist(updated);
                toast.info(updated.soundEnabled ? "Sons ativados!" : "Sons desativados.");
              }}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${prefs.soundEnabled ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/30 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] text-[var(--color-text-muted)]"}`}
            >
              {prefs.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-3">
          <Button onClick={handleSave} className="h-9 px-5 text-xs font-bold gap-1.5 shadow-xs">
            <Save className="w-3.5 h-3.5" /> {t("Salvar Preferências")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
