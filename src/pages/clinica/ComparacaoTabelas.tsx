import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, FileSpreadsheet, GitCompare, Loader2, Plus, Search, AlertTriangle, ListChecks, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { EmptyState } from "../../components/ui/empty-state";
import { StatCell, StatCellRow } from "../finance/components/StatCell";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { apiFetch } from "../../lib/apiClient";
import {
  guessComparisonMapping, mapComparisonRows, readTableFile,
  type ColumnMapping, type ComparisonField, type ParsedTable,
} from "../../lib/tableFile";
import { cn } from "../../lib/utils";

const inputCls =
  "w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]";
const labelCls = "text-[10px] font-bold uppercase text-[var(--color-text-muted)] mb-1 block";

export const COMPARISON_STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando", importando: "Importando", validando: "Validando", normalizando: "Normalizando",
  processando: "Processando", aguardando_revisao: "Aguardando revisão", concluido: "Concluído", erro: "Erro",
};
export const COMPARISON_STATUS_TONE: Record<string, string> = {
  aguardando: "bg-slate-500/10 text-slate-500 border-slate-500/25",
  importando: "bg-blue-500/10 text-blue-600 border-blue-500/25",
  validando: "bg-blue-500/10 text-blue-600 border-blue-500/25",
  normalizando: "bg-blue-500/10 text-blue-600 border-blue-500/25",
  processando: "bg-blue-500/10 text-blue-600 border-blue-500/25",
  aguardando_revisao: "bg-amber-500/10 text-amber-600 border-amber-500/25",
  concluido: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
  erro: "bg-rose-500/10 text-rose-600 border-rose-500/25",
};

const FIELD_LABELS: Record<ComparisonField, string> = {
  nome: "Nome do exame *", codigo: "Código", quantidade: "Quantidade", valor: "Valor do parceiro", custo: "Custo (informado pelo parceiro)",
};

const STAGES = ["Enviando a tabela", "Normalizando nomes e códigos", "Encontrando correspondências", "Calculando diferenças e margens", "Finalizando"];

