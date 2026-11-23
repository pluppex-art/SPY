import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "../../components/PageContainer";
import { ChevronRight, Save, RefreshCw, Plus, Trash2, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";

// ─── Constantes ────────────────────────────────────────────────────────────
const TENANT_ID = "27ef95ee-84dd-499e-9f25-cd9baecb5fe4";
const SITE_KEY  = "eempreenda";
const PREVIEW   = "https://escolaempreendamais.pluppex.com.br";

type SectionKey = "hero" | "pillars" | "benefits" | "testimonials" | "faq";

// ─── Defaults ──────────────────────────────────────────────────────────────
const DEFAULTS = {
  hero: {
    h1:       "Desperte o Empreendedor que existe em você.",
    subtitle: "Em 2026, você estará celebrando seu negócio consolidado ou lamentando as chances que deixou passar. A Turma 3 da E-Empreenda+ é a sua oportunidade para construir um negócio lucrativo com propósito e visão estratégica.",
    quote:    "Empreender transforma vidas.",
    ctaText:  "Garantir Minha Vaga",
  },
  pillars: [
    { num: "01", title: "Identidade & Propósito",  desc: "Clareza total sobre quem você é e a marca que deseja deixar no mundo." },
    { num: "02", title: "Mentalidade de Legado",   desc: "Foco emocional e psicológico para empreender com resiliência e visão de longo prazo." },
    { num: "03", title: "Execução Prática",        desc: "Método e ferramentas para transformar ideias em negócios sustentáveis." },
  ],
  benefits: [
    { step: "01", title: "Conteúdos de Preparação",     desc: "Receba materiais exclusivos que vão preparar sua mente e seu negócio para a Turma 3." },
    { step: "02", title: "Bastidores da E-Empreenda+",  desc: "Entenda a estrutura por trás dos negócios que unem propósito e identidade que te leva ao lucro." },
    { step: "03", title: "Acesso Antecipado",           desc: "Garanta sua inscrição antes de todo mundo e tenha prioridade máxima na Turma 3." },
    { step: "04", title: "Networking Curado",           desc: "Conecte-se com empreendedores que buscam os mesmos valores e ambições que você." },
  ],
  testimonials: [
    { text: "Escalar um negócio digital exige muito mais que apenas técnica; exige uma base sólida de princípios. Na E-Empreenda+ encontrei o equilíbrio perfeito entre métricas agressivas e propósito inegociável.", name: "Gustavo Oliveira",  role: "Estrategista Digital",   sector: "Marketing" },
    { text: "O crochê era meu refúgio, mas no movimento E+ virou meu negócio real. Aprendi a sair do amadorismo, valorizar meu trabalho e estruturar processos que me permitem crescer sem perder a essência do que eu faço com as mãos.", name: "Renata Luz",      role: "Recriar Crochê",         sector: "Artesanato" },
    { text: "Como servidor, eu buscava segurança, mas sentia um chamado latente para frutificar fora do sistema. A E-Empreenda+ me deu a coragem e, principalmente, o método para empreender com responsabilidade e clareza de direção.", name: "Marcus Vinícius", role: "Servidor Público",       sector: "Serviço Público" },
    { text: "Eu já tinha a garra de vendas, mas me faltava a visão de dono. A mentoria me ensinou a transformar esforço individual em um modelo de negócio replicável. Hoje não apenas vendo, eu construo um ativo com base em valores.", name: "Kevin Oliveira",  role: "Vendedor",               sector: "Vendas" },
    { text: "Minha clínica mudou de patamar quando entendi que ser uma excelente profissional técnica é diferente de ser uma dona de clínica de sucesso. O E-EMPREENDA+ foi o divisor de águas na minha gestão.", name: "Eduarda Porto",   role: "Farmacêutica Esteta",    sector: "Saúde & Estética" },
    { text: "Viver de arte é um desafio constante. A E-Empreenda+ me ensinou a gerir minha carreira como uma empresa, trazendo previsibilidade financeira e uma autoridade que eu não conseguia construir sozinho no mercado de ensino.", name: "Gustavo Silva",   role: "Instrutor de Canto",     sector: "Educação" },
  ],
  faq: [
    { q: "Para quem é o E-EMPREENDA + IMERSÃO?",                   a: "Para quem quer começar ou crescer com estratégia, apoio e visão prática. Não importa se você ainda está no CLT ou se já possui um negócio estruturado." },
    { q: "Como funcionam os 12 encontros?",                         a: "São 12 encontros presenciais intensivos com foco em execução. Cada encontro tem uma entrega específica: você sai com algo implementado no seu negócio." },
    { q: "Qual é a garantia?",                                      a: "Garantia total de resultados. Se você participar ativamente e não conseguir implementar ao menos um sistema novo no seu negócio, devolvemos 100% do investimento." },
    { q: "Quando começa a próxima turma?",                          a: "A próxima turma começa em 5 de agosto de 2026. As vagas são limitadas — apenas 50 — e preenchidas por ordem de aplicação." },
    { q: "Tem suporte entre os encontros?",                         a: "Sim. Todos os participantes têm acesso à comunidade de alumni e suporte direto dos mentores entre os encontros." },
    { q: "Qual é a diferença entre IMERSÃO, MASTERMIND e IA LAB?",  a: "IMERSÃO é para implementação de sistemas. MASTERMIND é para decisores de alta escala. IA LAB é para automação de processos com IA." },
  ],
} as const;

type HeroData         = typeof DEFAULTS.hero;
type PilarData        = { num: string; title: string; desc: string };
type BenefitData      = { step: string; title: string; desc: string };
type TestimonialData  = { text: string; name: string; role: string; sector: string };
type FAQData          = { q: string; a: string };

// ─── helpers ───────────────────────────────────────────────────────────────

async function load<T>(section: string, fallback: T): Promise<T> {
  const { data } = await supabase
    .from("landing_configs")
    .select("content")
    .eq("tenant_id", TENANT_ID)
    .eq("site_key", SITE_KEY)
    .eq("section", section)
    .maybeSingle();
  return (data?.content as T) ?? fallback;
}

async function save(section: string, content: unknown) {
  return supabase.from("landing_configs").upsert(
    { tenant_id: TENANT_ID, site_key: SITE_KEY, section, content, updated_at: new Date().toISOString() },
    { onConflict: "tenant_id,site_key,section" }
  );
}

// ─── Sub-editors ───────────────────────────────────────────────────────────

function HeroEditor({ tenantId }: { tenantId: string }) {
  const [data, setData]   = useState<HeroData>(DEFAULTS.hero);
  const [saving, setSave] = useState(false);
  const [loaded, setLoad] = useState(false);

  useEffect(() => { load("hero", DEFAULTS.hero).then(d => { setData(d); setLoad(true); }); }, []);

  const handleSave = async () => {
    setSave(true);
    const { error } = await save("hero", data);
    setSave(false);
    if (error) { toast.error("Erro ao salvar."); return; }
    toast.success("Hero salvo com sucesso!");
  };

  const field = (label: string, key: keyof HeroData, multiline = false) => (
    <div key={key}>
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">{label}</label>
      {multiline ? (
        <textarea
          rows={4}
          value={data[key]}
          onChange={e => setData(p => ({ ...p, [key]: e.target.value }))}
          className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors resize-none leading-relaxed"
        />
      ) : (
        <input
          type="text"
          value={data[key]}
          onChange={e => setData(p => ({ ...p, [key]: e.target.value }))}
          className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl h-11 px-4 text-sm focus:outline-none focus:border-orange-500/50 transition-colors"
        />
      )}
    </div>
  );

  if (!loaded) return <Loader />;
  return (
    <div className="space-y-5">
      {field("Título principal (H1)", "h1")}
      {field("Subtítulo", "subtitle", true)}
      {field("Citação (quote)", "quote")}
      {field("Texto do botão CTA", "ctaText")}
      <SaveBar saving={saving} onSave={handleSave} />
    </div>
  );
}

function PillarsEditor() {
  const [items, setItems]  = useState<PilarData[]>([...DEFAULTS.pillars]);
  const [saving, setSave]  = useState(false);
  const [loaded, setLoad]  = useState(false);

  useEffect(() => { load<PilarData[]>("pillars", [...DEFAULTS.pillars]).then(d => { setItems(d); setLoad(true); }); }, []);

  const update = (i: number, key: keyof PilarData, val: string) =>
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const handleSave = async () => {
    setSave(true);
    const { error } = await save("pillars", items);
    setSave(false);
    if (error) { toast.error("Erro ao salvar."); return; }
    toast.success("Pilares salvos!");
  };

  const add = () => setItems(p => [...p, { num: String(p.length + 1).padStart(2, "0"), title: "", desc: "" }]);
  const remove = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));

  if (!loaded) return <Loader />;
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="bg-[var(--color-surface-elevated)]/60 border border-white/5 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Pilar {item.num}</span>
            {items.length > 1 && (
              <button onClick={() => remove(i)} className="p-1.5 rounded-lg bg-rose-500/5 hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input placeholder="Título" value={item.title} onChange={e => update(i, "title", e.target.value)}
            className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl h-10 px-4 text-sm focus:outline-none focus:border-orange-500/50 transition-colors" />
          <textarea placeholder="Descrição" rows={2} value={item.desc} onChange={e => update(i, "desc", e.target.value)}
            className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/50 transition-colors resize-none" />
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-2 text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
        <Plus className="w-3.5 h-3.5" /> Adicionar Pilar
      </button>
      <SaveBar saving={saving} onSave={handleSave} />
    </div>
  );
}

