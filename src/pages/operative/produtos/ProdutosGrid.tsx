import React from "react";
import { Card } from "../../../components/ui/card";
import { Package, Edit, Copy, Trash2, ShieldAlert, Coins, DollarSign, ShoppingCart } from "lucide-react";
import { Product } from "../../../types";

interface ProdutosGridProps {
  filteredProducts: Product[];
  selectedIds: string[];
  handleToggleSelection: (id: string) => void;
  toggleActiveStatus: (id: string, e: React.MouseEvent) => void;
  handleOpenEditModal: (p: Product, e: React.MouseEvent) => void;
  duplicateProduct: (p: Product, e: React.MouseEvent) => void;
  deleteProduct: (id: string, e: React.MouseEvent) => void;
  setSelectedCategories: React.Dispatch<React.SetStateAction<string[]>>;
  setSearchTerm: (term: string) => void;
  handleVender: (p: Product, e: React.MouseEvent) => void;
}

export function ProdutosGrid({
  filteredProducts,
  selectedIds,
  handleToggleSelection,
  toggleActiveStatus,
  handleOpenEditModal,
  duplicateProduct,
  deleteProduct,
  setSelectedCategories,
  setSearchTerm,
  handleVender,
}: ProdutosGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filteredProducts.map((p) => {
        const isSelected = selectedIds.includes(p.id);
        return (
          <Card 
            key={p.id} 
            onClick={() => handleToggleSelection(p.id)}
            className={`p-5 border relative group transition-all duration-300 select-none cursor-pointer hover:shadow-2xl hover:border-[#2563EB]/30 overflow-hidden ${
              p.active 
                ? "bg-[var(--color-surface-elevated)]/85 border-[var(--color-border-subtle)]" 
                : "bg-[var(--color-surface-elevated)]/40 border-[var(--color-border-subtle)] opacity-50"
            } ${isSelected ? "ring-2 ring-[#2563EB] border-[#2563EB]" : ""}`}
          >
            {/* Upper quick edit badge elements */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 z-20">
              <button 
                onClick={(e) => { e.stopPropagation(); toggleActiveStatus(p.id, e); }}
                className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                  p.active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"
                }`}
              >
                {p.active ? "Ativo" : "Pausado"}
              </button>

              <button 
                onClick={(e) => handleOpenEditModal(p, e)}
                className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-md transition-colors"
                title="Editar produto"
                aria-label="Editar produto"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>

              <button 
                onClick={(e) => duplicateProduct(p, e)}
                className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-md transition-colors"
                title="Duplicar Produto"
                aria-label="Duplicar Produto"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              <button 
                onClick={(e) => deleteProduct(p.id, e)}
                className="p-1.5 bg-white/5 hover:bg-white/10 text-rose-400 hover:text-rose-500 rounded-md transition-colors"
                title="Remover"
                aria-label="Remover"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Left check for bulk multi selection */}
            <div 
              className={`absolute left-4 top-4 w-4 h-4 rounded border transition-all flex items-center justify-center ${
                isSelected ? "bg-[#2563EB] border-transparent" : "border-white/25 bg-slate-900 group-hover:border-white/50"
              }`}
            >
              {isSelected && <Check className="w-3 h-3 text-white stroke-[4]" />}
            </div>

            {/* Core description parameters */}
            <div className="mt-4 flex gap-4 items-start">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                p.type === "Serviço" ? "bg-purple-500/10 border-purple-500/20 text-purple-400" :
                p.type === "Assinatura" ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : 
                p.type === "Digital" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                "bg-blue-500/10 border-blue-500/20 text-blue-400"
              }`}>
                 <Package className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-black text-sm text-[var(--color-text-primary)] truncate leading-snug group-hover:text-blue-400 transition-colors">
                    {p.name}
                  </h3>
                  {p.isBestSeller && (
                    <span className="bg-amber-500/10 border border-amber-500/25 px-1 rounded text-[8px] text-amber-400 font-extrabold uppercase shrink-0 tracking-wide">
                      BestSeller
                    </span>
                  )}
                </div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-0.5">
                  {p.category} • SKU: <span className="font-mono text-slate-400">{p.sku}</span>
                </p>
              </div>
            </div>

            {/* Sub-details fields */}
            <div className="mt-5 grid grid-cols-2 gap-y-2 gap-x-4 p-3 bg-white/[0.015] border border-[var(--color-border-subtle)] rounded-xl text-[11px]">
              <div>
                <span className="text-[var(--color-text-muted)] block text-[9px] uppercase font-black">Fornecedor</span>
                <span className="text-slate-300 truncate font-semibold block">{p.provider || "-"}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)] block text-[9px] uppercase font-black">Estoque</span>
                <span className={`font-mono font-black flex items-center gap-1 ${p.currentStock <= p.stockMin ? "text-rose-400" : "text-emerald-400"}`}>
                  {p.currentStock} / {p.stockMin}
                  {p.currentStock <= p.stockMin && <ShieldAlert className="w-3 h-3"/>}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)] block text-[9px] uppercase font-black">Margem Líquida</span>
                <span className={`font-mono font-black ${p.margin > 60 ? "text-emerald-400" : "text-amber-400"}`}>
                  {p.margin}%
                </span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)] block text-[9px] uppercase font-black">Comissão Vendedor</span>
                <span className="text-[var(--color-text-primary)] font-semibold flex items-center gap-1 shrink-0 font-mono">
                  <Coins className="w-3 h-3 text-[#06B6D4]" /> {p.commission}%
                </span>
              </div>
            </div>

            {/* Bottom line with price calculations summary */}
            <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
              <div>
                <span className="text-[9px] text-[#06B6D4] font-black uppercase block tracking-wider">Preço de Venda</span>
                <div className="flex items-center gap-1 font-mono font-black text-base text-[var(--color-text-primary)] mt-0.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" /> 
                  {p.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  {p.type === "Assinatura" && <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">/Mês</span>}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-500 font-black uppercase block">Custo Unitário</span>
                <span className="text-xs font-mono text-slate-400 font-semibold block mt-0.5">
                  R$ {p.cost ? p.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "0,00"}
                </span>
              </div>
            </div>

            {/* Vender action */}
            <button
              onClick={(e) => handleVender(p, e)}
              className="mt-3.5 w-full h-9 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Vender
            </button>

            {/* Tags row in card bottom */}
            <div className="mt-3.5 flex gap-1 items-center overflow-x-auto scrollbar-none">
              {(p.tags ?? []).slice(0, 3).map((tag, i) => (
                <button 
                  key={i} 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setSelectedCategories(prev => prev.includes(tag) ? prev : [...prev, tag]); 
                    setSearchTerm(tag);
                  }} 
                  className="text-[8px] bg-white/5 px-2 py-0.5 text-slate-400 font-bold rounded-full lowercase tracking-wide shrink-0 hover:bg-[#2563EB]/20 hover:text-white"
                >
                  #{tag}
                </button>
              ))}
            </div>

            {isSelected && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-[#2563EB]"></div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
