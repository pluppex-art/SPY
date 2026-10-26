import { useMemo, useState } from "react";
import Papa from "papaparse";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  UploadCloud, FileText, CheckCircle2, AlertCircle,
  Download, Table, Sparkles, ArrowLeft, ArrowRight,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { friendlyError } from "../../lib/friendlyError";
import { getStageId, funilStageNames, pipelineIdDoFunil, phoneKey } from "../../lib/funnelIds";

// FASE 5.5 do mandato "Aurora + S.P.Y. + Integração com Sistemas Externos" (2026-09-19).
// Substitui o importador anterior, que tinha 3 bugs reais confirmados por leitura de código:
// (1) split(",") manual quebrava em qualquer campo com vírgula dentro de aspas — troca pra
// papaparse (RFC4180 real); (2) mapeamento "automático" nunca era mostrado/editável pelo
// usuário — agora é um passo real da tela; (3) o insert reportava "sucesso" mesmo quando o
// próprio Supabase retornava erro (`console.warn` e seguia adiante) — e o payload antigo
// escrevia "comercial"/"1" em colunas uuid (`pipeline_id`/`stage_id`) e uma string "R$ 0" numa
// coluna numeric — ambos tipos incompatíveis que o Postgres rejeitaria; o import "sempre
// funcionava" só porque o erro nunca chegava ao usuário. Este arquivo usa as mesmas colunas
// camelCase que o resto do app já usa com sucesso (DataContext.addLead, POST /api/v1/leads).

type TargetFieldKey = "name" | "company" | "email" | "phone" | "value" | "source" | "lead_interesse_cliente" | "__skip__";

const TARGET_FIELDS: { key: TargetFieldKey; label: string; required?: boolean }[] = [
  { key: "name", label: "Nome", required: true },
  { key: "company", label: "Empresa" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefone" },
  { key: "value", label: "Valor estimado (R$)" },
  { key: "source", label: "Origem" },
  { key: "lead_interesse_cliente", label: "Interesse do cliente" },
  { key: "__skip__", label: "Não importar esta coluna" },
];

function guessTargetField(header: string): TargetFieldKey {
  const h = header.toLowerCase();
  if (h.includes("nome") || h.includes("name")) return "name";
  if (h.includes("empresa") || h.includes("company")) return "company";
  if (h.includes("email") || h.includes("e-mail")) return "email";
  if (h.includes("tel") || h.includes("phone") || h.includes("whats")) return "phone";
  if (h.includes("valor") || h.includes("value")) return "value";
  if (h.includes("origem") || h.includes("source")) return "source";
  if (h.includes("interesse")) return "lead_interesse_cliente";
  return "__skip__";
}

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3},)/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

type Step = "upload" | "mapping" | "review" | "done";

interface ImportResult {
  inserted: number;
  skippedDuplicates: number;
  failed: number;
  errors: string[];
}

