import { useMemo, useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { friendlyError } from "../../../../lib/friendlyError";

const COMBO_DISCOUNT = 0.1;

export function ProdutosAICombo() {
  const { products, createProposalWithItems } = useData();
  const { user } = useAuth();
  const { formatCurrency } = useLocalization();
  const [creating, setCreating] = useState(false);

  const combo = useMemo(() => {
    const topProducts = products
      .filter(p => p.active)
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 3);
    if (topProducts.length < 2) return null;

    const subtotal = topProducts.reduce((acc, p) => acc + p.price, 0);
    const discount = subtotal * COMBO_DISCOUNT;
    const comboPrice = subtotal - discount;
    const combinedMargin = subtotal > 0
      ? topProducts.reduce((acc, p) => acc + p.margin * p.price, 0) / subtotal
      : 0;

    return { products: topProducts, subtotal, discount, comboPrice, combinedMargin };
  }, [products]);

  const handleAddCombo = async () => {
    if (!combo) return;
    setCreating(true);
    try {
      await createProposalWithItems({
        titulo: `Combo Sugerido: ${combo.products.map(p => p.name).join(" + ")}`,
        cliente: "A definir",
        valor: combo.comboPrice,
        status: "Aberta",
        vendedor: user?.name || "Sistema S.P.Y.",
        itens: combo.products.map(p => ({
          productId: p.id,
          descricao: p.name,
          quantidade: 1,
          precoUnitario: p.price * (1 - COMBO_DISCOUNT),
        })),
      });
      toast.success("Combo sugerido importado para as propostas!");
    } catch (err: any) {
      toast.error(`Falha ao criar proposta do combo: ${friendlyError(err)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="p-5 border-dashed border-white/10 bg-[var(--color-surface-elevated)]/40 rounded-2xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-black text-[var(--color-text-primary)] flex items-center gap-1.5 uppercase tracking-wide">
              G-AI Combinations Suggestion Module
            </h4>
            <p className="text-[11px] text-slate-500">
              {combo
                ? "A IA analisou as margens e calculou o seguinte kit sugerido de alta rentabilidade para vendas casadas."
                : "Cadastre ao menos 2 produtos ativos para a IA sugerir um combo de alta rentabilidade."}
            </p>
          </div>
        </div>
        <Button
          onClick={handleAddCombo}
          disabled={!combo || creating}
          className="text-[10px] font-black uppercase tracking-wider bg-amber-600 hover:bg-amber-500 text-white border border-amber-600 px-3 py-1.5 rounded-lg shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Adicionar Combo Sugerido"}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border-subtle)] p-3 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[9px] text-[#2563EB] font-bold block uppercase tracking-wide">Combo Premium</span>
            <p className="text-xs font-bold text-[var(--color-text-primary)] mt-0.5">
              {combo ? combo.products.map(p => p.name).join(" + ") : "Sem Recomendação"}
            </p>
          </div>
          <span className="text-xs font-bold text-emerald-400 font-mono mt-0.5">
            {combo ? formatCurrency(combo.comboPrice) : formatCurrency(0)}
          </span>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border-subtle)] p-3 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[9px] text-[#2563EB] font-bold block uppercase tracking-wide">Desconto do Combo</span>
            <p className="text-xs font-bold text-[var(--color-text-primary)] mt-0.5">
              {combo ? `${(COMBO_DISCOUNT * 100).toFixed(0)}% no kit` : "Sem Desconto"}
            </p>
          </div>
          <span className="text-xs font-bold text-rose-400 mt-0.5 font-mono">
            -{combo ? formatCurrency(combo.discount) : formatCurrency(0)}
          </span>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border-subtle)] p-3 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[9px] text-amber-400 font-bold block uppercase tracking-wide">Média Margem Líquida</span>
            <p className="text-xs font-bold text-[var(--color-text-primary)] mt-0.5">Rentabilidade Combinada</p>
          </div>
          <span className="text-xs font-bold text-[var(--color-text-primary)] font-mono mt-0.5">
            {combo ? `${combo.combinedMargin.toFixed(1)}%` : "0%"}
          </span>
        </div>
      </div>
    </Card>
  );
}
