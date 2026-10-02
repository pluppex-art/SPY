import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, Clock, Hammer, Loader2, Plus, Search, Wallet, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { StatCell, StatCellRow } from "../finance/components/StatCell";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import { OS_STATUSES, OS_STATUS_TONE, osCode, type OsStatus } from "../../lib/ordemServico";
import { cn } from "../../lib/utils";
import QuadroDepartamentos from "../os/QuadroDepartamentos";

const FILTROS = ["Todas", ...OS_STATUSES] as const;

export default function OrdensServico() {
  const { activeTenantId, user } = useAuth();
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const vista = params.get("vista") === "quadro" ? "quadro" : "lista";
  const trocarVista = (v: "lista" | "quadro") =>
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (v === "lista") { next.delete("vista"); next.delete("dep"); } else next.set("vista", "quadro");
      return next;
    });

  const [ordens, setOrdens] = useState<any[] | null>(null);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("Todas");
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);

  const carregar = async () => {
    if (!supabase || !activeTenantId) return;
    const { data, error } = await supabase
      .from("ordens_servico")
      .select("id, numero, status, prioridade, titulo, cliente_nome, responsavel, data_abertura, data_prevista, valor_total, created_at")
      .eq("tenant_id", activeTenantId)
      .order("numero", { ascending: false })
      .limit(500);
    if (error) { toast.error("Não foi possível carregar as ordens de serviço."); setOrdens([]); return; }
    setOrdens(data || []);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [activeTenantId]);

  const kpis = useMemo(() => {
    const list = ordens || [];
    const mes = new Date().toISOString().slice(0, 7);
    const hoje = new Date().toISOString().slice(0, 10);
    const abertas = list.filter((o) => o.status === "Aberta" || o.status === "Em execução");
    return {
      abertas: abertas.length,
      atrasadas: abertas.filter((o) => o.data_prevista && o.data_prevista < hoje).length,
      aFaturar: list.filter((o) => o.status === "Concluída").reduce((s, o) => s + (Number(o.valor_total) || 0), 0),
      faturadoMes: list.filter((o) => o.status === "Faturada" && (o.created_at || "").startsWith(mes)).reduce((s, o) => s + (Number(o.valor_total) || 0), 0),
    };
  }, [ordens]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (ordens || []).filter((o) => {
      if (filtro !== "Todas" && o.status !== filtro) return false;
      return !q
        || (o.cliente_nome || "").toLowerCase().includes(q)
        || (o.titulo || "").toLowerCase().includes(q)
        || osCode(o.numero).toLowerCase().includes(q);
    });
  }, [ordens, filtro, busca]);

  const nova = async () => {
    if (!supabase || !activeTenantId) return;
    setCriando(true);
    // numero = 0 → o banco atribui o próximo número do tenant (trigger).
    const { data, error } = await supabase
      .from("ordens_servico")
      .insert({ tenant_id: activeTenantId, numero: 0, created_by: user?.id ?? null })
      .select("id")
      .single();
    setCriando(false);
    if (error || !data) { toast.error("Não foi possível criar a ordem de serviço."); return; }
    navigate(`/app/ordens-servico/${data.id}`);
  };

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <PageContainer
      title="Ordens de Serviço"
      description="Emita a ordem de serviço do cliente com itens, valores e condições, acompanhe a execução e gere a cobrança."
      breadcrumb={[{ label: "Operações" }, { label: "Ordens de Serviço" }]}
      actions={vista === "lista" ? (
        <Button onClick={nova} disabled={criando} className="h-9 px-4 text-xs font-medium gap-1.5">
          {criando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Nova ordem de serviço
        </Button>
      ) : undefined}
    >
      <div className="space-y-5 max-w-[1700px] mx-auto pb-12">
        <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] w-fit">
          {([["lista", "Lista"], ["quadro", "Por departamento"]] as const).map(([v, label]) => (
            <button
              key={v} type="button" onClick={() => trocarVista(v)}
              className={cn("px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all", vista === v ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}
            >{label}</button>
          ))}
        </div>

        {vista === "quadro" ? <QuadroDepartamentos /> : (<>
        <StatCellRow>
          <StatCell label="Em andamento" value={kpis.abertas} icon={Hammer} hint="Abertas ou em execução" />
          <StatCell label="Atrasadas" value={kpis.atrasadas} icon={Clock} tone={kpis.atrasadas > 0 ? "danger" : "neutral"} hint="Passaram da data prevista" />
          <StatCell label="A faturar" value={formatCurrency(kpis.aFaturar)} icon={CheckCircle2} tone={kpis.aFaturar > 0 ? "warning" : "neutral"} hint="Concluídas sem cobrança" />
          <StatCell label="Faturado (mês)" value={formatCurrency(kpis.faturadoMes)} icon={Wallet} tone="success" />
        </StatCellRow>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] flex-wrap">
            {FILTROS.map((f) => (
              <button
                key={f} type="button" onClick={() => setFiltro(f)}
                className={cn("px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all", filtro === f ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}
              >{f}</button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
            <input type="text" placeholder="Buscar cliente, serviço ou número…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] pl-9 pr-3 py-2 text-xs focus:outline-none" />
          </div>
        </div>

        {ordens === null ? (
          <p className="text-xs text-[var(--color-text-faint)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</p>
        ) : filtradas.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={ordens.length === 0 ? "Nenhuma ordem de serviço ainda" : "Nenhuma ordem para esse filtro"}
            description={ordens.length === 0 ? "Crie a primeira ordem de serviço para começar." : "Ajuste o filtro ou a busca."}
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-6 py-3">Nº</th><th className="px-6 py-3">Cliente</th><th className="px-6 py-3">Serviço</th>
                  <th className="px-6 py-3">Previsão</th><th className="px-6 py-3 text-right">Valor</th><th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {filtradas.map((o) => {
                  const atrasada = (o.status === "Aberta" || o.status === "Em execução") && o.data_prevista && o.data_prevista < hoje;
                  return (
                    <tr key={o.id} onClick={() => navigate(`/app/ordens-servico/${o.id}`)} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors cursor-pointer">
                      <td className="px-6 py-3.5 font-mono font-semibold text-[var(--color-text-primary)]">{osCode(o.numero)}</td>
                      <td className="px-6 py-3.5 font-medium text-[var(--color-text-primary)]">{o.cliente_nome || "—"}</td>
                      <td className="px-6 py-3.5 text-[var(--color-text-muted)] max-w-[320px] truncate">{o.titulo || "Sem título"}</td>
                      <td className={cn("px-6 py-3.5 font-mono", atrasada ? "text-rose-500 font-semibold" : "text-[var(--color-text-muted)]")}>
                        {o.data_prevista ? new Date(o.data_prevista + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-[var(--color-text-primary)]">{formatCurrency(Number(o.valor_total) || 0)}</td>
                      <td className="px-6 py-3.5"><span className={cn("inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold border", OS_STATUS_TONE[o.status as OsStatus])}>{o.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
        </>)}
      </div>
    </PageContainer>
  );
}
