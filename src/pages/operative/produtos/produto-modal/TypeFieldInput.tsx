import type { TypeField, TypeAttrs } from "../typeSchemas";

const inputCls = "w-full bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#2563EB]/40 font-medium transition-all";
const labelCls = "text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider";

/** Renderiza um campo do registro de tipos (typeSchemas.ts) — compartilhado pelas abas Cadastro e Estoque. */
export function TypeFieldInput({ field: f, attrs, setAttr }: {
  field: TypeField;
  attrs: TypeAttrs;
  setAttr: (key: string, value: string | number | boolean) => void;
}) {
  const attr = attrs[f.key];
  const wrap = f.width === "full" ? "sm:col-span-2 " : "";
  if (f.kind === "bool") {
    const id = `attr-${f.key}`;
    const checked = attr === undefined ? !!f.defaultBool : !!attr;
    return (
      <div className={`${wrap}flex items-center gap-2.5 pt-1`}>
        <input type="checkbox" id={id} checked={checked} onChange={(e) => setAttr(f.key, e.target.checked)}
          className="w-4 h-4 rounded border-white/20 bg-slate-900 focus:ring-[#2563EB] cursor-pointer" />
        <label htmlFor={id} className="text-xs font-bold text-white cursor-pointer select-none">{f.label}</label>
      </div>
    );
  }
  return (
    <div className={`${wrap}space-y-1.5`}>
      <label className={labelCls}>{f.label}</label>
      {f.kind === "select" ? (
        <select value={(attr as string) || f.defaultValue || ""} onChange={(e) => setAttr(f.key, e.target.value)} className={inputCls}>
          {(f.options || []).map(o => <option key={o} value={o}>{f.optionLabels?.[o] ?? o}</option>)}
        </select>
      ) : f.kind === "textarea" ? (
        <textarea value={(attr as string) || ""} onChange={(e) => setAttr(f.key, e.target.value)} placeholder={f.placeholder} className={`${inputCls} h-16`} />
      ) : f.kind === "number" || f.kind === "money" ? (
        <input type="number" step="any" value={(attr as number) ?? ""}
          onChange={(e) => setAttr(f.key, e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
          placeholder={f.placeholder ?? (f.kind === "money" ? "R$ 0,00" : undefined)} className={inputCls} />
      ) : f.kind === "date" ? (
        <input type="date" value={(attr as string) || ""} onChange={(e) => setAttr(f.key, e.target.value)} className={inputCls} />
      ) : (
        <input type="text" value={(attr as string) || ""} maxLength={f.maxLength}
          inputMode={f.digitsOnly ? "numeric" : undefined}
          onChange={(e) => setAttr(f.key, f.digitsOnly ? e.target.value.replace(/\D/g, "") : e.target.value)}
          placeholder={f.placeholder} className={inputCls} />
      )}
    </div>
  );
}
