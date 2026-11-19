import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronRight, Facebook, Globe, Loader2, RefreshCw, Search, Settings } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/apiClient";
import { CampanhaDetalhe } from "./CampanhaDetalhe";
import { type Campanha, formatadores, grupoStatus, varianteStatus } from "./campanhasComum";

interface Resposta { configurado: boolean; campanhas?: Campanha[]; moeda?: string; conta?: string; parcial?: boolean; atualizadoEm?: string; error?: string }
type Chave = "nome" | "status" | "orcamento" | "resultados" | "custoPorResultado" | "gasto" | "impressoes" | "cliques" | "ctr" | "cpc";

const PERIODOS = [7, 14, 30, 90];
const FILTROS = [{ id: "todas", l: "Todas" }, { id: "ativas", l: "Ativas" }, { id: "pausadas", l: "Pausadas" }, { id: "outras", l: "Outras" }] as const;

/** Lista de campanhas dos canais de anúncio (Meta Ads hoje) com resumo no topo. Clicar numa campanha abre o detalhe dela. */
export function CampanhasLista() {
  const { activeTenantId } = useAuth();
  const navigate = useNavigate();
  const [dias, setDias] = useState(30);
  const [canal, setCanal] = useState<"todos" | "meta" | "google">("todos");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todas");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ k: Chave; asc: boolean }>({ k: "gasto", asc: false });
  const [aberta, setAberta] = useState<Campanha | null>(null);

  const carregar = useCallback(async (forcar = false) => {
    if (!activeTenantId) return;
    setCarregando(true);
    try {
      const r = await apiFetch(`/api/marketing/meta-campanhas?tenantId=${encodeURIComponent(activeTenantId)}&dias=${dias}&nivel=campaign${forcar ? "&atualizar=1" : ""}`);
      setDados(await r.json().catch(() => ({ configurado: true, error: "Resposta inválida do servidor." })));
    } catch { setDados({ configurado: true, error: "Não foi possível consultar o Meta Ads agora." }); }
    finally { setCarregando(false); }
  }, [activeTenantId, dias]);
  useEffect(() => { setDados(null); setAberta(null); void carregar(); }, [carregar]);

  const moeda = dados?.moeda || "BRL";
  const { brl, num, pct } = formatadores(moeda);

  const lista = useMemo(() => {
    if (canal === "google") return [];
    const t = busca.trim().toLowerCase();
    const f = (dados?.campanhas || []).filter((c) => (filtro === "todas" || grupoStatus(c.status) === filtro) && (!t || c.nome.toLowerCase().includes(t) || c.id.includes(t)));
    const v = (c: Campanha): string | number => (ordem.k === "nome" ? c.nome.toLowerCase() : ordem.k === "status" ? c.statusRotulo : ordem.k === "orcamento" ? c.orcamento.valor : c[ordem.k]);
    return [...f].sort((a, b) => { const x = v(a), y = v(b); const d = x > y ? 1 : x < y ? -1 : 0; return ordem.asc ? d : -d; });
  }, [dados, filtro, busca, ordem, canal]);

  const resumo = useMemo(() => {
    const t = lista.reduce((a, c) => ({ gasto: a.gasto + c.gasto, impressoes: a.impressoes + c.impressoes, cliques: a.cliques + c.cliques, resultados: a.resultados + c.resultados }), { gasto: 0, impressoes: 0, cliques: 0, resultados: 0 });
    const rotulos = new Set(lista.filter((c) => c.resultados > 0).map((c) => c.resultadoRotulo));
    const misto = rotulos.size > 1;
    return { ...t, ctr: t.impressoes > 0 ? (t.cliques / t.impressoes) * 100 : 0, cpc: t.cliques > 0 ? t.gasto / t.cliques : 0, misto, rotulo: [...rotulos][0] || "", custoRes: !misto && t.resultados > 0 ? t.gasto / t.resultados : 0, ativas: lista.filter((c) => c.status === "ACTIVE").length };
  }, [lista]);

  const ordenar = (k: Chave) => setOrdem((o) => (o.k === k ? { k, asc: !o.asc } : { k, asc: k === "nome" || k === "status" }));
  const Th = ({ k, children, dir = "right" }: { k: Chave; children: React.ReactNode; dir?: "left" | "right" }) => (
    <th className={`py-2.5 px-3 font-black whitespace-nowrap ${dir === "left" ? "text-left" : "text-right"}`} aria-sort={ordem.k === k ? (ordem.asc ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => ordenar(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider text-[10px] ${ordem.k === k ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-faint)]"} hover:text-[var(--color-text-primary)]`}>
        {children}{ordem.k === k && (ordem.asc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const naoConectado = dados && !dados.configurado;
  const resumoItens: [string, string, string?][] = [
    ["Valor usado", brl(resumo.gasto), `${lista.length} campanha(s) · ${resumo.ativas} ativa(s)`],
    ["Resultados", resumo.misto ? "—" : num(resumo.resultados), resumo.misto ? "tipos diferentes" : resumo.rotulo || "sem resultados"],
    ["Custo por resultado", resumo.custoRes > 0 ? brl(resumo.custoRes) : "—"],
    ["Impressões", num(resumo.impressoes)],
    ["Cliques", num(resumo.cliques), `CTR ${pct(resumo.ctr)}`],
    ["CPC médio", resumo.cpc > 0 ? brl(resumo.cpc) : "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-[var(--color-surface-sunken)] p-1">
          {([["todos", "Todos os canais", null], ["meta", "Meta Ads", Facebook], ["google", "Google Ads", Globe]] as const).map(([id, rotulo, Icone]) => (
            <button key={id} type="button" onClick={() => setCanal(id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${canal === id ? "bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] shadow-sm" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
              {Icone && <Icone className="w-3.5 h-3.5" />}{rotulo}
            </button>))}
        </div>
        <div className="flex items-center gap-2">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período" className="h-9 px-2 rounded-lg text-xs font-bold border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]">
            {PERIODOS.map((p) => <option key={p} value={p}>Últimos {p} dias</option>)}
          </select>
          <Button variant="outline" onClick={() => void carregar(true)} disabled={carregando} className="h-9 px-3 text-xs gap-1.5" aria-label="Atualizar">{carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}</Button>
        </div>
      </div>

      {canal === "google" ? (
        <Card className="p-6"><EmptyState icon={Globe} title="Campanhas do Google Ads ainda não estão disponíveis" description="Para listar as campanhas do Google Ads o SPY precisa de credenciais de desenvolvedor e autorização (OAuth) do Google. Enquanto isso, as campanhas do Meta Ads aparecem na aba ao lado, e os leads do Google entram pelo canal (UTM) em Análises." className="py-6" /></Card>
      ) : naoConectado ? (
        <Card className="p-6 border-dashed">
          <EmptyState icon={Facebook} title="Conecte o Meta Ads para ver suas campanhas" description="Cadastre o ID da conta de anúncios e um token de leitura (ads_read) em Integrações. O SPY só lê os dados: não cria, altera nem pausa nada." className="py-6" />
          <div className="flex justify-center"><Button onClick={() => navigate("/app/configuracoes/integracoes/apps")} className="h-9 px-4 text-xs font-bold gap-1.5"><Settings className="w-3.5 h-3.5" /> Abrir Integrações</Button></div>
        </Card>
      ) : !dados ? <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /></div>
      : dados.error ? (
        <Card className="p-6 text-center space-y-3"><p className="text-sm text-[var(--color-danger)]">{dados.error}</p><div className="flex justify-center gap-2"><Button variant="outline" onClick={() => void carregar(true)} className="h-8 px-3 text-xs">Tentar de novo</Button><Button variant="outline" onClick={() => navigate("/app/configuracoes/integracoes/apps")} className="h-8 px-3 text-xs">Abrir Integrações</Button></div></Card>
      ) : (<>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {resumoItens.map(([t, v, sub]) => (
            <Card key={t} className="p-3.5 min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] truncate">{t}</p><p className="text-lg font-black text-[var(--color-text-primary)] truncate">{v}</p>{sub && <p className="text-[10px] text-[var(--color-text-muted)] truncate">{sub}</p>}</Card>))}
        </div>

        <Card className="overflow-hidden">
          <div className="p-3 sm:p-4 flex flex-wrap items-center gap-2 border-b border-[var(--color-border-default)]">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar campanha por nome ou ID…" className="w-full h-9 pl-8 pr-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]" />
            </div>
            <div className="flex gap-1.5 flex-wrap">{FILTROS.map((f) => {
              const n = (dados.campanhas || []).filter((c) => f.id === "todas" || grupoStatus(c.status) === f.id).length;
              return <button key={f.id} type="button" onClick={() => setFiltro(f.id)} className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold border ${filtro === f.id ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>{f.l} · {n}</button>;
            })}</div>
            <span className="ml-auto text-[11px] text-[var(--color-text-faint)] hidden md:inline">{dados.conta ? `${dados.conta} · ` : ""}{dados.atualizadoEm ? `atualizado às ${new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
          </div>
          {dados.parcial && <p className="px-4 py-2 text-[11px] text-[var(--color-warning,#b45309)]">⚠ O Meta respondeu só parte dos dados. Alguns números podem estar incompletos; tente atualizar.</p>}
          {lista.length === 0 ? <EmptyState icon={Facebook} title={(dados.campanhas || []).length ? "Nenhuma campanha com esse filtro" : "Nenhuma campanha nessa conta"} description={(dados.campanhas || []).length ? "Mude o filtro ou a busca." : "Quando houver campanhas no Gerenciador de Anúncios, elas aparecem aqui."} className="py-10 border-none rounded-none" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[920px]">
                <thead className="bg-[var(--color-surface-sunken)]"><tr><Th k="nome" dir="left">Campanha</Th><Th k="status" dir="left">Status</Th><Th k="orcamento">Orçamento</Th><Th k="resultados">Resultados</Th><Th k="custoPorResultado">Custo/resultado</Th><Th k="gasto">Valor usado</Th><Th k="impressoes">Impressões</Th><Th k="cliques">Cliques</Th><Th k="ctr">CTR</Th><Th k="cpc">CPC</Th><th className="w-8" /></tr></thead>
                <tbody className="divide-y divide-[var(--color-border-subtle,var(--color-border-default))]">
                  {lista.map((c) => (
                    <tr key={c.id} onClick={() => setAberta(c)} className="cursor-pointer hover:bg-[var(--color-surface-sunken)]/70">
                      <td className="py-3 px-3 max-w-[300px]">
                        <div className="flex items-center gap-2.5 min-w-0"><span className="w-7 h-7 rounded-lg bg-blue-600/10 text-blue-500 flex items-center justify-center shrink-0"><Facebook className="w-3.5 h-3.5" /></span>
                          <div className="min-w-0"><button type="button" className="font-bold text-[var(--color-text-primary)] hover:text-[var(--color-primary-blue)] truncate max-w-full text-left" title={c.nome}>{c.nome}</button><p className="text-[10px] text-[var(--color-text-faint)] truncate">{c.objetivoRotulo} · ID {c.id}</p></div></div>
                      </td>
                      <td className="py-3 px-3"><Badge variant={varianteStatus(c.status)} dot dotPulse={c.status === "ACTIVE"}>{c.statusRotulo}</Badge></td>
                      <td className="py-3 px-3 text-right tabular-nums text-[var(--color-text-primary)]">{c.orcamento.tipo ? <>{brl(c.orcamento.valor)}<span className="block text-[10px] text-[var(--color-text-faint)]">{c.orcamento.tipo === "diario" ? "por dia" : "vitalício"}</span></> : <span className="text-[var(--color-text-faint)]" title="Orçamento definido nos conjuntos de anúncios">Nos conjuntos</span>}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{c.resultados > 0 ? <><b className="text-[var(--color-text-primary)]">{num(c.resultados)}</b><span className="block text-[10px] text-[var(--color-text-faint)]">{c.resultadoRotulo}</span></> : <span className="text-[var(--color-text-faint)]">—</span>}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-[var(--color-text-primary)]">{c.custoPorResultado > 0 ? brl(c.custoPorResultado) : "—"}</td>
                      <td className="py-3 px-3 text-right tabular-nums font-bold text-[var(--color-text-primary)]">{brl(c.gasto)}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{num(c.impressoes)}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{num(c.cliques)}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{pct(c.ctr)}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-[var(--color-text-muted)]">{c.cpc > 0 ? brl(c.cpc) : "—"}</td>
                      <td className="py-3 pr-3 text-[var(--color-text-faint)]"><ChevronRight className="w-4 h-4" /></td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>)}

      {aberta && <CampanhaDetalhe campanha={aberta} dias={dias} onFechar={() => setAberta(null)} />}
    </div>
  );
}
