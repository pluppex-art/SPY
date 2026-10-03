import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FileText, Trash2, ClipboardList, ArrowLeft, Check, Loader2, PartyPopper, Link2, Copy, RefreshCw, Gauge, ListChecks, CalendarClock, Building2, StickyNote, FormInput } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { EmptyState } from "../../components/ui/empty-state";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { ImplementationProgressBar } from "../../components/implementacao/ImplementationProgressBar";
import { ImplementationSectionForm } from "../../components/implementacao/ImplementationFormFields";
import { StatCell, StatCellRow } from "../finance/components/StatCell";
import { sectionIcon } from "../../components/implementacao/sectionIcons";
import { tenantReadiness } from "../../lib/implementationTenant";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { TenantLinkCard } from "../../components/implementacao/TenantLinkCard";
import { CreateTenantCard } from "../../components/implementacao/CreateTenantCard";
import { RemoteIntegrationsPanel } from "../../components/implementacao/RemoteIntegrationsPanel";
import { syncImplementationTenant } from "../../lib/implementationTenantApi";
import { cn } from "../../lib/utils";
import {
  IMPLEMENTATION_SECTIONS, IMPLEMENTATION_STATUSES, IMPLEMENTATION_STATUS_TONE, computeProgress,
  type ImplData, type ImplementationStatus,
} from "../../lib/implementationForm";
import { useImplementationStages } from "../os/hooks/useImplementationStages";

const inputCls =
  "w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]";

