/**
 * Clínica & Saúde › Comparação de Tabelas — resultado estruturado e exportações (API-first).
 *
 * Arquivo separado de server/tableComparison.ts de propósito: só LÊ uma comparação já processada,
 * nunca cria/decide nada. Tudo passa pelo cliente Supabase do usuário (`req.supabase`), então a RLS
 * por tenant vale em cada leitura; `tenant_id` também é explícito em cada filtro.
 *
 *   GET /api/health/table-comparison/:id/result        JSON estruturado (resumo + itens, paginado)
 *   GET /api/health/table-comparison/:id/export.xlsx   planilha completa
 *   GET /api/health/table-comparison/:id/export.pdf    relatório profissional
 *
 * O processamento pesado (leitura de milhares de itens, montagem do arquivo) fica no servidor —
 * o navegador só baixa o arquivo pronto.
 */
import { buscarExames } from "../src/lib/examesBase.js";
import { formatBRL } from "../src/lib/dinheiro.js";
import type { Express, RequestHandler } from "express";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface Deps {
  requireUser: RequestHandler;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
}

const PAGE = 1000;
/** Acima disso o PDF vira resumo + pendências (a tabela completa segue no Excel). */
const PDF_DETAIL_LIMIT = 2500;
const RESULT_PAGE_MAX = 500;

export const STATUS_LABEL: Record<string, string> = {
  automatico: "Automática",
  revisao: "Em revisão",
  nao_identificado: "Não identificado",
  confirmado: "Confirmada",
  rejeitado: "Rejeitada",
};
const ORIGEM_LABEL: Record<string, string> = {
  codigo: "Código idêntico", memoria: "Memória confirmada", sinonimo: "Nome/sinônimo idêntico",
  similaridade: "Similaridade textual", aurora: "Aurora", manual: "Decisão manual",
};

async function fetchAll(sb: any, table: string, columns: string, filter: (q: any) => any): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(sb.from(table).select(columns)).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const brl = (v: unknown) => {
  const n = num(v);
  return n === null ? "—" : formatBRL(n);
};
const pct = (v: unknown, digits = 1) => {
  const n = num(v);
  return n === null ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
};
const dateBR = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40) || "parceiro";
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

interface Loaded {
  comp: any;
  items: any[];
  baseMap: Map<string, { nome: string; codigo: string | null }>;
  reviewerMap: Map<string, string>;
  empresa: string;
}

async function loadComparison(sb: any, tenantId: string, id: string): Promise<Loaded | null> {
  const { data: comp, error } = await sb.from("saude_comparacoes").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw error;
  if (!comp) return null;

  const items = await fetchAll(sb, "saude_comparacao_itens", "*", (q) => q.eq("tenant_id", tenantId).eq("comparacao_id", id).order("linha", { ascending: true }));
  const bases = await buscarExames(sb, tenantId);
  const baseMap = new Map(bases.map((b: any) => [b.id, { nome: b.nome, codigo: b.codigo_interno ?? null }]));

  // Nome de quem revisou e da empresa: melhor esforço (a RLS pode esconder — cai para o id/vazio).
  const reviewerIds = [...new Set(items.map((i) => i.revisado_por).filter(Boolean))] as string[];
  const reviewerMap = new Map<string, string>();
  if (reviewerIds.length) {
    const { data } = await sb.from("users").select("id,name").in("id", reviewerIds.slice(0, 200));
    for (const u of data || []) reviewerMap.set(u.id, u.name);
  }
  const { data: tenant } = await sb.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  return { comp, items, baseMap, reviewerMap, empresa: tenant?.name || "Empresa" };
}

