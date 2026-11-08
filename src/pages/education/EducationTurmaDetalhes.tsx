import { useState } from "react";
import { CheckSquare, TrendingUp, X, ArrowLeft, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { toast } from "sonner";
import { TurmaDetalhesKPIs } from "./components/TurmaDetalhes/TurmaDetalhesKPIs";
import { TurmaDetalhesPresenca } from "./components/TurmaDetalhes/TurmaDetalhesPresenca";
import { TurmaDetalhesKanban } from "./components/TurmaDetalhes/TurmaDetalhesKanban";

interface Student {
  id: string;
  name: string;
  status: "onboarding" | "active" | "at_risk" | "completed";
  progress: number;
}

interface EducationTurmaDetalhesProps {
  turma: { id: string; nome: string; curso: string; instrutor: string; };
  students: Student[];
  onBack: () => void;
}

export default function EducationTurmaDetalhes({ turma, students, onBack }: EducationTurmaDetalhesProps) {
  const [activeTab, setActiveTab] = useState<"kanban" | "presenca">("presenca");
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchQuery, setSearchQuery] = useState("");

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const progressoMedio = students.length
    ? Math.round(students.reduce((acc, s) => acc + s.progress, 0) / students.length)
    : 0;

  const kpiStats = [
    { label: "Alunos na Turma", value: students.length.toString(), icon: CheckSquare, color: "text-[var(--color-primary-blue)]" },
    { label: "Progresso Médio", value: students.length ? `${progressoMedio}%` : "—", icon: TrendingUp, color: "text-emerald-500" },
    { label: "Alunos em Risco", value: students.filter(s => s.status === "at_risk").length.toString(), icon: X, color: "text-rose-500" },
  ];

  return (
    <PageContainer
      title={turma.nome}
      description={`${turma.curso} • Instrutor: ${turma.instrutor}`}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onBack}
            className="h-9 px-4 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </Button>
          <Button 
            onClick={() => toast.info("Funcionalidade de matrícula rápida disponível em breve.")}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar Aluno
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-w-[1700px] mx-auto pb-12">
        <TurmaDetalhesKPIs stats={kpiStats} />

        <div className="flex gap-6 border-b border-[var(--color-border-subtle)]">
          {(["presenca", "kanban"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                activeTab === tab 
                  ? "text-[var(--color-primary-blue)] border-[var(--color-primary-blue)] font-bold" 
                  : "text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]"
              }`}
            >
              {tab === "presenca" ? "Lista de Presença" : "Kanban de Progresso"}
            </button>
          ))}
        </div>

        {activeTab === "presenca" && (
          <TurmaDetalhesPresenca
            students={filteredStudents}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            attendanceDate={attendanceDate}
            onDateChange={setAttendanceDate}
            onMarkAllPresent={() => toast.info("Controle de presença por data ainda não disponível — em breve.")}
            onToggleAttendance={() => toast.info("Controle de presença por data ainda não disponível — em breve.")}
          />
        )}
        {activeTab === "kanban" && <TurmaDetalhesKanban students={students} />}
      </div>
    </PageContainer>
  );
}
