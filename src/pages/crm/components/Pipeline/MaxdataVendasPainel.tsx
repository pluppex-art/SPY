import { useEffect, useState } from "react";
import { Receipt, TrendingUp, Ban, Wallet } from "lucide-react";
import { Card } from "../../../../components/ui/card";
import { Pagination } from "../../../../components/ui/Pagination";
import { supabase } from "../../../../lib/supabase";

const PAGE = 20;
const PERIODOS = [{ d: 30, l: "30 dias" }, { d: 90, l: "90 dias" }, { d: 365, l: "12 meses" }, { d: 36500, l: "Tudo" }];
const brl = (n: number) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlCurto = (n: number) => (n >= 1e6 ? `R$ ${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n >= 1e3 ? `R$ ${(n / 1e3).toFixed(0)} mil` : brl(n));
const nome = (m: string) => { const [y, mo] = m.split("-"); return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+mo - 1]}/${y.slice(2)}`; };

/** O tenant tem vendas da Max Data? (decide se a Central de Vendas mostra o painel quando não há leads) */
export function useTemVendasMax(tenantId: string | null | undefined) {
  const [tem, setTem] = useState(false);
  useEffect(() => {
    if (!tenantId || !supabase) return;
    let off = false;
    supabase.from("maxdata_vendas").select("id").eq("tenant_id", tenantId).limit(1).then(({ data }) => { if (!off) setTem((data?.length ?? 0) > 0); });
    return () => { off = true; };
  }, [tenantId]);
  return tem;
}

export function MaxdataVendasPainel({ tenantId }: { tenantId: string }) {
  const [dias, setDias] = useState(90);
  const [resumo, setResumo] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [lista, setLista] = useState<{ rows: any[]; total: number; loading: boolean }>({ rows: [], total: 0, loading: true });

  useEffect(() => {
    if (!supabase) return;
    let off = false;
    setResumo(null); setErro(null);
    supabase.rpc("maxdata_vendas_resumo", { p_tenant: tenantId, p_dias: dias }).then(({ data, error }) => {
      if (off) return;
      if (error) setErro(error.message); else setResumo(data);
    });
    return () => { off = true; };
  }, [tenantId, dias]);

  useEffect(() => {
    if (!supabase) return;
    let off = false;
    setLista((l) => ({ ...l, loading: true }));
    supabase.from("maxdata_vendas")
      .select("id, cliente_nome, status, forma_pagamento, valor_total, data_venda", { count: "exact" })
      .eq("tenant_id", tenantId).order("data_venda", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
      .then(({ data, count, error }) => {
        if (off) return;
        if (error) setErro(error.message);
        setLista({ rows: data ?? [], total: count ?? 0, loading: false });
      });
    return () => { off = true; };
  }, [tenantId, page]);

  const ticket = resumo && resumo.vendas > 0 ? resumo.faturamento / resumo.vendas : 0;
  const cards = [
    { label: "Faturamento", value: resumo ? brl(resumo.faturamento) : "…", icon: Wallet, cor: "text-success" },
    { label: "Vendas pagas", value: resumo ? resumo.vendas.toLocaleString("pt-BR") : "…", icon: Receipt, cor: "text-[var(--color-primary-blue)]" },
    { label: "Ticket médio", value: resumo ? brl(ticket) : "…", icon: TrendingUp, cor: "text-warning" },
    { label: "Canceladas", value: resumo ? resumo.canceladas.toLocaleString("pt-BR") : "…", icon: Ban, cor: "text-danger" },
  ];
  const maxMes = Math.max(1, ...(resumo?.por_mes ?? []).map((m: any) => m.valor));
  const totalForma = Math.max(1, ...(resumo?.por_forma ?? []).map((f: any) => f.valor));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--color-text-muted)]">Vendas importadas da Max Data (somente consulta). Os leads do funil aparecem aqui quando houver.</p>
        <div className="flex items-center gap-1">
          {PERIODOS.map((p) => (
            <button key={p.d} onClick={() => setDias(p.d)} className={`h-8 px-3 rounded-[var(--radius-control)] text-xs font-semibold border transition-colors ${dias === p.d ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>{p.l}</button>
          ))}
        </div>
      </div>

      {erro && <p className="text-xs text-danger">Não foi possível carregar o resumo: {erro}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon, cor }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center gap-2 mb-2"><Icon className={`w-4 h-4 ${cor}`} /><span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{label}</span></div>
            <div className="text-2xl font-display font-black text-[var(--color-text-primary)] tabular-nums">{value}</div>
          </Card>
        ))}
      </div>
      {resumo?.descartadas > 0 && <p className="text-[11px] text-[var(--color-text-faint)]">{resumo.descartadas} venda(s) com valor acima de R$ 1 milhão foram ignoradas nos totais (erro de cadastro na origem).</p>}

      <div className="grid lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <h3 className="text-xs font-bold mb-3 text-[var(--color-text-primary)]">Faturamento por mês (12 meses)</h3>
          <div className="flex items-end gap-1.5 h-36">
            {(resumo?.por_mes ?? []).map((m: any) => (
              <div key={m.mes} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${nome(m.mes)} · ${brl(m.valor)} · ${m.vendas} vendas`}>
                <span className="text-[9px] text-[var(--color-text-muted)] tabular-nums">{brlCurto(m.valor)}</span>
                <div className="w-full rounded-t bg-[var(--color-primary-blue)]/80" style={{ height: `${Math.max(3, (m.valor / maxMes) * 100)}%` }} />
                <span className="text-[9px] text-[var(--color-text-muted)]">{nome(m.mes)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="text-xs font-bold mb-3 text-[var(--color-text-primary)]">Forma de pagamento</h3>
          <div className="space-y-2">
            {(resumo?.por_forma ?? []).map((f: any) => (
              <div key={f.forma}>
                <div className="flex justify-between text-[11px] mb-0.5"><span className="text-[var(--color-text-primary)]">{f.forma}</span><span className="text-[var(--color-text-muted)] tabular-nums">{brl(f.valor)} · {f.vendas.toLocaleString("pt-BR")}</span></div>
                <div className="h-1.5 rounded bg-[var(--color-border-subtle)]"><div className="h-full rounded bg-[var(--color-primary-blue)]/80" style={{ width: `${(f.valor / totalForma) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] text-xs font-bold text-[var(--color-text-primary)]">Vendas mais recentes</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]"><th className="px-4 py-2">Data</th><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Pagamento</th><th className="px-4 py-2">Situação</th><th className="px-4 py-2 text-right">Valor</th></tr></thead>
            <tbody>
              {lista.rows.map((v) => (
                <tr key={v.id} className="border-t border-[var(--color-border-subtle)]">
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">{v.data_venda ? new Date(v.data_venda).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-2">{v.cliente_nome || "Consumidor"}</td>
                  <td className="px-4 py-2 text-[var(--color-text-muted)]">{(v.forma_pagamento || "—").replace(/\s+/g, " ")}</td>
                  <td className="px-4 py-2"><span className={v.status === "paga" ? "text-success" : v.status === "cancelada" ? "text-danger" : "text-warning"}>{v.status}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{v.valor_total > 1e6 ? "valor inválido" : brl(v.valor_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} totalPages={Math.max(1, Math.ceil(lista.total / PAGE))} total={lista.total} pageSize={PAGE} loading={lista.loading} onPageChange={setPage} itemLabel="venda" /></div>
      </Card>
    </div>
  );
}
