import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Lock } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { ModuloBloqueado, useCatalogo } from "../../components/ModuloBloqueado";
import { useAuth } from "../../contexts/AuthContext";
import { ITENS_SPY, SOBRE_O_MODULO, skuDoModulo } from "../../lib/catalogoSpy";
import { formatBRLCentavos } from "../../lib/dinheiro";

/** /app/modulos: o que a empresa já tem e o que dá para liberar. Com ?m=<módulo>, abre o cadeado daquele módulo. */
export default function ModulosDaEmpresa() {
  const { user, isModuleEnabled, getTenantModules, activeTenantName } = useAuth();
  const [params] = useSearchParams();
  const catalogo = useCatalogo();
  const modulos = getTenantModules(activeTenantName || user?.tenantName || "") as Record<string, unknown>;
  const admin = !!(user?.isMaster || user?.isTenantAdmin);
  const m = params.get("m");
  if (m && skuDoModulo(m) && !isModuleEnabled(m as any)) return <ModuloBloqueado modulo={m} />;

  return (
    <PageContainer title="Módulos e adicionais" description="O que a sua empresa já usa e o que dá para liberar.">
      {catalogo === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando…</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.keys(ITENS_SPY).map((sku) => {
            const item = catalogo.find((i) => i.sku === sku);
            const ativo = ITENS_SPY[sku].modulos.every((x) => modulos?.[x] === true);
            if (!item && !ativo) return null;
            const [nome, texto] = SOBRE_O_MODULO[sku];
            const varios = ITENS_SPY[sku].quantidade;
            return (
              <li key={sku} className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-black text-[var(--color-text-primary)]">{item?.nome ?? nome}</h2>
                  {ativo ? <span className="flex items-center gap-1 text-xs font-bold text-success"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Ativo</span> : <Lock className="w-4 h-4 text-[var(--color-text-faint)]" aria-label="Não contratado" />}
                </div>
                <p className="text-xs text-[var(--color-text-muted)] flex-1">{item?.descricao || texto}</p>
                {item && <p className="text-xs text-[var(--color-text-primary)]"><strong>{formatBRLCentavos(item.mensalCents)}</strong> por mês{item.implCents > 0 ? ` + ${formatBRLCentavos(item.implCents)} de implantação` : ""}</p>}
                {item && (!ativo || varios) && (admin
                  ? <Link to={`/checkout?adicionar=${sku}`} className="inline-flex justify-center rounded-xl bg-[var(--color-primary-blue)] px-4 py-2 text-xs font-bold !text-white">{varios && ativo ? "Contratar mais" : "Liberar"}</Link>
                  : <p className="text-xs font-bold text-[var(--color-text-muted)]">Peça ao administrador.</p>)}
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
