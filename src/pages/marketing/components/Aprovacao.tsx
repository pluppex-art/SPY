import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Copy, ExternalLink, Link2, MessageSquareWarning, Send, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { Field, FormSection, ModalTitle, selectCls, inputCls } from "../../finance/components/ModalKit";
import { ROTULO_APROVACAO, alteradaDepoisDaResposta, linkVencido, type Aprovacao } from "../../../lib/aprovacaoConteudo";
import { versaoDaPauta } from "../useMarketingConteudo";
import { cn } from "../../../lib/utils";

export const linkDeAprovacao = (token: string) => `${window.location.origin}/aprovar/${token}`;

type Situacao = "nao_enviado" | "aguardando" | "aprovado" | "ajustes" | "alterada" | "vencido";

export function situacaoDaPauta(t: any): Situacao {
  const a: Aprovacao | undefined = t.aprovacao;
  if (!a) return "nao_enviado";
  if (alteradaDepoisDaResposta(a, versaoDaPauta(t))) return "alterada";
  if (a.status === "aguardando" && linkVencido(a)) return "vencido";
  return a.status;
}

const VISUAL: Record<Exclude<Situacao, "nao_enviado">, { rotulo: string; icone: typeof Clock; cor: string }> = {
  aguardando: { rotulo: ROTULO_APROVACAO.aguardando, icone: Clock, cor: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  aprovado: { rotulo: ROTULO_APROVACAO.aprovado, icone: CheckCircle2, cor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  ajustes: { rotulo: ROTULO_APROVACAO.ajustes, icone: MessageSquareWarning, cor: "bg-rose-500/10 text-rose-500 border-rose-500/30" },
  alterada: { rotulo: "Alterada depois da resposta", icone: AlertTriangle, cor: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
  vencido: { rotulo: "Link vencido", icone: AlertTriangle, cor: "bg-slate-500/10 text-slate-400 border-slate-500/30" },
};

export function SeloAprovacao({ task, soIcone }: { task: any; soIcone?: boolean }) {
  const s = situacaoDaPauta(task);
  if (s === "nao_enviado") return null;
  const v = VISUAL[s];
  if (soIcone) return <v.icone className={cn("w-3 h-3 shrink-0", v.cor.split(" ")[1])} aria-label={v.rotulo} />;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", v.cor)}>
      <v.icone className="w-3 h-3" /> {v.rotulo}
    </span>
  );
}

async function copiar(texto: string) {
  try { await navigator.clipboard.writeText(texto); toast.success("Link copiado."); }
  catch { toast.error("Não foi possível copiar. Selecione o link e copie manualmente."); }
}

function LinkPronto({ token, cliente }: { token: string; cliente: string }) {
  const url = linkDeAprovacao(token);
  const mensagem = `Olá${cliente ? `, ${cliente}` : ""}! Os conteúdos estão prontos para sua aprovação: ${url}`;
  return (
    <div className="space-y-2">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={inputCls()} aria-label="Link de aprovação" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void copiar(url)} className="h-9 px-4 text-xs font-bold gap-1.5"><Copy className="w-3.5 h-3.5" /> Copiar link</Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] no-underline hover:bg-[var(--color-surface-sunken)]"><Share2 className="w-3.5 h-3.5" /> Enviar por WhatsApp</a>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] no-underline hover:bg-[var(--color-surface-sunken)]"><ExternalLink className="w-3.5 h-3.5" /> Ver como o cliente vê</a>
      </div>
    </div>
  );
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: any[];
  clientes: { id: string; nome: string }[];
  clienteDe: (t: any) => string;
  /** Cliente já escolhido na tela. */
  clienteInicial: string;
  /** Aberto a partir de uma pauta: só ela vem marcada. */
  pautaInicial?: string | null;
  ultimaEtapa?: string;
  pedirAprovacao: (ids: string[], clienteId: string) => Promise<string | null>;
  cancelarAprovacao: (ids: string[]) => Promise<boolean>;
}

