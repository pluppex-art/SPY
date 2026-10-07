import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { ArrowUpRight, ArrowDownRight, DollarSign, Repeat, Layers, FileText, AlignLeft, FolderOpen, User, CreditCard, Landmark, Tag, Calendar, CalendarCheck, Hash, Save, X, Info, ListChecks, Wallet } from "lucide-react";
import { Field, FormSection, ModalFooter, ModalTitle, inputCls, selectCls, textareaCls } from "./ModalKit";
import { useData } from "../../../contexts/DataContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import { type Frequencia, addPeriodo, splitInstallments } from "../../../lib/saleCalculator";

type RepeatMode = "none" | "recorrente" | "parcelado";

const PAYMENT_METHODS = ["Pix", "Boleto", "Cartão de Crédito", "Cartão de Débito", "Transferência/TED", "Dinheiro", "Cheque", "Outro"];

const parseTags = (raw: string): string[] => raw.split(",").map(t => t.trim()).filter(Boolean);

interface NovaOperacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Tipo inicial do lançamento. */
  defaultType?: "Pagar" | "Receber";
  /** Quando true, esconde o seletor de tipo — usado em páginas que já são
   * inequivocamente de despesa ou de receita (ex.: Despesas, Contas a Receber). */
  lockType?: boolean;
}

/** Modal único de "Nova Operação" — a junção do formulário de despesa e do
 * formulário de receita do GenericFinanceiroList em um componente
 * standalone, reutilizável em qualquer página do financeiro (relatórios,
 * extrato, dashboards) que não tenha seu próprio botão de lançamento. Troca
 * de tipo (Receita/Despesa) só reclassifica labels e a lista de categorias —
 * os campos são exatamente os mesmos dos dois lados. */
