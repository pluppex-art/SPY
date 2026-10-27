import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import {
  FileText, Users, TrendingUp, Eye, RefreshCw, ExternalLink,
  CheckCircle2, RotateCcw, ToggleRight, ToggleLeft, Smartphone,
  AlertCircle, Settings, Pencil
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../../../lib/supabase";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { FormStepsEditor } from "./FormStepsEditor";

export interface FormDefinition {
  id: string;
  name: string;
  description: string;
  previewUrl: string;
  source: string;
  active: boolean;
}

interface SdrInfo { id: string; nome: string; phone: string; }
interface FormRodizioConfig { current_index: number; active_sdr_ids: string[] | null; }
interface LeadStat { total: number; today: number; thisWeek: number; }
type Tab = "visualizar" | "rodizio" | "leads" | "perguntas";

export function FormDetail({ form, tenantId }: { form: FormDefinition; tenantId: string }) {
  const [tab,         setTab]       = useState<Tab>("visualizar");
  const [sdrs,        setSdrs]      = useState<SdrInfo[]>([]);
  const [config,      setConfig]    = useState<FormRodizioConfig>({ current_index: 0, active_sdr_ids: null });
  const [stats,       setStats]     = useState<LeadStat>({ total: 0, today: 0, thisWeek: 0 });
  const [recentLeads, setRecent]    = useState<any[]>([]);
  const [loading,     setLoading]   = useState(true);
  const [saving,      setSaving]    = useState(false);
  const [iframeKey,   setIframeKey] = useState(0);
  const [viewFormat,  setViewFormat] = useState<"passo_a_passo" | "scroll" | "iframe">("passo_a_passo");
  const [currentStep, setCurrentStep] = useState(0);
  const [stepData,    setStepData]    = useState({
    nome: "",
    email: "",
    telefone: "",
    perfil: "iniciante",
  });

  const stepsList = [
    { subtitle: "1 → IDENTIFICAÇÃO", title: "Qual é o seu nome completo?" },
    { subtitle: "2 → CONTATO DIRETO", title: "Como nossa equipe pode falar com você?" },
    { subtitle: "3 → PERFIL ATUAL", title: "Qual o seu momento profissional hoje?" },
    { subtitle: "4 → CONFIRMAÇÃO", title: "Revise e envie sua solicitação" },
  ];

  const saveFormatSetting = async (format: "passo_a_passo" | "scroll" | "iframe") => {
    try {
      await supabase.from("app_settings").upsert({
        id: `${tenantId}_form_format_${form.id}`,
        tenant_id: tenantId,
        key: `form_format_${form.id}`,
        value: { format },
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    } catch {}
  };

  useEffect(() => {
    supabase.from("app_settings").select("value")
      .eq("tenant_id", tenantId).eq("key", `form_format_${form.id}`).maybeSingle()
      .then(({ data }) => {
        if (data?.value?.format) {
          setViewFormat(data.value.format);
        }
      });
    loadAll();
  }, [form.id]);

  async function loadAll() {
    setLoading(true);
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

    const [sdrRes, cfgRes, totalRes, todayRes, weekRes, recentRes] = await Promise.all([
      supabase.from("colaboradores").select("id, nome, phone")
        .eq("tenant_id", tenantId).eq("cargo", "SDR").eq("status", "Ativo").order("nome"),
      supabase.from("app_settings").select("value")
        .eq("tenant_id", tenantId).eq("key", `form_rodizio_${form.id}`).maybeSingle(),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("source", form.source),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("source", form.source).gte("created_at", today.toISOString()),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("source", form.source).gte("created_at", weekAgo.toISOString()),
      supabase.from("leads").select("name, email, created_at")
        .eq("tenant_id", tenantId).eq("source", form.source)
        .order("created_at", { ascending: false }).limit(10),
    ]);

    if (sdrRes.data)        setSdrs(sdrRes.data as SdrInfo[]);
    if (cfgRes.data?.value) setConfig(cfgRes.data.value as FormRodizioConfig);
    setStats({ total: totalRes.count ?? 0, today: todayRes.count ?? 0, thisWeek: weekRes.count ?? 0 });
    if (recentRes.data)     setRecent(recentRes.data);
    setLoading(false);
  }

  async function saveConfig(newConfig: FormRodizioConfig) {
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert({
      id:         `${tenantId}_form_rodizio_${form.id}`,
      tenant_id:  tenantId,
      key:        `form_rodizio_${form.id}`,
      value:      newConfig,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    setSaving(false);
    if (error) { toast.error("Erro ao salvar."); return; }
    setConfig(newConfig);
    toast.success("Rodízio atualizado.");
  }

  function toggleSdr(id: string) {
    const active = config.active_sdr_ids ?? sdrs.map(s => s.id);
    const newIds = active.includes(id) ? active.filter(x => x !== id) : [...active, id];
    saveConfig({ ...config, active_sdr_ids: newIds.length === sdrs.length ? null : newIds });
  }

  const activeSdrIds = config.active_sdr_ids ?? sdrs.map(s => s.id);
  const activeSDRs   = sdrs.filter(s => activeSdrIds.includes(s.id));
  const nextSdr      = activeSDRs[config.current_index % Math.max(activeSDRs.length, 1)];

  // O editor de perguntas hoje só sabe editar o schema de 5 passos usado pela E-EMPREENDA+
  // (tabela landing_configs); não é um form-builder genérico para qualquer URL cadastrada,
  // então só aparece para o formulário que ele de fato suporta.
  const supportsStepsEditor = form.source === "landing_empreenda";

  const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "visualizar", label: "Visualizar",      icon: <Eye        className="w-3.5 h-3.5" /> },
    ...(supportsStepsEditor ? [{ key: "perguntas" as Tab, label: "Editar Perguntas", icon: <Pencil className="w-3.5 h-3.5" /> }] : []),
    { key: "rodizio",    label: "Rodízio SDR",     icon: <Users      className="w-3.5 h-3.5" /> },
    { key: "leads",      label: "Leads",           icon: <TrendingUp className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total",      value: stats.total,    color: "text-indigo-500",  icon: <FileText     className="w-5 h-5" /> },
          { label: "Hoje",       value: stats.today,    color: "text-emerald-500", icon: <CheckCircle2 className="w-5 h-5" /> },
          { label: "Últimos 7d", value: stats.thisWeek, color: "text-blue-500",    icon: <TrendingUp   className="w-5 h-5" /> },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all rounded-2xl p-6">
            <div className={`mb-4 ${s.color}`}>{s.icon}</div>
            <div className="text-2xl font-display font-black text-white mb-1 italic">{loading ? "—" : s.value}</div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/5 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${tab === t.key ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>

          {tab === "visualizar" && (
            <div className="space-y-4">
              {/* Formato Switcher */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-900/90 border border-slate-700/80 rounded-2xl">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Modo de Exibição:</span>
                  <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => { setViewFormat("passo_a_passo"); saveFormatSetting("passo_a_passo"); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        viewFormat === "passo_a_passo"
                          ? "bg-orange-600 text-white shadow-md"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      🏃 Passo a Passo (Corridinha)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setViewFormat("scroll"); saveFormatSetting("scroll"); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        viewFormat === "scroll"
                          ? "bg-orange-600 text-white shadow-md"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      📜 Scroll Contínuo (Google Forms)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setViewFormat("iframe"); saveFormatSetting("iframe"); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        viewFormat === "iframe"
                          ? "bg-orange-600 text-white shadow-md"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      📱 Iframe Real
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a href={form.previewUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] font-bold text-orange-400 hover:underline inline-flex items-center gap-1">
                    {form.previewUrl} <ExternalLink className="w-3 h-3" />
                  </a>
                  {viewFormat === "iframe" && (
                    <button onClick={() => setIframeKey(k => k + 1)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-[10px] font-black text-slate-300 hover:text-white uppercase tracking-widest transition-all">
                      <RefreshCw className="w-3 h-3" /> Recarregar
                    </button>
                  )}
                </div>
              </div>

              {/* Modo: Passo a Passo (Corridinha / Typeform) */}
              {viewFormat === "passo_a_passo" && (
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl relative overflow-hidden">
                  <div className="max-w-xl mx-auto space-y-6">
                    {/* Header / Progress */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                          Etapa {currentStep + 1} de {stepsList.length}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          {Math.round(((currentStep + 1) / stepsList.length) * 100)}% concluído
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
                          style={{ width: `${((currentStep + 1) / stepsList.length) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Step Content */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">
                          {stepsList[currentStep]?.subtitle}
                        </span>
                        <h4 className="text-lg font-black text-white">
                          {stepsList[currentStep]?.title}
                        </h4>
                      </div>

                      {currentStep === 0 && (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">Seu Nome Completo</label>
                            <input
                              type="text"
                              value={stepData.nome}
                              onChange={e => setStepData({ ...stepData, nome: e.target.value })}
                              placeholder="Ex: João da Silva"
                              className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-orange-500 outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {currentStep === 1 && (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">E-mail Principal</label>
                            <input
                              type="email"
                              value={stepData.email}
                              onChange={e => setStepData({ ...stepData, email: e.target.value })}
                              placeholder="joao@empresa.com.br"
                              className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-orange-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400">WhatsApp / Telefone</label>
                            <input
                              type="text"
                              value={stepData.telefone}
                              onChange={e => setStepData({ ...stepData, telefone: e.target.value })}
                              placeholder="(11) 99999-9999"
                              className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-orange-500 outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {currentStep === 2 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {[
                            { value: "aspirante", label: "Quero Empreender", desc: "Tenho uma ideia ou desejo abrir negócio", icon: "🌱" },
                            { value: "iniciante", label: "Estou Começando", desc: "Negócio com menos de 2 anos", icon: "🚀" },
                            { value: "pequeno", label: "Já Empreendo", desc: "Tenho empresa ativa e quero escalar", icon: "📈" },
                            { value: "retomada", label: "Quero Recomeçar", desc: "Já empreendi antes e vou retomar", icon: "🔄" },
                          ].map(item => (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => setStepData({ ...stepData, perfil: item.value })}
                              className={`p-3.5 rounded-xl border text-left transition-all ${
                                stepData.perfil === item.value
                                  ? "bg-orange-500/20 border-orange-500 ring-1 ring-orange-500/40 text-white"
                                  : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                              }`}
                            >
                              <div className="text-xl mb-1">{item.icon}</div>
                              <div className="text-xs font-black text-white">{item.label}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                            </button>
                          ))}
                        </div>
                      )}

                      {currentStep === 3 && (
                        <div className="space-y-3">
                          <p className="text-xs text-slate-300 leading-relaxed">
                            Confirme o envio da sua inscrição para entrar imediatamente no pipeline comercial e receber o atendimento de um SDR qualificado.
                          </p>
                          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs text-slate-400">
                            <div><strong className="text-white">Nome:</strong> {stepData.nome || "Não informado"}</div>
                            <div><strong className="text-white">Contato:</strong> {stepData.email || "—"} | {stepData.telefone || "—"}</div>
                            <div><strong className="text-white">Perfil:</strong> {stepData.perfil || "—"}</div>
                          </div>
                        </div>
                      )}

                      {/* Navigation buttons */}
                      <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                        <button
                          type="button"
                          disabled={currentStep === 0}
                          onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                        >
                          ← Voltar
                        </button>

                        {currentStep < stepsList.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => setCurrentStep(prev => Math.min(stepsList.length - 1, prev + 1))}
                            className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg"
                          >
                            Avançar →
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              toast.success("Simulação de envio concluída! Lead qualificado gerado com sucesso.");
                              setCurrentStep(0);
                            }}
                            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg"
                          >
                            ✓ Enviar Inscrição
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Modo: Scroll Contínuo (Google Forms) */}
              {viewFormat === "scroll" && (
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl space-y-6 max-w-2xl mx-auto">
                  <div className="border-b border-slate-800 pb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">Formulário Contínuo</span>
                    <h3 className="text-xl font-black text-white mt-1">{form.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{form.description}</p>
                  </div>

                  <div className="space-y-5">
                    {/* Seção 1 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">1. Identificação & Contato</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Nome Completo *</label>
                          <input
                            type="text"
                            placeholder="Seu nome"
                            className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-xs focus:border-orange-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">E-mail *</label>
                          <input
                            type="email"
                            placeholder="seuemail@empresa.com"
                            className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-xs focus:border-orange-500 outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-bold uppercase text-slate-400">WhatsApp / Telefone com DDD *</label>
                          <input
                            type="text"
                            placeholder="(11) 98888-8888"
                            className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-xs focus:border-orange-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Seção 2 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">2. Perfil e Momento Atual</h4>
                      <div className="space-y-2">
                        {[
                          "Tenho uma ideia de negócio e quero começar do jeito certo",
                          "Já tenho um negócio operando e quero estruturar as vendas",
                          "Quero acelerar faturamento e escalar minha equipe comercial",
                          "Preciso de consultoria estratégica para reestruturação",
                        ].map((opt, i) => (
                          <label key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all">
                            <input type="radio" name="perfil_scroll" className="accent-orange-500" />
                            <span className="text-xs text-slate-200">{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Seção 3 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">3. Mensagem ou Detalhes Adicionais</h4>
                      <textarea
                        rows={3}
                        placeholder="Conte brevemente sobre o seu momento comercial..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-xs focus:border-orange-500 outline-none resize-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => toast.success("Inscrição via Scroll Contínuo enviada com sucesso!")}
                      className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl"
                    >
                      Enviar Respostas do Formulário
                    </button>
                  </div>
                </div>
              )}

              {/* Modo: Iframe Real */}
              {viewFormat === "iframe" && (
                <div className="rounded-2xl overflow-hidden border border-white/8 bg-[var(--color-surface)]">
                  <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.03] border-b border-white/5">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-rose-500/60" />
                      <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-md">
                        <Smartphone className="w-3 h-3 text-slate-500" />
                        <span className="text-[10px] text-slate-400 font-medium">{form.previewUrl}</span>
                      </div>
                    </div>
                  </div>
                  <iframe key={iframeKey} src={form.previewUrl} title={form.name}
                    className="w-full" style={{ height: "540px", border: "none" }}
                    sandbox="allow-scripts allow-same-origin allow-forms" />
                </div>
              )}

              {!supportsStepsEditor && viewFormat === "iframe" && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-300/70 font-medium leading-relaxed">
                    Este formulário é hospedado externamente. Para editar perguntas e campos, altere a página no projeto de origem — o S.P.Y. acompanha apenas os leads e o rodízio de SDR gerados por ela.
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "perguntas" && supportsStepsEditor && (
            <FormStepsEditor tenantId={tenantId} siteKey={form.source === "landing_empreenda" ? "eempreenda" : form.source} />
          )}

          {tab === "rodizio" && (
            <div className="space-y-5">
              {nextSdr && (
                <div className="flex items-center gap-4 p-5 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-xs font-black text-white shrink-0">
                    {nextSdr.nome.split(" ").map((n: string) => n[0]).join("").substring(0, 2)}
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-0.5">Próximo na fila</p>
                    <p className="text-sm font-black text-white">{nextSdr.nome}</p>
                    <p className="text-[10px] text-slate-500">{nextSdr.phone} · Lead #{config.current_index + 1}</p>
                  </div>
                  <button onClick={() => saveConfig({ ...config, current_index: 0 })} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black text-slate-400 hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest disabled:opacity-50">
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                </div>
              )}

              <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 p-5 border-b border-white/5">
                  <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <Users className="w-3.5 h-3.5 text-orange-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[11px] font-black text-white uppercase tracking-widest">SDRs no Rodízio</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">Round-robin entre os SDRs ativos abaixo.</p>
                  </div>
                  {saving && <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />}
                </div>
                {loading ? (
                  <div className="p-10 flex justify-center"><RefreshCw className="w-5 h-5 text-slate-600 animate-spin" /></div>
                ) : sdrs.length === 0 ? (
                  <div className="p-10 flex flex-col items-center gap-2 opacity-40">
                    <Users className="w-8 h-8 text-slate-600" />
                    <p className="text-xs font-black text-slate-500 uppercase">Nenhum SDR ativo</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {sdrs.map(sdr => {
                      const isActive = activeSdrIds.includes(sdr.id);
                      const isNext   = nextSdr?.id === sdr.id;
                      const initials = sdr.nome.split(" ").map((n: string) => n[0]).join("").substring(0, 2);
                      return (
                        <div key={sdr.id} className={`flex items-center gap-4 px-5 py-4 transition-opacity ${isActive ? "" : "opacity-40"}`}>
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-[10px] font-black text-white shrink-0">{initials}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-white">{sdr.nome}</span>
                              {isNext && isActive && (
                                <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                                  <CheckCircle2 className="w-2.5 h-2.5" /> Próximo
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">{sdr.phone}</p>
                          </div>
                          <button onClick={() => toggleSdr(sdr.id)} disabled={saving}>
                            {isActive ? <ToggleRight className="w-7 h-7 text-emerald-400" /> : <ToggleLeft className="w-7 h-7 text-slate-600" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-600">Salvo no Supabase · Sincronizado em tempo real.</p>
                <Link to="/app/configuracoes/crm/rodizio"
                  className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-white font-black uppercase tracking-widest transition-colors">
                  <Settings className="w-3 h-3" /> Config. Avançada
                </Link>
              </div>
            </div>
          )}

          {tab === "leads" && (
            <div className="space-y-4">
              <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 p-5 border-b border-white/5">
                  <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[11px] font-black text-white uppercase tracking-widest">Últimas Inscrições</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">source = {form.source}</p>
                  </div>
                  <button onClick={loadAll} disabled={loading} className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/5 transition-colors">
                    <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
                {loading ? (
                  <div className="p-10 flex justify-center"><RefreshCw className="w-5 h-5 text-slate-600 animate-spin" /></div>
                ) : recentLeads.length === 0 ? (
                  <div className="p-10 flex flex-col items-center gap-2 opacity-40">
                    <FileText className="w-8 h-8 text-slate-600" />
                    <p className="text-xs font-black text-slate-500 uppercase">Nenhuma inscrição ainda</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {recentLeads.map((lead, i) => {
                      const initials = (lead.name as string).split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
                      const dt = new Date(lead.created_at);
                      return (
                        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">{initials}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-white truncate">{lead.name}</p>
                            <p className="text-[10px] text-slate-500 truncate">{lead.email}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-bold text-white">{dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p>
                            <p className="text-[10px] text-slate-500">{dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <Link to="/app/pipeline"
                className="flex items-center justify-center gap-2 w-full p-3 bg-white/[0.03] border border-white/5 rounded-xl text-[11px] font-black text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all uppercase tracking-widest">
                Ver todos na Central de Vendas <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
