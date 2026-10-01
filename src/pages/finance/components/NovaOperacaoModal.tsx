import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { ArrowUpRight, ArrowDownRight, DollarSign, Repeat, Layers } from "lucide-react";
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
  const [errors, setErrors] = useState<{ desc?: string; value?: string; category?: string }>({});

  const resetForm = () => {
    setDesc(""); setNotes(""); setCategoryId("");
    setContaBancariaId(contaPrincipalId); setCentroCustoId(""); setTags("");
    setCounterparty(""); setPaymentMethod(""); setValue(""); setDate("");
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
      status: "A Vencer" as const,
      type,
    };

    if (repeatMode === "recorrente") {
      const ocs = Math.max(1, parseInt(ocorrencias, 10) || 1);
      const groupId = crypto.randomUUID();
      for (let i = 0; i < ocs; i++) {
        const dataOcorrencia = i === 0 ? baseDate : addPeriodo(baseDate, frequency, i);
        addFinanceEntry({ ...baseFields, value: totalValor, date: dataOcorrencia.toLocaleDateString("pt-BR"), is_recurring: true, recurring_frequency: frequency, recurring_group_id: groupId }, { silent: i > 0 });
      }
      if (ocs > 1) toast.success(`${ocs} lançamentos recorrentes gerados.`);
    } else if (repeatMode === "parcelado") {
      const numParcelas = Math.max(2, parseInt(parcelas, 10) || 2);
      const valores = splitInstallments(totalValor, numParcelas);
      const groupId = crypto.randomUUID();
      valores.forEach((valorParcela, i) => {
        const dataParcela = i === 0 ? baseDate : addPeriodo(baseDate, frequency, i);
        addFinanceEntry({ ...baseFields, value: valorParcela, date: dataParcela.toLocaleDateString("pt-BR"), installment_group_id: groupId, installment_number: i + 1, installment_total: numParcelas }, { silent: i > 0 });
      });
      toast.success(`${numParcelas} parcelas geradas (${formatCurrency(valores[0])} cada, ajustado na última).`);
    } else {
      await addFinanceEntry({ ...baseFields, value: totalValor, date: baseDate.toLocaleDateString("pt-BR") });
      toast.success(type === "Pagar" ? "Despesa lançada." : "Recebimento lançado.");
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={type === "Pagar" ? "Novo Gasto / Despesa" : "Novo Recebimento / Receita"}
      description="Registre um lançamento financeiro no sistema com classificação de categoria e vencimento."
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!lockType && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setType("Pagar"); setCategoryId(""); }}
              className={cn("flex items-center justify-center gap-1.5 py-2.5 rounded-[var(--radius-control)] border text-xs font-semibold transition-colors cursor-pointer",
                type === "Pagar" ? "bg-[var(--color-danger)]/10 border-[var(--color-danger)]/40 text-[var(--color-danger)]" : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}
            >
              <ArrowDownRight className="w-3.5 h-3.5" /> Despesa
            </button>
            <button
              type="button"
              onClick={() => { setType("Receber"); setCategoryId(""); }}
              className={cn("flex items-center justify-center gap-1.5 py-2.5 rounded-[var(--radius-control)] border text-xs font-semibold transition-colors cursor-pointer",
                type === "Receber" ? "bg-[var(--color-success)]/10 border-[var(--color-success)]/40 text-[var(--color-success)]" : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}
            >
              <ArrowUpRight className="w-3.5 h-3.5" /> Receita
            </button>
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nome do Lançamento *</label>
          <input
            type="text"
            required
            autoFocus
            placeholder="Ex: Servidor AWS, Licença de Software, Fatura..."
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setErrors(prev => ({ ...prev, desc: undefined })); }}
            className={cn("w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]", errors.desc ? "border-[var(--color-danger)]" : "border-[var(--color-border-default)]")}
          />
          {errors.desc && <p className="text-[10px] text-[var(--color-danger)] mt-1">{errors.desc}</p>}
        </div>

        <div>
          <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Descrição / Observações</label>
          <textarea
            rows={2}
            placeholder="Detalhes adicionais deste lançamento (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Categoria Financeira *</label>
            {!showNovaCategoria ? (
              <select
                required
                value={categoryId}
                onChange={(e) => {
                  if (e.target.value === "__nova__") { setShowNovaCategoria(true); return; }
                  setCategoryId(e.target.value);
                  setErrors(prev => ({ ...prev, category: undefined }));
                }}
                className={cn("w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer", errors.category ? "border-[var(--color-danger)]" : "border-[var(--color-border-default)]")}
              >
                <option value="">Selecione...</option>
                {categoriasDoTipo.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                <option value="__nova__">+ Criar nova categoria...</option>
              </select>
            ) : (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  autoFocus
                  placeholder="Nome da categoria"
                  value={novaCategoriaNome}
                  onChange={(e) => setNovaCategoriaNome(e.target.value)}
                  className="flex-1 min-w-0 bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                />
                <button type="button" onClick={() => setShowNovaCategoria(false)} className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] px-1">✕</button>
              </div>
            )}
            {type === "Pagar" && showNovaCategoria && (
              <select
                value={novaCategoriaSubtipo}
                onChange={(e) => setNovaCategoriaSubtipo(e.target.value as typeof novaCategoriaSubtipo)}
                className="w-full mt-1.5 bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-1.5 text-[11px] focus:outline-none cursor-pointer"
              >
                <option value="DESPESA_FIXA">Despesa Fixa</option>
                <option value="DESPESA_VARIAVEL">Despesa Variável</option>
                <option value="PESSOAS">Pessoas</option>
                <option value="IMPOSTOS">Impostos</option>
              </select>
            )}
            {errors.category && <p className="text-[10px] text-[var(--color-danger)] mt-1">{errors.category}</p>}
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">{type === "Pagar" ? "Fornecedor" : "Cliente"}</label>
            <input
              type="text"
              list="contatos-sugeridos-nova-operacao"
              placeholder={type === "Pagar" ? "Ex: AWS, Fornecedor X" : "Ex: Nome do cliente"}
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
            <datalist id="contatos-sugeridos-nova-operacao">
              {contatosSugeridos.map((c: any) => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Forma de {type === "Pagar" ? "Pagamento" : "Recebimento"}</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
          >
            <option value="">Não informado</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Conta Bancária</label>
          <select
            value={contaBancariaId}
            onChange={(e) => setContaBancariaId(e.target.value)}
            className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
          >
            <option value="">Não vinculada</option>
            {contasAtivas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}{c.is_principal ? " (Principal)" : ""}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Centro de Custo</label>
            <select
              value={centroCustoId}
              onChange={(e) => setCentroCustoId(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer"
            >
              <option value="">Não informado</option>
              {(financeCentrosCusto as any[]).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Tags</label>
            <input
              type="text"
              placeholder="separadas por vírgula"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">
              {repeatMode === "parcelado" ? "Valor Total (R$) *" : "Valor (R$) *"}
            </label>
            <input
              type="number"
              required
              step="0.01"
              placeholder="0,00"
              value={value}
              onChange={(e) => { setValue(e.target.value); setErrors(prev => ({ ...prev, value: undefined })); }}
              className={cn("w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono", errors.value ? "border-[var(--color-danger)]" : "border-[var(--color-border-default)]")}
            />
            {errors.value && <p className="text-[10px] text-[var(--color-danger)] mt-1">{errors.value}</p>}
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">
              {repeatMode === "none" ? "Data de Vencimento" : "1º Vencimento"}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            />
          </div>
        </div>

        <div className="bg-[var(--color-surface-sunken)]/60 border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3.5 space-y-3">
          <label className="text-xs font-bold text-[var(--color-text-muted)] block">Tipo de lançamento</label>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setRepeatMode("none")} className={cn("flex flex-col items-center gap-1 py-2.5 rounded-[var(--radius-control)] border text-[10px] font-bold uppercase transition-colors cursor-pointer", repeatMode === "none" ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}>
              <DollarSign className="w-3.5 h-3.5" /> Único
            </button>
            <button type="button" onClick={() => setRepeatMode("recorrente")} className={cn("flex flex-col items-center gap-1 py-2.5 rounded-[var(--radius-control)] border text-[10px] font-bold uppercase transition-colors cursor-pointer", repeatMode === "recorrente" ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}>
              <Repeat className="w-3.5 h-3.5" /> Recorrente
            </button>
            <button type="button" onClick={() => setRepeatMode("parcelado")} className={cn("flex flex-col items-center gap-1 py-2.5 rounded-[var(--radius-control)] border text-[10px] font-bold uppercase transition-colors cursor-pointer", repeatMode === "parcelado" ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")}>
              <Layers className="w-3.5 h-3.5" /> Parcelado
            </button>
          </div>

          {repeatMode === "recorrente" && (
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Frequência</label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequencia)} className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer">
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="mensal">Mensal</option>
                  <option value="bimestral">Bimestral</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Repetir por quantas vezes</label>
                <input type="number" min={1} max={60} value={ocorrencias} onChange={(e) => setOcorrencias(e.target.value)} className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono" />
              </div>
            </div>
          )}

          {repeatMode === "parcelado" && (
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Número de Parcelas</label>
                <input type="number" min={2} max={60} value={parcelas} onChange={(e) => setParcelas(e.target.value)} className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] font-mono" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Intervalo entre parcelas</label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequencia)} className="w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] cursor-pointer">
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="mensal">Mensal</option>
                  <option value="bimestral">Bimestral</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
              {value && (
                <p className="col-span-2 text-[10px] text-[var(--color-text-muted)]">
                  {Math.max(2, parseInt(parcelas, 10) || 2)}x de{" "}
                  <span className="font-mono font-bold text-[var(--color-text-primary)]">{formatCurrency(splitInstallments(parseFloat(value) || 0, Math.max(2, parseInt(parcelas, 10) || 2))[0])}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
          <Button type="button" variant="outline" onClick={onClose} className="h-9 px-4 text-xs font-bold border-[var(--color-border-default)]">Cancelar</Button>
          <Button type="submit" className="h-9 px-5 text-xs font-bold shadow-xs">Confirmar Lançamento</Button>
        </div>
      </form>
    </Modal>
  );
}
