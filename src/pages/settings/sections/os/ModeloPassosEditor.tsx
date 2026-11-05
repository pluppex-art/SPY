import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { OS_PASSOS_SUGERIDOS } from "../../../os/osTypes";
import { useModeloPassos } from "../../../os/hooks/useOsPassos";
import { toast } from "sonner";

const inputCls = "flex-1 min-w-0 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const iconBtn = "w-7 h-7 shrink-0 flex items-center justify-center rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] cursor-pointer disabled:opacity-30 disabled:cursor-default";

/** Modelo do passo a passo de um departamento: toda OS nova do departamento nasce com estes passos. */
export function ModeloPassosEditor({ departamentoId, nome }: { departamentoId: string; nome: string }) {
  const { titulos, carregando, salvar } = useModeloPassos(departamentoId);
  const [lista, setLista] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setLista(titulos); }, [titulos]);

  const sugestao = Object.entries(OS_PASSOS_SUGERIDOS).find(([k]) => k.toLowerCase() === nome.trim().toLowerCase())?.[1];
  const mudou = JSON.stringify(lista.map(t => t.trim()).filter(Boolean)) !== JSON.stringify(titulos);
  const mover = (i: number, d: -1 | 1) => setLista(prev => { const n = [...prev]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  const gravar = async () => {
    setSalvando(true);
    if (await salvar(lista)) toast.success("Modelo salvo. Vale para as próximas OS deste departamento.");
    setSalvando(false);
  };

  return (
    <div className="border-t border-[var(--color-border-subtle)] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-[var(--color-text-primary)]"><ListChecks className="w-4 h-4" /> Passo a passo do departamento</p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Cada OS nova de {nome} nasce com estes passos. Quem pega o passo vira o responsável.</p>
        </div>
        {sugestao && (
          <Button variant="outline" onClick={() => setLista(sugestao)} className="h-8 gap-1.5 text-[11px] font-bold">
            <Wand2 className="w-3.5 h-3.5" /> Carregar sugestão
          </Button>
        )}
      </div>

      {carregando && <p className="text-xs text-[var(--color-text-faint)]">Carregando...</p>}
      {!carregando && lista.length === 0 && <p className="text-xs text-[var(--color-text-faint)]">Nenhum passo no modelo. {sugestao ? 'Use "Carregar sugestão" ou adicione abaixo.' : "Adicione abaixo."}</p>}

      <ol className="space-y-1.5 m-0 p-0 list-none">
        {lista.map((t, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-6 text-right text-[10px] font-bold text-[var(--color-text-faint)] shrink-0">{i + 1}</span>
            <input value={t} onChange={e => setLista(prev => prev.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Passo ${i + 1}`} className={inputCls} />
            <button type="button" className={iconBtn} disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp className="w-3.5 h-3.5" /></button>
            <button type="button" className={iconBtn} disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Descer"><ArrowDown className="w-3.5 h-3.5" /></button>
            <button type="button" className={iconBtn} onClick={() => setLista(prev => prev.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setLista(prev => [...prev, ""])} className="h-8 gap-1.5 text-[11px] font-bold"><Plus className="w-3.5 h-3.5" /> Adicionar passo</Button>
        <Button onClick={gravar} disabled={!mudou || salvando} className="h-8 text-[11px] font-bold">{salvando ? "Salvando..." : "Salvar modelo"}</Button>
      </div>
    </div>
  );
}
