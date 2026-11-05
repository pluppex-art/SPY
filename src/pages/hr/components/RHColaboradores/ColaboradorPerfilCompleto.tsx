import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { Mail, Phone, Calendar, Building2, Users, ShieldCheck, Sparkles, Eye, UserRound } from "lucide-react";
import { Modal } from "../../../../components/ui/modal";
import { Badge } from "../../../../components/ui/badge";
import { StatCard } from "../../../../components/ui/stat-card";
import { useData } from "../../../../contexts/DataContext";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { supabase } from "../../../../lib/supabase";
import { nomeConfere } from "../../../../lib/sellerScope";
import { cargosIniciais } from "../../../../components/ui/CargosMultiSelect";
import { modulosDoCargo, restritoAosProprios } from "../../../../lib/cargosUsuario";
import { cargoPermiteModulo } from "../../../../lib/accessControl";
import { IA_AGENTS, podeVerIa } from "../../../../lib/iaAgents";
import { navSections } from "../../../../components/layout/navData";
import {
  computeVendedores, resolverPeriodo, serieDiaria, PERIODO_LABEL,
  type PeriodoOpcao, type VendedorLinha,
} from "../../../dashboard/vendedoresMetrics";

type Aba = "resumo" | "vendas" | "tarefas" | "reunioes" | "acessos";
const PERIODOS: PeriodoOpcao[] = ["mes", "mesPassado", "90d", "ano", "tudo"];
const ABERTAS = ["Em Aberto", "A Fazer", "Aguardando"];

const fmtData = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

const thCls = "px-3 py-2 text-[11px] uppercase font-bold text-[var(--color-text-faint)] whitespace-nowrap";
const tdCls = "px-3 py-2 align-top";

