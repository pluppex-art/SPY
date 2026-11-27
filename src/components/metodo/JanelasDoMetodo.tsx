/** As janelas do método: transição com nota, repescagem, perda, venda (pagamento ou loja) e "cliente pediu mais tempo". */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { useData } from "../../contexts/DataContext";
import { dataDaSituacao, etapaDaSituacao, NOME_DA_ETAPA, type Pedido, type TipoEtapa } from "../../lib/metodo/regras";
import { useMetodo } from "./MetodoProvider";

export type Janela =
  | { tipo: "pedido"; leadId: string; pedido: Pedido }
  | { tipo: "situacao"; leadId: string }
  | { tipo: "pagamento"; leadId: string }
  | { tipo: "presencial"; leadId: string }
  | { tipo: "pausa"; leadId: string };

interface Props { janela: Janela; onFechar: () => void; onConcluido: () => void }

const campo = "w-full h-9 px-3 rounded-lg text-xs border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";
const Campo = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">{rotulo}{children}</label>
);
const Nota = ({ valor, onChange, rotulo = "Nota", dica }: { valor: string; onChange: (v: string) => void; rotulo?: string; dica: string }) => (
  <Campo rotulo={rotulo}><textarea value={valor} onChange={(e) => onChange(e.target.value)} rows={4} maxLength={4000} placeholder={dica} autoFocus className={`${campo} h-auto py-2 resize-y font-medium`} /></Campo>
);
const numero = (v: string) => { const n = Number(v.replace(/\./g, "").replace(",", ".")); return v.trim() && Number.isFinite(n) ? n : null; };
const METODOS: [string, string][] = [["pix", "Pix"], ["cartao", "Cartão"], ["boleto", "Boleto"], ["link", "Link"], ["dinheiro", "Dinheiro"], ["outro", "Outro"]];

/** O que a nota precisa contar, pela etapa que o lead está deixando. */
const DICA: Partial<Record<TipoEtapa, string>> = {
  novo_lead: "Necessidade, contexto do cliente, urgência, como chegou.",
  atendimento: "O que o cliente precisa e o que falta para o orçamento.",
  orcamento: "O que foi oferecido, condições, objeções e como foram tratadas.",
  aguardando_pagamento: "Condição combinada e o que falta para o pagamento.",
  repescagem: "O que o cliente disse e o que ficou combinado.",
};

/** ESC fecha só esta janela, não o detalhe do lead que está por baixo. */
function useEscSoAqui(fechar: () => void) {
  const f = useRef(fechar); f.current = fechar;
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); f.current(); } };
    window.addEventListener("keydown", ouvir, true);
    return () => window.removeEventListener("keydown", ouvir, true);
  }, []);
}

