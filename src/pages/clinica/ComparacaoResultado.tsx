import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Sparkles, ChevronLeft, ChevronRight, GitCompare, Loader2, Percent, Search, TrendingDown, Wallet, X, Replace, Layers } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { EmptyState } from "../../components/ui/empty-state";
import { StatCell, StatCellRow } from "../finance/components/StatCell";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import { apiFetch } from "../../lib/apiClient";
import { cn } from "../../lib/utils";
import { COMPARISON_STATUS_LABEL, COMPARISON_STATUS_TONE } from "./ComparacaoTabelas";
import { ComparacaoExportButtons } from "./components/ComparacaoExportButtons";
import { ComparacaoPesquisaExterna } from "./components/ComparacaoPesquisaExterna";

const PAGE_SIZE = 50;
const inputCls =
  "w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]";

type Filtro = "todos" | "automatico" | "revisao" | "nao_identificado" | "confirmado";
const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" }, { id: "automatico", label: "Automáticos" }, { id: "revisao", label: "Revisão" },
  { id: "nao_identificado", label: "Não identificados" }, { id: "confirmado", label: "Confirmados" },
];
type Ordem = "linha" | "maior_diferenca" | "maior_impacto";

const ITEM_TONE: Record<string, string> = {
  automatico: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
  confirmado: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
  revisao: "bg-amber-500/10 text-amber-600 border-amber-500/25",
  nao_identificado: "bg-rose-500/10 text-rose-600 border-rose-500/25",
  rejeitado: "bg-rose-500/10 text-rose-600 border-rose-500/25",
};
const ITEM_LABEL: Record<string, string> = {
  automatico: "Automática", confirmado: "Confirmada", revisao: "Revisar", nao_identificado: "Não identificado", rejeitado: "Rejeitada",
};
const ORIGEM_LABEL: Record<string, string> = {
  codigo: "Código idêntico", memoria: "Memória confirmada", sinonimo: "Nome/sinônimo idêntico", similaridade: "Similaridade textual", aurora: "Aurora", manual: "Decisão manual",
};

