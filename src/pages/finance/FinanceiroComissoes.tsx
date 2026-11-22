import { useCallback, useEffect, useMemo, useState } from "react";
import { somar, lerValor } from "../../lib/dinheiro";
import { toast } from "sonner";
import { BadgePercent, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileSpreadsheet, Plus, Target, Trophy, Wand2, X } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { SeletorCompetencia } from "./components/SeletorCompetencia";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/friendlyError";
import { exportarXlsx } from "../../lib/exportXlsx";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { FilterBar, FilterChips } from "../../components/ui/kpi-filter-card";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { SecaoCard } from "./components/SecaoCard";
import { hojeISO } from "./hooks/useFinanceEntriesResumo";
import { categoriaDespesaId } from "./lib/categoriaFinanceira";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const comp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const labelComp = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`;
const paraNumero = (t: string) => lerValor(t);
const r2 = (n: number) => Math.round(n * 100) / 100;

const TOM: Record<string, string> = {
  Pendente: "bg-amber-500/15 text-amber-600", Aprovada: "bg-sky-500/15 text-sky-600", Paga: "bg-emerald-500/15 text-emerald-600", Cancelada: "bg-slate-500/15 text-slate-600",
};

interface Venda { id: string; titulo: string; cliente: string; vendedor: string; valor: number; competencia: string }

/**
 * Comissões de Vendedores — vendas fechadas (propostas aceitas) por vendedor no mês, percentual e meta de cada
 * um, geração das comissões e pagamento (que já lança a saída em Despesas).
 */
export default function FinanceiroComissoes() {
  const { activeTenantId: tenantId } = useAuth();
  const { formatCurrency: brl } = useLocalization();
  const [ref, setRef] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const competencia = comp(ref);

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [regras, setRegras] = useState<any[]>([]);
  const [comissoes, setComissoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [novo, setNovo] = useState({ vendedor: "", percentual: "", meta: "" });

  const carregar = useCallback(async () => {
    if (!supabase || !tenantId) return;
    setLoading(true);
    const [p, r, c] = await Promise.all([
      supabase.from("proposals").select("id,titulo,cliente,vendedor,valor,status,aceite_em,updated_at,created_at").eq("tenant_id", tenantId).eq("status", "Aceita").limit(5000),
      supabase.from("finance_comissao_regras").select("*").eq("tenant_id", tenantId).order("vendedor"),
      supabase.from("finance_comissoes").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(5000),
    ]);
    const erro = p.error || r.error || c.error;
    if (erro) toast.error(friendlyError(erro));
    setVendas((p.data || []).map((x: any) => ({
      id: String(x.id), titulo: x.titulo || "", cliente: x.cliente || "", vendedor: String(x.vendedor || "").trim() || "Sem vendedor", valor: Number(x.valor) || 0,
      competencia: String(x.aceite_em || x.updated_at || x.created_at || "").slice(0, 7),
    })));
    setRegras(r.data || []);
    setComissoes(c.data || []);
    setLoading(false);
  }, [tenantId]);
  useEffect(() => { carregar(); }, [carregar]);

  const regraDe = useCallback((v: string) => regras.find((r) => norm(r.vendedor) === norm(v)), [regras]);
  const vendasDoMes = useMemo(() => vendas.filter((v) => v.competencia === competencia), [vendas, competencia]);
  const comissoesDoMes = useMemo(() => comissoes.filter((c) => c.competencia === competencia), [comissoes, competencia]);
  const jaGeradas = useMemo(() => new Set(comissoes.map((c) => c.referencia).filter(Boolean)), [comissoes]);

  // Resumo por vendedor: tudo o que vendeu no mês + quem tem regra cadastrada.
  const resumo = useMemo(() => {
    const nomes = new Map<string, string>();
    for (const v of vendasDoMes) nomes.set(norm(v.vendedor), v.vendedor);
    for (const r of regras) if (r.ativo !== false) nomes.set(norm(r.vendedor), r.vendedor);
    return [...nomes.values()].map((nome) => {
      const vs = vendasDoMes.filter((v) => norm(v.vendedor) === norm(nome));
      const regra = regraDe(nome);
      const vendido = vs.reduce((a, v) => a + v.valor, 0);
      const pct = Number(regra?.percentual) || 0;
      const meta = Number(regra?.meta_mensal) || 0;
      return { nome, qtd: vs.length, vendido, pct, meta, atingido: meta > 0 ? (vendido / meta) * 100 : 0, comissao: r2((vendido * pct) / 100), semRegra: !regra, pendentesGerar: vs.filter((v) => !jaGeradas.has(v.id)).length };
    }).sort((a, b) => b.vendido - a.vendido);
  }, [vendasDoMes, regras, regraDe, jaGeradas]);

  const vendidoMes = vendasDoMes.reduce((a, v) => a + v.valor, 0);
  const aPagar = somar(comissoes.filter((c) => c.status === "Pendente" || c.status === "Aprovada"), (c) => c.valor_comissao);
  const pagoMes = somar(comissoesDoMes.filter((c) => c.status === "Paga"), (c) => c.valor_comissao);
  const metasBatidas = resumo.filter((r) => r.meta > 0 && r.vendido >= r.meta).length;

  const gerar = async () => {
    if (!supabase || !tenantId) return;
    const alvos = vendasDoMes.filter((v) => !jaGeradas.has(v.id));
    const comRegra = alvos.filter((v) => Number(regraDe(v.vendedor)?.percentual) > 0);
    const semRegra = alvos.length - comRegra.length;
    if (comRegra.length === 0) {
      toast.info(alvos.length ? "Defina o percentual dos vendedores em \"Regras de comissão\" para gerar." : "Nenhuma venda nova para gerar neste mês.");
      return;
    }
    setOcupado("gerar");
    const novas = comRegra.map((v) => {
      const pct = Number(regraDe(v.vendedor)?.percentual) || 0;
      return { tenant_id: tenantId, vendedor: v.vendedor, competencia, referencia: v.id, descricao: v.titulo, cliente: v.cliente, valor_venda: v.valor, percentual: pct, valor_comissao: r2((v.valor * pct) / 100), status: "Pendente" };
    });
    const { error } = await supabase.from("finance_comissoes").insert(novas);
    setOcupado(null);
    if (error) return toast.error(friendlyError(error));
    toast.success(`${novas.length} comissão(ões) gerada(s)${semRegra ? `; ${semRegra} venda(s) ficaram de fora por falta de percentual` : ""}.`);
    carregar();
  };

  const mudarStatus = async (c: any, status: "Aprovada" | "Cancelada") => {
    if (!supabase || !tenantId) return;
    const { error } = await supabase.from("finance_comissoes").update({ status }).eq("id", c.id).eq("tenant_id", tenantId);
    if (error) return toast.error(friendlyError(error));
    carregar();
  };

  const pagar = async (c: any) => {
    if (!supabase || !tenantId) return;
    if (!(await confirmDialog({ title: `Pagar comissão de ${c.vendedor}`, description: `Registrar o pagamento de ${brl(Number(c.valor_comissao))}. A saída será lançada em Despesas.` }))) return;
    setOcupado(c.id);
    try {
      const hoje = hojeISO();
      const { data: principal } = await supabase.from("finance_bank_accounts").select("id").eq("tenant_id", tenantId).eq("is_principal", true).eq("arquivada", false).maybeSingle();
      const entryId = crypto.randomUUID();
      const { error: e1 } = await supabase.from("finance_entries").insert({
        id: entryId, tenant_id: tenantId, description: `Comissão ${c.competencia} — ${c.vendedor}${c.cliente ? ` (${c.cliente})` : ""}`, category: "Comissões", category_id: await categoriaDespesaId(tenantId, "Comissões", "PESSOAS"),
        status: "Pago", value: Number(c.valor_comissao), type: "Pagar", date: hoje, counterparty: c.vendedor, payment_method: "Pix", conta_bancaria_id: principal?.id ?? null,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("finance_comissoes").update({ status: "Paga", data_pagamento: hoje, entry_id: entryId }).eq("id", c.id).eq("tenant_id", tenantId);
      if (e2) throw e2;
      toast.success("Comissão paga e lançada em Despesas.");
      await carregar();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setOcupado(null);
    }
  };

  const salvarRegra = async (r: any, campo: "percentual" | "meta_mensal", texto: string) => {
    if (!supabase || !tenantId) return;
    const valor = Math.max(0, paraNumero(texto));
    if (campo === "percentual" && valor > 100) return toast.error("O percentual não pode passar de 100%.");
    if (valor === Number(r[campo])) return;
    const { error } = await supabase.from("finance_comissao_regras").update({ [campo]: valor }).eq("id", r.id).eq("tenant_id", tenantId);
    if (error) return toast.error(friendlyError(error));
    carregar();
  };
  const adicionarRegra = async (vendedor: string, percentual: number, meta: number) => {
    if (!supabase || !tenantId) return;
    if (!vendedor.trim()) return toast.error("Informe o nome do vendedor.");
    if (percentual > 100) return toast.error("O percentual não pode passar de 100%.");
    const { error } = await supabase.from("finance_comissao_regras").insert({ tenant_id: tenantId, vendedor: vendedor.trim(), percentual, meta_mensal: meta });
    if (error) return toast.error(error.code === "23505" ? "Esse vendedor já tem regra." : friendlyError(error));
    setNovo({ vendedor: "", percentual: "", meta: "" });
    carregar();
  };
  const removerRegra = async (r: any) => {
    if (!supabase || !tenantId) return;
    if (!(await confirmDialog({ title: "Remover regra", description: `Remover a regra de ${r.vendedor}? As comissões já geradas não mudam.` }))) return;
    const { error } = await supabase.from("finance_comissao_regras").delete().eq("id", r.id).eq("tenant_id", tenantId);
    if (error) return toast.error(friendlyError(error));
    carregar();
  };

  const sugeridos = useMemo(() => {
    const ja = new Set(regras.map((r) => norm(r.vendedor)));
    return [...new Set(vendas.map((v) => v.vendedor))].filter((n) => n !== "Sem vendedor" && !ja.has(norm(n)));
  }, [vendas, regras]);

  const lista = comissoesDoMes.filter((c) => !filtro || c.status === filtro);
  const exportar = async () => {
    try {
      await exportarXlsx(`comissoes-${competencia}`, [
        { nome: "Resumo por vendedor", colunas: [{ titulo: "Vendedor", largura: 28 }, { titulo: "Vendas" }, { titulo: "Valor vendido", tipo: "moeda" }, { titulo: "Meta", tipo: "moeda" }, { titulo: "% da meta" }, { titulo: "% comissão" }, { titulo: "Comissão", tipo: "moeda" }], linhas: resumo.map((r) => [r.nome, r.qtd, r.vendido, r.meta, r.meta > 0 ? `${r.atingido.toFixed(0)}%` : "", `${r.pct}%`, r.comissao]) },
        { nome: "Lançamentos", colunas: [{ titulo: "Vendedor", largura: 28 }, { titulo: "Cliente", largura: 26 }, { titulo: "Venda", largura: 30 }, { titulo: "Valor da venda", tipo: "moeda" }, { titulo: "%" }, { titulo: "Comissão", tipo: "moeda" }, { titulo: "Situação", largura: 12 }, { titulo: "Pago em", tipo: "data" }], linhas: comissoesDoMes.map((c) => [c.vendedor, c.cliente, c.descricao, c.valor_venda, `${c.percentual}%`, c.valor_comissao, c.status, c.data_pagamento]) },
      ]);
    } catch (e) { toast.error(friendlyError(e)); }
  };

  const mover = (d: number) => setRef(new Date(ref.getFullYear(), ref.getMonth() + d, 1));
  const inputCls = "h-8 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] px-2 text-right text-xs tabular-nums";

  return (
    <PageContainer
      title="Comissões de Vendedores"
      description="Vendas fechadas por vendedor, percentual e meta de cada um, e o pagamento das comissões."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <SeletorCompetencia mes={ref} setMes={setRef} />
          <Button variant="outline" onClick={exportar} disabled={resumo.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar planilha</Button>
          <Button onClick={gerar} disabled={ocupado === "gerar" || vendasDoMes.every((v) => jaGeradas.has(v.id))}><Wand2 className="mr-2 h-4 w-4" />Gerar comissões do mês</Button>
        </div>
      }
    >
      <div className="mx-auto max-w-[1700px] space-y-4 pb-12">
        <FinanceKpiFilter
          id="finComissoes"
          kpis={[
            { label: "Vendido no mês", value: loading ? "…" : brl(vendidoMes), icon: Trophy, tone: "primary", hint: `${vendasDoMes.length} proposta(s) aceita(s)` },
            { label: "Comissão do mês (calculada)", value: loading ? "…" : brl(resumo.reduce((a, r) => a + r.comissao, 0)), icon: BadgePercent, tone: "neutral", hint: "Vendido × percentual de cada vendedor" },
            { label: "A pagar", value: loading ? "…" : brl(aPagar), icon: Clock, tone: aPagar > 0 ? "warning" : "neutral", hint: "Pendentes e aprovadas (todos os meses)" },
            { label: "Metas batidas", value: loading ? "…" : `${metasBatidas}/${resumo.filter((r) => r.meta > 0).length}`, icon: Target, tone: "success", hint: `Pago no mês: ${brl(pagoMes)}` },
          ]}
        />

        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <>
            <SecaoCard titulo={`Resumo por vendedor — ${labelComp(competencia)}`} icon={Trophy} semPadding>
              {resumo.length === 0 ? (
                <p className="p-4 text-sm text-[var(--color-text-muted)]">Nenhuma venda aceita neste mês e nenhum vendedor com regra. Cadastre as regras abaixo ou escolha outro mês.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]/60 text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                        <th className="px-4 py-2.5 font-semibold">Vendedor</th><th className="px-3 py-2.5 font-semibold">Vendas</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Vendido</th><th className="px-3 py-2.5 text-right font-semibold">Meta</th>
                        <th className="min-w-[8rem] px-3 py-2.5 font-semibold">% da meta</th><th className="px-3 py-2.5 text-right font-semibold">% comissão</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumo.map((r) => (
                        <tr key={r.nome} className="border-b border-[var(--color-border-default)] last:border-0">
                          <td className="px-4 py-2.5 font-semibold">{r.nome}{r.semRegra && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">sem regra</span>}</td>
                          <td className="px-3 py-2.5">{r.qtd}{r.pendentesGerar > 0 && <span className="ml-1 text-xs text-[var(--color-text-muted)]">({r.pendentesGerar} a gerar)</span>}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{brl(r.vendido)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{r.meta > 0 ? brl(r.meta) : "—"}</td>
                          <td className="px-3 py-2.5">
                            {r.meta > 0 ? (
                              <>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border-default)]"><div className={`h-full ${r.atingido >= 100 ? "bg-emerald-500" : "bg-[var(--color-primary-blue)]"}`} style={{ width: `${Math.min(100, r.atingido)}%` }} /></div>
                                <span className="text-xs text-[var(--color-text-muted)]">{r.atingido.toFixed(0)}%</span>
                              </>
                            ) : <span className="text-xs text-[var(--color-text-muted)]">sem meta</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{r.pct}%</td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums">{brl(r.comissao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SecaoCard>

            <FinanceKpiFilter id="finComissoesLista">
              <FilterBar>
                <FilterChips value={filtro} onChange={setFiltro} options={["Pendente", "Aprovada", "Paga", "Cancelada"]} />
              </FilterBar>
            </FinanceKpiFilter>

            <SecaoCard titulo={`Lançamentos de comissão — ${lista.length} em ${labelComp(competencia)}`} icon={BadgePercent} semPadding>
              {lista.length === 0 ? (
                <p className="p-4 text-sm text-[var(--color-text-muted)]">Nenhuma comissão neste mês. Use "Gerar comissões do mês" para criar a partir das vendas aceitas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border-default)] text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                        <th className="px-4 py-2 font-semibold">Vendedor</th><th className="px-3 py-2 font-semibold">Venda</th>
                        <th className="px-3 py-2 text-right font-semibold">Valor da venda</th><th className="px-3 py-2 text-right font-semibold">%</th>
                        <th className="px-3 py-2 text-right font-semibold">Comissão</th><th className="px-3 py-2 font-semibold">Situação</th><th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((c) => (
                        <tr key={c.id} className="border-b border-[var(--color-border-default)] last:border-0">
                          <td className="px-4 py-2.5 font-semibold">{c.vendedor}</td>
                          <td className="px-3 py-2.5"><p className="max-w-[18rem] truncate">{c.descricao || "—"}</p><p className="text-xs text-[var(--color-text-muted)]">{c.cliente}</p></td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{brl(Number(c.valor_venda))}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{Number(c.percentual)}%</td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums">{brl(Number(c.valor_comissao))}</td>
                          <td className="px-3 py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TOM[c.status] ?? ""}`}>{c.status}</span></td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              {c.status === "Pendente" && <Button size="sm" variant="outline" onClick={() => mudarStatus(c, "Aprovada")}>Aprovar</Button>}
                              {(c.status === "Pendente" || c.status === "Aprovada") && <Button size="sm" onClick={() => pagar(c)} disabled={ocupado === c.id}>Pagar</Button>}
                              {(c.status === "Pendente" || c.status === "Aprovada") && <Button size="sm" variant="ghost" onClick={() => mudarStatus(c, "Cancelada")} aria-label="Cancelar comissão"><X className="h-4 w-4" /></Button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SecaoCard>

            <SecaoCard titulo="Regras de comissão — percentual e meta por vendedor" icon={Target} semPadding>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-default)] text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                      <th className="px-4 py-2 font-semibold">Vendedor</th><th className="px-3 py-2 text-right font-semibold">% de comissão</th><th className="px-3 py-2 text-right font-semibold">Meta mensal</th><th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {regras.map((r) => (
                      <tr key={r.id} className="border-b border-[var(--color-border-default)]">
                        <td className="px-4 py-2 font-semibold">{r.vendedor}</td>
                        <td className="px-3 py-2 text-right"><input key={`p-${r.id}-${r.percentual}`} className={`${inputCls} w-20`} defaultValue={String(r.percentual).replace(".", ",")} onBlur={(e) => salvarRegra(r, "percentual", e.target.value)} aria-label={`Percentual de ${r.vendedor}`} /> %</td>
                        <td className="px-3 py-2 text-right"><input key={`m-${r.id}-${r.meta_mensal}`} className={`${inputCls} w-32`} defaultValue={Number(r.meta_mensal).toFixed(2).replace(".", ",")} onBlur={(e) => salvarRegra(r, "meta_mensal", e.target.value)} aria-label={`Meta de ${r.vendedor}`} /></td>
                        <td className="px-4 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => removerRegra(r)} aria-label={`Remover ${r.vendedor}`}><X className="h-4 w-4" /></Button></td>
                      </tr>
                    ))}
                    <tr>
                      <td className="px-4 py-2"><input className={`${inputCls} w-full min-w-[10rem] text-left`} placeholder="Nome do vendedor" value={novo.vendedor} list="vendedores-sugeridos" onChange={(e) => setNovo({ ...novo, vendedor: e.target.value })} /></td>
                      <td className="px-3 py-2 text-right"><input className={`${inputCls} w-20`} placeholder="5" value={novo.percentual} onChange={(e) => setNovo({ ...novo, percentual: e.target.value })} /> %</td>
                      <td className="px-3 py-2 text-right"><input className={`${inputCls} w-32`} placeholder="0,00" value={novo.meta} onChange={(e) => setNovo({ ...novo, meta: e.target.value })} /></td>
                      <td className="px-4 py-2 text-right"><Button size="sm" onClick={() => adicionarRegra(novo.vendedor, paraNumero(novo.percentual), paraNumero(novo.meta))}><Plus className="mr-1 h-4 w-4" />Adicionar</Button></td>
                    </tr>
                  </tbody>
                </table>
                <datalist id="vendedores-sugeridos">{sugeridos.map((n) => <option key={n} value={n} />)}</datalist>
              </div>
              {sugeridos.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border-default)] p-3 text-xs text-[var(--color-text-muted)]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Vendedores com proposta aceita e sem regra:
                  {sugeridos.map((n) => <button key={n} type="button" onClick={() => setNovo({ ...novo, vendedor: n })} className="rounded-full border border-[var(--color-border-default)] px-2.5 py-1 font-medium hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)]">{n}</button>)}
                </div>
              )}
            </SecaoCard>
            <p className="text-xs text-[var(--color-text-muted)]">
              A venda é a proposta com situação "Aceita", no mês em que foi aceita. Cada venda gera uma única comissão, mesmo se você gerar o mês de novo. Ao pagar, a saída entra em Despesas (categoria "Comissões").
            </p>
          </>
        )}
      </div>
    </PageContainer>
  );
}
