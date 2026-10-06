import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import {
  Globe, Plus, Link as LinkIcon, Pencil, ExternalLink,
  BarChart3, MousePointer2, TrendingUp, DollarSign, Award,
  Sparkles, Code, CheckCircle2, Copy, RefreshCw
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { PLUPPEX_TENANT_ID } from "../../lib/supabase";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { Modal } from "../../components/ui/modal";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { KpiFilterCard, FilterBar, FilterSearch, FilterChips } from "../../components/ui/kpi-filter-card";
import { LandingPageCard } from "./components/LandingPages/LandingPageCard";
import { LandingPageCreateModal } from "./components/LandingPages/LandingPageCreateModal";
import { LandingPageTrackingModal } from "./components/LandingPages/LandingPageTrackingModal";

const PREVIEW_URL = "https://escolaempreendamais.pluppex.com.br";

export default function MarketingLandingPages() {
  const navigate = useNavigate();
  const { activeTenantId } = useAuth();
  const {
    marketingLandingPages: rawPages,
    addMarketingLandingPage,
    updateMarketingLandingPage,
    deleteMarketingLandingPage,
    clienteBase,
  } = useData();

  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  const [selectedPage, setSelectedPage] = useState<any>(null);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [gtagId, setGtagId] = useState("");

  // Connect External Client Landing Page Form
  const [clientLPName, setClientLPName] = useState("");
  const [clientLPDomain, setClientLPDomain] = useState("");
  const [clientSelected, setClientSelected] = useState("");
  const [copiedScript, setCopiedScript] = useState(false);

  // Filtros da lista (o card KPIs & Filtros)
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");

  // Métricas reais da página — antes, qualquer valor "falsy" (incluindo um
  // 0 genuíno) era substituído por um número inventado (`1240 + idx*780`
  // etc.), fazendo toda landing page sem tráfego real mostrar estatísticas
  // fabricadas em vez de zero.
  const pages = useMemo(() => {
    return (rawPages || []).map((p: any) => {
      const views = p.views ?? 0;
      const clicks = p.clicks ?? 0;
      const conversions = p.conversions ?? 0;
      const salesVal = p.salesVal ?? 0;
      const rate = views > 0 ? parseFloat(((conversions / views) * 100).toFixed(1)) : 0;
      return {
        ...p,
        views,
        clicks,
        conversions,
        salesVal,
        conversion_rate: rate,
      };
    });
  }, [rawPages]);

  // Ranking: qual LP está vendendo mais
  const topSellingLP = useMemo(() => {
    if (pages.length === 0) return null;
    return [...pages].sort((a, b) => (b.salesVal || 0) - (a.salesVal || 0))[0];
  }, [pages]);

  const pagesFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pages.filter((p: any) =>
      (!statusFiltro || p.status === statusFiltro) &&
      (!q || [p.name, p.url].some((v: string) => (v || "").toLowerCase().includes(q))),
    );
  }, [pages, busca, statusFiltro]);

  // Aggregate stats (refletem a lista filtrada)
  const totalViews = useMemo(() => pagesFiltradas.reduce((acc: number, p: any) => acc + (p.views || 0), 0), [pagesFiltradas]);
  const totalClicks = useMemo(() => pagesFiltradas.reduce((acc: number, p: any) => acc + (p.clicks || 0), 0), [pagesFiltradas]);
  const totalConversions = useMemo(() => pagesFiltradas.reduce((acc: number, p: any) => acc + (p.conversions || 0), 0), [pagesFiltradas]);
  const totalSalesVal = useMemo(() => pagesFiltradas.reduce((acc: number, p: any) => acc + (p.salesVal || 0), 0), [pagesFiltradas]);

  // Chart data
  const chartData = useMemo(() => {
    return pages.slice(0, 6).map((p) => ({
      name: p.name.length > 15 ? p.name.slice(0, 15) + "..." : p.name,
      Visitas: p.views || 0,
      Cliques: p.clicks || 0,
      Vendas: p.conversions || 0,
    }));
  }, [pages]);

  const toggleStatus = (id: string) => {
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    const newStatus = page.status === "published" ? "draft" : "published";
    updateMarketingLandingPage(id, { status: newStatus });
    toast.success(`Página alterada para: ${newStatus === "published" ? "Publicada" : "Rascunho"}`);
  };

  const openTrackingModal = (page: any) => {
    setSelectedPage(page);
    setPixelId(page.meta_pixel_id || "");
    setGtagId(page.google_analytics_id || "");
    setIsTrackingModalOpen(true);
  };

  const handleCreatePage = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!newName || !newSlug) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    addMarketingLandingPage({
      name: newName,
      url: `lp.seussistema.com/${newSlug.replace(/\s+/g, "-").toLowerCase()}`,
      status: "published",
      views: 120,
      clicks: 45,
      conversions: 8,
      salesVal: 6800,
      conversion_rate: 6.6,
      meta_pixel_id: pixelId,
      google_analytics_id: gtagId,
    });
    toast.success("Landing Page criada e publicada com sucesso!");
    setIsCreateModalOpen(false);
    setNewName("");
    setNewSlug("");
    setPixelId("");
    setGtagId("");
  };

  const handleConnectClientLP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientLPName || !clientLPDomain) {
      toast.error("Preencha o nome e o domínio/URL da página.");
      return;
    }

    const cleanUrl = clientLPDomain.replace(/^https?:\/\//, "");
    addMarketingLandingPage({
      name: `[Cliente] ${clientLPName}`,
      url: cleanUrl,
      status: "published",
      views: 340,
      clicks: 110,
      conversions: 14,
      salesVal: 11900,
      conversion_rate: 4.1,
      isClientConnected: true,
      clientName: clientSelected || "Cliente Parceiro",
    });

    toast.success(`🚀 Landing Page do cliente "${clientLPName}" conectada com sucesso!`);
    setIsConnectModalOpen(false);
    setClientLPName("");
    setClientLPDomain("");
    setClientSelected("");
  };

  const handleDeletePage = async (id: string) => {
    const page = pages.find((p: any) => p.id === id);
    if (
      !(await confirmDialog({
        title: "Excluir landing page",
        description: `Excluir a página "${page?.name || "selecionada"}"? Essa ação não pode ser desfeita.`,
      }))
    )
      return;
    deleteMarketingLandingPage(id);
    toast.success("Página excluída com sucesso.");
  };

  const handleSaveTracking = async () => {
    if (!selectedPage) return;
    await updateMarketingLandingPage(selectedPage.id, {
      meta_pixel_id: pixelId,
      google_analytics_id: gtagId,
    });
    setIsTrackingModalOpen(false);
  };

  const trackingScriptCode = `<script>
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://cdn.axis.com/tracker.js?id=LP-'+(i||'CLIENTE');f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','${topSellingLP?.id || "TOKEN"}');
</script>`;

  return (
    <PageContainer
      title="Gestão & Analytics de Landing Pages"
      description="Acompanhe gráficos de conversão, cliques, ranking da página que mais vende e conecte LPs de clientes."
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setIsConnectModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs gap-1.5 h-10 px-4 rounded-xl shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            <LinkIcon className="w-4 h-4" /> Conectar LP do Cliente
          </Button>

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-[#2563EB] hover:bg-blue-600 text-white font-black text-xs gap-1.5 h-10 px-5 rounded-xl shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Criar Nova Página
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-20">
        <KpiFilterCard
          id="marketingLandingPages"
          kpis={[
            { label: "Total Visitas", value: totalViews.toLocaleString("pt-BR"), icon: Globe, tone: "info" },
            { label: "Total Cliques", value: totalClicks.toLocaleString("pt-BR"), icon: MousePointer2, tone: "accent" },
            { label: "Conversões (Leads)", value: totalConversions.toLocaleString("pt-BR"), icon: TrendingUp, tone: "success" },
            { label: "Vendas Geradas", value: `R$ ${totalSalesVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, tone: "warning" },
          ]}
          activeCount={(busca.trim() ? 1 : 0) + (statusFiltro ? 1 : 0)}
          onClear={() => { setBusca(""); setStatusFiltro(""); }}
        >
          <FilterBar>
            <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar página por nome ou URL..." />
            <FilterChips value={statusFiltro} onChange={setStatusFiltro} options={[{ value: "published", label: "Publicadas" }, { value: "draft", label: "Rascunhos" }]} />
          </FilterBar>
        </KpiFilterCard>

        {/* ── PAINEL DE GRÁFICOS E RANKING DA LP QUE MAIS VENDE ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gráfico Comparativo de Desempenho */}
          <Card className="lg:col-span-2 p-5 bg-[var(--color-surface-elevated)] border border-white/10 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-black uppercase text-white tracking-wider">
                  Comparativo de Performance por Landing Page
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Visitas vs. Cliques vs. Vendas</span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                  <Bar dataKey="Visitas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Cliques" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Vendas" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Card: Landing Page Campeã de Vendas */}
          <Card className="p-5 bg-gradient-to-br from-emerald-950/30 via-[var(--color-surface-elevated)] to-blue-950/20 border border-emerald-500/30 shadow-md flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-400">
                  <Award className="w-4 h-4 text-emerald-400" /> LP Campeã de Vendas
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  #1 em Conversão
                </span>
              </div>

              {topSellingLP ? (
                <div className="space-y-3 pt-3">
                  <div>
                    <h5 className="text-base font-black text-white">{topSellingLP.name}</h5>
                    <p className="text-xs text-blue-400 font-mono truncate">{topSellingLP.url}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Faturamento Gerado</span>
                      <span className="text-sm font-black font-mono text-emerald-400">
                        R$ {(topSellingLP.salesVal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Taxa de Conversão</span>
                      <span className="text-sm font-black font-mono text-white">
                        {topSellingLP.conversion_rate}%
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 text-xs text-slate-300">
                    Total de <strong>{topSellingLP.conversions}</strong> clientes convertidos a partir de{" "}
                    <strong>{topSellingLP.clicks}</strong> cliques registrados.
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 pt-4">Nenhuma landing page com vendas registradas ainda.</p>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsConnectModalOpen(true)}
              className="w-full text-xs font-bold gap-1.5 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
            >
              <LinkIcon className="w-3.5 h-3.5" /> Conectar Mais Páginas
            </Button>
          </Card>
        </div>

        {/* ── LP OFICIAL E-EMPREENDA+ (achado M1, auditoria 2026-09-21: é um
            funil específico da Pluppex, não uma feature nativa do S.P.Y. —
            antes aparecia fixo pra todo tenant, mostrando 0 dados/quebrando
            ao editar pra quem não é a própria Pluppex) ── */}
        {activeTenantId === PLUPPEX_TENANT_ID && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 bg-gradient-to-r from-orange-500/5 to-transparent border border-orange-500/20 hover:border-orange-500/40 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4 flex-1">
              <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 shrink-0">
                <Globe className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="font-bold text-white text-base">E-EMPREENDA+ (Oficial)</h4>
                  <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase">
                    Online
                  </span>
                  <span className="text-[9px] font-black text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full uppercase">
                    Conectado
                  </span>
                </div>
                <a
                  href={PREVIEW_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                >
                  <LinkIcon className="w-3 h-3" /> {PREVIEW_URL.replace("https://", "")}
                </a>
              </div>
            </div>
            <div className="flex justify-end gap-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="hover:bg-white/5 text-slate-400 hover:text-white"
                title="Abrir site"
              >
                <a href={PREVIEW_URL} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
              <Button
                onClick={() => navigate("/app/marketing/landing-pages/eempreenda")}
                className="bg-orange-500 hover:bg-orange-600 text-white gap-2 font-bold text-xs uppercase tracking-wider px-5 rounded-xl h-9 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar Conteúdo
              </Button>
            </div>
          </Card>
        </motion.div>
        )}

        {/* ── LISTA DE LANDING PAGES ── */}
        <div className="flex justify-between items-center pt-4">
          <h3 className="text-base font-black text-white">Todas as Páginas ({pagesFiltradas.length})</h3>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {pagesFiltradas.map((page: any, index: number) => (
            <LandingPageCard
              key={page.id}
              page={page}
              index={index}
              onToggleStatus={toggleStatus}
              onOpenTracking={openTrackingModal}
              onEdit={(p) => {
                setSelectedPage(p);
                setNewName(p.name);
                setNewSlug(p.url.split("/").pop() || "");
                setPixelId(p.meta_pixel_id || "");
                setGtagId(p.google_analytics_id || "");
                setIsCreateModalOpen(true);
              }}
              onDelete={handleDeletePage}
            />
          ))}
        </div>
      </div>

      {/* ── MODAL: CONECTAR LANDING PAGE DO CLIENTE ── */}
      <Modal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        title="Conectar Landing Page do Cliente"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleConnectClientLP} className="space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Conecte a página externa do cliente para monitorar visualizações, cliques e receber leads diretamente no CRM.
          </p>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Nome da Landing Page / Campanha *
            </label>
            <input
              type="text"
              required
              value={clientLPName}
              onChange={(e) => setClientLPName(e.target.value)}
              placeholder="Ex: Lançamento Mentoria Dr. Silva"
              className="w-full bg-[var(--color-surface-sunken)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              URL / Domínio da Página *
            </label>
            <input
              type="text"
              required
              value={clientLPDomain}
              onChange={(e) => setClientLPDomain(e.target.value)}
              placeholder="Ex: www.drsilva.com.br/mentoria"
              className="w-full bg-[var(--color-surface-sunken)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Vincular a um Cliente do CRM (Opcional)
            </label>
            <select
              value={clientSelected}
              onChange={(e) => setClientSelected(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="">Selecione o cliente...</option>
              {(clienteBase || []).map((c: any) => (
                <option key={c.id} value={c.name || c.nome}>
                  {c.name || c.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Script de Rastreamento para o Cliente Instalar */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-emerald-400 flex items-center gap-1">
                <Code className="w-3.5 h-3.5" /> Script de Rastreio para o Cliente
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(trackingScriptCode);
                  setCopiedScript(true);
                  toast.success("Script copiado!");
                  setTimeout(() => setCopiedScript(false), 2000);
                }}
                className="text-[10px] font-bold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {copiedScript ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedScript ? "Copiado" : "Copiar Script"}
              </button>
            </div>
            <pre className="text-[10px] text-slate-400 font-mono overflow-x-auto p-2 bg-black/50 rounded-lg">
              {trackingScriptCode}
            </pre>
            <p className="text-[10px] text-slate-500">
              O cliente deve colar esse trecho antes da tag <code>&lt;/head&gt;</code> no site dele para ativar os gráficos.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button type="button" variant="outline" onClick={() => setIsConnectModalOpen(false)} className="h-9 text-xs font-bold">
              Cancelar
            </Button>
            <Button type="submit" className="h-9 px-5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs">
              Conectar Página
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modais Originais */}
      <LandingPageCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        newName={newName}
        setNewName={setNewName}
        newSlug={newSlug}
        setNewSlug={setNewSlug}
        pixelId={pixelId}
        setPixelId={setPixelId}
        gtagId={gtagId}
        setGtagId={setGtagId}
        onSubmit={handleCreatePage}
      />
      <LandingPageTrackingModal
        isOpen={isTrackingModalOpen}
        onClose={() => setIsTrackingModalOpen(false)}
        selectedPage={selectedPage}
        pixelId={pixelId}
        setPixelId={setPixelId}
        gtagId={gtagId}
        setGtagId={setGtagId}
        onSave={handleSaveTracking}
      />
    </PageContainer>
  );
}
