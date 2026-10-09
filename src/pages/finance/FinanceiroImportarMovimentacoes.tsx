import { useRef, useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Download, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../contexts/DataContext";

type TipoLancamento = "Recebimentos" | "Despesas fixas" | "Despesas variáveis" | "Pessoas" | "Impostos";

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
  const n = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : Math.abs(n); // negativo é convertido pra positivo, por regra
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

export default function FinanceiroImportarMovimentacoes() {
  const { financeCategories, addFinanceCategory, financeBankAccounts, addFinanceBankAccount, financeCentrosCusto, addFinanceCentroCusto, addFinanceEntry, clienteBase } = useData();
  const [step, setStep] = useState<1 | 2>(1);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; falhas: number } | null>(null);
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

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && !file.name.toLowerCase().endsWith(".txt")) {
      toast.error("Só arquivos .csv são suportados nesta versão — exporte sua planilha como CSV (o Excel/Google Sheets fazem isso em Arquivo → Baixar/Exportar).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) { toast.error("Arquivo maior que 2 MB."); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const table = parseCsv(text);
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
    reader.readAsText(file, "utf-8");
  };

  const handleImportar = async () => {
    const validas = rows.filter(r => !r.erro);
    if (validas.length === 0) { toast.error("Nenhuma linha válida para importar."); return; }
    setImportando(true);

    // Caches locais pra get-or-create dentro deste import — o estado do
    // DataContext só reflete o que foi criado numa re-renderização, então
    // sem isso a mesma "Nubank" ou "Aluguel" repetida em 50 linhas criaria
    // 50 contas/categorias duplicadas em vez de reaproveitar a primeira.
    const contasCache = new Map<string, string>((financeBankAccounts as any[]).map(c => [c.nome.toLowerCase(), c.id]));
    const categoriasCache = new Map<string, string>((financeCategories as any[]).map(c => [`${c.tipo}::${c.nome.toLowerCase()}`, c.id]));
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
    for (const r of validas) {
      try {
        let contaId = contasCache.get(r.conta.toLowerCase());
        if (!contaId) {
          const criada = await addFinanceBankAccount({ nome: r.conta, tipo: "CONTA_CORRENTE", saldo_inicial: 0, sinal_saldo_inicial: "ZERADO", is_principal: false, arquivada: false });
          contaId = criada?.id;
          if (contaId) contasCache.set(r.conta.toLowerCase(), contaId);
        }

        const tipoCategoria = r.tipo === "Receber" ? "Receita" : "Despesa";
        const nomeCategoria = r.categoria || (r.tipo === "Receber" ? "Importado" : `Importado (${r.subtipo})`);
        const catKey = `${tipoCategoria}::${nomeCategoria.toLowerCase()}`;
        let categoryId = categoriasCache.get(catKey);
        if (!categoryId) {
          const criada = await addFinanceCategory({ nome: nomeCategoria, tipo: tipoCategoria, subtipo: r.tipo === "Pagar" ? r.subtipo : null });
          categoryId = criada?.id;
          if (categoryId) categoriasCache.set(catKey, categoryId);
        }

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
          category_id: categoryId || null,
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
      }
    }

    setImportando(false);
    setResultado({ ok, falhas });
    toast.success(`${ok} lançamento(s) importado(s).`);
  };

  return (
    <PageContainer
      title="Importar Movimentações"
      description="Importa lançamentos a partir de uma planilha CSV — cria automaticamente conta, categoria e centro de custo que ainda não existirem."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Importar Movimentações" }]}
    >
      <div className="max-w-3xl mx-auto space-y-6 pb-12">
        {step === 1 && (
          <>
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Regras de preenchimento</h3>
              <p className="text-xs text-[var(--color-text-faint)] mb-4">Apenas arquivos .csv, até 2 MB (esta versão não lê .xlsx binário — exporte sua planilha como CSV).</p>
              <table className="w-full text-xs text-left mb-4">
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
              </table>
              <details className="mb-4">
                <summary className="text-xs font-semibold text-[var(--color-text-muted)] cursor-pointer">Colunas opcionais</summary>
                <table className="w-full text-xs text-left mt-3">
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    <tr><td className="py-2 font-medium w-44">Data Competência</td><td className="py-2 text-[var(--color-text-muted)]">dd/mm/aaaa</td></tr>
                    <tr><td className="py-2 font-medium">Categoria</td><td className="py-2 text-[var(--color-text-muted)]">nome exato; se não existir, é criada</td></tr>
                    <tr><td className="py-2 font-medium">Recebido de / Pago a</td><td className="py-2 text-[var(--color-text-muted)]">nome do cliente/fornecedor</td></tr>
                    <tr><td className="py-2 font-medium">Detalhes</td><td className="py-2 text-[var(--color-text-muted)]">até 255 caracteres</td></tr>
                    <tr><td className="py-2 font-medium">Número do Documento</td><td className="py-2 text-[var(--color-text-muted)]">até 255 caracteres</td></tr>
                    <tr><td className="py-2 font-medium">Forma de Pagamento</td><td className="py-2 text-[var(--color-text-muted)]">Dinheiro · PIX · Transferência bancária · Boleto · Cartão de crédito · Cartão de débito · Remessa bancária · Cheque · Débito automático</td></tr>
                    <tr><td className="py-2 font-medium">Centro de Custo</td><td className="py-2 text-[var(--color-text-muted)]">nome exato; se não existir, é criado</td></tr>
                    <tr><td className="py-2 font-medium">Tags</td><td className="py-2 text-[var(--color-text-muted)]">uma ou mais separadas por vírgula</td></tr>
                  </tbody>
                </table>
              </details>
              <Button variant="outline" onClick={handleBaixarModelo} className="h-9 px-4 text-xs font-medium gap-1.5"><Download className="w-3.5 h-3.5" /> Baixar modelo</Button>
            </Card>

            <Card className="p-8 border-2 border-dashed border-[var(--color-border-default)] text-center">
              <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
              <FileSpreadsheet className="w-8 h-8 mx-auto mb-3 text-[var(--color-text-faint)]" />
              <p className="text-xs text-[var(--color-text-muted)] mb-3">Formato .csv, máximo 2 MB</p>
              <Button onClick={() => fileInputRef.current?.click()} className="h-9 px-4 text-xs font-medium gap-1.5"><Upload className="w-3.5 h-3.5" /> Importar Planilha</Button>
            </Card>
          </>
        )}

        {step === 2 && (
          <>
            <Card className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--color-text-primary)]">{fileName}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">{rows.length} linha(s) lida(s) · {rows.filter(r => r.erro).length} com erro</p>
              </div>
              <Button variant="outline" onClick={() => { setStep(1); setRows([]); setResultado(null); }} className="h-8 px-3 text-xs font-medium">Trocar arquivo</Button>
            </Card>

            {resultado ? (
              <Card className="p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-[var(--color-success)] mx-auto mb-2" />
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{resultado.ok} lançamento(s) importado(s) com sucesso.</p>
                {resultado.falhas > 0 && <p className="text-xs text-[var(--color-danger)] mt-1">{resultado.falhas} falharam — veja o console para detalhes.</p>}
                <Button onClick={() => { setStep(1); setRows([]); setResultado(null); }} className="h-9 px-4 text-xs font-medium mt-4">Importar outro arquivo</Button>
              </Card>
            ) : (
              <>
                <Card className="overflow-hidden max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)] sticky top-0">
                      <tr><th className="px-4 py-2">Linha</th><th className="px-4 py-2">Descrição</th><th className="px-4 py-2">Data</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-subtle)]">
                      {rows.map(r => (
                        <tr key={r.linha} className={r.erro ? "bg-[var(--color-danger)]/5" : ""}>
                          <td className="px-4 py-2 text-[var(--color-text-faint)]">{r.linha}</td>
                          <td className="px-4 py-2 text-[var(--color-text-primary)]">{r.descricao || "—"}</td>
                          <td className="px-4 py-2 font-mono text-[var(--color-text-muted)]">{r.data}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{r.valor.toFixed(2)}</td>
                          <td className="px-4 py-2">
                            {r.erro ? <span className="inline-flex items-center gap-1 text-[var(--color-danger)]"><AlertTriangle className="w-3 h-3" /> {r.erro}</span> : <span className="text-[var(--color-success)]">OK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                <Button disabled={importando || rows.every(r => r.erro)} onClick={handleImportar} className="h-10 px-6 text-sm font-medium">
                  {importando ? "Importando..." : `Importar ${rows.filter(r => !r.erro).length} lançamento(s)`}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