/** "Enviar para aprovação": escolhe o cliente e as pautas e devolve o link que o cliente abre sem login. */
export function EnviarAprovacaoModal({ isOpen, onClose, tasks, clientes, clienteDe, clienteInicial, pautaInicial, ultimaEtapa, pedirAprovacao, cancelarAprovacao }: ModalProps) {
  const [cliente, setCliente] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [token, setToken] = useState("");
  const [enviando, setEnviando] = useState(false);

  // clienteDe devolve "" para cliente apagado; o que vale para o link é o clienteId gravado na pauta.
  const doCliente = useMemo(
    () => tasks.filter((t) => clienteDe(t) === cliente).sort((a, b) => (a.publishDateISO || "9999").localeCompare(b.publishDateISO || "9999")),
    [tasks, cliente, clienteDe],
  );
  const sugeridas = (lista: any[]) => new Set<string>(
    lista.filter((t) => t.colId !== ultimaEtapa && ["nao_enviado", "alterada", "vencido"].includes(situacaoDaPauta(t))).map((t) => t.id),
  );

  useEffect(() => {
    if (!isOpen) return;
    const pauta = tasks.find((t) => t.id === pautaInicial);
    const c = pauta ? clienteDe(pauta) : clienteInicial || (clientes.length === 1 ? clientes[0].id : "");
    setCliente(c);
    setMarcadas(pauta ? new Set([pauta.id]) : sugeridas(tasks.filter((t) => clienteDe(t) === c)));
    setToken("");
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomeCliente = clientes.find((c) => c.id === cliente)?.nome || "";
  const linkAtual = doCliente.map((t) => t.aprovacao).find((a) => a && !linkVencido(a))?.token;
  const comLink = doCliente.filter((t) => t.aprovacao);
  const link = token || linkAtual || "";

  const enviar = async () => {
    const ids = doCliente.filter((t) => marcadas.has(t.id)).map((t) => t.id);
    if (!ids.length) { toast.error("Marque pelo menos uma pauta."); return; }
    setEnviando(true);
    // Pautas de um cliente que foi apagado aparecem como "sem cliente", mas ainda guardam o id antigo.
    const idGravado = doCliente.find((t) => marcadas.has(t.id))?.clienteId || "";
    const novo = await pedirAprovacao(ids, cliente || idGravado);
    setEnviando(false);
    if (!novo) return;
    setToken(novo);
    setMarcadas(new Set());
    toast.success(`${ids.length} ${ids.length === 1 ? "pauta enviada" : "pautas enviadas"} para aprovação.`);
  };

  const cancelarLink = async () => {
    const ok = await confirmDialog({
      title: "Desativar o link?",
      description: `O cliente deixa de ver ${comLink.length === 1 ? "a pauta enviada" : `as ${comLink.length} pautas enviadas`} e as respostas registradas são apagadas.`,
      confirmLabel: "Desativar link",
    });
    if (ok && await cancelarAprovacao(comLink.map((t) => t.id))) { setToken(""); toast.success("Link desativado."); }
  };

  const alternar = (id: string) => setMarcadas((m) => { const n = new Set(m); if (!n.delete(id)) n.add(id); return n; });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={<ModalTitle icon={Send} title="Enviar para aprovação" subtitle="O cliente abre o link, vê o calendário e aprova ou pede ajustes, sem precisar de login." />}
    >
      <div className="space-y-4">
        {clientes.length > 0 && (
          <Field label="Cliente" icon={Users}>
            <select
              value={cliente}
              onChange={(e) => { const c = e.target.value; setCliente(c); setToken(""); setMarcadas(sugeridas(tasks.filter((t) => clienteDe(t) === c))); }}
              className={selectCls()}
            >
              <option value="">Sem cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
        )}

        <FormSection icon={CheckCircle2} title="Pautas" hint={`${marcadas.size} marcada(s) de ${doCliente.length}`}>
          {doCliente.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">{cliente ? "Este cliente ainda não tem pautas." : "Nenhuma pauta sem cliente."}</p>
          ) : (
            <>
              <div className="flex gap-3 text-[11px] font-bold">
                <button type="button" className="text-[var(--color-primary-blue)] cursor-pointer bg-transparent border-none p-0" onClick={() => setMarcadas(new Set(doCliente.map((t) => t.id)))}>Marcar todas</button>
                <button type="button" className="text-[var(--color-text-muted)] cursor-pointer bg-transparent border-none p-0" onClick={() => setMarcadas(new Set())}>Limpar</button>
              </div>
              <ul className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border-subtle)]">
                {doCliente.map((t) => (
                  <li key={t.id}>
                    <label className="flex items-center gap-2.5 py-2 cursor-pointer">
                      <input type="checkbox" checked={marcadas.has(t.id)} onChange={() => alternar(t.id)} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-[var(--color-text-primary)]">{t.title}</span>
                        <span className="block truncate text-[10px] text-[var(--color-text-muted)]">{t.publishDateISO ? t.date : "Sem data"} · {t.platform}</span>
                      </span>
                      <SeloAprovacao task={t} />
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </FormSection>

        {link && (
          <FormSection icon={Link2} title={token ? "Link pronto" : "Link atual"} hint={token ? "vale por 60 dias" : "pautas novas entram no mesmo link"}>
            <LinkPronto token={link} cliente={nomeCliente} />
          </FormSection>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--color-border-subtle)]">
          <div>
            {comLink.length > 0 && (
              <button type="button" onClick={() => void cancelarLink()} className="text-[11px] font-bold text-[var(--color-danger)] cursor-pointer bg-transparent border-none p-0">Desativar link</button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-9 px-4 text-xs font-bold">Fechar</Button>
            <Button type="button" onClick={() => void enviar()} disabled={enviando || marcadas.size === 0} className="h-9 px-5 text-xs font-bold gap-1.5">
              <Send className="w-3.5 h-3.5" /> {enviando ? "Enviando..." : link ? "Enviar marcadas" : "Gerar link"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Situação da aprovação dentro dos detalhes da pauta. */
export function BlocoAprovacao({ task, onEnviar, onCancelar }: { task: any; onEnviar: () => void; onCancelar: () => void }) {
  const a: Aprovacao | undefined = task.aprovacao;
  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Aprovação do cliente</h4>
        {a ? <SeloAprovacao task={task} /> : <span className="text-[10px] font-bold text-[var(--color-text-faint)]">Não enviada</span>}
      </div>
      {a && a.historico.length > 0 && (
        <ul className="space-y-2 max-h-44 overflow-y-auto">
          {[...a.historico].reverse().map((r) => (
            <li key={r.em} className="text-xs text-[var(--color-text-primary)]">
              <span className="font-bold">{r.nome}</span> {r.decisao === "aprovado" ? "aprovou" : "pediu ajustes"}
              <span className="text-[var(--color-text-faint)]"> · {new Date(r.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              {r.comentario && <p className="mt-0.5 whitespace-pre-wrap break-words text-[var(--color-text-muted)]">{r.comentario}</p>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onEnviar} className="h-8 px-3 text-[11px] font-bold gap-1.5"><Send className="w-3.5 h-3.5" /> {a ? "Enviar de novo" : "Pedir aprovação"}</Button>
        {a && (
          <>
            <Button type="button" variant="outline" onClick={() => void copiar(linkDeAprovacao(a.token))} className="h-8 px-3 text-[11px] font-bold gap-1.5"><Copy className="w-3.5 h-3.5" /> Copiar link</Button>
            <Button type="button" variant="ghost" onClick={onCancelar} className="h-8 px-3 text-[11px] font-bold text-[var(--color-danger)]">Cancelar pedido</Button>
          </>
        )}
      </div>
    </div>
  );
}
