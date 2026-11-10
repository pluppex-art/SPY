import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Megaphone, Info } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { apiFetch } from "../../lib/apiClient";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { friendlyError } from "../../lib/friendlyError";

// Painel de aquisição: investimento em mídia, leads, MQL e os custos derivados (CPL, CPLQ, CAC, ROAS) por período e por
// origem. Genérico para qualquer empresa. O investimento vem dos lançamentos abaixo (por mês e origem) ou, se não houver,
// das despesas pagas do Financeiro em categorias de marketing/anúncios/tráfego.

interface Origem { origem: string; leads: number; mql: number; vendas: number; receita: number; investimento: number; cpl: number | null; cplq: number | null; cac: number | null; roas: number | null }
interface Resp {
  vendasSemData: number;
  totais: { investimento: number; fonteInvestimento: "manual" | "financeiro" | "nenhum"; leads: number; mql: number; vendas: number; receita: number; cpl: number | null; cplq: number | null; cac: number | null; roas: number | null; ticket: number | null; taxaMql: number | null };
  porOrigem: Origem[];
}
interface Spend { id: string; month: string; source: string; amount: number; note: string | null }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const PERIODS = [
  { id: "mes", label: "Este mês" },
  { id: "mes_passado", label: "Mês passado" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "90d", label: "Últimos 90 dias" },
  { id: "ano", label: "Este ano" },
] as const;
function range(id: string): { from: string; to: string } {
  const now = new Date();
  if (id === "mes_passado") return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (id === "30d") return { from: iso(new Date(now.getTime() - 29 * 86_400_000)), to: iso(now) };
  if (id === "90d") return { from: iso(new Date(now.getTime() - 89 * 86_400_000)), to: iso(now) };
  if (id === "ano") return { from: `${now.getFullYear()}-01-01`, to: iso(now) };
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

export function AquisicaoPanel() {
  const { activeTenantId, user } = useAuth() as any;
  const { formatCurrency } = useLocalization();
  const [period, setPeriod] = useState<string>("mes");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [spend, setSpend] = useState<Spend[]>([]);
  const [showSpend, setShowSpend] = useState(false);
  const [fMonth, setFMonth] = useState(iso(new Date()).slice(0, 7));
  const [fSource, setFSource] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const { from, to } = useMemo(() => range(period), [period]);

  const load = useCallback(async () => {
    if (!activeTenantId) return;
    const t = activeTenantId;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/marketing/aquisicao?from=${from}&to=${to}&tenantId=${encodeURIComponent(t)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Falha ao calcular.");
      setData(j);
    } catch (e: any) { setData(null); toast.error(e.message); } finally { setLoading(false); }
  }, [activeTenantId, from, to]);

  const loadSpend = useCallback(async () => {
    if (!supabase || !activeTenantId) return;
    const { data: rows } = await supabase.from("marketing_spend").select("id, month, source, amount, note").eq("tenant_id", activeTenantId).order("month", { ascending: false }).limit(200);
    setSpend((rows as Spend[]) || []);
  }, [activeTenantId]);

  useEffect(() => { setData(null); setSpend([]); void load(); void loadSpend(); }, [load, loadSpend]);

  const addSpend = async () => {
    const amount = Number(String(fAmount).replace(/\./g, "").replace(",", "."));
    if (!supabase || !activeTenantId) return;
    if (!/^\d{4}-\d{2}$/.test(fMonth) || !Number.isFinite(amount) || amount <= 0) { toast.error("Informe o mês e um valor maior que zero."); return; }
    setSaving(true);
    const { error } = await supabase.from("marketing_spend").insert({ tenant_id: activeTenantId, month: `${fMonth}-01`, source: fSource.trim().slice(0, 80), amount, created_by: user?.id ?? null });
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setFAmount(""); toast.success("Investimento lançado.");
    void loadSpend(); void load();
  };
  const delSpend = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("marketing_spend").delete().eq("id", id).eq("tenant_id", activeTenantId);
    if (error) { toast.error(friendlyError(error)); return; }
    setSpend((p) => p.filter((s) => s.id !== id)); void load();
  };

  const money = (n: number | null) => (n === null ? "—" : formatCurrency(n));
  const t = data?.totais;
  const cards: { label: string; value: string; sub?: string; hint: string }[] = t ? [
    { label: "Investimento", value: money(t.investimento), sub: t.fonteInvestimento === "manual" ? "lançado aqui" : t.fonteInvestimento === "financeiro" ? "do Financeiro" : "sem lançamento", hint: "Quanto foi gasto em mídia no período." },
    { label: "Leads", value: String(t.leads), hint: "Leads criados no período." },
    { label: "CPL", value: money(t.cpl), sub: "custo por lead", hint: "Investimento ÷ leads." },
    { label: "MQL", value: String(t.mql), sub: t.taxaMql !== null ? `${t.taxaMql}% dos leads` : undefined, hint: "Leads qualificados: fecharam, têm score IA ≥ 60 ou passaram da 1ª etapa do funil (sem os perdidos/desqualificados)." },
    { label: "CPLQ", value: money(t.cplq), sub: "custo por lead qualificado", hint: "Investimento ÷ MQL." },
    { label: "Vendas", value: String(t.vendas), sub: t.ticket !== null ? `ticket ${formatCurrency(t.ticket)}` : undefined, hint: "Vendas fechadas no período (com data de fechamento)." },
    { label: "CAC", value: money(t.cac), sub: "custo por venda", hint: "Investimento ÷ vendas fechadas." },
    { label: "ROAS", value: t.roas === null ? "—" : `${t.roas.toLocaleString("pt-BR")}x`, sub: `receita ${formatCurrency(t.receita)}`, hint: "Receita das vendas ÷ investimento." },
  ] : [];
  const origens = data?.porOrigem.map((o) => o.origem).filter((o) => o !== "(sem origem)") ?? [];

  return (
    <Card className="p-5 mb-8 space-y-4 bg-[var(--color-surface-elevated)]/50 border border-white/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-black text-white flex items-center gap-2"><Megaphone className="w-4 h-4 text-[var(--color-primary-blue)]" /> Aquisição: custo por lead, lead qualificado e venda</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Período" className="h-8 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]">
            {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <Button variant="outline" onClick={() => setShowSpend((v) => !v)} className="h-8 px-3 text-xs gap-1.5"><Plus className="w-3.5 h-3.5" /> Investimento em mídia</Button>
        </div>
      </div>

      {showSpend && (
        <div className="p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] space-y-3">
          <p className="text-[11px] text-[var(--color-text-muted)]">Lance quanto foi investido em cada mês (e, se quiser, por origem — use o mesmo nome da origem dos leads, ex.: "Meta ads"). Se você já lança isso no Financeiro como Marketing/Anúncios, não precisa repetir aqui.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[10px] font-bold text-[var(--color-text-muted)]">Mês<input type="month" value={fMonth} onChange={(e) => setFMonth(e.target.value)} className="h-8 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /></label>
            <label className="flex flex-col gap-1 text-[10px] font-bold text-[var(--color-text-muted)]">Origem (opcional)<input list="origens-aq" value={fSource} onChange={(e) => setFSource(e.target.value)} maxLength={80} placeholder="Ex.: Meta ads" className="h-8 w-44 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /><datalist id="origens-aq">{origens.map((o) => <option key={o} value={o} />)}</datalist></label>
            <label className="flex flex-col gap-1 text-[10px] font-bold text-[var(--color-text-muted)]">Valor (R$)<input inputMode="decimal" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="2400,00" className="h-8 w-28 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" /></label>
            <Button onClick={() => void addSpend()} disabled={saving} className="h-8 px-4 text-xs font-bold">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Lançar"}</Button>
          </div>
          {spend.length > 0 && (
            <ul className="max-h-40 overflow-auto divide-y divide-[var(--color-border-subtle)] rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] text-xs">
              {spend.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <span className="text-[var(--color-text-primary)]">{s.month.slice(5, 7)}/{s.month.slice(0, 4)} · {s.source || "geral"} · <b>{formatCurrency(Number(s.amount))}</b></span>
                  <button type="button" aria-label="Apagar lançamento" onClick={() => void delSpend(s.id)} className="text-[var(--color-danger)] bg-transparent border-none cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading && !data ? <div className="py-8 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin text-[var(--color-text-faint)]" /></div> : t ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cards.map((c) => (
              <div key={c.label} title={c.hint} className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-subtle)]">
                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">{c.label}</div>
                <div className="text-lg font-black text-[var(--color-text-primary)] mt-0.5">{c.value}</div>
                {c.sub && <div className="text-[10px] text-[var(--color-text-muted)]">{c.sub}</div>}
              </div>
            ))}
          </div>
          {t.fonteInvestimento === "nenhum" && (
            <p className="flex items-start gap-1.5 text-xs text-[var(--color-warning)]"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Sem investimento no período, CPL, CPLQ, CAC e ROAS não podem ser calculados. Clique em "Investimento em mídia" e lance o valor.</p>
          )}
          {data!.vendasSemData > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-[var(--color-text-muted)]"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {data!.vendasSemData.toLocaleString("pt-BR")} venda(s) fechada(s) antes do registro da data de fechamento não entram nas contas por período. Daqui para frente toda venda guarda a data.</p>
          )}
          {data!.porOrigem.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border-subtle)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--color-surface-sunken)] text-[10px] uppercase text-[var(--color-text-muted)]"><tr>
                  {["Origem", "Investimento", "Leads", "CPL", "MQL", "CPLQ", "Vendas", "CAC", "ROAS"].map((h) => <th key={h} className="py-2 px-3 whitespace-nowrap">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)] text-[var(--color-text-primary)]">
                  {data!.porOrigem.map((o) => (
                    <tr key={o.origem}>
                      <td className="py-1.5 px-3 font-bold whitespace-nowrap">{o.origem}</td>
                      <td className="py-1.5 px-3">{o.investimento > 0 ? formatCurrency(o.investimento) : "—"}</td>
                      <td className="py-1.5 px-3">{o.leads}</td><td className="py-1.5 px-3">{money(o.cpl)}</td>
                      <td className="py-1.5 px-3">{o.mql}</td><td className="py-1.5 px-3">{money(o.cplq)}</td>
                      <td className="py-1.5 px-3">{o.vendas}</td><td className="py-1.5 px-3">{money(o.cac)}</td>
                      <td className="py-1.5 px-3">{o.roas === null ? "—" : `${o.roas.toLocaleString("pt-BR")}x`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </Card>
  );
}
