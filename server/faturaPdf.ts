// Fatura / recibo em PDF de um lançamento de receita, gerado aqui mesmo (jsPDF), sem serviço externo e sem custo por documento.
// Lançamento Pago sai como RECIBO; em aberto, como FATURA (com vencimento). Dados do emitente vêm de "Dados da Empresa"
// (app_settings.empresa_dados) e o documento do cliente, do cadastro de clientes (clientes.documento) quando há vínculo.
import type express from "express";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatBRL } from "../src/lib/dinheiro.js";

type Deps = { requireUser: express.RequestHandler; supabaseService: any; limiter: express.RequestHandler };

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const soDigitos = (v: unknown) => texto(v).replace(/\D/g, "");

/** CPF 000.000.000-00 / CNPJ 00.000.000/0000-00; qualquer outra coisa volta como veio. */
export function formatarDocumento(v: unknown): string {
  const d = soDigitos(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return texto(v);
}

/** AAAA-MM-DD (ou ISO completo) → DD/MM/AAAA, sem passar pelo fuso (não escorrega um dia). */
export function dataBR(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export type DadosFatura = {
  tipoDocumento: "RECIBO" | "FATURA";
  numero: string;
  emitente: { nome: string; documento: string; endereco: string; contato: string };
  cliente: { nome: string; documento: string };
  descricao: string; valor: number; vencimento: string; pagoEm: string; formaPagamento: string; status: string; emitidoEm: string;
};

export function dadosDaFatura(entry: any, empresa: any, cliente: any, tenantNome: string, hojeISO: string): DadosFatura {
  const pago = texto(entry?.status) === "Pago";
  const contato = [texto(empresa?.emailContato), texto(empresa?.telefoneContato)].filter(Boolean).join(" · ");
  return {
    tipoDocumento: pago ? "RECIBO" : "FATURA",
    numero: texto(entry?.id).replace(/^ganho_/, "").slice(0, 8).toUpperCase(),
    emitente: { nome: texto(empresa?.razaoSocial) || texto(empresa?.nomeFantasia) || tenantNome, documento: formatarDocumento(empresa?.cnpj), endereco: texto(empresa?.endereco), contato },
    cliente: { nome: texto(entry?.counterparty) || texto(cliente?.name) || "Cliente", documento: formatarDocumento(cliente?.documento) },
    descricao: texto(entry?.description) || "Serviços prestados",
    valor: Number(entry?.value) || 0,
    vencimento: dataBR(entry?.date_normalized), pagoEm: dataBR(entry?.data_pagamento),
    formaPagamento: texto(entry?.payment_method), status: texto(entry?.status), emitidoEm: dataBR(hojeISO),
  };
}

export function gerarFaturaPdf(d: DadosFatura): Buffer {
  const doc = new jsPDF();
  const larg = doc.internal.pageSize.getWidth();
  doc.setFontSize(20); doc.text(d.tipoDocumento, 14, 20);
  doc.setFontSize(10); doc.setTextColor(90);
  doc.text(`Nº ${d.numero}`, larg - 14, 14, { align: "right" });
  doc.text(`Emitido em ${d.emitidoEm}`, larg - 14, 20, { align: "right" });
  doc.setTextColor(0);

  const bloco = (titulo: string, linhas: string[], y: number) => {
    doc.setFontSize(9); doc.setTextColor(110); doc.text(titulo.toUpperCase(), 14, y);
    doc.setTextColor(0); doc.setFontSize(11);
    linhas.filter(Boolean).forEach((l, i) => doc.text(l, 14, y + 6 + i * 5.5));
    return y + 6 + Math.max(linhas.filter(Boolean).length, 1) * 5.5 + 6;
  };
  let y = bloco("Emitente", [d.emitente.nome, d.emitente.documento && `CNPJ ${d.emitente.documento}`, d.emitente.endereco, d.emitente.contato], 34);
  y = bloco("Cliente", [d.cliente.nome, d.cliente.documento && (soDigitos(d.cliente.documento).length === 11 ? `CPF ${d.cliente.documento}` : `CNPJ ${d.cliente.documento}`)], y);

  autoTable(doc, {
    startY: y, head: [["Descrição", "Valor"]], body: [[d.descricao, formatBRL(d.valor)]], theme: "grid",
    headStyles: { fillColor: [37, 99, 235] }, columnStyles: { 1: { halign: "right", cellWidth: 40 } },
  });
  const fim = (doc as any).lastAutoTable?.finalY ?? y + 20;
  const info: string[][] = [];
  if (d.tipoDocumento === "RECIBO") {
    info.push(["Situação", "Pago"]);
    if (d.pagoEm) info.push(["Pago em", d.pagoEm]);
  } else {
    info.push(["Situação", d.status || "Em aberto"]);
    if (d.vencimento) info.push(["Vencimento", d.vencimento]);
  }
  if (d.formaPagamento) info.push(["Forma de pagamento", d.formaPagamento]);
  autoTable(doc, { startY: fim + 6, body: info, theme: "plain", styles: { fontSize: 10 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } } });
  const fim2 = (doc as any).lastAutoTable?.finalY ?? fim + 20;
  doc.setFontSize(13); doc.text(`Total: ${formatBRL(d.valor)}`, larg - 14, fim2 + 12, { align: "right" });
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Documento gerado pelo S.P.Y. Não substitui nota fiscal.", 14, doc.internal.pageSize.getHeight() - 10);
  return Buffer.from(doc.output("arraybuffer"));
}

export function registerFaturaPdfRoutes(app: express.Express, { requireUser, supabaseService, limiter }: Deps) {
  // Só lançamento de RECEITA. A leitura usa a sessão do usuário (RLS): ele só alcança lançamentos da própria empresa.
  app.get("/api/financeiro/fatura/:id", requireUser, limiter, async (req: any, res) => {
    const id = texto(req.params.id);
    if (!/^[\w-]{6,80}$/.test(id)) return res.status(400).json({ error: "Lançamento inválido." });
    try {
      const { data: entry } = await req.supabase.from("finance_entries").select("*").eq("id", id).maybeSingle();
      if (!entry) return res.status(404).json({ error: "Lançamento não encontrado." });
      if (entry.type !== "Receber") return res.status(400).json({ error: "Só é possível gerar fatura ou recibo de uma receita." });
      if (texto(entry.status) === "Cancelado") return res.status(400).json({ error: "Este lançamento está cancelado." });
      const [{ data: cfg }, { data: tenant }, { data: cli }] = await Promise.all([
        supabaseService?.from("app_settings").select("value").eq("tenant_id", entry.tenant_id).eq("key", "empresa_dados").maybeSingle() ?? { data: null },
        supabaseService?.from("tenants").select("name").eq("id", entry.tenant_id).maybeSingle() ?? { data: null },
        entry.contato_id ? req.supabase.from("clientes").select("name, documento").eq("id", entry.contato_id).maybeSingle() : { data: null },
      ]);
      const d = dadosDaFatura(entry, cfg?.value, cli, texto(tenant?.name) || "Empresa", new Date().toISOString().slice(0, 10));
      const pdf = gerarFaturaPdf(d);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${d.tipoDocumento.toLowerCase()}-${d.numero}.pdf"`);
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(pdf);
    } catch (err: any) {
      console.error("[fatura-pdf]", err?.message);
      return res.status(500).json({ error: "Não foi possível gerar o PDF agora." });
    }
  });
}