/** Perfil completo do colaborador: o que aparece depende do cargo e do departamento (comercial vê vendas; todos veem tarefas, reuniões e acessos). */
export function ColaboradorPerfilCompleto({ colab, onClose }: { colab: any; onClose: () => void }) {
  const data = useData() as any;
  const { leads, proposals, proposalItems, products, contracts, colaboradores, cargos, tasks, reunioes } = data;
  const { formatCurrency } = useLocalization();
  const [aba, setAba] = useState<Aba>("resumo");
  const [periodo, setPeriodo] = useState<PeriodoOpcao>("mes");
  const [flags, setFlags] = useState<{ admin: boolean; master: boolean }>({ admin: false, master: false });

  useEffect(() => {
    setAba("resumo");
    if (!supabase || !colab?.user_id) { setFlags({ admin: false, master: false }); return; }
    let vivo = true;
    supabase.from("users").select("is_tenant_admin,is_master").eq("id", colab.user_id).maybeSingle()
      .then(({ data: u }: any) => { if (vivo) setFlags({ admin: !!u?.is_tenant_admin, master: !!u?.is_master }); });
    return () => { vivo = false; };
  }, [colab?.id, colab?.user_id]);

  const cargosPessoa: string[] = useMemo(
    () => (colab ? cargosIniciais(colab.cargos, colab.cargo, cargos || []) : []),
    [colab, cargos],
  );
  const usuarioFicticio = useMemo(
    () => ({ role: colab?.cargo, roles: cargosPessoa, isMaster: flags.master, isTenantAdmin: flags.admin }),
    [colab, cargosPessoa, flags],
  );

  // ── Vendas (mesmo cálculo da Central de Receita › Vendedores) ─────────────
  const faixa = useMemo(() => resolverPeriodo(periodo, null, null), [periodo]);
  const calc = useMemo(
    () => computeVendedores({ leads, proposals, proposalItems, products, contracts, colaboradores, cargos }, faixa),
    [leads, proposals, proposalItems, products, contracts, colaboradores, cargos, faixa],
  );
  const linha: VendedorLinha | null = useMemo(
    () => (colab ? calc.linhas.find((l) => nomeConfere(l.nome, colab.nome)) ?? null : null),
    [calc.linhas, colab],
  );
  const serie = useMemo(
    () => (linha ? serieDiaria(calc.vendasNoPeriodo, [{ key: linha.key, nome: linha.nome }], faixa, true) : []),
    [calc.vendasNoPeriodo, linha, faixa],
  );

  // ── Tarefas e reuniões da pessoa ─────────────────────────────────────────
  const minhasTarefas: any[] = useMemo(
    () => ((tasks as any[]) || []).filter((t) => t.assigned_to === colab?.id && !t.deleted_at),
    [tasks, colab?.id],
  );
  const agora = Date.now();
  const atrasada = (t: any) => t.status === "Atrasado" || (ABERTAS.includes(t.status) && t.due_date && new Date(t.due_date).getTime() < agora);
  const tarefasAbertas = minhasTarefas.filter((t) => ABERTAS.includes(t.status) || t.status === "Atrasado");
  const tarefasAtrasadas = minhasTarefas.filter(atrasada);
  const tarefasConcluidas = minhasTarefas.filter((t) => t.status === "Concluída");
  const minhasReunioes: any[] = useMemo(
    () => ((reunioes as any[]) || []).filter((r) => nomeConfere(r.closerName, colab?.nome) || (colab?.email && r.closerEmail === colab.email)),
    [reunioes, colab],
  );
  const reunioesFuturas = minhasReunioes.filter((r) => r.status === "Agendada" && new Date(r.scheduledAt).getTime() >= agora);

  // ── O que mostrar, pelo cargo e departamento ─────────────────────────────
  const texto = `${colab?.cargo || ""} ${colab?.departamento || ""} ${cargosPessoa.join(" ")}`.toLowerCase();
  const restringeCargo = (cargos || []).some((c: any) => cargosPessoa.includes(c.nome) && c.restringir_aos_proprios_dados);
  const comercial = restringeCargo || /sdr|closer|vend|comerc|pr[eé]-?venda/.test(texto) || (linha?.leads ?? 0) > 0;
  const gestao = flags.admin || /administrador|diretor|gerente|s[oó]cio|executivo/.test(texto);

  const abas: { id: Aba; label: string }[] = [
    { id: "resumo", label: "Resumo" },
    ...(comercial ? [{ id: "vendas" as Aba, label: "Vendas" }] : []),
    { id: "tarefas", label: `Tarefas (${tarefasAbertas.length})` },
    ...(comercial || minhasReunioes.length > 0 ? [{ id: "reunioes" as Aba, label: `Reuniões (${reunioesFuturas.length})` }] : []),
    { id: "acessos", label: "Acessos" },
  ];

  // ── Acessos ───────────────────────────────────────────────────────────────
  const modulos = modulosDoCargo(usuarioFicticio, cargos || []);
  const paginas = useMemo(() => {
    const out: { secao: string; itens: string[] }[] = [];
    for (const s of navSections as any[]) {
      if (!flags.master && /master/i.test(String(s.title))) continue; // páginas da plataforma: só para master
      if (s.reqModule === "master" || (s.items || []).every((i: any) => i.reqModule === "master")) continue;
      const mod = s.reqModule;
      if (mod && !cargoPermiteModulo(modulos, mod)) continue;
      const itens = (s.items || []).filter((i: any) => i.path && i.reqModule !== "master" && (!i.reqModule || cargoPermiteModulo(modulos, i.reqModule))).map((i: any) => i.name);
      if (itens.length) out.push({ secao: s.title, itens });
    }
    return out;
  }, [modulos, flags.master]);
  const ias = IA_AGENTS.filter((a) => podeVerIa(usuarioFicticio, cargos || [], a.id));
  const soProprios = !flags.admin && !flags.master && restritoAosProprios(usuarioFicticio, cargos || []);

  if (!colab) return null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-4xl"
      title={
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-blue)] text-white font-black text-base flex items-center justify-center shrink-0">
            {(colab.nome || "?").substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-base font-black text-[var(--color-text-primary)] break-words">{colab.nome}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <Badge variant={colab.status === "Ativo" ? "success" : colab.status === "Férias" ? "info" : "destructive"}>● {colab.status}</Badge>
              {(cargosPessoa.length > 0 ? cargosPessoa : [colab.cargo]).filter(Boolean).map((c: string) => (
                <span key={c} className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/20">{c}</span>
              ))}
              {flags.admin && <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 border border-amber-500/30">Administrador da empresa</span>}
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0"><Building2 className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" /><span className="break-words">{colab.departamento || "Sem departamento"}</span></div>
          <div className="flex items-center gap-2 min-w-0"><Users className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" /><span className="break-words">{colab.squad || "Sem squad"}</span></div>
          <div className="flex items-center gap-2 min-w-0"><Mail className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" /><span className="break-all">{colab.email || "—"}</span></div>
          <div className="flex items-center gap-2 min-w-0"><Phone className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" /><span>{colab.phone || "—"}</span></div>
          <div className="flex items-center gap-2 min-w-0 col-span-2"><Calendar className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" /><span>Admissão: {colab.dataAdmissao || fmtData(colab.data_admissao || colab.created_at)}</span></div>
        </dl>

        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[var(--color-border-subtle)]">
          <div className="flex gap-1 overflow-x-auto scrollbar-none" role="tablist">
            {abas.map((a) => (
              <button
                key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
                className={`px-3.5 h-10 text-xs font-bold whitespace-nowrap border-0 border-b-2 bg-transparent cursor-pointer ${aba === a.id ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]" : "border-transparent text-[var(--color-text-muted)]"}`}
              >
                {a.label}
              </button>
            ))}
          </div>
          {(aba === "resumo" || aba === "vendas") && (
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoOpcao)} aria-label="Período" className="h-9 mb-1 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-3 text-xs font-semibold text-[var(--color-text-primary)] cursor-pointer">
              {PERIODOS.map((p) => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}
            </select>
          )}
        </div>

        {aba === "resumo" && (
          <div className="space-y-4">
            {comercial ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
                <StatCard icon={Sparkles} label="Receita" value={formatCurrency(linha?.receita ?? 0)} sub={linha?.tendencia != null ? `${linha.tendencia >= 0 ? "+" : ""}${linha.tendencia}% vs. período anterior` : "sem comparação"} caption={PERIODO_LABEL[periodo]} />
                <StatCard icon={Users} label="Vendas" value={String(linha?.vendas ?? 0)} sub={`${linha?.leads ?? 0} leads · ${linha?.conversao ?? 0}% de conversão`} caption={PERIODO_LABEL[periodo]} />
                <StatCard icon={Eye} label="Ticket médio" value={linha && linha.vendas > 0 ? formatCurrency(linha.ticket) : "—"} sub={linha?.metaPct != null ? `${linha.metaPct}% da meta` : "sem meta"} caption={PERIODO_LABEL[periodo]} />
              </div>
            ) : null}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
              <StatCard icon={ShieldCheck} tone="success" label="Tarefas concluídas" value={String(tarefasConcluidas.length)} sub="no total" />
              <StatCard icon={Eye} label="Tarefas em aberto" value={String(tarefasAbertas.length)} sub="atribuídas a ele(a)" />
              <StatCard icon={Eye} tone={tarefasAtrasadas.length > 0 ? "danger" : "default"} label="Tarefas atrasadas" value={String(tarefasAtrasadas.length)} sub="prazo vencido" />
              <StatCard icon={Calendar} label="Reuniões futuras" value={String(reunioesFuturas.length)} sub={`${minhasReunioes.length} no total`} />
            </div>
            {gestao && (
              <p className="text-xs text-[var(--color-text-muted)]">Perfil de gestão: o acompanhamento do resultado da empresa está em Central de Receita.</p>
            )}
            {!comercial && minhasTarefas.length === 0 && minhasReunioes.length === 0 && (
              <p className="text-xs italic text-[var(--color-text-faint)]">Ainda não há tarefas nem reuniões atribuídas a esta pessoa.</p>
            )}
          </div>
        )}

        {aba === "vendas" && (
          <div className="space-y-4">
            {!linha ? (
              <p className="py-8 text-center text-xs italic text-[var(--color-text-faint)]">Sem leads nem vendas atribuídos a esta pessoa no período.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                  <StatCard icon={Users} label="Leads" value={String(linha.leads)} sub={`${linha.oportunidades} oportunidades`} caption={PERIODO_LABEL[periodo]} />
                  <StatCard icon={Eye} label="Propostas" value={String(linha.propostas)} sub="no período" caption={PERIODO_LABEL[periodo]} />
                  <StatCard icon={Sparkles} tone="success" label="Receita" value={formatCurrency(linha.receita)} sub={`${linha.vendas} venda${linha.vendas === 1 ? "" : "s"}`} caption={PERIODO_LABEL[periodo]} />
                  <StatCard icon={ShieldCheck} label="Meta" value={linha.metaPct != null ? `${linha.metaPct}%` : "—"} sub={linha.meta > 0 ? `Meta ${formatCurrency(linha.meta)}` : "sem meta definida"} caption={PERIODO_LABEL[periodo]} />
                </div>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
                    <LineChart data={serie} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                      <XAxis dataKey="dia" stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis stroke="var(--color-text-faint)" fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatCurrency(v)} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [formatCurrency(v), "Receita acumulada"]} />
                      <Line type="monotone" dataKey={linha.key} stroke={linha.cor} strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] mb-2">Produtos vendidos</h4>
                  {linha.produtos.length === 0 ? (
                    <p className="text-xs italic text-[var(--color-text-faint)]">Nenhum produto vendido no período.</p>
                  ) : (
                    <ul className="divide-y divide-[var(--color-border-subtle)]">
                      {linha.produtos.map((p) => (
                        <li key={p.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                          <span className="font-bold text-[var(--color-text-primary)] break-words min-w-0">{p.nome}</span>
                          <span className="shrink-0 text-right"><b className="font-mono">{formatCurrency(p.receita)}</b> <span className="text-[var(--color-text-muted)]">· {p.vendas}×</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {aba === "tarefas" && (
          minhasTarefas.length === 0 ? (
            <p className="py-8 text-center text-xs italic text-[var(--color-text-faint)]">Nenhuma tarefa atribuída a esta pessoa.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[520px]">
                <thead className="bg-[var(--color-surface-sunken)] border-y border-[var(--color-border-subtle)]"><tr>
                  <th className={thCls}>Tarefa</th><th className={thCls}>Status</th><th className={thCls}>Prioridade</th><th className={thCls}>Prazo</th>
                </tr></thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {[...tarefasAbertas].sort((a, b) => new Date(a.due_date || "9999").getTime() - new Date(b.due_date || "9999").getTime()).slice(0, 25).map((t) => (
                    <tr key={t.id}>
                      <td className={`${tdCls} font-bold text-[var(--color-text-primary)] break-words`}>{t.title}</td>
                      <td className={`${tdCls} whitespace-nowrap ${atrasada(t) ? "text-rose-600 font-bold" : ""}`}>{atrasada(t) ? "Atrasada" : t.status}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{t.priority || "—"}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtData(t.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tarefasAbertas.length === 0 && <p className="py-6 text-center text-xs italic text-[var(--color-text-faint)]">Nenhuma tarefa em aberto.</p>}
            </div>
          )
        )}

        {aba === "reunioes" && (
          minhasReunioes.length === 0 ? (
            <p className="py-8 text-center text-xs italic text-[var(--color-text-faint)]">Nenhuma reunião com esta pessoa como responsável.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[520px]">
                <thead className="bg-[var(--color-surface-sunken)] border-y border-[var(--color-border-subtle)]"><tr>
                  <th className={thCls}>Lead</th><th className={thCls}>Quando</th><th className={thCls}>Status</th>
                </tr></thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {[...minhasReunioes].sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()).slice(0, 25).map((r) => (
                    <tr key={r.id}>
                      <td className={`${tdCls} font-bold text-[var(--color-text-primary)] break-words`}>{r.leadName}{r.companyName ? <div className="text-[11px] font-normal text-[var(--color-text-faint)]">{r.companyName}</div> : null}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{new Date(r.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {aba === "acessos" && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <div className="font-black uppercase tracking-wider text-[11px] text-[var(--color-text-faint)]">Cargos</div>
                <div className="flex flex-wrap gap-1.5">
                  {(cargosPessoa.length > 0 ? cargosPessoa : [colab.cargo]).filter(Boolean).map((c: string) => (
                    <span key={c} className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/20">{c}</span>
                  ))}
                </div>
                {cargosPessoa.length === 0 && <p className="text-[var(--color-text-muted)]">Cargo em texto livre, sem vínculo com Cargos: a pessoa não tem restrição de páginas.</p>}
              </div>
              <div className="space-y-1.5">
                <div className="font-black uppercase tracking-wider text-[11px] text-[var(--color-text-faint)]">IAs na Mensageria</div>
                <div className="flex flex-wrap gap-1.5">
                  {ias.length === 0 ? <span className="text-[var(--color-text-muted)]">Nenhuma IA</span> : ias.map((a) => (
                    <span key={a.id} className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 border border-violet-500/20">{a.label}</span>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="font-black uppercase tracking-wider text-[11px] text-[var(--color-text-faint)]">Dados</div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">
                  {soProprios ? <><UserRound className="w-3 h-3" /> Só os próprios</> : <><Eye className="w-3 h-3" /> Vê todos os dados</>}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="font-black uppercase tracking-wider text-[11px] text-[var(--color-text-faint)]">{modulos ? "Páginas liberadas" : "Páginas (sem restrição: todas)"}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {paginas.map((p) => (
                  <div key={p.secao} className="rounded-xl border border-[var(--color-border-subtle)] p-3">
                    <div className="font-bold text-[var(--color-text-primary)] mb-1">{p.secao}</div>
                    <p className="text-[var(--color-text-muted)] break-words">{p.itens.join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
