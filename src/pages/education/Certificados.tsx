import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState, useEffect } from "react";
import { Award, Plus, ShieldCheck, RefreshCw, Star, Search, CheckCircle2, XCircle, Download } from "lucide-react";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import { Modal } from "../../components/ui/modal";
import { PageContainer } from "../../components/PageContainer";
import { CertificadosKPIs } from "./components/Certificados/CertificadosKPIs";
import { CertificadosFilters } from "./components/Certificados/CertificadosFilters";
import { CertificadosGrid } from "./components/Certificados/CertificadosGrid";
import { useData } from "../../contexts/DataContext";

interface Certificate {
  id: string;
  student: string;
  course: string;
  issueDate: string;
  code: string;
  status: "Emitido" | "Processando" | "Revogado";
  grade: string;
}

function rowToCert(r: any): Certificate {
  return { id: r.id, student: r.student || "", course: r.course || "", issueDate: r.issue_date || "", code: r.code || "", status: r.status, grade: r.grade || "" };
}

export default function Certificados() {
  const { certificates, addCertificate, ensureNicheModulesLoaded } = useData();
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);
  const certs: Certificate[] = certificates.map(rowToCert);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCurso, setFilterCurso] = useState("");
  const [isEmitModalOpen, setIsEmitModalOpen] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [studentGrade, setStudentGrade] = useState("");
  const [isValidateModalOpen, setIsValidateModalOpen] = useState(false);
  const [validateCode, setValidateCode] = useState("");
  const [validateResult, setValidateResult] = useState<Certificate | null | "not_found">(null);

  // Código de autenticação é um hash SHA-256 real do aluno+curso+timestamp+salt
  // aleatório — não um número sequencial fácil de adivinhar.
  async function generateCertCode(student: string, course: string): Promise<string> {
    const data = `${student}|${course}|${Date.now()}|${Math.random()}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    return `AX-${hex.slice(0, 12).toUpperCase()}`;
  }

  const handleSaveCertificate = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const code = await generateCertCode(studentName, courseName);
    addCertificate({
      student: studentName, course: courseName,
      issue_date: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }),
      code,
      status: "Emitido", grade: studentGrade,
    });
    toast.success("Certificado emitido com sucesso!");
    setIsEmitModalOpen(false);
  };

  const handleValidateCode = (e: { preventDefault(): void }) => {
    e.preventDefault();
    const found = certs.find(c => c.code.toLowerCase() === validateCode.trim().toLowerCase());
    setValidateResult(found ?? "not_found");
  };

  const handleExportCSV = () => {
    if (certs.length === 0) {
      toast.error("Nenhum certificado para exportar");
      return;
    }
    const headers = "ID,Aluno,Curso,Data,Codigo,Status,Nota\n";
    const rows = certs
      .map(c => `"${c.id}","${c.student}","${c.course}","${c.issueDate}","${c.code}","${c.status}","${c.grade}"`)
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `certificados_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV exportado com sucesso!");
  };

  const cursoOpcoes = Array.from(new Set(certs.map(c => c.course).filter(Boolean))).sort();
  const filteredCerts = certs.filter(c =>
    (c.student.toLowerCase().includes(search.toLowerCase()) ||
    c.course.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())) &&
    (!filterStatus || c.status === filterStatus) &&
    (!filterCurso || c.course === filterCurso)
  );
  const notas = filteredCerts.map(c => parseFloat(String(c.grade).replace(",", "."))).filter(n => !Number.isNaN(n));
  const mediaNotas = notas.length ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1) : "—";

  return (
    <PageContainer
      title="Certificados & Credenciais"
      description="Emissão de diplomas e validação de códigos de autenticação (hash SHA-256) dos certificados emitidos por este tenant."
      actions={
        <div className="flex items-center gap-3">
          <Button
            onClick={handleExportCSV}
            variant="outline"
            className="h-11 px-4 rounded-2xl border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] text-[10px] font-black uppercase tracking-widest gap-2"
          >
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
          <Button
            onClick={() => { setValidateResult(null); setValidateCode(""); setIsValidateModalOpen(true); }}
            variant="outline"
            className="h-11 px-6 rounded-2xl border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] text-[10px] font-black uppercase tracking-widest"
          >
            Validar Código
          </Button>
          <Button
            onClick={() => setIsEmitModalOpen(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white h-11 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-amber-600/20"
          >
            <Plus className="w-4 h-4 mr-2" /> Emitir Novo
          </Button>
        </div>
      }
    >
      <div className="max-w-[1700px] mx-auto space-y-8 pb-10">
        <KpiFilterCard
          id="eduCertificados"
          kpis={[
            { label: "Certificados", value: filteredCerts.length, icon: Award, tone: "primary" },
            { label: "Emitidos", value: filteredCerts.filter(c => c.status === "Emitido").length, icon: CheckCircle2, tone: "success" },
            { label: "Processando", value: filteredCerts.filter(c => c.status === "Processando").length, icon: RefreshCw, tone: "info" },
            { label: "Revogados", value: filteredCerts.filter(c => c.status === "Revogado").length, icon: XCircle, tone: "danger" },
            { label: "Média Acadêmica", value: mediaNotas, icon: Star, tone: "accent" },
          ]}
          activeCount={(search ? 1 : 0) + (filterStatus ? 1 : 0) + (filterCurso ? 1 : 0)}
          onClear={() => { setSearch(""); setFilterStatus(""); setFilterCurso(""); }}
        >
          <FilterBar>
            <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por aluno, curso ou código..." />
            <FilterSelect icon={ShieldCheck} value={filterCurso} onChange={setFilterCurso} allLabel="Todos os cursos" options={cursoOpcoes} />
            <FilterChips value={filterStatus} onChange={setFilterStatus} options={["Emitido", "Processando", "Revogado"]} />
          </FilterBar>
        </KpiFilterCard>
        <CertificadosGrid certs={filteredCerts} />
      </div>

      <Modal
        isOpen={isEmitModalOpen}
        onClose={() => setIsEmitModalOpen(false)}
        title="🎓 Nova Autenticação"
        description="Emita uma nova credencial acadêmica com código de verificação único."
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveCertificate} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">Nome Completo do Aluno</label>
              <input
                required
                placeholder="Ex: Ana Clara Silva"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl h-11 px-4 text-sm text-[var(--color-text-primary)] focus:border-amber-500/50 transition-all font-medium"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">Título da Formação / Curso</label>
              <input
                required
                placeholder="Ex: Especialização em Gestão de Negócios"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl h-11 px-4 text-sm text-[var(--color-text-primary)] focus:border-amber-500/50 transition-all font-medium"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">Média / Nota</label>
                <input
                  required
                  type="number"
                  step="0.1"
                  placeholder="0.0 - 10.0"
                  value={studentGrade}
                  onChange={(e) => setStudentGrade(e.target.value)}
                  className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl h-11 px-4 text-sm text-[var(--color-text-primary)] focus:border-amber-500/50 transition-all font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">Segurança</label>
                <div className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl h-11 flex items-center justify-center text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider px-2 text-center">
                  SHA-256 Automático
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11 rounded-xl border-[var(--color-border-default)] text-xs font-bold"
              onClick={() => setIsEmitModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
            >
              Emitir Diploma
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isValidateModalOpen}
        onClose={() => setIsValidateModalOpen(false)}
        title="🔍 Validar Autenticidade"
        description="Verifique se um código pertence a um certificado emitido por este tenant."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleValidateCode} className="space-y-4">
          <div className="flex gap-2">
            <input
              autoFocus
              placeholder="Ex: AX-3F9A0C1B2E4D"
              value={validateCode}
              onChange={(e) => { setValidateCode(e.target.value); setValidateResult(null); }}
              className="flex-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl h-11 px-4 text-xs font-mono uppercase text-[var(--color-text-primary)] focus:border-amber-500/50 transition-all"
            />
            <Button type="submit" className="h-11 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold gap-1.5">
              <Search className="w-3.5 h-3.5" /> Buscar
            </Button>
          </div>

          {validateResult === "not_found" && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5">
              <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <p className="text-xs text-rose-400 font-bold">Código não encontrado entre os certificados emitidos.</p>
            </div>
          )}
          {validateResult && validateResult !== "not_found" && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <p className="text-xs text-emerald-400 font-bold uppercase">
                  {validateResult.status === "Revogado" ? "Certificado revogado" : "Certificado autêntico"}
                </p>
              </div>
              <p className="text-sm text-[var(--color-text-primary)] font-bold">{validateResult.student}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{validateResult.course} — emitido em {validateResult.issueDate}</p>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full h-10 rounded-xl border-[var(--color-border-default)] text-xs font-bold"
            onClick={() => setIsValidateModalOpen(false)}
          >
            Fechar
          </Button>
        </form>
      </Modal>
    </PageContainer>
  );
}
