import { useState, useEffect, useMemo } from "react";
import { PageContainer } from "../../components/PageContainer";
import { BotaoImportar } from "../../components/ImportadorPlanilha";
import { fornecedoresSpec } from "../../lib/importSpecs";

import { Button } from "../../components/ui/button";
import {
  Truck, Plus, Phone, Mail, Package, Trash2, Clock
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { FornecedorModal, rowToFornecedor, type FornecedorItem } from "./FornecedorModal";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

import { HelpTip } from "../../components/ui/help-tip";
export default function FornecedoresVarejo() {
  const { activeTenantId } = useAuth();
  const navigate = useNavigate();
  const [reloadKey, setReloadKey] = useState(0);

  const [fornecedores, setFornecedores] = useState<FornecedorItem[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("varejo_fornecedores")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data) {
        setFornecedores(data.map(rowToFornecedor));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, reloadKey]);

  const [search, setSearch] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [prazoFiltro, setPrazoFiltro] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const fornecedor = fornecedores.find(f => f.id === id);
    if (!(await confirmDialog({
      title: "Excluir fornecedor",
      description: `Excluir o fornecedor "${fornecedor?.razaoSocial || "selecionado"}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("varejo_fornecedores").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover fornecedor.");
      return;
    }
    setFornecedores(prev => prev.filter(f => f.id !== id));
    toast.info("Fornecedor removido.");
  };

  const splitCats = (c: string) => c.split(",").map(x => x.trim()).filter(Boolean);
  const categoriasOpts = useMemo(
    () => Array.from(new Set(fornecedores.flatMap(f => splitCats(f.categorias)))).sort((a, b) => a.localeCompare(b)),
    [fornecedores],
  );
  const prazosOpts = useMemo(
    () => Array.from(new Set(fornecedores.map(f => f.prazoEntrega).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [fornecedores],
  );

  const filtered = fornecedores.filter(f => (
    (
      f.razaoSocial.toLowerCase().includes(search.toLowerCase()) ||
      f.cnpj.toLowerCase().includes(search.toLowerCase()) ||
      f.categorias.toLowerCase().includes(search.toLowerCase()) ||
      f.contato.toLowerCase().includes(search.toLowerCase())
    ) &&
    (!categoriaFiltro || splitCats(f.categorias).includes(categoriaFiltro)) &&
    (!prazoFiltro || f.prazoEntrega === prazoFiltro)
  ));

  const comTelefone = filtered.filter(f => f.telefone).length;
  const comEmail = filtered.filter(f => f.email).length;
  const linhasDistintas = new Set(filtered.flatMap(f => splitCats(f.categorias))).size;
  const activeFilters = (search.trim() ? 1 : 0) + (categoriaFiltro ? 1 : 0) + (prazoFiltro ? 1 : 0);
  const limparFiltros = () => { setSearch(""); setCategoriaFiltro(""); setPrazoFiltro(""); };

  return (
    <PageContainer
      title="Fornecedores de Mercadorias"
      description="Cadastro de distribuidoras, com condições de pagamento, prazos de entrega e catálogo de produtos."
      actions={
        <div className="flex items-center gap-2 flex-wrap">
        {activeTenantId && <BotaoImportar spec={fornecedoresSpec({ tenantId: activeTenantId, onDone: () => setReloadKey((k) => k + 1) })} />}
        <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
          <Plus className="w-3.5 h-3.5" /> Novo Fornecedor
        </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="varejoFornecedores"
        className="mb-4"
        activeCount={activeFilters}
        onClear={limparFiltros}
        kpis={[
          { label: "Fornecedores", value: filtered.length, icon: Truck, tone: "primary" },
          { label: "Com telefone", value: comTelefone, icon: Phone, tone: "success" },
          { label: "Com e-mail", value: comEmail, icon: Mail, tone: "info" },
          { label: "Linhas / categorias", value: linhasDistintas, icon: Package, tone: "accent" },
        ]}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar fornecedor, CNPJ ou categoria..." />
          <FilterSelect icon={Package} value={categoriaFiltro} onChange={setCategoriaFiltro} options={categoriasOpts} allLabel="Todas as linhas" />
          <FilterSelect icon={Clock} value={prazoFiltro} onChange={setPrazoFiltro} options={prazosOpts} allLabel="Todos os prazos" />
        </FilterBar>
      </KpiFilterCard>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(f => (
          <div key={f.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{f.razaoSocial}</h4>
                {f.cnpj && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">
                    {f.cnpj}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {f.contato && <>Contato: <strong className="text-[var(--color-text-primary)]">{f.contato}</strong> </>}{f.telefone && `${f.contato ? "(" : ""}${f.telefone}${f.contato ? ")" : ""}`} {f.email && `• ${f.email}`}{f.prazoEntrega && ` • Prazo: ${f.prazoEntrega}`}
              </p>
              {f.categorias && (
                <p className="text-[10px] text-[var(--color-primary-blue)] font-bold mt-1">
                  Linhas: {f.categorias}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => navigate("/app/varejo/compras", { state: { rascunho: { fornecedor: f.razaoSocial, linhas: [] } } })} className="h-8 text-xs font-bold rounded-xl">
                Novo Pedido de Compra
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(f.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhum fornecedor encontrado.
          </div>
        )}
      </div>

      <FornecedorModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        tenantId={activeTenantId}
        onSaved={f => setFornecedores(prev => [f, ...prev])}
      />
    </PageContainer>
  );
}
