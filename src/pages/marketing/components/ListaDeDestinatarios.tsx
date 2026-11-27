/** Quem vai receber: marcar vários (ou todos os mostrados) e retirar de uma vez, ou um por um. */
import { useEffect, useRef, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";

export interface Destinatario { email: string; name: string }

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ListaDeDestinatarios({ itens, onRetirar }: { itens: Destinatario[]; onRetirar: (emails: string[]) => void }) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const todos = useRef<HTMLInputElement>(null);
  const visiveis = busca ? itens.filter((d) => semAcento(`${d.email} ${d.name}`).includes(semAcento(busca))) : itens;
  // Só o que está à vista é retirado: nada escondido pela busca (ou que saiu do público) vai junto sem a pessoa ver.
  const escolhidos = visiveis.filter((d) => marcados.has(d.email)).map((d) => d.email);
  const tudo = visiveis.length > 0 && escolhidos.length === visiveis.length;

  useEffect(() => {
    if (todos.current) todos.current.indeterminate = escolhidos.length > 0 && !tudo;
  }, [escolhidos.length, tudo]);

  const mudar = (emails: string[], marcar: boolean) => setMarcados((antes) => {
    const novo = new Set(antes);
    for (const e of emails) { if (marcar) novo.add(e); else novo.delete(e); }
    return novo;
  });
  const retirar = () => { onRetirar(escolhidos); mudar(escolhidos, false); };

  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
      <label className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-border-subtle)]">
        <Search className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-faint)]" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar destinatário"
          className="w-full bg-transparent border-0 outline-none p-0 text-xs text-[var(--color-text-primary)]" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]">
        <label className="flex items-center gap-2 font-bold text-[var(--color-text-primary)] cursor-pointer">
          <input ref={todos} type="checkbox" checked={tudo} disabled={!visiveis.length} onChange={(e) => mudar(visiveis.map((d) => d.email), e.target.checked)} />
          {escolhidos.length ? `${escolhidos.length} selecionado${escolhidos.length > 1 ? "s" : ""}` : busca ? "Selecionar os encontrados" : "Selecionar todos"}
        </label>
        <Button type="button" variant="danger" onClick={retirar} disabled={!escolhidos.length} className="h-7 px-2.5 text-[11px] gap-1">
          <Trash2 className="w-3 h-3" /> Retirar selecionados{escolhidos.length ? ` (${escolhidos.length})` : ""}
        </Button>
      </div>
      <ul className="max-h-52 overflow-auto divide-y divide-[var(--color-border-subtle)] m-0 p-0 list-none">
        {visiveis.map((d) => (
          <li key={d.email} className={`flex items-center justify-between gap-2 px-2 py-1.5 ${marcados.has(d.email) ? "bg-[var(--color-primary-blue)]/10" : ""}`}>
            <label className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={marcados.has(d.email)} onChange={(e) => mudar([d.email], e.target.checked)} />
              <span className="truncate"><span className="text-[var(--color-text-primary)] font-medium">{d.email}</span>{d.name && <span> · {d.name}</span>}</span>
            </label>
            <button type="button" aria-label={`Retirar ${d.email}`} onClick={() => onRetirar([d.email])} className="shrink-0 font-bold text-[var(--color-danger)] bg-transparent border-none cursor-pointer">Retirar</button>
          </li>))}
        {visiveis.length === 0 && <li className="px-3 py-3 text-[var(--color-text-faint)]">{busca ? "Ninguém encontrado." : "Ninguém na lista."}</li>}
      </ul>
    </div>
  );
}
