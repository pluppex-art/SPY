import { resumoValorProposta } from "../../../lib/propostaValor";
import jsPDF from "jspdf";

export interface Proposta {
  id: string;
  cliente: string;
  titulo: string;
  valor: number;
  created_at?: string;
  validade?: string;
  status: "Aberta" | "Enviada" | "Aceita" | "Recusada" | "Expirada";
  vendedor: string;
  tipo?: "itens" | "texto" | "arquivo";
  conteudo_texto?: string | null;
  /** Forma de pagamento (parcelas, entrada, recorrência) — define "Nx de R$ Y". */
  pagamento?: Record<string, any> | null;
}

export interface PropostaItemPdf {
  product_name: string;
  quantidade: number;
  preco_unitario: number;
  billing_type?: string | null;
  contract_months?: number | null;
}

export const INITIAL_PROPOSTAS: Proposta[] = [];

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtCurrency = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface PropostaBranding {
  logoUrl?: string;
  tenantName?: string;
}

// Busca a logo como data URL para o jsPDF poder embutir a imagem — addImage não
// aceita uma URL remota diretamente, precisa dos bytes já carregados.
const fetchImageAsDataUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const handleDownloadPdf = async (
  proposta: Proposta,
  itens: PropostaItemPdf[] = [],
  branding?: PropostaBranding
) => {
  const doc = new jsPDF();

  if (branding?.logoUrl) {
    const dataUrl = await fetchImageAsDataUrl(branding.logoUrl);
    if (dataUrl) {
      try {
        const format = dataUrl.includes("image/png") ? "PNG" : dataUrl.includes("image/webp") ? "WEBP" : "JPEG";
        doc.addImage(dataUrl, format as any, 20, 10, 28, 16, undefined, "FAST");
      } catch {
        // Formato de imagem não suportado pelo jsPDF (ex: SVG) — segue sem a logo.
      }
    }
  }

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(37, 99, 235); // Blue
  doc.text("PROPOSTA COMERCIAL / CONTRATO", 105, 20, { align: "center" });

  // Separator line
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(20, 25, 190, 25);

  // Proposta Data
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59); // Slate 800
  doc.setFont("helvetica", "bold");
  doc.text("DADOS DA PROPOSTA", 20, 40);

  doc.setFont("helvetica", "normal");
  doc.text(`Cliente: ${proposta.cliente}`, 20, 50);
  doc.text(`Projeto: ${proposta.titulo}`, 20, 58);
  doc.text(`Responsável Institucional: ${proposta.vendedor}`, 20, 66);

  doc.text(`Data de Emissão: ${fmtDate(proposta.created_at)}`, 130, 50);
  doc.text(`Válida até: ${fmtDate(proposta.validade)}`, 130, 58);
  doc.text(`Status: ${proposta.status}`, 130, 66);

  // Condições Comerciais
  doc.setFont("helvetica", "bold");
  doc.text("CONDIÇÕES COMERCIAIS", 20, 90);

  // Recorrente mostra a MENSALIDADE (nunca o total do contrato); parcelado, "Nx de R$ Y"; à vista, o total.
  const resumo = resumoValorProposta(
    proposta.valor,
    itens.map((i: any) => ({ quantidade: Number(i.quantidade) || 0, precoUnitario: Number(i.preco_unitario) || 0, billingType: i.billing_type ?? null, contractMonths: i.contract_months ?? null })),
    proposta.pagamento,
  );
  doc.setFont("helvetica", "normal");
  doc.text(`${resumo.rotulo}:`, 20, 100);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(16, 185, 129); // Emerald 500
  doc.setFontSize(14);
  doc.text(`${fmtCurrency(resumo.valor)}${resumo.sufixo ? ` ${resumo.sufixo}` : ""}`, 80, 100);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(resumo.adicional ? `${resumo.detalhe}  •  + ${fmtCurrency(resumo.adicional.valor)} (${resumo.adicional.rotulo})` : resumo.detalhe, 20, 106);

  if (itens.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105); // Slate 600
    doc.setFont("helvetica", "normal");
    // Item recorrente: o preço é o do ciclo (a quantidade guarda ciclos × unidades) — não "72x … /un".
    const itensText = itens
      .map((i: any) => (i.billing_type && i.billing_type !== "one_time"
        ? `${i.product_name} (${fmtCurrency(i.preco_unitario)}/mês)`
        : `${i.quantidade}x ${i.product_name} (${fmtCurrency(i.preco_unitario)}/un)`))
      .join("  •  ");
    doc.text(itensText, 20, 114, { maxWidth: 170 });
  }

  // Escopo e Obrigações
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.text("ESCOPO E DIRETRIZES", 20, 120);
  doc.setFont("helvetica", "normal");

  const contractText = proposta.tipo === "texto" && proposta.conteudo_texto?.trim()
    ? proposta.conteudo_texto
    : `Pelo presente instrumento, acordam as partes a prestação de serviços referente a "${proposta.titulo}", conforme as diretrizes e cronogramas a serem definidos posteriormente em anexo. \n\nEste documento detalha o compromisso de ambas as partes. O cliente "${proposta.cliente}" concorda com as condições comerciais e operacionais estipuladas nesta proposta formal.\n\nO desenvolvimento dos trabalhos terá vigência descrita no cronograma operacional, que não excederá os termos acordados. Qualquer ajuste deve ser negociado mutuamente por escrito.`;

  doc.text(contractText, 20, 130, {
    maxWidth: 170,
    align: "justify",
    lineHeightFactor: 1.5,
  });

  // Signatures
  doc.setDrawColor(148, 163, 184); // Slate 400
  doc.line(30, 240, 90, 240);
  doc.text(proposta.cliente, 60, 246, { align: "center" });
  doc.setFontSize(9);
  doc.text("Contratante", 60, 251, { align: "center" });

  doc.setFontSize(11);
  doc.line(120, 240, 180, 240);
  doc.text(proposta.vendedor, 150, 246, { align: "center" });
  doc.setFontSize(9);
  doc.text("Contratado (Representante)", 150, 251, { align: "center" });

  doc.save(
    `Proposta_${proposta.cliente.replace(/\s+/g, "_")}_${proposta.id}.pdf`,
  );
};
