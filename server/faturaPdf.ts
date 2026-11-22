// Fatura / recibo em PDF de um lançamento de receita, gerado aqui mesmo (jsPDF), sem serviço externo e sem custo por documento.
// Lançamento Pago sai como RECIBO; em aberto, como FATURA (com vencimento). Dados do emitente vêm de "Dados da Empresa"
// (app_settings.empresa_dados) e o documento do cliente, do cadastro de clientes (clientes.documento) quando há vínculo.
import type express from "express";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { montarBrCode, normalizarChavePix } from "./pix.js";
import { criarCobrancaPix } from "./cobrancaPix.js";
import { assertSafeHttpUrl } from "./ssrfGuard.js";
import { formatBRL } from "../src/lib/dinheiro.js";
import { MODELO_PADRAO, aplicarVariaveis, escolherModelo, sanitizarConfig, sanitizarModelo, valorPorExtenso, type ModeloRecibo } from "./modeloRecibo.js";

type Deps = {
  requireUser: express.RequestHandler; requireTenantAdmin: express.RequestHandler; supabaseService: any; limiter: express.RequestHandler;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  segredo: string; appUrl: string;
};
const SETTINGS_MODELOS = "modelos_recibo";
const SETTINGS_PIX = "pix_recebimento";

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

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/** Variáveis disponíveis no texto do modelo ({{cliente}}, {{valor_extenso}}…). */
export function variaveisDaFatura(d: DadosFatura): Record<string, string> {
  return {
    cliente: d.cliente.nome, cliente_documento: d.cliente.documento, valor: formatBRL(d.valor), valor_extenso: valorPorExtenso(d.valor),
    descricao: d.descricao, data_pagamento: d.pagoEm, vencimento: d.vencimento, forma_pagamento: d.formaPagamento,
    emitente: d.emitente.nome, emitente_documento: d.emitente.documento, numero: d.numero, hoje: d.emitidoEm,
  };
}

/** Tipo da imagem pelos primeiros bytes (não pelo que o servidor diz): só PNG e JPEG servem para o PDF. */
export function tipoDaImagem(b: Uint8Array): "png" | "jpeg" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  return null;
}

const MAX_LOGO_EMPRESA = 1_000_000;
const cacheLogo = new Map<string, { ate: number; valor: string }>();
/** Logo de "Dados da Empresa" (URL pública) → data URL PNG/JPEG, ou "" se não der (formato diferente, grande demais, fora do ar). Nunca derruba o PDF. */
export async function logoDaEmpresa(url: unknown): Promise<string> {
  const u = texto(url);
  if (!u) return "";
  const hit = cacheLogo.get(u);
  if (hit && hit.ate > Date.now()) return hit.valor;
  let valor = "";
  try {
    await assertSafeHttpUrl(u);
    const r = await fetch(u, { signal: AbortSignal.timeout(8000), redirect: "error" });
    const len = Number(r.headers.get("content-length") || 0);
    if (r.ok && len <= MAX_LOGO_EMPRESA) {
      const b = new Uint8Array(await r.arrayBuffer());
      const t = b.length <= MAX_LOGO_EMPRESA ? tipoDaImagem(b) : null;
      if (t) valor = `data:image/${t};base64,${Buffer.from(b).toString("base64")}`;
    }
  } catch { /* sem logo */ }
  cacheLogo.set(u, { ate: Date.now() + 10 * 60_000, valor });
  return valor;
}

