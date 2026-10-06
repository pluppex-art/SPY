import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileUp, Plus, FileText, Loader2, CheckCircle2, Clock, Send, Wallet, Database, Truck } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { EmptyState } from "../../components/ui/empty-state";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import { apiFetch } from "../../lib/apiClient";
import { parseNFeXml, nfeTotalsMismatch } from "../../lib/nfe";
import { NOTA_STATUSES, NOTA_STATUS_TONE, defaultQtdEstoque, findProductForItem, type NotaStatus } from "../../lib/notaEntrada";
import { cn } from "../../lib/utils";

const MAX_XML_BYTES = 2 * 1024 * 1024;

export default function NotasEntrada() {
  const { activeTenantId, user } = useAuth();
  const { products } = useData();
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [notas, setNotas] = useState<any[] | null>(null);
  const [filtro, setFiltro] = useState<string>("");
  const [fornecedorFiltro, setFornecedorFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [importando, setImportando] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ fornecedor: "", numero: "" });

  // Importar do Max Data
  const [maxOpen, setMaxOpen] = useState(false);
  const [maxLoading, setMaxLoading] = useState(false);
  const [maxError, setMaxError] = useState<string | null>(null);
  const [maxEntries, setMaxEntries] = useState<any[]>([]);
  const [maxTotal, setMaxTotal] = useState(0);
  const [maxPendentes, setMaxPendentes] = useState(0);
  const [maxTruncated, setMaxTruncated] = useState(false);
  const [maxBusca, setMaxBusca] = useState("");
  const [maxSel, setMaxSel] = useState<Set<number>>(new Set());
  const [maxImportando, setMaxImportando] = useState(false);

  const carregar = async () => {
    if (!supabase || !activeTenantId) return;
    const { data, error } = await supabase
      .from("notas_entrada")
      .select("id, status, origem, numero, serie, fornecedor_nome, data_emissao, valor_total, created_at, nota_entrada_itens(count)")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { toast.error("Não foi possível carregar as notas."); setNotas([]); return; }
    setNotas(data || []);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [activeTenantId]);

  const fornecedoresOpts = useMemo(
    () => Array.from(new Set((notas || []).map((n) => n.fornecedor_nome).filter(Boolean) as string[])).sort((x, y) => x.localeCompare(y)),
    [notas],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (notas || []).filter((n) => {
      if (filtro && n.status !== filtro) return false;
      if (fornecedorFiltro && n.fornecedor_nome !== fornecedorFiltro) return false;
      return !q || (n.fornecedor_nome || "").toLowerCase().includes(q) || (n.numero || "").toLowerCase().includes(q);
    });
  }, [notas, filtro, busca, fornecedorFiltro]);

  const kpis = useMemo(() => {
    const list = filtradas;
    const mes = new Date().toISOString().slice(0, 7);
    const doMes = list.filter((n) => n.status === "No estoque" && (n.created_at || "").startsWith(mes));
    return {
      rascunhos: list.filter((n) => n.status === "Rascunho").length,
      emFluxo: list.filter((n) => ["Pronta para envio", "Enviada", "Validada"].includes(n.status)).length,
      noEstoqueMes: doMes.length,
      valorMes: doMes.reduce((s, n) => s + (Number(n.valor_total) || 0), 0),
    };
  }, [filtradas]);

  const activeFilters = (filtro ? 1 : 0) + (fornecedorFiltro ? 1 : 0) + (busca.trim() ? 1 : 0);
  const limparFiltros = () => { setFiltro(""); setFornecedorFiltro(""); setBusca(""); };

  const handleXml = async (file: File) => {
    if (!supabase || !activeTenantId) return;
    if (file.size > MAX_XML_BYTES) { toast.error("Arquivo muito grande (máx. 2 MB)."); return; }
    setImportando(true);
    try {
      const xml = await file.text();
      let nfe;
      try { nfe = parseNFeXml(xml); } catch (e: any) { toast.error(e?.message || "Não foi possível ler o XML."); return; }

      if (nfe.chave_acesso) {
        const { data: existente } = await supabase.from("notas_entrada").select("id, numero")
          .eq("tenant_id", activeTenantId).eq("chave_acesso", nfe.chave_acesso).neq("status", "Cancelada").maybeSingle();
        if (existente) {
          toast.info(`Esta nota já foi cadastrada (NF ${existente.numero || "s/n"}) — abrindo.`);
          navigate(`/app/varejo/notas-entrada/${existente.id}`);
          return;
        }
      }

      const { data: nota, error } = await supabase.from("notas_entrada").insert({
        tenant_id: activeTenantId, origem: "xml", status: "Rascunho",
        numero: nfe.numero || null, serie: nfe.serie || null, chave_acesso: nfe.chave_acesso || null,
        data_emissao: nfe.data_emissao || null, natureza_operacao: nfe.natureza_operacao || null,
        fornecedor_nome: nfe.fornecedor_nome || null, fornecedor_cnpj: nfe.fornecedor_cnpj || null,
        valor_produtos: nfe.valor_produtos, valor_frete: nfe.valor_frete, valor_desconto: nfe.valor_desconto,
        valor_outras: nfe.valor_outras, valor_total: nfe.valor_total,
        xml_original: xml, created_by: (user as any)?.id ?? null,
      }).select("id").maybeSingle();
      if (error || !nota) { toast.error(error?.code === "23505" ? "Esta nota já foi cadastrada." : "Não foi possível salvar a nota."); return; }

      let vinculados = 0;
      const itens = nfe.itens.map((i) => {
        const match = findProductForItem(i, products as any[]);
        if (match) vinculados++;
        return {
          tenant_id: activeTenantId, nota_id: nota.id, numero_item: i.numero_item,
          codigo: i.codigo || null, ean: i.ean || null, descricao: i.descricao, ncm: i.ncm || null, cfop: i.cfop || null,
          unidade: i.unidade || null, quantidade: i.quantidade, valor_unitario: i.valor_unitario, valor_total: i.valor_total,
          product_id: match?.product.id ?? null, qtd_estoque: defaultQtdEstoque(i.quantidade),
        };
      });
      const { error: itensErr } = await supabase.from("nota_entrada_itens").insert(itens);
      if (itensErr) {
        await supabase.from("notas_entrada").delete().eq("id", nota.id);
        toast.error("Não foi possível salvar os itens da nota.");
        return;
      }

      const diff = nfeTotalsMismatch(nfe);
      if (diff !== 0) toast.warning(`A soma dos itens difere do total de produtos da nota em ${formatCurrency(Math.abs(diff))}. Confira.`);
      toast.success(`NF ${nfe.numero || ""} importada: ${nfe.itens.length} item(ns), ${vinculados} já ligado(s) a produtos.`);
      navigate(`/app/varejo/notas-entrada/${nota.id}`);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const abrirMax = async () => {
    setMaxOpen(true);
    setMaxLoading(true);
    setMaxError(null);
    setMaxSel(new Set());
    try {
      const res = await apiFetch(`/api/varejo/maxdata/entries?tenantId=${encodeURIComponent(activeTenantId || "")}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setMaxError(body?.error || "Não foi possível ler as entradas da Max Data."); setMaxEntries([]); return; }
      setMaxEntries(body.entries || []);
      setMaxTotal(body.total || 0);
      setMaxPendentes(body.pendentes || 0);
      setMaxTruncated(!!body.truncated);
    } catch {
      setMaxError("Falha ao contatar o servidor.");
    } finally {
      setMaxLoading(false);
    }
  };

  const importarMax = async () => {
    if (maxSel.size === 0) return;
    setMaxImportando(true);
    try {
      const res = await apiFetch(`/api/varejo/maxdata/entries/import?tenantId=${encodeURIComponent(activeTenantId || "")}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(maxSel) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body?.error || "Não foi possível importar."); return; }
      const ok = (body.results || []).filter((r: any) => r.ok && !r.jaImportada);
      const falhas = (body.results || []).filter((r: any) => !r.ok);
      const vinculados = ok.reduce((sum: number, r: any) => sum + (r.vinculados || 0), 0);
      const itensTotal = ok.reduce((sum: number, r: any) => sum + (r.itens || 0), 0);
      if (ok.length > 0) toast.success(`${ok.length} nota(s) importada(s): ${itensTotal} item(ns), ${vinculados} já ligado(s) a produtos.`);
      if (falhas.length > 0) toast.error(`${falhas.length} não importada(s): ${falhas[0].error}`);
      setMaxOpen(false);
      await carregar();
      if (ok.length === 1 && falhas.length === 0) navigate(`/app/varejo/notas-entrada/${ok[0].notaId}`);
    } finally {
      setMaxImportando(false);
    }
  };

  const maxFiltradas = maxEntries.filter((e) => {
    const q = maxBusca.trim().toLowerCase();
    return !q || String(e.numeroNf ?? "").toLowerCase().includes(q) || (e.fornecedorNome || "").toLowerCase().includes(q);
  });

  const criarManual = async () => {
    if (!supabase || !activeTenantId) return;
    if (!manual.fornecedor.trim()) { toast.error("Informe o fornecedor."); return; }
    const { data, error } = await supabase.from("notas_entrada").insert({
      tenant_id: activeTenantId, origem: "manual", status: "Rascunho",
      fornecedor_nome: manual.fornecedor.trim(), numero: manual.numero.trim() || null, created_by: (user as any)?.id ?? null,
    }).select("id").maybeSingle();
    if (error || !data) { toast.error("Não foi possível criar a nota."); return; }
    setManualOpen(false);
    setManual({ fornecedor: "", numero: "" });
    navigate(`/app/varejo/notas-entrada/${data.id}`);
  };

  return (
    <PageContainer
      title="Notas de Entrada"
      description="Cadastre a nota fiscal de compra, ligue cada item ao produto e dê entrada no estoque."
      breadcrumb={[{ label: "Varejo" }, { label: "Notas de Entrada" }]}
      actions={
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleXml(f); }} />
          <Button variant="outline" onClick={abrirMax} className="h-9 px-4 text-xs font-medium gap-1.5"><Database className="w-3.5 h-3.5" /> Importar do Max Data</Button>
          <Button variant="outline" onClick={() => setManualOpen(true)} className="h-9 px-4 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Nota manual</Button>
          <Button onClick={() => fileRef.current?.click()} disabled={importando} className="h-9 px-4 text-xs font-medium gap-1.5">
            {importando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />} Importar XML da NF-e
          </Button>
        </div>
      }
    >
      <div className="space-y-5 max-w-[1700px] mx-auto pb-12">
        <KpiFilterCard
          id="varejoNotasEntrada"
          activeCount={activeFilters}
          onClear={limparFiltros}
          kpis={[
            { label: "Rascunhos", value: kpis.rascunhos, icon: FileText, tone: "primary", hint: "Ainda em preparação" },
            { label: "Em validação", value: kpis.emFluxo, icon: Send, tone: kpis.emFluxo > 0 ? "warning" : "neutral", hint: "Pronta, enviada ou validada" },
            { label: "No estoque (mês)", value: kpis.noEstoqueMes, icon: CheckCircle2, tone: "success" },
            { label: "Valor no estoque (mês)", value: formatCurrency(kpis.valorMes), icon: Wallet, tone: "info" },
          ]}
        >
          <FilterBar>
            <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar fornecedor ou número…" />
            <FilterSelect icon={Truck} value={fornecedorFiltro} onChange={setFornecedorFiltro} options={fornecedoresOpts} allLabel="Todos os fornecedores" />
            <FilterChips value={filtro} onChange={setFiltro} options={[...NOTA_STATUSES]} allLabel="Todas" />
          </FilterBar>
        </KpiFilterCard>

        {notas === null ? (
          <p className="text-xs text-[var(--color-text-faint)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</p>
        ) : filtradas.length === 0 ? (
          <EmptyState icon={FileText} title={notas.length === 0 ? "Nenhuma nota cadastrada ainda" : "Nenhuma nota para esse filtro"} description={notas.length === 0 ? "Importe o XML da NF-e ou crie uma nota manual." : "Ajuste o filtro ou a busca."} />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-6 py-3">Nota</th><th className="px-6 py-3">Fornecedor</th><th className="px-6 py-3">Emissão</th>
                  <th className="px-6 py-3 text-right">Itens</th><th className="px-6 py-3 text-right">Valor</th><th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {filtradas.map((n) => (
                  <tr key={n.id} onClick={() => navigate(`/app/varejo/notas-entrada/${n.id}`)} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors cursor-pointer">
                    <td className="px-6 py-3.5 font-mono text-[var(--color-text-primary)]">
                      <Link to={`/app/varejo/notas-entrada/${n.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{n.numero ? `NF ${n.numero}${n.serie ? `/${n.serie}` : ""}` : "Sem número"}</Link>
                      {n.origem === "xml" && <span className="ml-2 text-[9px] font-semibold uppercase text-[var(--color-text-faint)]">xml</span>}
                    </td>
                    <td className="px-6 py-3.5 font-medium text-[var(--color-text-primary)]">{n.fornecedor_nome || "—"}</td>
                    <td className="px-6 py-3.5 text-[var(--color-text-muted)] font-mono">{n.data_emissao ? new Date(n.data_emissao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-[var(--color-text-muted)]">{n.nota_entrada_itens?.[0]?.count ?? 0}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-[var(--color-text-primary)]">{formatCurrency(Number(n.valor_total) || 0)}</td>
                    <td className="px-6 py-3.5"><span className={cn("inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold border", NOTA_STATUS_TONE[n.status as NotaStatus])}>{n.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <p className="text-[11px] text-[var(--color-text-faint)] flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> A validação/venda pela API externa ainda não está ligada: por enquanto o status Enviada/Validada é marcado à mão e a entrada no estoque é feita na própria nota.
        </p>
      </div>

      <Modal isOpen={maxOpen} onClose={() => setMaxOpen(false)} title="Importar do Max Data" description="Entradas de nota fiscal do Max. O SPY só lê — nada é alterado lá. A nota entra como rascunho, com os itens já ligados aos produtos quando o código de barras ou o SKU bate." maxWidth="max-w-3xl">
        <div className="space-y-3">
          {maxLoading ? (
            <p className="text-xs text-[var(--color-text-faint)] flex items-center gap-2 py-6"><Loader2 className="w-3 h-3 animate-spin" /> Lendo entradas do Max…</p>
          ) : maxError ? (
            <div className="rounded-[var(--radius-control)] border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs p-3">{maxError} <span className="block text-[11px] opacity-80 mt-1">Confira em Configurações › Integrações › Max Data — Estoque e use "Testar conexão".</span></div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <input value={maxBusca} onChange={(e) => setMaxBusca(e.target.value)} placeholder="Buscar número ou fornecedor…" className="w-64 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
                <span className="text-[11px] text-[var(--color-text-faint)]">
                  Mostrando as {maxEntries.length} mais recentes de {maxTotal} · {maxPendentes} pendente{maxPendentes === 1 ? "" : "s"}
                  {maxTruncated && <span className="text-warning"> · mais de {maxTotal} na Max, lista parcial</span>}
                </span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto border border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
                <table className="w-full text-xs text-left">
                  <thead className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] sticky top-0"><tr><th className="px-3 py-2 w-8" /><th className="px-3 py-2">NF</th><th className="px-3 py-2">Fornecedor</th><th className="px-3 py-2">Emissão</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Situação</th></tr></thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {maxFiltradas.map((e) => (
                      <tr key={e.id} className={e.notaId ? "opacity-60" : ""}>
                        <td className="px-3 py-2"><input type="checkbox" disabled={!!e.notaId} checked={maxSel.has(e.id)} onChange={(ev) => setMaxSel((prev) => { const n = new Set(prev); if (ev.target.checked) n.add(e.id); else n.delete(e.id); return n; })} /></td>
                        <td className="px-3 py-2 font-mono">{e.numeroNf ?? e.id}</td>
                        <td className="px-3 py-2">{e.fornecedorNome || "—"}</td>
                        <td className="px-3 py-2 font-mono text-[var(--color-text-muted)]">{e.emissao || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(Number(e.totalnf) || 0)}</td>
                        <td className="px-3 py-2">{e.notaId ? <Link to={`/app/varejo/notas-entrada/${e.notaId}`} className="text-emerald-500 hover:underline" onClick={() => setMaxOpen(false)}>Já importada</Link> : <span className="text-[var(--color-text-muted)]">{e.status || (e.conferida ? "Conferida" : "—")}</span>}</td>
                      </tr>
                    ))}
                    {maxFiltradas.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-text-faint)]">Nenhuma entrada encontrada.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setMaxOpen(false)} className="h-9 px-4 text-xs">Fechar</Button>
            <Button onClick={importarMax} disabled={maxSel.size === 0 || maxImportando} className="h-9 px-4 text-xs gap-1.5">{maxImportando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Importar {maxSel.size > 0 ? `(${maxSel.size})` : ""}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={manualOpen} onClose={() => setManualOpen(false)} title="Nota manual" description="Cria a nota em rascunho; os itens você adiciona na próxima tela." maxWidth="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Fornecedor *</label>
            <input value={manual.fornecedor} onChange={(e) => setManual((p) => ({ ...p, fornecedor: e.target.value }))} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Número da nota</label>
            <input value={manual.numero} onChange={(e) => setManual((p) => ({ ...p, numero: e.target.value }))} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setManualOpen(false)} className="h-9 px-4 text-xs">Cancelar</Button>
            <Button onClick={criarManual} className="h-9 px-4 text-xs">Criar nota</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
