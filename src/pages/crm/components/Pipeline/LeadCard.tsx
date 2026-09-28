import { useData } from '../../../../contexts/DataContext';
import { useLocalization } from '../../../../contexts/LocalizationContext';
import { Card } from '../../../../components/ui/card';
import {
  Flame, MoreVertical, Calendar, FileText,
  History, ArrowRight, FileDown, Activity,
  Zap, Package, Globe, MapPin, Users, CalendarClock,
  TrendingUp, Clock, UserCheck, Layers,
} from 'lucide-react';
import { cn, parseCurrencyBR } from '../../../../lib/utils';
import { leadInterestEstimate } from '../../../../components/ui/lead-details/LeadDetailsModal.helpers';

interface LeadCardProps {
  item: any;
  tasks: any[];
  stageName?: string;
  draggedLeadId: string | null;
  setDraggedLeadId: (id: string | null) => void;
  updateLead: (id: string, updates: Partial<any>) => void;
  tempDropdownId: string | null;
  setTempDropdownId: (id: string | null) => void;
  openDropdownId: string | null;
  setOpenDropdownId: (id: string | null) => void;
  setSelectedLead: (lead: any) => void;
  handleTransferToComercial: (e: any, lead: any) => void;
  handleExportIAResume: (e: any, lead: any) => void;
  setWebhookModalLead: (lead: any) => void;
  currentPipeline: 'comercial' | 'sdr';
}

const TEMP: Record<string, { flame: string; accent: string }> = {
  quente: { flame: 'text-rose-500',  accent: 'border-l-rose-500'  },
  morno:  { flame: 'text-amber-500', accent: 'border-l-amber-500' },
  frio:   { flame: 'text-[var(--color-primary-blue)]',  accent: 'border-l-[var(--color-primary-blue)]' },
};

const SCORE_BAR  = (s: number) => s > 80 ? 'bg-emerald-500' : s > 50 ? 'bg-amber-500' : 'bg-rose-500';
const SCORE_TEXT = (s: number) => s > 80 ? 'text-emerald-600 dark:text-emerald-400' : s > 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

const PRIORITY_BADGE: Record<string, string> = {
  Alta:  'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  Média: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  Baixa: 'bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/20',
};

const SOURCE_ICON: Record<string, typeof Globe> = {
  site:       Globe,
  Site:       Globe,
  indicação:  Users,
  Indicação:  Users,
  instagram:  MapPin,
  Instagram:  MapPin,
  whatsapp:   MapPin,
  WhatsApp:   MapPin,
};

function initials(name: string) {
  return (name ?? "").split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase() || "–";
}

