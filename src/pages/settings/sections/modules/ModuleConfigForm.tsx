import { useEffect, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Switch } from "../../../../components/ui/switch";
import { useData } from "../../../../contexts/DataContext";
import { mergeModuleConfig, type ModuleDef, type SectionDef } from "../../../../lib/moduleConfig";

const inputCls =
  "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary-blue)]";

/** Formulário genérico de uma seção de `varejo_config` (lê/salva em app_settings, por empresa). */
export function ModuleConfigForm({ module, section, footer }: { module: ModuleDef; section: SectionDef; footer?: ReactNode }) {
  const { id: sectionId, title, subtitle, fields, validate } = section;
  const { appSettings, appSettingsLoaded, saveAppSetting } = useData();
  const [draft, setDraft] = useState<any>(() => mergeModuleConfig<any>(module.defaults, appSettings?.[module.storeKey])[sectionId]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(mergeModuleConfig<any>(module.defaults, appSettings?.[module.storeKey])[sectionId]);
  }, [appSettings, sectionId, dirty, module]);

  const set = (key: string, value: unknown) => { setDraft((d: any) => ({ ...d, [key]: value })); setDirty(true); };

  const salvar = async () => {
    const erro = validate?.(draft);
    if (erro) { toast.error(erro); return; }
    setSaving(true);
    try {
      const atual = mergeModuleConfig<any>(module.defaults, appSettings?.[module.storeKey]);
      await saveAppSetting(module.storeKey, { ...atual, [sectionId]: draft });
      setDirty(false);
      toast.success("Configurações salvas.");
    } catch {
      toast.error("Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{subtitle}</p>
      </div>

      <Card className="p-6 space-y-5">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            {f.kind === "toggle" ? (
              <Switch checked={!!draft[f.key]} onCheckedChange={(v) => set(f.key, v)} label={f.label} description={f.hint} />
            ) : (
              <>
                <label className="text-sm font-medium text-[var(--color-text-primary)]">{f.label}</label>
                {f.kind === "number" && (
                  <div className="flex items-center gap-2">
                    <input type="number" min={f.min} max={f.max} value={draft[f.key] ?? 0} className={`${inputCls} max-w-[160px]`}
                      onChange={(e) => set(f.key, e.target.value === "" ? 0 : Number(e.target.value))} />
                    {f.suffix && <span className="text-sm text-[var(--color-text-muted)]">{f.suffix}</span>}
                  </div>
                )}
                {f.kind === "text" && (f.multiline
                  ? <textarea rows={3} value={draft[f.key] ?? ""} placeholder={f.placeholder} className={inputCls} onChange={(e) => set(f.key, e.target.value)} />
                  : <input type="text" value={draft[f.key] ?? ""} placeholder={f.placeholder} className={inputCls} onChange={(e) => set(f.key, e.target.value)} />)}
                {f.kind === "select" && (
                  <select value={draft[f.key] ?? ""} className={`${inputCls} max-w-xs`} onChange={(e) => set(f.key, e.target.value)}>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                {f.kind === "multi" && (
                  <div className="flex flex-wrap gap-2">
                    {f.options.map((o) => {
                      const on = (draft[f.key] as string[]).includes(o);
                      return (
                        <button key={o} type="button" onClick={() => set(f.key, on ? (draft[f.key] as string[]).filter((x) => x !== o) : [...draft[f.key], o])}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "border-[var(--color-border-default)] text-[var(--color-text-muted)]"}`}>
                          {o}
                        </button>
                      );
                    })}
                  </div>
                )}
                {f.kind === "tags" && (
                  <input type="text" value={(draft[f.key] as string[]).join(", ")} className={inputCls}
                    onChange={(e) => set(f.key, e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
                )}
                {f.hint && <p className="text-xs text-[var(--color-text-muted)]">{f.hint}</p>}
              </>
            )}
          </div>
        ))}
        {footer}
        <div className="pt-4 border-t border-[var(--color-border-subtle)] flex justify-end">
          <Button onClick={salvar} disabled={saving || !dirty || !appSettingsLoaded} className="gap-2">
            <Save className="w-4 h-4" /> {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