function Moldura({ titulo, onFechar, onConfirmar, pode, acao = "Confirmar", children }: { titulo: string; onFechar: () => void; onConfirmar: () => Promise<void>; pode: boolean; acao?: string; children: ReactNode }) {
  const [enviando, setEnviando] = useState(false);
  useEscSoAqui(() => { if (!enviando) onFechar(); });
  return (
    <Modal isOpen onClose={() => !enviando && onFechar()} closeOnBackdrop={false} title={titulo} maxWidth="max-w-lg"
      footer={<>
        <Button variant="outline" onClick={onFechar} disabled={enviando} className="h-9 px-3 text-xs">Cancelar</Button>
        <Button disabled={!pode || enviando} onClick={() => { setEnviando(true); void onConfirmar().finally(() => setEnviando(false)); }} className="h-9 px-4 text-xs font-bold gap-1.5">
          {enviando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {acao}
        </Button>
      </>}>
      <div className="space-y-3">{children}</div>
    </Modal>
  );
}

export function JanelaDoMetodo(props: Props) {
  const { janela } = props;
  if (janela.tipo === "pausa") return <Pausa {...props} />;
  if (janela.tipo === "pagamento") return <Pagamento {...props} />;
  if (janela.tipo === "presencial") return <Presencial {...props} />;
  if (janela.tipo === "situacao") return <Transicao {...props} />;
  if (janela.pedido.acao === "repescagem") return <Repescagem {...props} />;
  if (janela.pedido.acao === "perdido") return <Perda {...props} naoLead={janela.pedido.naoLead} />;
  if (janela.pedido.acao === "ganho") return <Ganho {...props} />;
  return <Transicao {...props} />;
}

function useLead(leadId: string) {
  const { leads } = useData();
  const metodo = useMetodo();
  const lead = (leads as any[]).find((l) => l.id === leadId);
  return { lead, info: metodo.info(lead), metodo };
}

/** Mudar de etapa (com a situação de chegada) ou só trocar a situação dentro da etapa. */
function Transicao({ janela, onFechar, onConcluido }: Props) {
  const { lead, info, metodo } = useLead(janela.leadId);
  const destino = janela.tipo === "pedido" && janela.pedido.acao === "mover" ? janela.pedido.destino : null;
  const etapa = destino ?? info?.tipo;
  const opcoes = info ? metodo.situacoes(info.funil.id).filter((s) => etapaDaSituacao(info.funil, s) === etapa) : [];
  const [situacao, setSituacao] = useState("");
  const [nota, setNota] = useState("");
  const [data, setData] = useState("");
  const [valor, setValor] = useState(String(Number(lead?.value) > 0 ? lead.value : "").replace(".", ","));
  if (!lead || !info || !etapa) return null;
  const escolhida = opcoes.find((s) => s.codigo === situacao) ?? (destino ? opcoes[0] : undefined);
  const pedeValor = destino === "orcamento";
  const pedeNota = !!destino || !!escolhida?.exige_nota;
  const pedeData = dataDaSituacao(escolhida);
  const pode = (!pedeNota || !!nota.trim()) && (destino ? true : !!escolhida) && (!pedeValor || (numero(valor) ?? 0) > 0) && (pedeData !== "obrigatoria" || !!data);
  const confirmar = async () => {
    const dados = {
      ...(pedeValor ? { valor: numero(valor) } : {}),
      ...(pedeData && data ? { data: `${data}T${pedeData === "opcional" ? "18" : "09"}:00:00-03:00`, ...(pedeData === "obrigatoria" ? { data_retorno: data } : {}) } : {}),
    };
    const feito = destino
      ? await metodo.executar(lead.id, "spy_mover_etapa", { p_etapa: destino, p_nota: nota.trim(), p_situacao: escolhida?.codigo ?? null, p_dados: dados }, `Movido para ${NOME_DA_ETAPA[destino]}.`)
      : await metodo.executar(lead.id, "spy_mudar_situacao", { p_situacao: escolhida!.codigo, p_nota: nota.trim() || null, p_dados: dados }, "Situação atualizada.");
    if (feito) onConcluido();
  };
  return (
    <Moldura titulo={destino ? `${lead.name}: ir para ${NOME_DA_ETAPA[destino]}` : `${lead.name}: mudar situação`} onFechar={onFechar} onConfirmar={confirmar} pode={pode}>
      {(!destino || opcoes.length > 1) && (
        <Campo rotulo="Situação">
          <select value={escolhida?.codigo ?? ""} onChange={(e) => setSituacao(e.target.value)} className={campo}>
            {!destino && <option value="">Escolha a situação</option>}
            {opcoes.map((s) => <option key={s.codigo} value={s.codigo}>{s.nome_exibido}</option>)}
          </select>
        </Campo>
      )}
      {pedeValor && <Campo rotulo="Valor do orçamento (R$)"><input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} /></Campo>}
      {pedeData && <Campo rotulo={pedeData === "obrigatoria" ? "Data do retorno" : "Prazo de entrega (se houver)"}><input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} /></Campo>}
      <Nota valor={nota} onChange={setNota} rotulo={pedeNota ? "Nota (obrigatória)" : "Nota (se quiser)"} dica={DICA[info.tipo] ?? "O que aconteceu?"} />
    </Moldura>
  );
}

function Repescagem({ janela, onFechar, onConcluido }: Props) {
  const { lead, metodo } = useLead(janela.leadId);
  const motivos = metodo.motivos("repescagem");
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  const [data, setData] = useState("");
  const [preco, setPreco] = useState("");
  const [concorrente, setConcorrente] = useState("");
  if (!lead) return null;
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const pode = !!motivo && !!nota.trim() && (motivo !== "adiou" || data > hoje);
  const confirmar = async () => {
    const dados = { ...(motivo === "adiou" ? { data_retorno: data } : {}), ...(numero(preco) !== null ? { valor_esperado: numero(preco) } : {}), ...(concorrente.trim() ? { concorrente: concorrente.trim() } : {}) };
    if (await metodo.executar(lead.id, "spy_enviar_repescagem", { p_motivo: motivo, p_nota: nota.trim(), p_dados: dados }, "Enviado para a Repescagem.")) onConcluido();
  };
  return (
    <Moldura titulo={`${lead.name}: enviar para Repescagem`} onFechar={onFechar} onConfirmar={confirmar} pode={pode}>
      <Campo rotulo="Motivo"><select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo}><option value="">Escolha o motivo</option>{motivos.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome_exibido}</option>)}</select></Campo>
      {motivo === "adiou" && <Campo rotulo="Data combinada para o retorno"><input type="date" min={hoje} value={data} onChange={(e) => setData(e.target.value)} className={campo} /></Campo>}
      <Nota valor={nota} onChange={setNota} rotulo="Nota (obrigatória)" dica="Por que travou, o que o cliente disse, o que ficou combinado." />
      <details className="text-xs text-[var(--color-text-muted)]">
        <summary className="cursor-pointer font-bold">Preço esperado e concorrente (se houver)</summary>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Campo rotulo="Valor que o cliente espera (R$)"><input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" className={campo} /></Campo>
          <Campo rotulo="Concorrente"><input value={concorrente} onChange={(e) => setConcorrente(e.target.value)} maxLength={120} className={campo} /></Campo>
        </div>
      </details>
    </Moldura>
  );
}

