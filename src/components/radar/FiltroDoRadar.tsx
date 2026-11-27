/** Campos da pesquisa do Radar: por CNAE (Receita) ou por tipo (Google Maps), cidades, quantidade e o saldo do dia. */
import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { CidadeEscolhida, FiltroRadar } from "../../lib/buscaRadar";

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const TIPOS = ["clínicas odontológicas", "academias", "escritórios de contabilidade", "pet shops", "restaurantes", "materiais de construção", "imobiliárias", "oficinas mecânicas"];
/** Atividades mais procuradas; qualquer outra entra digitando o código. */
export const ATIVIDADES: [string, string][] = [
  ["5611201", "Restaurantes"], ["9313100", "Academias"], ["8630504", "Clínicas odontológicas"], ["8630503", "Consultórios médicos"],
  ["6920601", "Escritórios de contabilidade"], ["4744099", "Materiais de construção"], ["6821801", "Imobiliárias (compra e venda)"],
  ["4520001", "Oficinas mecânicas"], ["4789004", "Pet shops"], ["9602501", "Salões de beleza"], ["4781400", "Lojas de roupas"],
  ["4771701", "Farmácias"], ["4712100", "Mercados e mercearias"],
];
export const MAX_CIDADES = 5;
const campo = "h-9 px-3 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";
const rotulo = "flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]";
/** 5611201 → 56.11-2-01, enquanto digita. */
const mascara = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 7); return [d.slice(0, 2), d.length > 2 ? `.${d.slice(2, 4)}` : "", d.length > 4 ? `-${d.slice(4, 5)}` : "", d.length > 5 ? `-${d.slice(5)}` : ""].join(""); };

export function FiltroDoRadar({ api, ocupado, restante, onSaldo, onBuscar }: {
  api: (path: string, init?: RequestInit) => Promise<Response>;
  ocupado: boolean;
  /** Quantos resultados ainda cabem hoje (null = ainda não se sabe). */
  restante: number | null;
  onSaldo: (restante: number) => void;
  onBuscar: (f: FiltroRadar) => void;
}) {
  const [modo, setModo] = useState<FiltroRadar["modo"]>("cnae");
  const [atividade, setAtividade] = useState("");
  const [outro, setOutro] = useState("");
  const [tipo, setTipo] = useState("");
  const [uf, setUf] = useState("");
  const [lista, setLista] = useState<{ id: string; nome: string }[]>([]);
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
    chamar.current(`/api/prospeccao/municipios?uf=${uf}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { if (vale) setLista(j.municipios ?? []); }).catch(() => { if (vale) setFalha(true); });
    return () => { vale = false; };
  }, [uf]);

  const acabou = restante === 0;
  const cheio = cidades.length >= MAX_CIDADES;
  const buscar = () => { if (!ocupado && !acabou) onBuscar({ modo, cnae: atividade === "outro" ? outro : atividade, tipo, cidades, quantidade: Number(quantidade) }); };
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } };
  const juntar = (id: string) => { const m = lista.find((x) => x.id === id); if (m && !cheio && !cidades.some((c) => c.id === id)) setCidades([...cidades, { id, cidade: m.nome, uf }]); };

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Como pesquisar" className="flex flex-wrap gap-1.5">
        {([["cnae", "Por CNAE (Receita Federal)"], ["mapa", "Por tipo (Google Maps)"]] as const).map(([id, t]) => (
          <button key={id} type="button" aria-pressed={modo === id} onClick={() => setModo(id)} className={cn("rounded-full border px-3 py-1 text-[11px] font-bold cursor-pointer", modo === id ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)] !text-white" : "bg-transparent border-[var(--color-border-default)] text-[var(--color-text-muted)]")}>{t}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {modo === "cnae" ? (
          <>
            <label className={`${rotulo} flex-1 min-w-[200px]`}>Atividade
              <select value={atividade} onChange={(e) => setAtividade(e.target.value)} className={campo}>
                <option value="">Escolha a atividade</option>
                {ATIVIDADES.map(([c, n]) => <option key={c} value={c}>{n} · {mascara(c)}</option>)}
                <option value="outro">Outro (digitar o CNAE)</option>
              </select>
            </label>
            {atividade === "outro" && <label className={rotulo}>CNAE
              <input value={outro} onChange={(e) => setOutro(mascara(e.target.value))} onKeyDown={enter} inputMode="numeric" placeholder="47.81-4-00" className={`${campo} w-[120px]`} />
            </label>}
          </>
        ) : (
          <label className={`${rotulo} flex-1 min-w-[200px]`}>Tipo de empresa
            <input list="radar-tipos" value={tipo} onChange={(e) => setTipo(e.target.value)} onKeyDown={enter} maxLength={120} placeholder="Ex.: clínicas odontológicas" className={campo} />
            <datalist id="radar-tipos">{TIPOS.map((t) => <option key={t} value={t} />)}</datalist>
          </label>
        )}
        <label className={rotulo}>Estado
          <select value={uf} onChange={(e) => setUf(e.target.value)} className={campo}><option value="">UF</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        </label>
        <label className={`${rotulo} min-w-[170px]`}>Cidade (até {MAX_CIDADES})
          <select value="" onChange={(e) => juntar(e.target.value)} disabled={!lista.length || cheio} className={campo}>
            <option value="">{!uf ? "Escolha o estado" : falha ? "Não carregou" : !lista.length ? "Carregando…" : cheio ? "Limite de cidades" : "Adicionar cidade"}</option>
            {lista.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
        <label className={rotulo}>Por cidade
          <select value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={campo}>{["5", "10", "15", "20"].map((q) => <option key={q} value={q}>{q}</option>)}</select>
        </label>
        <Button type="button" onClick={buscar} disabled={ocupado || acabou} className="h-9 px-4 text-xs font-bold gap-1.5">{ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Pesquisar</Button>
      </div>
      {cidades.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cidades.map((c) => (
            <button key={c.id} type="button" aria-label={`Tirar ${c.cidade}/${c.uf}`} onClick={() => setCidades(cidades.filter((x) => x !== c))}
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
