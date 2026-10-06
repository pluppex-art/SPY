import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  CheckSquare, Plus, Search, Car, Gauge, DollarSign,
  CheckCircle2, Clock, Trash2, X, Download
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { toast } from "sonner";
import { Modal } from "../../components/ui/modal";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

interface AvaliacaoItem {
  id: string;
  veiculo: string;
  placa: string;
  km: number;
  fipe: number;
  oferta: number;
  avaliador: string;
  cliente: string;
  status: "Em Avaliação" | "Proposta Feita" | "Aprovado" | "Recusado";
  data: string;
}

function rowToAvaliacao(row: any): AvaliacaoItem {
  return {
    id: row.id,
    veiculo: row.veiculo,
    placa: row.placa,
    km: row.km ?? 0,
    fipe: Number(row.fipe) || 0,
    oferta: Number(row.oferta) || 0,
    avaliador: row.avaliador || "",
    cliente: row.cliente || "",
    status: row.status,
    data: row.data ? new Date(row.data + "T00:00:00").toLocaleDateString("pt-BR") : "",
  };
}

export default function AvaliacoesVeiculos() {
  const { activeTenantId } = useAuth();

  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("automotivo_avaliacoes")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data) {
        setAvaliacoes(data.map(rowToAvaliacao));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterAvaliador, setFilterAvaliador] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [veiculo, setVeiculo] = useState("");
  const [placa, setPlaca] = useState("");
  const [km, setKm] = useState("");
  const [fipe, setFipe] = useState("");
  const [oferta, setOferta] = useState("");
  const [avaliador, setAvaliador] = useState("Vistoriador Interno");
  const [cliente, setCliente] = useState("");
  const [status, setStatus] = useState<AvaliacaoItem["status"]>("Em Avaliação");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!veiculo.trim() || !placa.trim()) {
      toast.error("Informe o modelo do veículo e a placa.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const numKm = parseInt(km.replace(/[^\d]/g, ""), 10) || 0;
    const cleanMoney = (val: string) => {
      const s = val.trim().replace("R$", "").trim();
      if (s.includes(",") && s.includes(".")) {
        return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
      }
      if (s.includes(",")) return parseFloat(s.replace(",", ".")) || 0;
      return parseFloat(s.replace(/[^\d.]/g, "")) || 0;
    };
    const numFipe = cleanMoney(fipe);
    const numOferta = cleanMoney(oferta) || (numFipe > 0 ? Math.round(numFipe * 0.88) : 0);

    const { data, error } = await supabase
      .from("automotivo_avaliacoes")
      .insert({
        tenant_id: activeTenantId,
        veiculo: veiculo.trim(),
        placa: placa.toUpperCase().trim(),
        km: numKm,
        fipe: numFipe,
        oferta: numOferta,
        avaliador: avaliador.trim() || "Vistoriador Interno",
        cliente: cliente.trim() || "Cliente Balcão",
        status,
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      toast.error("Erro ao registrar avaliação.");
      return;
    }

    setAvaliacoes(prev => [rowToAvaliacao(data), ...prev]);
    toast.success("Avaliação iniciada com sucesso!");
    setModalOpen(false);

    setVeiculo("");
    setPlaca("");
    setKm("");
    setFipe("");
    setOferta("");
    setCliente("");
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const avaliacao = avaliacoes.find(a => a.id === id);
    if (!(await confirmDialog({
      title: "Excluir avaliação",
      description: `Excluir a avaliação de "${avaliacao?.veiculo || "este veículo"}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("automotivo_avaliacoes").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover avaliação."); return; }
    setAvaliacoes(prev => prev.filter(a => a.id !== id));
    toast.info("Avaliação removida.");
  };

  const handleUpdateStatus = async (id: string, newStatus: AvaliacaoItem["status"]) => {
    if (!supabase) return;
    const { error } = await supabase.from("automotivo_avaliacoes").update({ status: newStatus }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status."); return; }
    setAvaliacoes(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    toast.success(`Status da avaliação: ${newStatus}`);
  };

  const filterAvaliadorOpcoes = Array.from(new Set(avaliacoes.map(a => a.avaliador).filter(Boolean))).sort();
  const filtered = avaliacoes.filter(a => {
    const matchSearch = (
      a.veiculo.toLowerCase().includes(search.toLowerCase()) ||
      a.placa.toLowerCase().includes(search.toLowerCase()) ||
      a.cliente.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = filterStatus === "Todos" || a.status === filterStatus;
    const matchExtra = !filterAvaliador || a.avaliador === filterAvaliador;
    return matchSearch && matchStatus && matchExtra;
  });

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.info("Nenhuma avaliação para exportar.");
      return;
    }
    const headers = ["Veículo", "Placa", "KM", "Tabela FIPE", "Oferta / Compra", "Avaliador", "Cliente", "Status", "Data"];
    const rows = filtered.map(a => [
      `"${a.veiculo.replace(/"/g, '""')}"`,
      `"${a.placa}"`,
      a.km,
      a.fipe,
      a.oferta,
      `"${a.avaliador.replace(/"/g, '""')}"`,
      `"${a.cliente.replace(/"/g, '""')}"`,
      `"${a.status}"`,
      `"${a.data}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `avaliacoes_veiculos_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Avaliações exportadas com sucesso!");
  };

  return (
    <PageContainer
      title="Avaliações de Seminovos & Usados"
      description="Checklist cautelar, laudo de pintura, motor, histórico de leilão e precificação FIPE."
      actions={
        <div className="flex items-center gap-2">
          <Button onClick={handleExportCSV} variant="outline" className="h-9 px-3.5 text-xs font-bold gap-1.5 border-[var(--color-border-default)]">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
          <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Nova Avaliação
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="autoAvaliacoes"
        className="mb-4"
        kpis={[
          { label: "Avaliações", value: filtered.length, icon: CheckSquare, tone: "primary" },
          { label: "FIPE Acumulada", value: `R$ ${(filtered.reduce((s, a) => s + a.fipe, 0) / 1000).toFixed(0)}k`, icon: DollarSign, tone: "info" },
          { label: "Aprovadas", value: filtered.filter(a => a.status === "Aprovado").length, icon: CheckCircle2, tone: "success" },
          { label: "Conversão de Compra", value: filtered.length > 0 ? `${Math.round((filtered.filter(a => a.status === "Aprovado").length / filtered.length) * 100)}%` : "0%", icon: Gauge, tone: "accent" },
        ]}
        activeCount={(search ? 1 : 0) + (filterStatus !== "Todos" ? 1 : 0) + (filterAvaliador ? 1 : 0)}
        onClear={() => { setSearch(""); setFilterStatus("Todos"); setFilterAvaliador(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por veículo, placa ou cliente..." />
          <FilterSelect icon={Gauge} value={filterAvaliador} onChange={setFilterAvaliador} allLabel="Todos os avaliadores" options={filterAvaliadorOpcoes} />
          <FilterChips value={filterStatus} onChange={setFilterStatus} allValue="Todos" options={["Em Avaliação", "Proposta Feita", "Aprovado", "Recusado"]} />
        </FilterBar>
      </KpiFilterCard>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(av => (
          <div key={av.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{av.veiculo}</h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] font-bold text-[var(--color-text-primary)]">
                  {av.placa}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)] font-mono">{av.km.toLocaleString("pt-BR")} km</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                FIPE: R$ {av.fipe.toLocaleString("pt-BR")} • Margem Sugerida: <strong className="text-emerald-500">R$ {av.oferta.toLocaleString("pt-BR")}</strong> • Cliente: {av.cliente} • Vistoriador: {av.avaliador}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <select
                value={av.status}
                onChange={e => handleUpdateStatus(av.id, e.target.value as any)}
                className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
              >
                <option value="Em Avaliação">Em Avaliação</option>
                <option value="Proposta Feita">Proposta Feita</option>
                <option value="Aprovado">Aprovado</option>
                <option value="Recusado">Recusado</option>
              </select>

              <Button size="sm" variant="ghost" onClick={() => handleDelete(av.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhuma avaliação encontrada para este filtro.
          </div>
        )}
      </div>

      {/* Modal de Nova Avaliação */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-lg"
        title={
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold shrink-0">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--color-text-primary)]">
                Nova Avaliação de Seminovos
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                Registre os dados do veículo e da proposta de compra/troca
              </p>
            </div>
          </div>
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setModalOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 text-xs font-bold"
            >
              Iniciar Avaliação
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-3.5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] block mb-1">
              Modelo / Versão do Veículo *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Jeep Compass Longitude 2.0 Flex 2021"
              value={veiculo}
              onChange={e => setVeiculo(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-blue-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] block mb-1">
                Placa *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: BRA-2E19"
                value={placa}
                onChange={e => setPlaca(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] block mb-1">
                Quilometragem (KM)
              </label>
              <input
                type="text"
                placeholder="Ex: 45.000 km"
                value={km}
                onChange={e => setKm(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] block mb-1">
                Tabela FIPE (R$)
              </label>
              <input
                type="text"
                placeholder="Ex: 115.000"
                value={fipe}
                onChange={e => setFipe(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] block mb-1">
                Oferta / Compra (R$)
              </label>
              <input
                type="text"
                placeholder="Ex: 102.000"
                value={oferta}
                onChange={e => setOferta(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none font-mono font-bold text-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] block mb-1">
                Proprietário / Cliente
              </label>
              <input
                type="text"
                placeholder="Nome do cliente"
                value={cliente}
                onChange={e => setCliente(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] block mb-1">
                Vistoriador Responsável
              </label>
              <input
                type="text"
                placeholder="Nome do vistoriador"
                value={avaliador}
                onChange={e => setAvaliador(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
              />
            </div>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