export default function ImplementacaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { implementations, clienteBase, updateImplementation, deleteImplementation, updateClienteBase, updateLead } = useData();
  const { user } = useAuth();

  const impl = (implementations as any[]).find((i) => i.id === id);
  const cliente = impl ? (clienteBase as any[]).find((c) => c.id === impl.cliente_id) : null;

  // Mesma fonte de etapas da lista (ver Implementacoes.tsx / useImplementationStages) — quando
  // resolve (funil da Ordem de Serviço, ou funil do Pipeline com lead vinculado), o status de 4
  // opções abaixo dá lugar à etapa real do funil desta implementação.
  const etapas = useImplementationStages();
  const implementacaoStages = impl ? etapas.stagesDe(impl) : [];
  const stageInfo = impl ? etapas.getInfo(impl) : null;

  const [data, setData] = useState<ImplData>({});
  const [createdHere, setCreatedHere] = useState(false);
  const [notes, setNotes] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [activeSection, setActiveSection] = useState(IMPLEMENTATION_SECTIONS[0].id);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [linkOpen, setLinkOpen] = useState(false);
  // Abas: o formulário é o trabalho do dia a dia; ambiente do cliente (só master) e notas ficam à parte.
  const [tab, setTab] = useState<"form" | "ambiente" | "notas">("form");
  // Dispara a abertura automática do "Criar ambiente do cliente" (ver CreateTenantCard)
  // — muda de valor tanto ao marcar "Concluída" aqui nesta tela quanto ao chegar
  // vindo de Implementacoes.tsx (Kanban) via "?abrirAmbiente=1".
  const [autoOpenSignal, setAutoOpenSignal] = useState<number | undefined>(undefined);

  // Chegou aqui com o status acabado de virar "Concluída" em outra tela (Kanban de
  // Implementacoes.tsx) — mesma condição do changeStatus abaixo, só que lendo
  // direto de impl.data (o estado local `data` só hidrata num efeito separado,
  // levaria uma volta de render a mais pra existir).
  useEffect(() => {
    if (searchParams.get("abrirAmbiente") !== "1" || !impl || !user?.isMaster) return;
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete("abrirAmbiente"); return next; }, { replace: true });
    if (!impl.linked_tenant_id && tenantReadiness(impl.data || {}).ready) {
      setTab("ambiente");
      setAutoOpenSignal(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, impl?.id, impl?.linked_tenant_id, user?.isMaster]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ImplData | null>(null);
  const initializedFor = useRef<string | null>(null);

  // Inicializa o estado local UMA vez por implementação — depois disso o estado
  // local é a fonte da tela (o refetch em tempo real não sobrescreve o que a
  // pessoa está digitando).
  useEffect(() => {
    if (impl && initializedFor.current !== impl.id) {
      initializedFor.current = impl.id;
      setData(impl.data || {});
      setNotes(impl.internal_notes || "");
      setResponsavel(impl.responsavel || "");
    }
  }, [impl]);

  // Reflete mudanças feitas de fora (o cliente pelo link público, a Aurora) —
  // só quando não há edição local pendente, pra nunca atropelar o que está sendo digitado.
  useEffect(() => {
    if (!impl || initializedFor.current !== impl.id || pending.current) return;
    const incoming = impl.data || {};
    setData((prev) => (JSON.stringify(prev) === JSON.stringify(incoming) ? prev : incoming));
  }, [impl?.data]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!pending.current || !impl) return;
    const toSave = pending.current;
    pending.current = null;
    setSaveState("saving");
    await updateImplementation(impl.id, { data: toSave });
    setSaveState("saved");
  }, [impl?.id, updateImplementation]);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { flushRef.current(); }, []);

  // Vários campos podem mudar no mesmo instante (ex.: consulta de CNPJ preenche 5 campos de uma vez):
  // parte sempre do último snapshot local, não do `data` da render — senão só o último campo ficaria.
  const dataRef = useRef(data);
  dataRef.current = data;
  const handleFieldChange = (fieldId: string, value: any) => {
    const next = { ...(pending.current ?? dataRef.current), [fieldId]: value };
    if (value === undefined) delete next[fieldId];
    dataRef.current = next;
    setData(next);
    pending.current = next;
    setSaveState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 700);
  };

  if (!impl) {
    return (
      <PageContainer title="Implementação" breadcrumb={[{ label: "CRM & Vendas" }, { label: "Implementações", path: "/app/crm/implementacoes" }, { label: "Detalhe" }]}>
        <EmptyState
          icon={ClipboardList}
          title="Implementação não encontrada"
          description="Ela pode ainda estar carregando ou ter sido removida."
          action={<Link to="/app/crm/implementacoes"><Button variant="outline" className="h-9 px-4 text-xs gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</Button></Link>}
        />
      </PageContainer>
    );
  }

  const { overall, sections } = computeProgress(data);
  const section = IMPLEMENTATION_SECTIONS.find((s) => s.id === activeSection) || IMPLEMENTATION_SECTIONS[0];
  const status = impl.status as ImplementationStatus;

  const changeStatus = async (next: ImplementationStatus) => {
    const patch: Record<string, any> = { status: next };
    if (next === "Concluída") {
      patch.completed_at = new Date().toISOString();
      if (cliente?.status === "Em Implantação") await updateClienteBase(cliente.id, { status: "Ativo" });
    } else if (status === "Concluída") {
      patch.completed_at = null;
      if (cliente?.status === "Ativo") await updateClienteBase(cliente.id, { status: "Em Implantação" });
    }
    await updateImplementation(impl.id, patch);

    // Conecta com o provisionamento real: concluiu, os dados mínimos já estão
    // prontos e o ambiente ainda não existe → abre o "Criar ambiente do
    // cliente" já preenchido (ver CreateTenantCard/autoOpenSignal) em vez de
    // depender de alguém lembrar de entrar na aba e clicar manualmente.
    if (next === "Concluída" && user?.isMaster && !impl.linked_tenant_id && readiness.ready) {
      setTab("ambiente");
      setAutoOpenSignal(Date.now());
    }
  };

  // Mesma ação, mas movendo a ETAPA do lead vinculado (funil espelhado do
  // Pipeline) em vez do status manual — usada quando `stageInfo` resolve.
  const changeStage = async (nextStageId: string) => {
    const { isLast } = await etapas.move(impl, cliente, nextStageId, {
      updateLead, updateImplementation, updateClienteBase,
    });
    if (isLast && user?.isMaster && !impl.linked_tenant_id && readiness.ready) {
      setTab("ambiente");
      setAutoOpenSignal(Date.now());
    }
  };

  const readiness = tenantReadiness(data);
  const etapasComItens = IMPLEMENTATION_SECTIONS.filter((s) => sections[s.id]?.total > 0).length;
  const etapasCompletas = IMPLEMENTATION_SECTIONS.filter((s) => sections[s.id]?.total > 0 && sections[s.id].percent >= 100).length;
  const goLive = (() => {
    if (!impl.go_live_date) return { text: "Defina a data prevista", late: false };
    if (status === "Concluída") return { text: "Implementação concluída", late: false };
    const dias = Math.round((new Date(impl.go_live_date + "T12:00:00").getTime() - new Date(new Date().toISOString().slice(0, 10) + "T12:00:00").getTime()) / 86400000);
    if (dias < 0) return { text: `Atrasada há ${-dias} dia${dias === -1 ? "" : "s"}`, late: true };
    if (dias === 0) return { text: "É hoje", late: false };
    return { text: `Faltam ${dias} dia${dias === 1 ? "" : "s"}`, late: false };
  })();

  const clientLink = `${window.location.origin}/implantacao/${impl.share_token}`;
  const copyText = async (text: string, okMsg: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(okMsg); } catch { toast.error("Não foi possível copiar."); }
  };
  const regenerateLink = async () => {
    if (!(await confirmDialog({ title: "Gerar novo link", description: "O link atual deixa de funcionar imediatamente. Quem já recebeu precisará do novo." }))) return;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    await updateImplementation(impl.id, { share_token: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") });
    toast.success("Novo link gerado.");
  };

  const handleDelete = async () => {
    if (!(await confirmDialog({ title: "Excluir implementação", description: `Excluir a implementação de "${cliente?.name || "este cliente"}"? Todas as respostas do formulário serão perdidas.` }))) return;
    await flush();
    if (cliente?.status === "Em Implantação") await updateClienteBase(cliente.id, { status: "Ativo" });
    await deleteImplementation(impl.id);
    toast.success("Implementação excluída.");
    navigate("/app/crm/implementacoes");
  };

  return (
    <PageContainer
      title={cliente?.name || "Implementação"}
      description="Preencha o formulário conforme a implantação avança — salva automaticamente."
      breadcrumb={[{ label: "CRM & Vendas" }, { label: "Implementações", path: "/app/crm/implementacoes" }, { label: cliente?.name || "Detalhe" }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-[var(--color-text-faint)] flex items-center gap-1 w-20 justify-end">
            {saveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Salvando…</>}
            {saveState === "saved" && <><Check className="w-3 h-3 text-emerald-500" /> Salvo</>}
          </span>
          {stageInfo ? (
            <select
              value={stageInfo.stage.id}
              onChange={(e) => changeStage(e.target.value)}
              title={etapas.origem === "os" ? `Etapa no funil "${etapas.nomeFunil}" da Ordem de Serviço` : "Etapa no funil de Implementação (espelhado do Pipeline)"}
              className={cn("h-9 px-3 rounded-[var(--radius-control)] text-xs font-bold border cursor-pointer bg-transparent", IMPLEMENTATION_STATUS_TONE[status])}
            >
              {implementacaoStages.map((s) => <option key={s.id} value={s.id} className="text-[var(--color-text-primary)] bg-[var(--color-surface-elevated)]">{s.name}</option>)}
            </select>
          ) : (
            <select
              value={status}
              onChange={(e) => changeStatus(e.target.value as ImplementationStatus)}
              className={cn("h-9 px-3 rounded-[var(--radius-control)] text-xs font-bold border cursor-pointer bg-transparent", IMPLEMENTATION_STATUS_TONE[status])}
            >
              {IMPLEMENTATION_STATUSES.map((s) => <option key={s} value={s} className="text-[var(--color-text-primary)] bg-[var(--color-surface-elevated)]">{s}</option>)}
            </select>
          )}
          <Button variant="outline" onClick={() => setLinkOpen(true)} className="h-9 px-4 text-xs font-medium gap-1.5"><Link2 className="w-3.5 h-3.5" /> Link do cliente</Button>
          <Link to={`/app/crm/implementacoes/${impl.id}/relatorio`}>
            <Button variant="outline" className="h-9 px-4 text-xs font-medium gap-1.5"><FileText className="w-3.5 h-3.5" /> Relatório</Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-5 max-w-[1700px] mx-auto pb-12">
        {/* Visão geral */}
        <StatCellRow>
          <StatCell label="Progresso geral" value={`${overall.percent}%`} icon={Gauge} tone={overall.percent >= 100 ? "success" : "neutral"} hint={`${overall.done} de ${overall.total} itens acompanhados`} />
          <StatCell label="Etapas completas" value={`${etapasCompletas} de ${etapasComItens}`} icon={ListChecks} hint="Seções com todos os itens prontos" />
          <StatCell
            label="Go-live"
            value={impl.go_live_date ? new Date(impl.go_live_date + "T12:00:00").toLocaleDateString("pt-BR") : "Sem data"}
            icon={CalendarClock}
            tone={goLive.late ? "danger" : "neutral"}
            hint={goLive.text}
          />
          <StatCell
            label="Ambiente do cliente"
            value={impl.linked_tenant_id ? "Criado" : "Não criado"}
            icon={Building2}
            tone={impl.linked_tenant_id ? "success" : readiness.ready ? "warning" : "neutral"}
            hint={impl.linked_tenant_id ? "Vinculado a esta implementação" : readiness.ready ? "Dados completos — pode criar" : `Faltam ${readiness.missing.length} dado(s)`}
          />
        </StatCellRow>

        <Card className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_260px_200px] gap-4 items-end">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Andamento</span>
                <span className="text-xs font-black tabular-nums text-[var(--color-text-primary)]">{overall.percent}%</span>
              </div>
              <ImplementationProgressBar percent={overall.percent} className="h-2.5" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-1 block">Responsável</label>
              <input
                type="text" value={responsavel} placeholder="Quem implanta"
                onChange={(e) => setResponsavel(e.target.value)}
                onBlur={() => { if (responsavel !== (impl.responsavel || "")) updateImplementation(impl.id, { responsavel: responsavel || null }); }}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-1 block">Go-live previsto</label>
              <input
                type="date" value={impl.go_live_date || ""}
                onChange={(e) => updateImplementation(impl.id, { go_live_date: e.target.value || null })}
                className={inputCls}
              />
            </div>
          </div>
          {overall.percent === 100 && status !== "Concluída" && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-emerald-500/10 border border-emerald-500/25 px-4 py-2.5">
              <span className="text-xs text-emerald-600 flex items-center gap-2"><PartyPopper className="w-4 h-4" /> Todos os itens acompanhados estão prontos.</span>
              <Button
                size="sm"
                onClick={() => stageInfo
                  ? changeStage(etapas.conclusaoStageId(impl) ?? implementacaoStages[implementacaoStages.length - 1].id)
                  : changeStatus("Concluída")}
                className="h-8 px-3 text-xs font-medium"
              >
                Marcar como concluída
              </Button>
            </div>
          )}
        </Card>

        {/* Abas */}
        <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] w-fit max-w-full overflow-x-auto">
          {([
            ["form", "Formulário", FormInput, false],
            ...(user?.isMaster ? [["ambiente", "Ambiente do cliente", Building2, !impl.linked_tenant_id && readiness.ready] as const] : []),
            ["notas", "Notas & ajustes", StickyNote, false],
          ] as const).map(([id, label, Icon, dot]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id as typeof tab)}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded cursor-pointer transition-all flex items-center gap-1.5 whitespace-nowrap",
                tab === id ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
              {dot && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Pronto para criar" />}
            </button>
          ))}
        </div>

        {/* Ambiente do cliente (só equipe interna). Fica montado mesmo em outra aba — o modal do acesso recém-criado não pode sumir. */}
        {user?.isMaster && (
          <div className={cn("space-y-4", tab !== "ambiente" && "hidden")}>
            {(!impl.linked_tenant_id || createdHere) && (
              <CreateTenantCard
                implementationId={impl.id}
                data={data}
                linked={!!impl.linked_tenant_id}
                beforeCreate={flush}
                autoOpenSignal={autoOpenSignal}
                // O servidor já gravou o vínculo; aqui só atualiza o estado local (e o carimbo de sincronização).
                // `createdHere` mantém o cartão montado até fechar o modal que mostra o acesso (uma vez só).
                onCreated={async (tenantId) => {
                  setCreatedHere(true);
                  await updateImplementation(impl.id, { linked_tenant_id: tenantId, last_synced_at: new Date().toISOString() });
                }}
              />
            )}

            {/* Só monta com a aba aberta (evita consultas à toa); o cartão de criação acima fica sempre montado. */}
            {tab === "ambiente" && (
            <TenantLinkCard
              implementationId={impl.id}
              clienteNome={cliente?.name || ""}
              linkedTenantId={impl.linked_tenant_id}
              lastSyncedAt={impl.last_synced_at}
              beforeSync={flush}
              onSynced={async (patch) => { setData(patch.data); await updateImplementation(impl.id, patch); }}
              onUnlink={() => updateImplementation(impl.id, { linked_tenant_id: null })}
            />
            )}

            {tab === "ambiente" && impl.linked_tenant_id && (
              <RemoteIntegrationsPanel
                implementationId={impl.id}
                onSaved={async () => {
                  // Depois de gravar no ambiente do cliente, puxa de novo pra o formulário
                  // (IDs e status das integrações) refletir o que acabou de ficar pronto.
                  await flush();
                  const r = await syncImplementationTenant(impl.id, impl.linked_tenant_id);
                  if (r.ok) { setData(r.body.data); await updateImplementation(impl.id, { data: r.body.data, last_synced_at: r.body.syncedAt }); }
                }}
              />
            )}
          </div>
        )}

        {tab === "form" && (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 items-start">
            <nav aria-label="Seções do formulário" className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible lg:sticky lg:top-4 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-2 shadow-[var(--shadow-control)]">
              {IMPLEMENTATION_SECTIONS.map((s) => {
                const p = sections[s.id];
                const active = s.id === section.id;
                const done = p.total > 0 && p.percent >= 100;
                const Icon = sectionIcon(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSection(s.id)}
                    className={cn(
                      "flex items-center gap-3 text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0 lg:shrink",
                      active ? "bg-[var(--color-primary-blue)]/10" : "hover:bg-[var(--color-surface-sunken)]"
                    )}
                  >
                    <span className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      done ? "bg-emerald-500 !text-white" : active ? "bg-[var(--color-primary-blue)] !text-white" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"
                    )}>
                      {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("text-xs font-bold block truncate", active ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-primary)]")}>{s.title}</span>
                      <span className="flex items-center gap-2 mt-1">
                        {p.total > 0 ? (
                          <>
                            <ImplementationProgressBar percent={p.percent} className="h-1 min-w-[56px]" />
                            <span className="text-[10px] tabular-nums text-[var(--color-text-faint)] shrink-0">{p.done}/{p.total}</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-[var(--color-text-faint)]">Sem itens acompanhados</span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <Card className="p-6 min-w-0">
              <div className="flex items-start gap-3 mb-5 pb-4 border-b border-[var(--color-border-subtle)]">
                <span className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
                  {(() => { const Icon = sectionIcon(section.id); return <Icon className="w-5 h-5" />; })()}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{section.title}</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{section.description}</p>
                </div>
              </div>
              <ImplementationSectionForm section={section} data={data} onChange={handleFieldChange} audience="team" />
            </Card>
          </div>
        )}

        {tab === "notas" && (
          <div className="space-y-4 max-w-3xl">
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Notas internas</h3>
              <p className="text-[11px] text-[var(--color-text-faint)] mb-3">Só a equipe vê. Nunca aparece no relatório enviado ao cliente.</p>
              <textarea
                rows={6} value={notes} onChange={(e) => setNotes(e.target.value)}
                onBlur={() => { if (notes !== (impl.internal_notes || "")) updateImplementation(impl.id, { internal_notes: notes || null }); }}
                className={cn(inputCls, "resize-y")}
              />
            </Card>

            <Card className="p-6 border-rose-500/20">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Zona de risco</h3>
              <p className="text-[11px] text-[var(--color-text-faint)] mb-3">Excluir apaga todas as respostas do formulário desta implementação. Não dá para desfazer.</p>
              <Button variant="danger" onClick={handleDelete} className="h-9 px-4 text-xs font-medium gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Excluir implementação
              </Button>
            </Card>
          </div>
        )}
      </div>
      <Modal
        isOpen={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Link do cliente"
        description="O cliente preenche a parte dele (dados, contatos, IDs de integração) sem precisar de login. Status de integração, checklist e notas internas não aparecem."
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <input readOnly value={clientLink} onFocus={(e) => e.currentTarget.select()} className={cn(inputCls, "font-mono")} />
            <Button onClick={() => copyText(clientLink, "Link copiado.")} className="h-9 px-3 text-xs font-medium gap-1.5 shrink-0"><Copy className="w-3.5 h-3.5" /> Copiar</Button>
          </div>
          <Button
            variant="outline"
            onClick={() => copyText(`Olá! Para agilizar a implantação, preencha este formulário no seu tempo — ele salva automaticamente e você pode voltar depois pelo mesmo link: ${clientLink}`, "Mensagem copiada — é só colar no WhatsApp.")}
            className="h-9 px-4 text-xs font-medium gap-1.5 w-full"
          >
            <Copy className="w-3.5 h-3.5" /> Copiar mensagem pronta pro WhatsApp
          </Button>
          <div className="pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between gap-3">
            <p className="text-[11px] text-[var(--color-text-faint)]">Quem tem o link consegue preencher. Se vazou, gere outro.</p>
            <button type="button" onClick={regenerateLink} className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] inline-flex items-center gap-1 cursor-pointer shrink-0">
              <RefreshCw className="w-3 h-3" /> Gerar novo link
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
