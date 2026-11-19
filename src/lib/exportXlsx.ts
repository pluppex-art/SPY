export interface ColunaXlsx {
  titulo: string;
  /** texto (padrão), moeda (R$), data (recebe "YYYY-MM-DD") ou numero. */
  tipo?: "texto" | "moeda" | "data" | "numero";
  largura?: number;
}

export interface AbaXlsx {
  nome: string;
  colunas: ColunaXlsx[];
  linhas: (string | number | boolean | null | undefined)[][];
}

const FORMATO = { moeda: '"R$" #,##0.00;[Red]-"R$" #,##0.00', data: "dd/mm/yyyy", numero: "#,##0.##" } as const;

/** Nome de aba válido no Excel: até 31 caracteres, sem []:*?/\ */
const nomeAba = (n: string) => n.replace(/[\[\]:*?/\\]/g, " ").slice(0, 31) || "Planilha";

/**
 * Baixa um arquivo .xlsx de verdade (não CSV): cabeçalho em negrito, valores em
 * moeda formatados, datas como data do Excel e colunas já com largura. Texto é
 * gravado como texto (nunca interpretado como fórmula).
 */
export async function exportarXlsx(nomeArquivo: string, abas: AbaXlsx[]): Promise<void> {
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  for (const aba of abas) {
    const ws = wb.addWorksheet(nomeAba(aba.nome), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = aba.colunas.map((c) => ({
      header: c.titulo,
      width: c.largura ?? (c.tipo === "moeda" ? 16 : c.tipo === "data" ? 13 : Math.min(40, Math.max(14, c.titulo.length + 4))),
    }));
    for (const linha of aba.linhas) {
      ws.addRow(
        linha.map((v, i) => {
          const tipo = aba.colunas[i]?.tipo ?? "texto";
          if (v == null || v === "") return null;
          if (tipo === "data") {
            const [y, m, d] = String(v).split("-").map(Number);
            return y && m && d ? new Date(Date.UTC(y, m - 1, d)) : String(v);
          }
          if (tipo === "moeda" || tipo === "numero") return Number(v) || 0;
          return typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v);
        }),
      );
    }
    aba.colunas.forEach((c, i) => {
      if (c.tipo && c.tipo !== "texto") ws.getColumn(i + 1).numFmt = FORMATO[c.tipo];
    });
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cab.alignment = { vertical: "middle" };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.colunas.length } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".xlsx") ? nomeArquivo : `${nomeArquivo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Sufixo de data para nome de arquivo: 2026-11-19. */
export const dataParaArquivo = () => new Date().toISOString().slice(0, 10);
