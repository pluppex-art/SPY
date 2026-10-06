import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  ClipboardCheck, Plus, Search, Calendar, MapPin,
  Camera, CheckCircle2, Clock, AlertTriangle, Trash2, X, Download
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Modal } from "../../components/ui/modal";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

interface VistoriaSolarItem {
  id: string;
  cliente: string;
  telefone?: string;
  endereco: string;
  dataAgendada: string;
  responsavel: string;
  tipoTelhado: string;
  status: "Agendada" | "Em Andamento" | "Concluída / Aprovada" | "Reprovada / Ajuste Necessário";
}

function rowToVistoria(row: any): VistoriaSolarItem {
  return {
    id: row.id,
    cliente: row.cliente || "",
    telefone: row.telefone || "",
    endereco: row.endereco || "",
    dataAgendada: row.data_agendada ? new Date(row.data_agendada + "T00:00:00").toLocaleDateString("pt-BR") : "",
    responsavel: row.responsavel || "",
    tipoTelhado: row.tipo_telhado || "",
    status: row.status,
  };
}

export default function VistoriasSolar() {
  const { activeTenantId } = useAuth();

  const [vistorias, setVistorias] = useState<VistoriaSolarItem[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("solar_vistorias")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data) {
        setVistorias(data.map(rowToVistoria));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterResp, setFilterResp] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [dataAgendada, setDataAgendada] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [tipoTelhado, setTipoTelhado] = useState("Metálico");
  const [status, setStatus] = useState<VistoriaSolarItem["status"]>("Agendada");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente.trim() || !endereco.trim()) {
      toast.error("Preencha o cliente e o endereço da instalação.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const { data, error } = await supabase
      .from("solar_vistorias")
      .insert({
        tenant_id: activeTenantId,
        cliente: cliente.trim(),
        telefone: telefone.trim() || null,
        endereco: endereco.trim(),
        data_agendada: dataAgendada || new Date().toISOString().slice(0, 10),
        responsavel: responsavel.trim() || "Eng. Responsável",
        tipo_telhado: tipoTelhado,
        status,
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      toast.error("Erro ao agendar vistoria.");
      return;
    }

    setVistorias(prev => [rowToVistoria(data), ...prev]);
    toast.success("Vistoria técnica agendada com sucesso!");
    setModalOpen(false);

    setCliente("");
    setTelefone("");
    setEndereco("");
    setDataAgendada("");
    setResponsavel("");
  };

  const handleDelete = async (item: VistoriaSolarItem) => {
    if (!supabase) return;
    if (!(await confirmDialog({
      title: "Excluir vistoria",
      description: `Excluir a vistoria de "${item.cliente}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("solar_vistorias").delete().eq("id", item.id);
    if (error) { toast.error("Erro ao remover vistoria."); return; }
    setVistorias(prev => prev.filter(v => v.id !== item.id));
    toast.info("Vistoria removida.");
  };

  const handleUpdateStatus = async (id: string, newStatus: VistoriaSolarItem["status"]) => {
    if (!supabase) return;
    const { error } = await supabase.from("solar_vistorias").update({ status: newStatus }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status."); return; }
    setVistorias(prev => prev.map(v => v.id === id ? { ...v, status: newStatus } : v));
    toast.success(`Status da vistoria: ${newStatus}`);
  };

  const handleExportCSV = () => {
    if (vistorias.length === 0) {
      toast.error("Nenhuma vistoria para exportar.");
      return;
    }
    const headers = ["ID", "Cliente", "Telefone", "Endereco", "Data_Agendada", "Responsavel", "Tipo_Telhado", "Status"];
    const rows = vistorias.map(v => [
      v.id,
      `"${v.cliente.replace(/"/g, '""')}"`,
      v.telefone || "",
      `"${v.endereco.replace(/"/g, '""')}"`,
      v.dataAgendada,
      `"${v.responsavel.replace(/"/g, '""')}"`,
      `"${v.tipoTelhado.replace(/"/g, '""')}"`,
      v.status,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `vistorias_solares_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Relatório de vistorias exportado com sucesso!");
  };

  const responsaveis = Array.from(new Set(vistorias.map(v => v.responsavel).filter(Boolean))).sort();
  const filtered = vistorias.filter(v => {
    const matchSearch = (
      v.cliente.toLowerCase().includes(search.toLowerCase()) ||
      v.endereco.toLowerCase().includes(search.toLowerCase()) ||
      v.responsavel.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = filterStatus === "Todos" || v.status === filterStatus;
    const matchResp = !filterResp || v.responsavel === filterResp;
    return matchSearch && matchStatus && matchResp;
  });

  return (
    <PageContainer
      title="Vistorias Técnicas Solares"
      description="Inspeção in-loco de estrutura de telhado, sombreamento, padrão de entrada e viabilidade técnica."
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
            <Plus className="w-3.5 h-3.5" /> Agendar Vistoria
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="solarVistorias"
        className="mb-4"
        kpis={[
          { label: "Vistorias", value: filtered.length, icon: ClipboardCheck, tone: "primary" },
          { label: "Aprovadas", value: filtered.filter(v => v.status === "Concluída / Aprovada").length, icon: CheckCircle2, tone: "success" },
          { label: "Agendadas", value: filtered.filter(v => v.status === "Agendada").length, icon: Calendar, tone: "warning" },
          { label: "Reprovadas", value: filtered.filter(v => v.status === "Reprovada / Ajuste Necessário").length, icon: AlertTriangle, tone: "danger" },
        ]}
        activeCount={(search ? 1 : 0) + (filterStatus !== "Todos" ? 1 : 0) + (filterResp ? 1 : 0)}
        onClear={() => { setSearch(""); setFilterStatus("Todos"); setFilterResp(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por cliente, endereço ou responsável..." />
          <FilterSelect icon={Camera} value={filterResp} onChange={setFilterResp} allLabel="Todos os responsáveis" options={responsaveis} />
          <FilterChips value={filterStatus} onChange={setFilterStatus} allValue="Todos" options={["Agendada", "Em Andamento", "Concluída / Aprovada", "Reprovada / Ajuste Necessário"]} />
        </FilterBar>
      </KpiFilterCard>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(v => (
          <div key={v.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{v.cliente}</h4>
                <span className="text-[10px] text-[var(--color-text-muted)] flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[var(--color-text-muted)]" /> {v.endereco}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                <span>Telhado: <strong className="text-[var(--color-text-primary)]">{v.tipoTelhado}</strong></span>
                <span>•</span>
                <span>Agendado para: <strong className="text-amber-500">{v.dataAgendada}</strong></span>
                <span>•</span>
                <span>Técnico: <strong className="text-[var(--color-text-primary)]">{v.responsavel}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={v.status}
                onChange={e => handleUpdateStatus(v.id, e.target.value as any)}
                className="text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
              >
                <option value="Agendada">Agendada</option>
                <option value="Em Andamento">Em Andamento</option>
                <option value="Concluída / Aprovada">Concluída / Aprovada</option>
                <option value="Reprovada / Ajuste Necessário">Reprovada</option>
              </select>

              <Button size="sm" variant="ghost" onClick={() => handleDelete(v)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhuma vistoria encontrada para este filtro.
          </div>
        )}
      </div>

      {/* Standardized Modal: Agendar Vistoria */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Agendar Vistoria Técnica</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Inspeção in-loco de estrutura, sombreamento e telhado</p>
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
              form="form-vistoria-solar"
              className="h-9 px-4 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white"
            >
              Confirmar Agendamento
            </Button>
          </div>
        }
      >
        <form id="form-vistoria-solar" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Cliente</label>
              <input
                type="text"
                required
                placeholder="Nome do cliente"
                value={cliente}
                onChange={e => setCliente(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Telefone / WhatsApp</label>
              <input
                type="text"
                placeholder="(11) 90000-0000"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Endereço da Instalação</label>
            <input
              type="text"
              required
              placeholder="Rua, número, bairro e cidade"
              value={endereco}
              onChange={e => setEndereco(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Tipo de Telhado / Solo</label>
              <select
                value={tipoTelhado}
                onChange={e => setTipoTelhado(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
              >
                <option value="Metálico Trapezoidal">Metálico Trapezoidal</option>
                <option value="Cerâmico Colonial">Cerâmico Colonial</option>
                <option value="Fibrocimento">Fibrocimento</option>
                <option value="Laje de Concreto">Laje de Concreto</option>
                <option value="Usinas em Solo">Usinas em Solo</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Data Agendada</label>
              <input
                type="date"
                value={dataAgendada}
                onChange={e => setDataAgendada(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Engenheiro / Técnico Responsável</label>
            <input
              type="text"
              placeholder="Ex: Eng. Lucas Peixoto"
              value={responsavel}
              onChange={e => setResponsavel(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
            />
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
