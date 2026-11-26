import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, Loader2, Play, RotateCcw, Trash2 } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { apiFetch } from "../../../lib/apiClient";

const VALIDADE_BACKUP_H = 24; // a mesma regra do servidor

interface Exclusao { id: string; empresa: string; status: string; parado: boolean; concluido: boolean; restantes: number; registrosApagados: number; pendencias: string[]; revisar: string[]; compartilhadas: string[] }
interface Previa {
  andamento?: Exclusao;
  empresa: string; bloqueios: string[]; registros: number; tabelas: number; usuarios: number; arquivos: number; cobrancas: number;
  sessoes: string[]; compartilhadas: string[]; fluxos: string[]; revisar: string[]; avisos: string[];
}
interface Backup { id: string; status: string; criadoEm: string }

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const n = (v: number) => v.toLocaleString("pt-BR");

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Erro ${r.status}`);
  return j as T;
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <details className="text-[11px] text-[var(--color-text-muted)]">
      <summary className="cursor-pointer font-bold">{titulo} ({itens.length})</summary>
      <ul className="mt-1 max-h-40 overflow-y-auto space-y-0.5 break-words">{itens.map((i) => <li key={i}>{i}</li>)}</ul>
    </details>
  );
}

/** Exclusão completa de uma empresa (só master): mostra o que será apagado, exige backup e o nome digitado, e acompanha até o fim. */
export function ExcluirEmpresaModal({ empresa, onClose, onBackup, onMudou }: {
  empresa: { id: string; name: string } | null;
  onClose: () => void;
  onBackup: (empresa: { id: string; name: string }) => void;
  onMudou: () => void;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [exclusao, setExclusao] = useState<Exclusao | null>(null);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const aberto = useRef<string | null>(null);
  aberto.current = empresa?.id ?? null;

  const carregar = useCallback(async () => {
    if (!empresa) return;
    const id = empresa.id;
    setCarregando(true); setErro(""); setPrevia(null); setBackup(null); setExclusao(null); setNome("");
    try {
      const p = await pedir<Previa>(`/api/admin/empresas/${id}/exclusao`);
      if (aberto.current !== id) return;
      if (p.andamento) { setExclusao(p.andamento); return; }
      setPrevia(p);
      const { backups } = await pedir<{ backups: Backup[] }>(`/api/admin/empresas/${id}/backups`);
      if (aberto.current !== id) return;
      setBackup(backups.find((b) => b.status === "concluido" && Date.now() - Date.parse(b.criadoEm) < VALIDADE_BACKUP_H * 3_600_000) ?? null);
    } catch (e: any) { if (aberto.current === id) setErro(e.message); }
    finally { if (aberto.current === id) setCarregando(false); }
  }, [empresa?.id]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Chama o servidor etapa por etapa. Fechar a janela só pausa: dá para continuar depois.
  async function avancar(inicial: Exclusao) {
    const daEmpresa = aberto.current;
    let atual = inicial, falhas = 0, primeira = true;
    while (aberto.current === daEmpresa && (primeira || !atual.parado)) {
      try {
        atual = (await pedir<{ exclusao: Exclusao }>(`/api/admin/empresas/exclusoes/${atual.id}/avancar`, { method: "POST" })).exclusao;
        setExclusao(atual); setErro(""); primeira = false; falhas = 0;
      } catch (e: any) {
        if (/nada foi excluído|cancelada/i.test(e.message)) { setExclusao(null); setErro(e.message); break; }
        if (++falhas >= 3) { setErro(e.message); break; }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    onMudou();
  }

  async function excluir() {
    if (!empresa || !backup) return;
    setRodando(true); setErro("");
    try {
      const { exclusao: nova } = await pedir<{ exclusao: Exclusao }>(`/api/admin/empresas/${empresa.id}/exclusao`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmacao: nome, backupId: backup.id }),
      });
      setExclusao(nova);
      await avancar(nova);
    } catch (e: any) { setErro(e.message); }
    finally { setRodando(false); }
  }

  async function continuar() {
    if (!exclusao) return;
    setRodando(true);
    try { await avancar(exclusao); } finally { setRodando(false); }
  }

  // Só antes de o banco começar a apagar: religa os fluxos e devolve a empresa ao que era.
  async function cancelar() {
    if (!exclusao) return;
    setRodando(true); setErro("");
    try {
      await pedir(`/api/admin/empresas/exclusoes/${exclusao.id}/cancelar`, { method: "POST" });
      onMudou();
      await carregar();
    } catch (e: any) { setErro(e.message); }
    finally { setRodando(false); }
  }

  const podeExcluir = !!previa && !!backup && previa.bloqueios.length === 0 && nome.trim() === previa.empresa.trim() && !rodando;

  return (
    <Modal isOpen={!!empresa} onClose={onClose} maxWidth="max-w-2xl" title={`Excluir ${empresa?.name ?? ""}`}
      description="Apaga a empresa de todo o sistema. Não tem como desfazer.">
      <div className="space-y-4">
        {erro && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 break-words">{erro}</p>}
        {carregando && <div className="grid place-items-center gap-2 py-8 text-xs text-[var(--color-text-muted)]"><Loader2 className="w-5 h-5 animate-spin" />Levantando o que existe desta empresa…</div>}
        {!carregando && !previa && !exclusao && <Button variant="outline" onClick={() => void carregar()} className="text-xs gap-2"><RotateCcw className="w-4 h-4" />Conferir de novo</Button>}

        {previa && !exclusao && (
          <>
            {previa.bloqueios.map((b) => <p key={b} className="text-xs font-bold text-rose-600">{b}</p>)}
            {previa.avisos.map((a) => <p key={a} className="text-xs font-medium text-amber-600">{a}</p>)}
            <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 space-y-2">
              <p className="text-xs font-black text-[var(--color-text-primary)]">Será apagado</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {n(previa.registros)} registros em {previa.tabelas} tabelas · {previa.usuarios} login(s) · {previa.arquivos} arquivo(s) · {previa.sessoes.length} sessão(ões) de WhatsApp · {previa.fluxos.length} fluxo(s) no n8n{previa.cobrancas ? " · cobrança recorrente no Asaas" : ""}
              </p>
              <Lista titulo="Sessões de WhatsApp" itens={previa.sessoes} />
              <Lista titulo="Fluxos do n8n" itens={previa.fluxos} />
              <Lista titulo="Fluxos que citam a empresa e NÃO serão apagados (confira no n8n)" itens={previa.revisar} />
              <Lista titulo="Sessões usadas também por outra empresa (ficam)" itens={previa.compartilhadas} />
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-[var(--color-border-default)] p-3">
              {backup
                ? <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Backup completo de {quando(backup.criadoEm)}</p>
                : <p className="text-xs font-bold text-amber-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Falta um backup completo das últimas {VALIDADE_BACKUP_H} horas.</p>}
              <Button variant="outline" size="sm" onClick={() => empresa && onBackup(empresa)} className="h-8 text-xs gap-1.5">
                <Archive className="w-3.5 h-3.5" />{backup ? "Baixar ou enviar ao cliente" : "Gerar backup"}
              </Button>
            </div>

            <label className="block text-xs text-[var(--color-text-muted)]">
              Para confirmar, digite <strong className="text-[var(--color-text-primary)] select-all">{previa.empresa}</strong>
              <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!backup || previa.bloqueios.length > 0} autoComplete="off"
                className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] disabled:opacity-50" />
            </label>
            <Button variant="danger" onClick={() => void excluir()} disabled={!podeExcluir} className="text-xs font-bold gap-2">
              {rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Excluir definitivamente
            </Button>
          </>
        )}

        {exclusao && (
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 space-y-2">
            <p className="text-xs font-black text-[var(--color-text-primary)] flex items-center gap-2">
              {rodando && <Loader2 className="w-4 h-4 animate-spin" />}
              {exclusao.concluido ? "Empresa excluída." : exclusao.status === "com_pendencias" ? "Dados excluídos, mas sobraram itens fora do banco." : exclusao.status === "banco_apagado" ? `Dados excluídos. Limpando o restante (${exclusao.restantes} itens)…` : exclusao.status === "iniciada" ? "Empresa preparada, nada foi apagado ainda." : "Apagando os dados…"}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">{n(exclusao.registrosApagados)} registros apagados. Deixe a janela aberta até terminar.</p>
            <Lista titulo="Pendências" itens={exclusao.pendencias} />
            <Lista titulo="Fluxos do n8n para conferir (não foram apagados)" itens={exclusao.revisar} />
            <Lista titulo="Sessões mantidas por serem usadas por outra empresa" itens={exclusao.compartilhadas} />
            <div className="flex items-center gap-2 flex-wrap">
              {!rodando && !exclusao.concluido && (
                <Button size="sm" onClick={() => void continuar()} className="h-8 text-xs gap-1.5"><Play className="w-3.5 h-3.5" />{exclusao.status === "com_pendencias" ? "Tentar de novo" : "Continuar"}</Button>
              )}
              {!rodando && exclusao.status === "iniciada" && (
                <Button size="sm" variant="outline" onClick={() => void cancelar()} className="h-8 text-xs gap-1.5"><RotateCcw className="w-3.5 h-3.5" />Cancelar (nada foi apagado)</Button>
              )}
              {!rodando && (exclusao.concluido || exclusao.status === "com_pendencias") && (
                <Button size="sm" variant="outline" onClick={() => empresa && onBackup(empresa)} className="h-8 text-xs gap-1.5"><Archive className="w-3.5 h-3.5" />Abrir o backup</Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
