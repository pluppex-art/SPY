import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Wrench, CheckCircle2, Clock, Calendar, Users,
  CheckSquare, ArrowRight, ShieldCheck, Plus, Trash2, X, Search, Download
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";

interface InstalacaoSolarItem {
  id: string;
  cliente: string;
  equipe: string;
  progresso: number;
  inicio: string;
  previsaoConclusao: string;
  modulosInstalados: string;
  status: "Fixação de Estrutura" | "Passagem de Cabos" | "Instalação Inversor" | "Em Execução" | "Comissionamento" | "Obra Concluída";
}

function rowToInstalacao(row: any): InstalacaoSolarItem {
  return {
    id: row.id,
    cliente: row.cliente || "",
    equipe: row.equipe || "",
    progresso: row.progresso ?? 0,
    inicio: row.inicio ? new Date(row.inicio + "T00:00:00").toLocaleDateString("pt-BR") : "",
    previsaoConclusao: row.previsao_conclusao ? new Date(row.previsao_conclusao + "T00:00:00").toLocaleDateString("pt-BR") : "A definir",
    modulosInstalados: row.modulos_instalados || "",
    status: row.status,
  };
}

export default function InstalacoesSolar() {
  const { activeTenantId } = useAuth();

  const [instalacoes, setInstalacoes] = useState<InstalacaoSolarItem[]>([]);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("solar_instalacoes")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data) {
        setInstalacoes(data.map(rowToInstalacao));
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEquipe, setFilterEquipe] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [cliente, setCliente] = useState("");
  const [equipe, setEquipe] = useState("");
  const [progresso, setProgresso] = useState("10");
  const [inicio, setInicio] = useState("");
  const [previsaoConclusao, setPrevisaoConclusao] = useState("");
  const [modulosInstalados, setModulosInstalados] = useState("");
  const [status, setStatus] = useState<InstalacaoSolarItem["status"]>("Fixação de Estrutura");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente.trim() || !equipe.trim()) {
      toast.error("Informe o cliente e a equipe responsável.");
      return;
    }
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco de dados.");
      return;
    }

    const { data, error } = await supabase
      .from("solar_instalacoes")
      .insert({
        tenant_id: activeTenantId,
        cliente: cliente.trim(),
        equipe: equipe.trim(),
        progresso: parseInt(progresso, 10) || 0,
        inicio: inicio || new Date().toISOString().slice(0, 10),
        previsao_conclusao: previsaoConclusao || null,
        modulos_instalados: modulosInstalados.trim() || "0/0 módulos",
        status,
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      toast.error("Erro ao registrar instalação.");
      return;
    }

    setInstalacoes(prev => [rowToInstalacao(data), ...prev]);
    toast.success("Instalação registrada com sucesso!");
    setModalOpen(false);

    setCliente("");
    setEquipe("");
    setProgresso("10");
    setInicio("");
    setPrevisaoConclusao("");
    setModulosInstalados("");
  };

  const handleDelete = async (item: InstalacaoSolarItem) => {
    if (!supabase) return;
    if (!(await confirmDialog({
      title: "Excluir obra",
      description: `Excluir a obra de instalação de "${item.cliente}"? Essa ação não pode ser desfeita.`,
    }))) return;
    const { error } = await supabase.from("solar_instalacoes").delete().eq("id", item.id);
    if (error) { toast.error("Erro ao remover obra."); return; }
    setInstalacoes(prev => prev.filter(i => i.id !== item.id));
    toast.info("Obra removida.");
  };

  const handleUpdateProgress = async (id: string, newProgress: number) => {
    if (!supabase) return;
    const capped = Math.min(100, Math.max(0, newProgress));
    const current = instalacoes.find(i => i.id === id);
    const nextStatus = capped === 100 ? "Obra Concluída" : current?.status;
    const { error } = await supabase
      .from("solar_instalacoes")
      .update({ progresso: capped, status: nextStatus })
      .eq("id", id);
    if (error) { toast.error("Erro ao atualizar progresso."); return; }
    setInstalacoes(prev => prev.map(i => {
      if (i.id === id) {
        return { ...i, progresso: capped, status: (nextStatus as InstalacaoSolarItem["status"]) };
      }
      return i;
    }));
    toast.success(`Progresso atualizado para ${capped}%`);
  };

  const handleExportCSV = () => {
    if (instalacoes.length === 0) {
      toast.error("Nenhuma instalação para exportar.");
      return;
    }
    const headers = ["ID", "Cliente", "Equipe", "Progresso_Pct", "Inicio", "Previsao_Conclusao", "Modulos", "Status"];
    const rows = instalacoes.map(i => [
      i.id,
      `"${i.cliente.replace(/"/g, '""')}"`,
      `"${i.equipe.replace(/"/g, '""')}"`,
      `${i.progresso}%`,
      i.inicio,
      i.previsaoConclusao,
      `"${i.modulosInstalados.replace(/"/g, '""')}"`,
      i.status,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `instalacoes_solares_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Relatório de instalações exportado com sucesso!");
  };

  const equipes = Array.from(new Set(instalacoes.map(i => i.equipe).filter(Boolean))).sort();
  const filtered = instalacoes.filter(i => (
    (i.cliente.toLowerCase().includes(search.toLowerCase()) ||
    i.equipe.toLowerCase().includes(search.toLowerCase())) &&
    (!filterStatus || i.status === filterStatus) &&
    (!filterEquipe || i.equipe === filterEquipe)
  ));
  const progressoMedio = filtered.length ? Math.round(filtered.reduce((a, i) => a + i.progresso, 0) / filtered.length) : 0;

  return (
    <PageContainer
      title="Obras & Instalações em Andamento"
      description="Controle de cronograma de montagem, equipe de instaladores, fixação de estruturas e comissionamento."
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
            <Plus className="w-3.5 h-3.5" /> Nova Obra de Instalação
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="solarInstalacoes"
        className="mb-4"
        kpis={[
          { label: "Obras", value: filtered.length, icon: Wrench, tone: "primary" },
          { label: "Em Execução", value: filtered.filter(i => i.status !== "Obra Concluída").length, icon: Clock, tone: "warning" },
          { label: "Concluídas", value: filtered.filter(i => i.status === "Obra Concluída").length, icon: CheckCircle2, tone: "success" },
          { label: "Progresso Médio", value: `${progressoMedio}%`, icon: CheckSquare, tone: "info" },
        ]}
        activeCount={(search ? 1 : 0) + (filterStatus ? 1 : 0) + (filterEquipe ? 1 : 0)}
        onClear={() => { setSearch(""); setFilterStatus(""); setFilterEquipe(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por cliente ou equipe..." />
          <FilterSelect icon={CheckSquare} value={filterStatus} onChange={setFilterStatus} allLabel="Todas as etapas" options={["Fixação de Estrutura", "Passagem de Cabos", "Instalação Inversor", "Em Execução", "Comissionamento", "Obra Concluída"]} />
          <FilterSelect icon={Users} value={filterEquipe} onChange={setFilterEquipe} allLabel="Todas as equipes" options={equipes} />
        </FilterBar>
      </KpiFilterCard>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(i => (
          <div key={i.id} className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-xs space-y-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-bold text-[var(--color-text-primary)]">{i.cliente}</h4>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                  {i.status}
                </span>
              </div>

              <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 mb-3">
                <Users className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> {i.equipe}
              </p>

              {/* Progress */}
              <div className="space-y-1.5 mb-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--color-text-muted)]">Progresso Geral</span>
                  <span className="font-bold text-amber-500 font-mono">{i.progresso}%</span>
                </div>
                <div className="w-full h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${i.progresso}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 rounded-xl bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)]">
                <div>
                  <span className="text-[var(--color-text-muted)] block text-[10px]">Módulos</span>
                  <strong className="text-[var(--color-text-primary)] font-mono">{i.modulosInstalados}</strong>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)] block text-[10px]">Previsão</span>
                  <strong className="text-[var(--color-text-primary)]">{i.previsaoConclusao}</strong>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleUpdateProgress(i.id, i.progresso + 10)}
                  className="px-2 py-1 text-[10px] font-bold rounded-lg bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)]"
                >
                  +10%
                </button>
                <button
                  onClick={() => handleUpdateProgress(i.id, 100)}
                  className="px-2 py-1 text-[10px] font-bold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                >
                  Concluir
                </button>
              </div>

              <Button size="sm" variant="ghost" onClick={() => handleDelete(i)} className="h-7 w-7 p-0 text-red-500 hover:bg-red-500/10 rounded-lg">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full p-8 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl">
            Nenhuma instalação encontrada.
          </div>
        )}
      </div>

      {/* Standardized Modal: Nova Instalação */}
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
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Registrar Nova Instalação</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Inicie o acompanhamento de montagem e comissionamento</p>
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
              form="form-instalacao-solar"
              className="h-9 px-4 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white"
            >
              Registrar Instalação
            </Button>
          </div>
        }
      >
        <form id="form-instalacao-solar" onSubmit={handleCreate} className="space-y-3.5 py-1">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Cliente / Local</label>
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
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Equipe de Montagem</label>
            <input
              type="text"
              required
              placeholder="Ex: Equipe Delta (5 montadores)"
              value={equipe}
              onChange={e => setEquipe(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Progresso Inicial (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={progresso}
                onChange={e => setProgresso(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Módulos Instalados</label>
              <input
                type="text"
                placeholder="Ex: 24/80 módulos"
                value={modulosInstalados}
                onChange={e => setModulosInstalados(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Data Início</label>
              <input
                type="date"
                value={inicio}
                onChange={e => setInicio(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Previsão Término</label>
              <input
                type="date"
                value={previsaoConclusao}
                onChange={e => setPrevisaoConclusao(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1.5">Etapa Atual</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-amber-500"
            >
              <option value="Fixação de Estrutura">Fixação de Estrutura</option>
              <option value="Passagem de Cabos">Passagem de Cabos</option>
              <option value="Instalação Inversor">Instalação Inversor</option>
              <option value="Em Execução">Em Execução</option>
              <option value="Comissionamento">Comissionamento</option>
              <option value="Obra Concluída">Obra Concluída</option>
            </select>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
