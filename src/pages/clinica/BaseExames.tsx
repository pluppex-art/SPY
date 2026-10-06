import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, FlaskConical, Loader2, Pencil, Plus, Trash2, Tag, Wallet, Layers, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { EmptyState } from "../../components/ui/empty-state";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import { parseMoney, normalizeName } from "../../lib/tableMatch";
import { guessBaseMapping, readTableFile, type BaseField, type ColumnMapping, type ParsedTable } from "../../lib/tableFile";
import { cn } from "../../lib/utils";

const inputCls =
  "w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]";
const labelCls = "text-[10px] font-bold uppercase text-[var(--color-text-muted)] mb-1 block";

const BASE_FIELD_LABELS: Record<BaseField, string> = {
  nome: "Nome do exame *", codigo_interno: "Código interno", codigo_externo: "Código externo", categoria: "Categoria",
  tipo: "Tipo", material: "Material/amostra", unidade: "Unidade", custo: "Custo", valor: "Valor comercial",
  parceiro: "Parceiro/laboratório", nomes_alternativos: "Sinônimos (separe com ; ou |)",
};

const EMPTY = { id: "", nome: "", codigo_interno: "", codigo_externo: "", nomes_alternativos: "", categoria: "", tipo: "", material: "", unidade: "", custo: "", valor: "", parceiro: "", observacoes: "", ativo: true };

