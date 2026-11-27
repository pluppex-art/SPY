import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { SOBRE_O_MODULO, skuDoModulo, type ItemVenda } from "../lib/catalogoSpy";
import { formatBRLCentavos } from "../lib/dinheiro";

let guardado: Promise<ItemVenda[]> | null = null;
/** Preços à venda (os mesmos do checkout). Falhou = lista vazia, e a tela oferece o contato. */
export function useCatalogo(): ItemVenda[] | null {
  const [itens, setItens] = useState<ItemVenda[] | null>(null);
  useEffect(() => {
    let vivo = true;
    guardado ||= fetch("/api/checkout/plans")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => (Array.isArray(j?.itens) ? (j.itens as ItemVenda[]) : []))
      .catch(() => { guardado = null; return []; });
    void guardado.then((l) => { if (vivo) setItens(l); });
    return () => { vivo = false; };
  }, []);
  return itens;
}

/** Cadeado de um módulo que a empresa não contratou: o que é, quanto custa e como liberar. */
export function ModuloBloqueado({ modulo }: { modulo: string }) {
  const { user } = useAuth();
  const catalogo = useCatalogo();
  const sku = skuDoModulo(modulo);
  const [nome, texto] = (sku && SOBRE_O_MODULO[sku]) || ["Este módulo", ""];
  const item = catalogo?.find((i) => i.sku === sku);
  const admin = !!(user?.isMaster || user?.isTenantAdmin);
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-4 rounded-[var(--radius-panel-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-8 shadow-[var(--shadow-panel)]">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/25 flex items-center justify-center">
          <Lock className="w-6 h-6 text-[var(--color-primary-blue)]" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-black text-[var(--color-text-primary)]">{nome} não está no seu plano</h1>
        {texto && <p className="text-sm text-[var(--color-text-muted)]">{texto}</p>}
        {item && (
          <p className="text-[var(--color-text-primary)]">
            <strong className="text-3xl font-black">{formatBRLCentavos(item.mensalCents)}</strong> <span className="text-xs text-[var(--color-text-muted)]">por mês{item.implCents > 0 ? ` + ${formatBRLCentavos(item.implCents)} de implantação` : ""}</span>
          </p>
        )}
        {catalogo === null ? null : !admin ? (
          <p className="text-sm font-bold text-[var(--color-text-primary)]">Peça ao administrador da empresa para liberar.</p>
        ) : item ? (
          <Link to={`/checkout?adicionar=${item.sku}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary-blue)] px-5 py-3 text-sm font-bold !text-white">Liberar agora <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
        ) : (
          <Link to="/contato" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary-blue)] px-5 py-3 text-sm font-bold !text-white">Falar com a gente <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
        )}
        <div><Link to="/app/modulos" className="text-xs underline text-[var(--color-text-muted)]">Ver todos os módulos</Link></div>
      </div>
    </div>
  );
}
