import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState, useEffect } from "react";
import { readKanbanConfig, KANBAN_KEYS, KANBAN_COR_DOT } from "../../hooks/useKanbanConfig";
import { Layers, FileSearch, Star, Download, Plus, List as ListIcon, LayoutGrid } from "lucide-react";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { exportToCSV } from "../../lib/exportCsv";
import { NovoConteudoModal } from "../../components/ui/modals/education/NovoConteudoModal";
import { ConteudoKPIs } from "./components/Conteudo/ConteudoKPIs";
import { ConteudoFilters } from "./components/Conteudo/ConteudoFilters";
import { ConteudoTable } from "./components/Conteudo/ConteudoTable";
import { ConteudoKanban } from "./components/Conteudo/ConteudoKanban";
import { useData } from "../../contexts/DataContext";
import type { DropResult } from "@hello-pangea/dnd";

interface ContentItem {
  id: string;
  title: string;
  type: "Video" | "PDF" | "Quiz" | "Artigo";
  module: string;
  course: string;
  duration?: string;
  lastUpdate: string;
  accessCount: number;
  status: "Publicado" | "Rascunho" | "Em Revisão" | "Arquivado";
}

function rowToContent(r: any): ContentItem {
  return {
    id: r.id, title: r.title, type: r.type, module: r.module || "", course: r.course || "",
    duration: r.duration || undefined, lastUpdate: r.last_update || "", accessCount: r.access_count || 0,
    status: r.status,
  };
}

export default function Conteudo() {
  const { educationContent, addEducationContent, updateEducationContent, appSettings, ensureNicheModulesLoaded } = useData();
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);
  const [viewMode, setViewMode] = useState<"Table" | "Kanban">("Kanban");
  const content: ContentItem[] = educationContent.map(rowToContent);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCurso, setFilterCurso] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as ContentItem["status"];
    updateEducationContent(result.draggableId, { status: newStatus });
    toast.success(`Material movido para ${newStatus}`);
  };

  const handleOpenEdit = (item: ContentItem) => { setEditingItem(item); setIsModalOpen(true); };
  const handleClose = () => { setIsModalOpen(false); setEditingItem(null); };

  const handleSubmit = (data: { title: string; type: ContentItem["type"]; duration: string; course: string; module: string; status: ContentItem["status"] }) => {
    if (editingItem) {
      updateEducationContent(editingItem.id, { ...data, duration: data.duration || null });
      toast.success("Material atualizado com sucesso!");
    } else {
      addEducationContent({
        ...data,
        duration: data.duration || null,
        last_update: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }),
        access_count: 0,
      });
      toast.success("Material adicionado com sucesso!");
    }
    handleClose();
  };

  const typeMap: Record<string, string> = { "Vídeo": "Video", "PDF": "PDF", "Quiz": "Quiz", "Artigo": "Artigo" };
  const filteredContent = content.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.course.toLowerCase().includes(search.toLowerCase()) ||
      c.module.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterCurso && c.course !== filterCurso) return false;
    if (selectedCategory === "Todos") return true;
    return c.type === typeMap[selectedCategory];
  });
  const cursoOpcoes = Array.from(new Set(content.map(c => c.course).filter(Boolean))).sort();

  const columns = readKanbanConfig(appSettings, KANBAN_KEYS.educacao).map(c => ({
    id: c.id as ContentItem["status"],
    label: c.nome,
    dotColor: KANBAN_COR_DOT[c.cor] ?? KANBAN_COR_DOT.slate,
  }));

  const handleExport = () => {
    if (filteredContent.length === 0) { toast.error("Nenhum material para exportar."); return; }
    exportToCSV(filteredContent.map(c => ({
      Título: c.title, Tipo: c.type, Curso: c.course, Módulo: c.module,
      Duração: c.duration || "", Status: c.status, "Última Atualização": c.lastUpdate,
    })), `conteudo_educacional_${Date.now()}`);
    toast.success("CSV exportado.");
  };

  return (
    <PageContainer
      title="Repositório de Conteúdo S.P.Y."
      description="Gestão centralizada de ativos educacionais e trilhas de aprendizagem de alta performance."
      actions={
        <div className="flex items-center gap-3">
          <Button onClick={handleExport} variant="outline" className="border-white/10 text-[10px] font-black uppercase tracking-widest h-11 px-6 rounded-2xl gap-2">
            <Download className="w-4 h-4" /> Exportar Lote
          </Button>
          <Button
            onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
            className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white h-11 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-blue-600/20"
          >
            <Plus className="w-4 h-4 mr-2" /> Novo Material
          </Button>
        </div>
      }
    >
      <div className="max-w-[1700px] mx-auto space-y-6 pb-10">
        <KpiFilterCard
          id="eduConteudo"
          kpis={[
            { label: "Ativos Totais", value: filteredContent.length, icon: Layers, tone: "primary" },
            { label: "Em Revisão", value: filteredContent.filter(c => c.status === "Em Revisão").length, icon: FileSearch, tone: "info" },
            { label: "Publicados", value: filteredContent.filter(c => c.status === "Publicado").length, icon: Star, tone: "success" },
            { label: "Em Rascunho", value: filteredContent.filter(c => c.status === "Rascunho").length, icon: Download, tone: "warning" },
          ]}
          activeCount={(search ? 1 : 0) + (selectedCategory !== "Todos" ? 1 : 0) + (filterStatus ? 1 : 0) + (filterCurso ? 1 : 0)}
          onClear={() => { setSearch(""); setSelectedCategory("Todos"); setFilterStatus(""); setFilterCurso(""); }}
        >
          <FilterBar>
            <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por título, curso ou módulo..." />
            <FilterSelect icon={Layers} value={filterStatus} onChange={setFilterStatus} allLabel="Todos os status" options={["Publicado", "Rascunho", "Em Revisão", "Arquivado"]} />
            <FilterSelect icon={Star} value={filterCurso} onChange={setFilterCurso} allLabel="Todos os cursos" options={cursoOpcoes} />
            <FilterChips value={selectedCategory} onChange={setSelectedCategory} allValue="Todos" options={["Vídeo", "PDF", "Quiz", "Artigo"]} />
            <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
              {([["Table", ListIcon], ["Kanban", LayoutGrid]] as const).map(([mode, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  title={mode === "Table" ? "Tabela" : "Kanban"}
                  onClick={() => setViewMode(mode)}
                  className={`p-1.5 rounded cursor-pointer ${viewMode === mode ? "bg-[var(--color-primary-blue)] text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          </FilterBar>
        </KpiFilterCard>
        {viewMode === "Table" ? (
          <ConteudoTable items={filteredContent} onEdit={handleOpenEdit} />
        ) : (
          <ConteudoKanban columns={columns} items={filteredContent} onDragEnd={handleDragEnd} onEdit={handleOpenEdit} />
        )}
      </div>
      <NovoConteudoModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onSubmit={handleSubmit}
        editingTitle={editingItem?.title}
        initialValues={editingItem ? {
          title: editingItem.title, type: editingItem.type,
          duration: editingItem.duration || "", course: editingItem.course,
          module: editingItem.module, status: editingItem.status,
        } : undefined}
      />
    </PageContainer>
  );
}
