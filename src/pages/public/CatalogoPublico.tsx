import { TenantSocialProofPopup } from "../../components/TenantSocialProofPopup";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Package, ChevronLeft, ShoppingBag, CheckCircle2, XCircle } from "lucide-react";
import { fetchPublicCatalog, PublicCatalog } from "../../lib/publicCatalog";

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CatalogoPublico() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPublicCatalog(tenantId || "").then((data) => {
      if (!cancelled) {
        setCatalog(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [tenantId]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-[var(--color-surface)] flex items-center justify-center">
        <div className="text-center text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-20 animate-pulse" />
          <p className="font-bold">Carregando catálogo...</p>
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="min-h-dvh bg-[var(--color-surface)] flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white mb-2">Catálogo não encontrado</h1>
          <p className="text-slate-500">O link que você acessou pode estar desatualizado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--color-surface)] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <a href="/" className="flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-400 transition-colors mb-6 w-fit">
          <ChevronLeft className="w-3.5 h-3.5" /> Voltar ao site
        </a>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <ShoppingBag className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">{catalog.tenantName}</h1>
            <p className="text-sm text-slate-400">Catálogo de produtos</p>
          </div>
        </div>

        {catalog.products.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-bold">Nenhum produto disponível no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalog.products.map((p) => (
              <div key={p.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-white text-sm leading-snug">{p.name}</h3>
                  {p.emEstoque ? (
                    <span className="shrink-0 flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                      <CheckCircle2 className="w-3 h-3" /> Disponível
                    </span>
                  ) : (
                    <span className="shrink-0 flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/25">
                      <XCircle className="w-3 h-3" /> Esgotado
                    </span>
                  )}
                </div>
                {p.description && <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{p.description}</p>}
                <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-auto">
                  <span className="text-[10px] text-slate-600 font-mono">{p.sku}</span>
                  <span className="text-lg font-black text-white">{formatPrice(p.price)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <footer className="text-center text-[11px] text-slate-600 mt-10 pt-6 border-t border-white/5">
          Catálogo gerado por <span className="text-blue-500 font-bold">S.P.Y. CRM</span>
        </footer>
      </div>
      <TenantSocialProofPopup tenantId={tenantId} />
    </div>
  );
}
