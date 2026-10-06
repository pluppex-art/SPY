import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState, useMemo, useEffect } from "react";
import { Users, BookOpen, Target, Star, Download, UserPlus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { useData } from "../../contexts/DataContext";
import { toast } from "sonner";
import { exportToCSV } from "../../lib/exportCsv";
import { apiFetch } from "../../lib/apiClient";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { NovaMatriculaModal } from "../../components/ui/modals/education/NovaMatriculaModal";
import { supabase } from "../../lib/supabase";
import { AlunoGradesModal } from "../../components/ui/modals/education/AlunoGradesModal";
import { AlunosKPIs } from "./components/Alunos/AlunosKPIs";
import { AlunosFilters } from "./components/Alunos/AlunosFilters";
import { AlunosTable } from "./components/Alunos/AlunosTable";
import { AlunosInsight } from "./components/Alunos/AlunosInsight";
import { friendlyError } from "../../lib/friendlyError";

interface Grade { subject: string; value: number; weight: number; }
interface Student {
  id: string; name: string; email: string; phone: string;
  course: string; progress: number; status: string; avatar: string; grades: Grade[];
}

export default function Alunos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCurso, setFilterCurso] = useState("");
  const { students: rawStudents, addStudent, updateStudent, deleteStudent, turmas, ensureNicheModulesLoaded } = useData();
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isGradesModalOpen, setIsGradesModalOpen] = useState(false);

  const students: Student[] = useMemo(() => rawStudents.map(s => {
    const turma = turmas.find((t: any) => t.id === s.turma_id);
    return {
      id: s.id, name: s.nome || s.name, email: s.email || "",
      phone: s.telefone || s.phone || "", course: turma?.curso || turma?.nome || s.course || "",
      progress: s.progress || 0, status: s.status || "Ativo",
      avatar: s.avatar || "", grades: s.grades || [],
    };
  }), [rawStudents, turmas]);

  const statusOpcoes = useMemo(() => Array.from(new Set(students.map(s => s.status).filter(Boolean))).sort(), [students]);
  const cursoOpcoes = useMemo(() => Array.from(new Set(students.map(s => s.course).filter(Boolean))).sort(), [students]);

  const filteredAlunos = useMemo(() => students.filter(a =>
    (a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.course.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (!filterStatus || a.status === filterStatus) &&
    (!filterCurso || a.course === filterCurso)
  ), [students, searchTerm, filterStatus, filterCurso]);

  const handleDelete = async (id: string) => {
    const student = students.find(s => s.id === id);
    if (!(await confirmDialog({
      title: "Excluir aluno",
      description: `Excluir o aluno ${student?.name || "selecionado"}? Essa ação não pode ser desfeita.`,
    }))) return;
    deleteStudent(id);
    toast.success("Aluno removido da base.");
  };

  const handleAddGrade = (studentId: string, grade: Grade) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const grades = [...(student.grades || []), grade];
    updateStudent(studentId, { grades });
    toast.success(`Nota adicionada para ${student.name}!`);
  };

  const handleRemoveGrade = (studentId: string, index: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const grades = (student.grades || []).filter((_, i) => i !== index);
    updateStudent(studentId, { grades });
    toast.success("Nota removida.");
  };

  const handleAnalyzeAI = async (student: Student) => {
    try {
      const res = await apiFetch("/api/ai/student-performance-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: student.name, progress: student.progress, grades: student.grades }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      return data.insight || data.error || "Não foi possível gerar uma análise no momento.";
    } catch {
      return "Não foi possível gerar uma análise no momento. Tente novamente em instantes.";
    }
  };

  return (
    <PageContainer
      title="Gestão de Alunos S.P.Y."
      description="Base centralizada de matrículas, desempenho acadêmico e engajamento."
      actions={
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              if (filteredAlunos.length === 0) return toast.error("Nenhum dado para exportar");
              exportToCSV(filteredAlunos, "Alunos_SPY");
              toast.success("Download iniciado!");
            }}
            variant="outline"
            className="h-9 px-4 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            <Download className="w-3.5 h-3.5" /> Exportar Dados
          </Button>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" /> Nova Matrícula
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-w-[1700px] mx-auto pb-12">
        <KpiFilterCard
          id="eduAlunos"
          kpis={[
            { label: "Estudantes", value: filteredAlunos.length, icon: Users, tone: "primary" },
            { label: "Alunos Ativos", value: filteredAlunos.filter(s => s.status === "Ativo").length, icon: BookOpen, tone: "success" },
            { label: "Média de Progresso", value: `${filteredAlunos.length > 0 ? Math.round(filteredAlunos.reduce((a, b) => a + b.progress, 0) / filteredAlunos.length) : 0}%`, icon: Target, tone: "accent" },
            { label: "Cursos", value: new Set(filteredAlunos.map(s => s.course).filter(Boolean)).size, icon: Star, tone: "warning" },
          ]}
          activeCount={(searchTerm ? 1 : 0) + (filterStatus ? 1 : 0) + (filterCurso ? 1 : 0)}
          onClear={() => { setSearchTerm(""); setFilterStatus(""); setFilterCurso(""); }}
        >
          <FilterBar>
            <FilterSearch value={searchTerm} onChange={setSearchTerm} placeholder="Buscar por nome, email ou curso..." />
            <FilterSelect icon={BookOpen} value={filterStatus} onChange={setFilterStatus} allLabel="Todos os status" options={statusOpcoes} />
            <FilterSelect icon={Star} value={filterCurso} onChange={setFilterCurso} allLabel="Todos os cursos" options={cursoOpcoes} />
          </FilterBar>
        </KpiFilterCard>

        <AlunosTable
          students={filteredAlunos}
          onManage={(student) => {
            setSelectedStudent(student);
            setIsGradesModalOpen(true);
          }}
          onDelete={handleDelete}
        />

        <AlunosInsight />
      </div>

      <NovaMatriculaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (data) => {
          const { curso, valorMensalidade, diaVencimento, quantidadeParcelas, ...rest } = data as any;
          const studentId = crypto.randomUUID();
          await addStudent({
            ...rest,
            turma_id: curso || null,
            id: studentId,
            status: "Ativo",
            progress: 0,
            grades: []
          });

          const valor = Number(valorMensalidade);
          if (supabase && valor > 0) {
            const { error } = await supabase.rpc("gerar_mensalidades_matricula", {
              p_student_id: studentId,
              p_turma_id: curso || null,
              p_valor_mensalidade: valor,
              p_dia_vencimento: Number(diaVencimento) || 10,
              p_quantidade_parcelas: Number(quantidadeParcelas) || 1,
            });
            if (error) toast.error(`Matrícula criada, mas falhou ao gerar mensalidades: ${friendlyError(error)}`);
          }

          toast.success(`Matrícula de ${data.nome} confirmada com sucesso!`);
          setIsModalOpen(false);
        }}
      />

      {selectedStudent && (
        <AlunoGradesModal
          isOpen={isGradesModalOpen}
          student={selectedStudent}
          onClose={() => setIsGradesModalOpen(false)}
          onAddGrade={handleAddGrade}
          onRemoveGrade={handleRemoveGrade}
          onAnalyzeAI={handleAnalyzeAI}
        />
      )}
    </PageContainer>
  );
}