function BenefitsEditor() {
  const [items, setItems] = useState<BenefitData[]>([...DEFAULTS.benefits]);
  const [saving, setSave] = useState(false);
  const [loaded, setLoad] = useState(false);

  useEffect(() => { load<BenefitData[]>("benefits", [...DEFAULTS.benefits]).then(d => { setItems(d); setLoad(true); }); }, []);

  const update = (i: number, key: keyof BenefitData, val: string) =>
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const handleSave = async () => {
    setSave(true);
    const { error } = await save("benefits", items);
    setSave(false);
    if (error) { toast.error("Erro ao salvar."); return; }
    toast.success("Benefícios salvos!");
  };

  const add    = () => setItems(p => [...p, { step: String(p.length + 1).padStart(2, "0"), title: "", desc: "" }]);
  const remove = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));

  if (!loaded) return <Loader />;
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="bg-[var(--color-surface-elevated)]/60 border border-white/5 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Benefício {item.step}</span>
            {items.length > 1 && (
              <button onClick={() => remove(i)} className="p-1.5 rounded-lg bg-rose-500/5 hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input placeholder="Título" value={item.title} onChange={e => update(i, "title", e.target.value)}
            className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl h-10 px-4 text-sm focus:outline-none focus:border-orange-500/50 transition-colors" />
          <textarea placeholder="Descrição" rows={2} value={item.desc} onChange={e => update(i, "desc", e.target.value)}
            className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/50 transition-colors resize-none" />
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-2 text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
        <Plus className="w-3.5 h-3.5" /> Adicionar Benefício
      </button>
      <SaveBar saving={saving} onSave={handleSave} />
    </div>
  );
}

