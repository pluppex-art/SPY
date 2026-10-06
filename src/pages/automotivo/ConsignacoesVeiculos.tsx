import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Handshake, Plus, Search, Car, DollarSign,
  User, CheckCircle2, Clock, Trash2, X, Download
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { friendlyError } from "../../lib/friendlyError";

interface ConsignacaoItem {
  id: string;
  veiculo: string;
  consignante: string;
  telefone: string;
  valorPedido: number;
  comissaoAgencia: string;
  comissaoPercentual: number;
  repasseCombinado: number;
  status: "No Pátio" | "Em Negociação" | "Vendido / Repasse Pendente" | "Repassado & Finalizado";
  data: string;
}

// Deriva o status "de negócio" (exibido nesta tela) a partir das colunas reais
// de imobiliario_veiculos: status (Disponível/Reservado/Vendido/Em Preparação)
// + repasse_realizado. Não existe uma coluna própria pra esses 4 rótulos.
function derivarStatus(dbStatus: string, repasseRealizado: boolean): ConsignacaoItem["status"] {
  if (dbStatus === "Vendido") return repasseRealizado ? "Repassado & Finalizado" : "Vendido / Repasse Pendente";
  if (dbStatus === "Reservado") return "Em Negociação";
  return "No Pátio";
}

function statusParaColunas(status: ConsignacaoItem["status"]): { status: string; repasse_realizado: boolean } {
  switch (status) {
    case "Repassado & Finalizado": return { status: "Vendido", repasse_realizado: true };
    case "Vendido / Repasse Pendente": return { status: "Vendido", repasse_realizado: false };
    case "Em Negociação": return { status: "Reservado", repasse_realizado: false };
    default: return { status: "Disponível", repasse_realizado: false };
  }
}

function rowToConsignacao(r: any): ConsignacaoItem {
  const pct = Number(r.comissao_percentual) || 0;
  const valor = Number(r.valor) || 0;
  return {
    id: r.id,
    veiculo: `${r.marca ?? ""} ${r.modelo ?? ""}`.trim(),
    consignante: r.consignante_nome || "",
    telefone: r.consignante_telefone || "",
    valorPedido: valor,
    comissaoAgencia: `${pct}%`,
    comissaoPercentual: pct,
    repasseCombinado: Math.round(valor * (1 - pct / 100)),
    status: derivarStatus(r.status, !!r.repasse_realizado),
    data: r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "",
  };
}

