import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, UserPlus, Check, Phone, Mail, MapPin, Globe, MessageCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { apiFetch } from "../../../../lib/apiClient";
import { getStageId } from "../../../../lib/funilStages";
import { FUNIS_DEFAULT } from "../../../settings/sections/crm/funisTypes";
import { FiltroDoRadar } from "../../../../components/radar/FiltroDoRadar";
import { EsperaDoRadar } from "../../../../components/radar/EsperaDoRadar";
import { chaveDaEmpresa, descreverBusca, pesquisarNoRadar, type EmpresaDoRadar, type FiltroRadar } from "../../../../lib/buscaRadar";

type Resultado = EmpresaDoRadar;

const soDigitos = (v: string) => String(v || "").replace(/\D/g, "");

/** A última busca fica neste navegador: recarregar a página não apaga (nem gasta o limite do dia de novo). */
interface Guardada { resultados: Resultado[]; feita: string | null; mais: FiltroRadar | null }
const chaveGuardada = (tenantId: string | null) => `spy_radar_busca:${tenantId ?? ""}`;
function lerGuardada(tenantId: string | null): Guardada {
  try { const g = JSON.parse(localStorage.getItem(chaveGuardada(tenantId)) || "null"); if (Array.isArray(g?.resultados)) return g; } catch { /* sem armazenamento: começa vazio */ }
  return { resultados: [], feita: null, mais: null };
}
function guardar(tenantId: string | null, g: Guardada) { try { localStorage.setItem(chaveGuardada(tenantId), JSON.stringify(g)); } catch { /* cheio ou bloqueado: só não persiste */ } }

/**
 * Pesquisa do Radar por CNAE (base da Receita) ou por tipo de empresa (Google Maps), em cidades escolhidas, dentro do
 * limite diário. Cada resultado pode virar lead com um clique.
 */
