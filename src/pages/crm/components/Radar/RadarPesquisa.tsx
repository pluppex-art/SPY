import { useMemo, useState } from "react";
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
import { chaveDaEmpresa, descreverBusca, pesquisarNoRadar, type EmpresaDoRadar, type FiltroRadar } from "../../../../lib/buscaRadar";

type Resultado = EmpresaDoRadar;

const soDigitos = (v: string) => String(v || "").replace(/\D/g, "");

/**
 * Pesquisa do Radar por CNAE (base da Receita) ou por tipo de empresa (Google Maps), em cidades escolhidas, dentro do
 * limite diário. Cada resultado pode virar lead com um clique.
 */
export function RadarPesquisa() {
  const { addLead, funis } = useData();
  const { user, activeTenantId } = useAuth();
  const [restante, setRestante] = useState<number | null>(null);
  const [mais, setMais] = useState<FiltroRadar | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feita, setFeita] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [criados, setCriados] = useState<Set<string>>(new Set());

  const primeiraEtapa = useMemo(() => {
    const lista: any[] = (funis?.length ? funis : FUNIS_DEFAULT).filter((f: any) => f.ativo !== false && f.tipo === "comercial");
    return lista[0] ? getStageId(lista[0].id, 0) : "1";
  }, [funis]);

  const api = (path: string, init?: RequestInit) => apiFetch(activeTenantId ? `${path}${path.includes("?") ? "&" : "?"}tenantId=${encodeURIComponent(activeTenantId)}` : path, init);

  async function pesquisar(filtro: FiltroRadar, somar = false) {
    setBuscando(true); setErro(null);
    try {
      const r = await pesquisarNoRadar(api, filtro);
      setResultados((antes) => (somar ? [...new Map([...antes, ...r.empresas].map((e) => [chaveDaEmpresa(e), e])).values()] : r.empresas));
      setMais(r.mais); setErro(r.aviso);
      if (!somar) { setFeita(descreverBusca(filtro)); setCriados(new Set()); }
      if (r.restante !== null) setRestante(r.restante);
    } catch (e: any) {
      setErro(e instanceof TypeError ? "Não foi possível pesquisar agora. Tente de novo." : e.message);
      if (!somar) { setResultados([]); setMais(null); }
      if (typeof e.restante === "number") setRestante(e.restante);
    } finally { setBuscando(false); }
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
    setCriados((s) => new Set(s).add(e.empresa + e.endereco));
    toast.success(`${e.empresa} agora é um lead.`);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <FiltroDoRadar key={activeTenantId ?? ""} api={api} ocupado={buscando} restante={restante} onSaldo={setRestante} onBuscar={(f) => void pesquisar(f)} />
          <p className="text-[11px] text-[var(--color-text-faint)]">Por CNAE vêm empresas ativas da Receita Federal, com telefone e e-mail quando cadastrados. Pelo Google Maps vêm telefone, endereço e site.</p>
        </div>
      </Card>

      {erro && <Card className="p-4 text-sm text-[var(--color-danger)]">{erro}</Card>}

      {buscando && (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)] flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Procurando empresas… pode levar alguns segundos.</Card>
      )}

      {!buscando && feita && !erro && resultados.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm font-bold text-[var(--color-text-primary)]">Nenhuma empresa encontrada para "{feita}"</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Tente outro tipo de empresa ou outra cidade.</p>
        </Card>
      )}

      {resultados.length > 0 && (
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
          {mais && <div className="flex justify-center pt-1"><Button variant="outline" disabled={buscando} onClick={() => void pesquisar(mais, true)} className="h-9 px-4 text-xs font-bold">Trazer as próximas empresas</Button></div>}
        </div>
      )}
    </div>
  );
}