export function gerarFaturaPdf(d: DadosFatura, modelo: ModeloRecibo = MODELO_PADRAO, brcode?: string | null): Buffer {
  const doc = new jsPDF();
  const larg = doc.internal.pageSize.getWidth(), alt = doc.internal.pageSize.getHeight();
  const cor = hex(modelo.cor);
  const vars = variaveisDaFatura(d);

  let topo = 20;
  if (modelo.logo) {
    try {
      const p = doc.getImageProperties(modelo.logo);
      const h = Math.min(18, (p.height * 40) / p.width), w = (p.width * h) / p.height; // cabe em 40x18 mm
      doc.addImage(modelo.logo, p.fileType, 14, 10, w, h);
      topo = 10 + h + 8;
    } catch { /* imagem ilegível: segue sem logo */ }
  }
  doc.setFontSize(20); doc.setTextColor(cor[0], cor[1], cor[2]);
  doc.text(d.tipoDocumento === "RECIBO" ? modelo.tituloRecibo : modelo.tituloFatura, 14, topo);
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
  let y = topo + 14;
  if (modelo.mostrar.emitente) y = bloco("Emitente", [d.emitente.nome, d.emitente.documento && `CNPJ ${d.emitente.documento}`, d.emitente.endereco, d.emitente.contato], y);
  y = bloco("Cliente", [d.cliente.nome, modelo.mostrar.documentoCliente && d.cliente.documento ? (soDigitos(d.cliente.documento).length === 11 ? `CPF ${d.cliente.documento}` : `CNPJ ${d.cliente.documento}`) : ""], y);

  if (modelo.abertura) {
    doc.setFontSize(11);
    const linhas = doc.splitTextToSize(aplicarVariaveis(modelo.abertura, vars), larg - 28) as string[];
    doc.text(linhas, 14, y); y += linhas.length * 5.5 + 6;
  }

  let fim = y;
  if (modelo.mostrar.detalhes) {
    autoTable(doc, { startY: y, head: [["Descrição", "Valor"]], body: [[d.descricao, formatBRL(d.valor)]], theme: "grid", headStyles: { fillColor: cor }, columnStyles: { 1: { halign: "right", cellWidth: 40 } } });
    fim = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 6;
  }
  const info: string[][] = [];
  if (d.tipoDocumento === "RECIBO") { info.push(["Situação", "Pago"]); if (d.pagoEm) info.push(["Pago em", d.pagoEm]); }
  else { info.push(["Situação", d.status || "Em aberto"]); if (d.vencimento) info.push(["Vencimento", d.vencimento]); }
  if (modelo.mostrar.formaPagamento && d.formaPagamento) info.push(["Forma de pagamento", d.formaPagamento]);
  autoTable(doc, { startY: fim, body: info, theme: "plain", styles: { fontSize: 10 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } } });
  let fim2 = ((doc as any).lastAutoTable?.finalY ?? fim + 20) + 12;
  doc.setFontSize(13); doc.setTextColor(0); doc.text(`Total: ${formatBRL(d.valor)}`, larg - 14, fim2, { align: "right" });
  fim2 += 8;

  // QR de Pix: só em fatura em aberto, quando a empresa cadastrou a chave e o modelo permite.
  const ehRecibo = d.tipoDocumento === "RECIBO";
  if (brcode && (ehRecibo ? modelo.mostrar.pixNoRecibo : modelo.mostrar.pix)) {
    const tam = 38, linhas = doc.splitTextToSize(brcode, larg - 28 - tam - 8) as string[];
    if (fim2 + tam + 14 > alt - 20) { doc.addPage(); fim2 = 20; }
    const qr = QRCode.create(brcode, { errorCorrectionLevel: "M" }).modules;
    const n = qr.size, celula = tam / (n + 2); // 1 módulo de margem em cada lado
    doc.setFillColor(255, 255, 255); doc.rect(14, fim2, tam, tam, "F");
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.get(r, c)) doc.rect(14 + (c + 1) * celula, fim2 + (r + 1) * celula, celula, celula, "F");
    doc.setFontSize(11); doc.setTextColor(cor[0], cor[1], cor[2]); doc.text(ehRecibo ? "Pix da empresa" : "Pague com Pix", 14 + tam + 8, fim2 + 6);
    doc.setFontSize(8); doc.setTextColor(70); doc.text(ehRecibo ? "Para novos pagamentos, aponte a câmera do app do banco ou use o Pix copia e cola (sem valor definido):" : "Aponte a câmera do app do banco para o QR ou use o Pix copia e cola:", 14 + tam + 8, fim2 + 11, { maxWidth: larg - 28 - tam - 8 });
    doc.setFont("courier", "normal"); doc.setFontSize(6.5); doc.text(linhas, 14 + tam + 8, fim2 + 19);
    doc.setFont("helvetica", "normal");
    fim2 += tam + 10;
  }
  if (modelo.observacoes) {
    doc.setFontSize(10); doc.setTextColor(70);
    const o = doc.splitTextToSize(aplicarVariaveis(modelo.observacoes, vars), larg - 28) as string[];
    doc.text(o, 14, fim2 + 6); fim2 += o.length * 5 + 10;
  }
  if (modelo.mostrar.assinatura) {
    const ya = Math.min(Math.max(fim2 + 30, 200), alt - 40);
    doc.setDrawColor(120); doc.line(larg / 2 - 40, ya, larg / 2 + 40, ya);
    doc.setFontSize(9); doc.setTextColor(90);
    doc.text(d.emitente.nome, larg / 2, ya + 5, { align: "center" });
  }
  if (modelo.id === "padrao") { doc.setFontSize(8); doc.setTextColor(120); doc.text("Documento gerado pelo S.P.Y. Não substitui nota fiscal.", 14, alt - 10); }
  return Buffer.from(doc.output("arraybuffer"));
}

