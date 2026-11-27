/** Quem recebeu uma campanha: situação de cada pessoa, motivo das falhas e reenvio para uma ou várias, na própria campanha. */
import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Modal } from "../../../components/ui/modal";
import { csvEngajamento } from "../../../lib/csvEngajamento";
import { cn } from "../../../lib/utils";
import type { Campanha } from "./CampanhasEmail";

interface Linha { email: string; name?: string | null; status: string; error?: string | null; sent_at?: string | null; open_count?: number; click_count?: number }
type Filtro = "todos" | "abriram" | "nao_abriram" | "falhas" | "fila";

const FILTROS: { id: Filtro; titulo: string; cabe: (l: Linha) => boolean }[] = [
  { id: "todos", titulo: "Todos", cabe: () => true },
  { id: "abriram", titulo: "Abriram", cabe: (l) => !!l.open_count || !!l.click_count },
  { id: "nao_abriram", titulo: "Sem abertura", cabe: (l) => l.status === "sent" && !l.open_count && !l.click_count },
  { id: "falhas", titulo: "Falharam", cabe: (l) => l.status === "failed" },
  { id: "fila", titulo: "Na fila", cabe: (l) => l.status === "pending" || l.status === "sending" },
];
const MOSTRAR = 300;
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function situacaoDe(l: Linha): [string, string] {
  if (l.click_count) return ["Clicou", "text-emerald-600 dark:text-emerald-400"];
  if (l.open_count) return ["Abriu", "text-emerald-600 dark:text-emerald-400"];
  if (l.status === "sent") return ["Enviado", "text-[var(--color-text-primary)]"];
  if (l.status === "failed") return ["Falhou", "text-[var(--color-danger)]"];
  if (l.status === "skipped") return ["Não enviado", "text-[var(--color-text-muted)]"];
  return ["Na fila", "text-[var(--color-primary-blue)]"];
}

