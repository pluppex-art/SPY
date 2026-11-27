/** Campos da pesquisa do Radar: por CNAE (Receita) ou por tipo (Google Maps), cidades, quantidade e o saldo do dia. */
import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { ATIVIDADES, MAX_ATIVIDADES, mascaraCnae, nomeDaAtividade, type CidadeEscolhida, type FiltroRadar } from "../../lib/buscaRadar";

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const TIPOS = ["clínicas odontológicas", "academias", "escritórios de contabilidade", "pet shops", "restaurantes", "materiais de construção", "imobiliárias", "oficinas mecânicas"];
export const MAX_CIDADES = 5;
const campo = "h-9 px-3 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";
const rotulo = "flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]";

export function FiltroDoRadar({ api, ocupado, restante, onSaldo, onBuscar }: {
  api: (path: string, init?: RequestInit) => Promise<Response>;
  ocupado: boolean;
  /** Quantos resultados ainda cabem hoje (null = ainda não se sabe). */
  restante: number | null;
  onSaldo: (restante: number) => void;
  onBuscar: (f: FiltroRadar) => void;
}) {
  const [modo, setModo] = useState<FiltroRadar["modo"]>("cnae");
  const [atividades, setAtividades] = useState<string[]>([]);
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
  const digitado = outro.replace(/\D/g, "");
  const cheiaDeAtividades = atividades.length >= MAX_ATIVIDADES;
  // Um código digitado e ainda não adicionado também vale na pesquisa.
  const cnaes = digitado.length === 7 && !atividades.includes(digitado) && !cheiaDeAtividades ? [...atividades, digitado] : atividades;
  const buscar = () => { if (!ocupado && !acabou) onBuscar({ modo, cnaes, tipo, cidades, quantidade: Number(quantidade) }); };
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } };
  const alternar = (c: string) => setAtividades((antes) => (antes.includes(c) ? antes.filter((x) => x !== c) : antes.length >= MAX_ATIVIDADES ? antes : [...antes, c]));
  const somarOutro = () => { if (digitado.length === 7 && !cheiaDeAtividades) { if (!atividades.includes(digitado)) alternar(digitado); setOutro(""); } };
  const pedidas = modo === "cnae" ? cnaes.length * cidades.length * Number(quantidade) : cidades.length * Number(quantidade);
  const juntar = (id: string) => { const m = lista.find((x) => x.id === id); if (m && !cheio && !cidades.some((c) => c.id === id)) setCidades([...cidades, { id, cidade: m.nome, uf }]); };

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Como pesquisar" className="flex flex-wrap gap-1.5">
        {([["cnae", "Por CNAE (Receita Federal)"], ["mapa", "Por tipo (Google Maps)"]] as const).map(([id, t]) => (
          <button key={id} type="button" aria-pressed={modo === id} onClick={() => setModo(id)} className={cn("rounded-full border px-3 py-1 text-[11px] font-bold cursor-pointer", modo === id ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)] !text-white" : "bg-transparent border-[var(--color-border-default)] text-[var(--color-text-muted)]")}>{t}</button>
        ))}
      </div>
      {modo === "cnae" && (
        <fieldset className="m-0 p-0 border-0">
          <legend className="mb-1 text-[11px] font-bold text-[var(--color-text-muted)]">Atividades (escolha até {MAX_ATIVIDADES})</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            {[...ATIVIDADES.map(([c]) => c), ...atividades.filter((c) => !ATIVIDADES.some(([a]) => a === c))].map((c) => {
              const marcada = atividades.includes(c);
              return (
                <button key={c} type="button" aria-pressed={marcada} disabled={!marcada && cheiaDeAtividades} onClick={() => alternar(c)} title={`CNAE ${mascaraCnae(c)}`}
                  className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed", marcada ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)] !text-white font-bold" : "bg-transparent border-[var(--color-border-default)] text-[var(--color-text-muted)]")}>{nomeDaAtividade(c)}</button>
              );
            })}
            <span className="inline-flex items-center gap-1.5">
              <input value={outro} onChange={(e) => setOutro(mascaraCnae(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); somarOutro(); } }} inputMode="numeric" placeholder="Outro CNAE" aria-label="Outro CNAE" disabled={cheiaDeAtividades} className={`${campo} !h-7 w-[110px]`} />
              <button type="button" onClick={somarOutro} disabled={digitado.length !== 7 || cheiaDeAtividades} className="bg-transparent border-0 p-0 text-[11px] font-bold text-[var(--color-primary-blue)] cursor-pointer disabled:opacity-40">Adicionar</button>
            </span>
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {modo === "mapa" && (
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
        <label className={rotulo}>{modo === "cnae" ? "Por atividade e cidade" : "Por cidade"}
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
          {acabou ? "O limite de 50 empresas por dia foi atingido. Volta amanhã." : `Restam ${restante} de 50 empresas hoje.${pedidas > restante ? ` Esta busca pede até ${pedidas}: as últimas escolhidas podem ficar sem.` : ""}`}
        </p>
      )}
    </div>
  );
}
