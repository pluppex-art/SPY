import React from "react";
import { Card } from "../../../components/ui/card";
import { Package, Edit, Copy, Trash2, ShoppingCart } from "lucide-react";
import { Product } from "../../../types";

interface ProdutosTableProps {
  filteredProducts: Product[];
  selectedIds: string[];
  handleToggleSelection: (id: string) => void;
  handleSelectAll: (filteredProducts: Product[]) => void;
  toggleActiveStatus: (id: string, e: React.MouseEvent) => void;
  handleOpenEditModal: (p: Product, e: React.MouseEvent) => void;
  duplicateProduct: (p: Product, e: React.MouseEvent) => void;
  deleteProduct: (id: string, e: React.MouseEvent) => void;
  handleVender: (p: Product, e: React.MouseEvent) => void;
}

import { getProductSubtitle } from "./typeSchemas";

export function ProdutosTable({
  filteredProducts,
  selectedIds,
  handleToggleSelection,
  handleSelectAll,
  toggleActiveStatus,
  handleOpenEditModal,
  duplicateProduct,
  deleteProduct,
  handleVender,
}: ProdutosTableProps) {
  return (
    <Card className="bg-[var(--color-surface-elevated)]/85 border-[var(--color-border-subtle)] shadow-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--color-surface-sunken)] text-[9px] uppercase font-black text-[var(--color-text-muted)] tracking-wider border-b border-[var(--color-border-subtle)]">
              <th className="py-3 px-4 w-10">
                <input 
                  type="checkbox"
                  checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                  onChange={() => handleSelectAll(filteredProducts)}
                  className="rounded bg-slate-900 border-white/20 focus:ring-[#2563EB] w-3.5 h-3.5"
                />
              </th>
              <th className="py-3 px-4">Produto / SKU</th>
              <th className="py-3 px-4">Categoria</th>
              <th className="py-3 px-4">Tipo</th>
              <th className="py-3 px-4 text-right">Preço de Venda</th>
              <th className="py-3 px-4 text-right">Custo Origem</th>
              <th className="py-3 px-4 text-center">Margem</th>
              <th className="py-3 px-4 text-center">Comissão</th>
              <th className="py-3 px-4">Fornecedor</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)]">
            {filteredProducts.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              return (
                <tr
                  key={p.id}
                  onClick={() => handleToggleSelection(p.id)}
                  className={`hover:bg-white/[0.02] text-xs transition-colors cursor-pointer ${!p.active ? "opacity-60" : ""} ${isSelected ? "bg-[#2563EB]/5" : ""}`}
                >
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelection(p.id)}
                      className="rounded bg-slate-900 border-white/22 focus:ring-[#2563EB] w-3.5 h-3.5"
                    />
                  </td>
                  <td className="py-4 px-4 font-semibold text-[var(--color-text-primary)]">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-[#2563EB] shrink-0" />
                      <div className="min-w-0">
                        <span className="block font-black hover:text-blue-400 truncate">{p.name}</span>
                        <span className="text-[10px] font-mono text-slate-500 font-medium">SKU: {p.sku}</span>
                        {getProductSubtitle(p) && (
                          <span className="block text-[10px] text-slate-400 truncate">{getProductSubtitle(p)}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-300">{p.category}</td>
                  <td className="py-4 px-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      p.type === "Serviço" ? "bg-purple-500/10 text-purple-400" :
                      p.type === "Assinatura" ? "bg-cyan-500/10 text-cyan-400" :
                      "bg-amber-500/10 text-amber-400"
                    }`}>
                      {p.type}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right font-mono font-black text-[var(--color-text-primary)]">
                    R$ {p.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-slate-400">
                    R$ {p.cost ? p.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "0,00"}
                  </td>
                  <td className="py-4 px-4 text-center font-mono">
                    <span className={`px-2 py-0.5 rounded font-bold ${p.margin > 60 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {p.margin}%
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center font-mono text-[#06B6D4] font-bold">{p.commission}%</td>
                  <td className="py-4 px-4 text-slate-400 max-w-[120px] truncate">{p.provider || "-"}</td>
                  <td className="py-4 px-4 text-center">
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleActiveStatus(p.id, e); }}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase leading-none ${
                        p.active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"
                      }`}
                    >
                      {p.active ? "Ativo" : "OFF"}
                    </button>
                  </td>
                  <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={(e) => handleVender(p, e)}
                        className="p-1 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 rounded transition-colors"
                        title="Vender"
                        aria-label="Vender"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleOpenEditModal(p, e)}
                        className="p-1 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded transition-colors"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => duplicateProduct(p, e)}
                        className="p-1 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded transition-colors"
                        title="Duplicar"
                        aria-label="Duplicar"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => deleteProduct(p.id, e)}
                        className="p-1 bg-white/5 hover:bg-white/10 text-rose-400 hover:text-rose-500 rounded transition-colors"
                        title="Remover"
                        aria-label="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