export function DestinatariosDaCampanha({ campanha, api, remetente, onFechar, onReenviar }: {
  campanha: Campanha | null;
  api: (path: string, init?: RequestInit) => Promise<Response>;
  /** E-mail de onde as mensagens saem, para onde voltam as recusas. */
  remetente: string | null;
  onFechar: () => void;
  /** Pede confirmação e reenvia; devolve se reenviou. */
  onReenviar: (c: Campanha, emails: string[]) => Promise<boolean>;
}) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [ab, setAb] = useState<any>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const chamar = useRef(api);
  chamar.current = api;
  const id = campanha?.id;

  useEffect(() => {
    setLinhas(null); setAb(null); setFiltro("todos"); setBusca(""); setMarcados(new Set());
    if (!id) return;
    let vale = true;
    const ler = async (path: string) => { const r = await chamar.current(path); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || "Falha na requisição."); return j; };
    ler(`/api/email-campaigns/${id}/engajamento`).then((j) => vale && setLinhas(j.linhas || [])).catch((e) => { if (vale) { toast.error(e.message); setLinhas([]); } });
    if (campanha?.subject_b) ler(`/api/email-campaigns/${id}/ab`).then((j) => vale && j.ab && setAb(j)).catch(() => {});
    return () => { vale = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Só dá para reenviar depois que o envio terminou (ou foi cancelado).
  const podeReenviar = campanha?.status === "done" || campanha?.status === "cancelled";
  const reenviavel = (l: Linha) => podeReenviar && l.status !== "pending" && l.status !== "sending";
  const atual = FILTROS.find((f) => f.id === filtro)!;
  const visiveis = (linhas ?? []).filter((l) => atual.cabe(l) && (!busca || semAcento(`${l.email} ${l.name ?? ""}`).includes(semAcento(busca))));
  const selecionaveis = visiveis.filter(reenviavel).map((l) => l.email);
  const escolhidos = selecionaveis.filter((e) => marcados.has(e));
  const marcar = (emails: string[], sim: boolean) => setMarcados((antes) => { const n = new Set(antes); for (const e of emails) { if (sim) n.add(e); else n.delete(e); } return n; });
  const reenviar = async (emails: string[]) => { if (campanha && (await onReenviar(campanha, emails))) onFechar(); };
  const exportar = () => {
    if (!linhas || !campanha) return;
    const url = URL.createObjectURL(new Blob(["﻿" + csvEngajamento(linhas as any)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${campanha.name.replace(/[^\w\-]+/g, "_").slice(0, 50) || "campanha"}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Modal isOpen={!!campanha} onClose={onFechar} title={campanha ? `Destinatários · ${campanha.name}` : "Destinatários"} maxWidth="max-w-3xl"
      footer={<>
        <Button variant="outline" onClick={exportar} disabled={!linhas?.length} className="h-9 px-3 text-xs gap-1.5 mr-auto"><Download className="w-3.5 h-3.5" /> Exportar planilha</Button>
        {podeReenviar && <Button onClick={() => void reenviar(escolhidos)} disabled={!escolhidos.length} className="h-9 px-4 text-xs font-bold gap-1.5"><Send className="w-3.5 h-3.5" /> Reenviar selecionados{escolhidos.length ? ` (${escolhidos.length})` : ""}</Button>}
      </>}>
      {linhas === null ? <div className="grid place-items-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div> : (
        <div className="space-y-3 text-xs">
          {ab && (
            <div className="grid sm:grid-cols-2 gap-2">
              {(["a", "b"] as const).map((v) => {
                const x = ab[v]; const p = (n: number) => (x.enviados ? Math.round((n / x.enviados) * 100) : 0);
                return <div key={v} className="rounded-lg bg-[var(--color-surface-sunken)] p-2.5 text-[var(--color-text-muted)]"><p className="font-bold text-[var(--color-text-primary)] truncate">Assunto {v.toUpperCase()}: {v === "a" ? ab.assuntoA : ab.assuntoB}</p><p>{x.enviados} enviado(s) · <b>{p(x.abriram)}%</b> abriram · <b>{p(x.clicaram)}%</b> clicaram</p></div>;
              })}
            </div>
          )}
          <p className="rounded-lg bg-[var(--color-surface-sunken)] p-2.5 text-[11px] text-[var(--color-text-muted)]">
            <b className="text-[var(--color-text-primary)]">“Enviado”</b> quer dizer que o servidor de e-mail aceitou. Se não chegou, procure no spam e na aba Promoções{remetente ? <>; uma recusa volta como mensagem para <b className="text-[var(--color-text-primary)] break-all">{remetente}</b></> : null}.
          </p>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {FILTROS.map((f) => {
              const n = linhas.filter(f.cabe).length;
              if (f.id !== "todos" && !n && filtro !== f.id) return null;
              return <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}
                className={cn("shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 font-bold cursor-pointer", filtro === f.id ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)] !text-white" : "bg-transparent border-[var(--color-border-default)] text-[var(--color-text-muted)]")}>{f.titulo} · {n}</button>;
            })}
          </div>
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border-default)]">
            <Search className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-faint)]" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar destinatário" className="w-full bg-transparent border-0 outline-none p-0 text-[var(--color-text-primary)]" />
          </label>
          {podeReenviar && selecionaveis.length > 0 && (
            <label className="flex items-center gap-2 font-bold text-[var(--color-text-muted)] cursor-pointer">
              <input type="checkbox" checked={escolhidos.length === selecionaveis.length} onChange={(e) => marcar(selecionaveis, e.target.checked)} />
              {escolhidos.length ? `${escolhidos.length} selecionado${escolhidos.length > 1 ? "s" : ""}` : "Selecionar todos desta lista"}
            </label>
          )}
          <ul className="m-0 p-0 list-none rounded-lg border border-[var(--color-border-subtle)] divide-y divide-[var(--color-border-subtle)]">
            {visiveis.slice(0, MOSTRAR).map((l) => {
              const [texto, cor] = situacaoDe(l);
              return (
                <li key={l.email} className={cn("flex items-center gap-2.5 px-3 py-2", marcados.has(l.email) && "bg-[var(--color-primary-blue)]/10")}>
                  {podeReenviar && <input type="checkbox" aria-label={`Selecionar ${l.email}`} disabled={!reenviavel(l)} checked={marcados.has(l.email)} onChange={(e) => marcar([l.email], e.target.checked)} />}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[var(--color-text-primary)]"><span className="font-medium">{l.email}</span>{l.name && <span className="text-[var(--color-text-muted)]"> · {l.name}</span>}</p>
                    {(l.error || l.sent_at) && <p className={cn("text-[11px] break-words", l.error ? "text-[var(--color-danger)]" : "text-[var(--color-text-faint)]")}>{l.error || `Enviado em ${quando(l.sent_at!)}`}</p>}
                  </div>
                  <span className={cn("shrink-0 font-bold", cor)}>{texto}</span>
                  {reenviavel(l) && <button type="button" onClick={() => void reenviar([l.email])} aria-label={`Reenviar para ${l.email}`} className="shrink-0 bg-transparent border-0 p-0 font-bold text-[var(--color-primary-blue)] cursor-pointer hover:underline">Reenviar</button>}
                </li>
              );
            })}
            {visiveis.length === 0 && <li className="px-3 py-6 text-center text-[var(--color-text-faint)]">Ninguém neste filtro.</li>}
          </ul>
          {visiveis.length > MOSTRAR && <p className="text-[11px] text-[var(--color-text-faint)]">Mostrando {MOSTRAR} de {visiveis.length}. Use a busca ou a planilha para ver os demais.</p>}
        </div>
      )}
    </Modal>
  );
}
