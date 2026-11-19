import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { TIPOS_CAMPO, type CampoForm, type TipoCampo } from "../../../../lib/formularioCampos";

export const campoInput = "w-full bg-[var(--color-surface)] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-orange-500 focus:outline-none";
const input = campoInput;

/** Lista editável de perguntas (formulários e landing pages criados no sistema). */
export function CamposLista({ campos, setCampos }: { campos: CampoForm[]; setCampos: React.Dispatch<React.SetStateAction<CampoForm[]>> }) {
  const atualizar = (i: number, patch: Partial<CampoForm>) => setCampos((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const mover = (i: number, d: -1 | 1) => setCampos((c) => { const n = [...c]; const j = i + d; if (j < 0 || j >= n.length) return c; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const adicionar = () => setCampos((c) => [...c, { id: `campo_${Date.now().toString(36)}`, label: "Nova pergunta", tipo: "texto", obrigatorio: false }]);
  return (
      <div className="space-y-2">
        {campos.map((c, i) => (
          <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
              <input className={input} value={c.label} maxLength={120} onChange={(e) => atualizar(i, { label: e.target.value })} aria-label="Título da pergunta" />
              <select className={input} value={c.tipo} onChange={(e) => atualizar(i, { tipo: e.target.value as TipoCampo, opcoes: e.target.value === "opcoes" ? (c.opcoes?.length ? c.opcoes : ["Opção 1", "Opção 2"]) : undefined })}>
                {TIPOS_CAMPO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            {c.tipo === "opcoes" && <textarea className={input} rows={3} value={(c.opcoes ?? []).join("\n")} onChange={(e) => atualizar(i, { opcoes: e.target.value.split("\n") })} placeholder="Uma opção por linha" />}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" checked={c.obrigatorio} onChange={(e) => atualizar(i, { obrigatorio: e.target.checked })} />Obrigatório</label>
              <div className="flex gap-1">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30" aria-label="Subir"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === campos.length - 1} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30" aria-label="Descer"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => setCampos((x) => x.filter((_, j) => j !== i))} disabled={campos.length <= 1} className="p-1.5 text-slate-400 hover:text-rose-400 disabled:opacity-30" aria-label="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={adicionar} disabled={campos.length >= 30} className="w-full h-10 rounded-xl border border-dashed border-white/15 text-[11px] font-black uppercase tracking-wider text-slate-400 hover:text-white hover:border-white/30 flex items-center justify-center gap-1.5"><Plus className="w-3.5 h-3.5" />Adicionar pergunta</button>
      </div>

  );
}