const splitAliases = (s: string) => s.split(/[;|\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30);

export default function BaseExames() {
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();
  const fileRef = useRef<HTMLInputElement>(null);

  const [exames, setExames] = useState<any[] | null>(null);
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("");
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Importação
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping<BaseField>>({});
  const [importando, setImportando] = useState(false);

  const carregar = async () => {
    if (!supabase || !activeTenantId) return;
    const all: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("saude_exames_base").select("*").eq("tenant_id", activeTenantId).order("nome").range(from, from + 999);
      if (error) { toast.error("Não foi possível carregar a base de exames."); setExames([]); return; }
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    setExames(all);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [activeTenantId]);

  const filtrados = useMemo(() => {
    const q = normalizeName(busca);
    const raw = busca.trim().toLowerCase();
    return (exames || []).filter((e) =>
      (!categoriaFiltro || e.categoria === categoriaFiltro) &&
      (!situacaoFiltro || (situacaoFiltro === "ativo" ? e.ativo : !e.ativo)) &&
      (!raw || normalizeName(e.nome).includes(q) || (e.codigo_interno || "").toLowerCase().includes(raw) || (e.codigo_externo || "").toLowerCase().includes(raw)
      || (e.nomes_alternativos || []).some((a: string) => a.toLowerCase().includes(raw))));
  }, [exames, busca, categoriaFiltro, situacaoFiltro]);

  const categorias = useMemo(() => Array.from(new Set((exames || []).map((e) => e.categoria).filter(Boolean))).sort() as string[], [exames]);
  const filtrosAtivos = (busca ? 1 : 0) + (categoriaFiltro ? 1 : 0) + (situacaoFiltro ? 1 : 0);
  const limparFiltros = () => { setBusca(""); setCategoriaFiltro(""); setSituacaoFiltro(""); };

  const kpis = useMemo(() => {
    const list = filtrados;
    return {
      total: list.length,
      ativos: list.filter((e) => e.ativo).length,
      comAlias: list.filter((e) => (e.nomes_alternativos || []).length > 0).length,
      semPreco: list.filter((e) => e.ativo && e.valor == null && e.custo == null).length,
    };
  }, [filtrados]);

  const salvar = async () => {
    if (!supabase || !activeTenantId || !form) return;
    if (!form.nome.trim()) { toast.error("Informe o nome do exame."); return; }
    setSalvando(true);
    const custo = form.custo === "" ? null : parseMoney(form.custo);
    const valor = form.valor === "" ? null : parseMoney(form.valor);
    const row = {
      nome: form.nome.trim(), codigo_interno: form.codigo_interno.trim() || null, codigo_externo: form.codigo_externo.trim() || null,
      nomes_alternativos: splitAliases(form.nomes_alternativos), categoria: form.categoria.trim() || null, tipo: form.tipo.trim() || null,
      material: form.material.trim() || null, unidade: form.unidade.trim() || null, custo, valor,
      parceiro: form.parceiro.trim() || null, observacoes: form.observacoes.trim() || null, ativo: form.ativo,
    };
    const { error } = form.id
      ? await supabase.from("saude_exames_base").update(row).eq("id", form.id).eq("tenant_id", activeTenantId)
      : await supabase.from("saude_exames_base").insert({ ...row, tenant_id: activeTenantId, origem: "manual" });
    setSalvando(false);
    if (error) { toast.error(error.code === "23505" ? "Já existe um exame com esse código interno." : "Não foi possível salvar."); return; }
    toast.success("Exame salvo.");
    setForm(null);
    carregar();
  };

  const excluir = async (e: any) => {
    if (!supabase || !activeTenantId) return;
    if (!(await confirmDialog({ description: `Excluir "${e.nome}" da base? Equivalências confirmadas ligadas a ele também são removidas.` }))) return;
    const { error } = await supabase.from("saude_exames_base").delete().eq("id", e.id).eq("tenant_id", activeTenantId);
    if (error) { toast.error("Não foi possível excluir."); return; }
    setExames((prev) => (prev || []).filter((x) => x.id !== e.id));
  };

  const onFile = async (file: File) => {
    try {
      const t = await readTableFile(file);
      setTable(t);
      setMapping(guessBaseMapping(t.headers));
    } catch (err: any) { toast.error(err?.message || "Não foi possível ler o arquivo."); }
  };

  const preview = useMemo(() => {
    if (!table || mapping.nome === undefined) return null;
    const existentes = new Set((exames || []).map((e) => normalizeName(e.nome)));
    const codigos = new Set((exames || []).map((e) => (e.codigo_interno || "").toLowerCase()).filter(Boolean));
    const novos: any[] = [];
    let pulados = 0;
    const vistos = new Set<string>();
    for (const r of table.rows) {
      const g = (f: BaseField) => (mapping[f] !== undefined ? (r[mapping[f] as number] || "").trim() : "");
      const nome = g("nome");
      if (!nome) { pulados++; continue; }
      const norm = normalizeName(nome);
      const cod = g("codigo_interno");
      if (existentes.has(norm) || vistos.has(norm) || (cod && codigos.has(cod.toLowerCase()))) { pulados++; continue; }
      vistos.add(norm);
      novos.push({
        nome, codigo_interno: cod || null, codigo_externo: g("codigo_externo") || null, categoria: g("categoria") || null, tipo: g("tipo") || null,
        material: g("material") || null, unidade: g("unidade") || null, custo: g("custo") ? parseMoney(g("custo")) : null,
        valor: g("valor") ? parseMoney(g("valor")) : null, parceiro: g("parceiro") || null, nomes_alternativos: splitAliases(g("nomes_alternativos")),
      });
    }
    return { novos, pulados };
  }, [table, mapping, exames]);

  const importar = async () => {
    if (!supabase || !activeTenantId || !preview || preview.novos.length === 0) return;
    setImportando(true);
    try {
      // Códigos internos repetidos dentro do próprio arquivo violariam o índice único: mantém o 1º.
      const seenCode = new Set<string>();
      const rows = preview.novos.map((n) => {
        const k = (n.codigo_interno || "").toLowerCase();
        if (k && seenCode.has(k)) return { ...n, codigo_interno: null };
        if (k) seenCode.add(k);
        return n;
      }).map((n) => ({ ...n, tenant_id: activeTenantId, origem: "importacao" as const }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("saude_exames_base").insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      toast.success(`${rows.length} exames importados para a base.`);
      setTable(null);
      carregar();
    } catch (err: any) {
      toast.error("Importação interrompida: " + (err?.message || "erro"));
    } finally { setImportando(false); }
  };

  const openEdit = (e: any) => setForm({
    id: e.id, nome: e.nome, codigo_interno: e.codigo_interno || "", codigo_externo: e.codigo_externo || "",
    nomes_alternativos: (e.nomes_alternativos || []).join("; "), categoria: e.categoria || "", tipo: e.tipo || "", material: e.material || "",
    unidade: e.unidade || "", custo: e.custo ?? "", valor: e.valor ?? "", parceiro: e.parceiro || "", observacoes: e.observacoes || "", ativo: e.ativo,
  } as any);

  return (
    <PageContainer
      title="Base de Exames"
      description="A base oficial de exames e procedimentos usada como referência nas comparações de tabelas."
      breadcrumb={[{ label: "Clínica & Saúde" }, { label: "Base de Exames" }]}
      actions={
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="h-9 px-4 text-xs font-medium gap-1.5"><FileUp className="w-3.5 h-3.5" /> Importar planilha</Button>
          <Button onClick={() => setForm({ ...EMPTY })} className="h-9 px-4 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo exame</Button>
        </div>
      }
    >
      <div className="space-y-5 max-w-[1700px] mx-auto pb-12">
        <KpiFilterCard
          id="clinicaBaseExames"
          kpis={[
            { label: "Exames na base", value: kpis.total, icon: FlaskConical, tone: "primary" },
            { label: "Ativos", value: kpis.ativos, icon: CheckCircle2, tone: "success" },
            { label: "Com sinônimos", value: kpis.comAlias, icon: Layers, tone: "info", hint: "Ajudam a comparação" },
            { label: "Sem preço/custo", value: kpis.semPreco, icon: Wallet, tone: kpis.semPreco > 0 ? "warning" : "neutral", hint: "Sem base para calcular margem" },
          ]}
          activeCount={filtrosAtivos}
          onClear={limparFiltros}
        >
          <FilterBar>
            <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar nome, código ou sinônimo…" />
            <FilterSelect icon={Tag} value={categoriaFiltro} onChange={setCategoriaFiltro} options={categorias} allLabel="Todas as categorias" />
            <FilterSelect icon={CheckCircle2} value={situacaoFiltro} onChange={setSituacaoFiltro} options={[{ value: "ativo", label: "Ativos" }, { value: "inativo", label: "Inativos" }]} allLabel="Todas as situações" />
          </FilterBar>
        </KpiFilterCard>

        {exames === null ? (
          <p className="text-xs text-[var(--color-text-faint)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</p>
        ) : filtrados.length === 0 ? (
          <EmptyState icon={FlaskConical} title={exames.length === 0 ? "A base de exames está vazia" : "Nenhum exame encontrado"} description={exames.length === 0 ? "Importe uma planilha ou cadastre os exames para poder comparar tabelas." : "Ajuste a busca."} />
        ) : (
          <Card className="overflow-hidden">
            <div className="max-h-[65vh] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)] sticky top-0">
                  <tr><th className="px-5 py-3">Exame</th><th className="px-5 py-3">Código</th><th className="px-5 py-3">Categoria</th><th className="px-5 py-3 text-right">Custo</th><th className="px-5 py-3 text-right">Valor</th><th className="px-5 py-3">Sinônimos</th><th className="px-5 py-3 w-20" /></tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {filtrados.slice(0, 500).map((e) => (
                    <tr key={e.id} className={cn("hover:bg-[var(--color-surface-sunken)]/50", !e.ativo && "opacity-50")}>
                      <td className="px-5 py-3 font-medium text-[var(--color-text-primary)]">{e.nome}</td>
                      <td className="px-5 py-3 font-mono text-[var(--color-text-muted)]">{e.codigo_interno || e.codigo_externo || "—"}</td>
                      <td className="px-5 py-3 text-[var(--color-text-muted)]">{e.categoria || "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{e.custo != null ? formatCurrency(Number(e.custo)) : "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold">{e.valor != null ? formatCurrency(Number(e.valor)) : "—"}</td>
                      <td className="px-5 py-3 text-[var(--color-text-faint)] max-w-[220px] truncate">{(e.nomes_alternativos || []).join(", ") || "—"}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <button type="button" onClick={() => openEdit(e)} title="Editar" className="p-1.5 text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)]"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => excluir(e)} title="Excluir" className="p-1.5 text-[var(--color-text-faint)] hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtrados.length > 500 && <p className="text-[11px] text-[var(--color-text-faint)] px-5 py-2 border-t border-[var(--color-border-subtle)]">Mostrando 500 de {filtrados.length}. Use a busca para refinar.</p>}
          </Card>
        )}
      </div>

      {/* Cadastro / edição */}
      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? "Editar exame" : "Novo exame"} maxWidth="max-w-2xl">
        {form && (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div><label className={labelCls}>Nome oficial *</label><input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Código interno</label><input className={inputCls} value={form.codigo_interno} onChange={(e) => setForm({ ...form, codigo_interno: e.target.value })} /></div>
              <div><label className={labelCls}>Código externo (TUSS/CBHPM/parceiro)</label><input className={inputCls} value={form.codigo_externo} onChange={(e) => setForm({ ...form, codigo_externo: e.target.value })} /></div>
            </div>
            <div><label className={labelCls}>Sinônimos / nomes alternativos (separe com ;)</label><input className={inputCls} value={form.nomes_alternativos} onChange={(e) => setForm({ ...form, nomes_alternativos: e.target.value })} placeholder="25-OH Vitamina D; Vit D 25 OH" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={labelCls}>Categoria</label><input className={inputCls} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /></div>
              <div><label className={labelCls}>Tipo</label><input className={inputCls} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} /></div>
              <div><label className={labelCls}>Material/amostra</label><input className={inputCls} value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={labelCls}>Custo (R$)</label><input className={inputCls} value={form.custo} onChange={(e) => setForm({ ...form, custo: e.target.value })} /></div>
              <div><label className={labelCls}>Valor comercial (R$)</label><input className={inputCls} value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} /></div>
              <div><label className={labelCls}>Unidade</label><input className={inputCls} value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} /></div>
            </div>
            <div><label className={labelCls}>Parceiro/laboratório responsável</label><input className={inputCls} value={form.parceiro} onChange={(e) => setForm({ ...form, parceiro: e.target.value })} /></div>
            <div><label className={labelCls}>Observações</label><textarea rows={2} className={inputCls} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo (entra nas comparações)</label>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <Button variant="outline" onClick={() => setForm(null)} className="h-9 px-4 text-xs">Cancelar</Button>
              <Button onClick={salvar} disabled={salvando} className="h-9 px-4 text-xs gap-1.5">{salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Importação: mapeamento + prévia */}
      <Modal isOpen={!!table} onClose={() => !importando && setTable(null)} title="Importar exames para a base" description={table?.fileName} maxWidth="max-w-3xl">
        {table && (
          <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
            <div>
              <p className={labelCls}>1. Confira o mapeamento das colunas</p>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(BASE_FIELD_LABELS) as BaseField[]).map((f) => (
                  <div key={f}>
                    <label className={labelCls}>{BASE_FIELD_LABELS[f]}</label>
                    <select className={inputCls} value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                      <option value="">— não importar —</option>
                      {table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className={labelCls}>2. Prévia (primeiras linhas)</p>
              <div className="overflow-x-auto border border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
                <table className="w-full text-[11px]"><thead className="bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"><tr>{table.headers.slice(0, 8).map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">{table.rows.slice(0, 5).map((r, i) => <tr key={i}>{r.slice(0, 8).map((c, j) => <td key={j} className="px-2 py-1.5 truncate max-w-[160px]">{c}</td>)}</tr>)}</tbody></table>
              </div>
            </div>
            {mapping.nome === undefined ? (
              <p className="text-xs text-amber-600">Escolha qual coluna é o nome do exame.</p>
            ) : preview && (
              <p className="text-xs text-[var(--color-text-muted)]">
                <strong className="text-emerald-600">{preview.novos.length}</strong> exames novos serão importados · {preview.pulados} linhas ignoradas (vazias ou já existentes na base).
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <Button variant="outline" onClick={() => setTable(null)} disabled={importando} className="h-9 px-4 text-xs">Cancelar</Button>
              <Button onClick={importar} disabled={importando || !preview || preview.novos.length === 0} className="h-9 px-4 text-xs gap-1.5">
                {importando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />} Importar {preview?.novos.length ?? 0} exames
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