function Perda({ janela, onFechar, onConcluido, naoLead }: Props & { naoLead: boolean }) {
  const { lead, metodo } = useLead(janela.leadId);
  const motivos = metodo.motivos("perda").filter((m) => (naoLead ? m.codigo === "nao_lead" : true));
  const [motivo, setMotivo] = useState(naoLead ? "nao_lead" : "");
  const [nota, setNota] = useState("");
  const [concorrente, setConcorrente] = useState("");
  const [preco, setPreco] = useState("");
  if (!lead) return null;
  const confirmar = async () => {
    const dados = { ...(numero(preco) !== null ? { valor_esperado: numero(preco) } : {}), ...(concorrente.trim() ? { concorrente: concorrente.trim() } : {}) };
    if (await metodo.executar(lead.id, "spy_marcar_perdido", { p_motivo: motivo, p_nota: nota.trim(), p_dados: dados }, motivo === "nao_lead" ? "Marcado como não-lead." : "Marcado como perdido.")) onConcluido();
  };
  return (
    <Moldura titulo={`${lead.name}: ${naoLead ? "não é um lead" : "marcar como perdido"}`} onFechar={onFechar} onConfirmar={confirmar} pode={!!motivo && !!nota.trim()}>
      <Campo rotulo="Motivo"><select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo}><option value="">Escolha o motivo</option>{motivos.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome_exibido}</option>)}</select></Campo>
      <Nota valor={nota} onChange={setNota} rotulo="Nota (obrigatória)" dica="Por que perdeu e o que poderia ter mudado o resultado." />
      {!naoLead && (
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Concorrente (se houver)"><input value={concorrente} onChange={(e) => setConcorrente(e.target.value)} maxLength={120} className={campo} /></Campo>
          <Campo rotulo="Preço praticado (R$)"><input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" className={campo} /></Campo>
        </div>
      )}
    </Moldura>
  );
}

/** Soltar em "Venda ganha": só vira venda por pagamento recebido ou venda na loja. */
function Ganho(props: Props) {
  const [como, setComo] = useState<"" | "pagamento" | "presencial">("");
  if (como === "pagamento") return <Pagamento {...props} soPago />;
  if (como === "presencial") return <Presencial {...props} />;
  return <EscolhaDaVenda onFechar={props.onFechar} onEscolher={setComo} />;
}

function EscolhaDaVenda({ onFechar, onEscolher }: { onFechar: () => void; onEscolher: (c: "pagamento" | "presencial") => void }) {
  useEscSoAqui(onFechar);
  return (
    <Modal isOpen onClose={onFechar} title="Como foi a venda?" maxWidth="max-w-md"
      footer={<Button variant="outline" onClick={onFechar} className="h-9 px-3 text-xs">Cancelar</Button>}>
      <div className="grid gap-2">
        <Button onClick={() => onEscolher("pagamento")} className="h-11 text-xs font-bold">Recebi o pagamento</Button>
        <Button variant="outline" onClick={() => onEscolher("presencial")} className="h-11 text-xs font-bold">Venda presencial (na loja)</Button>
      </div>
    </Modal>
  );
}

