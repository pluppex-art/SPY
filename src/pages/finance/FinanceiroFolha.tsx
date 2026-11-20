import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, FileSpreadsheet, HandCoins, Inbox, Users, Wallet, Wand2 } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Skeleton } from "../../components/ui/skeleton";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/friendlyError";
import { exportarXlsx } from "../../lib/exportXlsx";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { SecaoCard } from "./components/SecaoCard";
import { hojeISO } from "./hooks/useFinanceEntriesResumo";
import { categoriaDespesaId } from "./lib/categoriaFinanceira";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const comp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const labelComp = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`;
const dataBR = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const paraNumero = (t: string) => {
  const s = t.trim();
  return Number((s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s).replace(/[^0-9.-]/g, "")) || 0;
};
const liquidoDe = (r: { salario: number; adicionais: number; descontos: number; adiantamentos: number }) =>
  Math.max(0, (Number(r.salario) || 0) + (Number(r.adicionais) || 0) - (Number(r.descontos) || 0) - (Number(r.adiantamentos) || 0));

/** Parcela do mês de um adiantamento (nunca maior que o saldo que falta descontar). */
const parcelaDoMes = (a: any) => {
  const p = Math.max(1, Number(a.parcelas) || 1);
  const restantes = Math.max(0, p - (Number(a.parcelas_descontadas) || 0));
  const valor = Number(a.valor) || 0;
  return Math.min(valor / p, (valor * restantes) / p);
};

/**
 * Folha de Pagamento — competência a competência: gera a folha dos funcionários ativos, desconta os
 * adiantamentos, e ao pagar já lança a saída em Despesas (lançou uma vez, atualiza tudo).
 */
export default function FinanceiroFolha() {
  const { activeTenantId: tenantId } = useAuth();
  const { formatCurrency: brl } = useLocalization();
  const [ref, setRef] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const competencia = comp(ref);

  const [funcs, setFuncs] = useState<any[]>([]);
  const [pags, setPags] = useState<any[]>([]);
  const [todosPags, setTodosPags] = useState<any[]>([]);
  const [adiant, setAdiant] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!supabase || !tenantId) return;
    setLoading(true);
    const [f, p, a] = await Promise.all([
      supabase.from("finance_funcionarios").select("*").eq("tenant_id", tenantId).order("nome"),
      supabase.from("finance_folha_pagamentos").select("*").eq("tenant_id", tenantId).limit(5000),
      supabase.from("finance_adiantamentos").select("*").eq("tenant_id", tenantId).eq("status", "Em aberto").limit(2000),
    ]);
    const erro = f.error || p.error || a.error;
    if (erro) toast.error(friendlyError(erro));
    setFuncs(f.data || []);
    setTodosPags(p.data || []);
    setAdiant(a.data || []);
    setLoading(false);
  }, [tenantId]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setPags(todosPags.filter((x) => x.competencia === competencia)); }, [todosPags, competencia]);

  const ativos = useMemo(() => funcs.filter((x) => x.status === "Ativo"), [funcs]);
  const pagPorFunc = useMemo(() => new Map(pags.map((p) => [p.funcionario_id, p])), [pags]);
  const adiantDe = useCallback((nome: string) => adiant.filter((a) => norm(a.pessoa) === norm(nome) && parcelaDoMes(a) > 0), [adiant]);
  const faltamGerar = ativos.filter((f) => !pagPorFunc.has(f.id));

  const gerar = async () => {
    if (!supabase || !tenantId || faltamGerar.length === 0) return;
    setOcupado("gerar");
    const novas = faltamGerar.map((f) => {
      const base = { salario: Number(f.salario_base) || 0, adicionais: 0, descontos: 0, adiantamentos: adiantDe(f.nome).reduce((a, x) => a + parcelaDoMes(x), 0) };
      return { tenant_id: tenantId, funcionario_id: f.id, competencia, ...base, liquido: liquidoDe(base), status: "Pendente" };
    });
    const { error } = await supabase.from("finance_folha_pagamentos").insert(novas);
    setOcupado(null);
    if (error) return toast.error(friendlyError(error));
    toast.success(`Folha de ${labelComp(competencia)} gerada para ${novas.length} funcionário(s).`);
    carregar();
  };

  const salvarCampo = async (p: any, campo: "adicionais" | "descontos", texto: string) => {
    if (!supabase || !tenantId) return;
    const valor = Math.max(0, paraNumero(texto));
    if (valor === Number(p[campo])) return;
    const novo = { ...p, [campo]: valor };
    const { error } = await supabase.from("finance_folha_pagamentos").update({ [campo]: valor, liquido: liquidoDe(novo) }).eq("id", p.id).eq("tenant_id", tenantId);
    if (error) return toast.error(friendlyError(error));
    carregar();
  };

  const pagar = async (p: any, f: any) => {
    if (!supabase || !tenantId) return;
    const ok = await confirmDialog({
      title: `Pagar ${f.nome}`,
      description: `Registrar o pagamento de ${brl(Number(p.liquido))} (folha de ${labelComp(p.competencia)}). A saída será lançada em Despesas.`,
    });
    if (!ok) return;
    setOcupado(p.id);
    try {
      const hoje = hojeISO();
      const { data: principal } = await supabase.from("finance_bank_accounts").select("id").eq("tenant_id", tenantId).eq("is_principal", true).eq("arquivada", false).maybeSingle();
      const entryId = crypto.randomUUID();
      const { error: e1 } = await supabase.from("finance_entries").insert({
        id: entryId, tenant_id: tenantId, description: `Folha ${p.competencia} — ${f.nome}`, category: "Folha de pagamento", category_id: await categoriaDespesaId(tenantId, "Folha de pagamento", "PESSOAS"),
        status: "Pago", value: Number(p.liquido), type: "Pagar", date: hoje, counterparty: f.nome, payment_method: "Pix",
        conta_bancaria_id: principal?.id ?? null,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("finance_folha_pagamentos").update({ status: "Pago", data_pagamento: hoje, entry_id: entryId }).eq("id", p.id).eq("tenant_id", tenantId);
      if (e2) throw e2;
      // Cada adiantamento da pessoa avança uma parcela; ao chegar na última, fica "Descontado".
      if (Number(p.adiantamentos) > 0) {
        for (const a of adiantDe(f.nome)) {
          const descontadas = (Number(a.parcelas_descontadas) || 0) + 1;
          await supabase.from("finance_adiantamentos").update({ parcelas_descontadas: descontadas, status: descontadas >= Math.max(1, Number(a.parcelas) || 1) ? "Descontado" : "Em aberto" }).eq("id", a.id).eq("tenant_id", tenantId);
        }
      }
      toast.success(`${f.nome}: pagamento registrado e lançado em Despesas.`);
      await carregar();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setOcupado(null);
    }
  };

  const linhas = ativos.map((f) => ({ f, p: pagPorFunc.get(f.id) as any | undefined }));
  const geradas = linhas.filter((l) => l.p);
  const totalLiquido = geradas.reduce((a, l) => a + Number(l.p.liquido), 0);
  const pago = geradas.filter((l) => l.p.status === "Pago").reduce((a, l) => a + Number(l.p.liquido), 0);
  const aPagar = geradas.filter((l) => l.p.status !== "Pago").reduce((a, l) => a + Number(l.p.liquido), 0);
  const folhaPrevista = ativos.reduce((a, f) => a + (Number(f.salario_base) || 0), 0);
  const descontadoAdiant = geradas.reduce((a, l) => a + Number(l.p.adiantamentos), 0);

  // Histórico: total por competência (todas as folhas já geradas).
  const historico = useMemo(() => {
    const m = new Map<string, { competencia: string; n: number; pago: number; pendente: number }>();
    for (const p of todosPags) {
      const g = m.get(p.competencia) ?? { competencia: p.competencia, n: 0, pago: 0, pendente: 0 };
      g.n += 1;
      if (p.status === "Pago") g.pago += Number(p.liquido); else g.pendente += Number(p.liquido);
      m.set(p.competencia, g);
    }
    return [...m.values()].sort((a, b) => b.competencia.localeCompare(a.competencia));
  }, [todosPags]);

  const exportar = async () => {
    try {
      await exportarXlsx(`folha-${competencia}`, [{
        nome: `Folha ${competencia}`,
        colunas: [{ titulo: "Funcionário", largura: 30 }, { titulo: "Cargo", largura: 22 }, { titulo: "Salário", tipo: "moeda" }, { titulo: "Adicionais", tipo: "moeda" }, { titulo: "Descontos", tipo: "moeda" }, { titulo: "Adiantamentos", tipo: "moeda" }, { titulo: "Líquido", tipo: "moeda" }, { titulo: "Situação", largura: 12 }, { titulo: "Pago em", tipo: "data" }],
        linhas: geradas.map((l) => [l.f.nome, l.f.cargo, l.p.salario, l.p.adicionais, l.p.descontos, l.p.adiantamentos, l.p.liquido, l.p.status, l.p.data_pagamento]),
      }]);
    } catch (e) { toast.error(friendlyError(e)); }
  };

  const mover = (d: number) => setRef(new Date(ref.getFullYear(), ref.getMonth() + d, 1));
  const inputCls = "h-8 w-24 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] px-2 text-right text-xs tabular-nums";

  return (
    <PageContainer
      title="Folha de Pagamento"
      description="Gere a folha do mês, desconte os adiantamentos e pague. Cada pagamento já vira uma saída em Despesas."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-1.5">
            <button type="button" onClick={() => mover(-1)} aria-label="Mês anterior" className="rounded p-1 hover:bg-[var(--color-surface-sunken)]"><ChevronLeft className="h-4 w-4" /></button>
            <span className="w-36 text-center text-xs font-bold">{labelComp(competencia)}</span>
            <button type="button" onClick={() => mover(1)} aria-label="Próximo mês" className="rounded p-1 hover:bg-[var(--color-surface-sunken)]"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <Button variant="outline" onClick={exportar} disabled={geradas.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar planilha</Button>
          <Button onClick={gerar} disabled={faltamGerar.length === 0 || ocupado === "gerar"}><Wand2 className="mr-2 h-4 w-4" />{faltamGerar.length === 0 ? "Folha gerada" : `Gerar folha (${faltamGerar.length})`}</Button>
        </div>
      }
    >
      <div className="mx-auto max-w-[1700px] space-y-4 pb-12">
        <FinanceKpiFilter
          id="finFolha"
          kpis={[
            { label: "Folha do mês", value: loading ? "…" : brl(geradas.length ? totalLiquido : folhaPrevista), icon: Wallet, tone: "primary", hint: geradas.length ? "Líquido a pagar na competência" : "Previsão pelos salários base (folha ainda não gerada)" },
            { label: "Pago", value: loading ? "…" : brl(pago), icon: CheckCircle2, tone: "success", hint: `${geradas.filter((l) => l.p.status === "Pago").length} pagamento(s)` },
            { label: "A pagar", value: loading ? "…" : brl(aPagar), icon: Clock, tone: aPagar > 0 ? "warning" : "neutral", hint: `${geradas.filter((l) => l.p.status !== "Pago").length} pendente(s)` },
            { label: "Adiantamentos descontados", value: loading ? "…" : brl(descontadoAdiant), icon: HandCoins, tone: "neutral", hint: "Na folha desta competência" },
          ]}
        />

        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : ativos.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum funcionário ativo"
            description="Cadastre a equipe e o salário de cada pessoa para gerar a folha."
            action={<Link to="/app/financeiro/funcionarios"><Button>Cadastrar funcionários</Button></Link>}
          />
        ) : (
          <SecaoCard titulo={`Folha de ${labelComp(competencia)} · ${geradas.length} de ${ativos.length} gerada(s)`} icon={Users} semPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]/60 text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                    <th className="px-4 py-2.5 font-semibold">Funcionário</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Salário</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Adicionais</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Descontos</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Adiantamentos</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Líquido</th>
                    <th className="px-3 py-2.5 font-semibold">Situação</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ f, p }) => (
                    <tr key={f.id} className="border-b border-[var(--color-border-default)] last:border-0">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold">{f.nome}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{[f.cargo, f.tipo_contrato, `paga dia ${f.dia_pagamento}`].filter(Boolean).join(" · ")}</p>
                      </td>
                      {p ? (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums">{brl(Number(p.salario))}</td>
                          <td className="px-3 py-2.5 text-right">
                            {p.status === "Pago" ? <span className="tabular-nums">{brl(Number(p.adicionais))}</span> : (
                              <input key={`a-${p.id}-${p.adicionais}`} className={inputCls} defaultValue={Number(p.adicionais).toFixed(2).replace(".", ",")} onBlur={(e) => salvarCampo(p, "adicionais", e.target.value)} aria-label={`Adicionais de ${f.nome}`} />
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {p.status === "Pago" ? <span className="tabular-nums">{brl(Number(p.descontos))}</span> : (
                              <input key={`d-${p.id}-${p.descontos}`} className={inputCls} defaultValue={Number(p.descontos).toFixed(2).replace(".", ",")} onBlur={(e) => salvarCampo(p, "descontos", e.target.value)} aria-label={`Descontos de ${f.nome}`} />
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{Number(p.adiantamentos) > 0 ? `− ${brl(Number(p.adiantamentos))}` : "—"}</td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums">{brl(Number(p.liquido))}</td>
                          <td className="px-3 py-2.5">
                            {p.status === "Pago"
                              ? <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600">Pago em {dataBR(p.data_pagamento)}</span>
                              : <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600">Pendente</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {p.status !== "Pago" && <Button size="sm" onClick={() => pagar(p, f)} disabled={ocupado === p.id}>Pagar</Button>}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{brl(Number(f.salario_base) || 0)}</td>
                          <td colSpan={6} className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">Folha ainda não gerada para esta competência.</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SecaoCard>
        )}

        <SecaoCard titulo="Histórico de pagamentos por competência" icon={Inbox} semPadding>
          {historico.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-text-muted)]">Nenhuma folha gerada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-default)] text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                    <th className="px-4 py-2 font-semibold">Competência</th><th className="px-3 py-2 font-semibold">Funcionários</th>
                    <th className="px-3 py-2 text-right font-semibold">Pago</th><th className="px-3 py-2 text-right font-semibold">Pendente</th><th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h) => (
                    <tr key={h.competencia} className="border-b border-[var(--color-border-default)] last:border-0">
                      <td className="px-4 py-2 font-semibold">{labelComp(h.competencia)}</td>
                      <td className="px-3 py-2">{h.n}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{brl(h.pago)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-600">{brl(h.pendente)}</td>
                      <td className="px-4 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setRef(new Date(Number(h.competencia.slice(0, 4)), Number(h.competencia.slice(5, 7)) - 1, 1))}>Abrir</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SecaoCard>
        <p className="text-xs text-[var(--color-text-muted)]">
          Ao pagar, a saída entra em Despesas (categoria "Folha de pagamento") na conta principal, e cada adiantamento da pessoa avança uma parcela de desconto. Para corrigir um pagamento já feito, ajuste o lançamento em Despesas.
        </p>
      </div>
    </PageContainer>
  );
}
