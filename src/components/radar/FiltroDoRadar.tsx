/** Campos da pesquisa do Radar: tipo de empresa, cidades e quantidade, com o saldo do dia. */
import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "../ui/button";
import type { CidadeEscolhida, FiltroRadar } from "../../lib/buscaRadar";

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const TIPOS = ["clínicas odontológicas", "academias", "escritórios de contabilidade", "pet shops", "restaurantes", "materiais de construção", "imobiliárias", "oficinas mecânicas"];
export const MAX_CIDADES = 5;
const campo = "h-9 px-3 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";

export function FiltroDoRadar({ api, ocupado, restante, onSaldo, onBuscar }: {
  api: (path: string, init?: RequestInit) => Promise<Response>;
  ocupado: boolean;
  /** Quantos resultados ainda cabem hoje (null = ainda não se sabe). */
  restante: number | null;
  onSaldo: (restante: number) => void;
  onBuscar: (f: FiltroRadar) => void;
}) {
  const [tipo, setTipo] = useState("");
  const [uf, setUf] = useState("");
  const [lista, setLista] = useState<string[]>([]);
  const [cidades, setCidades] = useState<CidadeEscolhida[]>([]);
  const [quantidade, setQuantidade] = useState("10");
  const [falha, setFalha] = useState(false);
  const chamar = useRef(api); chamar.current = api;
  const saldo = useRef(onSaldo); saldo.current = onSaldo;

  useEffect(() => {
    let vale = true;
    chamar.current("/api/radar/limite").then((r) => (r.ok ? r.json() : null)).then((j) => { if (vale && typeof j?.restante === "number") saldo.current(j.restante); }).catch(() => {});
    return () => { vale = false; };
  }, []);
  useEffect(() => {
    setLista([]); setFalha(false);
    if (!uf) return;
    let vale = true;
    chamar.current(`/api/prospeccao/municipios?uf=${uf}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { if (vale) setLista((j.municipios ?? []).map((m: any) => m.nome)); }).catch(() => { if (vale) setFalha(true); });
    return () => { vale = false; };
  }, [uf]);

  const acabou = restante === 0;
  const cheio = cidades.length >= MAX_CIDADES;
  const buscar = () => { if (!ocupado && !acabou) onBuscar({ tipo, cidades, quantidade: Number(quantidade) }); };
  const juntar = (cidade: string) => { if (cidade && !cheio && !cidades.some((c) => c.cidade === cidade && c.uf === uf)) setCidades([...cidades, { cidade, uf }]); };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 flex-1 min-w-[200px] text-[11px] font-bold text-[var(--color-text-muted)]">Tipo de empresa
          <input list="radar-tipos" value={tipo} onChange={(e) => setTipo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }} maxLength={120} placeholder="Ex.: clínicas odontológicas" className={campo} />
          <datalist id="radar-tipos">{TIPOS.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Estado
          <select value={uf} onChange={(e) => setUf(e.target.value)} className={campo}><option value="">UF</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 min-w-[170px] text-[11px] font-bold text-[var(--color-text-muted)]">Cidade (até {MAX_CIDADES})
          <select value="" onChange={(e) => juntar(e.target.value)} disabled={!lista.length || cheio} className={campo}>
            <option value="">{!uf ? "Escolha o estado" : falha ? "Não carregou" : !lista.length ? "Carregando…" : cheio ? "Limite de cidades" : "Adicionar cidade"}</option>
            {lista.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Por cidade
          <select value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={campo}>{["5", "10", "15", "20"].map((q) => <option key={q} value={q}>{q}</option>)}</select>
        </label>
        <Button type="button" onClick={buscar} disabled={ocupado || acabou} className="h-9 px-4 text-xs font-bold gap-1.5">{ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Pesquisar</Button>
      </div>
      {cidades.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cidades.map((c) => (
            <button key={`${c.cidade}/${c.uf}`} type="button" aria-label={`Tirar ${c.cidade}/${c.uf}`} onClick={() => setCidades(cidades.filter((x) => x !== c))}
              className="inline-flex items-center gap-1 rounded-full border-0 bg-[var(--color-primary-blue)]/10 px-2.5 py-1 text-[11px] font-bold text-[var(--color-primary-blue)] cursor-pointer">{c.cidade}/{c.uf} <X className="w-3 h-3" /></button>
          ))}
        </div>
      )}
      {restante !== null && (
        <p role="status" className={`text-[11px] ${acabou ? "font-bold text-amber-700 dark:text-amber-400" : "text-[var(--color-text-muted)]"}`}>
          {acabou ? "O limite de 50 empresas por dia foi atingido. Volta amanhã." : `Restam ${restante} de 50 empresas hoje.`}
        </p>
      )}
    </div>
  );
}