export default function ComparacaoResultado() {
  const { id } = useParams();
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();

  const [comp, setComp] = useState<any | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [baseMap, setBaseMap] = useState<Record<string, any>>({});
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [ordem, setOrdem] = useState<Ordem>("linha");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [loadingItens, setLoadingItens] = useState(false);
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [acionando, setAcionando] = useState<string | null>(null);
  const [trocaBusca, setTrocaBusca] = useState("");
  const [trocaRes, setTrocaRes] = useState<any[]>([]);
  const [auroraRodando, setAuroraRodando] = useState(false);

  const carregarComp = useCallback(async () => {
    if (!supabase || !activeTenantId || !id) return;
    const { data } = await supabase.from("saude_comparacoes").select("*").eq("id", id).eq("tenant_id", activeTenantId).maybeSingle();
    setComp(data || null);
    setCarregando(false);
  }, [activeTenantId, id]);
  useEffect(() => { carregarComp(); }, [carregarComp]);

  const carregarItens = useCallback(async () => {
    if (!supabase || !activeTenantId || !id) return;
    setLoadingItens(true);
    let q = supabase.from("saude_comparacao_itens").select("*", { count: "exact" }).eq("comparacao_id", id).eq("tenant_id", activeTenantId);
    if (filtro === "confirmado") q = q.eq("status", "confirmado");
    else if (filtro === "nao_identificado") q = q.in("status", ["nao_identificado", "rejeitado"]);
    else if (filtro !== "todos") q = q.eq("status", filtro);
    const termo = busca.trim().replace(/[%,()]/g, " ");
    if (termo) q = q.or(`nome_parceiro.ilike.%${termo}%,codigo_parceiro.ilike.%${termo}%`);
    if (ordem === "maior_diferenca") q = q.order("diferenca", { ascending: false, nullsFirst: false });
    else if (ordem === "maior_impacto") q = q.order("diferenca", { ascending: true, nullsFirst: false });
    else q = q.order("linha", { ascending: true });
    const { data, count, error } = await q.range(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) { toast.error("Não foi possível carregar os itens."); setLoadingItens(false); return; }
    const list = data || [];
    setItens(list);
    setTotal(count || 0);
    const ids = [...new Set(list.flatMap((it: any) => [it.exame_base_id, ...(it.candidatos || []).map((c: any) => c.exame_base_id)]).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: bases } = await supabase.from("saude_exames_base").select("id,nome,codigo_interno,custo,valor").eq("tenant_id", activeTenantId).in("id", ids);
      setBaseMap((prev) => ({ ...prev, ...Object.fromEntries((bases || []).map((b: any) => [b.id, b])) }));
    }
    setLoadingItens(false);
  }, [activeTenantId, id, filtro, ordem, busca, pagina]);
  useEffect(() => { carregarItens(); }, [carregarItens]);
  useEffect(() => { setPagina(0); }, [filtro, ordem, busca]);

  // Busca de outro exame para "Escolher outro"
  useEffect(() => {
    if (!detalhe || !supabase || !activeTenantId || trocaBusca.trim().length < 2) { setTrocaRes([]); return; }
    const t = window.setTimeout(async () => {
      const termo = trocaBusca.trim().replace(/[%,()]/g, " ");
      const { data } = await supabase!.from("saude_exames_base").select("id,nome,codigo_interno,custo,valor")
        .eq("tenant_id", activeTenantId).eq("ativo", true).or(`nome.ilike.%${termo}%,codigo_interno.ilike.%${termo}%`).limit(8);
      setTrocaRes(data || []);
    }, 250);
    return () => window.clearTimeout(t);
  }, [trocaBusca, detalhe, activeTenantId]);

  const decidir = async (item: any, action: "confirm" | "reject" | "select", exameBaseId?: string) => {
    if (!activeTenantId) return;
    setAcionando(item.id + action);
    try {
      const res = await apiFetch(`/api/health/table-comparison/${id}/items/${item.id}/decision?tenantId=${encodeURIComponent(activeTenantId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, exame_base_id: exameBaseId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Falha ao registrar a decisão.");
      if (body.summary) setComp(body.summary);
      setDetalhe(null); setTrocaBusca("");
      await carregarItens();
    } catch (e: any) { toast.error(e?.message || "Falha ao registrar a decisão."); }
    finally { setAcionando(null); }
  };

  const analisarComAurora = async () => {
    if (!activeTenantId || !id) return;
    setAuroraRodando(true);
    try {
      const res = await apiFetch(`/api/health/table-comparison/${id}/aurora?tenantId=${encodeURIComponent(activeTenantId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limite: 45 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Falha na análise da Aurora.");
      if (body.summary) setComp(body.summary);
      await carregarItens();
      if (body.analisados === 0 && !body.falhas) toast.info(body.mensagem || "Nada para a Aurora analisar.");
      else toast.success(`Aurora analisou ${body.analisados} itens: ${body.sugeridos} sugestão(ões), ${body.rebaixados} descartada(s), ${body.incertos} sem segurança${body.falhas ? ` · ${body.falhas} falharam (tente de novo)` : ""}.${body.restantes ? ` Restam ${body.restantes}.` : ""}`, { duration: 8000 });
    } catch (e: any) { toast.error(e?.message || "Falha na análise da Aurora."); }
    finally { setAuroraRodando(false); }
  };

  const resumo = useMemo(() => {
    if (!comp) return null;
    const t = comp.total || 0;
    const pct = (n: number) => (t > 0 ? Math.round((n / t) * 100) : 0);
    const vc = Number(comp.valor_correspondido) || 0;
    const margem = vc > 0 ? Math.round(((vc - (Number(comp.custo_total) || 0)) / vc) * 1000) / 10 : null;
    return { t, pctAuto: pct(comp.qtd_automatico), pctRev: pct(comp.qtd_revisao), pctNao: pct(comp.qtd_nao_identificado), margem };
  }, [comp]);

  if (carregando) return <PageContainer title="Comparação"><p className="text-xs text-[var(--color-text-faint)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</p></PageContainer>;
  if (!comp || !resumo) {
    return <PageContainer title="Comparação"><EmptyState icon={GitCompare} title="Comparação não encontrada" description="Ela pode ter sido removida." action={<Link to="/app/clinicas/comparacao-tabelas" className="text-xs text-[var(--color-primary-blue)] hover:underline">Voltar ao histórico</Link>} /></PageContainer>;
  }

  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = detalhe?.exame_base_id ? baseMap[detalhe.exame_base_id] : null;

  return (
    <PageContainer
      title={`Comparação — ${comp.parceiro}`}
      description={`${comp.arquivo_nome || "Tabela enviada"} · ${new Date(comp.created_at).toLocaleString("pt-BR")}`}
      breadcrumb={[{ label: "Clínica & Saúde" }, { label: "Comparação de Tabelas", path: "/app/clinicas/comparacao-tabelas" }, { label: comp.parceiro }]}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/app/clinicas/comparacao-tabelas" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-2"><ArrowLeft className="w-3.5 h-3.5" /> Histórico</Link>
          {activeTenantId && <ComparacaoPesquisaExterna comparacaoId={comp.id} tenantId={activeTenantId} pendentes={comp.qtd_nao_identificado} />}
          {activeTenantId && <ComparacaoExportButtons comparacaoId={comp.id} tenantId={activeTenantId} />}
          {(comp.qtd_revisao > 0 || comp.qtd_nao_identificado > 0) && (
            <Button variant="outline" onClick={analisarComAurora} disabled={auroraRodando} className="h-9 px-4 text-xs font-medium gap-1.5" title="A Aurora analisa só os itens em dúvida; você continua confirmando o que ela sugerir.">
              {auroraRodando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />} Analisar pendências com a Aurora
            </Button>
          )}
          <span className={cn("inline-flex px-3 py-1.5 rounded-lg text-xs font-bold border", COMPARISON_STATUS_TONE[comp.status])}>{COMPARISON_STATUS_LABEL[comp.status] || comp.status}</span>
        </div>
      }
    >
      <div className="space-y-5 max-w-[1700px] mx-auto pb-12">
        {comp.status === "erro" && <div className="rounded-[var(--radius-control)] border border-rose-500/30 bg-rose-500/10 text-rose-600 text-xs p-3">A comparação falhou: {comp.erro_mensagem || "erro desconhecido"}.</div>}

        <Card className="p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">{resumo.t.toLocaleString("pt-BR")} itens analisados</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-[var(--color-surface-sunken)]">
            <div className="bg-emerald-500" style={{ width: `${resumo.pctAuto}%` }} />
            <div className="bg-amber-500" style={{ width: `${resumo.pctRev}%` }} />
            <div className="bg-rose-500" style={{ width: `${resumo.pctNao}%` }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs">
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><strong>{comp.qtd_automatico.toLocaleString("pt-BR")}</strong> correspondências ({resumo.pctAuto}%)</div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /><strong>{comp.qtd_revisao.toLocaleString("pt-BR")}</strong> precisam de revisão ({resumo.pctRev}%)</div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /><strong>{comp.qtd_nao_identificado.toLocaleString("pt-BR")}</strong> não identificados ({resumo.pctNao}%)</div>
          </div>
        </Card>

        <StatCellRow>
          <StatCell label="Valor da tabela (parceiro)" value={formatCurrency(Number(comp.valor_total_parceiro) || 0)} icon={Wallet} />
          <StatCell label="Custo (itens correspondidos)" value={formatCurrency(Number(comp.custo_total) || 0)} icon={Layers} />
          <StatCell label="Diferença total" value={formatCurrency(Number(comp.diferenca_total) || 0)} icon={TrendingDown} tone={(Number(comp.diferenca_total) || 0) > 0 ? "warning" : "success"} hint="Parceiro − base, só itens correspondidos" />
          <StatCell label="Margem geral" value={resumo.margem === null ? "—" : `${resumo.margem}%`} icon={Percent} tone={resumo.margem !== null && resumo.margem < 0 ? "danger" : "neutral"} />
        </StatCellRow>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] flex-wrap">
            {FILTROS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFiltro(f.id)} className={cn("px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all", filtro === f.id ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}>{f.label}</button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
            <input type="text" placeholder="Buscar exame ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} className={cn(inputCls, "pl-9")} />
          </div>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={cn(inputCls, "!w-auto")}>
            <option value="linha">Ordem da planilha</option><option value="maior_diferenca">Maior diferença (parceiro mais caro)</option><option value="maior_impacto">Maior desconto do parceiro</option>
          </select>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr><th className="px-4 py-3">Exame do parceiro</th><th className="px-4 py-3">Correspondência na base</th><th className="px-4 py-3 text-right">Conf.</th><th className="px-4 py-3 text-right">Parceiro</th><th className="px-4 py-3 text-right">Dif.</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 w-24" /></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {loadingItens && itens.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-faint)]"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /></td></tr>}
                {!loadingItens && itens.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--color-text-faint)]">Nenhum item para esse filtro.</td></tr>}
                {itens.map((it) => {
                  const b = it.exame_base_id ? baseMap[it.exame_base_id] : null;
                  const podeRevisar = it.status === "revisao";
                  return (
                    <tr key={it.id} onClick={() => setDetalhe(it)} className="hover:bg-[var(--color-surface-sunken)]/50 cursor-pointer">
                      <td className="px-4 py-3"><p className="font-medium text-[var(--color-text-primary)]">{it.nome_parceiro || "—"}</p>{it.codigo_parceiro && <p className="text-[10px] font-mono text-[var(--color-text-faint)]">{it.codigo_parceiro}</p>}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{b ? b.nome : <span className="text-[var(--color-text-faint)]">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{it.score}%</td>
                      <td className="px-4 py-3 text-right tabular-nums">{it.valor_parceiro != null ? formatCurrency(Number(it.valor_parceiro)) : "—"}</td>
                      <td className={cn("px-4 py-3 text-right tabular-nums font-semibold", Number(it.diferenca) > 0 ? "text-amber-600" : Number(it.diferenca) < 0 ? "text-emerald-600" : "")}>{it.diferenca != null ? formatCurrency(Number(it.diferenca)) : "—"}</td>
                      <td className="px-4 py-3"><span className={cn("inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border", ITEM_TONE[it.status])}>{ITEM_LABEL[it.status] || it.status}</span></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {podeRevisar && (
                          <>
                            <button type="button" title="Confirmar" disabled={!!acionando} onClick={() => decidir(it, "confirm")} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10">{acionando === it.id + "confirm" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}</button>
                            <button type="button" title="Rejeitar" disabled={!!acionando} onClick={() => decidir(it, "reject")} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"><X className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-muted)]">
            <span>{total.toLocaleString("pt-BR")} itens · página {pagina + 1} de {paginas}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="xs" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
              <Button variant="outline" size="xs" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        </Card>
      </div>

      <Modal isOpen={!!detalhe} onClose={() => { setDetalhe(null); setTrocaBusca(""); }} title="Detalhe da correspondência" maxWidth="max-w-2xl">
        {detalhe && (
          <div className="space-y-4 max-h-[74vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] p-3 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">Item do parceiro</p>
                <p className="text-sm font-bold">{detalhe.nome_parceiro}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">Código: {detalhe.codigo_parceiro || "—"}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">Valor: {detalhe.valor_parceiro != null ? formatCurrency(Number(detalhe.valor_parceiro)) : "—"}{detalhe.quantidade != null ? ` · Qtd ${detalhe.quantidade}` : ""}</p>
              </div>
              <div className="rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] p-3 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">Item da base</p>
                {base ? (<>
                  <p className="text-sm font-bold">{base.nome}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">Código: {base.codigo_interno || "—"}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">Custo: {base.custo != null ? formatCurrency(Number(base.custo)) : "—"} · Valor: {base.valor != null ? formatCurrency(Number(base.valor)) : "—"}</p>
                </>) : <p className="text-xs text-[var(--color-text-faint)]">Sem correspondência definida.</p>}
              </div>
            </div>

            <div className="rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">Análise</p>
                <span className={cn("inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border", ITEM_TONE[detalhe.status])}>{ITEM_LABEL[detalhe.status]} · {detalhe.score}%</span>
              </div>
              <p className="text-xs">{detalhe.motivo || "—"}</p>
              {detalhe.origem_decisao && <p className="text-[11px] text-[var(--color-text-muted)]">Origem da decisão: {ORIGEM_LABEL[detalhe.origem_decisao] || detalhe.origem_decisao}</p>}
              {(detalhe.evidencias || []).length > 0 && <ul className="text-[11px] text-[var(--color-text-muted)] list-disc pl-4">{detalhe.evidencias.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>}
              {detalhe.diferenca != null && (
                <p className="text-[11px] text-[var(--color-text-muted)]">Diferença: <strong>{formatCurrency(Number(detalhe.diferenca))}</strong>{detalhe.diferenca_pct != null ? ` (${detalhe.diferenca_pct}%)` : ""}{detalhe.margem != null ? ` · Margem: ${detalhe.margem}%` : ""}</p>
              )}
              {detalhe.revisado_em && <p className="text-[11px] text-[var(--color-text-faint)]">Revisado em {new Date(detalhe.revisado_em).toLocaleString("pt-BR")}</p>}
            </div>

            {(detalhe.candidatos || []).length > 1 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] mb-1.5">Outros candidatos</p>
                <div className="space-y-1">
                  {detalhe.candidatos.filter((c: any) => c.exame_base_id !== detalhe.exame_base_id).map((c: any) => (
                    <button key={c.exame_base_id} type="button" disabled={!!acionando} onClick={() => decidir(detalhe, "select", c.exame_base_id)}
                      className="w-full flex items-center justify-between gap-2 text-left text-xs px-3 py-2 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-sunken)]">
                      <span className="truncate">{baseMap[c.exame_base_id]?.nome || c.exame_base_id}</span><span className="text-[var(--color-text-faint)] shrink-0">{c.score}% · usar este</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] mb-1.5 flex items-center gap-1"><Replace className="w-3 h-3" /> Escolher outro exame da base</p>
              <input className={inputCls} placeholder="Digite o nome ou código…" value={trocaBusca} onChange={(e) => setTrocaBusca(e.target.value)} />
              {trocaRes.length > 0 && (
                <div className="mt-1 border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] divide-y divide-[var(--color-border-subtle)]">
                  {trocaRes.map((b) => (
                    <button key={b.id} type="button" disabled={!!acionando} onClick={() => decidir(detalhe, "select", b.id)} className="w-full text-left text-xs px-3 py-2 hover:bg-[var(--color-surface-sunken)] flex justify-between gap-2">
                      <span className="truncate">{b.nome}</span><span className="font-mono text-[var(--color-text-faint)] shrink-0">{b.codigo_interno || ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <Button variant="outline" disabled={!!acionando} onClick={() => decidir(detalhe, "reject")} className="h-9 px-4 text-xs gap-1.5 text-rose-500"><X className="w-3.5 h-3.5" /> Rejeitar</Button>
              <Button disabled={!!acionando || !detalhe.exame_base_id} onClick={() => decidir(detalhe, "confirm")} className="h-9 px-4 text-xs gap-1.5"><Check className="w-3.5 h-3.5" /> Confirmar correspondência</Button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
