import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, CheckCircle2, AlertTriangle, Download, Link2, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { apiFetch } from "../../../lib/apiClient";
import { montarZip } from "../../../lib/zipSimples";

interface Backup { id: string; status: "em_andamento" | "concluido" | "concluido_com_falhas"; criadoEm: string; tabelas: number; tabelasFeitas: number; linhas: number; arquivos: number; arquivosNaFila: number; falhas: string[] }
interface Links { empresa: string; validadeDias: number; arquivos: { nome: string; url: string }[]; faltando: number }

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Backup da empresa (só master): gerar em etapas, baixar tudo num ZIP ou copiar os links para mandar ao cliente. */
export function BackupEmpresaModal({ empresa, onClose }: { empresa: { id: string; name: string } | null; onClose: () => void }) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [rodando, setRodando] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<{ id: string; feitos: number; total: number } | null>(null);
  const aberto = useRef<string | null>(null);
  aberto.current = empresa?.id ?? null;
  const base = empresa ? `/api/admin/empresas/${empresa.id}/backups` : "";

  const pedir = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const r = await apiFetch(url, init);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `Erro ${r.status}`);
    return j as T;
  };

  const carregar = useCallback(async () => {
    if (!base) return;
    try { setBackups((await pedir<{ backups: Backup[] }>(base)).backups); }
    catch (e: any) { toast.error(e.message); }
    finally { setCarregando(false); }
  }, [base]);

  useEffect(() => { setBackups([]); setCarregando(true); void carregar(); }, [carregar]);

  // Chama o servidor etapa por etapa até terminar. Fechar a janela só pausa: dá para continuar depois.
  async function avancar(id: string) {
    const daEmpresa = empresa!.id;
    setRodando(id);
    let erros = 0;
    try {
      while (aberto.current === daEmpresa) {
        try {
          const { backup } = await pedir<{ backup: Backup }>(`${base}/${id}/continuar`, { method: "POST" });
          erros = 0;
          setBackups((l) => l.map((b) => (b.id === id ? backup : b)));
          if (backup.status !== "em_andamento") {
            if (backup.status === "concluido") toast.success("Backup concluído.");
            else toast.warning("Backup terminou com falhas. Veja a lista antes de confiar nele.");
            break;
          }
        } catch (e: any) {
          if (++erros >= 3) { toast.error(`O backup parou: ${e.message} Clique em Continuar para retomar.`); break; }
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    } finally { setRodando(null); }
  }

  async function gerar() {
    setRodando("novo");
    try {
      const { backup } = await pedir<{ backup: Backup }>(base, { method: "POST" });
      setBackups((l) => [backup, ...l]);
      await avancar(backup.id);
    } catch (e: any) { toast.error(e.message); setRodando(null); }
  }

  async function baixarZip(id: string) {
    try {
      const l = await pedir<Links>(`${base}/${id}/links`);
      const arquivos: { nome: string; dados: Uint8Array }[] = [];
      for (let i = 0; i < l.arquivos.length; i++) {
        setBaixando({ id, feitos: i, total: l.arquivos.length });
        const r = await fetch(l.arquivos[i].url, { cache: "no-store" });
        if (!r.ok) throw new Error(`Falha ao baixar ${l.arquivos[i].nome}.`);
        arquivos.push({ nome: l.arquivos[i].nome, dados: new Uint8Array(await r.arrayBuffer()) });
      }
      const blob = new Blob(montarZip(arquivos) as BlobPart[], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `backup-${empresa!.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${id}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      if (l.faltando > 0) toast.warning(`${l.faltando} arquivo(s) do backup não foram encontrados e ficaram fora do ZIP.`);
    } catch (e: any) { toast.error(e.message || "Não foi possível montar o ZIP. Para backups grandes, use os links."); }
    finally { setBaixando(null); }
  }

  async function copiarLinks(id: string) {
    try {
      const l = await pedir<Links>(`${base}/${id}/links`);
      await navigator.clipboard.writeText(`Backup de ${l.empresa} (links válidos por ${l.validadeDias} dias)\n\n${l.arquivos.map((a) => `${a.nome}\n${a.url}`).join("\n\n")}`);
      toast.success(`${l.arquivos.length} links copiados. Quem tiver o link consegue baixar: envie só para o cliente.`);
    } catch (e: any) { toast.error(e.message || "Não foi possível copiar os links."); }
  }

  return (
    <Modal isOpen={!!empresa} onClose={onClose} maxWidth="max-w-2xl" title={`Backup de ${empresa?.name ?? ""}`}
      description="Copia os dados e os arquivos da empresa para uma pasta privada. Nada é alterado nem excluído.">
      <div className="space-y-4">
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Senhas, chaves e tokens não entram. Para um retrato sem mudanças no meio, desabilite a empresa antes. Empresas grandes levam alguns minutos: deixe esta janela aberta (se fechar, é só continuar depois).
        </p>
        <Button onClick={gerar} disabled={!!rodando} className="text-xs font-bold gap-2">
          {rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />} Gerar novo backup
        </Button>

        {carregando ? (
          <div className="grid place-items-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>
        ) : backups.length === 0 ? (
          <p className="text-xs italic text-[var(--color-text-faint)]">Nenhum backup desta empresa ainda.</p>
        ) : (
          <ul className="space-y-2">
            {backups.map((b) => {
              const pct = b.status === "em_andamento" ? Math.min(99, Math.round((b.tabelasFeitas / Math.max(b.tabelas, 1)) * 100)) : 100;
              const pronto = b.status !== "em_andamento";
              return (
                <li key={b.id} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-black text-[var(--color-text-primary)]">{quando(b.criadoEm)}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase ${b.status === "concluido" ? "text-emerald-500" : b.status === "concluido_com_falhas" ? "text-amber-500" : "text-[var(--color-primary-blue)]"}`}>
                      {b.status === "concluido" ? <><CheckCircle2 className="w-3.5 h-3.5" />Completo</> : b.status === "concluido_com_falhas" ? <><AlertTriangle className="w-3.5 h-3.5" />Incompleto</> : `Em andamento · ${pct}%`}
                    </span>
                  </div>
                  {!pronto && <div className="h-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden"><div className="h-full bg-[var(--color-primary-blue)] transition-all" style={{ width: `${pct}%` }} /></div>}
                  <p className="text-[11px] text-[var(--color-text-muted)]">{b.linhas.toLocaleString("pt-BR")} registros · {b.arquivos} {b.arquivos === 1 ? "arquivo" : "arquivos"} · {b.tabelasFeitas} de {b.tabelas} tabelas</p>
                  {b.falhas.length > 0 && (
                    <details className="text-[11px] text-amber-600"><summary className="cursor-pointer font-bold">{b.falhas.length} falha(s)</summary><ul className="mt-1 space-y-0.5 break-words">{b.falhas.slice(0, 30).map((f) => <li key={f}>{f}</li>)}</ul></details>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {!pronto && <Button size="sm" disabled={!!rodando} onClick={() => avancar(b.id)} className="h-8 text-xs gap-1.5">{rodando === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}Continuar</Button>}
                    {pronto && <>
                      <Button size="sm" disabled={!!baixando} onClick={() => baixarZip(b.id)} className="h-8 text-xs gap-1.5">
                        {baixando?.id === b.id ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{baixando.feitos}/{baixando.total}</> : <><Download className="w-3.5 h-3.5" />Baixar ZIP</>}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copiarLinks(b.id)} className="h-8 text-xs gap-1.5"><Link2 className="w-3.5 h-3.5" />Copiar links (7 dias)</Button>
                    </>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
