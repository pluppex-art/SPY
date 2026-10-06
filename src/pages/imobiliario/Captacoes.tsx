import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  ClipboardList, Plus, Search, MapPin, DollarSign,
  User, CheckCircle2, Clock, Trash2, X, Filter, Download
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

interface CaptacaoItem {
  id: string;
  endereco: string;
  tipo: string;
  valorPretendido: number;
  corretor: string;
  proprietario: string;
  telefone: string;
  status: "Em Avaliação" | "Contrato de Posse" | "Fotos & Vistoria" | "Ativo no Catálogo" | "Recusado";
  data: string;
}

function rowToCaptacao(row: any): CaptacaoItem {
  return {
    id: row.id,
    endereco: row.endereco,
    tipo: row.tipo,
    valorPretendido: Number(row.valor_pretendido) || 0,
    corretor: row.corretor || "",
    proprietario: row.proprietario || "",
    telefone: row.telefone || "",
    status: row.status,
    data: row.data ? new Date(row.data + "T00:00:00").toLocaleDateString("pt-BR") : "",
  };
}

export default function Captacoes() {
  const { activeTenantId } = useAuth();

  const [captacoes, setCaptacoes] = useState<CaptacaoItem[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("imobiliario_captacoes")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data) {
        setCaptacoes(data.map(rowToCaptacao));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterCorretor, setFilterCorretor] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [endereco, setEndereco] = useState("");
  const [tipo, setTipo] = useState("Apartamento");
  const [valor, setValor] = useState("");
  const [corretor, setCorretor] = useState("");
  const [proprietario, setProprietario] = useState("");
  const [telefone, setTelefone] = useState("");
  const [status, setStatus] = useState<CaptacaoItem["status"]>("Em Avaliação");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endereco.trim()) {
      toast.error("Informe o endereço do imóvel.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const numVal = parseFloat(valor.replace(/[^\d]/g, "")) || 0;

    const { data, error } = await supabase
      .from("imobiliario_captacoes")
      .insert({
        tenant_id: activeTenantId,
        endereco: endereco.trim(),
        tipo,
        valor_pretendido: numVal,
        corretor: corretor.trim() || "Corretor Interno",
        proprietario: proprietario.trim() || "Proprietário Não Identificado",
        telefone: telefone.trim(),
        status,
        data: new Date().toISOString().split("T")[0],
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      toast.error("Erro ao registrar captação.");
      return;
    }

    setCaptacoes(prev => [rowToCaptacao(data), ...prev]);
    toast.success("Captação registrada com sucesso!");
    setModalOpen(false);
    // Reset form
    setEndereco("");
    setValor("");
    setCorretor("");
    setProprietario("");
    setTelefone("");
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const captacao = captacoes.find(c => c.id === id);
    if (!(await confirmDialog({
      title: "Excluir captação",
      description: `Excluir a captação de "${captacao?.endereco || "este imóvel"}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("imobiliario_captacoes").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover captação."); return; }
    setCaptacoes(prev => prev.filter(c => c.id !== id));
    toast.info("Captação removida.");
  };

  const handleUpdateStatus = async (id: string, newStatus: CaptacaoItem["status"]) => {
    if (!supabase) return;
    const { error } = await supabase.from("imobiliario_captacoes").update({ status: newStatus }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status."); return; }
    setCaptacoes(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
    toast.success(`Status atualizado para: ${newStatus}`);
  };

  const filtered = captacoes.filter(c => {
    const matchSearch = (
      c.endereco.toLowerCase().includes(search.toLowerCase()) ||
      c.corretor.toLowerCase().includes(search.toLowerCase()) ||
      c.proprietario.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = filterStatus === "Todos" || c.status === filterStatus;
    const matchTipo = !filterTipo || c.tipo === filterTipo;
    const matchCorretor = !filterCorretor || c.corretor === filterCorretor;
    return matchSearch && matchStatus && matchTipo && matchCorretor;
  });

  const tiposList = Array.from(new Set(captacoes.map(c => c.tipo).filter(Boolean))).sort();
  const corretoresList = Array.from(new Set(captacoes.map(c => c.corretor).filter(Boolean))).sort();
  const totalVGV = filtered.reduce((acc, c) => acc + c.valorPretendido, 0);

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.info("Nenhuma captação para exportar.");
      return;
    }
    const headers = ["Endereço", "Tipo", "Proprietário", "Telefone", "Corretor Responsável", "Valor Pretendido", "Status", "Data Captação"];
    const rows = filtered.map(c => [
      `"${c.endereco.replace(/"/g, '""')}"`,
      `"${c.tipo}"`,
      `"${c.proprietario.replace(/"/g, '""')}"`,
      `"${c.telefone}"`,
      `"${c.corretor.replace(/"/g, '""')}"`,
      c.valorPretendido,
      `"${c.status}"`,
      `"${c.data}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `captacoes_imoveis_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Captações exportadas com sucesso!");
  };

  return (
    <PageContainer
      title="Captações de Imóveis"
      description="Esteira de entrada, avaliação de mercado, documentação e inclusão de novos imóveis ao portfólio."
      actions={
        <div className="flex items-center gap-2">
          <Button onClick={handleExportCSV} variant="outline" className="h-9 px-3.5 text-xs font-bold gap-1.5 border-[var(--color-border-default)]">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
          <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Nova Captação
          </Button>
        </div>
      }
    >
      <KpiFilterCard className="mb-4"
        id="imobCaptacoes"
        kpis={[
          { label: "Captações", value: filtered.length, icon: ClipboardList, tone: "primary" },
          { label: "VGV Pretendido", value: `R$ ${(totalVGV / 1e6).toFixed(2)}M`, icon: DollarSign, tone: "warning" },
          { label: "Em andamento", value: filtered.filter(c => c.status !== "Ativo no Catálogo" && c.status !== "Recusado").length, icon: Clock, tone: "info" },
          { label: "Taxa de Conclusão", value: filtered.length > 0 ? `${Math.round((filtered.filter(c => c.status === "Ativo no Catálogo").length / filtered.length) * 100)}%` : "0%", icon: CheckCircle2, tone: "success" },
        ]}
        activeCount={(search.trim() ? 1 : 0) + (filterStatus !== "Todos" ? 1 : 0) + (filterTipo ? 1 : 0) + (filterCorretor ? 1 : 0)}
        onClear={() => { setSearch(""); setFilterStatus("Todos"); setFilterTipo(""); setFilterCorretor(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por endereço, corretor ou proprietário..." />
          <FilterSelect icon={MapPin} value={filterTipo} onChange={setFilterTipo} options={tiposList} allLabel="Todos os tipos" />
          <FilterSelect icon={User} value={filterCorretor} onChange={setFilterCorretor} options={corretoresList} allLabel="Todos os corretores" />
          <FilterChips
            value={filterStatus}
            onChange={setFilterStatus}
            allValue="Todos"
            options={["Em Avaliação", "Contrato de Posse", "Fotos & Vistoria", "Ativo no Catálogo", "Recusado"]}
          />
        </FilterBar>
      </KpiFilterCard>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(c => (
          <div key={c.id} className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--color-text-primary)]">{c.endereco}</span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                  {c.tipo}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">Data: {c.data}</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Pretensão: <strong className="text-[var(--color-text-primary)]">R$ {c.valorPretendido.toLocaleString("pt-BR")}</strong> • Proprietário: {c.proprietario} {c.telefone && `(${c.telefone})`} • Corretor: {c.corretor}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={c.status}
                onChange={e => handleUpdateStatus(c.id, e.target.value as any)}
                className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
              >
                <option value="Em Avaliação">Em Avaliação</option>
                <option value="Contrato de Posse">Contrato de Posse</option>
                <option value="Fotos & Vistoria">Fotos & Vistoria</option>
                <option value="Ativo no Catálogo">Ativo no Catálogo</option>
                <option value="Recusado">Recusado</option>
              </select>

              <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 rounded-xl">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhuma captação encontrada para este filtro.
          </div>
        )}
      </div>

      {/* Standardized Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Nova Captação de Imóvel</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Cadastre o imóvel em prospecção para o portfólio</p>
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
              form="form-captacao"
              className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
            >
              Registrar Captação
            </Button>
          </div>
        }
      >
        <form id="form-captacao" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Endereço Completo</label>
            <input
              type="text"
              required
              placeholder="Ex: Av. Paulista, 1000 - Bela Vista"
              value={endereco}
              onChange={e => setEndereco(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Tipo de Imóvel</label>
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              >
                <option value="Apartamento">Apartamento</option>
                <option value="Casa">Casa</option>
                <option value="Cobertura">Cobertura</option>
                <option value="Comercial">Comercial</option>
                <option value="Terreno">Terreno</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Valor Pretendido (R$)</label>
              <input
                type="text"
                placeholder="Ex: 850.000"
                value={valor}
                onChange={e => setValor(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Proprietário</label>
              <input
                type="text"
                placeholder="Nome completo"
                value={proprietario}
                onChange={e => setProprietario(e.target.value)}
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
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Corretor Responsável</label>
            <input
              type="text"
              placeholder="Nome do corretor captador"
              value={corretor}
              onChange={e => setCorretor(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