export default function ConsignacoesVeiculos() {
  const { activeTenantId } = useAuth();

  const [consignacoes, setConsignacoes] = useState<ConsignacaoItem[]>([]);

  const refetch = () => {
    if (!supabase || !activeTenantId) return;
    supabase
      .from("imobiliario_veiculos")
      .select("*")
      .eq("tenant_id", activeTenantId)
      .eq("is_consignado", true)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Erro ao carregar consignações: ${friendlyError(error)}`);
        else if (data) setConsignacoes(data.map(rowToConsignacao));
      });
  };

  useEffect(() => { refetch(); }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [marca, setMarca] = useState("");
  const [veiculo, setVeiculo] = useState("");
  const [consignante, setConsignante] = useState("");
  const [telefone, setTelefone] = useState("");
  const [valorPedido, setValorPedido] = useState("");
  const [comissaoPercent, setComissaoPercent] = useState("5");
  const [status, setStatus] = useState<ConsignacaoItem["status"]>("No Pátio");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marca.trim() || !veiculo.trim() || !consignante.trim()) {
      toast.error("Preencha a marca, o modelo do veículo e o nome do proprietário.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Não foi possível conectar ao servidor.");
      return;
    }

    const cleanMoney = (val: string) => {
      const s = val.trim().replace("R$", "").trim();
      if (s.includes(",") && s.includes(".")) {
        return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
      }
      if (s.includes(",")) return parseFloat(s.replace(",", ".")) || 0;
      return parseFloat(s.replace(/[^\d.]/g, "")) || 0;
    };
    const numPedido = cleanMoney(valorPedido);
    const pct = parseFloat(comissaoPercent.replace(",", ".")) || 5;
    const { status: dbStatus, repasse_realizado } = statusParaColunas(status);

    const { data, error } = await supabase
      .from("imobiliario_veiculos")
      .insert({
        marca: marca.trim(),
        modelo: veiculo.trim(),
        valor: numPedido,
        status: dbStatus,
        is_consignado: true,
        consignante_nome: consignante.trim(),
        consignante_telefone: telefone.trim() || null,
        comissao_percentual: pct,
        repasse_realizado,
      })
      .select()
      .maybeSingle();

    if (error) {
      toast.error(`Erro ao registrar consignação: ${friendlyError(error)}`);
      return;
    }

    if (data) setConsignacoes(prev => [rowToConsignacao(data), ...prev]);
    toast.success("Veículo consignado com sucesso!");
    setModalOpen(false);

    setMarca("");
    setVeiculo("");
    setConsignante("");
    setTelefone("");
    setValorPedido("");
  };

  // Remove a consignação (o veículo em si permanece no estoque — ele só
  // deixa de ser tratado como consignado).
  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const consignacao = consignacoes.find(c => c.id === id);
    if (!(await confirmDialog({
      title: "Remover consignação",
      description: `Remover a consignação de "${consignacao?.veiculo || "este veículo"}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase
      .from("imobiliario_veiculos")
      .update({ is_consignado: false, consignante_nome: null, consignante_telefone: null, comissao_percentual: null, repasse_realizado: false })
      .eq("id", id);
    if (error) { toast.error(`Erro ao remover consignação: ${friendlyError(error)}`); return; }
    setConsignacoes(prev => prev.filter(c => c.id !== id));
    toast.info("Consignação removida (o veículo permanece no estoque).");
  };

  const handleUpdateStatus = async (id: string, newStatus: ConsignacaoItem["status"]) => {
    if (!supabase) return;
    const { status: dbStatus, repasse_realizado } = statusParaColunas(newStatus);
    const { error } = await supabase
      .from("imobiliario_veiculos")
      .update({ status: dbStatus, repasse_realizado })
      .eq("id", id);
    if (error) { toast.error(`Erro ao atualizar status: ${friendlyError(error)}`); return; }
    setConsignacoes(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
    toast.success(`Status atualizado para: ${newStatus}`);
  };

  const filtered = consignacoes.filter(c => {
    const matchSearch = (
      c.veiculo.toLowerCase().includes(search.toLowerCase()) ||
      c.consignante.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = filterStatus === "Todos" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalEstoque = consignacoes.reduce((s, c) => s + c.valorPedido, 0);

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.info("Nenhuma consignação para exportar.");
      return;
    }
    const headers = ["Veículo", "Consignante", "Telefone", "Valor Pedido", "Comissão (%)", "Valor Repasse", "Status", "Data"];
    const rows = filtered.map(c => [
      `"${c.veiculo.replace(/"/g, '""')}"`,
      `"${c.consignante.replace(/"/g, '""')}"`,
      `"${c.telefone}"`,
      c.valorPedido,
      c.comissaoPercentual,
      c.repasseCombinado,
      `"${c.status}"`,
      `"${c.data}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `consignacoes_veiculos_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Consignações exportadas com sucesso!");
  };

  return (
    <PageContainer
      title="Veículos em Consignação & Repasses"
      description="Contratos de consignação, comissão retida e cálculo automático de repasse ao proprietário."
      actions={
        <div className="flex items-center gap-2">
          <Button onClick={handleExportCSV} variant="outline" className="h-9 px-3.5 text-xs font-bold gap-1.5 border-[var(--color-border-default)]">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
          <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Nova Consignação
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="autoConsignacoes"
        className="mb-4"
        kpis={[
          { label: "Veículos Consignados", value: filtered.length, icon: Handshake, tone: "primary" },
          { label: "Valor em Pátio", value: `R$ ${(filtered.reduce((s, c) => s + c.valorPedido, 0) / 1e6).toFixed(2)}M`, icon: DollarSign, tone: "accent" },
          { label: "Em Negociação", value: filtered.filter(c => c.status === "Em Negociação").length, icon: Clock, tone: "info" },
          { label: "Repasses Pendentes", value: filtered.filter(c => c.status === "Vendido / Repasse Pendente").length, icon: Clock, tone: "warning" },
        ]}
        activeCount={(search ? 1 : 0) + (filterStatus !== "Todos" ? 1 : 0)}
        onClear={() => { setSearch(""); setFilterStatus("Todos"); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por veículo ou consignante..." />
          <FilterChips value={filterStatus} onChange={setFilterStatus} allValue="Todos" options={["No Pátio", "Em Negociação", "Vendido / Repasse Pendente", "Repassado & Finalizado"]} />
        </FilterBar>
      </KpiFilterCard>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(c => (
          <div key={c.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{c.veiculo}</h4>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/25">
                  Comissão: {c.comissaoAgencia}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">Data: {c.data}</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Proprietário: <strong className="text-[var(--color-text-primary)]">{c.consignante}</strong> {c.telefone && `(${c.telefone})`} • Pedido: R$ {c.valorPedido.toLocaleString("pt-BR")} • Repasse Líquido: <span className="text-emerald-500 font-bold">R$ {c.repasseCombinado.toLocaleString("pt-BR")}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={c.status}
                onChange={e => handleUpdateStatus(c.id, e.target.value as any)}
                className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
              >
                <option value="No Pátio">No Pátio</option>
                <option value="Em Negociação">Em Negociação</option>
                <option value="Vendido / Repasse Pendente">Vendido / Repasse Pendente</option>
                <option value="Repassado & Finalizado">Repassado & Finalizado</option>
              </select>

              <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhuma consignação encontrada para este filtro.
          </div>
        )}
      </div>

      {/* Modal de Nova Consignação */}
      {/* Standardized Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
              <Handshake className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Nova Consignação de Veículo</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Cadastre o veículo e comissão acordada com o proprietário</p>
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
              form="form-consignacao"
              className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
            >
              Registrar Consignação
            </Button>
          </div>
        }
      >
        <form id="form-consignacao" onSubmit={handleCreate} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Marca</label>
              <input
                type="text"
                required
                placeholder="Ex: BMW"
                value={marca}
                onChange={e => setMarca(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Modelo</label>
              <input
                type="text"
                required
                placeholder="Ex: X1 sDrive20i GP 2022"
                value={veiculo}
                onChange={e => setVeiculo(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Proprietário Consignante</label>
              <input
                type="text"
                required
                placeholder="Nome completo"
                value={consignante}
                onChange={e => setConsignante(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Telefone</label>
              <input
                type="text"
                placeholder="(11) 90000-0000"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Preço Pretendido (R$)</label>
              <input
                type="text"
                required
                placeholder="Ex: 190.000"
                value={valorPedido}
                onChange={e => setValorPedido(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Comissão Loja (%)</label>
              <input
                type="number"
                min="1"
                max="30"
                value={comissaoPercent}
                onChange={e => setComissaoPercent(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
