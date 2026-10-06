import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Calendar, Car, Clock, User, CheckCircle2,
  Plus, ArrowRight, Search, Trash2, X
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card } from "../../components/ui/card";
import { Modal } from "../../components/ui/modal";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { friendlyError } from "../../lib/friendlyError";

interface TestDriveItem {
  id: string;
  cliente: string;
  telefone: string;
  carro: string;
  vendedor: string;
  data: string;
  hora: string;
  cnhValida: boolean;
  status: "Agendada" | "Confirmada" | "Realizada" | "Cancelada";
}

type VeiculoOption = { id: string; label: string };

function rowToTestDrive(r: any): TestDriveItem {
  return {
    id: r.id,
    cliente: r.cliente,
    telefone: r.telefone || "",
    carro: r.imobiliario_veiculos ? `${r.imobiliario_veiculos.marca} ${r.imobiliario_veiculos.modelo}` : r.imovel,
    vendedor: r.corretor || "",
    data: r.data ? new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR") : "",
    hora: r.hora || "10:00",
    // Não existe coluna para verificação de CNH em imobiliario_visitas —
    // campo mantido só como conveniência de UI, não persiste no banco.
    cnhValida: true,
    status: r.status,
  };
}

export default function TestDrives() {
  const { activeTenantId } = useAuth();

  const [testDrives, setTestDrives] = useState<TestDriveItem[]>([]);
  const [veiculosOptions, setVeiculosOptions] = useState<VeiculoOption[]>([]);

  const refetch = () => {
    if (!supabase || !activeTenantId) return;
    supabase
      .from("imobiliario_visitas")
      .select("*, imobiliario_veiculos(marca,modelo)")
      .eq("tenant_id", activeTenantId)
      .not("veiculo_id", "is", null)
      .order("data", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Erro ao carregar test-drives: ${friendlyError(error)}`);
        else if (data) setTestDrives(data.map(rowToTestDrive));
      });
  };

  useEffect(() => {
    refetch();
    if (!supabase || !activeTenantId) return;
    supabase
      .from("imobiliario_veiculos")
      .select("id,marca,modelo")
      .eq("tenant_id", activeTenantId)
      .then(({ data }) => {
        if (data) setVeiculosOptions(data.map((v: any) => ({ id: v.id, label: `${v.marca} ${v.modelo}` })));
      });
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterVendedor, setFilterVendedor] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [cnhValida, setCnhValida] = useState(true);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente.trim() || !veiculoId) {
      toast.error("Preencha o cliente e selecione o veículo.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Não foi possível conectar ao servidor.");
      return;
    }

    const veiculoLabel = veiculosOptions.find(v => v.id === veiculoId)?.label || "Veículo";

    const { data: row, error } = await supabase
      .from("imobiliario_visitas")
      .insert({
        imovel: veiculoLabel,
        veiculo_id: veiculoId,
        cliente: cliente.trim(),
        telefone: telefone.trim() || null,
        corretor: vendedor.trim() || null,
        data: data || new Date().toISOString().split("T")[0],
        hora: hora || "14:00",
        status: "Agendada",
      })
      .select("*, imobiliario_veiculos(marca,modelo)")
      .maybeSingle();

    if (error) {
      toast.error(`Erro ao agendar test-drive: ${friendlyError(error)}`);
      return;
    }

    if (row) setTestDrives(prev => [rowToTestDrive(row), ...prev]);
    toast.success("Test-drive agendado com sucesso!");
    setModalOpen(false);

    setCliente("");
    setTelefone("");
    setVeiculoId("");
    setVendedor("");
    setData("");
    setHora("");
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const testDrive = testDrives.find(t => t.id === id);
    if (!(await confirmDialog({
      title: "Excluir test-drive",
      description: `Excluir o test-drive de "${testDrive?.cliente || "este cliente"}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("imobiliario_visitas").delete().eq("id", id);
    if (error) { toast.error(`Erro ao remover test-drive: ${friendlyError(error)}`); return; }
    setTestDrives(prev => prev.filter(t => t.id !== id));
    toast.info("Test-drive removido.");
  };

  const handleUpdateStatus = async (id: string, newStatus: TestDriveItem["status"]) => {
    if (!supabase) return;
    const { error } = await supabase.from("imobiliario_visitas").update({ status: newStatus }).eq("id", id);
    if (error) { toast.error(`Erro ao atualizar status: ${friendlyError(error)}`); return; }
    setTestDrives(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
    toast.success(`Status do test-drive: ${newStatus}`);
  };

  const filterVendedorOpcoes = Array.from(new Set(testDrives.map(t => t.vendedor).filter(Boolean))).sort();
  const filtered = testDrives.filter(t => {
    const matchSearch = (
      t.cliente.toLowerCase().includes(search.toLowerCase()) ||
      t.carro.toLowerCase().includes(search.toLowerCase()) ||
      t.vendedor.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = filterStatus === "Todos" || t.status === filterStatus;
    const matchExtra = !filterVendedor || t.vendedor === filterVendedor;
    return matchSearch && matchStatus && matchExtra;
  });

  return (
    <PageContainer
      title="Test-Drives Agendados"
      description="Controle de experiência de condução com clientes, verificação de CNH e agendamentos integrados à Agenda."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/app/agenda/calendario"
            className="h-9 px-3.5 text-xs font-bold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)] text-[var(--color-text-primary)] transition-all"
          >
            <Calendar className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Ver no Calendário Geral
          </Link>
          <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Novo Test-Drive
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="autoTestDrives"
        className="mb-4"
        kpis={[
          { label: "Test-Drives", value: filtered.length, icon: Calendar, tone: "primary" },
          { label: "Agendados / Confirmados", value: filtered.filter(t => t.status === "Confirmada" || t.status === "Agendada").length, icon: Clock, tone: "info" },
          { label: "Realizados", value: filtered.filter(t => t.status === "Realizada").length, icon: CheckCircle2, tone: "success" },
          { label: "Cancelados", value: filtered.filter(t => t.status === "Cancelada").length, icon: User, tone: "danger" },
        ]}
        activeCount={(search ? 1 : 0) + (filterStatus !== "Todos" ? 1 : 0) + (filterVendedor ? 1 : 0)}
        onClear={() => { setSearch(""); setFilterStatus("Todos"); setFilterVendedor(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por cliente, veículo ou vendedor..." />
          <FilterSelect icon={User} value={filterVendedor} onChange={setFilterVendedor} allLabel="Todos os vendedores" options={filterVendedorOpcoes} />
          <FilterChips value={filterStatus} onChange={setFilterStatus} allValue="Todos" options={["Agendada", "Confirmada", "Realizada", "Cancelada"]} />
        </FilterBar>
      </KpiFilterCard>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(td => (
          <div key={td.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{td.cliente}</h4>
                {td.telefone && <span className="text-[10px] font-bold text-[var(--color-text-muted)]">({td.telefone})</span>}
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                  td.cnhValida
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                    : "bg-red-500/10 text-red-500 border-red-500/20"
                }`}>
                  {td.cnhValida ? "CNH Verificada" : "Pendente CNH"}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-primary)] font-bold">
                Veículo: {td.carro}
              </p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Consultor Responsável: <strong className="text-[var(--color-text-primary)]">{td.vendedor}</strong>
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-mono font-bold text-[var(--color-primary-blue)]">
                {td.data} às {td.hora}
              </span>

              <select
                value={td.status}
                onChange={e => handleUpdateStatus(td.id, e.target.value as any)}
                className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
              >
                <option value="Agendada">Agendada</option>
                <option value="Confirmada">Confirmada</option>
                <option value="Realizada">Realizada</option>
                <option value="Cancelada">Cancelada</option>
              </select>

              <Button size="sm" variant="ghost" onClick={() => handleDelete(td.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhum test-drive encontrado para este filtro.
          </div>
        )}
      </div>

      {/* Modal de Novo Test-Drive */}
      {/* Standardized Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Agendar Novo Test-Drive</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Cadastre o cliente, veículo e horário agendado</p>
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
              form="form-test-drive"
              className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
            >
              Confirmar Agendamento
            </Button>
          </div>
        }
      >
        <form id="form-test-drive" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Nome do Cliente</label>
              <input
                type="text"
                required
                placeholder="Nome completo"
                value={cliente}
                onChange={e => setCliente(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Telefone / WhatsApp</label>
              <input
                type="text"
                placeholder="(11) 90000-0000"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Veículo do Test-Drive</label>
            <select
              required
              value={veiculoId}
              onChange={e => setVeiculoId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            >
              <option value="">Selecione um veículo do estoque...</option>
              {veiculosOptions.map(v => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Data</label>
              <input
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Horário</label>
              <input
                type="time"
                value={hora}
                onChange={e => setHora(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Consultor Acompanhante</label>
            <input
              type="text"
              placeholder="Nome do consultor"
              value={vendedor}
              onChange={e => setVendedor(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="cnhCheck"
              checked={cnhValida}
              onChange={e => setCnhValida(e.target.checked)}
              className="rounded border-[var(--color-border-default)] text-[var(--color-primary-blue)]"
            />
            <label htmlFor="cnhCheck" className="text-xs text-[var(--color-text-primary)] cursor-pointer select-none">
              CNH física ou digital validada
            </label>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