function Pagamento({ janela, onFechar, onConcluido, soPago }: Props & { soPago?: boolean }) {
  const { lead, metodo } = useLead(janela.leadId);
  const [status, setStatus] = useState(soPago ? "pago" : "cobranca_enviada");
  const [forma, setForma] = useState("pix");
  const [valor, setValor] = useState(String(Number(lead?.value) > 0 ? lead.value : "").replace(".", ","));
  const [vence, setVence] = useState("");
  if (!lead) return null;
  const boleto = status === "cobranca_enviada" && forma === "boleto";
  const pode = (numero(valor) ?? 0) > 0 && (!boleto || !!vence);
  const confirmar = async () => {
    const argumentos = { p_status: status, p_valor: numero(valor), p_metodo: forma, ...(boleto ? { p_vencimento: `${vence}T23:59:00-03:00` } : {}) };
    if (await metodo.executar(lead.id, "spy_registrar_pagamento", argumentos, status === "pago" ? "Pagamento registrado. Venda ganha!" : "Cobrança registrada.")) onConcluido();
  };
  return (
    <Moldura titulo={`${lead.name}: ${soPago ? "pagamento recebido" : "registrar pagamento"}`} onFechar={onFechar} onConfirmar={confirmar} pode={pode}>
      {!soPago && <Campo rotulo="O que aconteceu"><select value={status} onChange={(e) => setStatus(e.target.value)} className={campo}><option value="cobranca_enviada">Enviei a cobrança</option><option value="pago">Recebi o pagamento</option><option value="recusado">Pagamento recusado</option></select></Campo>}
      <Campo rotulo="Forma"><select value={forma} onChange={(e) => setForma(e.target.value)} className={campo}>{METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Campo>
      <Campo rotulo="Valor (R$)"><input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} /></Campo>
      {boleto && <Campo rotulo="Vencimento do boleto"><input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className={campo} /></Campo>}
      <p className="text-[11px] text-[var(--color-text-faint)]">O SPY não gera cobrança: registre aqui a que você enviou pelo seu meio de pagamento.</p>
    </Moldura>
  );
}

function Presencial({ janela, onFechar, onConcluido }: Props) {
  const { lead, metodo } = useLead(janela.leadId);
  const [valor, setValor] = useState(String(Number(lead?.value) > 0 ? lead.value : "").replace(".", ","));
  const [forma, setForma] = useState("dinheiro");
  const [nota, setNota] = useState("");
  const [entregar, setEntregar] = useState(false);
  if (!lead) return null;
  const confirmar = async () => {
    if (await metodo.executar(lead.id, "spy_registrar_venda_presencial", { p_valor: numero(valor), p_nota: nota.trim(), p_metodo: forma, p_entregar: entregar }, "Venda presencial registrada!")) onConcluido();
  };
  return (
    <Moldura titulo={`${lead.name}: venda presencial`} onFechar={onFechar} onConfirmar={confirmar} pode={(numero(valor) ?? 0) > 0 && !!nota.trim()}>
      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo="Valor (R$)"><input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} /></Campo>
        <Campo rotulo="Forma de pagamento"><select value={forma} onChange={(e) => setForma(e.target.value)} className={campo}>{METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Campo>
      </div>
      <Nota valor={nota} onChange={setNota} rotulo="Nota (obrigatória)" dica="O que decidiu a compra, condição final, entrega ou retirada." />
      <label className="flex items-center gap-2 text-xs text-[var(--color-text-primary)] cursor-pointer"><input type="checkbox" checked={entregar} onChange={(e) => setEntregar(e.target.checked)} /> Ainda falta entregar ou o cliente vai retirar</label>
    </Moldura>
  );
}

function Pausa({ janela, onFechar, onConcluido }: Props) {
  const { lead, metodo } = useLead(janela.leadId);
  const [data, setData] = useState("");
  const [hora, setHora] = useState("09:00");
  const [nota, setNota] = useState("");
  if (!lead) return null;
  const quando = data && hora ? `${data}T${hora}:00-03:00` : "";
  const confirmar = async () => {
    if (await metodo.executar(lead.id, "spy_pausar_ate", { p_data: quando, p_nota: nota.trim() }, "Combinado registrado. Os prazos ficam pausados até lá.")) onConcluido();
  };
  return (
    <Moldura titulo={`${lead.name}: cliente pediu mais tempo`} onFechar={onFechar} onConfirmar={confirmar} pode={!!quando && Date.parse(quando) > Date.now() && !!nota.trim()}>
      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo="Retomar em"><input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} /></Campo>
        <Campo rotulo="Hora (Brasília)"><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={campo} /></Campo>
      </div>
      <Nota valor={nota} onChange={setNota} rotulo="Nota (obrigatória)" dica="O que o cliente pediu e o que ficou combinado." />
      <p className="text-[11px] text-[var(--color-text-faint)]">Ficam pausados os prazos, follow-ups e a cadência deste lead. É criada a tarefa “Retomar contato” para a data.</p>
    </Moldura>
  );
}