export default function ComparacaoTabelas() {
  const { activeTenantId } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [lista, setLista] = useState<any[] | null>(null);
  const [busca, setBusca] = useState("");
  const [baseCount, setBaseCount] = useState<number | null>(null);

  // Wizard
  const [open, setOpen] = useState(false);
  const [parceiro, setParceiro] = useState("");
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping<ComparisonField>>({});
  const [autoThreshold, setAutoThreshold] = useState(95);
  const [reviewThreshold, setReviewThreshold] = useState(80);
  const [baseValueField, setBaseValueField] = useState<"valor" | "custo">("valor");
  const [aiAutoAccept, setAiAutoAccept] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [stage, setStage] = useState(0);

  const carregar = async () => {
    if (!supabase || !activeTenantId) return;
    const [{ data, error }, { count }] = await Promise.all([
      supabase.from("saude_comparacoes").select("*").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).limit(200),
      supabase.from("saude_exames_base").select("id", { count: "exact", head: true }).eq("tenant_id", activeTenantId).eq("ativo", true),
    ]);
    if (error) { toast.error("Não foi possível carregar o histórico."); setLista([]); return; }
    setLista(data || []);
    setBaseCount(count ?? 0);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [activeTenantId]);

  const mapped = useMemo(() => (table ? mapComparisonRows(table, mapping) : null), [table, mapping]);

  const kpis = useMemo(() => {
    const l = lista || [];
    return {
      total: l.length,
      pendentes: l.filter((c) => c.status === "aguardando_revisao").length,
      itens: l.reduce((s, c) => s + (c.total || 0), 0),
      revisao: l.reduce((s, c) => s + (c.qtd_revisao || 0) + (c.qtd_nao_identificado || 0), 0),
    };
  }, [lista]);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista || []).filter((c) => !q || (c.parceiro || "").toLowerCase().includes(q) || (c.arquivo_nome || "").toLowerCase().includes(q));
  }, [lista, busca]);

  const abrir = () => {
    setParceiro(""); setTable(null); setMapping({}); setProcessando(false); setStage(0); setOpen(true);
  };

  const onFile = async (file: File) => {
    try {
      const t = await readTableFile(file);
      setTable(t);
      setMapping(guessComparisonMapping(t.headers));
    } catch (err: any) { toast.error(err?.message || "Não foi possível ler o arquivo."); }
  };

  const iniciar = async () => {
    if (!table || !mapped || !activeTenantId) return;
    if (!parceiro.trim()) { toast.error("Informe o parceiro/origem da tabela."); return; }
    if (mapping.nome === undefined) { toast.error("Escolha a coluna do nome do exame."); return; }
    if (mapped.rows.length === 0) { toast.error("Nenhuma linha válida para comparar."); return; }
    setProcessando(true); setStage(0);
    // A comparação roda toda no servidor numa única chamada; o indicador avança por tempo estimado
    // e encerra quando a resposta chega (não há progresso real por etapa nesta versão).
    const timer = window.setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1800);
    try {
      const res = await apiFetch(`/api/health/table-comparison?tenantId=${encodeURIComponent(activeTenantId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parceiro: parceiro.trim(), arquivo_nome: table.fileName, rows: mapped.rows,
          config: { autoThreshold, reviewThreshold, aiAutoAccept }, rules: { baseValueField },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Falha ao processar a comparação.");
      toast.success("Comparação concluída.");
      setOpen(false);
      navigate(`/app/clinicas/comparacao-tabelas/${body.id}`);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao processar a comparação.");
      setProcessando(false);
      carregar();
    } finally {
      window.clearInterval(timer);
    }
  };

  return (
    <PageContainer
      title="Comparação de Tabelas"
      description="Compare a tabela de um parceiro com a sua base de exames. A correspondência é automática quando há segurança e vai para revisão quando há dúvida."
      breadcrumb={[{ label: "Clínica & Saúde" }, { label: "Comparação de Tabelas" }]}
      actions={
        <Button onClick={abrir} disabled={baseCount === 0} className="h-9 px-4 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova comparação</Button>
      }
    >
      <div className="space-y-5 max-w-[1700px] mx-auto pb-12">
        {baseCount === 0 && (
          <div className="rounded-[var(--radius-control)] border border-amber-500/30 bg-amber-500/10 text-amber-700 text-xs p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>A base de exames está vazia. Cadastre ou importe a base em <strong>Clínica & Saúde › Base de Exames</strong> antes de comparar.</span>
          </div>
        )}
        <StatCellRow>
          <StatCell label="Comparações" value={kpis.total} icon={GitCompare} />
          <StatCell label="Aguardando revisão" value={kpis.pendentes} icon={Clock} tone={kpis.pendentes > 0 ? "warning" : "neutral"} />
          <StatCell label="Itens analisados" value={kpis.itens.toLocaleString("pt-BR")} icon={ListChecks} />
          <StatCell label="Itens a revisar" value={kpis.revisao.toLocaleString("pt-BR")} icon={AlertTriangle} tone={kpis.revisao > 0 ? "warning" : "neutral"} />
        </StatCellRow>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
          <input type="text" placeholder="Buscar parceiro ou arquivo…" value={busca} onChange={(e) => setBusca(e.target.value)} className={cn(inputCls, "pl-9")} />
        </div>

        {lista === null ? (
          <p className="text-xs text-[var(--color-text-faint)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</p>
        ) : filtrada.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} title={lista.length === 0 ? "Nenhuma comparação ainda" : "Nada encontrado"} description={lista.length === 0 ? "Envie a tabela de um parceiro para começar." : "Ajuste a busca."} />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr><th className="px-6 py-3">Data</th><th className="px-6 py-3">Parceiro</th><th className="px-6 py-3">Arquivo</th><th className="px-6 py-3 text-right">Itens</th><th className="px-6 py-3 text-right">Automáticas</th><th className="px-6 py-3 text-right">Revisão</th><th className="px-6 py-3 text-right">Não id.</th><th className="px-6 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {filtrada.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/app/clinicas/comparacao-tabelas/${c.id}`)} className="hover:bg-[var(--color-surface-sunken)]/50 cursor-pointer">
                    <td className="px-6 py-3.5 font-mono text-[var(--color-text-muted)]">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="px-6 py-3.5 font-medium text-[var(--color-text-primary)]">{c.parceiro}</td>
                    <td className="px-6 py-3.5 text-[var(--color-text-muted)] max-w-[220px] truncate">{c.arquivo_nome || "—"}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums">{c.total}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-emerald-600">{c.qtd_automatico}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-amber-600">{c.qtd_revisao}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-rose-500">{c.qtd_nao_identificado}</td>
                    <td className="px-6 py-3.5"><span className={cn("inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold border", COMPARISON_STATUS_TONE[c.status])}>{COMPARISON_STATUS_LABEL[c.status] || c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal isOpen={open} onClose={() => !processando && setOpen(false)} title="Nova comparação de tabelas" description="Envie a tabela do parceiro, confira as colunas e inicie." maxWidth="max-w-3xl">
        <div className="space-y-4 max-h-[74vh] overflow-y-auto pr-1">
          {processando ? (
            <div className="py-8 space-y-4">
              {STAGES.map((s, i) => (
                <div key={s} className={cn("flex items-center gap-3 text-xs", i > stage && "opacity-40")}>
                  {i < stage ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : i === stage ? <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary-blue)]" /> : <span className="w-4 h-4 rounded-full border border-[var(--color-border-default)]" />}
                  <span className={i === stage ? "font-bold text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}>{s}</span>
                </div>
              ))}
              <p className="text-[11px] text-[var(--color-text-faint)] pt-2">Não feche esta janela. Tabelas grandes podem levar alguns segundos.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={labelCls}>Parceiro / origem da tabela *</label><input className={inputCls} value={parceiro} onChange={(e) => setParceiro(e.target.value)} placeholder="Ex.: Laboratório parceiro" /></div>
                <div>
                  <label className={labelCls}>Arquivo (.xlsx ou .csv, até 5 MB)</label>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
                  <Button variant="outline" onClick={() => fileRef.current?.click()} className="h-9 w-full text-xs gap-1.5 justify-start"><Upload className="w-3.5 h-3.5" /> {table ? table.fileName : "Escolher arquivo…"}</Button>
                </div>
              </div>

              {table && mapped && (
                <>
                  <div>
                    <p className={labelCls}>Confira o mapeamento das colunas</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(Object.keys(FIELD_LABELS) as ComparisonField[]).map((f) => (
                        <div key={f}>
                          <label className={labelCls}>{FIELD_LABELS[f]}</label>
                          <select className={inputCls} value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                            <option value="">— não usar —</option>
                            {table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-[var(--color-border-subtle)] rounded-[var(--radius-control)]">
                    <table className="w-full text-[11px]"><thead className="bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"><tr>{table.headers.slice(0, 8).map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-[var(--color-border-subtle)]">{table.rows.slice(0, 5).map((r, i) => <tr key={i}>{r.slice(0, 8).map((c, j) => <td key={j} className="px-2 py-1.5 truncate max-w-[160px]">{c}</td>)}</tr>)}</tbody></table>
                  </div>

                  <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                    <p><strong className="text-[var(--color-text-primary)]">{mapped.rows.length}</strong> linhas prontas para comparar.</p>
                    {mapped.issues.semNome > 0 && <p className="text-amber-600">{mapped.issues.semNome} linha(s) sem nome nem código serão ignoradas.</p>}
                    {mapped.issues.valorInvalido > 0 && <p className="text-amber-600">{mapped.issues.valorInvalido} valor(es) não reconhecido(s) — ficarão sem cálculo financeiro.</p>}
                    {mapped.issues.duplicadas > 0 && <p className="text-amber-600">{mapped.issues.duplicadas} linha(s) repetida(s) (mesmo nome e código).</p>}
                  </div>

                  <details className="rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] p-3">
                    <summary className="text-[11px] font-bold uppercase text-[var(--color-text-muted)] cursor-pointer">Ajustes da comparação</summary>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                      <div><label className={labelCls}>Aceitar sozinho a partir de (%)</label><input type="number" min={80} max={100} className={inputCls} value={autoThreshold} onChange={(e) => setAutoThreshold(Number(e.target.value) || 95)} /></div>
                      <div><label className={labelCls}>Sugerir para revisão a partir de (%)</label><input type="number" min={50} max={99} className={inputCls} value={reviewThreshold} onChange={(e) => setReviewThreshold(Number(e.target.value) || 80)} /></div>
                      <div><label className={labelCls}>Comparar o valor do parceiro com</label>
                        <select className={inputCls} value={baseValueField} onChange={(e) => setBaseValueField(e.target.value as any)}>
                          <option value="valor">Valor comercial da base</option><option value="custo">Custo da base</option>
                        </select>
                      </div>
                    </div>
                    <label className="flex items-start gap-2 text-[11px] text-[var(--color-text-muted)] mt-3 cursor-pointer">
                      <input type="checkbox" className="mt-0.5" checked={aiAutoAccept} onChange={(e) => setAiAutoAccept(e.target.checked)} />
                      <span>Permitir que a Aurora aceite sozinha correspondências com 97% ou mais de confiança. <strong>Desligado por padrão:</strong> sem isso, tudo que a Aurora sugere vai para a sua revisão.</span>
                    </label>
                  </details>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                <Button variant="outline" onClick={() => setOpen(false)} className="h-9 px-4 text-xs">Cancelar</Button>
                <Button onClick={iniciar} disabled={!table || !mapped || mapped.rows.length === 0 || mapping.nome === undefined || !parceiro.trim()} className="h-9 px-4 text-xs gap-1.5">
                  <GitCompare className="w-3.5 h-3.5" /> Iniciar comparação
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
}
