import { Grid, List, Trash2, ArrowUpDown, CircleDot } from "lucide-react";
import { FilterBar, FilterSearch, FilterSelect } from "../../../../components/ui/kpi-filter-card";

interface ProdutosFiltersProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  categories: string[];
  selectedCategories: string[];
  onCategoryToggle: (cat: string) => void;
  types: string[];
  selectedTypes: string[];
  onTypeToggle: (tp: string) => void;
  selectedStatus: string;
  onStatusChange: (v: string) => void;
  sortBy: string;
  onSortByChange: (v: string) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (v: "grid" | "list") => void;
  selectedIds: string[];
  filteredCount: number;
  onBulkActivate: () => void;
  onBulkDeactivate: () => void;
  onBulkDelete: () => void;
}

export function ProdutosFilters({
  searchTerm, onSearchChange,
  categories, selectedCategories, onCategoryToggle,
  types, selectedTypes, onTypeToggle,
  selectedStatus, onStatusChange,
  sortBy, onSortByChange,
  viewMode, onViewModeChange,
  selectedIds, filteredCount,
  onBulkActivate, onBulkDeactivate, onBulkDelete,
}: ProdutosFiltersProps) {

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <FilterSearch value={searchTerm} onChange={onSearchChange} placeholder="Pesquisar por SKU, nome ou fornecedor..." />
        <FilterSelect
          icon={CircleDot}
          value={selectedStatus}
          onChange={onStatusChange}
          allValue="Todos"
          allLabel="Qualquer Status"
          options={[{ value: "Ativos", label: "Apenas Ativos" }, { value: "Inativos", label: "Apenas Inativos" }]}
        />
        <FilterSelect
          icon={ArrowUpDown}
          value={sortBy}
          onChange={onSortByChange}
          options={[
            { value: "name-asc", label: "Ordem Alfabética A-Z" },
            { value: "name-desc", label: "Ordem Alfabética Z-A" },
            { value: "price-desc", label: "Maior Preço" },
            { value: "price-asc", label: "Menor Preço" },
            { value: "margin-desc", label: "Maior Margem Lucro" },
          ]}
        />
      </FilterBar>

        {(categories.length > 0 || types.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-[var(--color-border-subtle)]">
            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Categoria</span>
              <div className="flex flex-wrap gap-1.5 items-center">
                {categories.filter(c => c !== "Todas").map(cat => (
                  <button
                    key={cat}
                    onClick={() => onCategoryToggle(cat)}
                    className={`px-2.5 py-1 text-[10px] rounded-full transition-colors ${selectedCategories.includes(cat) ? "bg-[var(--color-primary-blue)] !text-white" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Tipo</span>
              <div className="flex flex-wrap gap-1.5 items-center">
                {types.filter(t => t !== "Todos").map(tp => (
                  <button
                    key={tp}
                    onClick={() => onTypeToggle(tp)}
                    className={`px-2.5 py-1 text-[10px] rounded-full transition-colors ${selectedTypes.includes(tp) ? "bg-[var(--color-primary-blue)] !text-white" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
                  >
                    {tp}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-3">
            <span className="font-semibold">{filteredCount} itens correspondentes</span>
            {selectedIds.length > 0 && (
              <>
                <span className="text-[var(--color-text-muted)]">•</span>
                <span className="text-[var(--color-primary-blue)] font-black">{selectedIds.length} selecionados</span>
              </>
            )}
          </div>

          <div className="flex gap-2 items-center">
            <div className="flex border border-[var(--color-border-default)] rounded-lg p-0.5 overflow-hidden">
              <button
                onClick={() => onViewModeChange("grid")}
                className={`p-1.5 rounded ${viewMode === "grid" ? "bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] font-bold" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
                title="Visão Grade"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => onViewModeChange("list")}
                className={`p-1.5 rounded ${viewMode === "list" ? "bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] font-bold" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
                title="Visão Tabela"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {selectedIds.length > 0 && (
              <div className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] p-1 rounded-xl flex items-center gap-1.5">
                <button
                  onClick={onBulkActivate}
                  className="px-2 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-black uppercase rounded"
                >
                  Ativar
                </button>
                <button
                  onClick={onBulkDeactivate}
                  className="px-2 py-1 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-[10px] font-black uppercase rounded"
                >
                  Inativar
                </button>
                <button
                  onClick={onBulkDelete}
                  className="p-1 bg-rose-500/10 text-rose-400 hover:text-rose-500 hover:bg-rose-500/20 rounded"
                  title="Excluir Selecionados"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
