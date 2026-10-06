import { useState, useMemo, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Car, DollarSign, TrendingUp, Calendar,
  ArrowRight, Plus, Columns3, CheckCircle2, Clock
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { DrillDownPanel, type DrillColumn } from "../../components/ui/DrillDownPanel";

type VeiculoSummary = {
  id: string;
  marca: string;
  modelo: string;
  anoModelo: number;
  valor: number;
  status: string;
  km?: number;
};

type TestDriveSummary = {
  id: string;
  cliente: string;
  veiculo: string;
  data: string;
  hora: string;
  consultor: string;
  status: string;
};

export default function PainelAutomotivo() {
  const { user, activeTenantId } = useAuth();

  const [veiculos, setVeiculos] = useState<VeiculoSummary[]>([]);
  const [testDrives, setTestDrives] = useState<TestDriveSummary[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data: veiculosRows } = await supabase
        .from("imobiliario_veiculos")
        .select("id,marca,modelo,ano_modelo,valor,status,km")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && veiculosRows) {
        setVeiculos(veiculosRows.map((v: any): VeiculoSummary => ({
          id: v.id,
          marca: v.marca,
          modelo: v.modelo,
          anoModelo: v.ano_modelo,
          valor: Number(v.valor) || 0,
          status: v.status,
          km: Number(v.km) || 0,
        })));
      }

      const hojeISO = new Date().toISOString().split("T")[0];
      const { data: visitasRows } = await supabase
        .from("imobiliario_visitas")
        .select("id,cliente,data,hora,corretor,status,imobiliario_veiculos(marca,modelo)")
        .eq("tenant_id", activeTenantId)
        .not("veiculo_id", "is", null)
        .neq("status", "Cancelada")
        .gte("data", hojeISO)
        .order("data", { ascending: true })
        .order("hora", { ascending: true })
        .limit(5);
      if (!cancelled && visitasRows) {
        setTestDrives(visitasRows.map((v: any): TestDriveSummary => ({
          id: v.id,
          cliente: v.cliente,
          veiculo: v.imobiliario_veiculos ? `${v.imobiliario_veiculos.marca} ${v.imobiliario_veiculos.modelo}` : "Veículo",
          data: new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR"),
          hora: v.hora,
          consultor: v.corretor || user?.name || "Consultor",
          status: v.status,
        })));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, user]);

  const [drillOpen, setDrillOpen] = useState(false);
  const veiculoColumns: DrillColumn[] = [
    { header: "Veículo", render: (v: VeiculoSummary) => <span className="font-bold text-[var(--color-text-primary)]">{v.marca} {v.modelo}</span> },
    { header: "Ano", render: (v: VeiculoSummary) => v.anoModelo || "—" },
    { header: "Status", render: (v: VeiculoSummary) => v.status || "—" },
    { header: "Valor", render: (v: VeiculoSummary) => `R$ ${Number(v.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, className: "text-right" },
  ];

  const kpis = useMemo(() => {
    const disponiveis = veiculos.filter(v => v.status === "Disponível");
    const totalEstoqueValor = veiculos.reduce((s, v) => s + (Number(v.valor) || 0), 0);
    const totalDisponivelValor = disponiveis.reduce((s, v) => s + (Number(v.valor) || 0), 0);
    const testDrivesAtivos = testDrives.filter(t => t.status !== "Cancelado").length;
    const ticketMedio = veiculos.length > 0 ? totalEstoqueValor / veiculos.length : 0;

    return {
      qtdTotal: veiculos.length,
      qtdDisponivel: disponiveis.length,
      totalEstoqueValor,
      totalDisponivelValor,
      testDrivesAtivos,
      ticketMedio,
    };
  }, [veiculos, testDrives]);

  return (
    <PageContainer
      title="Painel Geral Concessionária & Revenda"
      description="Visão executiva do estoque de veículos, giro de pátio, ticket médio e test-drives agendados."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/app/crm/pipeline?nicho=automotivo"
            className="h-9 px-3.5 text-xs font-bold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)] text-[var(--color-text-primary)] transition-all"
          >
            <Columns3 className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Ver Pipeline CRM
          </Link>
          <Link
            to="/app/automotivo/veiculos"
            className="h-9 px-4 text-xs font-bold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-primary-blue)] text-white shadow-xs hover:opacity-95"
          >
            <Car className="w-3.5 h-3.5" /> Estoque de Veículos
          </Link>
        </div>
      }
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card onClick={() => setDrillOpen(true)} className="p-4 bg-[var(--color-surface-elevated)]/40 border border-blue-500/25 shadow-xs cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Veículos em Pátio</span>
            <Car className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl font-black text-[var(--color-text-primary)]">{kpis.qtdTotal}</p>
          <span className="text-[10px] text-emerald-500 font-bold block mt-1">{kpis.qtdDisponivel} disponíveis para venda</span>
        </Card>

        <Card className="p-4 bg-[var(--color-surface-elevated)]/40 border border-emerald-500/25 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">VGV em Estoque</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-black text-emerald-500">
            R$ {(kpis.totalEstoqueValor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k
          </p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">Patrimônio automotivo avaliado</span>
        </Card>

        <Card className="p-4 bg-[var(--color-surface-elevated)]/40 border border-amber-500/25 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Test-Drives no Mês</span>
            <Calendar className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-black text-amber-500">{kpis.testDrivesAtivos}</p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">Agendamentos com consultores</span>
        </Card>

        <Card className="p-4 bg-[var(--color-surface-elevated)]/40 border border-purple-500/25 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Ticket Médio</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-xl font-black text-[var(--color-text-primary)]">
            R$ {(kpis.ticketMedio / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k
          </p>
          <span className="text-[10px] text-[var(--color-text-muted)] block mt-1">Valor médio por veículo</span>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Veículos em Estoque */}
        <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Car className="w-4 h-4 text-[var(--color-primary-blue)]" /> Veículos em Destaque no Pátio
            </h4>
            <Link to="/app/automotivo/veiculos" className="text-[11px] font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-1">
              Ver todos ({veiculos.length}) <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {veiculos.slice(0, 4).map((v, i) => (
              <div key={i} className="p-3 rounded-xl bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] flex items-center justify-between hover:bg-[var(--color-surface-sunken)] transition-colors">
                <div>
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">{v.marca} {v.modelo}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    Ano {v.anoModelo} • {v.km ? `${v.km.toLocaleString("pt-BR")} km • ` : ""}
                    <strong className="text-[var(--color-text-primary)] font-mono">
                      R$ {Number(v.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>
                  </p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                  v.status === "Disponível"
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                    : v.status === "Reservado"
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                }`}>
                  {v.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Próximos Test-Drives */}
        <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" /> Próximos Test-Drives
            </h4>
            <Link to="/app/automotivo/visitas" className="text-[11px] font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-1">
              Ver agenda <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {testDrives.map((t, i) => (
              <div key={i} className="p-3 rounded-xl bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] flex items-center justify-between hover:bg-[var(--color-surface-sunken)] transition-colors">
                <div>
                  <p className="text-xs font-bold text-[var(--color-text-primary)]">{t.cliente}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">{t.veiculo} • Consultor: {t.consultor}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-[var(--color-primary-blue)] block">{t.data} às {t.hora}</span>
                  <span className="text-[10px] text-emerald-500 font-bold">{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DrillDownPanel
        isOpen={drillOpen}
        onClose={() => setDrillOpen(false)}
        title="Veículos em Pátio"
        subtitle={`${veiculos.length} veículo${veiculos.length === 1 ? "" : "s"}`}
        rows={veiculos}
        columns={veiculoColumns}
      />
    </PageContainer>
  );
}
