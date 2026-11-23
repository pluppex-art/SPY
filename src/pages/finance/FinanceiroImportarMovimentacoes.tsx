import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { KpiTiles } from "../../components/ui/kpi-filter-card";
import { lerValor } from "../../lib/dinheiro";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Download, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../contexts/DataContext";
import { SecaoCard } from "./components/SecaoCard";


const TIPO_MAP: Record<string, { type: "Pagar" | "Receber"; subtipo: string | null }> = {
  "recebimentos": { type: "Receber", subtipo: null },
  "despesas fixas": { type: "Pagar", subtipo: "DESPESA_FIXA" },
  "despesas variáveis": { type: "Pagar", subtipo: "DESPESA_VARIAVEL" },
  "despesas variaveis": { type: "Pagar", subtipo: "DESPESA_VARIAVEL" },
  "pessoas": { type: "Pagar", subtipo: "PESSOAS" },
  "impostos": { type: "Pagar", subtipo: "IMPOSTOS" },
};

const REQUIRED_COLS = ["Tipo de Lançamento", "Data Pagamento", "Descrição", "Valor", "Conta", "Pago"];
const OPTIONAL_COLS = ["Data Competência", "Categoria", "Recebido de / Pago a", "Detalhes", "Número do Documento", "Forma de Pagamento", "Centro de Custo", "Tags"];

const TEMPLATE_HEADER = [...REQUIRED_COLS, ...OPTIONAL_COLS];
const TEMPLATE_EXAMPLE = ["Despesas fixas", "05/10/2026", "Aluguel do escritório", "3500,00", "Nubank", "Não", "", "Aluguel", "Imobiliária XYZ", "", "", "PIX", "Administração", "fixo, escritorio"];

// Parser de CSV com suporte a campos entre aspas (descrição/observação podem
// conter vírgula) — não é um parser RFC 4180 completo, mas cobre o caso real
// de export do Excel/Sheets em pt-BR.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  for (const line of lines) {
    const cols: string[] = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if ((ch === "," || ch === ";") && !inQuotes) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function parseValorBR(raw: string): number {
  return Math.abs(lerValor(raw)); // negativo é convertido pra positivo, por regra
}

interface ImportRow {
  linha: number;
  tipo: "Pagar" | "Receber";
  subtipo: string | null;
  data: string;
  descricao: string;
  valor: number;
  conta: string;
  pago: boolean;
  competencia: string | null;
  categoria: string | null;
  contato: string | null;
  detalhes: string | null;
  numeroDocumento: string | null;
  formaPagamento: string | null;
  centroCusto: string | null;
  tags: string[];
  erro: string | null;
}