function TestimonialsEditor() {
  const [items, setItems] = useState<TestimonialData[]>([...DEFAULTS.testimonials]);
  const [saving, setSave] = useState(false);
  const [loaded, setLoad] = useState(false);

  useEffect(() => { load<TestimonialData[]>("testimonials", [...DEFAULTS.testimonials]).then(d => { setItems(d); setLoad(true); }); }, []);

  const update = (i: number, key: keyof TestimonialData, val: string) =>
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const handleSave = async () => {
    setSave(true);
    const { error } = await save("testimonials", items);
    setSave(false);
    if (error) { toast.error("Erro ao salvar."); return; }
    toast.success("Depoimentos salvos!");
  };

  const add    = () => setItems(p => [...p, { text: "", name: "", role: "", sector: "" }]);
  const remove = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));

  if (!loaded) return <Loader />;
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="bg-[var(--color-surface-elevated)]/60 border border-white/5 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-[10px] font-black text-white">
              {item.name ? item.name.charAt(0) : String(i + 1)}
            </div>
            <button onClick={() => remove(i)} className="p-1.5 rounded-lg bg-rose-500/5 hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea placeholder="Depoimento" rows={3} value={item.text} onChange={e => update(i, "text", e.target.value)}
            className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/50 transition-colors resize-none" />
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Nome" value={item.name} onChange={e => update(i, "name", e.target.value)}
              className="bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl h-10 px-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors" />
            <input placeholder="Cargo / Empresa" value={item.role} onChange={e => update(i, "role", e.target.value)}
              className="bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl h-10 px-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors" />
            <input placeholder="Setor" value={item.sector} onChange={e => update(i, "sector", e.target.value)}
              className="bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl h-10 px-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors" />
          </div>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-2 text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
        <Plus className="w-3.5 h-3.5" /> Adicionar Depoimento
      </button>
      <SaveBar saving={saving} onSave={handleSave} />
    </div>
  );
}

