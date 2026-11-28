import { useCallback, useEffect, useState } from "react";
import { Loader2, Phone, Users, ShoppingBag, CheckCircle2, WifiOff, PlusCircle, Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { confirmDialog } from "./ui/confirm-dialog";
import { AgenteSecretoQrModal } from "./AgenteSecretoQrModal";
import { apiFetch } from "../lib/apiClient";
import { isVendedorColab } from "../lib/sellers";
import { AGENTE_SECRETO_STATUS_EVENT } from "./AgenteSecretoConexao";
import { useAuth } from "../contexts/AuthContext";

interface Sessao { session: string | null; status?: string; phone?: string | null; ativo?: boolean; internoAtivo?: boolean; vendasAtivo?: boolean }

interface Props {
  colaborador: { id: string; nome: string; [k: string]: any };
  /** true = a própria pessoa (usa as rotas "minha-sessao"); false = administrador olhando um colaborador. */
  propria: boolean;
  /** Administrador pode criar a sessão, ligar e desligar os agentes e conectar o WhatsApp de outra pessoa. */
  podeGerenciar: boolean;
}

/**
 * Os Agentes Secretos de uma pessoa usam UMA só sessão de WhatsApp. Cada agente é um produto com a sua chave em Admin > Módulos:
 * o Interno (acompanha os grupos da equipe) e o de Vendas (só vendedor/closer: acompanha as conversas de venda).
 */
export function AgentesSecretosPainel({ colaborador, propria, podeGerenciar }: Props) {
  const { isModuleEnabled } = useAuth();
  const temInterno = isModuleEnabled("agente_interno");
  const temVendas = isVendedorColab(colaborador) && isModuleEnabled("agente_secreto");
  const algum = temInterno || temVendas;
  const [sessao, setSessao] = useState<Sessao | null | "erro">(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<"criar" | "interno" | "vendas" | null>(null);
  const [qr, setQr] = useState(false);

  const url = propria ? "/api/agente-secreto/minha-sessao" : `/api/agente-secreto/sessoes/${encodeURIComponent(colaborador.id)}/status`;

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch(url);
      setSessao(r.ok ? ((await r.json().catch(() => ({ session: null }))) as Sessao) : "erro");
    } catch { setSessao("erro"); }
    setCarregando(false);
  }, [url]);

  useEffect(() => {
    if (!algum) return;
    setCarregando(true);
    void carregar();
    window.addEventListener(AGENTE_SECRETO_STATUS_EVENT, carregar);
    return () => window.removeEventListener(AGENTE_SECRETO_STATUS_EVENT, carregar);
  }, [carregar, algum]);

  async function enviar(acao: "criar" | "interno" | "vendas", url: string, corpo: Record<string, unknown>, sucesso: (j: any) => string) {
    setOcupado(acao);
    try {
      const r = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j?.error || "Não foi possível concluir agora."); return; }
      toast.success(sucesso(j));
      await carregar();
      window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));
    } catch { toast.error("Não foi possível concluir agora."); }
    finally { setOcupado(null); }
  }

  const criarSessao = () => enviar("criar", "/api/agente-secreto/sessoes", { colaboradorId: colaborador.id },
    (j) => (j.created === false ? "A sessão já existia." : "Sessão criada. Agora é só conectar o WhatsApp lendo o QR code."));

  // Liga ou desliga um agente só; o WhatsApp continua conectado e o outro agente não muda.
  async function alternar(agente: "interno" | "vendas", titulo: string, ligar: boolean) {
    if (!ligar && !(await confirmDialog({
      title: `Desligar o ${titulo}?`,
      description: agente === "interno"
        ? `Ele deixa de acompanhar os grupos pelo WhatsApp de ${colaborador.nome}. O WhatsApp continua conectado e dá para ligar de novo quando quiser.`
        : `Ele deixa de ler as conversas de venda de ${colaborador.nome}: nada novo entra no funil por este número enquanto estiver desligado. O WhatsApp continua conectado e dá para ligar de novo quando quiser.`,
      confirmText: "Desligar",
    }))) return;
    await enviar(agente, `/api/agente-secreto/sessoes/${encodeURIComponent(colaborador.id)}/agente`, { agente, ligado: ligar },
      () => `${titulo} ${ligar ? "ligado" : "desligado"}. A sessão pode levar alguns segundos para voltar.`);
  }

  if (!algum) return <p className="text-xs text-[var(--color-text-faint)] py-4">Nenhum Agente Secreto contratado para esta pessoa. O Interno e o de Vendas são módulos à parte (Admin &gt; Módulos), e o de Vendas vale só para vendedor ou closer.</p>;
  if (carregando) return <div className="grid place-items-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>;

  const temSessao = !!sessao && sessao !== "erro" && !!sessao.session;
  const conectado = temSessao && (sessao as Sessao).status === "CONNECTED";
  const internoAtivo = temSessao && !!(sessao as Sessao).internoAtivo;
  // undefined = o WhatsApp não respondeu: a tela não afirma que está ligado nem desligado.
  const vendasAtivo = temSessao ? (sessao as Sessao).vendasAtivo : false;
  const caixa = "rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-4";

  const agentes = [
    ...(temInterno ? [{ id: "interno", titulo: "Agente Secreto Interno", icon: Users, descricao: "Acompanha os grupos de WhatsApp da equipe e avisa o responsável de cada departamento. Conversa privada nunca entra no SPY e quem é da equipe não vira lead.", ligado: internoAtivo as boolean | undefined, podeLigar: true }] : []),
    // Quem não é de vendas só vê este cartão se a sessão ainda estiver entregando conversas, para poder desligar.
    ...(temVendas || vendasAtivo ? [{ id: "vendas", titulo: "Agente Secreto de Vendas", icon: ShoppingBag, descricao: "Acompanha as conversas de venda do vendedor/closer com os clientes e alimenta o funil.", ligado: vendasAtivo, podeLigar: temVendas }] : []),
  ];

  return (
    <div className="space-y-3">
      <div className={`${caixa} space-y-3`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 grid place-items-center shrink-0"><Phone className="w-4 h-4 text-[var(--color-primary-blue)]" /></div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-black text-[var(--color-text-primary)]">WhatsApp{propria ? " (o seu)" : ""}</h4>
            <p className="text-[11px] text-[var(--color-text-muted)]">Uma conexão só, usada pelos agentes abaixo.</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${sessao === "erro" ? "text-amber-600" : conectado ? "text-emerald-600" : temSessao ? "text-rose-500" : "text-[var(--color-text-faint)]"}`}>
            {sessao === "erro" ? <><WifiOff className="w-3.5 h-3.5" />Não foi possível consultar</>
              : conectado ? <><CheckCircle2 className="w-3.5 h-3.5" />Conectado{(sessao as Sessao).phone ? ` · +${String((sessao as Sessao).phone).replace(/\D/g, "")}` : ""}</>
              : temSessao ? <><WifiOff className="w-3.5 h-3.5" />Desconectado</>
              : "Sem sessão"}
          </span>
          {sessao !== "erro" && (
            !temSessao ? (
              podeGerenciar
                ? <Button size="sm" disabled={!!ocupado} onClick={criarSessao} className="h-8 text-xs gap-1.5">{ocupado === "criar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}Criar sessão</Button>
                : <span className="text-[11px] text-[var(--color-text-faint)]">Peça ao administrador para criar.</span>
            ) : !conectado && (propria || podeGerenciar) ? (
              <Button size="sm" onClick={() => setQr(true)} className="h-8 text-xs gap-1.5"><Phone className="w-3.5 h-3.5" />Conectar WhatsApp</Button>
            ) : null
          )}
        </div>
      </div>

      {agentes.map(({ id, titulo, icon: Icon, descricao, ligado, podeLigar }) => (
        <div key={id} className={`${caixa} flex items-start gap-3`}>
          <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 grid place-items-center shrink-0"><Icon className="w-4 h-4 text-[var(--color-primary-blue)]" /></div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h4 className="text-sm font-black text-[var(--color-text-primary)]">{titulo}</h4>
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mt-0.5">{descricao}</p>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className={`text-[11px] font-bold ${ligado && conectado ? "text-emerald-600" : ligado ? "text-amber-600" : "text-[var(--color-text-faint)]"}`}>
                {!temSessao ? "Aguardando a sessão" : ligado === undefined ? "Não foi possível confirmar" : ligado ? (conectado ? "Ativo" : "Ligado, aguardando o WhatsApp conectar") : "Desligado"}
              </span>
              {temSessao && podeGerenciar && ligado !== undefined && (ligado || podeLigar) && (
                <Button size="sm" variant={ligado ? "ghost" : "default"} disabled={!!ocupado} onClick={() => alternar(id as "interno" | "vendas", titulo, !ligado)} className={`h-8 text-xs gap-1.5 ${ligado ? "text-rose-500" : ""}`}>
                  {ocupado === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}{ligado ? "Desligar" : "Ligar"}
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}

      {!temVendas && isModuleEnabled("agente_secreto") && (
        <p className="text-[11px] text-[var(--color-text-faint)]">O Agente Secreto de Vendas só existe para quem tem cargo ou departamento de vendas (vendedor, closer, SDR, comercial).</p>
      )}

      <AgenteSecretoQrModal
        open={qr}
        onClose={() => setQr(false)}
        title={`Conectar o WhatsApp${propria ? "" : ` de ${colaborador.nome}`}`}
        colaboradorId={propria ? undefined : colaborador.id}
        colaboradorNome={colaborador.nome}
        checkConnected={async () => {
          try { const r = await apiFetch(url); const j = r.ok ? await r.json().catch(() => null) : null; return j?.status === "CONNECTED"; } catch { return false; }
        }}
        onConnected={() => {
          setQr(false);
          toast.success("WhatsApp conectado!");
          void carregar();
          window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));
        }}
      />
    </div>
  );
}
