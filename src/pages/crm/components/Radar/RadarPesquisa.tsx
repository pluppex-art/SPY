import { useMemo, useState } from "react";
import { Search, Loader2, UserPlus, Check, Phone, Mail, MapPin, Globe, MessageCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { apiFetch } from "../../../../lib/apiClient";
import { getStageId } from "../../../../lib/funilStages";
import { FUNIS_DEFAULT } from "../../../settings/sections/crm/funisTypes";
import { inputCls, selectCls } from "../../../finance/components/ModalKit";

interface Resultado { empresa: string; endereco: string; avaliacao: string; contato: string; site: string; whatsapp: string; email?: string }

const EXEMPLOS = ["clínicas odontológicas em Palmas/TO", "academias em Goiânia/GO", "escritórios de contabilidade em Curitiba/PR", "pet shops em São Paulo/SP"];
const soDigitos = (v: string) => String(v || "").replace(/\D/g, "");

/**
 * Pesquisa do Radar: o servidor pede ao Radar (n8n) empresas reais no Google Maps para o que foi descrito
 * ("segmento em cidade/UF"), e cada resultado pode virar lead com um clique.
 */
export function RadarPesquisa() {
  const { addLead, funis } = useData();
  const { user, activeTenantId } = useAuth();
  const [criterio, setCriterio] = useState("");
  const [quantidade, setQuantidade] = useState("10");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feita, setFeita] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [criados, setCriados] = useState<Set<string>>(new Set());

  const primeiraEtapa = useMemo(() => {
    const lista: any[] = (funis?.length ? funis : FUNIS_DEFAULT).filter((f: any) => f.ativo !== false && f.tipo === "comercial");
    return lista[0] ? getStageId(lista[0].id, 0) : "1";
  }, [funis]);

  async function pesquisar(termo = criterio) {
    const q = termo.trim();
    if (q.length < 3) { setErro("Descreva o que procurar, por exemplo: clínicas odontológicas em Palmas/TO."); return; }
    setBuscando(true); setErro(null);
    try {
      const r = await apiFetch(`/api/radar/pesquisar${activeTenantId ? `?tenantId=${encodeURIComponent(activeTenantId)}` : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ criterio: q, quantidade: Number(quantidade) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || "Não foi possível pesquisar agora."); setResultados([]); return; }
      setResultados(j.resultados ?? []); setFeita(q); setCriados(new Set());
    } catch { setErro("Não foi possível pesquisar agora. Tente de novo."); }
    finally { setBuscando(false); }
  }

  async function virarLead(e: Resultado) {
    const ok = await addLead({
      name: e.empresa, company: e.empresa, email: e.email || "", phone: e.contato || e.whatsapp || "",
      status: "Novo", value: "R$ 0", date: new Date().toISOString().slice(0, 10),
      source: "Radar (pesquisa)", seller: user?.name || "Não Atribuído", title: "Novo Negócio", priority: "Média",
      pipelineId: "comercial", stageId: primeiraEtapa,
      customFields: { endereco: e.endereco || undefined, site: e.site && e.site !== "nao encontrado" ? e.site : undefined, pesquisa: feita || undefined },
    } as any);
    if (ok === false) { toast.error("Não foi possível criar o lead."); return; }
    setCriados((s) => new Set(s).add(e.empresa + e.endereco));
    toast.success(`${e.empresa} agora é um lead.`);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <form onSubmit={(e) => { e.preventDefault(); void pesquisar(); }} className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <input className={`${inputCls()} !h-11 pl-9 !text-sm`} value={criterio} onChange={(e) => setCriterio(e.target.value)} maxLength={200}
                placeholder="O que você procura? Ex.: clínicas odontológicas em Palmas/TO" aria-label="O que pesquisar" />
            </div>
            <select className={`${selectCls()} !h-11 sm:w-[140px]`} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} aria-label="Quantidade de resultados">
              {["5", "10", "15", "20"].map((n) => <option key={n} value={n}>{n} resultados</option>)}
            </select>
            <Button type="submit" disabled={buscando} className="h-11 px-6 text-sm font-bold gap-2 shrink-0">
              {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}{buscando ? "Pesquisando…" : "Pesquisar"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-[var(--color-text-muted)]">Tente:</span>
            {EXEMPLOS.map((x) => (
              <button key={x} type="button" disabled={buscando} onClick={() => { setCriterio(x); void pesquisar(x); }}
                className="px-2.5 py-1 rounded-full bg-[var(--color-surface-sunken)] hover:bg-[var(--color-primary-blue)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] cursor-pointer border-0">{x}</button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-text-faint)]">A busca usa o Google Maps e traz empresas reais com telefone e endereço. Inclua a cidade e o estado (cidade/UF) para um resultado melhor.</p>
        </form>
      </Card>

      {erro && <Card className="p-4 text-sm text-[var(--color-danger)]">{erro}</Card>}

      {buscando && (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)] flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Procurando empresas… pode levar alguns segundos.</Card>
      )}

      {!buscando && feita && !erro && resultados.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm font-bold text-[var(--color-text-primary)]">Nenhuma empresa encontrada para "{feita}"</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Tente um termo mais específico e inclua a cidade e o estado.</p>
        </Card>
      )}

      {!buscando && resultados.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-muted)]">{resultados.length} empresa(s) para <strong className="text-[var(--color-text-primary)]">{feita}</strong></p>
          <div className="grid gap-3 lg:grid-cols-2">
            {resultados.map((e) => {
              const criado = criados.has(e.empresa + e.endereco);
              const tel = soDigitos(e.whatsapp || e.contato);
              return (
                <Card key={e.empresa + e.endereco} className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{e.empresa}</p>
                      {e.endereco && <p className="text-[11px] text-[var(--color-text-muted)] flex items-start gap-1 mt-0.5"><MapPin className="w-3 h-3 shrink-0 mt-0.5" /> {e.endereco}</p>}
                    </div>
                    {e.avaliacao && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 shrink-0"><Star className="w-3 h-3 fill-current" /> {e.avaliacao.split(" ")[0]}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
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
        </div>
      )}
    </div>
  );
}