const normCat = (v: string) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export default function FinanceiroImportarMovimentacoes() {
  const { financeCategories, addFinanceCategory, financeBankAccounts, addFinanceBankAccount, financeCentrosCusto, addFinanceCentroCusto, addFinanceEntry, clienteBase } = useData();
  const [step, setStep] = useState<1 | 2>(1);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; falhas: number; detalhes: { linha: number; msg: string }[] } | null>(null);
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 });
  const [soErros, setSoErros] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBaixarModelo = () => {
    const csv = [TEMPLATE_HEADER.join(";"), TEMPLATE_EXAMPLE.join(";")].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "modelo_importacao_movimentacoes.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Lê a tabela (linhas × colunas, tudo como texto) já separada e monta as linhas da conferência.
  const processarTabela = (table: string[][], nome: string) => {
    setFileName(nome);
    if (table.length < 2) { toast.error("Arquivo vazio ou sem linhas de dados."); return; }
    const header = table[0].map(h => h.trim());
    const idx = (name: string) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
    const iTipo = idx("Tipo de Lançamento"), iData = idx("Data Pagamento"), iDesc = idx("Descrição"), iValor = idx("Valor"), iConta = idx("Conta"), iPago = idx("Pago");
    const iComp = idx("Data Competência"), iCat = idx("Categoria"), iContato = idx("Recebido de / Pago a"), iDet = idx("Detalhes"), iDoc = idx("Número do Documento"), iForma = idx("Forma de Pagamento"), iCC = idx("Centro de Custo"), iTags = idx("Tags");

    if ([iTipo, iData, iDesc, iValor, iConta, iPago].some(i => i === -1)) {
      toast.error("Colunas obrigatórias faltando. Baixe o modelo e confira os nomes das colunas.");
      return;
    }

    const parsed: ImportRow[] = table.slice(1).map((cols, i) => {
      const tipoRaw = (cols[iTipo] || "").trim();
      const tipoInfo = TIPO_MAP[tipoRaw.toLowerCase()];
      let erro: string | null = null;
      if (!tipoInfo) erro = `Tipo de Lançamento inválido: "${tipoRaw}"`;
      const descricao = (cols[iDesc] || "").slice(0, 255);
      if (!erro && !descricao) erro = "Descrição vazia";
      const valor = parseValorBR(cols[iValor] || "0");
      if (!erro && valor <= 0) erro = "Valor inválido ou zero";
      const conta = (cols[iConta] || "").trim();
      if (!erro && !conta) erro = "Conta vazia";
      const dataRaw = (cols[iData] || "").trim();
      if (!erro && !/^\d{2}\/\d{2}\/\d{4}$/.test(dataRaw)) erro = `Data inválida: "${dataRaw}" (use dd/mm/aaaa)`;

      return {
        linha: i + 2,
        tipo: tipoInfo?.type || "Pagar",
        subtipo: tipoInfo?.subtipo ?? null,
        data: dataRaw,
        descricao,
        valor,
        conta,
        pago: (cols[iPago] || "").trim().toLowerCase() === "sim",
        competencia: iComp >= 0 ? (cols[iComp] || "").trim() || null : null,
        categoria: iCat >= 0 ? (cols[iCat] || "").trim() || null : null,
        contato: iContato >= 0 ? (cols[iContato] || "").trim() || null : null,
        detalhes: iDet >= 0 ? (cols[iDet] || "").trim() || null : null,
        numeroDocumento: iDoc >= 0 ? (cols[iDoc] || "").trim() || null : null,
        formaPagamento: iForma >= 0 ? (cols[iForma] || "").trim() || null : null,
        centroCusto: iCC >= 0 ? (cols[iCC] || "").trim() || null : null,
        tags: iTags >= 0 ? (cols[iTags] || "").split(",").map(t => t.trim()).filter(Boolean) : [],
        erro,
      };
    });

    setRows(parsed);
    setResultado(null);
    setStep(2);
  };

  // Planilha do Excel (.xlsx): primeira aba; datas viram dd/mm/aaaa e números ficam no formato pt-BR.
  const lerXlsx = async (file: File): Promise<string[][]> => {
    const mod: any = await import("exceljs");
    const ExcelJS = mod.default ?? mod;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const dd = (n: number) => String(n).padStart(2, "0");
    const texto = (v: any): string => {
      if (v == null) return "";
      if (v instanceof Date) return `${dd(v.getUTCDate())}/${dd(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
      if (typeof v === "number") return String(v).replace(".", ",");
      if (typeof v === "object") return String(v.text ?? v.result ?? v.richText?.map((r: any) => r.text).join("") ?? "");
      return String(v).trim();
    };
    const out: string[][] = [];
    ws?.eachRow({ includeEmpty: false }, (row: any) => {
      const cols: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) cols.push(texto(row.getCell(c).value));
      if (cols.some((x) => x.trim())) out.push(cols);
    });
    return out;
  };

  const lerArquivo = async (file: File) => {
    const nome = file.name.toLowerCase();
    const csv = nome.endsWith(".csv") || nome.endsWith(".txt");
    if (!csv && !nome.endsWith(".xlsx")) {
      toast.error("Use um arquivo .xlsx (Excel) ou .csv.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) { toast.error("Arquivo maior que 5 MB."); return; }
    try {
      if (nome.endsWith(".xlsx")) {
        processarTabela(await lerXlsx(file), file.name);
      } else {
        const buf = await file.arrayBuffer();
        let text = new TextDecoder("utf-8").decode(buf);
        // CSV salvo pelo Excel em português costuma vir em Windows-1252: se o UTF-8 quebrou acentos, relê assim.
        if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buf);
        processarTabela(parseCsv(text), file.name);
      }
    } catch (err) {
      console.error("Erro ao ler o arquivo", err);
      toast.error("Não foi possível ler o arquivo. Confira se é uma planilha válida.");
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void lerArquivo(file);
  };

  const [arrastando, setArrastando] = useState(false);
  const aoSoltar = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void lerArquivo(file);
  };

  const handleBaixarModeloXlsx = async () => {
    const { exportarXlsx } = await import("../../lib/exportXlsx");
    await exportarXlsx("modelo_importacao_movimentacoes", [{
      nome: "Movimentações",
      colunas: TEMPLATE_HEADER.map((t) => ({ titulo: t, largura: Math.max(16, t.length + 4) })),
      linhas: [TEMPLATE_EXAMPLE],
    }]);
  };

  const handleImportar = async () => {
    const validas = rows.filter(r => !r.erro);
    if (validas.length === 0) { toast.error("Nenhuma linha válida para importar."); return; }
    setImportando(true);
    setProgresso({ feito: 0, total: validas.length });

    // Caches locais pra get-or-create dentro deste import — o estado do
    // DataContext só reflete o que foi criado numa re-renderização, então
    // sem isso a mesma "Nubank" ou "Aluguel" repetida em 50 linhas criaria
    // 50 contas/categorias duplicadas em vez de reaproveitar a primeira.
    const contasCache = new Map<string, string>((financeBankAccounts as any[]).map(c => [c.nome.toLowerCase(), c.id]));
    const categoriasCache = new Map<string, string>((financeCategories as any[]).map(c => [`${c.tipo}::${normCat(c.nome)}`, c.id]));
    const centrosCache = new Map<string, string>((financeCentrosCusto as any[]).map(c => [c.nome.toLowerCase(), c.id]));

    // Liga o lançamento ao cliente cadastrado: pelo nome exato (case-insensitive) ou pelo documento quando
    // o campo "Recebido de / Pago a" traz um CPF/CNPJ — só se houver exatamente um cadastro correspondente.
    const soDigitos = (v: any) => String(v ?? "").replace(/\D/g, "");
    const porNome = new Map<string, string[]>();
    const porDoc = new Map<string, string[]>();
    for (const c of (clienteBase || []) as any[]) {
      const n = String(c.name || "").trim().toLowerCase();
      if (n) porNome.set(n, [...(porNome.get(n) || []), c.id]);
      const d = soDigitos(c.documento);
      if (d.length >= 11) porDoc.set(d, [...(porDoc.get(d) || []), c.id]);
    }
    const resolverContato = (contato: string | null | undefined): string | null => {
      const t = String(contato || "").trim();
      if (!t) return null;
      const d = soDigitos(t);
      const idsDoc = d.length >= 11 ? porDoc.get(d) : undefined;
      if (idsDoc?.length === 1) return idsDoc[0];
      const ids = porNome.get(t.toLowerCase());
      return ids?.length === 1 ? ids[0] : null;
    };

    let ok = 0, falhas = 0;
    const detalhes: { linha: number; msg: string }[] = [];
    for (const r of validas) {
      try {
        let contaId = contasCache.get(r.conta.toLowerCase());
        if (!contaId) {
          const criada = await addFinanceBankAccount({ nome: r.conta, tipo: "CONTA_CORRENTE", saldo_inicial: 0, sinal_saldo_inicial: "ZERADO", is_principal: false, arquivada: false });
          contaId = criada?.id;
          if (contaId) contasCache.set(r.conta.toLowerCase(), contaId);
        }

        // Categoria: só usa uma que já existe no Plano de Contas (nunca cria). Sem correspondência, o lançamento
        // entra sem categoria e o nome informado fica guardado no texto.
        const tipoCategoria = r.tipo === "Receber" ? "Receita" : "Despesa";
        const nomeCategoria = r.categoria || (r.tipo === "Receber" ? "Importado" : `Importado (${r.subtipo})`);
        const categoryId = r.categoria ? (categoriasCache.get(`${tipoCategoria}::${normCat(r.categoria)}`) ?? null) : null;

        let centroCustoId: string | null = null;
        if (r.centroCusto) {
          centroCustoId = centrosCache.get(r.centroCusto.toLowerCase()) || null;
          if (!centroCustoId) {
            const criado = await addFinanceCentroCusto({ nome: r.centroCusto, codigo: "", orcamento: 0, gasto: 0, responsavel: "" });
            centroCustoId = criado?.id || null;
            if (centroCustoId) centrosCache.set(r.centroCusto.toLowerCase(), centroCustoId);
          }
        }

        await addFinanceEntry({
          type: r.tipo,
          description: r.descricao,
          category: nomeCategoria,
          category_id: categoryId,
          value: r.valor,
          date: r.data,
          status: r.pago ? "Pago" : "A Vencer",
          conta_bancaria_id: contaId || null,
          centro_custo_id: centroCustoId,
          counterparty: r.contato,
          contato_id: resolverContato(r.contato),
          notes: [r.detalhes, r.numeroDocumento ? `Doc: ${r.numeroDocumento}` : null].filter(Boolean).join(" — ") || null,
          numero_documento: r.numeroDocumento,
          payment_method: r.formaPagamento,
          competencia_date: r.competencia,
          tags: r.tags,
        } as any, { silent: true });
        ok++;
      } catch (err) {
        console.error("Erro ao importar linha", r.linha, err);
        falhas++;
        detalhes.push({ linha: r.linha, msg: (err as any)?.message ? String((err as any).message).slice(0, 160) : "Não foi possível salvar este lançamento." });
      }
      setProgresso((p) => ({ ...p, feito: p.feito + 1 }));
    }

    setImportando(false);
    setResultado({ ok, falhas, detalhes });
    if (ok > 0) toast.success(`${ok} lançamento(s) importado(s).`);
    if (falhas > 0) toast.error(`${falhas} lançamento(s) não foram importados.`);
  };

  const validas = rows.filter((r) => !r.erro);
  const comErro = rows.length - validas.length;
  const totalReceber = validas.filter((r) => r.tipo === "Receber").reduce((x, r) => x + r.valor, 0);
  const totalPagar = validas.filter((r) => r.tipo === "Pagar").reduce((x, r) => x + r.valor, 0);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const etapa: 1 | 2 | 3 = resultado ? 3 : step === 2 ? 2 : 1;
  const recomecar = () => { setStep(1); setRows([]); setResultado(null); setSoErros(false); setFileName(""); };
  const linhasVisiveis = soErros ? rows.filter((r) => r.erro) : rows;
  const categoriasExistentes = new Set((financeCategories as any[]).map((c) => `${c.tipo}::${normCat(c.nome)}`));
  const semCategoria = (r: ImportRow) => !!r.categoria && !categoriasExistentes.has(`${r.tipo === "Receber" ? "Receita" : "Despesa"}::${normCat(r.categoria)}`);
  const qtdSemCategoria = validas.filter(semCategoria).length;

  return (
    <PageContainer
      title="Importar Movimentações"
      description="Importa lançamentos de uma planilha Excel (.xlsx) ou CSV. Conta e centro de custo que ainda não existirem são criados; categorias não: use as do Plano de Contas."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Importar Movimentações" }]}
    >
      <div className="max-w-5xl mx-auto space-y-5 pb-12">
        {/* Passos */}
        <ol className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider list-none p-0 m-0 overflow-x-auto">
          {["Escolher arquivo", "Conferir", "Concluído"].map((nome, i) => {
            const n = i + 1;
            const ativo = etapa === n, feito = etapa > n;
            return (
              <li key={nome} className="flex items-center gap-2 shrink-0">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${ativo ? "bg-[var(--color-primary-blue)] text-white" : feito ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)]"}`}>
                  {feito ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}
                </span>
                <span className={ativo ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-faint)]"}>{nome}</span>
                {n < 3 && <span className="w-8 h-px bg-[var(--color-border-default)]" />}
              </li>
            );
          })}
        </ol>

        {etapa === 1 && (
          <>
            <Card
              onDragOver={(e: React.DragEvent) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={aoSoltar}
              className={`p-8 sm:p-10 border-2 border-dashed text-center transition-colors ${arrastando ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)]"}`}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv,.txt" onChange={handleFile} className="hidden" />
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <p className="text-base font-black text-[var(--color-text-primary)]">Arraste a planilha para cá</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 mb-4">ou escolha o arquivo no seu computador · Excel (.xlsx) ou CSV · até 5 MB</p>
              <Button onClick={() => fileInputRef.current?.click()} className="h-10 px-5 text-sm font-medium gap-2"><Upload className="w-4 h-4" /> Escolher arquivo</Button>
            </Card>

            <SecaoCard
              titulo="Antes de importar"
              icon={Download}
              direita={
                <span className="flex gap-2">
                  <Button variant="outline" onClick={handleBaixarModeloXlsx} className="h-8 px-3 text-xs font-medium gap-1.5"><Download className="w-3.5 h-3.5" /> Modelo Excel</Button>
                  <Button variant="outline" onClick={handleBaixarModelo} className="h-8 px-3 text-xs font-medium gap-1.5"><Download className="w-3.5 h-3.5" /> Modelo CSV</Button>
                </span>
              }
            >
              <p className="text-xs text-[var(--color-text-muted)] mb-4">Baixe o modelo, preencha uma linha por lançamento e envie aqui. Os nomes das colunas precisam ser iguais aos do modelo.</p>
              <div className="overflow-x-auto"><table className="min-w-[640px] w-full text-xs text-left mb-4">
                <thead className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
                  <tr><th className="py-2">Coluna obrigatória</th><th className="py-2">Regra</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  <tr><td className="py-2 font-medium">Tipo de Lançamento</td><td className="py-2 text-[var(--color-text-muted)]">Recebimentos · Despesas fixas · Despesas variáveis · Pessoas · Impostos</td></tr>
                  <tr><td className="py-2 font-medium">Data Pagamento</td><td className="py-2 text-[var(--color-text-muted)]">dd/mm/aaaa</td></tr>
                  <tr><td className="py-2 font-medium">Descrição</td><td className="py-2 text-[var(--color-text-muted)]">até 255 caracteres</td></tr>
                  <tr><td className="py-2 font-medium">Valor</td><td className="py-2 text-[var(--color-text-muted)]">número pt-BR (1.450,35) — negativo vira positivo</td></tr>
                  <tr><td className="py-2 font-medium">Conta</td><td className="py-2 text-[var(--color-text-muted)]">nome exato; se não existir, é criada</td></tr>
                  <tr><td className="py-2 font-medium">Pago</td><td className="py-2 text-[var(--color-text-muted)]">Sim / Não</td></tr>
                </tbody>
              </table></div>
              <details>
                <summary className="text-xs font-semibold text-[var(--color-text-muted)] cursor-pointer">Colunas opcionais</summary>
                <div className="overflow-x-auto"><table className="min-w-[640px] w-full text-xs text-left mt-3">
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    <tr><td className="py-2 font-medium w-44">Data Competência</td><td className="py-2 text-[var(--color-text-muted)]">dd/mm/aaaa</td></tr>
                    <tr><td className="py-2 font-medium">Categoria</td><td className="py-2 text-[var(--color-text-muted)]">nome igual ao do Plano de Contas; se não existir, o lançamento entra sem categoria (não é criada)</td></tr>
                    <tr><td className="py-2 font-medium">Recebido de / Pago a</td><td className="py-2 text-[var(--color-text-muted)]">nome do cliente/fornecedor (ou CPF/CNPJ) — liga ao cadastro quando achar um só</td></tr>
                    <tr><td className="py-2 font-medium">Detalhes</td><td className="py-2 text-[var(--color-text-muted)]">até 255 caracteres</td></tr>
                    <tr><td className="py-2 font-medium">Número do Documento</td><td className="py-2 text-[var(--color-text-muted)]">até 255 caracteres</td></tr>
                    <tr><td className="py-2 font-medium">Forma de Pagamento</td><td className="py-2 text-[var(--color-text-muted)]">Dinheiro · PIX · Transferência bancária · Boleto · Cartão de crédito · Cartão de débito</td></tr>
                    <tr><td className="py-2 font-medium">Centro de Custo</td><td className="py-2 text-[var(--color-text-muted)]">nome exato; se não existir, é criado</td></tr>
                    <tr><td className="py-2 font-medium">Tags</td><td className="py-2 text-[var(--color-text-muted)]">uma ou mais separadas por vírgula</td></tr>
                  </tbody>
                </table></div>
              </details>
            </SecaoCard>
          </>
        )}

        {etapa === 2 && (
          <>
            <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{fileName}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">Confira as linhas abaixo. Só as linhas sem erro serão importadas.</p>
              </div>
              <Button variant="outline" onClick={recomecar} disabled={importando} className="h-8 px-3 text-xs font-medium">Trocar arquivo</Button>
            </Card>

            <KpiTiles items={[
              { label: "Linhas lidas", value: rows.length, icon: FileSpreadsheet, tone: "primary" },
              { label: "Prontas para importar", value: validas.length, icon: CheckCircle2, tone: "success" },
              { label: "Com erro", value: comErro, icon: AlertTriangle, tone: comErro > 0 ? "danger" : "neutral", hint: comErro > 0 ? "Corrija na planilha e envie de novo, ou importe só as válidas" : "Nenhum problema encontrado" },
              { label: "Total a receber", value: brl(totalReceber), icon: Upload, tone: "success", hint: "Soma das linhas válidas de recebimento" },
              { label: "Total a pagar", value: brl(totalPagar), icon: Download, tone: "warning", hint: "Soma das linhas válidas de despesa" },
            ]} />

            {comErro > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => setSoErros(false)} className={`px-3 py-1.5 rounded-full font-bold border cursor-pointer ${!soErros ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>Todas ({rows.length})</button>
                <button type="button" onClick={() => setSoErros(true)} className={`px-3 py-1.5 rounded-full font-bold border cursor-pointer ${soErros ? "bg-[var(--color-danger)] text-white border-transparent" : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>Só com erro ({comErro})</button>
              </div>
            )}

            <Card className="overflow-hidden max-h-[50dvh] overflow-y-auto">
              <div className="overflow-x-auto"><table className="min-w-[720px] w-full text-xs text-left">
                <thead className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)] sticky top-0">
                  <tr><th className="px-4 py-2">Linha</th><th className="px-4 py-2">Tipo</th><th className="px-4 py-2">Descrição</th><th className="px-4 py-2">Data</th><th className="px-4 py-2">Conta</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2">Situação</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {linhasVisiveis.map((r) => (
                    <tr key={r.linha} className={r.erro ? "bg-[var(--color-danger)]/5" : ""}>
                      <td className="px-4 py-2 text-[var(--color-text-faint)]">{r.linha}</td>
                      <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.tipo === "Receber" ? "Receita" : "Despesa"}</td>
                      <td className="px-4 py-2 text-[var(--color-text-primary)]">{r.descricao || "—"}</td>
                      <td className="px-4 py-2 font-mono text-[var(--color-text-muted)]">{r.data}</td>
                      <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.conta || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{brl(r.valor)}</td>
                      <td className="px-4 py-2">
                        {r.erro ? <span className="inline-flex items-center gap-1 text-[var(--color-danger)]"><AlertTriangle className="w-3 h-3 shrink-0" /> {r.erro}</span> : <span className="text-[var(--color-success)] font-semibold">{r.pago ? "OK · já pago" : "OK · a vencer"}{semCategoria(r) && <span className="block font-normal text-[10px] text-[var(--color-warning)]">Categoria "{r.categoria}" não existe: entra sem categoria</span>}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </Card>

            {importando && (
              <Card className="p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-primary)] mb-2">
                  <span>Importando…</span><span className="tabular-nums">{progresso.feito} de {progresso.total}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                  <div className="h-full bg-[var(--color-primary-blue)] transition-all" style={{ width: `${progresso.total ? (progresso.feito / progresso.total) * 100 : 0}%` }} />
                </div>
              </Card>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={importando || validas.length === 0} onClick={handleImportar} className="h-10 px-6 text-sm font-medium">
                {importando ? "Importando..." : `Importar ${validas.length} lançamento(s)`}
              </Button>
              {qtdSemCategoria > 0 && !importando && <span className="text-xs text-[var(--color-warning)]">{qtdSemCategoria} linha(s) com categoria que não existe entram sem categoria.</span>}
              {comErro > 0 && !importando && <span className="text-xs text-[var(--color-text-muted)]">{comErro} linha(s) com erro ficam de fora.</span>}
            </div>
          </>
        )}

        {etapa === 3 && resultado && (
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-[var(--color-success)] mx-auto mb-3" />
            <p className="text-lg font-black text-[var(--color-text-primary)]">{resultado.ok} lançamento(s) importado(s)</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Eles já aparecem nas telas do Financeiro, no período das datas informadas.</p>
            {resultado.falhas > 0 && (
              <div className="mt-4 text-left max-w-xl mx-auto rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3">
                <p className="text-xs font-bold text-[var(--color-danger)] mb-1">{resultado.falhas} não foram importados</p>
                <ul className="text-[11px] text-[var(--color-text-muted)] space-y-0.5 list-disc pl-4 m-0">
                  {resultado.detalhes.slice(0, 8).map((d) => <li key={d.linha}>Linha {d.linha}: {d.msg}</li>)}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Link to="/app/financeiro/transacoes"><Button className="h-9 px-4 text-xs font-medium">Ver movimentações</Button></Link>
              <Button variant="outline" onClick={recomecar} className="h-9 px-4 text-xs font-medium">Importar outro arquivo</Button>
            </div>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