export function registerFaturaPdfRoutes(app: express.Express, { requireUser, requireTenantAdmin, supabaseService, limiter, resolveRequestedTenantId, segredo, appUrl }: Deps) {
  const cobranca = criarCobrancaPix({ supabaseService, segredo, appUrl });
  cobranca.registrar(app); // webhook do Mercado Pago: baixa automática da fatura quando o cliente paga
  const lerConfig = async (tenantId: string) => {
    const { data } = (await supabaseService?.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", SETTINGS_MODELOS).maybeSingle()) ?? { data: null };
    return data?.value ?? null;
  };

  const lerPix = async (tenantId: string) => {
    const { data } = (await supabaseService?.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", SETTINGS_PIX).maybeSingle()) ?? { data: null };
    const v = data?.value ?? {};
    const k = normalizarChavePix(v.chave);
    return k ? { chave: k.chave, tipo: k.tipo, nome: texto(v.nome).slice(0, 60), cidade: texto(v.cidade).slice(0, 40) } : null;
  };
  const brcodeDa = (pix: { chave: string; nome: string; cidade: string } | null, d: DadosFatura) =>
    pix ? montarBrCode({ chave: pix.chave, nome: pix.nome || d.emitente.nome, cidade: pix.cidade, valor: d.valor, txid: `SPY${d.numero}` }) : null;

  // Chave Pix da empresa (para o QR das faturas em aberto).
  app.get("/api/financeiro/pix-recebimento", requireUser, limiter, async (req: any, res) => {
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const pix = await lerPix(tenantId);
    // brcode: Pix da empresa SEM valor (usado no cupom do varejo e no recibo), pronto para virar QR na tela.
    let nomeRecebedor = pix?.nome || "";
    if (pix && !nomeRecebedor) {
      const { data: emp } = (await supabaseService?.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "empresa_dados").maybeSingle()) ?? { data: null };
      nomeRecebedor = texto(emp?.value?.razaoSocial) || texto(emp?.value?.nomeFantasia);
    }
    const brcode = pix ? montarBrCode({ chave: pix.chave, nome: nomeRecebedor, cidade: pix.cidade, txid: "SPY" }) : null;
    return res.json({ pix, brcode, mercadoPago: !!(await cobranca.tokenMp(tenantId)) });
  });
  app.put("/api/financeiro/pix-recebimento", requireUser, requireTenantAdmin, limiter, async (req: any, res) => {
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const chaveBruta = texto(req.body?.chave);
    if (!chaveBruta) { // chave em branco = remove o QR das faturas
      const { error } = await supabaseService.from("app_settings").upsert({ tenant_id: tenantId, key: SETTINGS_PIX, value: {} }, { onConflict: "tenant_id,key" });
      return error ? res.status(500).json({ error: "Não foi possível salvar." }) : res.json({ pix: null });
    }
    const k = normalizarChavePix(chaveBruta);
    if (!k) return res.status(400).json({ error: "Chave Pix inválida. Use CPF, CNPJ, e-mail, telefone com +55 ou a chave aleatória." });
    const cidade = texto(req.body?.cidade);
    if (!cidade) return res.status(400).json({ error: "Informe a cidade do recebedor (o Pix exige)." });
    const { error } = await supabaseService.from("app_settings").upsert({ tenant_id: tenantId, key: SETTINGS_PIX, value: { chave: k.chave, nome: texto(req.body?.nome).slice(0, 60), cidade: cidade.slice(0, 40) } }, { onConflict: "tenant_id,key" });
    if (error) return res.status(500).json({ error: "Não foi possível salvar." });
    return res.json({ pix: await lerPix(tenantId) });
  });

  // Modelos da empresa: o padrão do SPY (fixo) + os criados por ela, e qual é o principal.
  app.get("/api/financeiro/modelos-recibo", requireUser, limiter, async (req: any, res) => {
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const cfg = sanitizarConfig(await lerConfig(tenantId));
    return res.json({ padrao: MODELO_PADRAO, modelos: cfg.modelos, principalId: cfg.principalId });
  });

  app.put("/api/financeiro/modelos-recibo", requireUser, requireTenantAdmin, limiter, async (req: any, res) => {
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const cfg = sanitizarConfig(req.body);
    const { error } = await supabaseService.from("app_settings").upsert({ tenant_id: tenantId, key: SETTINGS_MODELOS, value: cfg }, { onConflict: "tenant_id,key" });
    if (error) return res.status(500).json({ error: "Não foi possível salvar os modelos." });
    return res.json({ padrao: MODELO_PADRAO, ...cfg });
  });

  // Pré-visualização: gera o PDF de um modelo (ainda não salvo) com dados de exemplo.
  app.post("/api/financeiro/modelos-recibo/preview", requireUser, limiter, async (req: any, res) => {
    try {
      const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
      let modelo = sanitizarModelo(req.body?.modelo, "previa");
      if (!modelo.logo && modelo.mostrar.logoEmpresa) {
        const { data: emp } = (await supabaseService?.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "empresa_dados").maybeSingle()) ?? { data: null };
        modelo = { ...modelo, logo: await logoDaEmpresa(emp?.value?.logoUrl) };
      }
      const pago = req.body?.tipo !== "fatura";
      const d = dadosDaFatura({ id: "a1b2c3d4", counterparty: "Maria da Silva", description: "Serviço prestado (exemplo)", value: 2244.5, status: pago ? "Pago" : "A Vencer", date_normalized: "2026-12-05", data_pagamento: "2026-11-21", payment_method: "Pix" },
        { razaoSocial: "Sua Empresa Ltda", cnpj: "12345678000195", endereco: "Rua Exemplo, 100 — Centro", emailContato: "contato@suaempresa.com.br", telefoneContato: "(11) 99999-0000" }, { name: "Maria da Silva", documento: "52998224725" }, "Sua Empresa", new Date().toISOString().slice(0, 10));
      res.setHeader("Content-Type", "application/pdf"); res.setHeader("Cache-Control", "private, no-store");
      const pixPrev = await lerPix(tenantId);
      const code = pago ? (pixPrev ? montarBrCode({ chave: pixPrev.chave, nome: pixPrev.nome || d.emitente.nome, cidade: pixPrev.cidade, txid: "SPY" }) : null) : brcodeDa(pixPrev, d);
      return res.send(gerarFaturaPdf(d, modelo, code));
    } catch (err: any) { console.error("[modelos-recibo/preview]", err?.message); return res.status(500).json({ error: "Não foi possível gerar a pré-visualização." }); }
  });

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
        entry.contato_id ? req.supabase.from("clientes").select("name, documento, email").eq("id", entry.contato_id).maybeSingle() : { data: null },
      ]);
      const d = dadosDaFatura(entry, cfg?.value, cli, texto(tenant?.name) || "Empresa", new Date().toISOString().slice(0, 10));
      let modelo = escolherModelo(await lerConfig(entry.tenant_id), texto(req.query.modelo) || null);
      if (!modelo.logo && modelo.mostrar.logoEmpresa) modelo = { ...modelo, logo: await logoDaEmpresa(cfg?.value?.logoUrl) };
      // Fatura em aberto: com Mercado Pago conectado o Pix é dinâmico (a baixa é automática ao pagar); senão, o Pix estático da chave cadastrada.
      let brcode: string | null = null;
      if (d.tipoDocumento === "RECIBO") {
        // Recibo (já pago): só o Pix da empresa, sem valor, para novos pagamentos. Nunca cobra de novo o mesmo valor.
        const pix = await lerPix(entry.tenant_id);
        brcode = pix ? montarBrCode({ chave: pix.chave, nome: pix.nome || d.emitente.nome, cidade: pix.cidade, txid: "SPY" }) : null;
      } else {
        brcode = await cobranca.criarPix(entry.tenant_id, { id: entry.id, valor: d.valor, descricao: d.descricao, vencimentoISO: texto(entry.date_normalized) || new Date().toISOString().slice(0, 10), emailPagador: texto(cli?.email) || texto(cfg?.value?.emailContato), nomePagador: d.cliente.nome });
        brcode ??= brcodeDa(await lerPix(entry.tenant_id), d);
      }
      const pdf = gerarFaturaPdf(d, modelo, brcode);
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
