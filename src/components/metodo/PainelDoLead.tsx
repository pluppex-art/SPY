/** No detalhe do lead: a faixa com os sete status e as ações; e a aba "Funil" com notas, pagamentos e histórico. */
import { useEffect, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { carregarContato, carregarDoLead, type Nota, type Pagamento, type Registro } from "../../lib/metodo/api";
import { ETAPAS_ATIVAS, NOME_DA_BOLA, NOME_DA_ETAPA, NOME_DO_PAGAMENTO, NOME_DO_SLA, situacaoDoPrazo, type TipoEtapa } from "../../lib/metodo/regras";
import { COR_DO_SLA, diaCurto } from "./SelosDoCartao";
import { useMetodo } from "./MetodoProvider";

const CONVERSA: Record<string, string> = { aguardando_vendedor: "Aguardando vendedor", aguardando_cliente: "Aguardando cliente", sem_conversa: "Sem conversa" };
const RELACIONAMENTO: Record<string, string> = { lead_novo: "Lead novo", cliente: "Cliente", recorrente: "Recorrente", inativo: "Inativo", reativado: "Reativado" };
const PERMISSAO: Record<string, string> = { liberado: "Liberado", janela_fechada: "Janela fechada", optout: "Não contatar" };
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const dinheiro = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const temp = (t: unknown) => ({ quente: "Quente", morno: "Morno", frio: "Frio" } as Record<string, string>)[String(t ?? "").toLowerCase()] ?? "—";

function Dimensao({ nome, valor, cor }: { nome: string; valor: string; cor?: string }) {
  return (
    <div className={cn("rounded-lg px-2 py-1.5 min-w-0 max-sm:w-32 max-sm:shrink-0", cor ?? "bg-[var(--color-surface-sunken)]")}>
      <div className="truncate text-[8px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">{nome}</div>
      <div className={cn("truncate text-[11px] font-bold", !cor && "text-[var(--color-text-primary)]")} title={valor}>{valor}</div>
    </div>
  );
}

export function FaixaDoMetodo({ lead }: { lead: any }) {
  const metodo = useMetodo();
  const { activeTenantId } = useAuth();
  const info = metodo.info(lead);
  const [contato, setContato] = useState<{ relacionamento: string; permissao_contato: string } | null>(null);
  const [daIa, setDaIa] = useState<Registro | null>(null);
  const noMetodo = !!info;
  useEffect(() => {
    setContato(null); setDaIa(null);
    if (!noMetodo || !activeTenantId) return;
    let vale = true;
    carregarContato(activeTenantId, String(lead.phone ?? "")).then((c) => { if (vale) setContato(c); }).catch(() => {});
    // "Desfazer" só aparece quando a ÚLTIMA mudança de etapa ou situação foi da IA.
    carregarDoLead(activeTenantId, lead.id).then((d) => {
      const ultima = d.historico.find((h) => h.dimensao === "etapa" || h.dimensao === "situacao");
      if (vale && ultima?.autor_tipo === "ia" && !ultima.desfaz_id) setDaIa(ultima);
    }).catch(() => {});
    return () => { vale = false; };
  }, [noMetodo, activeTenantId, lead.id, lead.phone, metodo.versao]);
  if (!info) return null;
  const { estado, situacao, tipo } = info;
  const sla = situacaoDoPrazo(estado);
  // Cada botão só aparece onde o banco aceita a ação.
  const ativo = ETAPAS_ATIVAS.includes(tipo);
  const aberto = ativo || tipo === "repescagem";
  const botao = "h-7 px-2.5 text-[11px] font-bold";
  return (
    <section aria-label="Método do funil" className="shrink-0 space-y-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] px-4 py-2.5">
      {daIa && (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-800 dark:text-sky-300">
          <span>A Aurora moveu este lead para <b>{NOME_DA_ETAPA[tipo]}</b>{situacao ? ` · ${situacao.nome_exibido}` : ""}.</span>
          <button type="button" onClick={() => void metodo.executar(lead.id, "spy_desfazer", {}, "Mudança desfeita.")} className="ml-auto inline-flex items-center gap-1 bg-transparent border-0 p-0 font-bold underline cursor-pointer text-inherit"><Undo2 className="w-3 h-3" /> Desfazer</button>
        </div>
      )}
      {/* No celular as duas linhas rolam de lado, para sobrar altura para a ficha. */}
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-4 gap-1.5">
        <Dimensao nome="Situação" valor={situacao?.nome_exibido ?? "Sem situação"} />
        <Dimensao nome="Conversa" valor={estado?.conversa_status ? CONVERSA[estado.conversa_status] : "—"} />
        <Dimensao nome="Prazo" valor={estado?.pausa_ate ? `Pausado até ${diaCurto(estado.pausa_ate)}` : sla ? NOME_DO_SLA[sla] : "—"} cor={!estado?.pausa_ate && sla ? COR_DO_SLA[sla] : undefined} />
        <Dimensao nome="Pagamento" valor={estado?.pagamento_status ? NOME_DO_PAGAMENTO[estado.pagamento_status] : "Sem cobrança"} />
        <Dimensao nome="Temperatura" valor={temp(lead.temperature)} />
        <Dimensao nome="Relacionamento" valor={contato ? RELACIONAMENTO[contato.relacionamento] : "—"} />
        <Dimensao nome="Permissão" valor={contato ? PERMISSAO[contato.permissao_contato] : "—"} />
        <Dimensao nome="Bola com" valor={situacao?.bola_com ? NOME_DA_BOLA[situacao.bola_com] : "—"} />
      </div>
      <div className="flex overflow-x-auto sm:flex-wrap gap-1.5 [&>button]:shrink-0">
        {/* Em venda ganha antiga não cria prazos retroativos. */}
        {!estado?.situacao_codigo && tipo !== "perdido" && <Button className={botao} onClick={() => void metodo.executar(lead.id, "spy_iniciar", { p_com_prazos: tipo !== "ganho" }, "Acompanhamento iniciado.")}>Iniciar acompanhamento</Button>}
        {tipo === "repescagem" && <Button className={botao} onClick={() => void metodo.executar(lead.id, "spy_reativar", {}, "Lead reativado.")}>Cliente respondeu</Button>}
        {tipo !== "perdido" && tipo !== "desqualificado" && <Button variant="outline" className={botao} onClick={() => metodo.abrir({ tipo: "situacao", leadId: lead.id })}>Mudar situação</Button>}
        {ativo && <Button variant="outline" className={botao} onClick={() => metodo.abrir({ tipo: "pedido", leadId: lead.id, pedido: { acao: "repescagem" } })}>Repescagem</Button>}
        {aberto && <Button variant="outline" className={botao} onClick={() => metodo.abrir({ tipo: "pagamento", leadId: lead.id })}>Pagamento</Button>}
        {tipo !== "ganho" && <Button variant="outline" className={botao} onClick={() => metodo.abrir({ tipo: "presencial", leadId: lead.id })}>Venda presencial</Button>}
        {aberto && (estado?.pausa_ate
          ? <Button variant="outline" className={botao} onClick={() => void metodo.executar(lead.id, "spy_retomar", {}, "Prazos retomados.")}>Retomar agora</Button>
          : <Button variant="outline" className={botao} onClick={() => metodo.abrir({ tipo: "pausa", leadId: lead.id })}>Pediu mais tempo</Button>)}
        {aberto && <Button variant="outline" className={cn(botao, "text-[var(--color-danger)]")} onClick={() => metodo.abrir({ tipo: "pedido", leadId: lead.id, pedido: { acao: "perdido", naoLead: false } })}>Perdido</Button>}
      </div>
    </section>
  );
}

const DIMENSAO: Record<string, string> = { etapa: "Etapa", situacao: "Situação", pagamento: "Pagamento", sla: "Prazo", temperatura: "Temperatura", conversa: "Conversa", relacionamento: "Relacionamento", permissao: "Permissão" };
const AUTOR = { ia: "Aurora", sistema: "Sistema", usuario: "Vendedor" } as const;

export function AbaDoFunil({ lead }: { lead: any }) {
  const metodo = useMetodo();
  const { activeTenantId } = useAuth();
  const { colaboradores } = useData();
  const info = metodo.info(lead);
  const [dados, setDados] = useState<{ notas: Nota[]; historico: Registro[]; pagamentos: Pagamento[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setErro(null);
    if (!activeTenantId) return;
    let vale = true;
    carregarDoLead(activeTenantId, lead.id).then((d) => { if (vale) setDados(d); }).catch((e) => { if (vale) setErro(e.message); });
    return () => { vale = false; };
  }, [activeTenantId, lead.id, metodo.versao]);
  if (erro) return <p className="px-5 py-4 text-xs text-[var(--color-danger)]">{erro}</p>;
  if (!dados) return <div className="grid place-items-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>;
  const nomeDe = (id: string | null) => (colaboradores as any[]).find((c) => c.user_id === id)?.nome as string | undefined;
  const situacoes = info ? metodo.situacoes(info.funil.id) : [];
  const legivel = (dim: string, v: string | null) => (!v ? "—" : dim === "etapa" ? NOME_DA_ETAPA[v as TipoEtapa] ?? v : dim === "situacao" ? situacoes.find((s) => s.codigo === v)?.nome_exibido ?? v : dim === "pagamento" ? NOME_DO_PAGAMENTO[v] ?? v : v);
  const titulo = "text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)] mb-2";
  const cartao = "rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-2.5";
  const vazio = (t: string) => <p className="text-[11px] text-[var(--color-text-faint)]">{t}</p>;
  return (
    <div className="px-5 py-4 space-y-5 text-xs">
      <section><h3 className={titulo}>Notas por etapa</h3>
        {!dados.notas.length ? vazio("Nenhuma nota do método ainda.") : <ul className="m-0 p-0 list-none space-y-2">
          {dados.notas.map((n) => (
            <li key={n.id} className={cartao}>
              <p className="text-[10px] font-bold text-[var(--color-text-muted)]">{NOME_DA_ETAPA[n.etapa_tipo as TipoEtapa] ?? n.etapa_tipo} · {n.autor_tipo === "ia" ? "Aurora" : nomeDe(n.autor_id) ?? "Vendedor"} · {quando(n.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[var(--color-text-primary)]">{n.texto}</p>
              {(n.concorrente || n.valor_esperado || n.data_retorno) && <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">{[n.concorrente && `Concorrente: ${n.concorrente}`, n.valor_esperado && `Valor esperado: ${dinheiro(n.valor_esperado)}`, n.data_retorno && `Retorno: ${n.data_retorno.split("-").reverse().join("/")}`].filter(Boolean).join(" · ")}</p>}
            </li>))}
        </ul>}
      </section>
      <section><h3 className={titulo}>Pagamento</h3>
        {!dados.pagamentos.length ? vazio("Nenhuma cobrança registrada.") : <ul className="m-0 p-0 list-none space-y-2">
          {dados.pagamentos.map((p) => (
            <li key={p.id} className={cn(cartao, "flex flex-wrap items-center gap-x-3")}>
              <b className="text-[var(--color-text-primary)]">{dinheiro(p.valor)}</b><span>{NOME_DO_PAGAMENTO[p.status] ?? p.status}</span>
              <span className="text-[var(--color-text-muted)]">{[p.metodo, p.origem === "manual" ? "marcado à mão" : p.gateway === "agente" ? "identificado pelo Agente Secreto" : "avisado pelo meio de pagamento"].filter(Boolean).join(" · ")}</span>
              <span className="ml-auto text-[10px] text-[var(--color-text-faint)]">{quando(p.confirmado_em ?? p.created_at)}</span>
            </li>))}
        </ul>}
      </section>
      <section><h3 className={titulo}>Mudanças de status</h3>
        {!dados.historico.length ? vazio("Sem mudanças registradas.") : <ol className="m-0 p-0 list-none space-y-1.5">
          {dados.historico.map((h) => (
            <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-[var(--color-border-subtle)] pb-1.5">
              <b className="text-[var(--color-text-primary)]">{DIMENSAO[h.dimensao] ?? h.dimensao}</b>
              <span>{legivel(h.dimensao, h.de)} → {legivel(h.dimensao, h.para)}</span>
              <span className="ml-auto text-[10px] text-[var(--color-text-faint)]">{AUTOR[h.autor_tipo]}{h.desfaz_id ? " (desfez)" : ""} · {quando(h.created_at)}</span>
            </li>))}
        </ol>}
      </section>
    </div>
  );
}
