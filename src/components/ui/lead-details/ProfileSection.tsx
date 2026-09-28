import React, { useState, useMemo } from "react";
import { Card } from "../card";
import {
  Sparkles, Brain, ArrowRight, Tag, Trophy,
  Phone, MessageSquare, Mail, FileCheck, Clock, TrendingUp, ShieldCheck
} from "lucide-react";
import { Button } from "../button";
import { Badge } from "../badge";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { parseCurrencyBR } from "../../../lib/utils";
import { getMRR } from "../../../lib/revenueMetrics";
import { toast } from "sonner";
import { ProfileDataForm } from "./ProfileDataForm";
import { leadInterestEstimate } from "./LeadDetailsModal.helpers";

interface ProfileSectionProps {
  lead: any;
  companyName: string;
  setCompanyName: (val: string) => void;
  leadName: string;
  setLeadName: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  cnpj: string;
  setCnpj: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  title: string;
  setTitle: (val: string) => void;
  value: string;
  setValue: (val: string) => void;
  seller: string;
  setSeller: (val: string) => void;
  priority: "Alta" | "Média" | "Baixa";
  setPriority: (val: any) => void;
  score: number;
  temperature: "Quente" | "Morno" | "Frio";
  probability: number;
  slaStatus: string;
  timeIdle: string;
  customTags: string[];
  newTagInput: string;
  setNewTagInput: (val: string) => void;
  isEditingInline: boolean;
  setIsEditingInline: (val: boolean) => void;
  tempColors: Record<string, string>;
  customLeadFields: any[];
  customFieldsState: Record<string, string | number>;
  setCustomFieldsState: React.Dispatch<React.SetStateAction<Record<string, string | number>>>;
  handleAddTag: () => void;
  handleRemoveTag: (tag: string) => void;
  handleConvertLead: () => void;
  setAlterationLogs: any;
  updateLead: any;
}

