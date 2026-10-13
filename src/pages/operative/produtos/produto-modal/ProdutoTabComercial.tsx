import { DollarSign, Coins, Percent, TrendingUp, RotateCw, Wrench, Calendar, Sparkles, Lock, AlertTriangle } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { isUniqueAssetType } from "../typeSchemas";

interface ProdutoTabComercialProps {
  formPrice: string;
  setFormPrice: (v: string) => void;
  formCost: string;
  setFormCost: (v: string) => void;
  formCommission: string;
  setFormCommission: (v: string) => void;
  simulateTax: boolean;
  setSimulateTax: (v: boolean) => void;
  formIsRecurring?: boolean;
  setFormIsRecurring?: (v: boolean) => void;
  formBillingCycle?: string;
  setFormBillingCycle?: (v: string) => void;
  formContractMonths?: string;
  setFormContractMonths?: (v: string) => void;
  formHasImplementation?: boolean;
  setFormHasImplementation?: (v: boolean) => void;
  formImplementationFee?: string;
  setFormImplementationFee?: (v: string) => void;
  formHasLoyalty?: boolean;
  setFormHasLoyalty?: (v: boolean) => void;
  formLoyaltyMonths?: string;
  setFormLoyaltyMonths?: (v: string) => void;
  formEarlyTerminationFee?: string;
  setFormEarlyTerminationFee?: (v: string) => void;
  formType?: string;
}