function summarize(l: Loaded) {
  const by = (s: string) => l.items.filter((i) => i.status === s).length;
  const total = l.items.length;
  const automatico = by("automatico");
  const confirmado = by("confirmado");
  const revisao = by("revisao");
  const naoId = by("nao_identificado");
  const rejeitado = by("rejeitado");
  const correspondidos = automatico + confirmado;
  const auroraCount = l.items.filter((i) => i.origem_decisao === "aurora").length;
  const margens = l.items.filter((i) => ["automatico", "confirmado"].includes(i.status)).map((i) => num(i.margem)).filter((m): m is number => m !== null);
  return {
    total, automatico, confirmado, revisao, nao_identificado: naoId, rejeitado,
    correspondidos,
    pct_correspondencia: total ? Math.round((correspondidos / total) * 1000) / 10 : 0,
    pct_pendente: total ? Math.round(((revisao + naoId) / total) * 1000) / 10 : 0,
    valor_total_parceiro: num(l.comp.valor_total_parceiro),
    valor_correspondido: num(l.comp.valor_correspondido),
    custo_total: num(l.comp.custo_total),
    diferenca_total: num(l.comp.diferenca_total),
    margem_media: margens.length ? Math.round((margens.reduce((a, b) => a + b, 0) / margens.length) * 100) / 100 : null,
    itens_aurora: auroraCount,
  };
}

const reviewerName = (l: Loaded, id: string | null) => (id ? l.reviewerMap.get(id) || id : "");