export function NovaOperacaoModal({ isOpen, onClose, defaultType = "Pagar", lockType = false }: NovaOperacaoModalProps) {
  const { addFinanceEntry, financeCategories, addFinanceCategory, financeBankAccounts, financeCentrosCusto, clienteBase } = useData();
  const { formatCurrency } = useLocalization();

  const [type, setType] = useState<"Pagar" | "Receber">(defaultType);
  useEffect(() => { if (isOpen) setType(defaultType); }, [isOpen, defaultType]);

  const categoriasDoTipo = useMemo(
    () => (financeCategories as any[]).filter(c => c.tipo === (type === "Receber" ? "Receita" : "Despesa")),
    [financeCategories, type]
  );
  const contasAtivas = useMemo(() => (financeBankAccounts as any[]).filter(c => !c.arquivada), [financeBankAccounts]);
  const contaPrincipalId = useMemo(() => contasAtivas.find(c => c.is_principal)?.id || "", [contasAtivas]);
  const tipoContato = type === "Receber" ? "CLIENTE" : "FORNECEDOR";
  const contatosSugeridos = useMemo(
    () => (clienteBase as any[]).filter(c => c.tipos?.includes(tipoContato)),
    [clienteBase, tipoContato]
  );
  const resolverContatoId = (nome: string): string | null => contatosSugeridos.find(c => c.name?.toLowerCase() === nome.trim().toLowerCase())?.id || null;

  const [showNovaCategoria, setShowNovaCategoria] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState("");
  const [novaCategoriaSubtipo, setNovaCategoriaSubtipo] = useState<"DESPESA_FIXA" | "DESPESA_VARIAVEL" | "PESSOAS" | "IMPOSTOS">("DESPESA_VARIAVEL");

  const [desc, setDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [centroCustoId, setCentroCustoId] = useState("");
  const [tags, setTags] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("none");
  const [frequency, setFrequency] = useState<Frequencia>("mensal");
  const [ocorrencias, setOcorrencias] = useState("12");
  const [parcelas, setParcelas] = useState("2");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ desc?: string; value?: string; category?: string }>({});

  const resetForm = () => {
    setDesc(""); setNotes(""); setCategoryId("");
    setContaBancariaId(contaPrincipalId); setCentroCustoId(""); setTags("");
    setCounterparty(""); setPaymentMethod(""); setValue(""); setDate(""); setNumeroDocumento(""); setCompetencia(""); setSaving(false);
    setRepeatMode("none"); setFrequency("mensal"); setOcorrencias("12"); setParcelas("2");
    setErrors({}); setShowNovaCategoria(false); setNovaCategoriaNome("");
  };

  useEffect(() => { if (isOpen) resetForm(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isOpen]);

  const handleCriarCategoria = async (): Promise<string | null> => {
    const nome = novaCategoriaNome.trim();
    if (!nome) return null;
    const created = await addFinanceCategory({
      nome,
      tipo: type === "Receber" ? "Receita" : "Despesa",
      subtipo: type === "Receber" ? null : novaCategoriaSubtipo,
    });
    setShowNovaCategoria(false);
    setNovaCategoriaNome("");
    return created?.id ?? null;
  };

  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // Competência é opcional; nas séries (recorrência/parcelas) acompanha o mesmo deslocamento do vencimento.
  const competenciaFields = (i: number) => {
    if (!competencia) return {};
    const base = new Date(competencia + "T12:00:00");
    return { competencia_date: toIso(i === 0 || repeatMode === "none" ? base : addPeriodo(base, frequency, i)) };
  };

  const totalNum = parseFloat(value) || 0;
  const nOcorr = Math.min(60, Math.max(1, parseInt(ocorrencias, 10) || 1));
  const nParc = Math.min(60, Math.max(2, parseInt(parcelas, 10) || 2));
  const serieBase = date ? new Date(date + "T12:00:00") : new Date();
  const serieN = repeatMode === "recorrente" ? nOcorr : repeatMode === "parcelado" ? nParc : 1;
  const ultimaData = serieN > 1 ? addPeriodo(serieBase, frequency, serieN - 1) : serieBase;
  const totalGerado = repeatMode === "recorrente" ? totalNum * nOcorr : totalNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalValor = parseFloat(value) || 0;
    let catId = categoryId;
    if (showNovaCategoria && novaCategoriaNome.trim()) {
      catId = (await handleCriarCategoria()) || "";
    }

    const nextErrors: typeof errors = {};
    if (!desc.trim()) nextErrors.desc = "Informe a descrição do lançamento.";
    if (totalValor <= 0) nextErrors.value = "Informe um valor maior que zero.";
    if (!catId) nextErrors.category = "Selecione ou crie uma categoria.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
    const categoriaSelecionada = categoriasDoTipo.find(c => c.id === catId);
    const baseDate = date ? new Date(date + "T12:00:00") : new Date();
    const baseFields = {
      description: desc,
      notes: notes || null,
      category: categoriaSelecionada?.nome || "Geral",
      category_id: catId,
      conta_bancaria_id: contaBancariaId || null,
      centro_custo_id: centroCustoId || null,
      tags: parseTags(tags),
      counterparty: counterparty || null,
      contato_id: counterparty ? resolverContatoId(counterparty) : null,
      payment_method: paymentMethod || null,
      numero_documento: numeroDocumento.trim() || null,
      status: "A Vencer" as const,
      type,
    };

    if (repeatMode === "recorrente") {
      const ocs = Math.max(1, parseInt(ocorrencias, 10) || 1);
      const groupId = crypto.randomUUID();
      for (let i = 0; i < ocs; i++) {
        const dataOcorrencia = i === 0 ? baseDate : addPeriodo(baseDate, frequency, i);
        addFinanceEntry({ ...baseFields, value: totalValor, date: dataOcorrencia.toLocaleDateString("pt-BR"), ...competenciaFields(i), is_recurring: true, recurring_frequency: frequency, recurring_group_id: groupId }, { silent: i > 0 });
      }
      if (ocs > 1) toast.success(`${ocs} lançamentos recorrentes gerados.`);
    } else if (repeatMode === "parcelado") {
      const numParcelas = Math.max(2, parseInt(parcelas, 10) || 2);
      const valores = splitInstallments(totalValor, numParcelas);
      const groupId = crypto.randomUUID();
      valores.forEach((valorParcela, i) => {
        const dataParcela = i === 0 ? baseDate : addPeriodo(baseDate, frequency, i);
        addFinanceEntry({ ...baseFields, value: valorParcela, date: dataParcela.toLocaleDateString("pt-BR"), ...competenciaFields(i), installment_group_id: groupId, installment_number: i + 1, installment_total: numParcelas }, { silent: i > 0 });
      });
      toast.success(`${numParcelas} parcelas geradas (${formatCurrency(valores[0])} cada, ajustado na última).`);
    } else {
      await addFinanceEntry({ ...baseFields, value: totalValor, date: baseDate.toLocaleDateString("pt-BR"), ...competenciaFields(0) });
      toast.success(type === "Pagar" ? "Despesa lançada." : "Recebimento lançado.");
    }

    onClose();
    } finally {
      setSaving(false);
    }
  };

  const isPagar = type === "Pagar";
  const FREQ_OPTS = [["semanal", "Semanal"], ["quinzenal", "Quinzenal"], ["mensal", "Mensal"], ["bimestral", "Bimestral"], ["trimestral", "Trimestral"], ["semestral", "Semestral"], ["anual", "Anual"]];
  const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR");

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!saving) onClose(); }}
      title={<ModalTitle icon={DollarSign} tone={isPagar ? "danger" : "success"} title={isPagar ? "Novo Gasto / Despesa" : "Novo Recebimento / Receita"} subtitle="Registre um lançamento financeiro com classificação, vencimento e, se quiser, recorrência ou parcelas." />}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {!lockType && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setType("Pagar"); setCategoryId(""); }}
              className={cn("flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-bold transition-colors cursor-pointer",
                type === "Pagar" ? "bg-[var(--color-danger)]/10 border-[var(--color-danger)]/40 text-[var(--color-danger)]" : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}
            >
              <ArrowDownRight className="w-3.5 h-3.5" /> Despesa
            </button>
            <button
              type="button"
              onClick={() => { setType("Receber"); setCategoryId(""); }}
              className={cn("flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-bold transition-colors cursor-pointer",
                type === "Receber" ? "bg-[var(--color-success)]/10 border-[var(--color-success)]/40 text-[var(--color-success)]" : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}
            >
              <ArrowUpRight className="w-3.5 h-3.5" /> Receita
            </button>
          </div>
        )}

        <FormSection icon={FileText} title="Identificação">
          <Field label="Nome do lançamento" icon={FileText} required error={errors.desc}>
            <input
              type="text"
              autoFocus
              placeholder="Ex: Servidor AWS, Licença de Software, Fatura..."
              value={desc}
              onChange={(e) => { setDesc(e.target.value); setErrors(prev => ({ ...prev, desc: undefined })); }}
              className={inputCls(!!errors.desc)}
            />
          </Field>
          <Field label="Descrição / Observações" icon={AlignLeft} hint={`${notes.length}/500`}>
            <textarea rows={2} maxLength={500} placeholder="Detalhes adicionais deste lançamento (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} />
          </Field>
        </FormSection>

        <FormSection icon={FolderOpen} title="Classificação">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Categoria financeira" icon={FolderOpen} required error={errors.category} hint={categoriasDoTipo.length === 0 && !showNovaCategoria ? "Nenhuma categoria deste tipo ainda — crie uma na lista." : undefined}>
              {!showNovaCategoria ? (
                <select
                  value={categoryId}
                  onChange={(e) => {
                    if (e.target.value === "__nova__") { setShowNovaCategoria(true); return; }
                    setCategoryId(e.target.value);
                    setErrors(prev => ({ ...prev, category: undefined }));
                  }}
                  className={selectCls(!!errors.category)}
                >
                  <option value="">Selecione...</option>
                  {categoriasDoTipo.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  <option value="__nova__">+ Criar nova categoria...</option>
                </select>
              ) : (
                <div className="flex gap-1.5">
                  <input type="text" autoFocus placeholder="Nome da nova categoria" value={novaCategoriaNome} onChange={(e) => setNovaCategoriaNome(e.target.value)} className={inputCls(!!errors.category)} />
                  <button type="button" onClick={() => { setShowNovaCategoria(false); setNovaCategoriaNome(""); }} title="Cancelar nova categoria" className="h-9 w-9 shrink-0 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] flex items-center justify-center cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
              {isPagar && showNovaCategoria && (
                <select value={novaCategoriaSubtipo} onChange={(e) => setNovaCategoriaSubtipo(e.target.value as typeof novaCategoriaSubtipo)} className={`${selectCls()} mt-1.5`}>
                  <option value="DESPESA_FIXA">Despesa Fixa</option>
                  <option value="DESPESA_VARIAVEL">Despesa Variável</option>
                  <option value="PESSOAS">Pessoas</option>
                  <option value="IMPOSTOS">Impostos</option>
                </select>
              )}
            </Field>
            <Field
              label={isPagar ? "Fornecedor" : "Cliente"}
              icon={User}
              hint={counterparty.trim() ? (resolverContatoId(counterparty) ? "Contato cadastrado: será vinculado ao lançamento." : "Não está nos Contatos: fica só como texto livre.") : "Digite ou escolha um contato cadastrado."}
            >
              <input
                type="text"
                list="contatos-sugeridos-nova-operacao"
                placeholder={isPagar ? "Ex: AWS, Fornecedor X" : "Ex: Nome do cliente"}
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                className={inputCls()}
              />
              <datalist id="contatos-sugeridos-nova-operacao">
                {contatosSugeridos.map((c: any) => <option key={c.id} value={c.name} />)}
              </datalist>
            </Field>
            <Field label="Centro de custo" icon={Wallet}>
              <select value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)} className={selectCls()}>
                <option value="">Não informado</option>
                {(financeCentrosCusto as any[]).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <Field label="Tags" icon={Tag} hint={parseTags(tags).length > 0 ? `${parseTags(tags).length} tag(s): ${parseTags(tags).join(", ")}` : "Separadas por vírgula."}>
              <input type="text" placeholder="ex: marketing, anual" value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls()} />
            </Field>
          </div>
        </FormSection>

        <FormSection icon={CreditCard} title={isPagar ? "Pagamento" : "Recebimento"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={`Forma de ${isPagar ? "pagamento" : "recebimento"}`} icon={CreditCard}>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={selectCls()}>
                <option value="">Não informado</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Conta bancária" icon={Landmark} hint={contasAtivas.length === 0 ? "Nenhuma conta ativa cadastrada." : undefined}>
              <select value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)} className={selectCls()}>
                <option value="">Não vinculada</option>
                {contasAtivas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}{c.is_principal ? " (Principal)" : ""}</option>)}
              </select>
            </Field>
            <Field label="Nº da nota fiscal / documento" icon={Hash} hint="O arquivo (PDF/XML) pode ser anexado depois, em Editar lançamento.">
              <input type="text" placeholder="Ex: NF-e 12345" value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} className={inputCls()} />
            </Field>
            <Field label="Competência" icon={CalendarCheck} hint="Mês a que o lançamento se refere, se diferente do vencimento.">
              <input type="date" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={inputCls()} />
            </Field>
            <Field label={repeatMode === "parcelado" ? "Valor total (R$)" : "Valor (R$)"} icon={DollarSign} required error={errors.value}>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={value}
                onChange={(e) => { setValue(e.target.value); setErrors(prev => ({ ...prev, value: undefined })); }}
                className={`${inputCls(!!errors.value)} font-mono`}
              />
            </Field>
            <Field label={repeatMode === "none" ? "Data de vencimento" : "1º vencimento"} icon={Calendar} hint={!date ? "Em branco = hoje." : undefined}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls()} />
            </Field>
          </div>
        </FormSection>

        <FormSection icon={Repeat} title="Tipo de lançamento">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { id: "none" as const, icon: DollarSign, title: "Único", desc: isPagar ? "Valor a pagar uma vez" : "Valor a receber uma vez" },
              { id: "recorrente" as const, icon: Repeat, title: "Recorrente", desc: "Repete periodicamente" },
              { id: "parcelado" as const, icon: Layers, title: "Parcelado", desc: "Dividido em parcelas" },
            ]).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRepeatMode(opt.id)}
                className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer", repeatMode === opt.id ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40" : "bg-[var(--color-surface)] border-[var(--color-border-subtle)] hover:border-[var(--color-primary-blue)]/30")}
              >
                <opt.icon className={cn("w-4 h-4 shrink-0", repeatMode === opt.id ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)]")} />
                <span className="min-w-0">
                  <span className={cn("block text-xs font-bold", repeatMode === opt.id ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-primary)]")}>{opt.title}</span>
                  <span className="block text-[10px] text-[var(--color-text-muted)] leading-tight">{opt.desc}</span>
                </span>
              </button>
            ))}
          </div>

          {repeatMode !== "none" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {repeatMode === "recorrente" ? (
                <Field label="Repetir por quantas vezes" hint="De 1 a 60 ocorrências.">
                  <input type="number" min={1} max={60} value={ocorrencias} onChange={(e) => setOcorrencias(e.target.value)} className={`${inputCls()} font-mono`} />
                </Field>
              ) : (
                <Field label="Número de parcelas" hint="De 2 a 60 parcelas.">
                  <input type="number" min={2} max={60} value={parcelas} onChange={(e) => setParcelas(e.target.value)} className={`${inputCls()} font-mono`} />
                </Field>
              )}
              <Field label={repeatMode === "recorrente" ? "Frequência" : "Intervalo entre parcelas"}>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequencia)} className={selectCls()}>
                  {FREQ_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
            </div>
          )}
        </FormSection>

        {/* Resumo do que será gerado */}
        <div className="rounded-xl border border-[var(--color-primary-blue)]/20 bg-[var(--color-primary-blue)]/[0.05] p-3.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--color-primary-blue)]"><ListChecks className="w-3.5 h-3.5" /> Resumo</div>
          {totalNum <= 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5"><Info className="w-3 h-3 shrink-0" /> Informe o valor para ver o resumo do que será lançado.</p>
          ) : repeatMode === "none" ? (
            <p className="text-xs text-[var(--color-text-primary)]">1 lançamento de <b className="font-mono">{formatCurrency(totalNum)}</b> com vencimento em <b>{fmtDate(serieBase)}</b>.</p>
          ) : repeatMode === "recorrente" ? (
            <p className="text-xs text-[var(--color-text-primary)]">{nOcorr} lançamentos de <b className="font-mono">{formatCurrency(totalNum)}</b> ({FREQ_OPTS.find(f => f[0] === frequency)?.[1].toLowerCase()}), de <b>{fmtDate(serieBase)}</b> até <b>{fmtDate(ultimaData)}</b> — total de <b className="font-mono">{formatCurrency(totalGerado)}</b>.</p>
          ) : (
            <p className="text-xs text-[var(--color-text-primary)]">{nParc} parcelas de <b className="font-mono">{formatCurrency(splitInstallments(totalNum, nParc)[0])}</b> (centavos ajustados na última), de <b>{fmtDate(serieBase)}</b> até <b>{fmtDate(ultimaData)}</b>.</p>
          )}
          <p className="text-[10px] text-[var(--color-text-faint)]">O lançamento nasce como “A Vencer”; marque como pago na lista quando acontecer.</p>
        </div>

        <ModalFooter onCancel={onClose} saving={saving} submitLabel="Confirmar lançamento" submitIcon={Save} />
      </form>
    </Modal>
  );
}
