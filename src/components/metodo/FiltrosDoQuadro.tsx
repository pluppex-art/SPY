/** Filtros do quadro para funis com o método: situação, prazo, com quem está a bola e temperatura. */
import { useMemo, useState } from "react";
import { NOME_DA_BOLA, NOME_DO_SLA, SEM_FILTRO, pesoDeAtencao, situacaoDoPrazo, type FiltroDoMetodo, type Sla } from "../../lib/metodo/regras";
import { useMetodo } from "./MetodoProvider";

/** Filtra a lista quando o funil aberto usa o método; devolve também a ordem de atenção para as colunas. */
export function useFiltroDoQuadro(funil: any, leads: any[]) {
  const metodo = useMetodo();
  const ativo = !!funil?.metodoAtivo;
  const [filtro, setFiltro] = useState<FiltroDoMetodo>(SEM_FILTRO);
  const lista = useMemo(() => {
    if (!ativo || Object.values(filtro).every((v) => !v)) return leads;
    return leads.filter((l) => {
      const i = metodo.info(l);
      return (!filtro.situacao || i?.estado?.situacao_codigo === filtro.situacao)
        && (!filtro.sla || situacaoDoPrazo(i?.estado) === filtro.sla)
        && (!filtro.bola || i?.situacao?.bola_com === filtro.bola)
        && (!filtro.temperatura || String(l.temperature ?? "").toLowerCase() === filtro.temperatura);
    });
  }, [ativo, filtro, leads, metodo]);
  const ordem = useMemo(() => (ativo ? (a: any, b: any) => pesoDeAtencao(metodo.info(a)?.estado, a.temperature) - pesoDeAtencao(metodo.info(b)?.estado, b.temperature) : undefined), [ativo, metodo]);
  return { ativo, filtro, setFiltro, lista, ordem };
}

const campo = "h-8 px-2 rounded-lg text-[11px] font-bold border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";

export function FiltrosDoQuadro({ funil, filtro, onFiltro }: { funil: any; filtro: FiltroDoMetodo; onFiltro: (f: FiltroDoMetodo) => void }) {
  const metodo = useMetodo();
  const escolha = (chave: keyof FiltroDoMetodo, rotulo: string, opcoes: [string, string][]) => (
    <select aria-label={rotulo} value={filtro[chave]} onChange={(e) => onFiltro({ ...filtro, [chave]: e.target.value as any })} className={campo}>
      <option value="">{rotulo}: todos</option>
      {opcoes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      {escolha("situacao", "Situação", metodo.situacoes(funil.id).map((s) => [s.codigo, s.nome_exibido]))}
      {escolha("sla", "Prazo", (["estourado", "atencao", "em_dia"] as Sla[]).map((s) => [s, NOME_DO_SLA[s]]))}
      {escolha("bola", "Bola", Object.entries(NOME_DA_BOLA))}
      {escolha("temperatura", "Temperatura", [["quente", "Quente"], ["morno", "Morno"], ["frio", "Frio"]])}
      {Object.values(filtro).some(Boolean) && <button type="button" onClick={() => onFiltro(SEM_FILTRO)} className="bg-transparent border-0 p-0 text-[11px] font-bold text-[var(--color-primary-blue)] cursor-pointer">Limpar</button>}
    </div>
  );
}
