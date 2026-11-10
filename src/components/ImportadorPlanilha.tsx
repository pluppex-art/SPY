import { useMemo, useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { readTableFile, type ParsedTable } from "../lib/tableFile";
import {
  MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, buildRows, findDuplicates, guessColumns, templateToCsv,
  type BuiltRow, type ImportSpec,
} from "../lib/importer";
import { friendlyError } from "../lib/friendlyError";
import { suppressPopups } from "../lib/popups";
import { Upload } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useData } from "../contexts/DataContext";
import { leadsSpec } from "../lib/importSpecs";
import { isVendedorColab } from "../lib/sellers";
import { DIST_PADRAO, distribuir, parseDist, type DistConfig, type DistModo } from "../lib/importer";

// Importador de planilha genérico (CSV/XLSX, inclusive a exportação do Google Forms/Sheets): 1) arquivo,
// 2) conferir o mapeamento de colunas e as opções, 3) importar em lotes com barra de progresso e duplicados
// ignorados, 4) resultado com o que entrou, o que foi pulado e o que falhou (com a linha da planilha).
// O que muda de uma tela para outra está só no `spec` (src/lib/importSpecs.ts).

type Step = "file" | "map" | "run" | "done";

interface Result { inserted: number; duplicates: number; failed: number; empty: number; errors: string[]; notes: string[] }