export function RadarPesquisa() {
  const { addLead, funis, leads } = useData();
  const { user, activeTenantId } = useAuth();
  const [restante, setRestante] = useState<number | null>(null);
  const [mais, setMais] = useState<FiltroRadar | null>(null);
  const [esperaAte, setEsperaAte] = useState<number | null>(null);
  const parada = useRef<AbortController | null>(null);
  useEffect(() => () => parada.current?.abort(), [activeTenantId]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feita, setFeita] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [criados, setCriados] = useState<Set<string>>(new Set());
  const [visao, setVisao] = useState<"busca" | "salvas">("busca");
  const [salvas, setSalvas] = useState<Resultado[] | null>(null);
  const empresaAtual = useRef(activeTenantId); empresaAtual.current = activeTenantId;
  // CNPJs que já são lead: o botão já nasce como "Já é lead".
  const cnpjsDosLeads = useMemo(() => new Set((leads || []).map((l: any) => soDigitos(l.cnpj)).filter(Boolean)), [leads]);
  useEffect(() => {
    const g = lerGuardada(activeTenantId);
    setResultados(g.resultados); setFeita(g.feita); setMais(g.mais);
    setVisao("busca"); setSalvas(null); setErro(null); setBuscando(false); setEsperaAte(null); setCriados(new Set()); setRestante(null);
  }, [activeTenantId]);

  const primeiraEtapa = useMemo(() => {
    const lista: any[] = (funis?.length ? funis : FUNIS_DEFAULT).filter((f: any) => f.ativo !== false && f.tipo === "comercial");
    return lista[0] ? getStageId(lista[0].id, 0) : "1";
  }, [funis]);

  const api = (path: string, init?: RequestInit) => apiFetch(activeTenantId ? `${path}${path.includes("?") ? "&" : "?"}tenantId=${encodeURIComponent(activeTenantId)}` : path, init);

  async function abrirSalvas() {
    setVisao("salvas"); setSalvas(null);
    const empresa = activeTenantId;
    try {
      const r = await api("/api/radar/empresas-salvas?todas=1");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error);
      if (empresaAtual.current === empresa) setSalvas(j.empresas ?? []);
    } catch { if (empresaAtual.current === empresa) { setSalvas([]); toast.error("Não foi possível abrir as empresas salvas."); } }
  }

  async function pesquisar(filtro: FiltroRadar, somar = false) {
    parada.current?.abort();
    const controle = new AbortController(); parada.current = controle;
    const antes = somar ? resultados : [];
    const empresa = activeTenantId;
    const titulo = somar ? feita : descreverBusca(filtro);
    // A busca anterior só sai da tela quando a nova trouxer algo (um erro não apaga o que já estava ali).
    const mostrar = (novas: Resultado[], proxima: FiltroRadar | null = null) => {
      const juntas = [...new Map([...antes, ...novas].map((e) => [chaveDaEmpresa(e), e])).values()];
      setResultados(juntas); setFeita(titulo); setMais(proxima);
      guardar(empresa, { resultados: juntas, feita: titulo, mais: proxima });
    };
    setVisao("busca"); setBuscando(true); setErro(null); setEsperaAte(null);
    try {
      const r = await pesquisarNoRadar(api, filtro, {
        sinal: controle.signal,
        aoAvancar: (novas, saldo) => { if (parada.current !== controle) return; mostrar(novas); if (saldo !== null) setRestante(saldo); },
        aoEsperar: (s) => { if (parada.current === controle) setEsperaAte(s === null ? null : Date.now() + (s + 1) * 1000); },
      });
      if (parada.current !== controle) return;
      mostrar(r.empresas, r.mais); setErro(r.aviso);
      if (r.restante !== null) setRestante(r.restante);
    } catch (e: any) {
      setErro(e instanceof TypeError ? "Não foi possível pesquisar agora. Tente de novo." : e.message);
      if (typeof e.restante === "number") setRestante(e.restante);
    } finally { if (parada.current === controle) { setBuscando(false); setEsperaAte(null); } }
  }

  async function virarLead(e: Resultado) {
    const ok = await addLead({
      name: e.empresa, company: e.razaoSocial || e.empresa, cnpj: e.cnpj, email: e.email || "", phone: e.contato || e.whatsapp || "",
      status: "Novo", value: "R$ 0", date: new Date().toISOString().slice(0, 10),
      source: "Radar (pesquisa)", seller: user?.name || "Não Atribuído", title: "Novo Negócio", priority: "Média",
      pipelineId: "comercial", stageId: primeiraEtapa,
      customFields: { endereco: e.endereco || undefined, site: e.site && e.site !== "nao encontrado" ? e.site : undefined, pesquisa: feita || undefined },
    } as any);
    if (ok === false) { toast.error("Não foi possível criar o lead."); return; }
    setCriados((s) => new Set(s).add(chaveDaEmpresa(e)));
    toast.success(`${e.empresa} agora é um lead.`);
  }

  const lista = visao === "salvas" ? salvas ?? [] : resultados;

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <FiltroDoRadar key={activeTenantId ?? ""} api={api} ocupado={buscando} restante={restante} onSaldo={setRestante} onBuscar={(f) => void pesquisar(f)} />
          <p className="text-[11px] text-[var(--color-text-faint)]">Por CNAE vêm empresas ativas da Receita Federal, com telefone e e-mail quando cadastrados. Pelo Google Maps vêm telefone, endereço e site.</p>
        </div>
      </Card>

      {esperaAte !== null && <EsperaDoRadar ate={esperaAte} onParar={() => parada.current?.abort()} />}

      {erro && <Card className="p-4 text-sm text-[var(--color-danger)]">{erro}</Card>}

      {buscando && esperaAte === null && (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)] flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Procurando empresas… pode levar alguns segundos.</Card>
      )}

      <div role="group" aria-label="Mostrar" className="flex gap-1.5">
        {([["busca", "Última busca"], ["salvas", "Já salvas (CNAE)"]] as const).map(([id, t]) => (
          <button key={id} type="button" aria-pressed={visao === id} onClick={() => (id === "salvas" ? void abrirSalvas() : setVisao("busca"))}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-bold cursor-pointer ${visao === id ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)] !text-white" : "bg-transparent border-[var(--color-border-default)] text-[var(--color-text-muted)]"}`}>{t}</button>
        ))}
      </div>

      {visao === "salvas" && salvas === null && <Card className="p-8 text-center text-sm text-[var(--color-text-muted)] flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Abrindo…</Card>}
      {visao === "salvas" && salvas?.length === 0 && <Card className="p-8 text-center text-sm text-[var(--color-text-muted)]">Nenhuma empresa salva ainda. As buscas por CNAE ficam guardadas aqui.</Card>}

      {visao === "busca" && !buscando && feita && !erro && resultados.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm font-bold text-[var(--color-text-primary)]">Nenhuma empresa encontrada para "{feita}"</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Tente outro tipo de empresa ou outra cidade.</p>
        </Card>
      )}

      {lista.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-muted)]">{lista.length} empresa(s) {visao === "salvas" ? "salvas, das mais novas para as mais antigas" : <>para <strong className="text-[var(--color-text-primary)]">{feita}</strong></>}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {lista.map((e) => {
              const criado = criados.has(chaveDaEmpresa(e)) || (!!e.cnpj && cnpjsDosLeads.has(soDigitos(e.cnpj)));
              const tel = soDigitos(e.whatsapp || e.contato);
              return (
                <Card key={chaveDaEmpresa(e)} className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{e.empresa}</p>
                      {e.endereco && <p className="text-[11px] text-[var(--color-text-muted)] flex items-start gap-1 mt-0.5"><MapPin className="w-3 h-3 shrink-0 mt-0.5" /> {e.endereco}</p>}
                    </div>
                    {e.avaliacao && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 shrink-0"><Star className="w-3 h-3 fill-current" /> {e.avaliacao.split(" ")[0]}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
                    {e.cnpj && <span>CNPJ {e.cnpj}</span>}
                    {e.contato ? <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {e.contato}</span> : <span className="text-[var(--color-text-faint)]">Sem telefone</span>}
                    {e.email && <span className="inline-flex items-center gap-1 break-all"><Mail className="w-3 h-3" /> {e.email}</span>}
                    {e.site && e.site !== "nao encontrado" && <a href={/^https?:/.test(e.site) ? e.site : `https://${e.site}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--color-primary-blue)] no-underline truncate max-w-[220px]"><Globe className="w-3 h-3" /> {e.site.replace(/^https?:\/\//, "")}</a>}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant={criado ? "outline" : "default"} disabled={criado} onClick={() => virarLead(e)} className="h-8 px-3 text-xs font-bold gap-1.5">
                      {criado ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}{criado ? "Já é lead" : "Adicionar como lead"}
                    </Button>
                    {tel.length >= 10 && (
                      <a href={`https://wa.me/${tel.startsWith("55") ? tel : `55${tel}`}`} target="_blank" rel="noopener noreferrer" className="no-underline">
                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs font-bold gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</Button>
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          {visao === "busca" && mais && <div className="flex justify-center pt-1"><Button variant="outline" disabled={buscando} onClick={() => void pesquisar(mais, true)} className="h-9 px-4 text-xs font-bold">Trazer as próximas empresas</Button></div>}
        </div>
      )}
    </div>
  );
}