export default function CRMImportacao() {
  const { user, activeTenantId, activeFilialId } = useAuth() as any;
  const { refetchLeads, leads, funis } = useData() as any;

  // Funil e etapa de destino: o importador jogava tudo no funil SDR (etapa fixa "sdr-1"), que some
  // do Pipeline se a empresa não tem funil SDR, e a tela prometia o funil comercial.
  const funisAtivos = useMemo(() => (funis as any[]).filter((f) => f.ativo !== false && funilStageNames(f).length > 0), [funis]);
  const [funilDestinoId, setFunilDestinoId] = useState<string>("");
  const [etapaDestinoIdx, setEtapaDestinoIdx] = useState<number>(0);
  const funilDestino = funisAtivos.find((f) => f.id === funilDestinoId) ?? funisAtivos.find((f) => f.tipo !== "sdr_ia") ?? funisAtivos[0];

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, TargetFieldKey>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [duplicateRowIndexes, setDuplicateRowIndexes] = useState<Set<number>>(new Set());
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);

    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedHeaders = results.meta.fields ?? [];
        if (parsedHeaders.length === 0 || results.data.length === 0) {
          toast.error("Não foi possível identificar colunas neste arquivo. Confira se é um CSV válido com cabeçalho.");
          return;
        }
        const guessed: Record<string, TargetFieldKey> = {};
        parsedHeaders.forEach((h) => { guessed[h] = guessTargetField(h); });
        setHeaders(parsedHeaders);
        setRawRows(results.data);
        setMapping(guessed);
        setStep("mapping");
      },
      error: (err) => {
        toast.error(`Falha ao ler o arquivo: ${friendlyError(err)}`);
      },
    });
  };

  const buildMappedRows = () => {
    return rawRows.map((row) => {
      const record: Record<string, any> = {
        name: "",
        company: "",
        email: "",
        phone: "",
        value: 0,
        source: "",
        lead_interesse_cliente: "",
      };
      for (const header of headers) {
        const target = mapping[header];
        if (!target || target === "__skip__") continue;
        const raw = (row[header] ?? "").trim();
        record[target] = target === "value" ? parseMoney(raw) : raw;
      }
      return record;
    }).filter((r) => r.name || r.email || r.phone);
  };

  const mappedRows = step === "review" || step === "done" ? buildMappedRows() : [];

  const goToReview = async () => {
    const hasNameMapped = Object.values(mapping).includes("name");
    if (!hasNameMapped) {
      toast.error("Mapeie ao menos uma coluna para o campo 'Nome' antes de continuar.");
      return;
    }
    const rows = buildMappedRows();
    if (rows.length === 0) {
      toast.error("Nenhuma linha válida encontrada após o mapeamento (precisa de nome, e-mail ou telefone).");
      return;
    }

    setCheckingDuplicates(true);
    setStep("review");
    try {
      // Compara por e-mail (minúsculo) e telefone normalizado (DDD + 8 últimos dígitos), contra os
      // leads já carregados da empresa E contra as linhas anteriores do próprio arquivo. Antes era
      // texto cru e uma consulta .or() que estourava a URL em arquivo grande (e o erro virava
      // "sem duplicados", importando tudo duplicado sem avisar).
      const emailsExistentes = new Set<string>();
      const telefonesExistentes = new Set<string>();
      for (const l of (leads as any[]) || []) {
        if (l.email) emailsExistentes.add(String(l.email).trim().toLowerCase());
        for (const t of [l.phone, l.mobile_wa]) { const k = phoneKey(t); if (k.length >= 8) telefonesExistentes.add(k); }
      }
      const dupIndexes = new Set<number>();
      const vistosEmail = new Set<string>();
      const vistosTel = new Set<string>();
      rows.forEach((r, idx) => {
        const em = String(r.email || "").trim().toLowerCase();
        const tk = phoneKey(r.phone);
        const telValido = tk.length >= 8;
        if ((em && (emailsExistentes.has(em) || vistosEmail.has(em))) || (telValido && (telefonesExistentes.has(tk) || vistosTel.has(tk)))) {
          dupIndexes.add(idx);
        }
        if (em) vistosEmail.add(em);
        if (telValido) vistosTel.add(tk);
      });
      setDuplicateRowIndexes(dupIndexes);
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleImport = async () => {
    if (!supabase || !activeTenantId) {
      toast.error("Sem conexão com o banco ou tenant ativo.");
      return;
    }
    if (!funilDestino) {
      toast.error("Nenhum funil encontrado — crie um funil em Configurações › CRM › Funis antes de importar.");
      return;
    }
    setIsImporting(true);

    const allRows = buildMappedRows();
    const rowsToInsert = allRows
      .map((r, idx) => ({ row: r, idx }))
      .filter(({ idx }) => !(skipDuplicates && duplicateRowIndexes.has(idx)))
      .map(({ row }) => ({
        name: row.name || "Lead Importado",
        company: row.company,
        email: row.email,
        phone: row.phone,
        value: row.value,
        source: row.source || "Importação CSV",
        lead_interesse_cliente: row.lead_interesse_cliente,
        status: "Novo",
        stageId: funilDestino ? getStageId(funilDestino.id, etapaDestinoIdx) : "1",
        pipelineId: funilDestino ? pipelineIdDoFunil(funilDestino) : "comercial",
        filial_id: activeFilialId ?? null,
        seller: user?.name || "Sistema",
        tenant_id: activeTenantId,
        scoreIA: 50,
        date: new Date().toISOString().split("T")[0],
        customFields: {},
      }));

    const skippedDuplicates = allRows.length - rowsToInsert.length;

    // Lotes de 25: um erro de tipo/constraint em UMA linha não pode fazer o Supabase rejeitar
    // as outras ~1000 linhas de um arquivo grande num único INSERT — e também não faz sentido
    // 1 requisição por linha. Cada lote reporta seu próprio sucesso/falha, sem fingir 100%.
    const BATCH_SIZE = 25;
    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
      const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase.from("leads").insert(batch).select("id");
      if (error) {
        console.error(`[Importação] Lote ${i / BATCH_SIZE + 1} falhou:`, error.message);
        errors.push(`Lote com linhas ${i + 1}–${i + batch.length}: ${error.message}`);
      } else {
        inserted += data?.length ?? batch.length;
      }
    }

    const failed = rowsToInsert.length - inserted;
    setResult({ inserted, skippedDuplicates, failed, errors });
    setIsImporting(false);
    setStep("done");

    if (failed === 0) {
      toast.success(`${inserted} lead(s) importado(s) com sucesso.`);
    } else {
      toast.error(`${inserted} importado(s), ${failed} falharam. Veja o detalhe na tela.`);
    }
    if (refetchLeads) refetchLeads();
  };

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," + "Nome,Empresa,Email,Telefone,Valor\nJoão Silva,Acme Corp,joao@acme.com,11999998888,5000\nMaria Santos,Tech Soluções,maria@tech.com,21988887777,12000";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "modelo_importacao_leads_spy.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reset = () => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setDuplicateRowIndexes(new Set());
    setResult(null);
  };

  return (
    <PageContainer
      title="Importação de Leads em Massa"
      description="Importe listas de contatos e leads via CSV diretamente para o funil comercial do S.P.Y., com mapeamento de colunas e detecção de duplicados."
      actions={
        <Button variant="outline" onClick={handleDownloadTemplate} className="h-9 px-3.5 text-xs font-bold gap-1.5 rounded-xl">
          <Download className="w-3.5 h-3.5" /> Baixar Planilha Modelo
        </Button>
      }
    >
      <div className="max-w-4xl space-y-6">
        {step === "upload" && (
          <div className="p-8 border-2 border-dashed border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)] rounded-3xl bg-[var(--color-surface)] text-center transition-all">
            <UploadCloud className="w-12 h-12 mx-auto mb-3 text-[var(--color-primary-blue)] opacity-80" />
            <h4 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">
              Selecione ou arraste seu arquivo .CSV
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] mb-4 max-w-sm mx-auto">
              Qualquer cabeçalho funciona — você escolhe quais colunas do arquivo correspondem a quais campos do CRM no próximo passo.
            </p>
            <label className="inline-flex">
              <input type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
              <span className="px-5 py-2.5 bg-[var(--color-primary-blue)] text-white text-xs font-bold rounded-xl cursor-pointer hover:opacity-90 transition-all shadow-xs">
                Escolher Arquivo
              </span>
            </label>
            {file && (
              <div className="mt-4 p-3 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-border-subtle)] inline-flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)]">
                <FileText className="w-4 h-4 text-[var(--color-primary-blue)]" />
                <span>{file.name}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
          </div>
        )}

        {step === "mapping" && (
          <Card className="p-5 space-y-4">
            <h4 className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              <Table className="w-4 h-4 text-[var(--color-primary-blue)]" /> Mapeamento de Colunas
              <Badge variant="secondary">{rawRows.length} linha(s) no arquivo</Badge>
            </h4>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Já sugerimos um mapeamento com base no nome de cada coluna — revise e ajuste antes de continuar. Colunas sem
              correspondência clara vêm marcadas como "Não importar".
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] text-[10px] font-bold uppercase text-[var(--color-text-muted)]">
                    <th className="py-2 px-3">Coluna do arquivo</th>
                    <th className="py-2 px-3">Exemplo</th>
                    <th className="py-2 px-3">Campo do CRM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {headers.map((h) => (
                    <tr key={h}>
                      <td className="py-2 px-3 font-bold text-[var(--color-text-primary)]">{h}</td>
                      <td className="py-2 px-3 text-[var(--color-text-muted)] truncate max-w-[180px]">{rawRows[0]?.[h] ?? ""}</td>
                      <td className="py-2 px-3">
                        <select
                          value={mapping[h] ?? "__skip__"}
                          onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as TargetFieldKey }))}
                          className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-2 py-1.5 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                        >
                          {TARGET_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between pt-3 border-t border-[var(--color-border-subtle)]">
              <Button variant="outline" onClick={reset} className="h-9 text-xs font-bold gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</Button>
              <Button onClick={goToReview} className="h-9 text-xs font-bold gap-1.5">Continuar <ArrowRight className="w-3.5 h-3.5" /></Button>
            </div>
          </Card>
        )}

        {step === "review" && (
          <Card className="p-5 space-y-4">
            <h4 className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--color-primary-blue)]" /> Revisão antes de importar
            </h4>
            {checkingDuplicates ? (
              <div className="text-center py-8 text-[var(--color-text-faint)] text-xs">Checando duplicados...</div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label className="space-y-1">
                    <span className="font-bold text-[var(--color-text-primary)]">Funil de destino</span>
                    <select
                      value={funilDestino?.id ?? ""}
                      onChange={(e) => { setFunilDestinoId(e.target.value); setEtapaDestinoIdx(0); }}
                      className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-2 py-1.5 text-xs"
                    >
                      {funisAtivos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold text-[var(--color-text-primary)]">Etapa inicial</span>
                    <select
                      value={etapaDestinoIdx}
                      onChange={(e) => setEtapaDestinoIdx(Number(e.target.value))}
                      className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-2 py-1.5 text-xs"
                    >
                      {(funilDestino ? funilStageNames(funilDestino) : []).map((n, i) => <option key={i} value={i}>{n}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <Badge variant="secondary">{mappedRows.length} linha(s) mapeada(s)</Badge>
                  {duplicateRowIndexes.size > 0 && <Badge variant="destructive">{duplicateRowIndexes.size} duplicado(s) encontrado(s)</Badge>}
                  {duplicateRowIndexes.size > 0 && (
                    <label className="flex items-center gap-1.5 font-bold text-[var(--color-text-primary)] cursor-pointer">
                      <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
                      Pular duplicados (já existem, ou se repetem no arquivo, por e-mail/telefone)
                    </label>
                  )}
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-border-subtle)] text-[10px] font-bold uppercase text-[var(--color-text-muted)]">
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Nome</th>
                        <th className="py-2 px-3">E-mail</th>
                        <th className="py-2 px-3">Telefone</th>
                        <th className="py-2 px-3">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-subtle)]">
                      {mappedRows.slice(0, 50).map((r, i) => (
                        <tr key={i} className={duplicateRowIndexes.has(i) ? "opacity-50" : ""}>
                          <td className="py-2 px-3">
                            {duplicateRowIndexes.has(i)
                              ? <Badge variant="destructive">Duplicado</Badge>
                              : <Badge variant="success">Novo</Badge>}
                          </td>
                          <td className="py-2 px-3 text-[var(--color-text-primary)]">{r.name}</td>
                          <td className="py-2 px-3 text-[var(--color-text-muted)]">{r.email}</td>
                          <td className="py-2 px-3 text-[var(--color-text-muted)]">{r.phone}</td>
                          <td className="py-2 px-3 text-[var(--color-text-muted)]">{r.value ? `R$ ${r.value}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {mappedRows.length > 50 && (
                    <p className="text-[10px] text-[var(--color-text-faint)] text-center pt-2">
                      Mostrando 50 de {mappedRows.length} linhas — todas serão importadas.
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="flex justify-between pt-3 border-t border-[var(--color-border-subtle)]">
              <Button variant="outline" onClick={() => setStep("mapping")} className="h-9 text-xs font-bold gap-1.5" disabled={isImporting}>
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao mapeamento
              </Button>
              <Button onClick={handleImport} disabled={isImporting || checkingDuplicates} className="h-10 px-6 text-xs font-bold gap-2">
                <Sparkles className="w-4 h-4" />
                {isImporting ? "Importando..." : "Confirmar Importação"}
              </Button>
            </div>
          </Card>
        )}

        {step === "done" && result && (
          <Card className="p-5 space-y-3">
            <div className={`p-4 rounded-2xl border flex items-center gap-3 ${result.failed === 0 ? "bg-emerald-500/10 border-emerald-500/25" : "bg-amber-500/10 border-amber-500/25"}`}>
              {result.failed === 0
                ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                : <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />}
              <div>
                <p className={`text-xs font-bold ${result.failed === 0 ? "text-emerald-500" : "text-amber-500"}`}>
                  {result.inserted} lead(s) importado(s){result.skippedDuplicates > 0 ? `, ${result.skippedDuplicates} pulado(s) por duplicidade` : ""}{result.failed > 0 ? `, ${result.failed} falharam` : ""}.
                </p>
                {result.errors.length > 0 && (
                  <ul className="text-[11px] text-[var(--color-text-muted)] mt-1 space-y-0.5">
                    {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                )}
              </div>
            </div>
            <Button variant="outline" onClick={reset} className="h-9 text-xs font-bold">Importar outro arquivo</Button>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
