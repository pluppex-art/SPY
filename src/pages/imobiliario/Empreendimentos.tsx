import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Building2, Plus, Search, MapPin, DollarSign,
  TrendingUp, CheckCircle2, ArrowRight, Trash2, X, Download
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useIbgeLocalidades } from "../../lib/ibgeLocalidades";

interface EmpreendimentoItem {
  id: string;
  nome: string;
  construtora: string;
  cidade: string;
  totalUnidades: number;
  unidadesDisponiveis: number;
  vgvTotal: number;
  status: "Lançamento" | "Em Obras" | "Pronto para Morar" | "100% Vendido";
  entrega: string;
}

function rowToEmpreendimento(row: any): EmpreendimentoItem {
  return {
    id: row.id,
    nome: row.nome,
    construtora: row.construtora || "",
    cidade: row.cidade || "",
    totalUnidades: row.total_unidades ?? 0,
    unidadesDisponiveis: row.unidades_disponiveis ?? 0,
    vgvTotal: Number(row.vgv_total) || 0,
    status: row.status,
    entrega: row.entrega || "",
  };
}

export default function Empreendimentos() {
  const { activeTenantId } = useAuth();

  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoItem[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("imobiliario_empreendimentos")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data) {
        setEmpreendimentos(data.map(rowToEmpreendimento));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterCidade, setFilterCidade] = useState("");
  const [filterConstrutora, setFilterConstrutora] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [nome, setNome] = useState("");
  const [construtora, setConstrutora] = useState("");
  // `cidade` continua salva como uma string combinada "Cidade - UF" (mesmo
  // formato já usado na coluna — sem mudança de schema); estadoUf/cidadeNome
  // só existem pra alimentar os selects do IBGE e são combinados no submit.
  const [estadoUf, setEstadoUf] = useState("");
  const [cidadeNome, setCidadeNome] = useState("");
  const { estados, municipios, loadingMunicipios } = useIbgeLocalidades(estadoUf);
  const [totalUnidades, setTotalUnidades] = useState("50");
  const [unidadesDisponiveis, setUnidadesDisponiveis] = useState("50");
  const [vgvTotal, setVgvTotal] = useState("");
  const [status, setStatus] = useState<EmpreendimentoItem["status"]>("Lançamento");
  const [entrega, setEntrega] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe o nome do empreendimento.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const numTot = parseInt(totalUnidades, 10) || 1;
    const numDisp = parseInt(unidadesDisponiveis, 10) || numTot;
    const numVgv = parseFloat(vgvTotal.replace(/[^\d]/g, "")) || 0;

    const { data, error } = await supabase
      .from("imobiliario_empreendimentos")
      .insert({
        tenant_id: activeTenantId,
        nome: nome.trim(),
        construtora: construtora.trim() || "Incorporadora Interna",
        cidade: cidadeNome.trim() && estadoUf ? `${cidadeNome.trim()} - ${estadoUf}` : (cidadeNome.trim() || ""),
        total_unidades: numTot,
        unidades_disponiveis: numDisp,
        vgv_total: numVgv,
        status,
        entrega: entrega.trim() || "A definir",
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      toast.error("Erro ao cadastrar empreendimento.");
      return;
    }

    setEmpreendimentos(prev => [rowToEmpreendimento(data), ...prev]);
    toast.success("Empreendimento cadastrado com sucesso!");
    setModalOpen(false);

    setNome("");
    setConstrutora("");
    setEstadoUf("");
    setCidadeNome("");
    setVgvTotal("");
    setEntrega("");
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const empreendimento = empreendimentos.find(e => e.id === id);
    if (!(await confirmDialog({
      title: "Excluir empreendimento",
      description: `Excluir o empreendimento "${empreendimento?.nome || "selecionado"}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("imobiliario_empreendimentos").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover empreendimento."); return; }
    setEmpreendimentos(prev => prev.filter(e => e.id !== id));
    toast.info("Empreendimento removido.");
  };

  const filtered = empreendimentos.filter(e => {
    const matchSearch = (
      e.nome.toLowerCase().includes(search.toLowerCase()) ||
      e.cidade.toLowerCase().includes(search.toLowerCase()) ||
      e.construtora.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = filterStatus === "Todos" || e.status === filterStatus;
    const matchCidade = !filterCidade || e.cidade === filterCidade;
    const matchConstrutora = !filterConstrutora || e.construtora === filterConstrutora;
    return matchSearch && matchStatus && matchCidade && matchConstrutora;
  });

  const cidadesList = Array.from(new Set(empreendimentos.map(e => e.cidade).filter(Boolean))).sort();
  const construtorasList = Array.from(new Set(empreendimentos.map(e => e.construtora).filter(Boolean))).sort();
  const vgvTotalGeral = filtered.reduce((s, e) => s + e.vgvTotal, 0);
  const unidadesTotalDisp = filtered.reduce((s, e) => s + e.unidadesDisponiveis, 0);

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.info("Nenhum empreendimento para exportar.");
      return;
    }
    const headers = ["Nome Empreendimento", "Construtora", "Cidade / UF", "VGV Total (R$)", "Total Unidades", "Unidades Disponíveis", "Previsão Entrega", "Status"];
    const rows = filtered.map(e => [
      `"${e.nome.replace(/"/g, '""')}"`,
      `"${e.construtora.replace(/"/g, '""')}"`,
      `"${e.cidade.replace(/"/g, '""')}"`,
      e.vgvTotal,
      e.totalUnidades,
      e.unidadesDisponiveis,
      `"${e.entrega}"`,
      `"${e.status}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `empreendimentos_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Empreendimentos exportados com sucesso!");
  };

  return (
    <PageContainer
      title="Empreendimentos & Lançamentos"
      description="Gerenciamento de torres, condomínios fechados, espelho de vendas e tabelas de construtoras."
      actions={
        <div className="flex items-center gap-2">
          <Button onClick={handleExportCSV} variant="outline" className="h-9 px-3.5 text-xs font-bold gap-1.5 border-[var(--color-border-default)]">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
          <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Novo Empreendimento
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="imobEmpreendimentos"
        kpis={[
          { label: "Empreendimentos", value: filtered.length, icon: Building2, tone: "primary" },
          { label: "VGV Total", value: `R$ ${(vgvTotalGeral / 1e6).toFixed(1)}M`, icon: DollarSign, tone: "warning" },
          { label: "Unidades Disponíveis", value: unidadesTotalDisp, icon: CheckCircle2, tone: "success" },
          { label: "Em Obras", value: filtered.filter(e => e.status === "Em Obras").length, icon: TrendingUp, tone: "info" },
        ]}
        activeCount={(search.trim() ? 1 : 0) + (filterStatus !== "Todos" ? 1 : 0) + (filterCidade ? 1 : 0) + (filterConstrutora ? 1 : 0)}
        onClear={() => { setSearch(""); setFilterStatus("Todos"); setFilterCidade(""); setFilterConstrutora(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por nome, cidade ou construtora..." />
          <FilterSelect icon={MapPin} value={filterCidade} onChange={setFilterCidade} options={cidadesList} allLabel="Todas as cidades" />
          <FilterSelect icon={Building2} value={filterConstrutora} onChange={setFilterConstrutora} options={construtorasList} allLabel="Todas as construtoras" />
          <FilterChips value={filterStatus} onChange={setFilterStatus} allValue="Todos" options={["Lançamento", "Em Obras", "Pronto para Morar", "100% Vendido"]} />
        </FilterBar>
      </KpiFilterCard>

      <div className="mt-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(emp => (
          <div key={emp.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/50 transition-all flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  {emp.status}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{emp.entrega}</span>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(emp.id)} className="h-6 w-6 p-0 text-red-500 hover:bg-red-500/10 rounded-lg">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <h4 className="text-sm font-bold text-[var(--color-text-primary)] mb-0.5">{emp.nome}</h4>
              <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mb-4">
                <MapPin className="w-3.5 h-3.5 shrink-0" /> {emp.cidade} • {emp.construtora}
              </p>

              <div className="space-y-2 p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-xs mb-4">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Unidades Restantes:</span>
                  <strong className="text-[var(--color-text-primary)]">{emp.unidadesDisponiveis} de {emp.totalUnidades}</strong>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--color-surface)] overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${((emp.totalUnidades - emp.unidadesDisponiveis) / emp.totalUnidades) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--color-text-muted)]">VGV Estimado:</span>
                  <strong className="text-amber-500">R$ {(emp.vgvTotal / 1e6).toFixed(1)}M</strong>
                </div>
              </div>
            </div>

            <Button size="sm" variant="outline" onClick={() => toast.success(`Espelho de vendas do ${emp.nome} aberto.`)} className="w-full h-8 text-xs font-bold gap-1 rounded-xl">
              Ver Espelho de Vendas <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhum empreendimento encontrado para este filtro.
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
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Novo Empreendimento</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Cadastre lançamentos imobiliários e controle de VGV</p>
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
              form="form-empreendimento"
              className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
            >
              Cadastrar Empreendimento
            </Button>
          </div>
        }
      >
        <form id="form-empreendimento" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Nome do Empreendimento</label>
            <input
              type="text"
              required
              placeholder="Ex: Reserva Imperial Towers"
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Construtora</label>
              <input
                type="text"
                placeholder="Nome da incorporadora"
                value={construtora}
                onChange={e => setConstrutora(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Estado (UF)</label>
              <select
                value={estadoUf}
                onChange={e => { setEstadoUf(e.target.value); setCidadeNome(""); }}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] uppercase"
              >
                <option value="">Selecione...</option>
                {estados.map((uf) => <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Cidade</label>
              {estadoUf && municipios.length > 0 ? (
                <select
                  value={cidadeNome}
                  onChange={e => setCidadeNome(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                >
                  <option value="">{loadingMunicipios ? "Carregando..." : "Selecione..."}</option>
                  {municipios.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder={estadoUf ? "Digite a cidade" : "Escolha o estado primeiro"}
                  value={cidadeNome}
                  onChange={e => setCidadeNome(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Total de Unidades</label>
              <input
                type="number"
                min="1"
                value={totalUnidades}
                onChange={e => setTotalUnidades(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Unidades Disponíveis</label>
              <input
                type="number"
                min="0"
                value={unidadesDisponiveis}
                onChange={e => setUnidadesDisponiveis(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">VGV Total (R$)</label>
              <input
                type="text"
                placeholder="Ex: 85.000.000"
                value={vgvTotal}
                onChange={e => setVgvTotal(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Previsão de Entrega</label>
              <input
                type="text"
                placeholder="Ex: Dez/2027"
                value={entrega}
                onChange={e => setEntrega(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Fase da Obra</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            >
              <option value="Lançamento">Lançamento</option>
              <option value="Em Obras">Em Obras</option>
              <option value="Pronto para Morar">Pronto para Morar</option>
              <option value="100% Vendido">100% Vendido</option>
            </select>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
