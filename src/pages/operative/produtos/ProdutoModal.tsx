import React from "react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Package, DollarSign, Layers, FileSpreadsheet, X, Check, ArrowLeft, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { Product, ProductType, ProductAttachment } from "../../../types";
import { ProdutoTabInfo } from "./produto-modal/ProdutoTabInfo";
import { ProdutoTabComercial } from "./produto-modal/ProdutoTabComercial";
import { ProdutoTabEstoque } from "./produto-modal/ProdutoTabEstoque";
import { useNicheProfiles } from "./useNicheProfiles";
import { hasStockFocus } from "./nicheProfiles";
import { ProdutoTabArquivos } from "./produto-modal/ProdutoTabArquivos";

const TABS = [
  { id: "info",      label: "Cadastro",           icon: Package        },
  { id: "comercial", label: "Comercial & Margem",  icon: DollarSign     },
  { id: "estoque",   label: "Estoque & Logística", icon: Layers         },
  { id: "arquivos",  label: "Mídia & Anexos",      icon: FileSpreadsheet },
] as const;

type TabId = typeof TABS[number]["id"];

const STEP_NAMES: Record<TabId, string> = {
  info: "Geral",
  comercial: "Preços",
  estoque: "Estoque",
  arquivos: "Mídia",
};

export interface ProdutoModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingProduct: Product | null;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  simulateTax: boolean;
  setSimulateTax: (val: boolean) => void;
  attachments: ProductAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<ProductAttachment[]>>;
  draftProductId: string;
  activeTenantId?: string;
  clientSearch: string;
  setClientSearch: (v: string) => void;
  clientId: string;
  clientName: string;
  showClientDropdown: boolean;
  setShowClientDropdown: (v: boolean) => void;
  filteredClients: any[];
  handleSelectClient: (c: any) => void;
  clearClient: () => void;
  formName: string; setFormName: (v: string) => void;
  formSKU: string; setFormSKU: (v: string) => void;
  formCategory: string; setFormCategory: (v: string) => void;
  formType: ProductType; setFormType: (v: ProductType) => void;
  formTypeAttributes: Record<string, string | number | boolean>;
  setFormTypeAttributes: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>;
  formPrice: string; setFormPrice: (v: string) => void;
  formCost: string; setFormCost: (v: string) => void;
  formCommission: string; setFormCommission: (v: string) => void;
  formStockMin: string; setFormStockMin: (v: string) => void;
  formStockMax: string; setFormStockMax: (v: string) => void;
  formProvider: string; setFormProvider: (v: string) => void;
  formTags: string; setFormTags: (v: string) => void;
  formIsBestSeller: boolean; setFormIsBestSeller: (v: boolean) => void;
  formDimensions: string; setFormDimensions: (v: string) => void;
  formWeight: string; setFormWeight: (v: string) => void;
  formMaterial: string; setFormMaterial: (v: string) => void;
  formDescription: string; setFormDescription: (v: string) => void;
  formCurrentStock: string; setFormCurrentStock: (v: string) => void;
  formIsRecurring?: boolean; setFormIsRecurring?: (v: boolean) => void;
  formBillingCycle?: string; setFormBillingCycle?: (v: string) => void;
  formContractMonths?: string; setFormContractMonths?: (v: string) => void;
  formHasImplementation?: boolean; setFormHasImplementation?: (v: boolean) => void;
  formImplementationFee?: string; setFormImplementationFee?: (v: string) => void;
  formHasLoyalty?: boolean; setFormHasLoyalty?: (v: boolean) => void;
  formLoyaltyMonths?: string; setFormLoyaltyMonths?: (v: string) => void;
  formEarlyTerminationFee?: string; setFormEarlyTerminationFee?: (v: string) => void;
  categories: string[];
  typeOptions?: ProductType[];
  handleSaveProduct: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function ProdutoModal(props: ProdutoModalProps) {
  const profiles = useNicheProfiles();
  if (!props.isOpen) return null;
  const varejoFisico = hasStockFocus(profiles, props.formType);

  // Aba Estoque sempre disponível para permitir controle de unidades/licenças de qualquer produto
  const visibleTabs = TABS;
  const tabIds = visibleTabs.map(t => t.id);
  const curIdx = tabIds.indexOf(props.activeTab);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <Card className="w-full max-w-2xl bg-[var(--color-surface)] border border-white/10 shadow-3xl rounded-2xl overflow-hidden flex flex-col max-h-[92vh] ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">

        {/* Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-start bg-white/[0.02] shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#2563EB]/10 rounded-lg flex items-center justify-center text-[#2563EB]">
                <Package className="w-4 h-4" />
              </div>
              <h3 className="font-black text-sm sm:text-base text-white uppercase tracking-tight">
                {props.editingProduct ? "Editar Produto / Serviço" : "Cadastrar Novo Item ERP"}
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Mapeamento fiscal, controle de estoque, vigência recorrente e parâmetros comerciais integrados.
            </p>
          </div>
          <button type="button" onClick={props.onClose}
            className="text-slate-300 hover:text-white p-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-xl transition-colors ml-4 shrink-0 cursor-pointer shadow-sm">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 py-2 border-b border-white/5 bg-[var(--color-surface)] flex gap-1 overflow-x-auto scrollbar-none shrink-0">
          {visibleTabs.map(t => {
            const IconComp = t.icon;
            const isActive = props.activeTab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => props.setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  isActive ? "bg-[#2563EB]/10 text-[#2563EB] border border-[#2563EB]/20" : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}>
                <IconComp className={`w-3.5 h-3.5 ${isActive ? "text-[#2563EB]" : "text-slate-400"}`} />
                <span>{t.label}</span>
                {varejoFisico && t.id === "estoque" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Controle de estoque do varejo" />}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <form id="produto-erp-form" onSubmit={props.handleSaveProduct} className="flex-1 overflow-y-auto p-6 space-y-6">
          <motion.div
            key={props.activeTab}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
          >
            {props.activeTab === "info" && <ProdutoTabInfo {...props} />}
            {props.activeTab === "comercial" && (
              <ProdutoTabComercial
                formPrice={props.formPrice} setFormPrice={props.setFormPrice}
                formCost={props.formCost} setFormCost={props.setFormCost}
                formCommission={props.formCommission} setFormCommission={props.setFormCommission}
                simulateTax={props.simulateTax} setSimulateTax={props.setSimulateTax}
                formIsRecurring={props.formIsRecurring} setFormIsRecurring={props.setFormIsRecurring}
                formBillingCycle={props.formBillingCycle} setFormBillingCycle={props.setFormBillingCycle}
                formContractMonths={props.formContractMonths} setFormContractMonths={props.setFormContractMonths}
                formHasImplementation={props.formHasImplementation} setFormHasImplementation={props.setFormHasImplementation}
                formImplementationFee={props.formImplementationFee} setFormImplementationFee={props.setFormImplementationFee}
                formHasLoyalty={props.formHasLoyalty} setFormHasLoyalty={props.setFormHasLoyalty}
                formLoyaltyMonths={props.formLoyaltyMonths} setFormLoyaltyMonths={props.setFormLoyaltyMonths}
                formEarlyTerminationFee={props.formEarlyTerminationFee} setFormEarlyTerminationFee={props.setFormEarlyTerminationFee}
                formType={props.formType}
              />
            )}
            {props.activeTab === "estoque" && (
              <ProdutoTabEstoque
                formStockMin={props.formStockMin} setFormStockMin={props.setFormStockMin}
                formStockMax={props.formStockMax} setFormStockMax={props.setFormStockMax}
                formCurrentStock={props.formCurrentStock} setFormCurrentStock={props.setFormCurrentStock}
                formProvider={props.formProvider} setFormProvider={props.setFormProvider}
                formDimensions={props.formDimensions} setFormDimensions={props.setFormDimensions}
                formWeight={props.formWeight} setFormWeight={props.setFormWeight}
                formMaterial={props.formMaterial} setFormMaterial={props.setFormMaterial}
                formType={props.formType}
                formTypeAttributes={props.formTypeAttributes} setFormTypeAttributes={props.setFormTypeAttributes}
              />
            )}
            {props.activeTab === "arquivos" && (
              <ProdutoTabArquivos
                attachments={props.attachments}
                setAttachments={props.setAttachments}
                productId={props.editingProduct?.id || props.draftProductId}
                tenantId={props.activeTenantId}
              />
            )}
          </motion.div>
        </form>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center bg-white/[0.01] gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {visibleTabs.map((step, index) => {
              const isCurrent = props.activeTab === step.id;
              const isCompleted = curIdx > index;
              const stepName = STEP_NAMES[step.id];
              return (
                <button key={step.id} type="button" onClick={() => props.setActiveTab(step.id)} title={stepName}>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${isCurrent ? "w-6 bg-[#2563EB]" : isCompleted ? "w-4 bg-emerald-500" : "w-2 bg-slate-700 hover:bg-slate-600"}`} />
                    {isCurrent && <span className="text-[9px] text-slate-400 font-extrabold uppercase mr-1">{stepName}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 w-full sm:w-auto justify-end">
            {curIdx > 0 && (
              <button type="button" onClick={() => props.setActiveTab(tabIds[curIdx - 1])}
                className="flex-1 sm:flex-initial h-9 inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-black text-xs rounded-xl px-4 shadow-sm cursor-pointer transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar
              </button>
            )}
            {curIdx < tabIds.length - 1 ? (
              <Button type="button" onClick={() => props.setActiveTab(tabIds[curIdx + 1])}
                className="flex-1 sm:flex-initial h-9 bg-[#2563EB] hover:bg-blue-600 !text-white font-black text-xs rounded-xl px-4 gap-1.5 shadow-md shadow-blue-500/25 cursor-pointer">
                Avançar <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button type="submit" form="produto-erp-form"
                className="flex-1 sm:flex-initial h-9 bg-emerald-600 hover:bg-emerald-500 !text-white font-black text-xs rounded-xl px-5 gap-1.5 shadow-md shadow-emerald-600/25 cursor-pointer">
                <Check className="w-4 h-4" /> Salvar Produto ERP
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