function FAQEditor() {
  const [items, setItems] = useState<FAQData[]>([...DEFAULTS.faq]);
  const [saving, setSave] = useState(false);
  const [loaded, setLoad] = useState(false);

  useEffect(() => { load<FAQData[]>("faq", [...DEFAULTS.faq]).then(d => { setItems(d); setLoad(true); }); }, []);

  const update = (i: number, key: keyof FAQData, val: string) =>
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const handleSave = async () => {
    setSave(true);
    const { error } = await save("faq", items);
    setSave(false);
    if (error) { toast.error("Erro ao salvar."); return; }
    toast.success("FAQ salvo!");
  };

  const add    = () => setItems(p => [...p, { q: "", a: "" }]);
  const remove = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));

  if (!loaded) return <Loader />;
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="bg-[var(--color-surface-elevated)]/60 border border-white/5 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pergunta {i + 1}</span>
            <button onClick={() => remove(i)} className="p-1.5 rounded-lg bg-rose-500/5 hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <input placeholder="Pergunta" value={item.q} onChange={e => update(i, "q", e.target.value)}
            className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl h-10 px-4 text-sm focus:outline-none focus:border-orange-500/50 transition-colors" />
          <textarea placeholder="Resposta" rows={3} value={item.a} onChange={e => update(i, "a", e.target.value)}
            className="w-full bg-[var(--color-surface-elevated)] text-white border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/50 transition-colors resize-none" />
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-2 text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
        <Plus className="w-3.5 h-3.5" /> Adicionar Pergunta
      </button>
      <SaveBar saving={saving} onSave={handleSave} />
    </div>
  );
}

// ─── Shared UI ─────────────────────────────────────────────────────────────

function Loader() {
  return (
    <div className="py-12 flex justify-center">
      <RefreshCw className="w-5 h-5 text-slate-600 animate-spin" />
    </div>
  );
}

function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="flex justify-end pt-2">
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors"
      >
        {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        {saving ? "Salvando..." : "Salvar Alterações"}
      </button>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────

type Tab = { key: SectionKey; label: string };

const TABS: Tab[] = [
  { key: "hero",         label: "Hero" },
  { key: "pillars",      label: "Pilares" },
  { key: "benefits",     label: "Benefícios" },
  { key: "testimonials", label: "Depoimentos" },
  { key: "faq",          label: "FAQ" },
];

export default function EEmpreendaEditor() {
  const navigate          = useNavigate();
  const [tab, setTab]     = useState<SectionKey>("hero");
  const [iframe, setIframe] = useState(0);

  return (
    <PageContainer
      title="Editor — E-EMPREENDA+"
      subtitle="Edite o conteúdo da landing page. Salvo no Supabase e refletido na página em tempo real."
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate("/app/marketing/landing-pages")}
          className="text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
          Landing Pages
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-[11px] font-black text-white uppercase tracking-widest">E-EMPREENDA+</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 items-start">

        {/* LEFT — editor */}
        <div className="space-y-5">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/5 rounded-xl w-fit flex-wrap">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${tab === t.key ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl p-6">
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}>
                {tab === "hero"         && <HeroEditor tenantId={TENANT_ID} />}
                {tab === "pillars"      && <PillarsEditor />}
                {tab === "benefits"     && <BenefitsEditor />}
                {tab === "testimonials" && <TestimonialsEditor />}
                {tab === "faq"          && <FAQEditor />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT — preview */}
        <div className="space-y-3 sticky top-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Preview</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setIframe(k => k + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest transition-all">
                <RefreshCw className="w-3 h-3" /> Reload
              </button>
              <a href={PREVIEW} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest transition-all">
                <ExternalLink className="w-3 h-3" /> Abrir
              </a>
            </div>
          </div>
          <div className="rounded-2xl overflow-hidden border border-white/8 bg-[var(--color-surface)]">
            <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.03] border-b border-white/5">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-500/60" />
                <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
              </div>
              <span className="text-[10px] text-slate-500 mx-auto">{PREVIEW}</span>
            </div>
            <iframe key={iframe} src={PREVIEW} title="E-EMPREENDA+ Preview"
              className="w-full" style={{ height: "600px", border: "none" }}
              sandbox="allow-scripts allow-same-origin allow-forms" />
          </div>
          <p className="text-[10px] text-slate-600 text-center">
            Após salvar, recarregue o preview para ver as mudanças.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
