import { useEffect, useMemo, useState } from "react";
import { useRecursoAtivo } from "../../../lib/useRecursoAtivo";
import { ROTA_PROPOSTAS } from "../../../lib/paginasOcultas";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { useMaxdataPage, useMaxdataStats, MAXDATA_TODAS } from "../../../lib/useMaxdataPage";
import { Card } from "../card";
import { Button } from "../button";
import { Badge } from "../badge";
import { EmptyState } from "../empty-state";
import { FileText, Plus, Pencil, Eye, Download, Check, Package, Search, Tag, X, Info, FilePlus2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { downloadPropostaClientePdf, propostaParaDocumento } from "../../../pages/crm/utils/proposalClientPdf";
import { usePropostaBranding } from "../../proposta/usePropostaBranding";
import { PropostaClienteViewModal } from "../modals/crm/PropostaClienteViewModal";
import { PropostaEditorWordModal, PropostaEditorData } from "../modals/crm/PropostaEditorWordModal";
import { AddProdutoLeadModal } from "../modals/crm/AddProdutoLeadModal";
import { NovaPropostaWizard } from "../modals/crm/NovaPropostaWizard";
import { confirmDialog } from "../confirm-dialog";
import { cn } from "../../../lib/utils";

interface ProductsSectionProps {
  availableProducts: any[];
  seller: string;
  setAlterationLogs: any;
  leadName?: string;
  companyName?: string;
  leadId?: string;
}

/** Itens da venda que veio da Max Data (lead criado pela API): lidos de maxdata_venda_itens. */
function ItensVendaMaxdata({ vendaExternoId, fonte }: { vendaExternoId: string; fonte?: string }) {
  const { activeTenantId } = useAuth();
  const { formatCurrency } = useLocalization();
  const [itens, setItens] = useState<any[] | null>(null);
  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let off = false;
    (async () => {
      let q: any = supabase!.from("maxdata_vendas").select("id").eq("tenant_id", activeTenantId);
      if (fonte) q = q.eq("externo_sistema", fonte);
      const { data: v } = await q.eq("externo_id", vendaExternoId).limit(1).maybeSingle();
      if (!v) { if (!off) setItens([]); return; }
      const { data } = await supabase!.from("maxdata_venda_itens").select("id,product_name,codigo,quantidade,preco_unitario,valor_desconto").eq("tenant_id", activeTenantId).eq("venda_id", v.id);
      if (!off) setItens(data ?? []);
    })().catch(() => { if (!off) setItens([]); });
    return () => { off = true; };
  }, [vendaExternoId, fonte, activeTenantId]);
  if (itens === null) return <Card className="p-4 text-xs text-[var(--color-text-muted)]">Carregando produtos da venda…</Card>;
  const total = itens.reduce((t, i) => t + (Number(i.preco_unitario) || 0) * (Number(i.quantidade) || 1), 0);
  return (
    <Card className="p-4 bg-[var(--color-surface-elevated)] shadow-sm space-y-3 border border-[var(--color-border-default)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2.5">
        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Produtos da venda (Max Data)</span>
        <Badge variant="secondary">{itens.length} item{itens.length === 1 ? "" : "s"}</Badge>
      </div>
      {itens.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">Esta venda não tem itens sincronizados da Max Data.</p>
      ) : (
        <div className="space-y-1.5">
          {itens.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-[var(--color-text-primary)] truncate">{i.product_name || "Produto"}</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">{i.codigo ? `${i.codigo} · ` : ""}{Number(i.quantidade) || 1}x {formatCurrency(Number(i.preco_unitario) || 0)}{Number(i.valor_desconto) > 0 ? ` · desc. ${formatCurrency(Number(i.valor_desconto))}` : ""}</p>
              </div>
              <span className="font-mono font-bold text-[var(--color-text-primary)] shrink-0">{formatCurrency((Number(i.preco_unitario) || 0) * (Number(i.quantidade) || 1))}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2 border-t border-[var(--color-border-subtle)] text-xs font-black"><span>Total dos itens</span><span className="font-mono">{formatCurrency(total)}</span></div>
        </div>
      )}
    </Card>
  );
}