export function ProdutoTabComercial({
  formPrice,
  setFormPrice,
  formCost,
  setFormCost,
  formCommission,
  setFormCommission,
  simulateTax,
  setSimulateTax,
  formIsRecurring = false,
  setFormIsRecurring,
  formBillingCycle = "Mensal",
  setFormBillingCycle,
  formContractMonths = "12",
  setFormContractMonths,
  formHasImplementation = false,
  setFormHasImplementation,
  formImplementationFee = "0",
  setFormImplementationFee,
  formHasLoyalty = false,
  setFormHasLoyalty,
  formLoyaltyMonths = "12",
  setFormLoyaltyMonths,
  formEarlyTerminationFee = "0",
  setFormEarlyTerminationFee,
  formType,
}: ProdutoTabComercialProps) {
  const inputCls =
    "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-primary-blue)] font-mono font-bold transition-all";

  const uniqueAsset = isUniqueAssetType(formType);
  const p = parseFloat(formPrice) || 0;
  const c = parseFloat(formCost) || 0;
  const commPercent = parseFloat(formCommission) || 0;
  const commissionVal = (p * commPercent) / 100;
  const taxRate = simulateTax ? 0.08 : 0;
  const estimatedTaxVal = p * taxRate;
  const netProfitRaw = Math.max(0, p - c - commissionVal - estimatedTaxVal);
  const netMarginVal = p > 0 ? Math.round((netProfitRaw / p) * 1000) / 10 : 0;

  const contractMonthsNum = parseInt(formContractMonths) || 12;
  const implFeeNum = parseFloat(formImplementationFee) || 0;
  const totalContractLtv = formIsRecurring ? implFeeNum + p * contractMonthsNum : p + implFeeNum;

  let rentabilityLabel = "Digite valores acima";
  let rentabilityColor = "text-slate-400 bg-slate-400/10 border-slate-400/20";
  if (p > 0) {
    if (netMarginVal >= 55) {
      rentabilityLabel = "Rentabilidade Excelente";
      rentabilityColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    } else if (netMarginVal >= 30) {
      rentabilityLabel = "Rentabilidade Saudável";
      rentabilityColor = "text-blue-400 bg-blue-500/10 border-blue-500/20";
    } else {
      rentabilityLabel = "Rentabilidade Baixa — Ajuste o Preço";
      rentabilityColor = "text-rose-400 bg-rose-500/10 border-rose-500/20";
    }
  }

  return (
    <div className="space-y-5">
      {/* Step Banner */}
      <div className="bg-[var(--color-surface-elevated)] border border-white/5 p-4 rounded-xl flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400 shrink-0 font-black text-xs font-mono">
          2
        </div>
        <div>
          <h4 className="text-xs font-black text-white uppercase tracking-wider">
            Comercial, Recorrência & Implantação
          </h4>
          <p className="text-[10px] text-slate-500">
            Configure preços, mensalidades recorrentes, meses de vigência e taxa de setup/onboarding.
          </p>
        </div>
      </div>

      {/* ── PARÂMETROS DE RECORRÊNCIA E IMPLANTAÇÃO (SOFTWARE / SISTEMA) ── */}
      {!uniqueAsset && (
      <div className="bg-violet-500/5 border border-violet-500/25 p-4.5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-violet-500/15 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <h5 className="text-xs font-black uppercase text-[var(--color-text-primary)] tracking-wide">
              Modelo de Cobrança & Vigência (SaaS / Serviços)
            </h5>
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono">Definição Contratual</span>
        </div>

        {/* Toggles de Recorrência e Implantação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Toggle Recorrente */}
          <button
            type="button"
            role="switch"
            aria-checked={!!formIsRecurring}
            onClick={() => setFormIsRecurring && setFormIsRecurring(!formIsRecurring)}
            className={cn(
              "w-full text-left p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3",
              formIsRecurring
                ? "bg-violet-500/10 border-violet-500/50 text-[var(--color-text-primary)] shadow-sm"
                : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]"
            )}
          >
            <div
              className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center mt-0.5 transition-colors shrink-0",
                formIsRecurring ? "bg-violet-500 text-white" : "bg-[var(--color-surface-elevated)] text-[var(--color-text-faint)]"
              )}
            >
              <RotateCw className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight text-[var(--color-text-primary)]">Cobrança Recorrente</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Mensalidade periódica (Assinatura, SaaS, Manutenção)
              </p>
            </div>
          </button>

          {/* Toggle Implantação */}
          <button
            type="button"
            role="switch"
            aria-checked={!!formHasImplementation}
            onClick={() => setFormHasImplementation && setFormHasImplementation(!formHasImplementation)}
            className={cn(
              "w-full text-left p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3",
              formHasImplementation
                ? "bg-fuchsia-500/10 border-fuchsia-500/50 text-[var(--color-text-primary)] shadow-sm"
                : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]"
            )}
          >
            <div
              className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center mt-0.5 transition-colors shrink-0",
                formHasImplementation ? "bg-fuchsia-500 text-white" : "bg-[var(--color-surface-elevated)] text-[var(--color-text-faint)]"
              )}
            >
              <Wrench className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight text-[var(--color-text-primary)]">Taxa de Implantação / Setup</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Onboarding, parametrização técnica inicial ou treinamento
              </p>
            </div>
          </button>
        </div>

        {/* Campos Condicionais de Recorrência (Meses e Ciclo) */}
        {formIsRecurring && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-top-1">
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--color-text-muted)] font-extrabold uppercase block tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3 text-violet-600 dark:text-violet-400" /> Duração do Contrato (Quantos Meses?)
              </label>
              <div className="flex items-center gap-1.5">
                {["1", "3", "6", "12", "24"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFormContractMonths && setFormContractMonths(m)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer",
                      formContractMonths === m
                        ? "bg-violet-600 border-violet-500 text-white shadow-sm"
                        : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    )}
                  >
                    {m}m
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  value={formContractMonths}
                  onChange={(e) => setFormContractMonths && setFormContractMonths(e.target.value)}
                  placeholder="Meses"
                  className="w-16 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-2 py-1 text-xs text-[var(--color-text-primary)] font-mono text-center"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--color-text-muted)] font-extrabold uppercase block tracking-wider">
                Ciclo de Cobrança
              </label>
              <select
                value={formBillingCycle}
                onChange={(e) => setFormBillingCycle && setFormBillingCycle(e.target.value)}
                className={inputCls}
              >
                <option value="Mensal">Mensal</option>
                <option value="Trimestral">Trimestral</option>
                <option value="Semestral">Semestral</option>
                <option value="Anual">Anual</option>
              </select>
            </div>
          </div>
        )}

        {/* Fidelidade: prazo mínimo de permanência com multa por cancelamento
            antecipado — separado da Duração do Contrato acima (aquela é só a
            vigência normal; fidelidade é o compromisso mínimo com penalidade).
            Sempre visível (mesmo desativado quando o produto não é recorrente)
            — escondê-la por completo fazia parecer que a opção nem existia. */}
        <div className="pt-3 border-t border-violet-500/15 space-y-3">
          <button
            type="button"
            role="switch"
            aria-checked={!!(formIsRecurring && formHasLoyalty)}
            disabled={!formIsRecurring}
            onClick={() => formIsRecurring && setFormHasLoyalty && setFormHasLoyalty(!formHasLoyalty)}
            className={cn(
              "w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3",
              !formIsRecurring
                ? "opacity-50 cursor-not-allowed bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)]"
                : formHasLoyalty
                  ? "cursor-pointer bg-amber-500/10 border-amber-500/50 text-[var(--color-text-primary)] shadow-sm"
                  : "cursor-pointer bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]"
            )}
          >
            <div
              className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center mt-0.5 transition-colors shrink-0",
                formIsRecurring && formHasLoyalty ? "bg-amber-500 text-white" : "bg-[var(--color-surface-elevated)] text-[var(--color-text-faint)]"
              )}
            >
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight text-[var(--color-text-primary)]">Contrato com Fidelidade</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                {formIsRecurring
                  ? "Prazo mínimo de permanência com multa por cancelamento antecipado"
                  : "Disponível só para produtos com Cobrança Recorrente ativada acima"}
              </p>
            </div>
          </button>

          {formIsRecurring && formHasLoyalty && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-1 animate-in fade-in slide-in-from-top-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold uppercase block tracking-wider flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Prazo de Fidelidade (Meses)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {["6", "12", "24"].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setFormLoyaltyMonths && setFormLoyaltyMonths(m)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer",
                          formLoyaltyMonths === m
                            ? "bg-amber-600 border-amber-500 text-white shadow-sm"
                            : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                        )}
                      >
                        {m}m
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      value={formLoyaltyMonths}
                      onChange={(e) => setFormLoyaltyMonths && setFormLoyaltyMonths(e.target.value)}
                      placeholder="Meses"
                      className="w-16 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-2 py-1 text-xs text-[var(--color-text-primary)] font-mono text-center"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold uppercase block tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Multa por Cancelamento Antecipado (%)
                  </label>
                  <div className="relative max-w-[140px]">
                    <Percent className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={formEarlyTerminationFee}
                      onChange={(e) => setFormEarlyTerminationFee && setFormEarlyTerminationFee(e.target.value)}
                      placeholder="Ex: 100"
                      className={`${inputCls} pl-8 text-amber-700 dark:text-amber-300`}
                    />
                  </div>
                  <p className="text-[9px] text-[var(--color-text-faint)]">
                    Aplicado sobre as mensalidades restantes até o fim da fidelidade
                  </p>
                </div>
              </div>
            )}
        </div>

        {/* Campo Condicional de Taxa de Implantação */}
        {formHasImplementation && (
          <div className="space-y-1.5 pt-2 animate-in fade-in slide-in-from-top-1">
            <label className="text-[10px] text-fuchsia-600 dark:text-fuchsia-400 font-extrabold uppercase block tracking-wider flex items-center gap-1">
              <Wrench className="w-3 h-3" /> Valor da Implantação / Setup Fee (R$)
            </label>
            <div className="relative max-w-xs">
              <DollarSign className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="number"
                step="any"
                value={formImplementationFee}
                onChange={(e) => setFormImplementationFee && setFormImplementationFee(e.target.value)}
                placeholder="Ex: 1500"
                className={`${inputCls} pl-9 text-fuchsia-700 dark:text-fuchsia-300`}
              />
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── PREÇO DE VENDA, CUSTO E COMISSÃO ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider">
            {formIsRecurring ? "Valor da Mensalidade (R$/mês)" : "Preço de Venda (R$)"}{" "}
            <strong className="text-rose-400">*</strong>
          </label>
          <div className="relative">
            <DollarSign className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="number"
              step="any"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
              placeholder="Ex: 450"
              className={`${inputCls} pl-9 text-emerald-400`}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider">
            Custo Operacional / Aquisição (R$)
          </label>
          <div className="relative">
            <Coins className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="number"
              step="any"
              value={formCost}
              onChange={(e) => setFormCost(e.target.value)}
              placeholder="Ex: 120"
              className={`${inputCls} pl-9 text-slate-300`}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider">
            Comissão Vendedor (%)
          </label>
          <div className="relative">
            <Percent className="w-3.5 h-3.5 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="number"
              value={formCommission}
              onChange={(e) => setFormCommission(e.target.value)}
              placeholder="Ex: 5"
              className={`${inputCls} pl-9 text-cyan-400`}
            />
          </div>
        </div>
      </div>

      {/* ── CARD DE RENTABILIDADE E LTV CONTRATUAL ── */}
      <div className="border border-white/5 rounded-xl bg-white/[0.01] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Detalhamento de Rentabilidade & LTV
          </h5>
          {p > 0 && (
            <span
              className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${rentabilityColor}`}
            >
              {rentabilityLabel}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
          {[
            {
              label: formIsRecurring ? "Mensalidade (MRR)" : "Faturamento Bruto",
              value: `R$ ${p.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
              cls: "text-white",
            },
            {
              label: "Taxa de Implantação",
              value: formHasImplementation
                ? `R$ ${implFeeNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                : "Sem taxa",
              cls: formHasImplementation ? "text-indigo-400 font-bold" : "text-slate-500",
            },
            {
              label: formIsRecurring ? `Duração (${contractMonthsNum} meses)` : "Custo Origem",
              value: formIsRecurring
                ? `${contractMonthsNum} meses`
                : `-R$ ${c.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
              cls: formIsRecurring ? "text-blue-400 font-bold" : "text-rose-400",
            },
            {
              label: formIsRecurring ? "LTV Total do Contrato" : "Lucro Estimado",
              value: `R$ ${totalContractLtv.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
              cls: "text-emerald-400 font-black",
              highlight: true,
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`p-3 border rounded-xl ${
                item.highlight ? "bg-[#2563EB]/5 border-[#2563EB]/20" : "bg-white/[0.015] border-white/5"
              }`}
            >
              <span className="text-[9px] text-slate-500 uppercase font-black block">{item.label}</span>
              <span className={`text-sm font-bold font-mono block mt-1 ${item.cls}`}>{item.value}</span>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-white/5 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              id="taxSimulationCheck"
              checked={simulateTax}
              onChange={(e) => setSimulateTax(e.target.checked)}
              className="w-4 h-4 rounded text-[#2563EB] focus:ring-[#2563EB] bg-slate-900 border-white/20 cursor-pointer"
            />
            <label htmlFor="taxSimulationCheck" className="text-xs font-semibold text-slate-300 cursor-pointer">
              Simular imposto do Simples Nacional (8%)
            </label>
          </div>
          {p > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-white">
              <span className="text-slate-500 text-[10px] uppercase font-bold">Margem Real Líquida:</span>
              <span className="font-mono font-black text-emerald-400 text-sm">{netMarginVal}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
