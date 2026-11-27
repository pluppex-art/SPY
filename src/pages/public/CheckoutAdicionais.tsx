import { formatBRLCentavos } from "../../lib/dinheiro";
import { ITENS_SPY, QTD_MAXIMA, precoDoCiclo, type Ciclo, type DefinicaoItem, type ItemVenda } from "../../lib/catalogoSpy";

export type Escolhidos = Record<string, number>;

const GRUPOS: [DefinicaoItem["grupo"], string][] = [["adicional", "Inteligência artificial"], ["modulo", "Módulos"], ["segmento", "Do seu segmento"]];

/** Lista de adicionais e módulos do checkout. `ativos` = o que a empresa já tem. */
export function Adicionais({ itens, escolhidos, ciclo, marcar, ativos = [] }: { itens: ItemVenda[]; escolhidos: Escolhidos; ciclo: Ciclo; marcar: (sku: string, qtd: number) => void; ativos?: string[] }) {
  return (
    <>
      {GRUPOS.map(([grupo, titulo]) => {
        const lista = itens.filter((i) => ITENS_SPY[i.sku]?.grupo === grupo);
        if (!lista.length) return null;
        return (
          <section key={grupo} aria-label={titulo}>
            <h3 className="ck-grupo">{titulo}</h3>
            <div className="ck-adicionais">
              {lista.map((i) => {
                const qtd = escolhidos[i.sku] || 0;
                const jaTem = ativos.includes(i.sku);
                return (
                  <div key={i.sku} className="ck-item" data-marcado={qtd > 0 && !jaTem}>
                    <div>
                      <strong>{i.nome}</strong>
                      {i.descricao && <p>{i.descricao}</p>}
                      <small>{formatBRLCentavos(precoDoCiclo(i.mensalCents, ciclo))}{ciclo === "yearly" ? "/ano" : "/mês"}{i.implCents > 0 ? ` + ${formatBRLCentavos(i.implCents)} de implantação` : ""}</small>
                    </div>
                    {jaTem ? <span className="ck-ativo">Já ativo</span> : ITENS_SPY[i.sku].quantidade ? (
                      <div className="ck-qtd">
                        <button type="button" aria-label={`Menos ${i.nome}`} disabled={qtd === 0} onClick={() => marcar(i.sku, qtd - 1)}>−</button>
                        <b aria-live="polite">{qtd}</b>
                        <button type="button" aria-label={`Mais ${i.nome}`} disabled={qtd >= QTD_MAXIMA} onClick={() => marcar(i.sku, qtd + 1)}>+</button>
                      </div>
                    ) : (
                      <button type="button" className={`sp-btn ${qtd ? "sp-btn--primary" : "sp-btn--outline"}`} aria-pressed={qtd > 0} onClick={() => marcar(i.sku, qtd ? 0 : 1)}>{qtd ? "Adicionado" : "Adicionar"}</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
