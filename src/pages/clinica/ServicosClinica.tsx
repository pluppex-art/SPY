import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Activity, Plus, DollarSign, Clock, Stethoscope,
  CheckCircle2, ShieldAlert, Trash2, X, Download
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

interface ServicoClinicoItem {
  id: string;
  nome: string;
  especialidade: string;
  duracao: string;
  valorParticular: number;
  convenios: string;
}

function rowToServico(row: any): ServicoClinicoItem {
  return {
    id: row.id,
    nome: row.nome,
    especialidade: row.especialidade || "",
    duracao: row.duracao || "",
    valorParticular: Number(row.valor_particular) || 0,
    convenios: row.convenios || "",
  };
}

export default function ServicosClinica() {
  const { activeTenantId } = useAuth();

  const [servicos, setServicos] = useState<ServicoClinicoItem[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("clinica_servicos")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data) {
        setServicos(data.map(rowToServico));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [nome, setNome] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [duracao, setDuracao] = useState("30 min");
  const [valorParticular, setValorParticular] = useState("");
  const [convenios, setConvenios] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !valorParticular) {
      toast.error("Informe o nome e o valor do procedimento.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const val = parseFloat(valorParticular.replace(/[^\d.]/g, "").replace(",", ".")) || 0;

    const { data, error } = await supabase
      .from("clinica_servicos")
      .insert({
        tenant_id: activeTenantId,
        nome: nome.trim(),
        especialidade: especialidade.trim() || "Clínica Geral",
        duracao: duracao.trim() || "30 min",
        valor_particular: val,
        convenios: convenios.trim() || "Particular",
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      toast.error("Erro ao cadastrar procedimento.");
      return;
    }

    setServicos(prev => [rowToServico(data), ...prev]);
    toast.success("Procedimento cadastrado com sucesso!");
    setModalOpen(false);

    setNome("");
    setEspecialidade("");
    setDuracao("30 min");
    setValorParticular("");
    setConvenios("");
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    const servico = servicos.find(s => s.id === id);
    if (!(await confirmDialog({
      title: "Excluir procedimento",
      description: `Excluir o procedimento "${servico?.nome || "selecionado"}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("clinica_servicos").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover procedimento."); return; }
    setServicos(prev => prev.filter(s => s.id !== id));
    toast.info("Procedimento removido da tabela.");
  };

  const handleExportCSV = () => {
    if (servicos.length === 0) {
      toast.error("Nenhum procedimento para exportar.");
      return;
    }
    const headers = ["ID", "Nome_Procedimento", "Especialidade", "Duracao", "Valor_Particular_BRL", "Convenios_Aceitos"];
    const rows = servicos.map(s => [
      s.id,
      `"${s.nome.replace(/"/g, '""')}"`,
      `"${s.especialidade.replace(/"/g, '""')}"`,
      `"${s.duracao.replace(/"/g, '""')}"`,
      s.valorParticular.toFixed(2),
      `"${s.convenios.replace(/"/g, '""')}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tabela_procedimentos_clinicos_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Tabela de procedimentos exportada com sucesso!");
  };

  const [espFilter, setEspFilter] = useState("");
  const [convenioFilter, setConvenioFilter] = useState("");
  const splitConvenios = (c: string) => c.split(",").map(x => x.trim()).filter(Boolean);
  const especialidadeOptions = Array.from(new Set(servicos.map(s => s.especialidade).filter(Boolean))).sort();
  const convenioOptions = Array.from(new Set(servicos.flatMap(s => splitConvenios(s.convenios)))).sort();
  const activeFilters = (search ? 1 : 0) + (espFilter ? 1 : 0) + (convenioFilter ? 1 : 0);
  const clearFilters = () => { setSearch(""); setEspFilter(""); setConvenioFilter(""); };

  const filtered = servicos.filter(s => (
    (!espFilter || s.especialidade === espFilter) &&
    (!convenioFilter || splitConvenios(s.convenios).includes(convenioFilter)) &&
    (s.nome.toLowerCase().includes(search.toLowerCase()) ||
    s.especialidade.toLowerCase().includes(search.toLowerCase()) ||
    s.convenios.toLowerCase().includes(search.toLowerCase()))
  ));

  return (
    <PageContainer
      title="Tabela de Procedimentos & Exames"
      description="Catálogo de consultas, terapias, exames de diagnóstico e valores particulares e convênios."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="h-9 px-3.5 text-xs font-semibold gap-1.5 border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)]"
          >
            <Download className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> Exportar CSV
          </Button>
          <Button onClick={() => setModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white">
            <Plus className="w-3.5 h-3.5" /> Novo Procedimento
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="clinicaServicos"
        className="mb-4"
        kpis={[
          { label: "Procedimentos", value: filtered.length, icon: Activity, tone: "primary" },
          { label: "Ticket Médio", value: `R$ ${(filtered.length > 0 ? filtered.reduce((sum, x) => sum + x.valorParticular, 0) / filtered.length : 0).toFixed(2)}`, icon: DollarSign, tone: "success" },
          { label: "Especialidades", value: new Set(filtered.map(s => s.especialidade).filter(Boolean)).size, icon: Stethoscope, tone: "accent" },
          { label: "Convênios Credenciados", value: new Set(filtered.flatMap(s => splitConvenios(s.convenios))).size, icon: CheckCircle2, tone: "info" },
        ]}
        activeCount={activeFilters}
        onClear={clearFilters}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por procedimento ou especialidade..." />
          <FilterSelect icon={Stethoscope} value={espFilter} onChange={setEspFilter} options={especialidadeOptions} allLabel="Todas as especialidades" />
          <FilterSelect icon={CheckCircle2} value={convenioFilter} onChange={setConvenioFilter} options={convenioOptions} allLabel="Todos os convênios" />
        </FilterBar>
      </KpiFilterCard>

      {/* Table */}
      <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)] text-[var(--color-text-muted)] font-semibold">
              <tr>
                <th className="px-4 py-3">Procedimento / Consulta</th>
                <th className="px-4 py-3">Especialidade</th>
                <th className="px-4 py-3">Tempo Estimado</th>
                <th className="px-4 py-3">Convênios Aceitos</th>
                <th className="px-4 py-3 text-right">Valor Particular</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-[var(--color-surface-sunken)]/40 transition-colors">
                  <td className="px-4 py-3.5 font-bold text-[var(--color-text-primary)]">{s.nome}</td>
                  <td className="px-4 py-3.5 text-[var(--color-text-muted)]">{s.especialidade}</td>
                  <td className="px-4 py-3.5 font-mono text-[var(--color-text-muted)]">{s.duracao}</td>
                  <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)]">{s.convenios}</td>
                  <td className="px-4 py-3.5 text-right font-bold text-emerald-500 font-mono">
                    R$ {s.valorParticular.toFixed(2)}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)} className="h-7 w-7 p-0 text-red-500 hover:bg-red-500/10 rounded-lg">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="p-8 text-center text-xs text-[var(--color-text-muted)]">
              Nenhum procedimento encontrado.
            </div>
          )}
        </div>
      </div>

      {/* Standardized Modal: Novo Procedimento */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Novo Procedimento / Exame</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Defina a precificação particular e convênios atendidos</p>
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
              form="form-servico-clinico"
              className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white"
            >
              Adicionar Procedimento
            </Button>
          </div>
        }
      >
        <form id="form-servico-clinico" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Nome do Procedimento</label>
            <input
              type="text"
              required
              placeholder="Ex: Consulta Cardiológica + Teste Ergométrico"
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Especialidade</label>
              <input
                type="text"
                placeholder="Ex: Cardiologia"
                value={especialidade}
                onChange={e => setEspecialidade(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Duração Média</label>
              <input
                type="text"
                placeholder="Ex: 40 min"
                value={duracao}
                onChange={e => setDuracao(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Valor Particular (R$)</label>
              <input
                type="text"
                required
                placeholder="Ex: 350.00"
                value={valorParticular}
                onChange={e => setValorParticular(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Convênios Aceitos</label>
              <input
                type="text"
                placeholder="Ex: Unimed, Amil, Bradesco"
                value={convenios}
                onChange={e => setConvenios(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none"
              />
            </div>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
