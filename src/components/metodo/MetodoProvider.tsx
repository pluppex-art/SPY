/**
 * Liga o método do funil à tela: carrega situações e estados da empresa (só se algum funil usa o método), intercepta as
 * mudanças de etapa e abre a janela certa. Sem funil com método ligado, não busca nada e não muda nada.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { registrarInterceptador } from "../../lib/metodo/interceptador";
import { carregarCatalogo, carregarEstados, chamar } from "../../lib/metodo/api";
import { pedidoDaMudanca, posicaoNoMetodo, vigentes, type Estado, type Motivo, type Pedido, type Posicao, type Situacao } from "../../lib/metodo/regras";
import { JanelaDoMetodo, type Janela } from "./JanelasDoMetodo";

export interface InfoDoLead extends Posicao { estado: Estado | null; situacao: Situacao | null }

interface Contexto {
  ligado: boolean;
  info: (lead: { id: string; stageId?: string } | null | undefined) => InfoDoLead | null;
  situacoes: (funilId: string) => Situacao[];
  motivos: (uso: "repescagem" | "perda") => Motivo[];
  abrir: (janela: Janela) => void;
  /** Executa uma função do método, atualiza o lead na tela e avisa. Devolve false se o banco recusar. */
  executar: (leadId: string, funcao: string, argumentos: Record<string, unknown>, sucesso: string) => Promise<boolean>;
  /** Muda a cada gravação: quem mostra detalhes do lead usa para reler. */
  versao: number;
}

const inerte: Contexto = { ligado: false, info: () => null, situacoes: () => [], motivos: () => [], abrir: () => {}, executar: async () => false, versao: 0 };
export const ContextoDoMetodo = createContext<Contexto>(inerte);
export const useMetodo = () => useContext(ContextoDoMetodo);

const INTERVALO = 60_000;

export function MetodoProvider({ children }: { children: ReactNode }) {
  const { leads, funis, recarregarLead } = useData();
  const { activeTenantId } = useAuth();
  const ligado = !!activeTenantId && (funis as any[]).some((f) => f.metodoAtivo);
  const [catalogo, setCatalogo] = useState<{ situacoes: Situacao[]; motivos: Motivo[] }>({ situacoes: [], motivos: [] });
  const [estados, setEstados] = useState<Map<string, Estado>>(new Map());
  const [janela, setJanela] = useState<{ janela: Janela; aoConcluir?: () => void } | null>(null);
  const [versao, setVersao] = useState(0);
  const empresa = useRef(activeTenantId); empresa.current = activeTenantId;
  const dados = useRef({ leads, funis }); dados.current = { leads, funis };

  const lerEstados = useCallback(async () => {
    const t = empresa.current;
    if (!t) return;
    try { const lista = await carregarEstados(t); if (empresa.current === t) setEstados(new Map(lista.map((e) => [e.lead_id, e]))); }
    catch (e: any) { console.warn("[método] estados:", e?.message); }
  }, []);

  useEffect(() => {
    setEstados(new Map()); setCatalogo({ situacoes: [], motivos: [] }); setJanela(null);
    if (!ligado || !activeTenantId) return;
    const t = activeTenantId;
    carregarCatalogo(t).then((c) => { if (empresa.current === t) setCatalogo(c); }).catch((e) => toast.error(`Não foi possível carregar o método do funil: ${e.message}`));
    void lerEstados();
    // Outras pessoas e as automações também mudam os estados: relê de tempos em tempos e ao voltar para a aba.
    const relogio = setInterval(() => { if (!document.hidden) void lerEstados(); }, INTERVALO);
    window.addEventListener("focus", lerEstados);
    return () => { clearInterval(relogio); window.removeEventListener("focus", lerEstados); };
  }, [ligado, activeTenantId, lerEstados]);

  useEffect(() => registrarInterceptador((leadId, mudanca, aoConcluir) => {
    const lead = (dados.current.leads as any[]).find((l) => l.id === leadId);
    const r = lead ? pedidoDaMudanca(lead, mudanca, dados.current.funis as any[]) : null;
    if (!r) return null;
    setJanela({ janela: { tipo: "pedido", leadId, pedido: r.pedido as Pedido }, aoConcluir });
    return r.resto;
  }), []);

  const executar = useCallback(async (leadId: string, funcao: string, argumentos: Record<string, unknown>, sucesso: string) => {
    try {
      const resultado = await chamar(funcao, { p_lead: leadId, ...argumentos });
      if (resultado?.registrado === false) toast.info(resultado.motivo || "Nada mudou.");
      else toast.success(sucesso);
    } catch (e: any) { toast.error(e.message || "Não foi possível concluir."); return false; }
    await Promise.all([recarregarLead(leadId), lerEstados()]);
    setVersao((v) => v + 1);
    return true;
  }, [recarregarLead, lerEstados]);

  const valor = useMemo<Contexto>(() => {
    const situacoes = (funilId: string) => vigentes(catalogo.situacoes, funilId);
    return {
      ligado, versao, executar, situacoes,
      motivos: (uso) => vigentes(catalogo.motivos.filter((m) => m.uso === uso)),
      abrir: (j) => setJanela({ janela: j }),
      info: (lead) => {
        const p = lead ? posicaoNoMetodo(lead.stageId, funis as any[]) : null;
        if (!p) return null;
        const estado = estados.get(lead!.id) ?? null;
        return { ...p, estado, situacao: situacoes(p.funil.id).find((s) => s.codigo === estado?.situacao_codigo) ?? null };
      },
    };
  }, [ligado, versao, executar, catalogo, estados, funis]);

  return (
    <ContextoDoMetodo.Provider value={valor}>
      {children}
      {janela && <JanelaDoMetodo key={`${janela.janela.tipo}:${janela.janela.leadId}`} janela={janela.janela} onFechar={() => setJanela(null)}
        onConcluido={() => { janela.aoConcluir?.(); setJanela(null); }} />}
    </ContextoDoMetodo.Provider>
  );
}