export function ImportadorPlanilha({ spec, open, onClose }: { spec: ImportSpec; open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>("file");
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [columnMap, setColumnMap] = useState<string[]>([]);
  const [opt, setOpt] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);
  const cancelRef = useRef(false);

  const options = useMemo(() => spec.options?.(opt) ?? [], [spec, opt]);
  const optValues = useMemo(() => {
    const v: Record<string, string> = {};
    for (const o of options) v[o.key] = opt[o.key] ?? o.default ?? o.choices?.[0]?.value ?? (o.type === "vendedores" ? DIST_PADRAO : "");
    return v;
  }, [options, opt]);

  const reset = () => { setStep("file"); setTable(null); setColumnMap([]); setResult(null); setProgress(null); cancelRef.current = false; };
  const close = () => { if (step === "run") return; reset(); onClose(); };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setReading(true);
    try {
      const t = await readTableFile(file, { maxBytes: MAX_IMPORT_BYTES, maxRows: MAX_IMPORT_ROWS });
      setTable(t);
      setColumnMap(guessColumns(t.headers, spec.fields));
      setStep("map");
    } catch (e: any) {
      toast.error(e?.message || "Não consegui ler este arquivo.");
    } finally {
      setReading(false);
    }
  };

  const mappedKeys = new Set(columnMap.filter(Boolean));
  const missingRequired = spec.fields.filter((f) => f.required && !mappedKeys.has(f.key));
  const built = useMemo(() => (table ? buildRows(table.headers, table.rows, columnMap, spec) : null), [table, columnMap, spec]);

  const downloadTemplate = () => {
    const blob = new Blob([templateToCsv(spec.template)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `modelo_importacao_${spec.entity}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const run = async () => {
    if (!built || !table) return;
    if (missingRequired.length) { toast.error(`Indique a coluna de: ${missingRequired.map((f) => f.label).join(", ")}.`); return; }
    if (built.rows.length === 0) { toast.error("Nenhuma linha válida com esse mapeamento."); return; }
    cancelRef.current = false;
    suppressPopups(10 * 60_000);
    setStep("run");
    const res: Result = { inserted: 0, duplicates: 0, failed: 0, empty: built.empty, errors: [], notes: [] };
    try {
      let existing = new Set<string>();
      if (spec.loadExistingKeys && spec.rowKeys) {
        setProgress({ label: "Conferindo quem já está cadastrado…", done: 0, total: 0 });
        existing = await spec.loadExistingKeys((n) => setProgress({ label: "Conferindo quem já está cadastrado…", done: n, total: 0 }));
      }
      const dups = findDuplicates(built.rows, spec, existing);
      res.duplicates = dups.size;
      let todo = built.rows.filter((_, i) => !dups.has(i));
      if (spec.resolve) {
        setProgress({ label: "Ligando cada linha ao cadastro certo…", done: 0, total: 0 });
        const r = await spec.resolve(todo, optValues);
        todo = r.rows;
        res.notes.push(...(r.notes || []));
        res.failed += r.rejected.length;
        const byReason = new Map<string, number[]>();
        r.rejected.forEach((x) => byReason.set(x.reason, [...(byReason.get(x.reason) || []), x.line + off]));
        byReason.forEach((lines, reason) => res.errors.push(`${reason} — ${lines.length} linha(s), ex.: ${lines.slice(0, 5).join(", ")}`));
      }
      if (off > 1) res.notes.push(`Cabeçalho encontrado na linha ${off}; as ${off - 1} linha(s) de título acima foram ignoradas.`);

      // Um lote que falha NÃO pode derrubar as outras linhas: isola a(s) linha(s) com problema (divide o lote ao meio até achar)
      // e importa o resto. Se o erro for sistemático (mesmo erro na 1ª, do meio e última linha), para logo em vez de repetir.
      const falhas = new Map<string, number[]>();
      const marca = (r: BuiltRow, msg: string) => { res.failed++; falhas.set(msg, [...(falhas.get(msg) || []), r.line + off]); };
      const montar = (c: BuiltRow[]) => c.map((r) => spec.build(r.values, r.extras, optValues));
      const enviar = async (c: BuiltRow[]): Promise<void> => {
        const err = await spec.insertBatch(montar(c));
        if (!err) { res.inserted += c.length; return; }
        if (c.length === 1) { marca(c[0], err); return; }
        const meio = Math.ceil(c.length / 2);
        await enviar(c.slice(0, meio));
        await enviar(c.slice(meio));
      };
      const size = spec.batchSize ?? 200;
      let abortou = false;
      for (let i = 0; i < todo.length; i += size) {
        if (cancelRef.current) { res.errors.push("Importação interrompida por você. O que já entrou foi mantido."); break; }
        const chunk = todo.slice(i, i + size);
        setProgress({ label: "Importando…", done: i, total: todo.length });
        const err = await spec.insertBatch(montar(chunk));
        if (!err) { res.inserted += chunk.length; continue; }
        if (chunk.length > 2) {
          const amostra = [chunk[0], chunk[Math.floor(chunk.length / 2)], chunk[chunk.length - 1]];
          const msgs = await Promise.all(amostra.map((r) => spec.insertBatch(montar([r]))));
          if (msgs.every((m) => m === err)) { // erro sistemático: não adianta tentar o resto
            chunk.forEach((r) => marca(r, err));
            const restantes = todo.length - (i + chunk.length);
            if (restantes > 0) res.errors.push(`Parei após o mesmo erro em todas as linhas testadas (${err}). As outras ${restantes.toLocaleString("pt-BR")} linha(s) não foram tentadas — corrija e importe de novo.`);
            abortou = true;
            break;
          }
          // alguma linha entrou: já está gravada; só falta tratar as que não entraram
          const ok = amostra.filter((_, k) => !msgs[k]).length;
          res.inserted += ok;
          const resto = chunk.filter((r) => !amostra.includes(r));
          amostra.forEach((r, k) => { if (msgs[k]) marca(r, msgs[k] as string); });
          const meio = Math.ceil(resto.length / 2);
          await enviar(resto.slice(0, meio));
          await enviar(resto.slice(meio));
        } else {
          await enviar(chunk);
        }
      }
      falhas.forEach((linhas, msg) => res.errors.push(`${linhas.length.toLocaleString("pt-BR")} linha(s) com problema — ${msg}. Ex.: linha(s) ${linhas.slice(0, 6).join(", ")}${linhas.length > 6 ? "…" : ""}`));
      void abortou;
    } catch (e: any) {
      res.errors.push(friendlyError(e));
    }
    suppressPopups(20_000); // eco do tempo real ainda chega alguns segundos depois
    setProgress(null);
    setResult(res);
    setStep("done");
    spec.onDone?.();
    if (res.inserted > 0 && res.failed === 0) toast.success(`${res.inserted} importado(s).`);
  };

  const off = table?.headerRow ?? 1; // linha da planilha = linha de dados + off
  const sample = (col: number) => table?.rows.slice(0, 3).map((r) => r[col]).filter(Boolean).join(" · ").slice(0, 60) || "—";
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <Modal isOpen={open} onClose={close} title={spec.title} description={spec.hint} maxWidth="max-w-3xl">
      {step === "file" && (
        <div className="space-y-4">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFile(e.dataTransfer.files?.[0]); }}
            className={`flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border-2 border-dashed cursor-pointer text-center transition-colors ${dragging ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]"}`}
          >
            {reading ? <Loader2 className="w-10 h-10 animate-spin text-[var(--color-primary-blue)]" /> : <UploadCloud className="w-10 h-10 text-[var(--color-primary-blue)]" />}
            <span className="text-sm font-bold text-[var(--color-text-primary)]">{reading ? "Lendo a planilha…" : "Escolha ou arraste a planilha"}</span>
            <span className="text-xs text-[var(--color-text-muted)] max-w-md">
              Aceita <b>.xlsx</b>, <b>.xls</b> e <b>.csv</b> — inclusive o que você baixa do Google Forms / Google Planilhas (Arquivo › Fazer download). Até {MAX_IMPORT_ROWS.toLocaleString("pt-BR")} linhas. A primeira linha precisa ser o cabeçalho.
            </span>
            <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" disabled={reading} onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <div className="flex justify-end">
            <Button variant="outline" onClick={downloadTemplate} className="h-9 px-3.5 text-xs font-bold gap-1.5 rounded-xl"><Download className="w-3.5 h-3.5" /> Baixar planilha modelo</Button>
          </div>
        </div>
      )}

      {step === "map" && table && built && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <FileSpreadsheet className="w-4 h-4 text-[var(--color-primary-blue)]" />
            <b className="text-[var(--color-text-primary)] truncate">{table.fileName}</b>
            <span>· {table.rows.length.toLocaleString("pt-BR")} linha(s)</span>
            {(table.headerRow ?? 1) > 1 && <span className="text-[var(--color-text-faint)]">· cabeçalho na linha {table.headerRow} (título acima ignorado)</span>}
          </div>

          {options.filter((o) => o.type === "vendedores").map((o) => (
            <DistribuicaoEditor key={o.key} label={o.label} vendedores={o.vendedores || []} rodizioElegiveis={o.rodizioElegiveis} semEu={o.semEu} value={optValues[o.key]} total={built.rows.length}
              onChange={(v) => setOpt((p) => ({ ...p, [o.key]: v }))} />
          ))}

          {options.some((o) => o.type !== "vendedores") && (
            <div className="grid sm:grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
              {options.filter((o) => o.type !== "vendedores").map((o) => (
                <label key={o.key} className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">
                  {o.label}
                  {o.type === "select" ? (
                    <select value={optValues[o.key]} onChange={(e) => setOpt((p) => ({ ...p, [o.key]: e.target.value }))} className="h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]">
                      {o.choices?.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  ) : (
                    <input value={optValues[o.key]} placeholder={o.placeholder} maxLength={120} onChange={(e) => setOpt((p) => ({ ...p, [o.key]: e.target.value }))} className="h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" />
                  )}
                </label>
              ))}
            </div>
          )}

          <p className="text-[11px] text-[var(--color-text-muted)]">
            Já sugerimos qual coluna é qual. Confira.{spec.keepExtras ? <> O que ficar em <b>“Guardar nas observações”</b> não se perde — vai como texto no cadastro.</> : " Colunas marcadas como “Não importar” são ignoradas."}
          </p>
          <div className="max-h-[38vh] overflow-auto rounded-xl border border-[var(--color-border-subtle)]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--color-surface-sunken)] text-[10px] uppercase text-[var(--color-text-muted)]">
                <tr><th className="py-2 px-3">Coluna da planilha</th><th className="py-2 px-3">Exemplo</th><th className="py-2 px-3">Vai para</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {table.headers.map((h, i) => (
                  <tr key={i}>
                    <td className="py-1.5 px-3 font-bold text-[var(--color-text-primary)] max-w-[200px] truncate" title={h}>{h}</td>
                    <td className="py-1.5 px-3 text-[var(--color-text-muted)] max-w-[180px] truncate">{sample(i)}</td>
                    <td className="py-1.5 px-3">
                      <select
                        value={columnMap[i] ?? ""}
                        onChange={(e) => setColumnMap((prev) => { const n = prev.slice(); const v = e.target.value; if (v) n.forEach((x, j) => { if (x === v) n[j] = ""; }); n[i] = v; return n; })}
                        className="h-8 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] w-full"
                      >
                        <option value="">{spec.keepExtras ? "Guardar nas observações" : "Não importar esta coluna"}</option>
                        {spec.fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {missingRequired.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-warning)]"><AlertTriangle className="w-3.5 h-3.5" /> Falta indicar a coluna de: {missingRequired.map((f) => f.label).join(", ")}.</p>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">
            Vão ser lidas <b className="text-[var(--color-text-primary)]">{built.rows.length.toLocaleString("pt-BR")}</b> linha(s){built.empty > 0 && <> · {built.empty} vazia(s) serão ignoradas</>}. {spec.rowKeys && "Quem já está cadastrado (mesmo e-mail, telefone ou documento) é pulado, sem duplicar."}
          </p>
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={reset} className="h-9 px-3.5 text-xs font-bold gap-1.5 rounded-xl"><ArrowLeft className="w-3.5 h-3.5" /> Trocar arquivo</Button>
            <Button onClick={run} disabled={missingRequired.length > 0 || built.rows.length === 0} className="h-9 px-5 text-xs font-bold rounded-xl">Importar {built.rows.length.toLocaleString("pt-BR")} linha(s)</Button>
          </div>
        </div>
      )}

      {step === "run" && (
        <div className="py-8 text-center space-y-3" role="status" aria-live="polite">
          <Loader2 className="w-9 h-9 mx-auto animate-spin text-[var(--color-primary-blue)]" />
          <p className="text-sm font-bold text-[var(--color-text-primary)]">{progress?.label ?? "Preparando…"}</p>
          {progress && progress.total > 0 && (
            <>
              <div className="h-2 w-full max-w-sm mx-auto rounded-full bg-[var(--color-surface-sunken)] overflow-hidden"><div className="h-full bg-[var(--color-primary-blue)] transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="text-xs text-[var(--color-text-muted)]">{progress.done.toLocaleString("pt-BR")} de {progress.total.toLocaleString("pt-BR")} ({pct}%)</p>
            </>
          )}
          {progress && progress.total === 0 && progress.done > 0 && <p className="text-xs text-[var(--color-text-muted)]">{progress.done.toLocaleString("pt-BR")} cadastros conferidos</p>}
          <Button variant="outline" onClick={() => { cancelRef.current = true; }} className="h-8 px-3 text-xs rounded-xl">Parar</Button>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {result.failed === 0 ? <CheckCircle2 className="w-6 h-6 text-[var(--color-success)]" /> : <AlertTriangle className="w-6 h-6 text-[var(--color-warning)]" />}
            <h4 className="text-sm font-bold text-[var(--color-text-primary)]">{result.failed === 0 ? "Importação concluída" : "Importação concluída com falhas"}</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[
              ["Importados", result.inserted, "var(--color-success)"],
              ["Já existiam", result.duplicates, "var(--color-text-muted)"],
              ["Vazias", result.empty, "var(--color-text-muted)"],
              ["Falharam", result.failed, result.failed ? "var(--color-danger)" : "var(--color-text-muted)"],
            ].map(([l, n, c]) => (
              <div key={l as string} className="p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
                <div className="text-xl font-black" style={{ color: c as string }}>{(n as number).toLocaleString("pt-BR")}</div>
                <div className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">{l as string}</div>
              </div>
            ))}
          </div>
          {result.notes.length > 0 && (
            <ul className="text-xs text-[var(--color-text-muted)] space-y-0.5">{result.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>
          )}
          {result.errors.length > 0 && (
            <ul className="text-xs text-[var(--color-danger)] space-y-1 max-h-32 overflow-auto">{result.errors.slice(0, 20).map((e, i) => <li key={i}>• {e}</li>)}</ul>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset} className="h-9 px-3.5 text-xs font-bold rounded-xl">Importar outra planilha</Button>
            <Button onClick={close} className="h-9 px-5 text-xs font-bold rounded-xl">Concluir</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Botão "Importar planilha" + o modal, para qualquer tela. */
export function BotaoImportar({ spec, label = "Importar planilha", className = "" }: { spec: ImportSpec; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className={`h-9 px-4 text-xs font-bold gap-1.5 border-[var(--color-border-default)] ${className}`}>
        <Upload className="w-3.5 h-3.5" /> {label}
      </Button>
      {open && <ImportadorPlanilha spec={spec} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Importar leads (usa o funil e a empresa da sessão). */
export function BotaoImportarLeads({ className = "", label }: { className?: string; label?: string }) {
  const { user, activeTenantId, activeFilialId } = useAuth() as any;
  const { funis, colaboradores } = useData() as any;
  if (!activeTenantId) return null;
  // Vendedores: mesma regra do "Novo lead" (departamento Vendas, não desligados) + quem está importando.
  const rodizioElegiveis = ((colaboradores || []) as any[]).filter((c: any) => c.status === "Ativo" && String(c.cargo || "").toLowerCase().includes("closer") && c.rotation_active !== false && !c.rotation_blocked).length;
  // Vendedores da EMPRESA ATIVA (cargo ou departamento comercial; ver lib/sellers). Quem importa só entra na lista (e só
  // pode ficar com os leads) se for mesmo desta empresa — admin/parceiro da plataforma vendo a empresa não vira responsável.
  const importadorDaEmpresa = !!user && (user as any).tenantId === activeTenantId;
  const sellers: { nome: string; userId?: string | null }[] = [];
  for (const c of (colaboradores || []) as any[]) if (isVendedorColab(c) && !sellers.some((s) => s.nome === c.nome)) sellers.push({ nome: c.nome, userId: c.user_id ?? c.userId ?? null });
  const spec = leadsSpec({ tenantId: activeTenantId, filialId: activeFilialId, sellerName: importadorDaEmpresa ? (user?.name || "") : "", sellerUserId: importadorDaEmpresa ? user?.id ?? null : null, sellers, rodizioElegiveis, funis: funis || [] });
  return <BotaoImportar spec={spec} className={className} label={label} />;
}


const MODOS: { id: DistModo; titulo: string; desc: string }[] = [
  { id: "eu", titulo: "Todos para mim", desc: "Você fica como responsável por todos." },
  { id: "quantidades", titulo: "Escolher vendedores e quantidades", desc: "Defina quantos leads cada vendedor recebe." },
  { id: "igual", titulo: "Dividir igualmente", desc: "Reparte por igual entre os vendedores marcados." },
  { id: "rodizio", titulo: "Rodízio automático", desc: "Usa o rodízio de leads já configurado no sistema." },
];

/** Quem recebe os leads importados: o próprio usuário, vendedores com quantidades, divisão igual ou o rodízio do sistema. */
function DistribuicaoEditor({ label, vendedores, rodizioElegiveis, semEu, value, total, onChange }: { label: string; vendedores: { nome: string; userId?: string | null }[]; rodizioElegiveis?: number; semEu?: boolean; value: string; total: number; onChange: (v: string) => void }) {
  const semRodizio = rodizioElegiveis === 0;
  const cfg = parseDist(value);
  const set = (patch: Partial<DistConfig>) => onChange(JSON.stringify({ ...cfg, ...patch }));
  const usados = new Set(cfg.itens.map((i) => i.nome));
  const livres = vendedores.filter((v) => !usados.has(v.nome));
  const soma = cfg.itens.reduce((a, i) => a + i.qtd, 0);
  const calc = distribuir(total, cfg);
  const field = "h-8 px-2 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";

  const addVendedor = (nome: string) => { const v = vendedores.find((x) => x.nome === nome); if (v) set({ itens: [...cfg.itens, { nome: v.nome, userId: v.userId ?? null, qtd: cfg.modo === "igual" ? 0 : Math.max(0, total - soma) }] }); };
  const setQtd = (i: number, qtd: number) => set({ itens: cfg.itens.map((x, j) => (j === i ? { ...x, qtd: Math.max(0, Math.floor(qtd || 0)) } : x)) });
  const remover = (i: number) => set({ itens: cfg.itens.filter((_, j) => j !== i) });
  const trocaModo = (modo: DistModo) => {
    // Ao ir para "quantidades" pela 1ª vez, já sugere uma divisão igual entre os marcados para o usuário só ajustar.
    if (modo === "quantidades" && cfg.itens.length > 0 && soma === 0) {
      const n = cfg.itens.length;
      set({ modo, itens: cfg.itens.map((x, i) => ({ ...x, qtd: Math.floor(total / n) + (i < total % n ? 1 : 0) })) });
    } else set({ modo });
  };

  return (
    <div className="p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] space-y-3">
      <div className="text-[11px] font-bold text-[var(--color-text-muted)]">{label}</div>
      {semEu && <p className="text-[11px] text-[var(--color-text-muted)]">Você não faz parte desta empresa, então os leads vão para os vendedores dela. Escolha quem recebe.</p>}
      <div className="grid sm:grid-cols-2 gap-2">
        {MODOS.filter((m) => !(semEu && m.id === "eu")).map((m) => (
          <label key={m.id} className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer ${cfg.modo === m.id ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)]"}`}>
            <input type="radio" name="dist-modo" checked={cfg.modo === m.id} onChange={() => trocaModo(m.id)} className="mt-0.5" />
            <span><b className="text-[var(--color-text-primary)]">{m.titulo}</b><br /><span className="text-[var(--color-text-muted)]">{m.desc}</span></span>
          </label>
        ))}
      </div>

      {(cfg.modo === "quantidades" || cfg.modo === "igual") && (
        <div className="space-y-2">
          {vendedores.length === 0 && <p className="text-xs text-[var(--color-warning)]">Nenhum vendedor cadastrado (Equipe & RH, departamento Vendas). Cadastre para distribuir.</p>}
          {cfg.itens.map((it, i) => (
            <div key={it.nome} className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-text-primary)] w-40 truncate" title={it.nome}>{it.nome}</span>
              {cfg.modo === "quantidades"
                ? <><input aria-label={`Quantidade de ${it.nome}`} type="number" min={0} value={it.qtd} onChange={(e) => setQtd(i, Number(e.target.value))} className={`${field} w-24`} /><span className="text-xs text-[var(--color-text-muted)]">lead(s)</span></>
                : <span className="text-xs text-[var(--color-text-muted)]">receberá {calc.contagem[i]} lead(s)</span>}
              <button type="button" aria-label={`Tirar ${it.nome}`} onClick={() => remover(i)} className="text-[var(--color-danger)] bg-transparent border-none cursor-pointer text-xs font-bold">Tirar</button>
            </div>
          ))}
          {livres.length > 0 && (
            <select value="" onChange={(e) => { if (e.target.value) addVendedor(e.target.value); }} aria-label="Adicionar vendedor" className={`${field} max-w-full`}>
              <option value="">+ Adicionar vendedor…</option>
              {livres.map((v) => <option key={v.nome} value={v.nome}>{v.nome}</option>)}
            </select>
          )}
          {cfg.modo === "quantidades" && cfg.itens.length > 0 && (
            <div className="text-xs text-[var(--color-text-muted)]">
              Distribuídos <b className="text-[var(--color-text-primary)]">{Math.min(soma, total)}</b> de <b className="text-[var(--color-text-primary)]">{total}</b>
              {soma > total && <span className="text-[var(--color-warning)]"> · a soma passou do total; a sobra será cortada dos últimos da lista</span>}
              {calc.restante > 0 && (
                <span> · restante <b>{calc.restante}</b> vai para{" "}
                  <select value={cfg.restante} onChange={(e) => set({ restante: e.target.value as any })} aria-label="Destino do restante" className={`${field} h-7`}>
                    <option value="rodizio">o rodízio automático</option>{!semEu && <option value="eu">mim</option>}
                  </select>
                </span>
              )}
            </div>
          )}
          {cfg.modo === "igual" && cfg.itens.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">Marque os vendedores que vão dividir os leads.</p>}
        </div>
      )}
      {semRodizio && (cfg.modo === "rodizio" || (cfg.modo === "quantidades" && cfg.restante === "rodizio" && calc.restante > 0)) && (
        <p className="text-xs font-bold text-[var(--color-warning)]">O rodízio automático não tem nenhum closer ativo (Configurações › CRM › Rodízio de Leads). {semEu ? "Por isso o que sobrar será dividido entre os vendedores escolhidos." : "Por isso esses leads ficariam com você, não sem responsável."}</p>
      )}
      <p className="text-[11px] text-[var(--color-text-faint)]">Os leads são repartidos intercalados, na ordem da planilha, e cada vendedor passa a ser o responsável pelos que recebe.</p>
    </div>
  );
}
