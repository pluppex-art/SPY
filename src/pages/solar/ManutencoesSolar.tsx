import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Wrench, CheckCircle2, Clock, Activity, Calendar,
  ShieldCheck, AlertTriangle, Plus, Search, Trash2, X, Download
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

interface ManutencaoSolarItem {
  id: string;
  usina: string;
  potencia: string;
  servico: string;
  data: string;
  status: "Agendada" | "Em Atendimento" | "Concluída" | "Aguardando Peça";
  geracaoAtual: string;
}

function rowToManutencao(row: any): ManutencaoSolarItem {
  return {
    id: row.id,
    usina: row.usina || "",
    potencia: row.potencia || "",
    servico: row.servico || "",
    data: row.data ? new Date(row.data + "T00:00:00").toLocaleDateString("pt-BR") : "",
    status: row.status,
    geracaoAtual: row.geracao_atual || "",
  };
}

export default function ManutencoesSolar() {
  const { activeTenantId } = useAuth();

  const [chamados, setChamados] = useState<ManutencaoSolarItem[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("solar_manutencoes")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data) {
        setChamados(data.map(rowToManutencao));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [usina, setUsina] = useState("");
  const [potencia, setPotencia] = useState("");
  const [servico, setServico] = useState("Limpeza e Lavagem de Módulos");
  const [data, setData] = useState("");
  const [geracaoAtual, setGeracaoAtual] = useState("100% normal");
  const [status, setStatus] = useState<ManutencaoSolarItem["status"]>("Agendada");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usina.trim()) {
      toast.error("Informe a usina ou cliente.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const { data: row, error } = await supabase
      .from("solar_manutencoes")
      .insert({
        tenant_id: activeTenantId,
        usina: usina.trim(),
        potencia: potencia.trim() || "10 kWp",
        servico,
        data: data || new Date().toISOString().slice(0, 10),
        status,
        geracao_atual: geracaoAtual,
      })
      .select()
      .maybeSingle();

    if (error || !row) {
      toast.error("Erro ao agendar manutenção.");
      return;
    }

    setChamados(prev => [rowToManutencao(row), ...prev]);
    toast.success("Ordem de manutenção agendada com sucesso!");
    setModalOpen(false);

    setUsina("");
    setPotencia("");
    setData("");
  };

  const handleDelete = async (item: ManutencaoSolarItem) => {
    if (!supabase) return;
    if (!(await confirmDialog({
      title: "Excluir manutenção",
      description: `Excluir a manutenção de "${item.usina}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("solar_manutencoes").delete().eq("id", item.id);
    if (error) { toast.error("Erro ao remover manutenção."); return; }
    setChamados(prev => prev.filter(c => c.id !== item.id));
    toast.info("Manutenção removida.");
  };

  const handleUpdateStatus = async (id: string, newStatus: ManutencaoSolarItem["status"]) => {
    if (!supabase) return;
    const { error } = await supabase.from("solar_manutencoes").update({ status: newStatus }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status."); return; }
    setChamados(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
    toast.success(`Status da manutenção: ${newStatus}`);
  };

  const handleExportCSV = () => {
    if (chamados.length === 0) {
      toast.error("Nenhuma manutenção para exportar.");
      return;
    }
    const headers = ["ID", "Usina", "Potencia", "Servico", "Data_Prevista", "Geracao_Atual", "Status"];
    const rows = chamados.map(c => [
      c.id,
      `"${c.usina.replace(/"/g, '""')}"`,
      c.potencia,
      `"${c.servico.replace(/"/g, '""')}"`,
      c.data,
      c.geracaoAtual,
      c.status,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `manutencoes_solares_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Relatório de manutenções exportado com sucesso!");
  };

  const filtered = chamados.filter(c => {
    const matchSearch = (
      c.usina.toLowerCase().includes(search.toLowerCase()) ||
      c.servico.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = filterStatus === "Todos" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <PageContainer
      title="O&M — Manutenção & Pós-Venda Solar"
      description="Operação e manutenção contínua, limpeza de placas fotovoltaicas, inspeção de inversores e termografia."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="h-9 px-3.5 text-xs font-semibold gap-1.5 border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)]"
          >
            <Download className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> Exportar CSV
          </Button>
          <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs bg-amber-500 hover:bg-amber-600 text-white">
            <Plus className="w-3.5 h-3.5" /> Agendar Manutenção
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="solarManutencoes"
        className="mb-4"
        kpis={[
          { label: "Chamados", value: filtered.length, icon: Wrench, tone: "primary" },
          { label: "Concluídas", value: filtered.filter(c => c.status === "Concluída").length, icon: CheckCircle2, tone: "success" },
          { label: "Agendadas", value: filtered.filter(c => c.status === "Agendada").length, icon: Calendar, tone: "warning" },
          { label: "Em Atendimento", value: filtered.filter(c => c.status === "Em Atendimento").length, icon: Clock, tone: "info" },
        ]}
        activeCount={(search ? 1 : 0) + (filterStatus !== "Todos" ? 1 : 0)}
        onClear={() => { setSearch(""); setFilterStatus("Todos"); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por usina ou serviço..." />
          <FilterChips value={filterStatus} onChange={setFilterStatus} allValue="Todos" options={["Agendada", "Em Atendimento", "Concluída", "Aguardando Peça"]} />
        </FilterBar>
      </KpiFilterCard>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(c => (
          <div key={c.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{c.usina}</h4>
                <span className="text-[10px] text-[var(--color-text-muted)] font-mono">• {c.potencia}</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Serviço: <strong className="text-[var(--color-text-primary)]">{c.servico}</strong> • Data Prevista: {c.data} • Eficiência: <strong className="text-emerald-500">{c.geracaoAtual}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={c.status}
                onChange={e => handleUpdateStatus(c.id, e.target.value as any)}
                className="text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
              >
                <option value="Agendada">Agendada</option>
                <option value="Em Atendimento">Em Atendimento</option>
                <option value="Concluída">Concluída</option>
                <option value="Aguardando Peça">Aguardando Peça</option>
              </select>

              <Button size="sm" variant="ghost" onClick={() => handleDelete(c)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhuma manutenção encontrada para este filtro.
          </div>
        )}
      </div>

      {/* Standardized Modal: Nova Manutenção */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Agendar Manutenção Fotovoltaica</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Abertura de OS para lavagem de módulos ou revisão elétrica</p>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-manutencao-solar"
              className="h-9 px-4 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white"
            >
              Confirmar Agendamento
            </Button>
          </div>
        }
      >
        <form id="form-manutencao-solar" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Usina / Cliente</label>
            <input
              type="text"
              required
              placeholder="Nome do cliente ou da usina"
              value={usina}
              onChange={e => setUsina(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Potência da Usina</label>
              <input
                type="text"
                placeholder="Ex: 25 kWp"
                value={potencia}
                onChange={e => setPotencia(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Data Prevista</label>
              <input
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Tipo de Serviço</label>
            <select
              value={servico}
              onChange={e => setServico(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
            >
              <option value="Limpeza e Lavagem de Módulos">Limpeza e Lavagem de Módulos</option>
              <option value="Inspeção de Inversor & String Box">Inspeção de Inversor & String Box</option>
              <option value="Termografia e Reaperto de Conexões">Termografia e Reaperto de Conexões</option>
              <option value="Diagnóstico de Queda de Geração">Diagnóstico de Queda de Geração</option>
              <option value="Substituição de Fusível / DPS">Substituição de Fusível / DPS</option>
            </select>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
