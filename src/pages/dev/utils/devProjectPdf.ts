
export interface DevProjectPdfData {
  id: string;
  name: string;
  description: string;
  status: string;
  stack?: string[];
  team?: string[];
  valor_estimado?: number | null;
}

export const handleDownloadDevProjectPdf = async (project: DevProjectPdfData) => {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF();

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(37, 99, 235); // Blue
  doc.text("PROPOSTA DE PROJETO — DESENVOLVIMENTO", 105, 20, { align: "center" });

  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(20, 25, 190, 25);

  // Dados do projeto
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59); // Slate 800
  doc.setFont("helvetica", "bold");
  doc.text("DADOS DO PROJETO", 20, 40);

  doc.setFont("helvetica", "normal");
  doc.text(`Projeto: ${project.name}`, 20, 50);
  doc.text(`Status: ${project.status}`, 20, 58);
  doc.text(`Stack sugerida: ${project.stack?.length ? project.stack.join(", ") : "a definir"}`, 20, 66);
  doc.text(`Time responsável: ${project.team?.length ? project.team.join(", ") : "a definir"}`, 20, 74);

  // Valor estimado
  doc.setFont("helvetica", "bold");
  doc.text("VALOR ESTIMADO", 20, 94);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(16, 185, 129); // Emerald 500
  doc.setFontSize(14);
  const valorTexto =
    project.valor_estimado != null
      ? project.valor_estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "A definir";
  doc.text(valorTexto, 80, 94);

  // Descrição
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("DESCRIÇÃO", 20, 114);

  doc.setFont("helvetica", "normal");
  doc.text(project.description || "—", 20, 124, {
    maxWidth: 170,
    align: "justify",
    lineHeightFactor: 1.5,
  });

  doc.save(`Projeto_Dev_${project.name.replace(/\s+/g, "_")}_${project.id}.pdf`);
};
