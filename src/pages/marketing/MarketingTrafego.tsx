import { useMemo, useState } from "react";
import { Plus, Calendar, Columns3, Megaphone, DollarSign, Rocket, CalendarCheck, Share2, Layers, Loader2, Database, User } from "lucide-react";
import { DragDropContext } from "@hello-pangea/dnd";
import { PageContainer } from "../../components/PageContainer";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, usePeriodoIndicadores } from "../../components/ui/kpi-filter-card";
import { Button } from "../../components/ui/button";
import { ViewToggle, HEADER_ACTIONS, HEADER_PRIMARY_BUTTON } from "../../components/ui/view-toggle";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { useLocalization } from "../../contexts/LocalizationContext";
import { useMarketingTrafego, type Campanha } from "./useMarketingTrafego";
import { TrafegoColumn } from "./components/TrafegoColumn";
import { CampanhaModal } from "./components/CampanhaModal";
import { CampanhaDetalhesPainel } from "./components/CampanhaDetalhesPainel";
import { ConteudoCalendario } from "./components/ConteudoCalendario";

/** Gestão de Tráfego Pago: campanhas de anúncios em quadro (por etapa) ou em calendário (por data de início). */
export default function MarketingTrafego() {
  const { campanhas, colunas, carregando, erro, criar, atualizar, excluir, aoArrastar } = useMarketingTrafego();
  const { formatCurrency } = useLocalization();
  const [visao, setVisao] = useState<"quadro" | "calendario">("quadro");
  const [busca, setBusca] = useState("");
  const [plataforma, setPlataforma] = useState("");
  const [etapa, setEtapa] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [modal, setModal] = useState<{ data?: string; etapa?: string } | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const plataformas = useMemo(() => Array.from(new Set(campanhas.map((c) => c.platform))).sort(), [campanhas]);
  const responsaveis = useMemo(() => Array.from(new Set(campanhas.map((c) => c.responsavel).filter(Boolean))).sort(), [campanhas]);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return campanhas.filter((c) =>
      (!plataforma || c.platform === plataforma) &&
      (!etapa || c.colId === etapa) &&
      (!responsavel || c.responsavel === responsavel) &&
      (!q || [c.title, c.desc, c.platform].some((v) => (v || "").toLowerCase().includes(q))),
    );
  }, [campanhas, busca, plataforma, etapa, responsavel]);
  const colunasVisiveis = etapa ? colunas.filter((c) => c.id === etapa) : colunas;
  const noAr = colunas.find((c) => c.id === "no_ar");
  const periodo = usePeriodoIndicadores("data de criação da campanha");
  const base = periodo.filtrar(filtradas, (c) => c.createdAt);
  const orcamentoTotal = base.reduce((s, c) => s + (c.value || 0), 0);

  const salvar = async (dados: Omit<Campanha, "id" | "date">, id?: string) => (id ? atualizar(id, dados) : criar(dados));

  return (
    <PageContainer
      title="Gestão de Tráfego Pago"
      subtitle="Planeje e acompanhe as campanhas de anúncios: onde rodam, quanto investem e em que etapa estão. Use o quadro para ver por etapa ou o calendário para ver por data de início."
      actions={erro === "tabela" ? undefined : (
        <div className={HEADER_ACTIONS}>
          <ViewToggle value={visao} onChange={setVisao} options={[{ id: "quadro", label: "Quadro", icon: Columns3 }, { id: "calendario", label: "Calendário", icon: Calendar }]} />
          <Button onClick={() => setModal({})} className={HEADER_PRIMARY_BUTTON}>
            <Plus className="w-4 h-4" /> Nova Campanha
          </Button>
        </div>
      )}
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
            periodo={periodo}
            className="mb-4"
            kpis={[
              { label: "Campanhas", value: base.length, icon: Megaphone, tone: "primary" },
              { label: "Orçamento total", value: formatCurrency(orcamentoTotal), icon: DollarSign, tone: "info", hint: "Soma do orçamento de todas as campanhas listadas." },
              { label: noAr?.title ?? "No Ar", value: base.filter((c) => c.colId === "no_ar").length, icon: Rocket, tone: "success", hint: "Campanhas que estão rodando agora." },
              { label: "Com data de início", value: base.filter((c) => c.publishDateISO).length, icon: CalendarCheck, tone: "accent" },
            ]}
            activeCount={(busca.trim() ? 1 : 0) + (plataforma ? 1 : 0) + (etapa ? 1 : 0) + (responsavel ? 1 : 0)}
            onClear={() => { setBusca(""); setPlataforma(""); setEtapa(""); setResponsavel(""); }}
          >
            <FilterBar>
              <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar campanha, objetivo ou plataforma..." />
              <FilterSelect icon={Share2} value={plataforma} onChange={setPlataforma} options={plataformas} allLabel="Todas as plataformas" />
              <FilterSelect icon={Layers} value={etapa} onChange={setEtapa} options={colunas.map((c) => ({ value: c.id, label: c.title }))} allLabel="Todas as etapas" />
              <FilterSelect icon={User} value={responsavel} onChange={setResponsavel} options={responsaveis} allLabel="Todos os responsáveis" />
            </FilterBar>
          </KpiFilterCard>

          {carregando ? (
            <div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-faint)]" /></div>
          ) : erro ? (
            <Card className="p-6 text-sm text-rose-600">Não foi possível carregar as campanhas: {erro}</Card>
          ) : visao === "calendario" ? (
            <ConteudoCalendario
              tasks={filtradas}
              colunas={colunas}
              rotulo={{ singular: "campanha", plural: "campanhas" }}
              onOpenTask={(c) => setDetalheId((c as Campanha).id)}
              onNovaPauta={(data) => setModal({ data })}
            />
          ) : (
            <div id="app-marketing-trafego-kanban-board" className="w-full flex-1 flex flex-col min-h-0">
              <DragDropContext onDragEnd={aoArrastar}>
                <div className="flex gap-5 overflow-x-auto min-h-[500px] scrollbar-thin pb-6 flex-1 items-start">
                  {colunasVisiveis.map((col) => (
                    <TrafegoColumn key={col.id} col={col} campanhas={filtradas} todas={filtradas} onOpen={(c) => setDetalheId(c.id)} onNova={(etapaId) => setModal({ etapa: etapaId })} />
                  ))}
                </div>
              </DragDropContext>
            </div>
          )}

          <CampanhaDetalhesPainel
            campanha={campanhas.find((c) => c.id === detalheId) ?? null}
            campanhas={campanhas}
            colunas={colunas}
            onClose={() => setDetalheId(null)}
            onAtualizar={(id, patch) => atualizar(id, patch)}
            onSalvarCampanha={salvar}
            onExcluir={excluir}
          />

          <CampanhaModal
            isOpen={modal !== null}
            onClose={() => setModal(null)}
            colunas={colunas}
            dataInicial={modal?.data}
            etapaInicial={modal?.etapa}
            onSalvar={salvar}
          />
        </>
      )}
    </PageContainer>
  );
}
