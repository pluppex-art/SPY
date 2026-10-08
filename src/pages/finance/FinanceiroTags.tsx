import { useCallback, useEffect, useMemo, useState } from "react";
import { Tag, Plus, Eye, Edit2, Trash2, CheckCircle2, Layers, Download, FileText, Palette } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { FilterBar, FilterSearch, FilterChips } from "../../components/ui/kpi-filter-card";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { ViewModal } from "./components/ViewModal";
import { Field, FormSection, ModalFooter, ModalTitle, inputCls, textareaCls } from "./components/ModalKit";
import { useRowOpen } from "./components/useRowOpen";
import { useFinanceTags, fetchFinanceTagUsage, DEFAULT_TAG_COLOR, type FinanceTag } from "./hooks/useFinanceTags";

const PALETTE = ["#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#64748b", "#78350f"];
const norm = (s: string) => s.trim().toLowerCase();

export default function FinanceiroTags() {
  const { activeTenantId: tenantId, activeFilialId } = useAuth();
  const { tags, loading, addTag, updateTag, removeTag, reload } = useFinanceTags();

  const [usage, setUsage] = useState<{ counts: Record<string, number>; names: Record<string, string> } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<FinanceTag | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tentou, setTentou] = useState(false);

  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(DEFAULT_TAG_COLOR);
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);

  const loadUsage = useCallback(async () => {
    if (!tenantId) return;
    setUsageLoading(true);
    try {
      setUsage(await fetchFinanceTagUsage(tenantId, activeFilialId));
    } catch (e: any) {
      toast.error(`Não foi possível contar o uso das tags: ${e?.message || "erro desconhecido"}`);
    } finally {
      setUsageLoading(false);
    }
  }, [tenantId, activeFilialId]);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  const usoDe = (t: FinanceTag): number | null => (usage ? usage.counts[norm(t.nome)] || 0 : null);

  const handleOpenNew = () => {
    setEditingId(null); setNome(""); setCor(DEFAULT_TAG_COLOR); setDescricao(""); setAtivo(true);
    setTentou(false); setSaving(false); setShowModal(true);
  };
  const handleOpenEdit = (t: FinanceTag) => {
    setEditingId(t.id); setNome(t.nome); setCor(t.cor || DEFAULT_TAG_COLOR); setDescricao(t.descricao || ""); setAtivo(t.ativo);
    setTentou(false); setSaving(false); setShowModal(true);
  };
  const rowOpen = useRowOpen<FinanceTag>(setViewing, handleOpenEdit);

  const nomeErro = !nome.trim() ? "Informe o nome da tag." : "";
  const nomeDuplicado = !!nome.trim() && tags.some(t => t.id !== editingId && norm(t.nome) === norm(nome));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (nomeErro || nomeDuplicado) return;
    setSaving(true);
    try {
      if (editingId) {
        const ok = await updateTag(editingId, { nome, cor, descricao, ativo });
        if (!ok) return;
        toast.success("Tag atualizada com sucesso!");
        if (norm(tags.find(t => t.id === editingId)?.nome || "") !== norm(nome)) toast.info("Lançamentos antigos continuam com o nome anterior da tag.");
      } else {
        const created = await addTag({ nome, cor, descricao, ativo });
        if (!created) return;
        toast.success("Tag criada com sucesso!");
      }
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: FinanceTag): Promise<boolean> => {
    const n = usoDe(t) ?? 0;
    const ok = await confirmDialog({
      title: "Excluir tag",
      message: n > 0
        ? `A tag "${t.nome}" é usada em ${n} lançamento(s). Excluir remove apenas do cadastro: os lançamentos continuam com o texto da tag. Deseja excluir?`
        : `Excluir a tag "${t.nome}" do cadastro?`,
      confirmText: "Sim, Excluir",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return false;
    if (!(await removeTag(t.id))) return false;
    toast.success("Tag excluída.");
    return true;
  };

  const naoCadastradas = useMemo(() => {
    if (!usage) return [] as string[];
    const have = new Set(tags.map(t => norm(t.nome)));
    return Object.keys(usage.counts).filter(k => !have.has(k)).map(k => usage.names[k]).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [usage, tags]);

  const handleImport = async () => {
    if (!tenantId) return;
    setImporting(true);
    try {
      const fresh = await fetchFinanceTagUsage(tenantId, activeFilialId);
      setUsage(fresh);
      const have = new Set(tags.map(t => norm(t.nome)));
      const faltantes = Object.keys(fresh.counts).filter(k => !have.has(k)).map(k => fresh.names[k]);
      if (faltantes.length === 0) { toast.info("Todas as tags usadas nos lançamentos já estão cadastradas."); return; }
      let criadas = 0;
      for (let i = 0; i < faltantes.length; i++) {
        const c = await addTag({ nome: faltantes[i], cor: PALETTE[i % PALETTE.length] });
        if (c) criadas++;
      }
      await reload();
      if (criadas > 0) toast.success(`${criadas} tag(s) importada(s) dos lançamentos.`);
    } catch (e: any) {
      toast.error(`Erro ao importar tags: ${e?.message || "erro desconhecido"}`);
    } finally {
      setImporting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = norm(search);
    return tags.filter(t => {
      if (q && !(t.nome.toLowerCase().includes(q) || (t.descricao || "").toLowerCase().includes(q))) return false;
      if (statusFilter === "ativa" && !t.ativo) return false;
      if (statusFilter === "inativa" && t.ativo) return false;
      return true;
    });
  }, [tags, search, statusFilter]);

  const ativas = tags.filter(t => t.ativo).length;
  const emUso = usage ? tags.filter(t => (usage.counts[norm(t.nome)] || 0) > 0).length : null;

  const handleExportCSV = () => {
    if (filtered.length === 0) { toast.info("Nenhuma tag para exportar."); return; }
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = filtered.map(t => [esc(t.nome), esc(t.cor), esc(t.descricao || ""), usoDe(t) ?? "", t.ativo ? "Ativa" : "Inativa"]);
    const csv = ["Nome,Cor,Descrição,Lançamentos,Status", ...rows.map(r => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    link.download = `tags_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const Dot = ({ color }: { color: string }) => <span className="inline-block w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ background: color }} />;
  const statusBadge = (a: boolean) => (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", a ? "bg-success/10 text-success" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]")}>{a ? "Ativa" : "Inativa"}</span>
  );
  const iconBtn = "p-1.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] transition-colors";

  return (
    <PageContainer
      title="Tags"
      description="Cadastre as etiquetas usadas para classificar lançamentos do Financeiro."
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleExportCSV} variant="outline" className="h-9 px-3.5 text-xs font-bold gap-1.5 border-[var(--color-border-default)]">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
          <Button onClick={handleImport} disabled={importing || usageLoading || naoCadastradas.length === 0} variant="outline" className="h-9 px-3.5 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
            title={naoCadastradas.length === 0 ? "Nenhuma tag usada fora do cadastro" : `${naoCadastradas.length} tag(s) usada(s) nos lançamentos e ainda não cadastrada(s)`}>
            <Layers className="w-3.5 h-3.5" /> {importing ? "Importando..." : `Importar tags já usadas${naoCadastradas.length ? ` (${naoCadastradas.length})` : ""}`}
          </Button>
          <Button onClick={handleOpenNew} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs bg-[var(--color-primary-blue)] text-white hover:opacity-95">
            <Plus className="w-3.5 h-3.5" /> Nova Tag
          </Button>
        </div>
      }
    >
      <FinanceKpiFilter className="mb-4"
        id="finTags"
        kpis={[
          { label: "Total de Tags", value: tags.length, icon: Tag, tone: "primary" },
          { label: "Ativas", value: ativas, icon: CheckCircle2, tone: "success" },
          { label: "Em uso nos lançamentos", value: emUso ?? "—", icon: Layers, tone: "neutral" },
        ]}
        activeCount={(search ? 1 : 0) + (statusFilter ? 1 : 0)}
        onClear={() => { setSearch(""); setStatusFilter(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por nome ou descrição..." />
          <FilterChips
            value={statusFilter}
            onChange={setStatusFilter}
            allLabel="Todas"
            options={[{ value: "ativa", label: "Ativas" }, { value: "inativa", label: "Inativas" }]}
          />
        </FilterBar>
      </FinanceKpiFilter>

      <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/50">
                <th className="px-4 py-2.5 font-bold">Tag</th>
                <th className="px-4 py-2.5 font-bold">Descrição</th>
                <th className="px-4 py-2.5 font-bold text-right">Lançamentos</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} {...rowOpen(t)} className="border-b border-[var(--color-border-subtle)] last:border-0 cursor-pointer hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                  <td className="px-4 py-3"><div className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]"><Dot color={t.cor} />{t.nome}</div></td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] max-w-xs truncate">{t.descricao || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{usageLoading && !usage ? "…" : usoDe(t) ?? "—"}</td>
                  <td className="px-4 py-3">{statusBadge(t.ativo)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setViewing(t)} title="Visualizar" className={cn(iconBtn, "hover:text-[var(--color-primary-blue)]")}><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleOpenEdit(t)} title="Editar" className={cn(iconBtn, "hover:text-[var(--color-primary-blue)]")}><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(t)} title="Excluir" className={cn(iconBtn, "hover:text-danger")}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-xs text-[var(--color-text-muted)]">
            {loading ? "Carregando tags..." : tags.length === 0 ? "Nenhuma tag cadastrada. Crie uma ou importe as já usadas nos lançamentos." : "Nenhuma tag encontrada com esses filtros."}
          </div>
        )}
      </div>

      {viewing && (
        <ViewModal
          isOpen
          onClose={() => setViewing(null)}
          icon={Tag}
          title={viewing.nome}
          subtitle="Tag do Financeiro"
          tone={viewing.ativo ? "primary" : "warning"}
          highlight={<span className="inline-flex items-center gap-2"><Dot color={viewing.cor} />{statusBadge(viewing.ativo)}</span>}
          sections={[
            { icon: FileText, title: "Identificação", rows: [
              { label: "Nome", value: viewing.nome },
              { label: "Cor", value: viewing.cor, mono: true },
              { label: "Descrição", value: viewing.descricao || null },
            ] },
            { icon: Layers, title: "Uso", rows: [
              { label: "Lançamentos que usam a tag", value: usoDe(viewing) === null ? "—" : String(usoDe(viewing)) },
            ] },
          ]}
          newLabel="Nova tag"
          onEdit={() => { const t = viewing; setViewing(null); handleOpenEdit(t); }}
          onNew={() => { setViewing(null); handleOpenNew(); }}
          onDelete={async () => { const t = viewing; if (await handleDelete(t)) setViewing(null); }}
        />
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={<ModalTitle icon={editingId ? Edit2 : Tag} title={editingId ? "Editar Tag" : "Nova Tag"} subtitle="Etiqueta para classificar lançamentos." />}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <FormSection icon={Tag} title="Identificação">
            <Field label="Nome" required error={tentou ? (nomeErro || (nomeDuplicado ? "Já existe uma tag com esse nome." : "")) : (nomeDuplicado ? "Já existe uma tag com esse nome." : "")}>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Marketing, Reembolsável" autoFocus className={inputCls(tentou && (!!nomeErro || nomeDuplicado))} />
            </Field>
            <Field label="Descrição" hint="Opcional.">
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} className={textareaCls} />
            </Field>
          </FormSection>
          <FormSection icon={Palette} title="Cor e status">
            <div className="flex flex-wrap items-center gap-2">
              {PALETTE.map(c => (
                <button type="button" key={c} onClick={() => setCor(c)} title={c}
                  className={cn("w-6 h-6 rounded-full border-2 transition-transform hover:scale-110", cor.toLowerCase() === c ? "border-[var(--color-text-primary)]" : "border-transparent")}
                  style={{ background: c }} />
              ))}
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(cor) ? cor : DEFAULT_TAG_COLOR} onChange={e => setCor(e.target.value)} className="w-8 h-8 p-0 rounded cursor-pointer bg-transparent border-0" aria-label="Cor personalizada" />
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)] cursor-pointer">
              <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Tag ativa
            </label>
          </FormSection>
          <ModalFooter
            onCancel={() => setShowModal(false)}
            submitLabel={editingId ? "Salvar Alterações" : "Criar Tag"}
            saving={saving}
          />
        </form>
      </Modal>
    </PageContainer>
  );
}
