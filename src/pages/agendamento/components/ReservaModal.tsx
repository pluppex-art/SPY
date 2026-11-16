import { useEffect, useMemo, useState } from "react";
import { Check, History, Loader2, MessageCircle, UserX } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { HelpTip } from "../../../components/ui/help-tip";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { cn } from "../../../lib/utils";
import { horaParaExibir, minutosDaHora, unidadeId } from "../../../lib/agendamento/engine";
import { chamar, dataBR, reaisBR, type ConfigLinha, type Reserva } from "../../../lib/agendamento/cliente";
import { PagamentoForm, type PedidoPagamento } from "./PagamentoForm";
import { COR_STATUS, campo, rotulo } from "./Estilos";

interface Props {
  reserva: Reserva | null; config: ConfigLinha; admin: boolean; permissoes: Record<string, boolean>; onClose: () => void;
  executar: (fn: () => Promise<unknown>, sucesso?: string) => Promise<boolean>;
}

const horaHHMM = (h: string) => { const [a, b] = h.split(":"); return `${a.padStart(2, "0")}:${b ?? "00"}`; };
const Info = ({ t, v }: { t: string; v: React.ReactNode }) => (<div><p className={rotulo}>{t}</p><p className="text-sm font-semibold text-[var(--color-text-primary)] break-words">{v || "—"}</p></div>);

