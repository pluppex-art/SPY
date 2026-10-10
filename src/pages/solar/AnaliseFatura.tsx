import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sun, Upload, Zap, TrendingDown, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { supabase } from "../../lib/supabase";
import { analyzeFaturaSolar, FaturaAnalise } from "../../lib/solarOcr";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { friendlyError } from "../../lib/friendlyError";
import { useSolarConfig } from "../../lib/modules/solarConfig";

interface SolarAnalise extends FaturaAnalise {
  id: string;
  cliente: string;
  status: string;
  valorProposta: number | null;
  proposalId: string | null;
  created_at: string;
}

const STATUS_FLOW = ["Análise Concluída", "Visita Técnica", "Proposta Enviada", "Homologação", "Instalação", "Concluído"];

// Mesma fórmula usada no backend (/api/ai/solar-analyze-fatura) — reaplicada
// aqui pra recalcular a estimativa em tempo real quando o usuário corrige o
// consumo/valor extraído pela IA na etapa de revisão humana.
// Parâmetros vêm de Configurações > Energia Solar > Dimensionamento (padrões: 4,5 HSP, 80% de eficiência, 85% de economia).
interface ParamsDim { hsp: number; eficienciaPct: number; economiaPct: number }
function recalcularEstimativas(consumoMedioKwh: number | null, valorFatura: number | null, p: ParamsDim) {
  const potenciaEstimadaKwp = consumoMedioKwh
    ? Math.round((consumoMedioKwh / (p.hsp * 30 * (p.eficienciaPct / 100))) * 100) / 100
    : null;
  const economiaMensalEstimada = valorFatura ? Math.round(valorFatura * (p.economiaPct / 100) * 100) / 100 : null;
  const economiaAnualEstimada = economiaMensalEstimada ? Math.round(economiaMensalEstimada * 12 * 100) / 100 : null;
  return { potenciaEstimadaKwp, economiaMensalEstimada, economiaAnualEstimada };
}

const statusColor = (s: string) => {
  if (s === "Concluído") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (s === "Instalação" || s === "Homologação") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  return "bg-amber-500/10 text-amber-400 border-amber-500/20";
};