function formatCreatedAt(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

export function LeadCard({
  item, tasks, stageName, draggedLeadId, setDraggedLeadId, updateLead,
  tempDropdownId, setTempDropdownId, openDropdownId, setOpenDropdownId,
  setSelectedLead, handleTransferToComercial, handleExportIAResume,
  setWebhookModalLead, currentPipeline,
}: LeadCardProps) {
  const { products, squads, proposals, proposalItems } = useData();
  const { formatCurrency } = useLocalization();

  const isDragging    = draggedLeadId === item.id;
  const hasDelayedTask = tasks.some(
    t => t.lead_id === item.id && t.status === 'Atrasado'
  );
  const temp      = (item.temperature || 'frio').toLowerCase() as keyof typeof TEMP;
  const score     = item.scoreIA ?? 45;
  const tempStyle = TEMP[temp] ?? TEMP.frio;
  const tags      = Array.isArray(item.tags) ? item.tags : [];
  const timeIdleNum = Number(item.timeIdle) || 0;

  const linkedProducts = (products as any[]).filter(p => (item.productIds || []).includes(p.id));
  // Produtos de Interesse: tag leve marcada na aba Produtos do lead (ver
  // ProductsSection.tsx), guardada à parte em customFields.produtosInteresseIds
  // — NUNCA em productIds (esse fica só pra produtos de uma venda real). Fonte
  // certa pra estimativa abaixo desde a separação; productIds sozinho não
  // reflete mais "interesse" nenhum.
  const produtosInteresseIds: string[] = Array.isArray(item.customFields?.produtosInteresseIds)
    ? item.customFields.produtosInteresseIds
    : [];
  const produtosInteresse = (products as any[]).filter(p => produtosInteresseIds.includes(p.id));
  // Fallback: quando o lead ainda não tem productIds sincronizado mas já tem
  // uma proposta vinculada (proposals.lead_id), usa o valor dela em vez de
  // mostrar "R$ 0" com uma proposta real (às vezes já aceita) por trás.
  const latestLeadProposal = (proposals as any[] || [])
    .filter(p => p.lead_id === item.id)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
  const linkedProposalValue = latestLeadProposal?.valor;
  // Prazo de contrato REALMENTE vendido (pode ter sido negociado menor que a
  // duração padrão do catálogo, ex.: licença de 12 meses fechada por 4 meses
  // pago adiantado) — vem do item da proposta persistido (contract_months),
  // não do produto do catálogo, senão o card mostraria o prazo padrão errado.
  const contractMonths = latestLeadProposal
    ? (proposalItems as any[] || [])
        .filter(pi => pi.proposal_id === latestLeadProposal.id)
        .map(pi => Number(pi.contract_months) || 0)
        .filter(m => m > 0)
        .sort((a, b) => b - a)[0]
    : undefined;
  // `item.value` é a fonte de verdade — soma corretamente múltiplas propostas
  // já realizadas/aceitas pro mesmo lead (mini PDV, aceite de proposta).
  //
  // BUG real (reportado: "Produto (catálogo): R$2.997, não existe esse
  // produto" — mesma causa aqui): `linkedProducts` vem de `item.productIds`,
  // que é preenchido por DOIS fluxos sem relação — "Produtos de Interesse"
  // marcado na qualificação do lead (um checkbox, nunca virou venda) E os
  // itens de uma venda de verdade. Tratar a soma do catálogo desses produtos
  // como se fosse o valor REAL do negócio mostrava um card de R$2.997 pra
  // leads que só tiveram uma caixinha marcada, nunca compraram nada.
  // `linkedProposalValue` (proposals.valor) só existe quando uma proposta de
  // verdade foi criada — prioridade sobre `linkedProducts`, que agora vira
  // só uma ESTIMATIVA (mesmo tratamento visual de avgWonTicket, com "~").
  const hasRealValue = leadInterestEstimate(item, proposals as any[], products as any[]) !== null || parseCurrencyBR(item.value) > 0 || !!linkedProposalValue;
  const estimateFromInterest = !hasRealValue && produtosInteresse.length > 0
    ? produtosInteresse.reduce((s, p) => s + (Number(p.price) || 0), 0)
    : 0;
  // Lead genuinamente sem venda/produto/proposta ainda (ex.: cliente cadastrado
  // que nunca reservou) — em vez de "R$ 0" (parece erro/dado quebrado), mostra
  // o ticket médio dos negócios Fechado do tenant como ESTIMATIVA, marcada com
  // "~" e estilo diferenciado. Não é valor real — só um sinal de potencial.
  // Sem valor real e sem produto de interesse o card mostra R$ 0 — nada de "ticket médio"
  // inventado (o "~R$ 149,33" em leads novos parecia um valor negativo/errado).
  const isEstimated = !hasRealValue && estimateFromInterest > 0;
  const interestValue = leadInterestEstimate(item, proposals as any[], products as any[]);
  // Valor numérico real por trás do card (mesma prioridade de sempre) —
  // extraído à parte do texto formatado pra poder derivar o valor MENSAL
  // abaixo sem reformatar/re-parsear a string.
  const realNumericValue = interestValue !== null
    ? interestValue
    : parseCurrencyBR(item.value) > 0
      ? parseCurrencyBR(item.value)
      : linkedProposalValue
        ? Number(linkedProposalValue)
        : null;
  const displayValue = realNumericValue !== null
    ? formatCurrency(realNumericValue)
    : estimateFromInterest > 0
      ? `~${formatCurrency(estimateFromInterest)}`
      : 'R$ 0';
  // Achado real (pedido do usuário): pra produto recorrente, o valor do card
  // é o TOTAL do contrato inteiro (proposals.valor = totalProjectedAmount,
  // ver saleCalculator.ts — nunca o valor de uma cobrança individual), mas
  // em nenhum lugar aparecia o valor MENSAL (a cobrança recorrente de
  // verdade) — só um total que, pra negócio recorrente, não é o número que
  // entra no caixa a cada mês. Mesma simplificação já usada no badge de
  // duração (1 ciclo = 1 mês, cobre a esmagadora maioria dos contratos
  // recorrentes daqui) — nunca calculado em cima de uma ESTIMATIVA, só de
  // valor real, e só quando há mais de 1 mês de contrato (com 1 mês, mensal
  // = total, não precisa de um segundo número).
  const monthlyValue = realNumericValue !== null && !!contractMonths && contractMonths > 1
    ? realNumericValue / contractMonths
    : null;

  // Tags de produto do card: seguem o estado ATUAL do lead — sem proposta = os produtos de
  // interesse marcados (mudam ao marcar/desmarcar); com proposta = os produtos dos itens dela;
  // só cai em `productIds` (legado) quando não há nem uma coisa nem outra.
  const leadProposalIds = new Set((proposals as any[] || []).filter(p => p.lead_id === item.id).map(p => p.id));
  const proposalProductIds = [...new Set(
    (proposalItems as any[] || []).filter(pi => leadProposalIds.has(pi.proposal_id) && pi.product_id).map(pi => pi.product_id as string)
  )];
  const productTags: any[] = interestValue !== null
    ? produtosInteresseIds.map(id => (products as any[]).find(p => p.id === id)).filter(Boolean)
    : proposalProductIds.length > 0
      ? proposalProductIds.map(id => (products as any[]).find(p => p.id === id)).filter(Boolean)
      : linkedProducts.slice(0, 1);

  const leadSquad = (squads as any[]).find(s =>
    (s.membros || []).some((m: string) => m === item.seller || m === item.sellerId)
  ) ?? null;

  const clientName: string | null =
    item.clientName ||
    linkedProducts.find((p: any) => p.clientName)?.clientName ||
    null;

  const createdLabel = formatCreatedAt(item.created_at ?? item.createdAt);
  const source = item.source as string | undefined;
  const SourceIcon = source ? (SOURCE_ICON[source] ?? Globe) : null;
  // Histórico de reservas sincronizado (ex.: to na pista) — mostra a
  // contagem direto no card, sem precisar abrir o modal de detalhes.
  // `reservationsHistory` guarda só as últimas 30 (server.ts limita o
  // array pra não crescer sem fim) — pra clientes recorrentes com mais
  // visitas que isso, `.length` mostrava um número capado/errado.
  // `totalReservations` é o contador real, sem esse limite.
  const reservationsCount: number = typeof item.customFields?.totalReservations === "number"
    ? item.customFields.totalReservations
    : Array.isArray(item.customFields?.reservationsHistory)
      ? item.customFields.reservationsHistory.length
      : 0;

  return (
    <Card
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", item.id); setDraggedLeadId(item.id); }}
      onClick={() => setSelectedLead(item)}
      className={cn(
        "relative overflow-hidden cursor-grab active:cursor-grabbing group text-left select-none",
        "bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] border-l-3 rounded-[var(--radius-panel)] shadow-sm",
        "hover:border-[var(--color-primary-blue)]/50 hover:shadow-md transition-all duration-150",
        tempStyle.accent,
        isDragging && "opacity-40 scale-[0.97] ring-2 ring-[var(--color-primary-blue)]",
      )}
    >
      {hasDelayedTask && (
        <span className="absolute top-2.5 right-2.5 flex h-2 w-2 z-10 pointer-events-none">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
        </span>
      )}

      <div className="p-3.5 flex flex-col gap-2.5">
        {/* Row 1 — avatar + flame + priority + menu */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-[9px] font-black text-[var(--color-primary-blue)] shrink-0">
              {initials(item.seller || item.name)}
            </div>

            {/* Temperature dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setTempDropdownId(tempDropdownId === item.id ? null : item.id); }}
                title={`Temperatura: ${temp}`}
                className="p-0.5 rounded hover:bg-[var(--color-surface-sunken)] border-none bg-transparent cursor-pointer"
              >
                <Flame className={`w-3.5 h-3.5 ${tempStyle.flame}`} />
              </button>
              {tempDropdownId === item.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setTempDropdownId(null); }} />
                  <div className="absolute left-0 top-full mt-1 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl shadow-xl p-1 z-50 flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {(['quente', 'morno', 'frio'] as const).map((t) => (
                      <button key={t} onClick={() => { updateLead(item.id, { temperature: t }); setTempDropdownId(null); }}
                        className={`p-1.5 hover:bg-[var(--color-surface-sunken)] rounded-lg border-none bg-transparent cursor-pointer ${TEMP[t].flame}`} title={t}>
                        <Flame className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Priority badge */}
            {item.priority && (
              <span className={cn(
                "text-[8px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wider inline-flex items-center gap-0.5",
                PRIORITY_BADGE[item.priority] ?? 'bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)]'
              )}>
                <TrendingUp className="w-2.5 h-2.5" /> {item.priority === 'Alta' ? 'ALTO' : item.priority === 'Média' ? 'MÉDIO' : 'BAIXO'}
              </span>
            )}
          </div>

          {/* More menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === item.id ? null : item.id); }}
              className="p-1 rounded hover:bg-[var(--color-surface-sunken)] border-none bg-transparent cursor-pointer text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {openDropdownId === item.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); }} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl shadow-xl p-1 z-50 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  {[
                    { icon: Calendar, label: 'Agendar Atividade', action: () => setOpenDropdownId(null) },
                    { icon: FileText, label: 'Visualizar Proposta',   action: () => setOpenDropdownId(null) },
                    { icon: History,  label: 'Histórico & Detalhes',     action: () => { setOpenDropdownId(null); setSelectedLead(item); } },
                  ].map(({ icon: Icon, label, action }) => (
                    <button key={label} onClick={action}
                      className="flex items-center gap-2 w-full p-2 hover:bg-[var(--color-surface-sunken)] rounded-lg text-xs font-semibold text-[var(--color-text-primary)] transition-colors border-none bg-transparent cursor-pointer text-left">
                      <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--color-primary-blue)]" /> {label}
                    </button>
                  ))}

                  {currentPipeline === 'sdr' && (
                    <>
                      <div className="h-px bg-[var(--color-border-subtle)] my-1" />
                      <button onClick={(e) => handleTransferToComercial(e, item)}
                        className="flex items-center gap-2 w-full p-2 hover:bg-[var(--color-primary-blue)]/10 rounded-lg text-xs font-semibold text-[var(--color-primary-blue)] transition-colors border-none bg-transparent cursor-pointer text-left">
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" /> Transferir p/ Closer
                      </button>
                      <button onClick={(e) => handleExportIAResume(e, item)}
                        className="flex items-center gap-2 w-full p-2 hover:bg-emerald-500/10 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition-colors border-none bg-transparent cursor-pointer text-left">
                        <FileDown className="w-3.5 h-3.5 shrink-0" /> Resumo IA (PDF)
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); setWebhookModalLead(item); }}
                        className="flex items-center gap-2 w-full p-2 hover:bg-purple-500/10 rounded-lg text-xs font-semibold text-purple-600 dark:text-purple-400 transition-colors border-none bg-transparent cursor-pointer text-left">
                        <Activity className="w-3.5 h-3.5 shrink-0" /> Webhook SDR
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Lead name */}
        <div>
          <h4 className="text-xs font-bold text-[var(--color-text-primary)] leading-tight line-clamp-2 group-hover:text-[var(--color-primary-blue)] transition-colors">
            {item.name || item.company || 'Lead sem identificação'}
          </h4>
          {item.company && item.name && (
            <p className="text-[10px] text-[var(--color-text-muted)] truncate mt-0.5">{item.company}</p>
          )}
        </div>

        {/* Pills row: stage + source */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {stageName && (
            <span className="inline-flex items-center gap-1 bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              <Zap className="w-2.5 h-2.5" />
              {stageName}
            </span>
          )}
          {source && SourceIcon && (
            <span className="inline-flex items-center gap-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              <SourceIcon className="w-2.5 h-2.5" />
              {source}
            </span>
          )}
          {reservationsCount > 0 && (
            <span
              className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
              title={`${reservationsCount} reserva${reservationsCount > 1 ? 's' : ''} no histórico`}
            >
              <CalendarClock className="w-2.5 h-2.5" />
              {reservationsCount} reserva{reservationsCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Score bar */}
        <div className="flex items-center gap-1.5">
          <Zap className={`w-3 h-3 shrink-0 ${SCORE_TEXT(score)}`} />
          <div className="flex-1 h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden border border-[var(--color-border-subtle)]">
            <div
              className={`h-full rounded-full transition-all duration-700 ${SCORE_BAR(score)}`}
              style={{ width: `${score}%` }}
            />
          </div>
          <span className={`text-[9px] font-bold tabular-nums ${SCORE_TEXT(score)}`}>{score}%</span>
        </div>

        {/* Tags + squad + product */}
        {(tags.length > 0 || leadSquad || productTags.length > 0 || clientName) && (
          <div className="flex flex-wrap gap-1">
            {clientName && (
              <span className="inline-flex items-center gap-1 text-[8px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">
                <UserCheck className="w-2.5 h-2.5" /> {clientName}
              </span>
            )}
            {leadSquad && (
              <span
                className="inline-flex items-center gap-1 text-[8px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide"
                style={{
                  backgroundColor: `${leadSquad.cor ?? '#6366f1'}18`,
                  borderColor: `${leadSquad.cor ?? '#6366f1'}40`,
                  color: leadSquad.cor ?? '#818cf8',
                }}
              >
                <Layers className="w-2.5 h-2.5" /> {leadSquad.nome}
              </span>
            )}
            {tags.slice(0, 2).map((tag: string) => (
              <span key={tag} className="text-[8px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] uppercase tracking-wide">
                {tag}
              </span>
            ))}
            {productTags.slice(0, 2).map((prod: any) => (
              <span key={prod.id} className="inline-flex items-center gap-1 text-[8px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                <Package className="w-2.5 h-2.5 shrink-0" />
                {prod.name}
              </span>
            ))}
            {productTags.length > 2 && (
              <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400">
                +{productTags.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Footer — value + creation date + idle */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-subtle)] gap-1.5">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span
              className={cn(
                "font-mono text-xs font-black leading-none flex items-center gap-1",
                isEstimated
                  ? "text-[var(--color-text-muted)] italic"
                  : "text-emerald-600 dark:text-emerald-400"
              )}
              title={
                isEstimated
                  ? (estimateFromInterest > 0
                      ? "Estimativa a partir dos produtos de interesse marcados na aba Produtos do lead — ainda não é uma venda/proposta real"
                      : "Estimativa (ticket médio) — este lead ainda não tem venda/proposta vinculada")
                  : undefined
              }
            >
              {displayValue}
              {!!contractMonths && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400" title="Duração do contrato vendida">
                  {contractMonths}m
                </span>
              )}
            </span>
            {/* Achado real: o valor acima é o TOTAL do contrato inteiro — pra
                produto recorrente, o número que entra no caixa TODO MÊS
                nunca aparecia em lugar nenhum do card. */}
            {monthlyValue !== null && (
              <span className="text-[9px] font-bold text-[var(--color-primary-blue)] font-mono leading-none" title="Valor da cobrança recorrente mensal (total ÷ meses de contrato)">
                {formatCurrency(monthlyValue)}/mês
              </span>
            )}
            {createdLabel && (
              <span className="text-[9px] text-[var(--color-text-faint)] font-medium">{createdLabel}</span>
            )}
          </div>
          <span className={cn(
            "text-[9px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0",
            timeIdleNum > 7
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
              : timeIdleNum > 3
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              : 'bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)] border-[var(--color-border-default)]'
          )}>
            <Clock className="w-2.5 h-2.5" /> {timeIdleNum}d
          </span>
        </div>

      </div>
    </Card>
  );
}
