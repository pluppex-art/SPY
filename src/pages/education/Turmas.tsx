import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState, useEffect } from "react";
import { GraduationCap, Users, BookOpen, CheckCircle2, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import EducationTurmaDetalhes from "./EducationTurmaDetalhes";
import { useData } from "../../contexts/DataContext";
import { PageContainer } from "../../components/PageContainer";
import { toast } from "sonner";
import { NovaTurmaModal } from "../../components/ui/modals/education/NovaTurmaModal";
import { TurmasKPIs } from "./components/Turmas/TurmasKPIs";
import { TurmasFilters } from "./components/Turmas/TurmasFilters";
import { TurmasGrid } from "./components/Turmas/TurmasGrid";

interface Turma {
  id: string;
  name: string;
  instructor: string;
  subject: string;
  students: number;
  capacity: number;
  status: "Ativa" | "Planejamento" | "Concluída";
  startDate: string;
  shift: "Manhã" | "Tarde" | "Noite";
  progress: number;
}

export default function Turmas() {
  const { turmas: rawTurmas, addTurma, students, ensureNicheModulesLoaded } = useData();
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTurno, setFilterTurno] = useState("");
  const [filterCurso, setFilterCurso] = useState("");
  const [selectedTurma, setSelectedTurma] = useState<Turma | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const turmas: Turma[] = rawTurmas.map(t => ({
    id: t.id,
    name: t.nome || t.name,
    instructor: t.professor || t.instructor || "Não definido",
    subject: t.curso || t.subject || "Geral",
    // `turmas` não tem coluna `students` — matrícula é a tabela real `students`,
    // ligada por `turma_id`.
    students: students.filter((s: any) => s.turma_id === t.id).length,
    capacity: t.vagas || t.capacity || 0,
    status: (t.status as any) || "Planejamento",
    startDate: t.data_inicio || t.startDate || "",
    shift: t.shift || "Manhã",
    progress: t.progress || 0,
  }));

  if (selectedTurma) {
    const turmaStudents = students
      .filter((s: any) => s.turma_id === selectedTurma.id)
      .map((s: any) => ({
        id: s.id,
        name: s.nome || s.name || "",
        status: (s.status === "Ativo" ? "active" : s.status === "Inativo" ? "completed" : "onboarding") as any,
        progress: s.progress || 0,
      }));
    return (
      <EducationTurmaDetalhes
        turma={{ id: selectedTurma.id, nome: selectedTurma.name, curso: selectedTurma.subject, instrutor: selectedTurma.instructor }}
        students={turmaStudents}
        onBack={() => setSelectedTurma(null)}
      />
    );
  }

  const cursoOpcoes = Array.from(new Set(turmas.map(t => t.subject).filter(Boolean))).sort();
  const filteredTurmas = turmas.filter(t =>
    (t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.instructor.toLowerCase().includes(search.toLowerCase()) ||
    t.subject.toLowerCase().includes(search.toLowerCase())) &&
    (!filterStatus || t.status === filterStatus) &&
    (!filterTurno || t.shift === filterTurno) &&
    (!filterCurso || t.subject === filterCurso)
  );
  const turmasAtivas = filteredTurmas.filter(t => t.status === "Ativa").length;
  const totalAlunos = filteredTurmas.reduce((acc, t) => acc + (t.students || 0), 0);
  const totalVagas = filteredTurmas.reduce((acc, t) => acc + (t.capacity || 0), 0);
  const vagasDisponiveis = filteredTurmas.reduce((acc, t) => acc + Math.max(0, (t.capacity || 0) - (t.students || 0)), 0);
  const ocupacao = totalVagas === 0 ? "—" : `${Math.round((totalAlunos / totalVagas) * 100)}%`;

  return (
    <PageContainer
      title="Gestão de Turmas S.P.Y."
      description="Controle pedagógico, alocação de instrutores e monitoramento de vagas em tempo real."
      actions={
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => setIsModalOpen(true)}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Nova Turma
          </Button>
        </div>
      }
    >
      <div className="max-w-[1700px] mx-auto space-y-6 pb-12">
        <KpiFilterCard
          id="eduTurmas"
          kpis={[
            { label: "Turmas Ativas", value: turmasAtivas, icon: GraduationCap, tone: "primary" },
            { label: "Alunos Matriculados", value: totalAlunos.toLocaleString("pt-BR"), icon: Users, tone: "success" },
            { label: "Vagas Disponíveis", value: vagasDisponiveis, icon: BookOpen, tone: "accent" },
            { label: "Ocupação", value: ocupacao, icon: CheckCircle2, tone: "warning" },
          ]}
          activeCount={(search ? 1 : 0) + (filterStatus ? 1 : 0) + (filterTurno ? 1 : 0) + (filterCurso ? 1 : 0)}
          onClear={() => { setSearch(""); setFilterStatus(""); setFilterTurno(""); setFilterCurso(""); }}
        >
          <FilterBar>
            <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por turma, curso ou professor..." />
            <FilterSelect icon={BookOpen} value={filterCurso} onChange={setFilterCurso} allLabel="Todos os cursos" options={cursoOpcoes} />
            <FilterSelect icon={Users} value={filterTurno} onChange={setFilterTurno} allLabel="Todos os turnos" options={["Manhã", "Tarde", "Noite"]} />
            <FilterChips value={filterStatus} onChange={setFilterStatus} options={["Ativa", "Planejamento", "Concluída"]} />
          </FilterBar>
        </KpiFilterCard>
        <TurmasGrid turmas={filteredTurmas} onSelect={setSelectedTurma} />
      </div>

      <NovaTurmaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={(data) => {
          addTurma({
            id: Math.random().toString(36).substring(2, 9),
            nome: data.nome, curso: data.curso,
            professor: data.professor || "Não definido",
            vagas: parseInt(data.vagas) || 30,
            shift: data.shift, data_inicio: data.data_inicio,
            status: "Planejamento", progress: 0,
          });
          toast.success("Turma criada com sucesso!");
          setIsModalOpen(false);
        }}
      />
    </PageContainer>
  );
}