export default function AnaliseFatura() {
  const navigate = useNavigate();
  const { addTask, createProposalWithItems } = useData();
  const { activeTenantId } = useAuth();
  const solarCfg = useSolarConfig();
  const dim = solarCfg.dimensionamento;
  const params: ParamsDim = { hsp: Number(dim.hsp) || 4.5, eficienciaPct: Number(dim.eficienciaPct) || 80, economiaPct: Number(dim.economiaPct) || 85 };
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [resultado, setResultado] = useState<FaturaAnalise | null>(null);
  const [analises, setAnalises] = useState<SolarAnalise[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rowToAnalise = (r: any): SolarAnalise => ({
    id: r.id,
    cliente: r.cliente,
    status: r.status,
    distribuidora: r.distribuidora,
    consumoMedioKwh: r.consumo_medio_kwh !== null ? Number(r.consumo_medio_kwh) : null,
    valorFatura: r.valor_fatura !== null ? Number(r.valor_fatura) : null,
    mesReferencia: r.mes_referencia,
    potenciaEstimadaKwp: r.potencia_estimada_kwp !== null ? Number(r.potencia_estimada_kwp) : null,
    economiaMensalEstimada: r.economia_mensal_estimada !== null ? Number(r.economia_mensal_estimada) : null,
    economiaAnualEstimada: r.economia_anual_estimada !== null ? Number(r.economia_anual_estimada) : null,
    valorProposta: r.valor_proposta !== null ? Number(r.valor_proposta) : null,
    proposalId: r.proposal_id ?? null,
    created_at: r.created_at,
  });

  const refetch = () => {
    if (!supabase || !activeTenantId) return;
    supabase.from("solar_analises").select("*").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) toast.error(`Erro ao carregar análises: ${friendlyError(error)}`);
      else if (data) setAnalises(data.map(rowToAnalise));
    });
  };

  useEffect(() => { refetch(); }, [activeTenantId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 4MB."); return; }
    setFile(f);
    setResultado(null);
    setPreview(URL.createObjectURL(f));
  };

  const handleAnalyze = async () => {
    if (!file) { toast.error("Selecione uma foto da fatura."); return; }
    setAnalyzing(true);
    try {
      const analise = await analyzeFaturaSolar(file);
      // Se os parâmetros diferem do padrão do backend, reaplica a fórmula com os da empresa.
      const custom = params.hsp !== 4.5 || params.eficienciaPct !== 80 || params.economiaPct !== 85;
      setResultado(custom
        ? { ...analise, ...recalcularEstimativas(analise.consumoMedioKwh, analise.valorFatura, params) }
        : analise);
      if (!analise.consumoMedioKwh && !analise.valorFatura) {
        toast.warning("Não consegui extrair os dados da fatura. Tente uma foto mais nítida.");
      } else {
        toast.success("Fatura analisada com sucesso!");
      }
    } catch (err: any) {
      toast.error(err.message || "Falha ao analisar a fatura.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!resultado || !supabase || !activeTenantId) return;
    if (!cliente.trim()) { toast.error("Informe o nome do cliente."); return; }
    const { error } = await supabase.from("solar_analises").insert({
      cliente: cliente.trim(),
      distribuidora: resultado.distribuidora,
      consumo_medio_kwh: resultado.consumoMedioKwh,
      valor_fatura: resultado.valorFatura,
      mes_referencia: resultado.mesReferencia,
      potencia_estimada_kwp: resultado.potenciaEstimadaKwp,
      economia_mensal_estimada: resultado.economiaMensalEstimada,
      economia_anual_estimada: resultado.economiaAnualEstimada,
      tenant_id: activeTenantId,
    });
    if (error) { toast.error(`Erro ao salvar: ${friendlyError(error)}`); return; }
    toast.success("Análise salva! Cliente adicionado ao funil fotovoltaico.");
    setFile(null);
    setPreview(null);
    setResultado(null);
    setCliente("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    refetch();
  };

  // Estágios que geram automaticamente uma tarefa de acompanhamento real em
  // Tarefas, conectando o funil fotovoltaico ao resto do CRM em vez de deixar
  // o avanço de status como um evento isolado dentro da página de Solar.
  const FOLLOWUP_TASK_BY_STATUS: Record<string, string> = {
    "Visita Técnica": "Agendar visita técnica",
    "Homologação": "Acompanhar homologação junto à distribuidora",
    "Instalação": "Agendar instalação do sistema fotovoltaico",
  };

  const handleAdvanceStatus = async (a: SolarAnalise) => {
    const idx = STATUS_FLOW.indexOf(a.status);
    const next = STATUS_FLOW[idx + 1];
    if (!next || !supabase) return;

    if (next === "Proposta Enviada" && !a.valorProposta) {
      toast.error("Preencha o valor da proposta antes de avançar para este estágio.");
      return;
    }

    const payload: any = { status: next };
    if (next === "Concluído") payload.data_conclusao = new Date().toISOString();

    let proposalId: string | null = null;
    if (next === "Proposta Enviada" && !a.proposalId) {
      proposalId = await createProposalWithItems({
        titulo: `Proposta Fotovoltaica — ${a.cliente}`,
        cliente: a.cliente,
        valor: a.valorProposta!,
        status: "Enviada",
        vendedor: "Energia Solar",
        tipo: "texto",
        conteudoTexto: [
          `Proposta de sistema fotovoltaico para ${a.cliente}.`,
          a.consumoMedioKwh ? `Consumo médio: ${a.consumoMedioKwh} kWh/mês.` : null,
          a.potenciaEstimadaKwp ? `Potência estimada do sistema: ${a.potenciaEstimadaKwp} kWp.` : null,
          a.economiaMensalEstimada ? `Economia mensal estimada: R$ ${a.economiaMensalEstimada.toFixed(2)}.` : null,
          "Estimativa baseada em irradiação solar média nacional — valor real varia por região, orientação do telhado e tarifa vigente.",
        ].filter(Boolean).join("\n"),
      });
      payload.proposal_id = proposalId;
    }

    const { error } = await supabase.from("solar_analises").update(payload).eq("id", a.id);
    if (error) { toast.error(`Erro ao atualizar status: ${friendlyError(error)}`); return; }
    setAnalises(prev => prev.map(x => x.id === a.id ? { ...x, status: next, proposalId: proposalId ?? x.proposalId } : x));

    if (proposalId) toast.success("Proposta gerada em Propostas — pronta para envio/compartilhamento.");

    const taskTitle = FOLLOWUP_TASK_BY_STATUS[next];
    if (taskTitle) {
      addTask({
        title: `${taskTitle} — ${a.cliente}`,
        description: `Tipo: Energia Solar · Status: ${next}`,
        status: "Em Aberto",
        priority: "Alta",
      });
    }
  };

  const handleUpdateValorProposta = async (a: SolarAnalise, valor: number | null) => {
    if (!supabase) return;
    const { error } = await supabase.from("solar_analises").update({ valor_proposta: valor }).eq("id", a.id);
    if (error) { toast.error(`Erro ao salvar valor da proposta: ${friendlyError(error)}`); return; }
    setAnalises(prev => prev.map(x => x.id === a.id ? { ...x, valorProposta: valor } : x));
  };

  const handleDelete = async (id: string, cliente: string) => {
    if (!supabase) return;
    if (!(await confirmDialog({ title: "Remover análise", description: `Remover a análise de ${cliente}?` }))) return;
    const { error } = await supabase.from("solar_analises").delete().eq("id", id);
    if (error) { toast.error(`Erro ao remover: ${friendlyError(error)}`); return; }
    setAnalises(prev => prev.filter(x => x.id !== id));
  };

  return (
    <PageContainer
      title="Energia Solar — Análise de Fatura"
      description="Envie uma foto da conta de luz e obtenha consumo médio, dimensionamento e economia estimada automaticamente."
    >
      <div className="space-y-6 max-w-5xl mx-auto pb-12">
        <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center gap-2 mb-4">
            <Sun className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider">Nova Análise</h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] block mb-2">Foto da Fatura de Energia</label>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} className="hidden" id="fatura-upload" />
              <label
                htmlFor="fatura-upload"
                className="flex flex-col items-center justify-center gap-2 h-40 border-2 border-dashed border-[var(--color-border-default)] rounded-xl cursor-pointer hover:border-amber-500/50 transition-colors overflow-hidden"
              >
                {preview ? (
                  <img src={preview} alt="Preview da fatura" className="h-full w-full object-contain" />
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-[var(--color-text-faint)]" />
                    <span className="text-xs text-[var(--color-text-muted)]">Clique para enviar (JPEG, PNG, WebP — até 4MB)</span>
                  </>
                )}
              </label>
              <Button
                onClick={handleAnalyze}
                disabled={!file || analyzing}
                className="w-full mt-3 gap-2 h-10 text-xs font-bold disabled:opacity-40"
              >
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {analyzing ? "Analisando com IA..." : "Analisar Fatura"}
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] block mb-2">Nome do Cliente</label>
                <Input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome do cliente/lead" />
              </div>

              {resultado && (
                <div className="p-4 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-border-subtle)] space-y-2.5 text-xs">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/80 pb-1">
                    Revise os dados extraídos pela IA antes de salvar
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--color-text-muted)] shrink-0">Distribuidora</span>
                    <input
                      value={resultado.distribuidora ?? ""}
                      onChange={(e) => setResultado({ ...resultado, distribuidora: e.target.value || null })}
                      placeholder="Não identificado"
                      className="bg-transparent text-right font-bold text-[var(--color-text-primary)] outline-none border-b border-transparent focus:border-amber-500/50 w-40"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--color-text-muted)] shrink-0">Consumo médio (kWh)</span>
                    <input
                      type="number"
                      value={resultado.consumoMedioKwh ?? ""}
                      onChange={(e) => {
                        const consumoMedioKwh = e.target.value ? Number(e.target.value) : null;
                        setResultado({ ...resultado, consumoMedioKwh, ...recalcularEstimativas(consumoMedioKwh, resultado.valorFatura, params) });
                      }}
                      placeholder="Não identificado"
                      className="bg-transparent text-right font-bold text-[var(--color-text-primary)] outline-none border-b border-transparent focus:border-amber-500/50 w-24"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--color-text-muted)] shrink-0">Valor da fatura (R$)</span>
                    <input
                      type="number"
                      value={resultado.valorFatura ?? ""}
                      onChange={(e) => {
                        const valorFatura = e.target.value ? Number(e.target.value) : null;
                        setResultado({ ...resultado, valorFatura, ...recalcularEstimativas(resultado.consumoMedioKwh, valorFatura, params) });
                      }}
                      placeholder="Não identificado"
                      className="bg-transparent text-right font-bold text-[var(--color-text-primary)] outline-none border-b border-transparent focus:border-amber-500/50 w-24"
                    />
                  </div>
                  <div className="pt-2 mt-2 border-t border-[var(--color-border-subtle)] flex justify-between">
                    <span className="text-[var(--color-text-muted)] flex items-center gap-1"><Zap className="w-3 h-3 text-amber-500" />Sistema estimado</span>
                    <span className="font-black text-amber-500">{resultado.potenciaEstimadaKwp ? `${resultado.potenciaEstimadaKwp} kWp` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-muted)] flex items-center gap-1"><TrendingDown className="w-3 h-3 text-emerald-500" />Economia mensal estimada</span>
                    <span className="font-black text-emerald-500">{resultado.economiaMensalEstimada ? `R$ ${resultado.economiaMensalEstimada.toFixed(2)}` : "—"}</span>
                  </div>
                  <p className="text-[9px] text-[var(--color-text-faint)] pt-1">
                    Estimativa baseada em irradiação solar média ({String(params.hsp).replace(".", ",")} HSP) e eficiência de sistema de {params.eficienciaPct}%. Valor real varia por região, orientação do telhado e tarifa vigente. Potência e economia acima são recalculadas a partir do consumo revisado só ao salvar.
                  </p>
                  <Button onClick={handleSave} className="w-full mt-2 h-9 text-[10px] font-black uppercase tracking-widest gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar Revisão e Adicionar ao Funil
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="p-4 border-b border-[var(--color-border-subtle)]">
            <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Funil Fotovoltaico</h3>
          </div>
          {analises.length === 0 ? (
            <p className="p-6 text-xs text-[var(--color-text-muted)]">Nenhuma análise salva ainda.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {analises.map(a => (
                <div key={a.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{a.cliente}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      {a.consumoMedioKwh ? `${a.consumoMedioKwh} kWh/mês` : "—"} · {a.potenciaEstimadaKwp ? `${a.potenciaEstimadaKwp} kWp` : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-[var(--color-text-faint)]">R$</span>
                    <input
                      type="number"
                      defaultValue={a.valorProposta ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        if (v !== a.valorProposta) handleUpdateValorProposta(a, v);
                      }}
                      placeholder="valor proposta"
                      className="w-24 bg-transparent border-b border-dashed border-[var(--color-border-default)] text-right text-xs font-bold text-[var(--color-text-primary)] outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border ${statusColor(a.status)}`}>{a.status}</span>
                    {a.proposalId && (
                      <button onClick={() => navigate("/app/propostas")} className="text-[9px] font-black uppercase text-emerald-500 hover:text-emerald-400">Ver Proposta</button>
                    )}
                    {a.status !== "Concluído" && (
                      <button onClick={() => handleAdvanceStatus(a)} className="text-[9px] font-black uppercase text-blue-500 hover:text-blue-400">Avançar</button>
                    )}
                    <button onClick={() => handleDelete(a.id, a.cliente)} className="p-1.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10 hover:border-danger/25 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
