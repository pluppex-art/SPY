import { useMemo, useState } from "react";
import { Card } from "../card";
import { Button } from "../button";
import { Badge } from "../badge";
import { EmptyState } from "../empty-state";
import { FileText, Plus, Pencil, Edit3, Check, Package, Search, Tag, X, Info, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { handleDownloadPdf } from "../../../pages/crm/utils/proposalPdf";
import { PropostaEditorWordModal, PropostaEditorData } from "../modals/crm/PropostaEditorWordModal";
import { AddProdutoLeadModal } from "../modals/crm/AddProdutoLeadModal";
import { NovaPropostaWizard } from "../modals/crm/NovaPropostaWizard";
import { cn } from "../../../lib/utils";

interface ProductsSectionProps {
  availableProducts: any[];
  seller: string;
  setAlterationLogs: any;
  leadName?: string;
  companyName?: string;
  leadId?: string;
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
  const { updateProposal, proposals, proposalItems, appSettings, leads, updateLead } = useData();
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
  const toggleInteresse = (productId: string) => {
    if (!leadId) return;
    const next = interesseIds.includes(productId)
      ? interesseIds.filter((id) => id !== productId)
      : [...interesseIds, productId];
    // Enquanto não há proposta, o valor do lead (card do Kanban, cabeçalho, aba Info) é a soma
    // dos preços dos produtos de interesse. Com proposta, o valor real dela manda (recalculado
    // por createProposalWithItems/updateProposal), então aqui não mexe.
    const hasProposal = (proposals || []).some((p: any) => p.lead_id === leadId);
    const interestValue = next.reduce(
      (sum, id) => sum + (Number(availableProducts.find((p) => p.id === id)?.price) || 0), 0);
    updateLead(leadId, {
      customFields: { ...(currentLead?.customFields || {}), produtosInteresseIds: next },
      ...(hasProposal ? {} : { value: interestValue }),
    });
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

  const handleOpenExistingProposal = () => {
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
      itens: existingProposalItems.map((i: any) => ({
        product_name: i.product_name,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        billing_type: i.billing_type,
      })),
    });
    setIsWordModalOpen(true);
  };

  const handleDownloadExistingProposalPdf = () => {
    if (!existingProposal) return;
    handleDownloadPdf(
      {
        id: existingProposal.id,
        cliente: existingProposal.cliente,
        titulo: existingProposal.titulo,
        valor: existingProposal.valor,
        validade: existingProposal.validade,
        vendedor: existingProposal.vendedor || seller || "Consultor S.P.Y.",
        status: existingProposal.status || "Aceita",
      },
      existingProposalItems.map((p: any) => ({
        product_name: p.product_name,
        quantidade: p.quantidade,
        preco_unitario: p.preco_unitario,
      })),
      { logoUrl: empresaDadosBranding?.logoUrl }
    );
    toast.success("PDF da proposta gerado com sucesso!");
  };

  const handleAddProdutoDone = (summary: string) => {
    setAlterationLogs((prev: any[]) => [
      { id: Date.now().toString(), author: seller || "Sistema", desc: summary, time: "Agora" },
      ...prev,
    ]);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
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
                className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{existingProposal.titulo}</p>
              <p className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
                {existingProposalItems.length} {existingProposalItems.length === 1 ? "item" : "itens"}
                {existingProposal.validade && (
                  <> · Válida até {new Date(existingProposal.validade + "T12:00:00").toLocaleDateString("pt-BR")}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <span className="text-sm font-mono font-black text-success">
                {formatCurrency(existingProposal.valor || 0)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenExistingProposal}
                className="h-8 text-xs font-bold gap-1.5 border-success/30 hover:bg-success/10 text-success cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" /> Ver / Editar Proposta
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadExistingProposalPdf}
                className="h-8 text-xs font-bold gap-1.5 border-[var(--color-primary-blue)]/30 hover:bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" /> Baixar PDF
              </Button>
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

          {isProposalAccepted && existingProposalItems.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-[var(--color-border-subtle)]">
              <span className="text-[9px] uppercase font-bold text-[var(--color-text-faint)] block">Itens da Proposta Aprovada:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto scrollbar-thin">
                {existingProposalItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
                    <span className="text-[var(--color-text-primary)] font-medium truncate text-[11px]">{item.product_name}</span>
                    <span className="font-mono text-success text-[11px] font-bold shrink-0 ml-2">
                      {item.quantidade}x {formatCurrency(item.preco_unitario)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
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
              <Button
                type="button"
                size="sm"
                onClick={openAddModalBulk}
                className="h-8 text-[11px] font-bold gap-1.5"
              >
                <FilePlus2 className="w-3.5 h-3.5" /> Criar Proposta ({produtosInteresse.length})
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Produtos ({filteredProducts.length})
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

        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[360px] overflow-y-auto scrollbar-thin pr-1">
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