export function registerTableComparisonExportRoutes(app: Express, { requireUser, resolveRequestedTenantId }: Deps) {
  // Resultado estruturado (é o que um sistema externo consome): resumo + itens paginados.
  app.get("/api/health/table-comparison/:id/result", requireUser, async (req: any, res) => {
    try {
      const tenantId = await resolveRequestedTenantId(req, res);
      if (!tenantId) return;
      if (!isUuid(String(req.params.id))) return res.status(400).json({ error: "Identificador inválido." });
      const sb = req.supabase;

      const { data: comp, error } = await sb.from("saude_comparacoes").select("*").eq("id", req.params.id).eq("tenant_id", tenantId).maybeSingle();
      if (error) throw error;
      if (!comp) return res.status(404).json({ error: "Comparação não encontrada." });

      const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
      const pageSize = Math.min(RESULT_PAGE_MAX, Math.max(1, Math.floor(Number(req.query.pageSize) || 100)));
      const status = String(req.query.status || "");
      let q = sb.from("saude_comparacao_itens").select("*", { count: "exact" }).eq("tenant_id", tenantId).eq("comparacao_id", comp.id);
      if (STATUS_LABEL[status]) q = q.eq("status", status);
      const { data: items, count, error: itemsErr } = await q.order("linha", { ascending: true }).range((page - 1) * pageSize, page * pageSize - 1);
      if (itemsErr) throw itemsErr;

      res.json({
        id: comp.id,
        status: comp.status,
        parceiro: comp.parceiro,
        arquivo: comp.arquivo_nome,
        criada_em: comp.created_at,
        concluida_em: comp.concluida_em,
        versao_motor: comp.versao_motor,
        totais: {
          total: comp.total, automatico: comp.qtd_automatico, revisao: comp.qtd_revisao, nao_identificado: comp.qtd_nao_identificado,
          valor_total_parceiro: num(comp.valor_total_parceiro), valor_correspondido: num(comp.valor_correspondido),
          custo_total: num(comp.custo_total), diferenca_total: num(comp.diferenca_total),
        },
        itens: { page, pageSize, total: count ?? items?.length ?? 0, dados: items || [] },
        relatorios: {
          excel: `/api/health/table-comparison/${comp.id}/export.xlsx`,
          pdf: `/api/health/table-comparison/${comp.id}/export.pdf`,
        },
      });
    } catch (e: any) {
      console.error("[table-comparison] result falhou:", e?.message || e);
      res.status(500).json({ error: "Não foi possível carregar o resultado da comparação." });
    }
  });

  app.get("/api/health/table-comparison/:id/export.xlsx", requireUser, async (req: any, res) => {
    try {
      const tenantId = await resolveRequestedTenantId(req, res);
      if (!tenantId) return;
      if (!isUuid(String(req.params.id))) return res.status(400).json({ error: "Identificador inválido." });
      const l = await loadComparison(req.supabase, tenantId, req.params.id);
      if (!l) return res.status(404).json({ error: "Comparação não encontrada." });
      const sum = summarize(l);

      const wb = new ExcelJS.Workbook();
      wb.creator = "S.P.Y.";
      wb.created = new Date();

      const ws = wb.addWorksheet("Comparação", { views: [{ state: "frozen", ySplit: 1 }] });
      ws.columns = [
        { header: "Linha", key: "linha", width: 7 },
        { header: "Exame base", key: "base", width: 38 },
        { header: "Código base", key: "cod_base", width: 14 },
        { header: "Exame parceiro", key: "parceiro", width: 38 },
        { header: "Código parceiro", key: "cod_parceiro", width: 14 },
        { header: "Confiança (%)", key: "score", width: 13 },
        { header: "Status", key: "status", width: 17 },
        { header: "Origem da decisão", key: "origem", width: 22 },
        { header: "Quantidade", key: "qtd", width: 11 },
        { header: "Custo", key: "custo", width: 13 },
        { header: "Valor base", key: "valor_base", width: 13 },
        { header: "Valor parceiro", key: "valor_parceiro", width: 14 },
        { header: "Diferença", key: "dif", width: 13 },
        { header: "Diferença (%)", key: "dif_pct", width: 13 },
        { header: "Margem (%)", key: "margem", width: 12 },
        { header: "Justificativa", key: "motivo", width: 60 },
        { header: "Revisado por", key: "rev_por", width: 24 },
        { header: "Data da revisão", key: "rev_em", width: 20 },
      ];
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: "FFFFFFFF" } };
      head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
      head.alignment = { vertical: "middle", wrapText: true };
      head.height = 22;

      const money = '"R$" #,##0.00';
      for (const it of l.items) {
        const b = it.exame_base_id ? l.baseMap.get(it.exame_base_id) : null;
        const row = ws.addRow({
          linha: it.linha,
          base: b?.nome ?? "",
          cod_base: b?.codigo ?? "",
          parceiro: it.nome_parceiro,
          cod_parceiro: it.codigo_parceiro ?? "",
          score: num(it.score),
          status: STATUS_LABEL[it.status] || it.status,
          origem: ORIGEM_LABEL[it.origem_decisao] || it.origem_decisao || "",
          qtd: num(it.quantidade),
          custo: num(it.custo_base),
          valor_base: num(it.valor_base),
          valor_parceiro: num(it.valor_parceiro),
          dif: num(it.diferenca),
          dif_pct: num(it.diferenca_pct),
          margem: num(it.margem),
          motivo: it.motivo ?? "",
          rev_por: reviewerName(l, it.revisado_por),
          rev_em: it.revisado_em ? dateBR(it.revisado_em) : "",
        });
        for (const k of ["custo", "valor_base", "valor_parceiro", "dif"]) row.getCell(k).numFmt = money;
        for (const k of ["dif_pct", "margem"]) row.getCell(k).numFmt = "0.00";
        row.getCell("score").numFmt = "0";
      }
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

      const rs = wb.addWorksheet("Resumo");
      rs.columns = [{ width: 34 }, { width: 30 }];
      const lines: Array<[string, string | number]> = [
        ["Empresa", l.empresa], ["Parceiro", l.comp.parceiro], ["Arquivo", l.comp.arquivo_nome ?? ""],
        ["Data da comparação", dateBR(l.comp.created_at)], ["Versão do motor", l.comp.versao_motor ?? ""],
        ["Itens analisados", sum.total], ["Correspondências automáticas", sum.automatico], ["Confirmadas por revisão humana", sum.confirmado],
        ["Em revisão", sum.revisao], ["Não identificados", sum.nao_identificado], ["Rejeitados", sum.rejeitado],
        ["% correspondido", pct(sum.pct_correspondencia)], ["% pendente", pct(sum.pct_pendente)],
        ["Valor total da tabela do parceiro", brl(sum.valor_total_parceiro)], ["Valor correspondido", brl(sum.valor_correspondido)],
        ["Custo total (itens correspondidos)", brl(sum.custo_total)], ["Diferença total", brl(sum.diferenca_total)], ["Margem média", pct(sum.margem_media, 2)],
      ];
      for (const [k, v] of lines) rs.addRow([k, v]).getCell(1).font = { bold: true };

      const file = `comparacao-${slug(l.comp.parceiro)}-${new Date(l.comp.created_at).toISOString().slice(0, 10)}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (e: any) {
      console.error("[table-comparison] export.xlsx falhou:", e?.message || e);
      if (!res.headersSent) res.status(500).json({ error: "Não foi possível gerar o Excel." });
    }
  });

  app.get("/api/health/table-comparison/:id/export.pdf", requireUser, async (req: any, res) => {
    try {
      const tenantId = await resolveRequestedTenantId(req, res);
      if (!tenantId) return;
      if (!isUuid(String(req.params.id))) return res.status(400).json({ error: "Identificador inválido." });
      const l = await loadComparison(req.supabase, tenantId, req.params.id);
      if (!l) return res.status(404).json({ error: "Comparação não encontrada." });
      const sum = summarize(l);
      const cfg = l.comp.config || {};

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const M = 36;
      const navy: [number, number, number] = [31, 58, 95];
      const grey: [number, number, number] = [110, 118, 130];

      // Cabeçalho
      doc.setFillColor(...navy);
      doc.rect(0, 0, W, 62, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold").setFontSize(18).text("Comparação de Tabelas", M, 30);
      doc.setFont("helvetica", "normal").setFontSize(10).text(`${l.empresa}  ·  Parceiro: ${l.comp.parceiro}`, M, 47);
      doc.setFontSize(9).text(`Gerado em ${dateBR(new Date().toISOString())}`, W - M, 30, { align: "right" });
      doc.text(`Comparação de ${dateBR(l.comp.created_at)}`, W - M, 47, { align: "right" });

      doc.setTextColor(30, 35, 45);
      let y = 84;
      const h2 = (t: string) => {
        if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 50; }
        doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...navy).text(t, M, y);
        doc.setTextColor(30, 35, 45);
        y += 8;
      };
      const lastY = () => (doc as any).lastAutoTable?.finalY ?? y;

      h2("Resumo");
      autoTable(doc, {
        startY: y, margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: navy }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 190 } },
        body: [
          ["Itens analisados", String(sum.total), "Valor total da tabela do parceiro", brl(sum.valor_total_parceiro)],
          ["Correspondências automáticas", `${sum.automatico}`, "Valor correspondido", brl(sum.valor_correspondido)],
          ["Confirmadas por revisão humana", `${sum.confirmado}`, "Custo total (correspondidos)", brl(sum.custo_total)],
          ["Em revisão", `${sum.revisao}`, "Diferença total", brl(sum.diferenca_total)],
          ["Não identificados", `${sum.nao_identificado}`, "Margem média", pct(sum.margem_media, 2)],
          ["% correspondido", pct(sum.pct_correspondencia), "% pendente", pct(sum.pct_pendente)],
        ],
      });
      y = lastY() + 22;

      h2("Metodologia");
      const meth = [
        `Cada item foi normalizado (caixa, acentos, abreviações e símbolos) e comparado, nesta ordem: código, memória de correspondências confirmadas da própria empresa, nome/sinônimo idêntico e similaridade textual.`,
        `Correspondência automática a partir de ${cfg?.match?.autoThreshold ?? 95}% de confiança; entre ${cfg?.match?.reviewThreshold ?? 80}% e ${(cfg?.match?.autoThreshold ?? 95) - 1}% o item vai para revisão humana; abaixo disso permanece "Não identificado" — nenhuma correspondência é inventada para completar a tabela.`,
        `A Aurora analisou apenas casos ambíguos (${sum.itens_aurora} ${sum.itens_aurora === 1 ? "item" : "itens"} com decisão da Aurora) e nunca substitui as regras determinísticas. Versão do motor: ${l.comp.versao_motor ?? "—"}.`,
        `Cálculos: diferença sobre ${cfg?.rules?.baseValueField === "custo" ? "o custo" : "o valor comercial"} da base; margem sobre ${cfg?.rules?.marginOn === "base" ? "o valor comercial da base" : "o valor do parceiro"}.`,
      ];
      doc.setFont("helvetica", "normal").setFontSize(9.5);
      for (const m of meth) {
        const lines = doc.splitTextToSize(m, W - 2 * M);
        if (y + lines.length * 12 > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 50; }
        doc.text(lines, M, y + 8);
        y += lines.length * 12 + 6;
      }
      y += 8;

      const rowOf = (it: any) => {
        const b = it.exame_base_id ? l.baseMap.get(it.exame_base_id) : null;
        return [
          String(it.linha), it.nome_parceiro, b?.nome ?? "—", num(it.score) === null ? "—" : `${Math.round(Number(it.score))}%`,
          STATUS_LABEL[it.status] || it.status, brl(it.custo_base), brl(it.valor_parceiro), brl(it.diferenca), pct(it.margem, 1),
        ];
      };
      const detailHead = [["#", "Exame do parceiro", "Exame da base", "Conf.", "Status", "Custo", "Valor parceiro", "Diferença", "Margem"]];
      const detailStyles = {
        startY: 0, margin: { left: M, right: M }, theme: "striped" as const, styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: navy }, showHead: "everyPage" as const,
        columnStyles: { 0: { cellWidth: 28 }, 3: { cellWidth: 36 }, 5: { halign: "right" as const }, 6: { halign: "right" as const }, 7: { halign: "right" as const }, 8: { halign: "right" as const, cellWidth: 42 } },
      };

      // Itens que exigiram revisão humana / ficaram pendentes
      const review = l.items.filter((i) => i.revisado_por || ["revisao", "nao_identificado", "rejeitado"].includes(i.status));
      doc.addPage(); y = 50;
      h2(`Itens que exigiram revisão humana ou seguem pendentes (${review.length})`);
      if (review.length === 0) {
        doc.setFont("helvetica", "normal").setFontSize(10).text("Nenhum item precisou de revisão.", M, y + 14);
      } else {
        autoTable(doc, { ...detailStyles, startY: y, head: detailHead, body: review.slice(0, PDF_DETAIL_LIMIT).map(rowOf) });
        if (review.length > PDF_DETAIL_LIMIT) {
          doc.setFontSize(9).setTextColor(...grey).text(`Exibindo ${PDF_DETAIL_LIMIT} de ${review.length}. A lista completa está no Excel.`, M, lastY() + 14);
          doc.setTextColor(30, 35, 45);
        }
      }

      // Tabela detalhada de todas as correspondências
      const matched = l.items.filter((i) => ["automatico", "confirmado"].includes(i.status));
      doc.addPage(); y = 50;
      h2(`Tabela detalhada — correspondências (${matched.length})`);
      autoTable(doc, { ...detailStyles, startY: y, head: detailHead, body: matched.slice(0, PDF_DETAIL_LIMIT).map(rowOf) });
      if (matched.length > PDF_DETAIL_LIMIT) {
        doc.setFontSize(9).setTextColor(...grey).text(`Exibindo ${PDF_DETAIL_LIMIT} de ${matched.length}. A tabela completa está no Excel.`, M, lastY() + 14);
      }

      // Rodapé com paginação
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...grey);
        doc.text(`${l.empresa} · Comparação de Tabelas · ${l.comp.parceiro}`, M, doc.internal.pageSize.getHeight() - 16);
        doc.text(`Página ${p} de ${pages}`, W - M, doc.internal.pageSize.getHeight() - 16, { align: "right" });
      }

      const file = `comparacao-${slug(l.comp.parceiro)}-${new Date(l.comp.created_at).toISOString().slice(0, 10)}.pdf`;
      const buf = Buffer.from(doc.output("arraybuffer"));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
      res.setHeader("Content-Length", String(buf.length));
      res.end(buf);
    } catch (e: any) {
      console.error("[table-comparison] export.pdf falhou:", e?.message || e);
      if (!res.headersSent) res.status(500).json({ error: "Não foi possível gerar o PDF." });
    }
  });
}
