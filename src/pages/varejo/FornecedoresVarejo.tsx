import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "../../components/PageContainer";
import { BotaoImportar } from "../../components/ImportadorPlanilha";
import { fornecedoresSpec } from "../../lib/importSpecs";
import { Button } from "../../components/ui/button";
import { Truck, Plus, Phone, Mail, Package, Trash2, Pencil, FileDown, ShoppingCart, BookOpen } from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { CatalogoFornecedorModal } from "./CatalogoFornecedorModal";
import { FornecedorModal, rowToFornecedor, formatDoc, formatFone, type FornecedorItem } from "./FornecedorModal";

type Resumo = { ordens: number; total: number };

export default function FornecedoresVarejo() {
  const { activeTenantId, activeTenantName } = useAuth();
  const navigate = useNavigate();
  const [reloadKey, setReloadKey] = useState(0);
  const [fornecedores, setFornecedores] = useState<FornecedorItem[]>([]);
  // Ordens de compra e total comprado por fornecedor (pelo nome gravado na ordem; canceladas não contam).
  const [resumo, setResumo] = useState<Record<string, Resumo>>({});

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const [forn, comp] = await Promise.all([
        supabase.from("varejo_fornecedores").select("*").eq("tenant_id", activeTenantId).order("razao_social"),
        supabase.from("compras").select("fornecedor, valor, status").eq("tenant_id", activeTenantId),
      ]);
      if (cancelled) return;
      if (!forn.error && forn.data) setFornecedores(forn.data.map(rowToFornecedor));
      if (!comp.error && comp.data) {
        const r: Record<string, Resumo> = {};
        comp.data.filter((c: any) => c.status !== "Cancelado").forEach((c: any) => {
          const k = String(c.fornecedor || "").trim().toLowerCase();
          r[k] = { ordens: (r[k]?.ordens || 0) + 1, total: (r[k]?.total || 0) + (Number(c.valor) || 0) };
        });
        setResumo(r);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, reloadKey]);

  const [search, setSearch] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [cidadeFiltro, setCidadeFiltro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("Ativos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<FornecedorItem | null>(null);
  const [catalogoDe, setCatalogoDe] = useState<FornecedorItem | null>(null);

  const abrirNovo = () => { setEditando(null); setModalOpen(true); };
  const abrirEdicao = (f: FornecedorItem) => { setEditando(f); setModalOpen(true); };

  const handleSaved = (f: FornecedorItem) => {
    setFornecedores(prev => prev.some(x => x.id === f.id) ? prev.map(x => x.id === f.id ? f : x) : [f, ...prev]);
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const fornecedor = fornecedores.find(f => f.id === id);
    if (!(await confirmDialog({
      title: "Excluir fornecedor",
      description: `Excluir definitivamente o fornecedor "${fornecedor?.razaoSocial || "selecionado"}"? Essa ação não pode ser desfeita. Para só tirar da lista de compras, desmarque "Fornecedor ativo" na edição.`,
    }))) return;
    const { data, error } = await supabase.from("varejo_fornecedores").delete().eq("id", id).select("id");
    if (error || !data || data.length === 0) { toast.error("Erro ao excluir fornecedor."); return; }
    setFornecedores(prev => prev.filter(f => f.id !== id));
    toast.info("Fornecedor excluído.");
  };

  const splitCats = (c: string) => c.split(",").map(x => x.trim()).filter(Boolean);
  const categoriasOpts = useMemo(
    () => Array.from(new Set(fornecedores.flatMap(f => splitCats(f.categorias)))).sort((a, b) => a.localeCompare(b)),
    [fornecedores],
  );
  const cidadesOpts = useMemo(
    () => Array.from(new Set(fornecedores.map(f => f.cidade).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [fornecedores],
  );

  const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filtered = fornecedores.filter(f => {
    const alvo = norm([f.razaoSocial, f.nomeFantasia, f.cnpj, f.categorias, f.contato, f.telefone, f.email, f.cidade].join(" "));
    const digitosBusca = search.replace(/\D/g, "");
    const bateTexto = norm(search).split(/\s+/).filter(Boolean).every(w => alvo.includes(w))
      || (digitosBusca.length >= 3 && (f.cnpj.replace(/\D/g, "").includes(digitosBusca) || f.telefone.replace(/\D/g, "").includes(digitosBusca)));
    return bateTexto
      && (!categoriaFiltro || splitCats(f.categorias).includes(categoriaFiltro))
      && (!cidadeFiltro || f.cidade === cidadeFiltro)
      && (statusFiltro === "" || (statusFiltro === "Ativos" ? f.ativo : !f.ativo));
  });

  const comTelefone = filtered.filter(f => f.telefone).length;
  const comEmail = filtered.filter(f => f.email).length;
  const linhasDistintas = new Set(filtered.flatMap(f => splitCats(f.categorias))).size;
  const activeFilters = (search.trim() ? 1 : 0) + (categoriaFiltro ? 1 : 0) + (cidadeFiltro ? 1 : 0) + (statusFiltro !== "Ativos" ? 1 : 0);
  const limparFiltros = () => { setSearch(""); setCategoriaFiltro(""); setCidadeFiltro(""); setStatusFiltro("Ativos"); };
  const resumoDe = (f: FornecedorItem): Resumo => resumo[f.razaoSocial.trim().toLowerCase()] || { ordens: 0, total: 0 };
  const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  const exportarPdf = async () => {
    if (filtered.length === 0) { toast.error("Nenhum fornecedor para exportar."); return; }
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Fornecedores", 14, 16);
    doc.setFontSize(9);
    doc.text(`${activeTenantName || ""}  •  Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
    autoTable(doc, {
      startY: 27,
      head: [["Fornecedor", "CNPJ/CPF", "Contato", "Telefone", "E-mail", "Cidade/UF", "Pagamento", "Prazo", "Ordens", "Total comprado (R$)"]],
      body: filtered.map(f => [
        f.nomeFantasia ? `${f.razaoSocial}\n(${f.nomeFantasia})` : f.razaoSocial,
        f.cnpj ? formatDoc(f.cnpj) : "", f.contato, f.telefone ? formatFone(f.telefone) : "", f.email,
        [f.cidade, f.uf].filter(Boolean).join("/"),
        [f.condicaoPagamento, f.formaPagamento].filter(Boolean).join(" • "),
        f.prazoEntrega, String(resumoDe(f).ordens), brl(resumoDe(f).total),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [91, 33, 182] },
      columnStyles: { 8: { halign: "right" }, 9: { halign: "right" } },
    });
    doc.save(`fornecedores-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <PageContainer
      title="Fornecedores de Mercadorias"
      description="Cadastro completo de distribuidoras: contato, endereço, condições de pagamento e histórico de compras."
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          {activeTenantId && <BotaoImportar spec={fornecedoresSpec({ tenantId: activeTenantId, onDone: () => setReloadKey((k) => k + 1) })} />}
          <Button variant="outline" onClick={exportarPdf} className="h-9 px-4 text-xs font-bold gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Exportar PDF
          </Button>
          <Button onClick={abrirNovo} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
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
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar nome, CNPJ, telefone, e-mail ou categoria..." />
          <FilterSelect icon={Package} value={categoriaFiltro} onChange={setCategoriaFiltro} options={categoriasOpts} allLabel="Todas as linhas" />
          {cidadesOpts.length > 0 && <FilterSelect icon={Truck} value={cidadeFiltro} onChange={setCidadeFiltro} options={cidadesOpts} allLabel="Todas as cidades" />}
          <FilterChips value={statusFiltro} onChange={setStatusFiltro} options={["Ativos", "Inativos"]} />
        </FilterBar>
      </KpiFilterCard>

      <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
              <th className="py-3 px-4">Fornecedor</th>
              <th className="py-3 px-3">CNPJ / CPF</th>
              <th className="py-3 px-3">Contato</th>
              <th className="py-3 px-3">Telefone</th>
              <th className="py-3 px-3">Cidade / UF</th>
              <th className="py-3 px-3">Pagamento</th>
              <th className="py-3 px-3">Prazo</th>
              <th className="py-3 px-3 text-right">Ordens</th>
              <th className="py-3 px-3 text-right">Total comprado</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => {
              const r = resumoDe(f);
              return (
                <tr key={f.id} className={`border-b border-[var(--color-border-subtle)] last:border-0 align-middle ${f.ativo ? "" : "opacity-60"}`}>
                  <td className="py-3 px-4 max-w-[240px]">
                    <p className="font-bold text-[var(--color-text-primary)] truncate" title={f.razaoSocial}>{f.razaoSocial}</p>
                    {f.nomeFantasia && <p className="text-[10px] text-[var(--color-text-muted)] truncate">{f.nomeFantasia}</p>}
                    {f.categorias && <p className="text-[10px] text-[var(--color-primary-blue)] font-bold truncate">{f.categorias}</p>}
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-[var(--color-text-muted)]">{f.cnpj ? formatDoc(f.cnpj) : "—"}</td>
                  <td className="py-3 px-3">
                    <p className="text-[var(--color-text-primary)]">{f.contato || "—"}</p>
                    {f.email && <p className="text-[10px] text-[var(--color-text-muted)] truncate max-w-[180px]">{f.email}</p>}
                  </td>
                  <td className="py-3 px-3 text-[var(--color-text-primary)] whitespace-nowrap">{f.telefone ? formatFone(f.telefone) : "—"}</td>
                  <td className="py-3 px-3 text-[var(--color-text-muted)]">{[f.cidade, f.uf].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="py-3 px-3 text-[var(--color-text-muted)]">{[f.condicaoPagamento, f.formaPagamento].filter(Boolean).join(" • ") || "—"}</td>
                  <td className="py-3 px-3 text-[var(--color-text-muted)]">{f.prazoEntrega || "—"}</td>
                  <td className="py-3 px-3 text-right font-mono">{r.ordens}</td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-500">{r.total > 0 ? `R$ ${brl(r.total)}` : "—"}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setCatalogoDe(f)} className="h-8 px-2.5 text-[11px] font-bold gap-1 rounded-xl">
                        <BookOpen className="w-3.5 h-3.5" /> Catálogo
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate("/app/varejo/compras", { state: { rascunho: { fornecedor: f.razaoSocial, linhas: [] } } })} className="h-8 px-2.5 text-[11px] font-bold gap-1 rounded-xl">
                        <ShoppingCart className="w-3.5 h-3.5" /> Novo Pedido
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => abrirEdicao(f)} title="Editar fornecedor" className="h-8 w-8 p-0 text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 rounded-xl">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(f.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)]">Nenhum fornecedor encontrado.</div>
        )}
      </div>

      <CatalogoFornecedorModal fornecedor={catalogoDe} tenantId={activeTenantId} onClose={() => setCatalogoDe(null)} />

      <FornecedorModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        tenantId={activeTenantId}
        fornecedor={editando}
        existentes={fornecedores}
        onSaved={handleSaved}
      />
    </PageContainer>
  );
}
