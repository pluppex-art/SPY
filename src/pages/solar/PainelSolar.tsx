import { useEffect, useMemo, useState } from "react";
import {
  Sun, Users, FileText, TrendingUp, Zap, DollarSign, Clock, Target,
  Plus, Calculator, MapPin, ArrowRight, ShieldCheck, CheckCircle2, Wrench
} from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import { DrillDownPanel, type DrillColumn } from "../../components/ui/DrillDownPanel";

interface SolarRow {
  id: string;
  cliente?: string;
  status: string;
  potencia_estimada_kwp?: number | null;
  potenciaKwp?: number;
  valor_proposta?: number | null;
  valorContrato?: number;
  cidade?: string;
  concessionaria?: string;
  created_at?: string;
  data?: string;
  data_conclusao?: string | null;
}

// Mesmo vocabulário de status gravado em `solar_analises` (CHECK constraint da
// migration 20260906_solar_analises_fatura.sql) — o funil abaixo precisa bater
// exatamente com os valores reais gravados por AnaliseFatura.tsx, senão as
// etapas nunca contam nenhum projeto.
const STATUS_FLOW = ["Análise Concluída", "Visita Técnica", "Proposta Enviada", "Homologação", "Instalação", "Concluído"];

export default function PainelSolar() {
  const { activeTenantId } = useAuth();
  const { formatCurrency: fmtBRL } = useLocalization();

  const [rows, setRows] = useState<SolarRow[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    supabase
      .from("solar_analises")
      .select("id,cliente,status,potencia_estimada_kwp,valor_proposta,distribuidora,created_at,data_conclusao")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error("Erro ao carregar painel solar:", error.message); return; }
        if (data) {
          setRows(data.map((d: any): SolarRow => ({
            id: d.id,
            cliente: d.cliente,
            status: d.status,
            potenciaKwp: d.potencia_estimada_kwp != null ? Number(d.potencia_estimada_kwp) : undefined,
            valorContrato: d.valor_proposta != null ? Number(d.valor_proposta) : undefined,
            concessionaria: d.distribuidora || undefined,
            created_at: d.created_at,
            data: d.created_at ? new Date(d.created_at).toLocaleDateString("pt-BR") : undefined,
            data_conclusao: d.data_conclusao,
          })));
        }
      });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const kpis = useMemo(() => {
    const totalProjetos = rows.length;
    const conectados = rows.filter(r => r.status === "Concluído");
    const vendasFechadas = conectados.length;
    const taxaConversao = totalProjetos > 0 ? (vendasFechadas / totalProjetos) * 100 : 0;

    const abertos = rows.filter(r => r.status !== "Concluído");
    const valorPipeline = abertos.reduce((s, r) => s + Number(r.valorContrato || r.valor_proposta || 0), 0);

    const potenciaTotal = rows.reduce((s, r) => s + Number(r.potenciaKwp || r.potencia_estimada_kwp || 0), 0);
    const potenciaInstalada = conectados.reduce((s, r) => s + Number(r.potenciaKwp || r.potencia_estimada_kwp || 0), 0);

    const receitaFechada = conectados.reduce((s, r) => s + Number(r.valorContrato || r.valor_proposta || 0), 0);

    const ticketMedio = totalProjetos > 0
      ? rows.reduce((s, r) => s + Number(r.valorContrato || r.valor_proposta || 0), 0) / totalProjetos
      : 0;

    // Economia anual estimada para os clientes (~R$ 1.150 por kWp instalado ao ano)
    const economiaAnualEstimada = potenciaTotal * 1150;

    // Concessionárias mix
    const concMap: Record<string, number> = {};
    rows.forEach(r => {
      const conc = r.concessionaria || "Outras";
      concMap[conc] = (concMap[conc] || 0) + 1;
    });

    return {
      totalProjetos,
      taxaConversao,
      valorPipeline,
      vendasFechadas,
      potenciaTotal,
      potenciaInstalada,
      ticketMedio,
      receitaFechada,
      economiaAnualEstimada,
      concMap,
    };
  }, [rows]);

  const porEstagio = useMemo(() => {
    return STATUS_FLOW.map(status => {
      const count = rows.filter(r => r.status === status).length;
      return { status, count };
    });
  }, [rows]);

  const [drillStatus, setDrillStatus] = useState<string | null>(null);
  const [drillConcessionaria, setDrillConcessionaria] = useState<string | null>(null);
  const solarColumns: DrillColumn[] = [
    { header: "Cliente", render: (r: SolarRow) => <span className="font-bold text-[var(--color-text-primary)]">{r.cliente || "—"}</span> },
    { header: "Cidade", render: (r: SolarRow) => r.cidade || "—" },
    { header: "Potência", render: (r: SolarRow) => `${r.potenciaKwp || 0} kWp` },
    { header: "Valor", render: (r: SolarRow) => fmtBRL(r.valorContrato || 0), className: "text-right" },
  ];
  const drillRows = drillStatus
    ? rows.filter((r) => r.status === drillStatus)
    : drillConcessionaria
    ? rows.filter((r) => (r.concessionaria || "Outras") === drillConcessionaria)
    : [];

  return (
    <PageContainer
      title="Painel Executivo de Energia Solar"
      description="Visão analítica de projetos fotovoltaicos, potência instalada (kWp), pipeline de contratos e homologação."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/app/energia-solar/dimensionamentos"
            className="h-9 px-3.5 text-xs font-semibold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors"
          >
            <Calculator className="w-3.5 h-3.5 text-amber-500" /> Simular Fatura
          </Link>
          <Link
            to="/app/energia-solar/vistorias"
            className="h-9 px-3.5 text-xs font-semibold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> Vistorias
          </Link>
          <Link
            to="/app/energia-solar/projetos"
            className="h-9 px-4 text-xs font-bold gap-1.5 inline-flex items-center rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Projeto
          </Link>
        </div>
      }
    >
      {/* Top Banner de Performance */}
      <div className="mb-6 p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/25 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/30">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                Capacidade Total Gerada: {kpis.potenciaTotal.toFixed(1)} kWp
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400">
                {kpis.totalProjetos} Projetos
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Economia anual projetada para a carteira de clientes: <strong className="text-emerald-500">{fmtBRL(kpis.economiaAnualEstimada)}/ano</strong>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/app/energia-solar/projetos"
            className="h-8 px-3 text-xs font-semibold inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors"
          >
            Ver Carteira Completa <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card className="p-4 bg-[var(--color-surface-elevated)]/40 border border-amber-500/20 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Potência Instalada</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-500 font-mono">
            {kpis.potenciaInstalada.toFixed(1)} <span className="text-xs font-normal">kWp</span>
          </p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">
            {kpis.vendasFechadas} usinas conectadas
          </span>
        </Card>

        <Card className="p-4 bg-[var(--color-surface-elevated)]/40 border border-blue-500/20 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Valor em Pipeline</span>
            <DollarSign className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-500 font-mono">
            {fmtBRL(kpis.valorPipeline)}
          </p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">
            Contratos em andamento
          </span>
        </Card>

        <Card className="p-4 bg-[var(--color-surface-elevated)]/40 border border-emerald-500/20 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Receita Fechada</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-500 font-mono">
            {fmtBRL(kpis.receitaFechada)}
          </p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">
            VGV fotovoltaico concluído
          </span>
        </Card>

        <Card className="p-4 bg-[var(--color-surface-elevated)]/40 border border-purple-500/20 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Ticket Médio</span>
            <Target className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-black text-purple-500 font-mono">
            {fmtBRL(kpis.ticketMedio)}
          </p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">
            Valor médio por usina/projeto
          </span>
        </Card>
      </div>

      {/* Grid: Funil Fotovoltaico + Mix Concessionárias */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Funil Solar */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" /> Funil Operacional de Projetos Fotovoltaicos
            </h4>
            <span className="text-[10px] text-[var(--color-text-muted)] font-mono">Taxa Conversão: {kpis.taxaConversao.toFixed(1)}%</span>
          </div>

          <div className="space-y-3.5">
            {porEstagio.map(({ status, count }) => {
              const pct = rows.length > 0 ? Math.round((count / rows.length) * 100) : 0;
              return (
                <button
                  type="button"
                  key={status}
                  onClick={() => count > 0 && setDrillStatus(status)}
                  disabled={count === 0}
                  className={`w-full text-left space-y-1 rounded-lg transition-colors ${count > 0 ? "cursor-pointer hover:bg-[var(--color-surface-sunken)]/60 -mx-1.5 px-1.5 py-0.5" : "cursor-default"}`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-[var(--color-text-primary)]">{status}</span>
                    <span className="font-mono text-[var(--color-text-muted)]">
                      <strong>{count}</strong> {count === 1 ? "projeto" : "projetos"} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mix de Concessionárias */}
        <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" /> Concessionárias Homologadas
              </h4>
              <span className="text-[10px] text-[var(--color-text-muted)]">Distribuição</span>
            </div>

            <div className="space-y-2.5">
              {Object.entries(kpis.concMap).map(([conc, qtd], i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setDrillConcessionaria(conc)}
                  className="w-full p-3 rounded-xl bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] flex items-center justify-between cursor-pointer hover:bg-[var(--color-surface-sunken)] transition-colors text-left"
                >
                  <div>
                    <p className="text-xs font-bold text-[var(--color-text-primary)]">{conc}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">Padrão regulatório ANEEL</p>
                  </div>
                  <span className="text-xs font-black font-mono px-2 py-0.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]">
                    {qtd} {qtd === 1 ? "usina" : "usinas"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs">
            <span className="text-[10px] text-[var(--color-text-muted)]">Total em Homologação</span>
            <Link to="/app/energia-solar/homologacoes" className="text-xs font-bold text-[var(--color-primary-blue)] hover:underline">
              Ver Homologações
            </Link>
          </div>
        </div>
      </div>

      {/* Projetos Recentes */}
      <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> Últimos Projetos na Carteira
          </h4>
          <Link to="/app/energia-solar/projetos" className="text-[11px] font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-1">
            Gerenciar Todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.slice(0, 6).map((p) => (
            <div key={p.id} className="p-3.5 rounded-xl bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] space-y-2 hover:bg-[var(--color-surface-sunken)] transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <h5 className="text-xs font-bold text-[var(--color-text-primary)]">{p.cliente || "Cliente Fotovoltaico"}</h5>
                  <span className="text-[10px] text-[var(--color-text-muted)] flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 text-[var(--color-text-muted)]" /> {p.cidade || "Brasil"}
                  </span>
                </div>
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {p.status}
                </span>
              </div>

              <div className="pt-2 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs font-mono">
                <span className="text-amber-500 font-bold">{p.potenciaKwp || p.potencia_estimada_kwp || 0} kWp</span>
                <span className="text-emerald-500 font-black">{fmtBRL(p.valorContrato || p.valor_proposta || 0)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <DrillDownPanel
        isOpen={drillStatus !== null || drillConcessionaria !== null}
        onClose={() => { setDrillStatus(null); setDrillConcessionaria(null); }}
        title={drillStatus || drillConcessionaria || undefined}
        subtitle={`${drillRows.length} projeto${drillRows.length === 1 ? "" : "s"}`}
        rows={drillRows}
        columns={solarColumns}
      />
    </PageContainer>
  );
}
