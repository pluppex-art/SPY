import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, Check, Phone, Mail, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/apiClient";
import { getStageId } from "../../lib/funilStages";
import { FUNIS_DEFAULT } from "../settings/sections/crm/funisTypes";

type Empresa = {
  cnpj: string; nome: string; fantasia: string; cnae: string; cnaeDescricao: string; porte: string; abertura: string;
  endereco: string; cidade: string; uf: string; cep: string; email: string; telefone: string;
};
type Cidade = { id: string; nome: string };

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const campo = "h-[38px] rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const soDigitos = (s: string) => s.replace(/\D/g, "");

/** Máscara do CNAE enquanto digita: 47.81-4-00 */
function mascaraCnae(v: string) {
  const d = soDigitos(v).slice(0, 7);
  let o = d.slice(0, 2);
  if (d.length > 2) o += "." + d.slice(2, 4);
  if (d.length > 4) o += "-" + d.slice(4, 5);
  if (d.length > 5) o += "-" + d.slice(5, 7);
  return o;
}

export default function Prospeccao() {
  const { leads, addLead, funis } = useData();
  const { user } = useAuth();
  const [cnae, setCnae] = useState("");
  const [uf, setUf] = useState("GO");
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [municipio, setMunicipio] = useState("");
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criados, setCriados] = useState<Set<string>>(new Set());

  // CNPJs que já são lead: o botão já nasce como "Já é lead".
  const cnpjsDosLeads = useMemo(() => new Set(leads.map((l: any) => soDigitos(l.cnpj || "")).filter(Boolean)), [leads]);

  useEffect(() => {
    let vivo = true;
    setCidades([]); setMunicipio("");
    apiFetch(`/api/prospeccao/municipios?uf=${uf}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { if (vivo) setCidades(j.municipios ?? []); })
      .catch(() => { if (vivo) toast.error("Não consegui carregar as cidades. Tente de novo."); });
    return () => { vivo = false; };
  }, [uf]);

  const primeiraEtapa = useMemo(() => {
    const lista: any[] = (funis?.length ? funis : FUNIS_DEFAULT).filter((f: any) => f.ativo !== false && f.tipo === "comercial");
    return lista[0] ? getStageId(lista[0].id, 0) : "1";
  }, [funis]);

  const podeBuscar = soDigitos(cnae).length === 7 && !!municipio && !buscando;

  async function buscar(maisUma: boolean) {
    setBuscando(true); setErro(null);
    try {
      const q = new URLSearchParams({ cnae: soDigitos(cnae), municipio, limite: "25" });
      if (maisUma && cursor) q.set("cursor", cursor);
      const r = await apiFetch(`/api/prospeccao/cnae?${q.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || "Não foi possível buscar agora."); return; }
      setEmpresas((atual) => (maisUma ? [...atual, ...j.empresas] : j.empresas));
      setTotal(j.total); setCursor(j.proximoCursor);
    } finally { setBuscando(false); }
  }

  async function virarLead(e: Empresa) {
    const nomeCidade = cidades.find((c) => c.id === municipio)?.nome ?? e.cidade;
    const ok = await addLead({
      name: e.fantasia || e.nome, company: e.nome, cnpj: e.cnpj, email: e.email, phone: e.telefone.split(" / ")[0] || "",
      status: "Novo", value: "R$ 0", date: new Date().toISOString().slice(0, 10),
      source: "Prospecção por CNAE", seller: user?.name || "Não Atribuído", title: "Novo Negócio", priority: "Média",
      pipelineId: "comercial", stageId: primeiraEtapa,
      customFields: { cidade: nomeCidade, setor: e.cnaeDescricao || undefined, cnae: e.cnae || undefined, endereco: e.endereco || undefined },
    } as any);
    if (ok === false) { toast.error("Não foi possível criar o lead."); return; }
    setCriados((s) => new Set(s).add(soDigitos(e.cnpj)));
    toast.success(`${e.fantasia || e.nome} agora é um lead.`);
  }

  return (
    <PageContainer breadcrumb={[{ label: "Prospecção" }]} title="Prospecção por CNAE"
      subtitle="Encontre empresas ativas pela atividade (CNAE) e pela cidade e transforme em lead com um clique.">
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--color-text-muted)]">CNAE
            <input className={`${campo} w-[150px]`} inputMode="numeric" placeholder="47.81-4-00" value={cnae} onChange={(e) => setCnae(mascaraCnae(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--color-text-muted)]">Estado
            <select className={campo} value={uf} onChange={(e) => setUf(e.target.value)}>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--color-text-muted)] min-w-[200px]">Cidade
            <select className={campo} value={municipio} onChange={(e) => setMunicipio(e.target.value)} disabled={!cidades.length}>
              <option value="">{cidades.length ? "Escolha a cidade" : "Carregando…"}</option>
              {cidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <Button onClick={() => buscar(false)} disabled={!podeBuscar}>
            {buscando && !empresas.length ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
          Dados abertos da Receita Federal (empresas ativas, pelo CNAE principal). Cada empresa listada gasta 1 da cota mensal da conta de consulta.
          Use os contatos só com base legal (LGPD) e sem disparo em massa.
        </p>
      </Card>

      {erro && <Card className="p-4 mb-4 text-sm text-[var(--color-danger)]">{erro}</Card>}

      {total !== null && !erro && (
        <p className="mb-2 text-sm text-[var(--color-text-secondary)]">
          {total === 0 ? "Nenhuma empresa encontrada para esse CNAE nessa cidade." : `${total.toLocaleString("pt-BR")} empresas encontradas · mostrando ${empresas.length}`}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {empresas.map((e) => {
          const jaLead = criados.has(soDigitos(e.cnpj)) || cnpjsDosLeads.has(soDigitos(e.cnpj));
          return (
            <Card key={e.cnpj} className="p-3 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0 flex-1 basis-[260px]">
                <div className="text-sm font-bold text-[var(--color-text-primary)] truncate">{e.fantasia || e.nome}</div>
                {e.fantasia && <div className="text-xs text-[var(--color-text-muted)] truncate">{e.nome}</div>}
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--color-text-secondary)]">
                  <span>{e.cnpj}</span>
                  {e.porte && <span>{e.porte}</span>}
                  {e.telefone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{e.telefone}</span>}
                  {e.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{e.email}</span>}
                  {e.endereco && <span className="inline-flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{e.endereco}</span>}
                </div>
              </div>
              <Button size="sm" variant={jaLead ? "outline" : "default"} disabled={jaLead} onClick={() => virarLead(e)}>
                {jaLead ? <><Check className="w-4 h-4" /> Já é lead</> : <><UserPlus className="w-4 h-4" /> Virar lead</>}
              </Button>
            </Card>
          );
        })}
      </div>

      {cursor && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" onClick={() => buscar(true)} disabled={buscando}>
            {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Carregar mais 25
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