export function ProfileSection({
  lead,
  companyName, setCompanyName,
  leadName, setLeadName,
  phone, setPhone,
  cnpj, setCnpj,
  email, setEmail,
  title, setTitle,
  value, setValue,
  seller, setSeller,
  priority, setPriority,
  score, temperature, probability, slaStatus, timeIdle,
  customTags, newTagInput, setNewTagInput,
  isEditingInline, setIsEditingInline,
  customLeadFields, customFieldsState, setCustomFieldsState,
  handleAddTag, handleRemoveTag, handleConvertLead,
  setAlterationLogs, updateLead,
}: ProfileSectionProps) {
  const [cnpjFetching, setCnpjFetching] = useState(false);
  const { products: catalogProducts, leads: allLeads, colaboradores, addLeadActivity: addActivityCtx, proposals, proposalItems, contracts } = useData();
  const { formatCurrency } = useLocalization();

  const sellerOptions = useMemo(() => {
    const fromColab = (colaboradores as any[])
      .filter((c: any) => c.status !== "Desligado" && c.departamento === "Vendas")
      .map((c: any) => c.nome)
      .filter(Boolean);
    if (fromColab.length > 0) return fromColab as string[];
    return [...new Set((allLeads as any[]).map((l: any) => l.seller).filter(Boolean))] as string[];
  }, [colaboradores, allLeads]);

  // Valor da Proposta: `lead.value` já é a soma de todas as propostas reais
  // vinculadas a este lead (única fonte de verdade, recalculada em
  // DataContext.tsx a cada proposta criada/editada/excluída) — nunca mais um
  // texto livre digitado aqui. `parseCurrencyBR` cobre os dois formatos que
  // `lead.value` pode ter historicamente: número puro (nosso cálculo) ou
  // string formatada "R$ X,XX" (leads criados pelo NewLeadModal).
  const displayValue = useMemo(() => {
    // Versão ao vivo do lead (o `lead` da prop é um retrato da abertura do modal).
    const liveLead = (allLeads as any[]).find((l: any) => l.id === lead?.id) ?? lead;
    const estimate = leadInterestEstimate(liveLead, proposals as any[], catalogProducts as any[]);
    return estimate !== null ? formatCurrency(estimate) : formatCurrency(parseCurrencyBR(liveLead?.value));
  }, [lead, allLeads, proposals, catalogProducts, formatCurrency]);

  // Valor do Produto: referência de catálogo (preço cheio, sem desconto) dos
  // itens de uma proposta REAL deste lead — um número DIFERENTE do valor da
  // proposta (que já reflete o negociado/descontado), mostrado ao lado pra
  // dar contexto de quanto do preço de tabela essa venda representa.
  //
  // BUG real (reportado: "Produto (catálogo): R$2.997,00, não existe esse
  // produto"): isso usava `lead.productIds`, mas esse campo é preenchido por
  // DOIS fluxos sem relação nenhuma — "Produtos de Interesse" marcado na
  // qualificação do lead (NewLeadModal.tsx/QualificationBlock.tsx, um mero
  // checkbox, nunca virou venda) E os itens de uma venda de verdade
  // (AddProdutoLeadModal). Muitos leads da Pluppex tinham só os checkboxes de
  // interesse marcados (mesmos 2 produtos em ~8 leads diferentes) e nunca
  // fecharam negócio nenhum — mesmo assim apareciam com "Produto (catálogo):
  // R$2.997" como se fosse um produto de fato vinculado. `proposal_items` só
  // existe quando `createProposalWithItems` roda de verdade (venda real),
  // nunca a partir do checkbox de interesse — fonte confiável.
  const productValue = useMemo(() => {
    if (!lead?.id) return null;
    const leadProposalIds = new Set(
      (proposals as any[]).filter((p: any) => p.lead_id === lead.id).map((p: any) => p.id)
    );
    if (leadProposalIds.size === 0) return null;
    const items = (proposalItems as any[]).filter((pi: any) => leadProposalIds.has(pi.proposal_id));
    const total = items.reduce((s: number, pi: any) => s + (Number(pi.preco_unitario) || 0) * (Number(pi.quantidade) || 1), 0);
    return total > 0 ? formatCurrency(total) : null;
  }, [lead?.id, proposals, proposalItems, formatCurrency]);

  // MRR deste lead: mesma fonte e mesma fórmula usada em todo o resto do
  // sistema (getMRR/revenueMetrics.ts — Financeiro, Dashboard, Contracts) —
  // soma o `mrr` dos contratos ATIVOS gerados a partir de propostas deste
  // lead (proposals.lead_id -> contracts.proposalId). Só existe depois que
  // uma proposta é de fato aceita (syncAcceptedProposal cria o contrato); até
  // lá é null, não zero "fake".
  const leadMRR = useMemo(() => {
    if (!lead?.id) return null;
    const leadProposalIds = new Set(
      (proposals as any[]).filter((p: any) => p.lead_id === lead.id).map((p: any) => p.id)
    );
    if (leadProposalIds.size === 0) return null;
    const linkedContracts = (contracts as any[]).filter((c: any) => c.proposalId && leadProposalIds.has(c.proposalId));
    const mrr = getMRR(linkedContracts as any);
    return mrr > 0 ? formatCurrency(mrr) : null;
  }, [lead?.id, proposals, contracts, formatCurrency]);

  const fetchCnpjData = async () => {
    const digits = (cnpj || lead.cnpj || "").replace(/\D/g, "");
    if (digits.length !== 14) return;
    setCnpjFetching(true);
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.nome_fantasia || data.razao_social) setCompanyName(data.nome_fantasia || data.razao_social);
        if (data.email && !email) setEmail(data.email.toLowerCase());
        if (data.municipio && !customFieldsState.cidade) {
          setCustomFieldsState((prev) => ({ ...prev, cidade: data.municipio }));
        }
        if (data.ddd_telefone_1 && !phone) {
          const raw = data.ddd_telefone_1.replace(/\D/g, "").slice(0, 11);
          const fmt = raw.length === 11
            ? `(${raw.slice(0,2)}) ${raw.slice(2,7)}-${raw.slice(7)}`
            : `(${raw.slice(0,2)}) ${raw.slice(2,6)}-${raw.slice(6)}`;
          setPhone(fmt);
        }
      }
    } finally {
      setCnpjFetching(false);
    }
  };

  const quickActions = [
    {
      label: "WhatsApp",
      icon: MessageSquare,
      color: "text-emerald-600 dark:text-emerald-400",
      action: () => window.open(`https://wa.me/55${phone.replace(/\D/g, "")}`, "_blank"),
    },
    {
      label: "Ligação VoIP",
      icon: Phone,
      color: "text-[var(--color-primary-blue)]",
      action: () => {
        addActivityCtx(lead.id, "Ligação", "Ligação VoIP", "Discagem virtual executada pelo sistema S.P.Y..", seller || "Sistema");
        toast.success("Ligação VoIP registrada no histórico!");
      },
    },
    {
      label: "Enviar E-mail",
      icon: Mail,
      color: "text-amber-600 dark:text-amber-400",
      action: () => window.open(`mailto:${email}`),
    },
    {
      label: "Contrato",
      icon: FileCheck,
      color: "text-purple-600 dark:text-purple-400",
      action: () =>
        setAlterationLogs((prev: any[]) => [
          { id: Date.now().toString(), author: seller || "Sistema", desc: "Contrato solicitado — gere o PDF na tela de Propostas", time: "Agora" },
          ...prev,
        ]),
    },
    {
      label: "Converter Lead",
      icon: Trophy,
      color: "text-rose-600 dark:text-rose-400",
      action: handleConvertLead,
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── Compact Key Metrics Bar (replaces the duplicate ProfileHeroCard) ── */}
      <div className="grid grid-cols-3 gap-2.5">
        <Card className="p-3 text-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="text-[10px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-[var(--color-primary-blue)]" /> Score IA
          </div>
          <div className="text-lg font-display font-black text-[var(--color-text-primary)]">
            {score || 0}<span className="text-xs text-[var(--color-text-faint)] font-normal">/100</span>
          </div>
        </Card>

        <Card className="p-3 text-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="text-[10px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-500" /> Probabilidade
          </div>
          <div className="text-lg font-display font-black text-emerald-600 dark:text-emerald-400">
            {Math.round(Number(probability) || 0)}%
          </div>
        </Card>

        <Card className="p-3 text-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="text-[10px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
            <Clock className="w-3 h-3 text-amber-500" /> Inatividade
          </div>
          <div className="text-lg font-display font-black text-[var(--color-text-primary)]">
            {timeIdle || "0h"}
          </div>
        </Card>
      </div>

      {/* ── Main Data Form ── */}
      <ProfileDataForm
        isEditingInline={isEditingInline}
        setIsEditingInline={setIsEditingInline}
        companyName={companyName} setCompanyName={setCompanyName}
        leadName={leadName} setLeadName={setLeadName}
        phone={phone} setPhone={setPhone}
        cnpj={cnpj} setCnpj={setCnpj}
        email={email} setEmail={setEmail}
        title={title} setTitle={setTitle}
        value={value} setValue={setValue}
        displayValue={displayValue}
        productValue={productValue}
        leadMRR={leadMRR}
        seller={seller} setSeller={setSeller}
        priority={priority} setPriority={setPriority}
        sellerOptions={sellerOptions}
        lead={lead}
        updateLead={updateLead}
        customLeadFields={customLeadFields}
        customFieldsState={customFieldsState}
        setCustomFieldsState={setCustomFieldsState}
        cnpjFetching={cnpjFetching}
        onFetchCnpj={fetchCnpjData}
      />

      {/* ── Quick Actions ── */}
      <Card className="p-3.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] mb-2.5">
          Ações Rápidas
        </h4>
        <div className="grid grid-cols-5 gap-2">
          {quickActions.map(({ label, icon: Icon, color, action }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              className="flex flex-col items-center gap-1.5 py-2 px-1 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-primary-blue)]/40 transition-all cursor-pointer group"
            >
              <Icon className={`w-4 h-4 ${color} group-hover:scale-110 transition-transform`} />
              <span className="text-[9px] font-bold text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] text-center leading-tight truncate w-full">
                {label}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* ── AI Copilot Recommendation ── */}
      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-primary-blue)]/20 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[var(--color-primary-blue)]/10 flex items-center justify-center shrink-0">
              <Brain className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-primary)]">
              Recomendação S.P.Y. Copilot
            </span>
          </div>
          <Badge variant="purple" dot dotPulse>IA</Badge>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Score <strong className="text-[var(--color-text-primary)] font-bold">{score}</strong> — Lead com alto interesse em propostas personalizadas. Recomendamos contato ativo para acelerar o fechamento.
        </p>
        <div className="mt-3 pt-2.5 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-text-faint)]">Ação sugerida:</span>
          {/* Antes chamava setActiveTab("whatsapp") pra abrir a aba "Chat" do
              modal — removida (só compunha template pra copiar/colar, nunca
              teve envio real). Aponta direto pro WhatsApp de verdade agora,
              mesmo destino do botão "WhatsApp" em Ações Rápidas acima. */}
          <button
            type="button"
            onClick={() => window.open(`https://wa.me/55${phone.replace(/\D/g, "")}`, "_blank")}
            disabled={!phone}
            className="text-xs text-[var(--color-primary-blue)] font-bold hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
          >
            Abrir WhatsApp <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </Card>

      {/* ── Tags ── */}
      <Card className="p-3.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] mb-2.5 flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Tags Corporativas
        </h4>
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5 min-h-[26px]">
            {customTags.length === 0 ? (
              <span className="text-xs text-[var(--color-text-faint)] italic self-center">Nenhuma tag vinculada</span>
            ) : (
              customTags.map((tag) => (
                <span
                  key={tag}
                  onClick={() => handleRemoveTag(tag)}
                  title="Clique para remover"
                  className="group flex items-center gap-1 bg-[var(--color-surface-sunken)] hover:bg-rose-500/10 text-[var(--color-text-primary)] hover:text-rose-600 dark:hover:text-rose-400 border border-[var(--color-border-default)] hover:border-rose-500/30 text-[11px] font-semibold px-2.5 py-0.5 rounded-full transition-all cursor-pointer"
                >
                  #{tag}
                  <span className="text-[9px] font-bold opacity-0 group-hover:opacity-100">&times;</span>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Adicionar nova tag..."
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              className="flex-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all"
            />
            <Button
              size="sm"
              onClick={handleAddTag}
              className="px-3 text-xs font-bold shrink-0"
            >
              Adicionar
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
