import { useCallback, useEffect, useState } from "react";
import { Loader2, Phone, Users, ShoppingBag, CheckCircle2, WifiOff, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { AgenteSecretoQrModal } from "./AgenteSecretoQrModal";
import { apiFetch } from "../lib/apiClient";
import { isVendedorColab } from "../lib/sellers";
import { AGENTE_SECRETO_STATUS_EVENT } from "./AgenteSecretoConexao";
import { useAuth } from "../contexts/AuthContext";

type Finalidade = "interno" | "vendas";
interface Sessao { session: string | null; status?: string; phone?: string | null; ativo?: boolean }

interface Props {
  colaborador: { id: string; nome: string; [k: string]: any };
  /** true = a própria pessoa (usa as rotas "minha-sessao"); false = administrador olhando um colaborador. */
  propria: boolean;
  /** Administrador pode criar a sessão e conectar o WhatsApp de outra pessoa. */
  podeGerenciar: boolean;
}

/**
 * Os dois Agentes Secretos de uma pessoa: o Interno (todos têm: lê os grupos da equipe e avisa quem é o responsável)
 * e o de Vendas (só vendedor/closer: acompanha as conversas de venda). Cada um tem a sua sessão de WhatsApp.
 */
export function AgentesSecretosPainel({ colaborador, propria, podeGerenciar }: Props) {
  // Dois produtos, duas chaves (Admin > Módulos): Interno = agente_interno; Vendas = agente_secreto, só para vendedor/closer.
  const { isModuleEnabled } = useAuth();
  const temInterno = isModuleEnabled("agente_interno");
  const ehVendedor = isVendedorColab(colaborador) && isModuleEnabled("agente_secreto");
  const [estado, setEstado] = useState<Record<Finalidade, Sessao | null | "erro">>({ interno: null, vendas: null });
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState<Finalidade | null>(null);
  const [qr, setQr] = useState<Finalidade | null>(null);

  const url = useCallback((f: Finalidade) => (propria
    ? `/api/agente-secreto/minha-sessao?finalidade=${f}`
    : `/api/agente-secreto/sessoes/${encodeURIComponent(colaborador.id)}/status?finalidade=${f}`), [propria, colaborador.id]);

  const carregar = useCallback(async () => {
    const consultar = async (f: Finalidade): Promise<Sessao | "erro"> => {
      try {
        const r = await apiFetch(url(f));
        if (!r.ok) return "erro";
        return (await r.json().catch(() => ({ session: null }))) as Sessao;
      } catch { return "erro"; }
    };
    const [interno, vendas] = await Promise.all([temInterno ? consultar("interno") : Promise.resolve(null), ehVendedor ? consultar("vendas") : Promise.resolve(null)]);
    setEstado({ interno, vendas });
    setCarregando(false);
  }, [url, ehVendedor, temInterno]);

  useEffect(() => {
    setCarregando(true);
    void carregar();
    window.addEventListener(AGENTE_SECRETO_STATUS_EVENT, carregar);
    return () => window.removeEventListener(AGENTE_SECRETO_STATUS_EVENT, carregar);
  }, [carregar]);

  async function criar(f: Finalidade) {
    setCriando(f);
    try {
      const r = await apiFetch("/api/agente-secreto/sessoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorId: colaborador.id, finalidade: f }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j?.error || "Não foi possível criar a sessão."); return; }
      toast.success(j.created === false ? "A sessão já existia." : "Sessão criada. Agora é só conectar o WhatsApp lendo o QR code.");
      await carregar();
      window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));
    } catch { toast.error("Não foi possível criar a sessão."); }
    finally { setCriando(null); }
  }

  const secoes: { f: Finalidade; titulo: string; descricao: string; icon: typeof Users }[] = [
    ...(temInterno ? [{ f: "interno" as Finalidade, titulo: "Agente Secreto Interno", icon: Users, descricao: "Acompanha os grupos de WhatsApp da equipe e avisa o responsável de cada departamento. Usa um WhatsApp só para isso; as conversas privadas nunca entram no SPY." }] : []),
    ...(ehVendedor ? [{ f: "vendas" as Finalidade, titulo: "Agente Secreto de Vendas", icon: ShoppingBag, descricao: "Acompanha as conversas de venda do vendedor/closer com os clientes e alimenta o funil." }] : []),
  ];

  if (!secoes.length) return <p className="text-xs text-[var(--color-text-faint)] py-4">Nenhum Agente Secreto contratado para esta pessoa. O Interno e o de Vendas são módulos à parte (Admin &gt; Módulos).</p>;
  if (carregando) return <div className="grid place-items-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>;

  return (
    <div className="space-y-3">
      {secoes.map(({ f, titulo, descricao, icon: Icon }) => {
        const s = estado[f];
        const temSessao = !!s && s !== "erro" && !!s.session;
        const conectado = temSessao && (s as Sessao).status === "CONNECTED";
        const podeAgir = propria || podeGerenciar;
        return (
          <div key={f} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 grid place-items-center shrink-0"><Icon className="w-4 h-4 text-[var(--color-primary-blue)]" /></div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-black text-[var(--color-text-primary)]">{titulo}</h4>
                <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mt-0.5">{descricao}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${s === "erro" ? "text-amber-600" : conectado ? "text-emerald-600" : temSessao ? "text-rose-500" : "text-[var(--color-text-faint)]"}`}>
                {s === "erro" ? <><WifiOff className="w-3.5 h-3.5" />Não foi possível consultar</>
                  : conectado ? <><CheckCircle2 className="w-3.5 h-3.5" />Conectado{(s as Sessao).phone ? ` · +${String((s as Sessao).phone).replace(/\D/g, "")}` : ""}</>
                  : temSessao ? <><WifiOff className="w-3.5 h-3.5" />Desconectado</>
                  : "Sem sessão"}
              </span>
              {podeAgir && s !== "erro" && (
                !temSessao ? (
                  podeGerenciar
                    ? <Button size="sm" disabled={criando === f} onClick={() => criar(f)} className="h-8 text-xs gap-1.5">{criando === f ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}Criar sessão</Button>
                    : <span className="text-[11px] text-[var(--color-text-faint)]">Peça ao administrador para criar.</span>
                ) : !conectado ? (
                  <Button size="sm" onClick={() => setQr(f)} className="h-8 text-xs gap-1.5"><Phone className="w-3.5 h-3.5" />Conectar WhatsApp</Button>
                ) : null
              )}
            </div>
          </div>
        );
      })}

      {!ehVendedor && isModuleEnabled("agente_secreto") && (
        <p className="text-[11px] text-[var(--color-text-faint)]">O Agente Secreto de Vendas só existe para quem tem cargo ou departamento de vendas (vendedor, closer, SDR, comercial).</p>
      )}

      <AgenteSecretoQrModal
        open={qr !== null}
        onClose={() => setQr(null)}
        title={`Conectar o WhatsApp do ${qr === "interno" ? "Agente Interno" : "Agente de Vendas"}${propria ? "" : ` de ${colaborador.nome}`}`}
        colaboradorId={propria ? undefined : colaborador.id}
        colaboradorNome={colaborador.nome}
        finalidade={qr === "interno" ? "interno" : undefined}
        checkConnected={async () => {
          if (!qr) return false;
          try { const r = await apiFetch(url(qr)); const j = r.ok ? await r.json().catch(() => null) : null; return j?.status === "CONNECTED"; } catch { return false; }
        }}
        onConnected={() => {
          setQr(null);
          toast.success("WhatsApp conectado!");
          void carregar();
          window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));
        }}
      />
    </div>
  );
}
