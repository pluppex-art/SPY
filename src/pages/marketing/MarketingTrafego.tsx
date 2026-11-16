import { useMemo, useState } from "react";
import { Plus, Calendar, Columns3, Megaphone, DollarSign, Rocket, CalendarCheck, Share2, Layers, Loader2, Database } from "lucide-react";
import { DragDropContext } from "@hello-pangea/dnd";
import { PageContainer } from "../../components/PageContainer";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { useLocalization } from "../../contexts/LocalizationContext";
import { useMarketingTrafego, type Campanha } from "./useMarketingTrafego";
import { TrafegoColumn } from "./components/TrafegoColumn";
import { CampanhaModal } from "./components/CampanhaModal";
import { ConteudoCalendario } from "./components/ConteudoCalendario";

/** Gestão de Tráfego Pago: campanhas de anúncios em quadro (por etapa) ou em calendário (por data de início). */
export default function MarketingTrafego() {
  const { campanhas, colunas, carregando, erro, criar, atualizar, excluir, aoArrastar } = useMarketingTrafego();
  const { formatCurrency } = useLocalization();
  const [visao, setVisao] = useState<"quadro" | "calendario">("quadro");
  const [busca, setBusca] = useState("");
  const [plataforma, setPlataforma] = useState("");
  const [etapa, setEtapa] = useState("");
  const [modal, setModal] = useState<{ campanha: Campanha | null; data?: string } | null>(null);

  const plataformas = useMemo(() => Array.from(new Set(campanhas.map((c) => c.platform))).sort(), [campanhas]);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return campanhas.filter((c) =>
      (!plataforma || c.platform === plataforma) &&
      (!etapa || c.colId === etapa) &&
      (!q || [c.title, c.desc, c.platform].some((v) => (v || "").toLowerCase().includes(q))),
    );
  }, [campanhas, busca, plataforma, etapa]);
  const colunasVisiveis = etapa ? colunas.filter((c) => c.id === etapa) : colunas;
  const noAr = colunas.find((c) => c.id === "no_ar");
  const orcamentoTotal = filtradas.reduce((s, c) => s + (c.value || 0), 0);

  const salvar = async (dados: Omit<Campanha, "id" | "date">, id?: string) => (id ? atualizar(id, dados) : criar(dados));

  return (
    <PageContainer
      title="Gestão de Tráfego Pago"
      subtitle="Planeje e acompanhe as campanhas de anúncios: onde rodam, quanto investem e em que etapa estão. Use o quadro para ver por etapa ou o calendário para ver por data de início."
    >
      {erro === "tabela" ? (
        <EmptyState
          icon={Database}
          title="Falta criar a tabela de campanhas"
          description="Esta tela precisa de uma tabela nova no banco de dados. Peça para a equipe técnica aplicar a migração 20261117_marketing_trafego e recarregue a página."
        />
      ) : (
        <>
          <KpiFilterCard
            id="marketingTrafego"
            className="mb-6"
            kpis={[
              { label: "Campanhas", value: filtradas.length, icon: Megaphone, tone: "primary" },
              { label: "Orçamento total", value: formatCurrency(orcamentoTotal), icon: DollarSign, tone: "info", hint: "Soma do orçamento de todas as campanhas listadas." },
              { label: noAr?.title ?? "No Ar", value: filtradas.filter((c) => c.colId === "no_ar").length, icon: Rocket, tone: "success", hint: "Campanhas que estão rodando agora." },
              { label: "Com data de início", value: filtradas.filter((c) => c.publishDateISO).length, icon: CalendarCheck, tone: "accent" },
            ]}
            activeCount={(busca.trim() ? 1 : 0) + (plataforma ? 1 : 0) + (etapa ? 1 : 0)}
            onClear={() => { setBusca(""); setPlataforma(""); setEtapa(""); }}
          >
            <FilterBar>
              <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar campanha, objetivo ou plataforma..." />
              <FilterSelect icon={Share2} value={plataforma} onChange={setPlataforma} options={plataformas} allLabel="Todas as plataformas" />
              <FilterSelect icon={Layers} value={etapa} onChange={setEtapa} options={colunas.map((c) => ({ value: c.id, label: c.title }))} allLabel="Todas as etapas" />
            </FilterBar>
          </KpiFilterCard>

          <div className="flex items-center gap-4 mb-6 overflow-x-auto pb-2 scrollbar-none">
            <Button onClick={() => setModal({ campanha: null })} className="text-xs font-bold gap-2 shrink-0">
              <Plus className="w-4 h-4" /> Nova Campanha
            </Button>
            <div className="flex items-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] h-10 shrink-0">
              {([
                { id: "quadro" as const, label: "Quadro", icon: Columns3 },
                { id: "calendario" as const, label: "Calendário", icon: Calendar },
              ]).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVisao(v.id)}
                  aria-pressed={visao === v.id}
                  className={`flex items-center gap-1.5 px-3.5 h-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer border-none first:rounded-l-[calc(var(--radius-control)-1px)] last:rounded-r-[calc(var(--radius-control)-1px)] ${
                    visao === v.id ? "bg-[var(--color-primary-blue)] !text-white shadow-xs" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-transparent"
                  }`}
                >
                  <v.icon className="w-3.5 h-3.5" /> {v.label}
                </button>
              ))}
            </div>
          </div>

          {carregando ? (
            <div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-faint)]" /></div>
          ) : erro ? (
            <Card className="p-6 text-sm text-rose-600">Não foi possível carregar as campanhas: {erro}</Card>
          ) : visao === "calendario" ? (
            <ConteudoCalendario
              tasks={filtradas}
              colunas={colunas}
              rotulo={{ singular: "campanha", plural: "campanhas" }}
              onOpenTask={(c) => setModal({ campanha: c as Campanha })}
              onNovaPauta={(data) => setModal({ campanha: null, data })}
            />
          ) : (
            <div id="app-marketing-trafego-kanban-board" className="w-full flex-1 flex flex-col min-h-0">
              <DragDropContext onDragEnd={aoArrastar}>
                <div className="flex gap-5 overflow-x-auto min-h-[500px] scrollbar-thin pb-6 flex-1 items-start">
                  {colunasVisiveis.map((col) => (
                    <TrafegoColumn key={col.id} col={col} campanhas={filtradas} onOpen={(c) => setModal({ campanha: c })} />
                  ))}
                </div>
              </DragDropContext>
            </div>
          )}

          <CampanhaModal
            isOpen={modal !== null}
            onClose={() => setModal(null)}
            colunas={colunas}
            campanha={modal?.campanha ?? null}
            dataInicial={modal?.data}
            onSalvar={salvar}
            onExcluir={excluir}
          />
        </>
      )}
    </PageContainer>
  );
}
