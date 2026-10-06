import React, { useState } from 'react';
import {
  Package, Box, Plus, Tag,
  Truck, ShieldAlert, Zap,
  BarChart3, RefreshCw, X, Check, Download
} from 'lucide-react';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { PageContainer } from "../../components/PageContainer";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { Modal } from "../../components/ui/modal";
import { useEstoque } from './hooks/useEstoque';
import { toast } from 'sonner';
import { useLocalization } from '../../contexts/LocalizationContext';

export default function EstoqueClinico() {
  const { formatCurrency } = useLocalization();
  const { items: stockItems, addItem } = useEstoque();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('Descartáveis');
  const [itemQty, setItemQty] = useState('');
  const [itemMinQty, setItemMinQty] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const categoryOptions = Array.from(new Set(stockItems.map(i => i.category))).sort();
  const statusOptions = Array.from(new Set(stockItems.map(i => i.status)));
  const activeFilters = (searchTerm ? 1 : 0) + (categoryFilter ? 1 : 0) + (statusFilter ? 1 : 0);
  const clearFilters = () => { setSearchTerm(''); setCategoryFilter(''); setStatusFilter(''); };

  const filteredItems = stockItems.filter(i =>
    (!categoryFilter || i.category === categoryFilter) &&
    (!statusFilter || i.status === statusFilter) &&
    (i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const parsePrice = (p: string) => {
    const n = parseFloat(p.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const stockValue = filteredItems.reduce((sum, i) => sum + i.qty * parsePrice(i.price), 0);
  const stockValueFmt = formatCurrency(stockValue);
  const categoryCount = new Set(filteredItems.map(i => i.category)).size;

  const mostCriticalItems = [...stockItems]
    .filter(i => i.status === 'Crítico' || i.status === 'Alerta')
    .sort((a, b) => (a.qty - a.minQty) - (b.qty - b.minQty))
    .slice(0, 3);

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !itemQty || !itemMinQty) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }

    addItem({
      name: itemName.trim(),
      category: itemCategory,
      qty: parseInt(itemQty, 10) || 0,
      minQty: parseInt(itemMinQty, 10) || 0,
      price: itemPrice.trim() ? (itemPrice.startsWith('R$') ? itemPrice : `R$ ${itemPrice}`) : 'R$ 0,00',
    });

    setIsAddModalOpen(false);
    setItemName('');
    setItemQty('');
    setItemMinQty('');
    setItemPrice('');
  };

  const handleExportCSV = () => {
    if (filteredItems.length === 0) {
      toast.info("Nenhum insumo para exportar.");
      return;
    }
    const headers = ["Nome", "Categoria", "Qtd Estoque", "Qtd Mínima", "Status", "Preço Unitário"];
    const rows = filteredItems.map(i => [
      `"${i.name.replace(/"/g, '""')}"`,
      `"${i.category.replace(/"/g, '""')}"`,
      i.qty,
      i.minQty,
      `"${i.status}"`,
      `"${i.price}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `estoque_clinico_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Estoque exportado com sucesso!");
  };

  return (
    <PageContainer 
      title="Estoque e Suprimentos" 
      description="Controle de insumos e alertas automáticos de estoque baixo ou crítico."
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="h-9 px-3.5 text-xs font-bold gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.info("Integração com fornecedores ainda não disponível — em breve.")}
            className="h-9 px-4 text-xs font-bold gap-1.5"
          >
            <Truck className="w-3.5 h-3.5" /> Solicitar Pedido
          </Button>
          <Button 
            onClick={() => setIsAddModalOpen(true)}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Insumo
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-w-[1700px] mx-auto pb-12">
        
        <KpiFilterCard
          id="clinicaEstoque"
          kpis={[
            { label: "Itens Cadastrados", value: filteredItems.length, icon: Box, tone: "primary" },
            { label: "Alertas de Reposição", value: filteredItems.filter(i => i.status === 'Crítico' || i.status === 'Alerta').length, icon: ShieldAlert, tone: "warning" },
            { label: "Valor em Estoque", value: stockValueFmt, icon: BarChart3, tone: "success" },
            { label: "Categorias", value: categoryCount, icon: Truck, tone: "accent" },
          ]}
          activeCount={activeFilters}
          onClear={clearFilters}
        >
          <FilterBar>
            <FilterSearch value={searchTerm} onChange={setSearchTerm} placeholder="Filtrar material..." />
            <FilterSelect icon={Tag} value={categoryFilter} onChange={setCategoryFilter} options={categoryOptions} allLabel="Todas as categorias" />
            <FilterSelect icon={ShieldAlert} value={statusFilter} onChange={setStatusFilter} options={statusOptions} allLabel="Todos os status" />
          </FilterBar>
        </KpiFilterCard>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Detailed Inventory Table */}
          <Card className="lg:col-span-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[var(--color-border-subtle)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[var(--color-surface-sunken)]">
              <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-[var(--color-primary-blue)]" /> Lista de Insumos Clínicos
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/50">
                    <th className="p-3.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Material</th>
                    <th className="p-3.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Categoria</th>
                    <th className="p-3.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Qtd Atual</th>
                    <th className="p-3.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Status</th>
                    <th className="p-3.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-right">Preço Un.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                      <td className="p-3.5 text-xs font-bold text-[var(--color-text-primary)]">{item.name}</td>
                      <td className="p-3.5 text-xs text-[var(--color-text-muted)] font-medium">{item.category}</td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold font-mono text-[var(--color-text-primary)]">{item.qty}</span>
                          <span className="text-[10px] text-[var(--color-text-faint)]">/ min: {item.minQty}</span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <Badge 
                          variant={item.status === 'Normal' ? 'success' : item.status === 'Crítico' ? 'destructive' : 'warning'} 
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-right font-mono text-xs font-bold text-[var(--color-text-primary)]">{item.price}</td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-xs text-[var(--color-text-muted)] italic">
                        Nenhum insumo encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Logistics & Alerts */}
          <div className="space-y-4">
            <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
              <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> Itens Mais Críticos
              </h3>
              {mostCriticalItems.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] italic">Nenhum item abaixo do estoque mínimo no momento.</p>
              ) : (
                <div className="space-y-2">
                  {mostCriticalItems.map((it) => (
                    <div key={it.id} className="flex justify-between items-center text-xs p-2 bg-[var(--color-surface-sunken)] rounded-md">
                      <span className="font-medium text-[var(--color-text-primary)]">{it.name}</span>
                      <span className="text-rose-500 font-mono font-bold text-[10px]">{it.qty} / min {it.minQty}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-[var(--color-text-faint)] mt-3 leading-relaxed">
                Itens ordenados pela maior distância abaixo da quantidade mínima cadastrada.
              </p>
            </Card>

            <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">Alerta Automático por Mínimo</h4>
                <p className="text-[10px] text-[var(--color-text-muted)]">Status calculado a partir da quantidade atual vs. mínima de cada item.</p>
              </div>
            </Card>
          </div>
        </div>

      </div>

      {/* Modal: Novo Insumo */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Cadastrar Novo Insumo"
        description="Preencha as informações do item para controle de reposição e estoque."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateItem} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nome do Material / Medicamento *</label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Ex: Luvas Cirúrgicas Látex M"
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Categoria *</label>
              <select
                value={itemCategory}
                onChange={(e) => setItemCategory(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-2.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-medium"
              >
                <option value="Descartáveis">Descartáveis</option>
                <option value="EPIs">EPIs</option>
                <option value="Curativos">Curativos</option>
                <option value="Medicamentos">Medicamentos</option>
                <option value="Saneantes">Saneantes</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Preço Unitário</label>
              <input
                type="text"
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                placeholder="R$ 15,00"
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Qtd em Estoque *</label>
              <input
                type="number"
                min="0"
                value={itemQty}
                onChange={(e) => setItemQty(e.target.value)}
                placeholder="100"
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Qtd Mínima (Alerta) *</label>
              <input
                type="number"
                min="0"
                value={itemMinQty}
                onChange={(e) => setItemMinQty(e.target.value)}
                placeholder="20"
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono"
                required
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border-subtle)] flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
              className="h-9 px-4 text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-9 px-5 text-xs font-bold shadow-xs gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Salvar Insumo
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