/** Tudo de uma reserva: dados, check-in por unidade, escolha de pistas, recebimento, edição e cancelamento. */
export function ReservaModal({ reserva: r, config, admin, permissoes, onClose, executar }: Props) {
  const { activeTenantId } = useAuth();
  const [irmas, setIrmas] = useState<Reserva[]>([]);
  const [grupo, setGrupo] = useState(false);
  const [pedido, setPedido] = useState<PedidoPagamento | null>(null); const [erroPag, setErroPag] = useState<string | null>(null);
  const [receber, setReceber] = useState(false); const [cancelar, setCancelar] = useState(false); const [motivo, setMotivo] = useState("");
  const [editar, setEditar] = useState(false);
  const [f, setF] = useState<Record<string, any>>({});
  const [pistas, setPistas] = useState<number[]>([]); const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState<any[] | null>(null);
  const pode = (k: string) => admin || !!permissoes[k];

  useEffect(() => {
    setIrmas([]); setGrupo(false); setReceber(false); setCancelar(false); setMotivo(""); setHistorico(null); setPedido(null);
    if (!r) return;
    setEditar(false); setPistas(r.recursosAtribuidos);
    setF({ contatoNome: r.contatoNome, contatoTelefone: r.contatoTelefone ?? "", contatoEmail: r.contatoEmail ?? "", data: r.data, hora: horaHHMM(r.hora), duracao: String(r.duracao), qtdRecursos: r.qtdRecursos, qtdPessoas: r.qtdPessoas,
      tipoEvento: r.tipoEvento ?? "", observacoes: r.observacoes ?? "", comanda: r.comanda ?? "", valorTotal: String(r.valorTotal), mesa: r.mesa, mesaCadeiras: r.mesaCadeiras ?? 4, aniversariante: r.aniversariante ?? "" });
    if (!supabase || !activeTenantId) return;
    supabase.from("agendamento_reservas").select("*").eq("tenant_id", activeTenantId).eq("grupo_id", r.grupoId).neq("id", r.id).neq("status", "Cancelada")
      .then(async ({ data }) => { const { linhaParaReserva } = await import("../../../lib/agendamento/cliente"); setIrmas((data || []).map(linhaParaReserva)); });
  }, [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const horaIni = r ? Math.floor(minutosDaHora(r.hora) / 60) : 0;
  const horas = useMemo(() => (r ? Array.from({ length: Math.max(1, Math.ceil(r.duracao)) }, (_, i) => horaIni + i) : []), [r, horaIni]);
  if (!r) return null;

  const ativa = r.status !== "Cancelada";
  const pagaOuCancelada = r.statusPagamento === "Pago" || !ativa;
  const pendentesDoGrupo = irmas.filter((x) => x.statusPagamento !== "Pago");
  const totalReceber = r.valorTotal + (grupo ? pendentesDoGrupo.reduce((s, x) => s + x.valorTotal, 0) : 0);
  const api = (caminho: string, corpo: unknown, metodo: "POST" | "PATCH" = "POST") => chamar(metodo, `/api/agendamento/reservas/${r.id}${caminho}`, corpo);
  const rodar = async (fn: () => Promise<unknown>, ok?: string, fechar = false) => { setOcupado(true); const deu = await executar(fn, ok); setOcupado(false); if (deu && fechar) onClose(); return deu; };
  const zap = (r.contatoTelefone ?? "").replace(/\D/g, "");

  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  const salvarEdicao = async () => {
    const corpo: Record<string, any> = {};
    const comp = (k: string, atual: any, novo: any) => { if (String(atual ?? "") !== String(novo ?? "")) corpo[k] = novo; };
    comp("contatoNome", r.contatoNome, f.contatoNome); comp("contatoTelefone", r.contatoTelefone, f.contatoTelefone); comp("contatoEmail", r.contatoEmail, f.contatoEmail);
    comp("data", r.data, f.data); comp("hora", horaHHMM(r.hora), f.hora); comp("duracao", r.duracao, Number(f.duracao)); comp("qtdRecursos", r.qtdRecursos, f.qtdRecursos); comp("qtdPessoas", r.qtdPessoas, f.qtdPessoas);
    comp("tipoEvento", r.tipoEvento, f.tipoEvento); comp("observacoes", r.observacoes, f.observacoes); comp("comanda", r.comanda, f.comanda);
    if (admin) comp("valorTotal", r.valorTotal, Number(String(f.valorTotal).replace(",", ".")) || 0);
    if (!!f.mesa !== r.mesa) corpo.mesa = !!f.mesa;
    if (f.mesa) { comp("mesaCadeiras", r.mesaCadeiras, f.mesaCadeiras); comp("aniversariante", r.aniversariante, f.aniversariante); }
    if (Object.keys(corpo).length === 0) { setEditar(false); return; }
    if (await rodar(() => api("", corpo, "PATCH"), "Reserva atualizada.")) setEditar(false);
  };

  const carregarHistorico = async () => { try { const j = await chamar<{ itens: any[] }>("GET", `/api/agendamento/reservas/${r.id}/auditoria`); setHistorico(j.itens); } catch { setHistorico([]); } };

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-2xl" title={r.contatoNome} description={`${dataBR(r.data)} · ${horaParaExibir(r.hora)} · ${r.duracao}h`}
      footer={<div className="flex items-center justify-between w-full gap-2 flex-wrap">
        {ativa && pode("cancelar") ? <Button variant="outline" className="text-rose-500 border-rose-500/30" onClick={() => setCancelar((v) => !v)}>Cancelar reserva</Button> : <span />}
        <Button variant="ghost" onClick={onClose}>Fechar</Button></div>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-black border", COR_STATUS[r.status])}>{r.status}</span>
          <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-black border", r.statusPagamento === "Pago" ? COR_STATUS.Confirmada : r.statusPagamento === "Pendente" ? COR_STATUS.Pendente : COR_STATUS["No-show"])}>Pagamento: {r.statusPagamento}</span>
          {r.origem === "site" && <span className="px-2.5 py-1 rounded-full text-[11px] font-black border border-violet-500/30 bg-violet-500/10 text-violet-600">Pelo site</span>}
          {r.comanda && <span className="px-2.5 py-1 rounded-full text-[11px] font-black border border-[var(--color-border-default)]">Comanda {r.comanda}</span>}
          {zap.length >= 10 && <a href={`https://wa.me/${zap.startsWith("55") ? zap : "55" + zap}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:underline"><MessageCircle className="w-4 h-4" />WhatsApp</a>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Info t="Telefone" v={r.contatoTelefone} /><Info t="E-mail" v={r.contatoEmail} /><Info t="Tipo de evento" v={r.tipoEvento} />
          <Info t={config.recurso_plural} v={`${r.qtdRecursos}${r.recursosAtribuidos.length ? ` (${r.recursosAtribuidos.join(", ")})` : ""}`} /><Info t="Pessoas" v={r.qtdPessoas} /><Info t="Valor" v={reaisBR(r.valorTotal)} />
          <Info t="Forma de pagamento" v={r.formaPagamento ? r.formaPagamento + (r.detalhesPagamento.length > 1 ? ` (${r.detalhesPagamento.map((d) => `${d.method} ${reaisBR(d.amount)}`).join(" + ")})` : "") : null} />
          <Info t="Criada por" v={r.origem === "site" ? "Cliente (site)" : r.criadoPorNome} />
          {r.mesa && <Info t="Mesa" v={`${r.mesaCadeiras ?? "?"} lugares${r.aniversariante ? ` · ${r.aniversariante}` : ""}`} />}
          {r.motivoCancelamento && <Info t="Motivo do cancelamento" v={r.motivoCancelamento} />}
        </div>
        {r.observacoes && <p className="text-sm text-[var(--color-text-secondary)] bg-[var(--color-surface-hover)] rounded-xl p-3">{r.observacoes}</p>}

        {ativa && r.statusPagamento !== "Pendente Estorno" && (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5"><span className={rotulo}>Presença por {config.recurso_singular.toLowerCase()}</span><HelpTip label="Presença">Marque quem chegou (check-in) ou faltou (no-show), uma {config.recurso_singular.toLowerCase()} e uma hora por vez. Toque de novo para desmarcar.</HelpTip></div>
            <div className="space-y-1.5">
              {horas.map((h) => (
                <div key={h} className="flex items-center gap-2 flex-wrap">
                  <span className="w-14 text-xs font-black text-[var(--color-text-muted)]">{String(h % 24).padStart(2, "0")}:00</span>
                  {Array.from({ length: r.qtdRecursos }, (_, i) => { const uid = unidadeId(r.id, h, i + 1); const ci = r.checkinIds.includes(uid); const ns = r.noshowIds.includes(uid); return (
                    <span key={uid} className="inline-flex rounded-lg border border-[var(--color-border-default)] overflow-hidden text-[11px] font-bold">
                      <span className="px-2 py-1.5 bg-[var(--color-surface-hover)]">{r.recursosAtribuidos[i] ? `${config.recurso_singular} ${r.recursosAtribuidos[i]}` : `#${i + 1}`}</span>
                      <button disabled={ocupado || !pode("editar")} onClick={() => rodar(() => api("/unidade", { uid, tipo: "CHECK_IN" }))} className={cn("px-2 py-1.5 flex items-center gap-1", ci ? "bg-blue-500 text-white" : "hover:bg-blue-500/10")} aria-label="Check-in"><Check className="w-3.5 h-3.5" />Chegou</button>
                      <button disabled={ocupado || !pode("editar")} onClick={() => rodar(() => api("/unidade", { uid, tipo: "NO_SHOW" }))} className={cn("px-2 py-1.5 flex items-center gap-1 border-l border-[var(--color-border-default)]", ns ? "bg-rose-500 text-white" : "hover:bg-rose-500/10")} aria-label="Não veio"><UserX className="w-3.5 h-3.5" />Faltou</button>
                    </span>); })}
                </div>
              ))}
            </div>
          </section>
        )}

        {ativa && pode("editar") && (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5"><span className={rotulo}>Qual {config.recurso_singular.toLowerCase()} vai usar</span><HelpTip label="Escolha">Marque exatamente {r.qtdRecursos} número(s). O sistema não deixa repetir o mesmo número em reservas ao mesmo tempo.</HelpTip></div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: config.qtd_recursos }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" onClick={() => setPistas((a) => (a.includes(n) ? a.filter((x) => x !== n) : a.length < r.qtdRecursos ? [...a, n].sort((x, y) => x - y) : a))} className={cn("w-9 h-9 rounded-lg text-sm font-bold border", pistas.includes(n) ? "bg-[var(--color-primary)] text-white border-transparent" : "border-[var(--color-border-default)]")}>{n}</button>))}
              <Button size="sm" disabled={ocupado || pistas.length !== r.qtdRecursos} onClick={() => rodar(() => api("/recursos", { recursos: pistas }), "Escolha salva.")}>Salvar</Button>
            </div>
          </section>
        )}

        {ativa && !pagaOuCancelada && pode("receber") && (
          <section className="space-y-3 rounded-xl border border-[var(--color-border-default)] p-3">
            {!receber ? <Button onClick={() => setReceber(true)}>Receber pagamento · {reaisBR(r.valorTotal)}</Button> : (<>
              {pendentesDoGrupo.length > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={grupo} onChange={(e) => setGrupo(e.target.checked)} />Receber também as outras {pendentesDoGrupo.length} faixa(s) desta compra</label>}
              <PagamentoForm total={totalReceber} admin={admin} podeReceber permitirDepois={false} onChange={(p, e) => { setPedido(p); setErroPag(e); }} />
              {erroPag && <p className="text-xs text-amber-600">{erroPag}</p>}
              <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setReceber(false)}>Voltar</Button>
                <Button disabled={ocupado || !pedido || !!erroPag} onClick={() => rodar(() => api("/pagamento", { grupo, pedido }), "Pagamento registrado.", true)}>{ocupado && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirmar</Button></div>
            </>)}
          </section>
        )}

        {ativa && pode("editar") && (
          <section className="space-y-3 rounded-xl border border-[var(--color-border-default)] p-3">
            {!editar ? <div className="flex items-center justify-between gap-2"><span className="text-sm text-[var(--color-text-secondary)]">Mudar dia, horário, quantidade, contato, mesa e observações.</span><Button size="sm" variant="outline" onClick={() => setEditar(true)}>Editar reserva</Button></div> : (<>
              <span className={rotulo}>Editar reserva</span>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1.5"><label className={rotulo}>Nome</label><Input value={f.contatoNome} onChange={(e) => set("contatoNome", e.target.value)} maxLength={120} /></div>
                <div className="space-y-1.5"><label className={rotulo}>Telefone</label><Input value={f.contatoTelefone} onChange={(e) => set("contatoTelefone", e.target.value)} inputMode="tel" /></div>
                <div className="space-y-1.5"><label className={rotulo}>E-mail</label><Input value={f.contatoEmail} onChange={(e) => set("contatoEmail", e.target.value)} type="email" /></div>
                <div className="space-y-1.5"><label className={rotulo}>Data</label><input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} className={campo} /></div>
                <div className="space-y-1.5"><label className={rotulo}>Início</label><input type="time" value={f.hora} onChange={(e) => set("hora", e.target.value)} className={campo} /></div>
                <div className="space-y-1.5"><label className={rotulo}>Duração (h)</label><input type="number" min={0.5} step={0.5} value={f.duracao} onChange={(e) => set("duracao", e.target.value)} className={campo} /></div>
                <div className="space-y-1.5"><label className={rotulo}>{config.recurso_plural}</label><input type="number" min={1} max={config.qtd_recursos} value={f.qtdRecursos} onChange={(e) => set("qtdRecursos", Number(e.target.value) || 1)} className={campo} /></div>
                <div className="space-y-1.5"><label className={rotulo}>Pessoas</label><input type="number" min={1} value={f.qtdPessoas} onChange={(e) => set("qtdPessoas", Number(e.target.value) || 1)} className={campo} /></div>
                <div className="space-y-1.5"><label className={rotulo}>Tipo de evento</label><select value={f.tipoEvento} onChange={(e) => set("tipoEvento", e.target.value)} className={campo}><option value="">—</option>{Array.from(new Set([...(config.tipos_evento ?? []), ...(r.tipoEvento ? [r.tipoEvento] : [])])).map((t) => <option key={t}>{t}</option>)}</select></div>
                {admin && <div className="space-y-1.5"><label className={rotulo}>Valor (R$)</label><input inputMode="decimal" value={f.valorTotal} onChange={(e) => set("valorTotal", e.target.value)} className={campo} /></div>}
                <div className="space-y-1.5"><label className={rotulo}>Comanda</label><Input value={f.comanda} onChange={(e) => set("comanda", e.target.value)} maxLength={40} /></div>
                <div className="space-y-1.5 sm:col-span-3"><label className={rotulo}>Observações</label><Input value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} maxLength={1000} /></div>
              </div>
              {config.mesas_ativo && <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!f.mesa} onChange={(e) => set("mesa", e.target.checked)} />Mesa no restaurante</label>
                {f.mesa && <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className={rotulo}>Lugares</label><input type="number" min={1} max={config.cadeiras_max} value={f.mesaCadeiras} onChange={(e) => set("mesaCadeiras", Number(e.target.value) || 1)} className={campo} /></div><div className="space-y-1.5"><label className={rotulo}>Aniversariante</label><Input value={f.aniversariante} onChange={(e) => set("aniversariante", e.target.value)} maxLength={80} /></div></div>}</div>}
              <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setEditar(false)}>Cancelar</Button><Button size="sm" disabled={ocupado} onClick={salvarEdicao}>Salvar alterações</Button></div>
            </>)}
          </section>
        )}

        {cancelar && (
          <section className="space-y-2 rounded-xl border border-rose-500/30 p-3">
            <label className={rotulo}>Motivo do cancelamento</label>
            <Input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ex.: cliente desistiu" />
            {r.statusPagamento === "Pago" && <p className="text-xs text-amber-600">Esta reserva já está paga. Cancelar retira a receita do Financeiro; a devolução do dinheiro é feita por fora.</p>}
            <div className="flex justify-end"><Button className="bg-rose-600 hover:bg-rose-700 text-white" disabled={ocupado || motivo.trim().length < 3} onClick={() => rodar(() => api("/status", { status: "Cancelada", motivo }), "Reserva cancelada.", true)}>Confirmar cancelamento</Button></div>
          </section>
        )}

        <section>
          {historico === null ? <Button variant="ghost" size="sm" onClick={carregarHistorico}><History className="w-4 h-4 mr-1.5" />Ver histórico</Button> : historico.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">Sem registros.</p> : (
            <ul className="space-y-1 text-xs text-[var(--color-text-secondary)] max-h-40 overflow-auto">{historico.map((h) => <li key={h.id}><b>{new Date(h.created_at).toLocaleString("pt-BR")}</b> · {h.user_nome || "Sistema"} · {h.acao} — {h.detalhes}</li>)}</ul>)}
        </section>
      </div>
    </Modal>
  );
}
