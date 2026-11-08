
export interface CertificateForPdf {
  id: string;
  student: string;
  course: string;
  issueDate: string;
  code: string;
  grade: string;
}

export async function downloadCertificatePdf(cert: CertificateForPdf) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setDrawColor(217, 119, 6); // amber-600
  doc.setLineWidth(1.2);
  doc.rect(10, 10, 277, 190);
  doc.setLineWidth(0.4);
  doc.rect(14, 14, 269, 182);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(217, 119, 6);
  doc.setFontSize(28);
  doc.text("CERTIFICADO DE CONCLUSÃO", 148.5, 45, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(13);
  doc.text("Certificamos que", 148.5, 65, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(24);
  doc.text(cert.student, 148.5, 82, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(13);
  doc.text(`concluiu com aproveitamento o curso`, 148.5, 96, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.text(cert.course, 148.5, 108, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(`Nota final: ${cert.grade} / 10.0`, 148.5, 120, { align: "center" });

  doc.setFontSize(9);
  doc.text(`Emitido em ${cert.issueDate}`, 60, 175);
  doc.text(`Código de verificação: ${cert.code}`, 237, 175, { align: "right" });

  doc.save(`Certificado_${cert.student.replace(/\s+/g, "_")}_${cert.id}.pdf`);
}

export async function shareCertificate(cert: CertificateForPdf) {
  const text = `Certificado de conclusão — ${cert.student} — ${cert.course}. Código de verificação: ${cert.code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Certificado de Conclusão", text });
      return "shared" as const;
    } catch {
      // usuário cancelou o compartilhamento nativo — não é um erro a reportar
      return "cancelled" as const;
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied" as const;
}