/**
 * Antes era o "Mini PDV & Orçamento" inteiro embutido aqui: composição comercial/margem,
 * recorrência e implantação por item, forma de pagamento e o catálogo, tudo junto ocupando
 * a aba inteira. Os mesmos campos continuam existindo — só que dentro de AddProdutoLeadModal
 * (aberto pelo "+ Novo Produto", ou clicando direto num item da lista abaixo), não mais
 * espalhados pela aba. Aqui fica só: a proposta já vinculada ao lead (se houver) e a lista de
 * produtos do catálogo.
 */
export function ProductsSection({
  availableProducts = [],
  seller,
  setAlterationLogs,
  leadName,
  companyName,
  leadId,
}: ProductsSectionProps) {
  const { updateProposal, deleteProposal, proposals, proposalItems, contracts, appSettings, leads, updateLead, setProducts } = useData() as any;
  const empresaDadosBranding = appSettings?.empresa_dados || {};
  const { formatCurrency } = useLocalization();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  // Pedido explícito do usuário: o lápis "editar proposta" passa a abrir o
  // mesmo wizard de 5 etapas (mais completo), não mais o modal antigo.
  const [isEditWizardOpen, setIsEditWizardOpen] = useState(false);
  const [prefillProductId, setPrefillProductId] = useState<string | undefined>(undefined);
  const [prefillProductIds, setPrefillProductIds] = useState<string[] | undefined>(undefined);
  // true = o modal antigo acrescenta itens na proposta existente (fluxo de
  // produto único, "+ Novo Produto" rápido — não o lápis, ver acima).
  const [editingExistingProposal, setEditingExistingProposal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // Catálogo único: produtos do sistema + produtos da Max Data (dezenas de milhares, buscados no servidor), escolhidos numa caixa de seleção.
  const { activeTenantId } = useAuth();
  const [fonteCatalogo, setFonteCatalogo] = useState<"sistema" | "maxdata" | null>(null);
  const [termoMax, setTermoMax] = useState("");
  const [limiteMax, setLimiteMax] = useState(30);
  useEffect(() => { const t = setTimeout(() => { setTermoMax(searchTerm); setLimiteMax(30); }, 350); return () => clearTimeout(t); }, [searchTerm]);
  const totalMax = useMaxdataStats("maxdata_produtos", MAXDATA_TODAS, activeTenantId).stats?.total ?? 0;
  const listaMax = useMaxdataPage({ table: "maxdata_produtos", origem: totalMax > 0 ? MAXDATA_TODAS : "", tenantId: activeTenantId, term: termoMax, page: 0, pageSize: limiteMax, searchCols: ["name", "sku", "category"], orderBy: "name" });
  const branding = usePropostaBranding();
  const [isClientViewOpen, setIsClientViewOpen] = useState(false);
  const [isWordModalOpen, setIsWordModalOpen] = useState(false);
  const [currentProposalData, setCurrentProposalData] = useState<PropostaEditorData | null>(null);

  // Produtos de Interesse: marcação leve ("essa é a tag, esse é o valor de
  // referência"), SEM criar proposta nenhuma — pedido explícito do usuário
  // depois do bug de "Produto (catálogo): R$2.997 que não existe" (a versão
  // antiga confundia isso com venda real). Guardado à parte, em
  // customFields.produtosInteresseIds — nunca em `productIds` (esse
  // continua reservado só pra produtos de uma venda de verdade, via
  // AddProdutoLeadModal) e nunca soma em Valor da Proposta/Produto
  // (catálogo) (ProfileSection.tsx), que seguem vindo só de proposal_items
  // reais.
  const currentLead = useMemo(() => (leads || []).find((l: any) => l.id === leadId), [leads, leadId]);
  const interesseIds: string[] = Array.isArray(currentLead?.customFields?.produtosInteresseIds)
    ? currentLead.customFields.produtosInteresseIds
    : [];
  const toggleInteresse = (productId: string, precoExtra?: number) => {
    if (!leadId) return;
    const next = interesseIds.includes(productId)
      ? interesseIds.filter((id) => id !== productId)
      : [...interesseIds, productId];
    // Enquanto não há proposta, o valor do lead (card do Kanban, cabeçalho, aba Info) é a soma
    // dos preços dos produtos de interesse. Com proposta, o valor real dela manda (recalculado
    // por createProposalWithItems/updateProposal), então aqui não mexe.
    const hasProposal = (proposals || []).some((p: any) => p.lead_id === leadId);
    const interestValue = next.reduce(
      (sum, id) => sum + (Number(availableProducts.find((p) => p.id === id)?.price ?? (id === productId ? precoExtra : 0)) || 0), 0);
    updateLead(leadId, {
      customFields: { ...(currentLead?.customFields || {}), produtosInteresseIds: next },
      ...(hasProposal ? {} : { value: interestValue }),
    });
  };
  // Produto da Max Data (tabela própria, 150 mil linhas): ao marcar como interesse, ele é "promovido" uma única vez
  // para o catálogo do sistema (mesma regra das notas) e entra na lista de interesse normalmente.
  const [marcandoMax, setMarcandoMax] = useState<string | null>(null);
  const marcarMax = async (row: any) => {
    if (!leadId || !supabase || !activeTenantId) return;
    const existente = availableProducts.find((p: any) => p.externo_sistema === row.externo_sistema && String(p.externo_id) === String(row.externo_id));
    if (existente) { toggleInteresse(existente.id); return; }
    setMarcandoMax(row.id);
    try {
      const novo = {
        tenant_id: activeTenantId, externo_sistema: row.externo_sistema, externo_id: row.externo_id, name: row.name, sku: row.sku, price: row.price, cost: row.cost, margin: row.margin,
        category: row.category, provider: row.provider, active: row.active, type: row.type, stock: row.stock, stock_min: row.stock_min, weight: row.weight, dimensions: row.dimensions, externo_dados: row.externo_dados,
      };
      const { data, error } = await supabase.from("products").upsert(novo, { onConflict: "tenant_id,externo_sistema,externo_id" }).select("*").single();
      if (error || !data) { toast.error(`Não foi possível marcar o produto: ${error?.message || "erro"}`); return; }
      setProducts((prev: any[]) => (prev.some((p) => p.id === data.id) ? prev : [{ ...data, currentStock: data.stock, stockMin: data.stock_min, attachments: [], typeAttributes: data.type_attributes || {} }, ...prev]));
      toggleInteresse(data.id, Number(data.price) || 0);
    } finally { setMarcandoMax(null); }
  };
  const produtosInteresse = interesseIds
    .map((id) => availableProducts.find((p) => p.id === id))
    .filter(Boolean) as any[];

  // Valor de catálogo dos produtos marcados — distingue recorrente (mensal) de pontual, mesma
  // lógica já usada em todo o resto do sistema (nunca soma os dois como se fossem a mesma
  // coisa). É só uma prévia pelo preço de tabela; ciclo/parcelamento real se define ao
  // organizar a proposta no modal.
  const interesseTotais = useMemo(() => {
    return produtosInteresse.reduce((acc, p) => {
      const price = Number(p.price) || 0;
      if (p.recurrence) acc.recorrente += price; else acc.pontual += price;
      return acc;
    }, { recorrente: 0, pontual: 0 });
  }, [produtosInteresse]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return availableProducts.filter((p) =>
      (p.name || "").toLowerCase().includes(term) || (p.category || "").toLowerCase().includes(term)
    );
  }, [availableProducts, searchTerm]);

  const propostasAtivas = useRecursoAtivo(ROTA_PROPOSTAS);
  const openAddModal = (productId?: string, toExistingProposal = false) => {
    setPrefillProductId(productId);
    setPrefillProductIds(undefined);
    setEditingExistingProposal(toExistingProposal);
    setIsAddModalOpen(true);
  };

  // "Criar Proposta" a partir dos Produtos de Interesse: os N produtos marcados entram de uma
  // vez na Composição do novo fluxo de 6 etapas (NovaPropostaWizard), já somados numa
  // proposta só — nunca uma proposta por produto.
  const openAddModalBulk = () => {
    if (produtosInteresse.length === 0) return;
    setIsWizardOpen(true);
  };

  const existingProposal = useMemo(() => {
    if (!leadId) return null;
    const linked = (proposals || []).filter((p: any) => p.lead_id === leadId);
    if (linked.length === 0) return null;
    return [...linked].sort((a: any, b: any) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )[0];
  }, [proposals, leadId]);

  const existingProposalItems = useMemo(() => {
    if (!existingProposal) return [];
    return (proposalItems || []).filter((pi: any) => pi.proposal_id === existingProposal.id);
  }, [proposalItems, existingProposal]);

  const PROPOSAL_STATUS_VARIANT: Record<string, "success" | "info" | "warning" | "destructive" | "secondary"> = {
    Aceita: "success",
    Enviada: "info",
    Aberta: "warning",
    Recusada: "destructive",
  };
  const isProposalAccepted = existingProposal?.status === "Aceita";

  // Documento do cliente (mesma fonte do modo cliente / PDF). Se `valor` veio 0/vazio,
  // mostra a soma dos itens (regra recorrente) — só exibição, nada é gravado.
  const clientDoc = useMemo(
    () => (existingProposal ? propostaParaDocumento(existingProposal, existingProposalItems, seller) : null),
    [existingProposal, existingProposalItems, seller]
  );
  const displayTotal = clientDoc?.data.valor || 0;

  const handleEditContract = () => {
    if (!existingProposal) return;
    setCurrentProposalData({
      id: existingProposal.id,
      cliente: existingProposal.cliente,
      titulo: existingProposal.titulo,
      valor: existingProposal.valor,
      validade: existingProposal.validade,
      status: existingProposal.status,
      vendedor: existingProposal.vendedor,
      conteudo_texto: existingProposal.conteudo_texto,
      view_token: existingProposal.view_token,
      decisor_nome: existingProposal.decisor_nome,
      decisor_cargo: existingProposal.decisor_cargo,
      pagamento: existingProposal.pagamento ?? null,
      itens: existingProposalItems.map((i: any) => ({
        product_name: i.product_name,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        billing_type: i.billing_type,
        contract_months: i.contract_months ?? null,
      })),
    });
    setIsWordModalOpen(true);
  };

  const handleDownloadExistingProposalPdf = () => {
    if (!clientDoc) return;
    void downloadPropostaClientePdf(clientDoc.data, clientDoc.itens, branding);
  };

  // Pedido explícito do usuário: lixeira direto neste card tambem, não só
  // dentro do wizard de edição — mesma confirmação/aviso de contrato
  // vinculado já usado em PropostasTable.tsx e no wizard.
  const handleDeleteExistingProposal = async () => {
    if (!existingProposal) return;
    const contratoVinculado = (contracts as any[])?.find((c: any) => c.proposalId === existingProposal.id);
    const ok = await confirmDialog({
      title: "Excluir proposta",
      description: contratoVinculado
        ? `Essa proposta já gerou o contrato de "${contratoVinculado.client}". Excluir a proposta também vai excluir esse contrato e os lançamentos financeiros ligados a ele. Essa ação não pode ser desfeita.`
        : `Excluir a proposta "${existingProposal.titulo}"? Essa ação não pode ser desfeita.`,
      confirmText: "Excluir",
    });
    if (!ok) return;
    const deleted = await deleteProposal(existingProposal.id);
    if (deleted) toast.success("Proposta excluída.");
  };

  const handleAddProdutoDone = (summary: string) => {
    setAlterationLogs((prev: any[]) => [
      { id: Date.now().toString(), author: seller || "Sistema", desc: summary, time: "Agora" },
      ...prev,
    ]);
  };

  const usandoMax = totalMax > 0 && (fonteCatalogo ? fonteCatalogo === "maxdata" : availableProducts.length === 0);
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {currentLead?.customFields?.maxdata_venda_id && <ItensVendaMaxdata vendaExternoId={String(currentLead.customFields.maxdata_venda_id)} fonte={currentLead.customFields.fonte} />}
      {existingProposal && (
        <Card className={cn(
          "p-4 bg-[var(--color-surface-elevated)] shadow-sm space-y-3",
          isProposalAccepted ? "border border-success/30 bg-success/[0.03]" : "border border-[var(--color-primary-blue)]/25"
        )}>
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] flex items-center gap-2">
              <FileText className={cn("w-3.5 h-3.5", isProposalAccepted ? "text-success" : "text-[var(--color-primary-blue)]")} />
              Proposta Comercial Vinculada
            </span>
            <div className="flex items-center gap-1.5">
              <Badge
                variant={PROPOSAL_STATUS_VARIANT[existingProposal.status] || "secondary"}
                className="text-[10px] font-bold px-2 py-0.5"
              >
                {existingProposal.status || "—"}
              </Badge>
              <button
                type="button"
                onClick={() => setIsEditWizardOpen(true)}
                title="Editar proposta"
                aria-label="Editar proposta"
                className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="min-w-0">
              <p className="text-sm font-bold leading-snug text-[var(--color-text-primary)] break-words">{existingProposal.titulo}</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                {existingProposalItems.length} {existingProposalItems.length === 1 ? "item" : "itens"}
                {existingProposal.validade && (
                  <> · Válida até {new Date(existingProposal.validade + "T12:00:00").toLocaleDateString("pt-BR")}</>
                )}
              </p>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] px-3 py-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Total da proposta</span>
              <span className="text-base font-mono font-black text-success">{formatCurrency(displayTotal)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsClientViewOpen(true)}
                className="h-9 text-xs font-bold gap-1.5 border-success/30 hover:bg-success/10 text-success cursor-pointer"
              >
                <Eye className="w-4 h-4" /> Ver como cliente
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadExistingProposalPdf}
                className="h-9 text-xs font-bold gap-1.5 border-[var(--color-primary-blue)]/30 hover:bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] cursor-pointer"
              >
                <Download className="w-4 h-4" /> Baixar PDF
              </Button>
              <button
                type="button"
                onClick={handleDeleteExistingProposal}
                title="Excluir proposta"
                aria-label="Excluir proposta"
                className="h-9 w-9 ml-auto flex items-center justify-center rounded-lg border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10 hover:border-danger/30 transition-colors cursor-pointer shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isProposalAccepted && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20 text-success text-xs">
              <Check className="w-4 h-4 text-success shrink-0" />
              <span>
                <strong>Proposta Aceita & Venda Fechada!</strong> O contrato está ativado e as faturas foram provisionadas no financeiro.
              </span>
            </div>
          )}

          {existingProposalItems.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-[var(--color-border-subtle)]">
              <span className="text-[10px] uppercase font-bold tracking-wide text-[var(--color-text-faint)] block">
                {isProposalAccepted ? "Itens da proposta aprovada" : "Itens da proposta"}
              </span>
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto scrollbar-thin">
                {existingProposalItems.map((item: any, idx: number) => {
                  const recorrente = !!item.billing_type && item.billing_type !== "one_time";
                  return (
                    <div key={idx} className="flex items-start justify-between gap-3 text-xs py-2 px-2.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
                      <span className="text-[var(--color-text-primary)] font-medium text-xs leading-snug break-words min-w-0">{item.product_name}</span>
                      <span className="font-mono text-success text-[11px] font-bold shrink-0 text-right whitespace-nowrap">
                        {recorrente
                          ? (Number(item.contract_months) > 1
                              ? `${formatCurrency(item.preco_unitario)}/ciclo × ${item.contract_months} = ${formatCurrency(Number(item.preco_unitario) * Number(item.contract_months))}`
                              : `${formatCurrency(item.preco_unitario)}/ciclo`)
                          : `${item.quantidade}x ${formatCurrency(item.preco_unitario)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {clientDoc && (
        <PropostaClienteViewModal
          isOpen={isClientViewOpen}
          onClose={() => setIsClientViewOpen(false)}
          data={clientDoc.data}
          itens={clientDoc.itens}
          viewToken={existingProposal?.view_token}
        />
      )}

      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> Produtos de Interesse
          </span>
          <span
            className="text-[var(--color-text-faint)]"
            title="Marcação rápida, sem criar proposta nenhuma — não entra no Valor da Proposta nem no financeiro. Quando a venda sair de verdade, use 'Criar Proposta' abaixo."
          >
            <Info className="w-3 h-3" />
          </span>
        </div>
        {produtosInteresse.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-faint)]">
            Nenhum produto marcado ainda — clique duas vezes (ou no <Plus className="w-2.5 h-2.5 inline" />) de um item abaixo pra marcar, sem precisar fazer a proposta.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {produtosInteresse.map((prod) => (
                <span
                  key={prod.id}
                  className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[11px] font-bold text-[var(--color-text-muted)]"
                >
                  {prod.name}
                  <span className="font-mono text-[10px] opacity-80">{formatCurrency(Number(prod.price) || 0)}</span>
                  <button
                    type="button"
                    onClick={() => toggleInteresse(prod.id)}
                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[var(--color-border-default)] transition-colors"
                    title="Remover marcação"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-[var(--color-border-subtle)]">
              <div className="flex flex-col gap-0.5">
                {interesseTotais.recorrente > 0 && (
                  <span className="text-[11px] font-bold text-[var(--color-primary-blue)] font-mono">
                    {formatCurrency(interesseTotais.recorrente)}/mês <span className="text-[var(--color-text-faint)] font-normal">recorrente</span>
                  </span>
                )}
                {interesseTotais.pontual > 0 && (
                  <span className="text-[11px] font-bold text-[var(--color-text-primary)] font-mono">
                    {formatCurrency(interesseTotais.pontual)} <span className="text-[var(--color-text-faint)] font-normal">pontual</span>
                  </span>
                )}
              </div>
              {propostasAtivas && (
              <Button
                type="button"
                size="sm"
                onClick={openAddModalBulk}
                className="h-8 text-[11px] font-bold gap-1.5"
              >
                <FilePlus2 className="w-3.5 h-3.5" /> Criar Proposta ({produtosInteresse.length})
              </Button>
              )}
            </div>
          </>
        )}
      </Card>

      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Produtos ({usandoMax ? (termoMax ? listaMax.total : totalMax).toLocaleString("pt-BR") : filteredProducts.length})
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => openAddModal()}
            className="h-8 text-[11px] font-bold gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Produto
          </Button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou categoria..."
            className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] pl-8 pr-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
          />
        </div>

        {totalMax > 0 && (
          <select
            value={usandoMax ? "maxdata" : "sistema"}
            onChange={(e) => setFonteCatalogo(e.target.value as "sistema" | "maxdata")}
            className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
          >
            <option value="sistema">Catálogo do sistema ({availableProducts.length.toLocaleString("pt-BR")})</option>
            <option value="maxdata">Max Data ({totalMax.toLocaleString("pt-BR")})</option>
          </select>
        )}

        {usandoMax ? (
          <div className={cn("grid grid-cols-1 gap-2 max-h-[360px] overflow-y-auto scrollbar-thin pr-1", (termoMax ? listaMax.total : totalMax) <= 10 && "sm:grid-cols-2")}>
            {listaMax.rows.map((p: any) => (
              <div
                key={p.id}
                onDoubleClick={() => marcarMax(p)}
                title="Duplo clique (ou no +): marcar como produto de interesse"
                className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:border-[var(--color-primary-blue)]/50 hover:bg-[var(--color-primary-blue)]/5 transition-all flex items-center justify-between gap-2 cursor-pointer select-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{p.name}</p>
                  <span className="text-[9px] text-[var(--color-text-faint)] uppercase font-semibold">{[p.sku, p.category, `estoque ${Number(p.stock) || 0}${Number(p.stock) > 0 && Number(p.cost) > 0 ? ` (${formatCurrency(Number(p.stock) * Number(p.cost))})` : ""}`].filter(Boolean).join(" • ")}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-mono font-black text-[var(--color-primary-blue)]">{formatCurrency(Number(p.price) || 0)}</span>
                  {(() => {
                    const ja = availableProducts.find((x: any) => x.externo_sistema === p.externo_sistema && String(x.externo_id) === String(p.externo_id));
                    const marcado = !!ja && interesseIds.includes(ja.id);
                    return (
                      <button
                        type="button"
                        disabled={marcandoMax === p.id}
                        onClick={(e) => { e.stopPropagation(); marcarMax(p); }}
                        title={marcado ? "Remover marcação de interesse" : "Marcar como produto de interesse (sem criar proposta)"}
                        className={cn("w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer", marcado ? "bg-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)]" : "bg-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)]")}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    );
                  })()}
                </div>
              </div>
            ))}
            {listaMax.loading && <p className="col-span-full text-[10px] text-center text-[var(--color-text-muted)]">Carregando…</p>}
            {!listaMax.loading && listaMax.rows.length === 0 && <p className="col-span-full text-xs text-center text-[var(--color-text-muted)] py-4">Nenhum produto encontrado.</p>}
            {!listaMax.loading && listaMax.total > listaMax.rows.length && (
              <button type="button" onClick={() => setLimiteMax((n) => n + 60)} className="col-span-full py-2 border border-dashed border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] text-xs font-bold cursor-pointer bg-transparent">
                Carregar mais ({(listaMax.total - listaMax.rows.length).toLocaleString("pt-BR")})
              </button>
            )}
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className={cn("grid grid-cols-1 gap-2 max-h-[360px] overflow-y-auto scrollbar-thin pr-1", filteredProducts.length <= 10 && "sm:grid-cols-2")}>
            {filteredProducts.map((prod) => {
              const isMarked = interesseIds.includes(prod.id);
              return (
                <div
                  key={prod.id}
                  onDoubleClick={() => toggleInteresse(prod.id)}
                  title="Duplo clique: marcar/desmarcar como produto de interesse"
                  className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:border-[var(--color-primary-blue)]/50 hover:bg-[var(--color-primary-blue)]/5 transition-all flex items-center justify-between gap-2 cursor-pointer select-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{prod.name}</p>
                    <span className="text-[9px] text-[var(--color-text-faint)] uppercase font-semibold">
                      {prod.category} {prod.recurrence && "• Recorrente"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-mono font-black text-[var(--color-primary-blue)]">{formatCurrency(Number(prod.price) || 0)}</span>
                    <button
                      type="button"
                      onClick={() => toggleInteresse(prod.id)}
                      title={isMarked ? "Remover marcação de interesse" : "Marcar como produto de interesse (sem criar proposta)"}
                      className={cn(
                        "w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer",
                        isMarked ? "bg-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)]" : "bg-[var(--color-border-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)]"
                      )}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Package}
            title="Nenhum produto no catálogo"
            description="Use o botão '+ Novo Produto' pra cadastrar."
            className="py-6"
          />
        )}
      </Card>

      <AddProdutoLeadModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        availableProducts={availableProducts}
        initialProductId={prefillProductId}
        initialProductIds={prefillProductIds}
        existingProposal={editingExistingProposal && existingProposal ? { id: existingProposal.id, titulo: existingProposal.titulo, status: existingProposal.status, valor: existingProposal.valor } : null}
        existingItems={editingExistingProposal ? existingProposalItems : []}
        leadId={leadId}
        leadName={leadName}
        companyName={companyName}
        seller={seller}
        onDone={handleAddProdutoDone}
      />

      <NovaPropostaWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        availableProducts={availableProducts}
        initialProductIds={interesseIds}
        leadId={leadId}
        leadName={leadName}
        companyName={companyName}
        seller={seller}
        onDone={handleAddProdutoDone}
      />

      <NovaPropostaWizard
        isOpen={isEditWizardOpen}
        onClose={() => setIsEditWizardOpen(false)}
        availableProducts={availableProducts}
        existingProposal={existingProposal}
        existingItems={existingProposalItems}
        leadId={leadId}
        leadName={leadName}
        companyName={companyName}
        seller={seller}
        onDone={handleAddProdutoDone}
        onEditContract={handleEditContract}
      />

      <PropostaEditorWordModal
        isOpen={isWordModalOpen}
        onClose={() => setIsWordModalOpen(false)}
        proposalData={currentProposalData}
        onSaveProposal={async (updated) => {
          setCurrentProposalData(updated);
          if (updated.id && updateProposal) {
            await updateProposal(updated.id, {
              titulo: updated.titulo,
              cliente: updated.cliente,
              vendedor: updated.vendedor,
              valor: updated.valor,
              validade: updated.validade,
              status: updated.status,
              decisor_nome: updated.decisor_nome,
              decisor_cargo: updated.decisor_cargo,
              conteudo_texto: updated.conteudo_texto,
            });
          }
        }}
      />
    </div>
  );
}
