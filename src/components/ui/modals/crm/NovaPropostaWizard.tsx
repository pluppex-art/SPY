import { useEffect, useMemo, useState } from "react";
import {
  X, Check, Building2, Target, Package2, ListChecks, Calendar, CreditCard,
  ClipboardCheck, Search, Plus, Trash2, Pencil, Sparkles, Puzzle, BarChart3,
  FileText, Banknote, QrCode, Landmark, Save, Link2, Send, Tag as TagIcon,
  Users as UsersIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "../../button";
import { useData } from "../../../../contexts/DataContext";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { cn, normalizeText } from "../../../../lib/utils";
import { toast } from "sonner";

// ─── Tipos locais ───────────────────────────────────────────────────────────

interface ComposicaoItem {
  key: string;
  productId: string | null;
  nome: string;
  tipo: "Software" | "Serviço" | "Módulo" | "Personalizado";
  isRecurring: boolean;
  quantidade: number;
  valorUnitario: number;
}

/** Cliente/empresa escolhido na etapa Contexto — pode vir da Base de Clientes
 * (cadastro formal) ou de um lead do Pipeline que ainda não foi formalizado
 * como cliente. Os dois contam como "já cadastrado no sistema". */
interface SelectedEntity {
  source: "cliente" | "lead";
  id: string;
  name: string;
  documento?: string | null;
  email?: string | null;
  phone?: string | null;
}

const STEP_DEFS = [
  { n: 1, title: "Contexto", desc: "Cliente e oportunidade", icon: Building2 },
  { n: 2, title: "Solução", desc: "Produtos e serviços", icon: Puzzle },
  { n: 3, title: "Composição", desc: "Itens e valores", icon: ListChecks },
  { n: 4, title: "Condições", desc: "Prazos e validade", icon: Calendar },
  { n: 5, title: "Pagamento", desc: "Cobrança e recorrência", icon: CreditCard },
  { n: 6, title: "Revisão", desc: "Conferir e enviar", icon: ClipboardCheck },
] as const;

const PAYMENT_METHOD_OPTIONS = [
  { id: "Boleto bancário", icon: FileText },
  { id: "PIX", icon: QrCode },
  { id: "Cartão de crédito", icon: CreditCard },
  { id: "Transferência bancária", icon: Landmark },
] as const;

const CONDICOES_ADICIONAIS_OPTIONS = [
  "Cláusula de confidencialidade (NDA)",
  "Exclusividade comercial",
  "Suporte prioritário",
  "Treinamento incluso",
  "Relatórios mensais",
  "Customizações sob demanda",
];

interface NovaPropostaWizardProps {
  isOpen: boolean;
  onClose: () => void;
  leadId?: string;
  leadName?: string;
  companyName?: string;
  seller?: string;
  availableProducts: any[];
  /** Produtos de Interesse já selecionados no lead — pré-carrega a Composição. */
  initialProductIds?: string[];
  onDone?: (summary: string) => void;
}

export function NovaPropostaWizard({
  isOpen, onClose, leadId, leadName, companyName, seller, availableProducts,
  initialProductIds, onDone,
}: NovaPropostaWizardProps) {
  const { clienteBase, colaboradores, leads, createProposalWithItems, updateLead } = useData();
  const { formatCurrency } = useLocalization();

  const [step, setStep] = useState(1);

  // ── Etapa 1: Contexto ──────────────────────────────────────────────────────
  const [clienteSearch, setClienteSearch] = useState("");
  // Pedido explícito do usuário: a busca de cliente PRECISA puxar quem já
  // está cadastrado no sistema — incluindo quem só existe como lead no
  // Pipeline, nunca formalizado como "cliente" — não só a Base de Clientes.
  // Cadastro formal continua OPCIONAL: sem nenhum resultado, segue com o
  // texto digitado mesmo assim.
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [tituloProposta, setTituloProposta] = useState("");
  const [valorEstimado, setValorEstimado] = useState("0");
  const [probabilidade, setProbabilidade] = useState(50);
  const [origem, setOrigem] = useState("Indicação");
  const [previsaoFechamento, setPrevisaoFechamento] = useState(() => new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10));
  const [objetivo, setObjetivo] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [equipeInterna, setEquipeInterna] = useState<{ id: string; nome: string }[]>([]);

  // ── Etapa 2: Solução ────────────────────────────────────────────────────────
  const [selectedCategoria, setSelectedCategoria] = useState<string | null>(null);

  // ── Etapa 3: Composição ─────────────────────────────────────────────────────
  const [items, setItems] = useState<ComposicaoItem[]>([]);
  const [descontoTipo, setDescontoTipo] = useState<"valor" | "percentual">("valor");
  const [descontoValor, setDescontoValor] = useState("0");
  const [observacoes, setObservacoes] = useState("");

  // ── Etapa 4: Condições ──────────────────────────────────────────────────────
  const [validadeDias, setValidadeDias] = useState(30);
  const [prazoImplantacao, setPrazoImplantacao] = useState("Até 30 dias após assinatura");
  const [prazoContratoMeses, setPrazoContratoMeses] = useState(12);
  const [renovacaoAutomatica, setRenovacaoAutomatica] = useState(true);
  const [reajusteIndice, setReajusteIndice] = useState("IPCA");
  const [reajustePeriodicidade, setReajustePeriodicidade] = useState("Anual");
  const [condicoesAdicionais, setCondicoesAdicionais] = useState<string[]>(["Treinamento incluso", "Relatórios mensais", "Suporte prioritário"]);

  // ── Etapa 5: Pagamento ──────────────────────────────────────────────────────
  const [formaPagamento, setFormaPagamento] = useState<"unico" | "entrada_recorrencia" | "recorrencia">("entrada_recorrencia");
  const [metodosPagamento, setMetodosPagamento] = useState<string[]>(["Boleto bancário", "PIX", "Transferência bancária"]);
  const [entradaAuto, setEntradaAuto] = useState(true);
  const [entradaPercentInput, setEntradaPercentInput] = useState("26.8");
  const [entradaValorInput, setEntradaValorInput] = useState("0");
  const [dataVencimentoEntrada, setDataVencimentoEntrada] = useState(() => new Date().toISOString().slice(0, 10));
  const [diaFixoVencimento, setDiaFixoVencimento] = useState(true);
  const [diaDoMes, setDiaDoMes] = useState(new Date().getDate());
  const [primeiroVencimentoParcela, setPrimeiroVencimentoParcela] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10);
  });
  const [observacoesPagamento, setObservacoesPagamento] = useState("");

  const [saving, setSaving] = useState(false);

  // ── Reset ao abrir ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    const lead = leadId ? (leads || []).find((l: any) => l.id === leadId) : null;
    // Prioriza o cadastro formal (clienteBase) quando existe um pra esse
    // nome; sem isso, o próprio lead do Pipeline já conta como "cadastrado"
    // — nunca força abrir a etapa sem puxar o que já existe.
    const matchedCliente = (clienteBase as any[]).find((c: any) =>
      companyName && normalizeText(c.name) === normalizeText(companyName));
    if (matchedCliente) {
      setSelectedEntity({ source: "cliente", id: matchedCliente.id, name: matchedCliente.name, documento: matchedCliente.documento, email: matchedCliente.email, phone: matchedCliente.phone });
    } else if (lead) {
      setSelectedEntity({ source: "lead", id: lead.id, name: lead.company || lead.name, documento: lead.cnpj, email: lead.email, phone: lead.phone });
    } else {
      setSelectedEntity(null);
    }
    setClienteSearch("");
    setTituloProposta(companyName ? `Implementação S.P.Y. — ${companyName}` : "");
    setValorEstimado(String(lead?.value ? parseCurrencyValue(lead.value) : 0));
    setProbabilidade(lead?.scoreIA ?? 50);
    setOrigem(lead?.source || "Indicação");
    setObjetivo("");
    setTags([]);
    setEquipeInterna(seller ? [{ id: "seller", nome: seller }] : []);
    setSelectedCategoria(null);

    const seedItems: ComposicaoItem[] = (initialProductIds || [])
      .map((pid) => availableProducts.find((p: any) => p.id === pid))
      .filter(Boolean)
      .map((p: any) => ({
        key: crypto.randomUUID(),
        productId: p.id,
        nome: p.name,
        tipo: (p.category === "Software" || p.is_recurring) ? "Software" : "Serviço",
        isRecurring: !!(p.is_recurring || p.recurring_period || p.category === "Software"),
        quantidade: 1,
        valorUnitario: Number(p.price) || 0,
      }));
    setItems(seedItems);
    setDescontoTipo("valor");
    setDescontoValor("0");
    setObservacoes("");

    setValidadeDias(30);
    setPrazoImplantacao("Até 30 dias após assinatura");
    setPrazoContratoMeses(12);
    setRenovacaoAutomatica(true);
    setReajusteIndice("IPCA");
    setReajustePeriodicidade("Anual");
    setCondicoesAdicionais(["Treinamento incluso", "Relatórios mensais", "Suporte prioritário"]);

    setFormaPagamento("entrada_recorrencia");
    setMetodosPagamento(["Boleto bancário", "PIX", "Transferência bancária"]);
    setEntradaAuto(true);
    setEntradaPercentInput("26.8");
    setDataVencimentoEntrada(new Date().toISOString().slice(0, 10));
    setDiaFixoVencimento(true);
    setDiaDoMes(new Date().getDate());
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    setPrimeiroVencimentoParcela(d.toISOString().slice(0, 10));
    setObservacoesPagamento("");
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Dados derivados ──────────────────────────────────────────────────────────

  // Busca unificada: Base de Clientes (cadastro formal) + leads do Pipeline
  // que ainda não viraram cliente — os dois contam como "já cadastrado no
  // sistema", pedido explícito do usuário. Cliente formal vem primeiro
  // quando o mesmo nome existe nos dois (é o registro mais completo).
  const clienteResults = useMemo(() => {
    const q = normalizeText(clienteSearch);
    if (!q) return [] as SelectedEntity[];
    const fromClientes: SelectedEntity[] = (clienteBase as any[])
      .filter((c: any) => normalizeText(c.name).includes(q))
      .slice(0, 6)
      .map((c: any) => ({ source: "cliente", id: c.id, name: c.name, documento: c.documento, email: c.email, phone: c.phone }));
    const clienteNames = new Set(fromClientes.map((c) => normalizeText(c.name)));
    const fromLeads: SelectedEntity[] = (leads as any[])
      .filter((l: any) => {
        const nome = l.company || l.name;
        return nome && !clienteNames.has(normalizeText(nome)) && (normalizeText(l.company || "").includes(q) || normalizeText(l.name || "").includes(q) || normalizeText(l.cnpj || "").includes(q));
      })
      .slice(0, 6)
      .map((l: any) => ({ source: "lead", id: l.id, name: l.company || l.name, documento: l.cnpj, email: l.email, phone: l.phone }));
    return [...fromClientes, ...fromLeads].slice(0, 8);
  }, [clienteBase, leads, clienteSearch]);

  const categorias = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of availableProducts) {
      const cat = p.category || "Geral";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map.entries()).map(([nome, produtos]) => ({ nome, produtos }));
  }, [availableProducts]);

  const recurringTotal = items.filter((i) => i.isRecurring).reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const oneTimeTotal = items.filter((i) => !i.isRecurring).reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const subtotal = recurringTotal + oneTimeTotal;
  const descontoCalc = descontoTipo === "percentual"
    ? subtotal * (Math.max(0, Number(descontoValor) || 0) / 100)
    : Math.max(0, Number(descontoValor) || 0);
  const totalProposta = Math.max(0, subtotal - descontoCalc);

  const entradaValor = formaPagamento === "entrada_recorrencia"
    ? (entradaAuto ? totalProposta * (Math.max(0, Number(entradaPercentInput) || 0) / 100) : Math.max(0, Number(entradaValorInput) || 0))
    : 0;
  const entradaPercentReal = totalProposta > 0 ? (entradaValor / totalProposta) * 100 : 0;
  const parcelaValor = recurringTotal;
  const numeroParcelas = prazoContratoMeses;
  const primeiroCiclo = formaPagamento === "unico" ? totalProposta : entradaValor + parcelaValor;
  const totalEmNMeses = formaPagamento === "unico"
    ? totalProposta
    : formaPagamento === "recorrencia"
      ? parcelaValor * numeroParcelas
      : entradaValor + parcelaValor * numeroParcelas;

  // ── Helpers ──────────────────────────────────────────────────────────────

  const canAdvance = (fromStep: number): boolean => {
    if (fromStep === 1) return !!(selectedEntity || clienteSearch) && tituloProposta.trim().length > 0;
    if (fromStep === 3) return items.length > 0;
    return true;
  };

  const goNext = () => {
    if (!canAdvance(step)) {
      toast.error("Preencha os campos obrigatórios desta etapa antes de continuar.");
      return;
    }
    setStep((s) => Math.min(6, s + 1));
  };

  const addItem = () => {
    setItems((prev) => [...prev, {
      key: crypto.randomUUID(), productId: null, nome: "Novo item", tipo: "Personalizado",
      isRecurring: false, quantidade: 1, valorUnitario: 0,
    }]);
  };
  const updateItem = (key: string, patch: Partial<ComposicaoItem>) => {
    setItems((prev) => prev.map((i) => i.key === key ? { ...i, ...patch } : i));
  };
  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

  const toggleCondicao = (opt: string) => {
    setCondicoesAdicionais((prev) => prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]);
  };
  const toggleMetodo = (id: string) => {
    setMetodosPagamento((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
  };

  const buildPayload = (status: "Rascunho" | "Enviada") => {
    const clientName = selectedEntity?.name || clienteSearch.trim() || companyName || "Cliente";
    return {
      titulo: tituloProposta.trim() || `Proposta Comercial — ${clientName}`,
      cliente: clientName,
      valor: totalProposta,
      validade: new Date(Date.now() + validadeDias * 86400000).toISOString().slice(0, 10),
      status,
      vendedor: seller || "Consultor S.P.Y.",
      leadId: leadId || null,
      tipo: "itens" as const,
      conteudoTexto: null,
      itens: items.map((i) => ({
        productId: i.productId,
        descricao: i.nome,
        quantidade: i.quantidade,
        precoUnitario: i.valorUnitario,
        billingType: i.isRecurring ? ("recurring" as const) : ("one_time" as const),
        contractMonths: i.isRecurring ? prazoContratoMeses : null,
        frequency: i.isRecurring ? "mensal" : null,
      })),
      probabilidade,
      previsaoFechamento,
      objetivo: objetivo || null,
      origem,
      condicoes: {
        prazoImplantacao, prazoContratoMeses, renovacaoAutomatica,
        reajusteIndice, reajustePeriodicidade, adicionais: condicoesAdicionais,
      },
      pagamento: {
        formaPagamento, metodos: metodosPagamento, valorEntrada: entradaValor,
        dataVencimentoEntrada, parcelasRecorrentes: numeroParcelas, valorParcela: parcelaValor,
        diaFixoVencimento, diaDoMes, primeiroVencimentoParcela,
        descontoTipo, descontoValor: Number(descontoValor) || 0, observacoes: observacoesPagamento || null,
      },
      equipeInterna,
      tags,
    };
  };

  const handleSave = async (status: "Rascunho" | "Enviada") => {
    if (items.length === 0) {
      toast.error("Adicione ao menos um item na Composição antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(status);
      await createProposalWithItems(payload);
      if (leadId) {
        const currentLead = (leads || []).find((l: any) => l.id === leadId);
        const newProductIds = items.map((i) => i.productId).filter((id): id is string => !!id);
        const merged = [...new Set([...(currentLead?.productIds || []), ...newProductIds])];
        await updateLead(leadId, { productIds: merged });
      }
      toast.success(status === "Rascunho" ? "Proposta salva como rascunho!" : "Proposta enviada ao cliente!");
      onDone?.(`📄 ${payload.titulo} — ${formatCurrency(totalProposta)} (${status === "Rascunho" ? "rascunho" : "enviada"}).`);
      onClose();
    } catch (err: any) {
      toast.error("Erro ao salvar proposta: " + (err?.message || "tente novamente."));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full h-full sm:w-[95vw] sm:h-[92vh] max-w-[1400px] bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold text-[var(--color-text-faint)] mb-1">
                Propostas <span className="mx-1">›</span> Nova proposta
              </p>
              <h2 className="text-xl font-black text-[var(--color-text-primary)]">
                {step === 6 ? "Revisar e enviar proposta" : "Nova Proposta Comercial"}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {step === 6 ? "Confira todas as informações antes de enviar para o cliente." : "Crie uma proposta comercial completa para o seu cliente."}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {step > 1 && (
                <Button variant="outline" className="h-9 px-3 text-xs" onClick={() => setStep((s) => Math.max(1, s - 1))}>
                  ← Voltar
                </Button>
              )}
              <Button variant="outline" className="h-9 px-3 text-xs gap-1.5" onClick={() => handleSave("Rascunho")} disabled={saving}>
                <Save className="w-3.5 h-3.5" /> Salvar como rascunho
              </Button>
              <button onClick={onClose} className="p-2 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stepper horizontal */}
          <div className="flex items-center mt-5">
            {STEP_DEFS.map((s, idx) => {
              const isDone = step > s.n;
              const isActive = step === s.n;
              return (
                <div key={s.n} className="flex items-center flex-1 last:flex-none">
                  <button
                    type="button"
                    onClick={() => (isDone || isActive) && setStep(s.n)}
                    disabled={!isDone && !isActive}
                    className="flex flex-col items-center gap-1.5 shrink-0 disabled:cursor-default"
                  >
                    <span className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all",
                      isDone ? "bg-success text-white" : isActive ? "bg-[var(--color-primary-blue)] text-white" : "bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-faint)]",
                    )}>
                      {isDone ? <Check className="w-4 h-4" /> : s.n}
                    </span>
                    <span className="text-center">
                      <span className={cn("block text-[10px] font-black uppercase tracking-wide", isActive ? "text-[var(--color-primary-blue)]" : isDone ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-faint)]")}>
                        {s.title}
                      </span>
                      <span className="hidden sm:block text-[9px] text-[var(--color-text-faint)]">{s.desc}</span>
                    </span>
                  </button>
                  {idx < STEP_DEFS.length - 1 && (
                    <div className={cn("h-0.5 flex-1 mx-2 rounded-full", step > s.n ? "bg-success" : "bg-[var(--color-border-subtle)]")} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          {step === 1 && (
            <StepContexto
              clienteSearch={clienteSearch} setClienteSearch={setClienteSearch}
              clienteResults={clienteResults} selectedEntity={selectedEntity}
              setSelectedEntity={setSelectedEntity}
              tituloProposta={tituloProposta} setTituloProposta={setTituloProposta}
              valorEstimado={valorEstimado} setValorEstimado={setValorEstimado}
              probabilidade={probabilidade} setProbabilidade={setProbabilidade}
              origem={origem} setOrigem={setOrigem}
              previsaoFechamento={previsaoFechamento} setPrevisaoFechamento={setPrevisaoFechamento}
              objetivo={objetivo} setObjetivo={setObjetivo}
              tags={tags} setTags={setTags} tagInput={tagInput} setTagInput={setTagInput}
              colaboradores={colaboradores as any[]} equipeInterna={equipeInterna} setEquipeInterna={setEquipeInterna}
            />
          )}
          {step === 2 && (
            <StepSolucao
              categorias={categorias} selectedCategoria={selectedCategoria} setSelectedCategoria={setSelectedCategoria}
              onAdoptCategoria={(produtos) => {
                setItems(produtos.map((p: any) => ({
                  key: crypto.randomUUID(), productId: p.id, nome: p.name,
                  tipo: (p.is_recurring || p.category === "Software") ? "Software" : "Serviço",
                  isRecurring: !!(p.is_recurring || p.recurring_period || p.category === "Software"),
                  quantidade: 1, valorUnitario: Number(p.price) || 0,
                })));
              }}
            />
          )}
          {step === 3 && (
            <StepComposicao
              items={items} addItem={addItem} updateItem={updateItem} removeItem={removeItem}
              availableProducts={availableProducts}
              descontoTipo={descontoTipo} setDescontoTipo={setDescontoTipo}
              descontoValor={descontoValor} setDescontoValor={setDescontoValor}
              observacoes={observacoes} setObservacoes={setObservacoes}
              recurringTotal={recurringTotal} oneTimeTotal={oneTimeTotal} descontoCalc={descontoCalc} totalProposta={totalProposta}
              formatCurrency={formatCurrency}
            />
          )}
          {step === 4 && (
            <StepCondicoes
              validadeDias={validadeDias} setValidadeDias={setValidadeDias}
              prazoImplantacao={prazoImplantacao} setPrazoImplantacao={setPrazoImplantacao}
              prazoContratoMeses={prazoContratoMeses} setPrazoContratoMeses={setPrazoContratoMeses}
              renovacaoAutomatica={renovacaoAutomatica} setRenovacaoAutomatica={setRenovacaoAutomatica}
              reajusteIndice={reajusteIndice} setReajusteIndice={setReajusteIndice}
              reajustePeriodicidade={reajustePeriodicidade} setReajustePeriodicidade={setReajustePeriodicidade}
              condicoesAdicionais={condicoesAdicionais} toggleCondicao={toggleCondicao}
            />
          )}
          {step === 5 && (
            <StepPagamento
              formaPagamento={formaPagamento} setFormaPagamento={setFormaPagamento}
              metodosPagamento={metodosPagamento} toggleMetodo={toggleMetodo}
              entradaAuto={entradaAuto} setEntradaAuto={setEntradaAuto}
              entradaPercentInput={entradaPercentInput} setEntradaPercentInput={setEntradaPercentInput}
              entradaValorInput={entradaValorInput} setEntradaValorInput={setEntradaValorInput}
              entradaValor={entradaValor} entradaPercentReal={entradaPercentReal}
              dataVencimentoEntrada={dataVencimentoEntrada} setDataVencimentoEntrada={setDataVencimentoEntrada}
              numeroParcelas={numeroParcelas} setPrazoContratoMeses={setPrazoContratoMeses}
              parcelaValor={parcelaValor}
              primeiroVencimentoParcela={primeiroVencimentoParcela} setPrimeiroVencimentoParcela={setPrimeiroVencimentoParcela}
              diaFixoVencimento={diaFixoVencimento} setDiaFixoVencimento={setDiaFixoVencimento}
              diaDoMes={diaDoMes} setDiaDoMes={setDiaDoMes}
              descontoTipo={descontoTipo} setDescontoTipo={setDescontoTipo}
              descontoValor={descontoValor} setDescontoValor={setDescontoValor}
              observacoesPagamento={observacoesPagamento} setObservacoesPagamento={setObservacoesPagamento}
              totalProposta={totalProposta} descontoCalc={descontoCalc}
              primeiroCiclo={primeiroCiclo} totalEmNMeses={totalEmNMeses}
              formatCurrency={formatCurrency}
            />
          )}
          {step === 6 && (
            <StepRevisao
              cliente={selectedEntity} clienteSearch={clienteSearch} companyName={companyName}
              tituloProposta={tituloProposta} previsaoFechamento={previsaoFechamento} probabilidade={probabilidade} valorEstimado={valorEstimado}
              items={items} recurringTotal={recurringTotal} oneTimeTotal={oneTimeTotal} descontoCalc={descontoCalc} totalProposta={totalProposta}
              validadeDias={validadeDias} prazoImplantacao={prazoImplantacao} prazoContratoMeses={prazoContratoMeses}
              renovacaoAutomatica={renovacaoAutomatica} reajusteIndice={reajusteIndice} reajustePeriodicidade={reajustePeriodicidade}
              formaPagamento={formaPagamento} metodosPagamento={metodosPagamento} entradaValor={entradaValor}
              numeroParcelas={numeroParcelas} parcelaValor={parcelaValor} primeiroVencimentoParcela={primeiroVencimentoParcela}
              dataVencimentoEntrada={dataVencimentoEntrada} diaDoMes={diaDoMes}
              primeiroCiclo={primeiroCiclo} totalEmNMeses={totalEmNMeses}
              setStep={setStep}
              formatCurrency={formatCurrency}
            />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/40 flex items-center justify-between">
          <Button variant="outline" className="h-9 px-4 text-xs" onClick={() => step > 1 ? setStep((s) => s - 1) : onClose()}>
            ← Voltar
          </Button>
          <div className="flex items-center gap-2">
            {step === 6 ? (
              <>
                <Button variant="outline" className="h-9 px-4 text-xs gap-1.5" disabled={saving} onClick={() => handleSave("Rascunho")}>
                  <Save className="w-3.5 h-3.5" /> Salvar como rascunho
                </Button>
                <Button variant="outline" className="h-9 px-4 text-xs gap-1.5" disabled>
                  <Link2 className="w-3.5 h-3.5" /> Compartilhar link
                </Button>
                <Button
                  className="h-9 px-5 text-xs font-bold gap-1.5 !bg-[var(--color-warning)] hover:!bg-[var(--color-warning)]/90 !text-white"
                  disabled={saving}
                  onClick={() => handleSave("Enviada")}
                >
                  <Send className="w-3.5 h-3.5" /> {saving ? "Enviando..." : "Enviar proposta ao cliente"}
                </Button>
              </>
            ) : (
              <Button className="h-9 px-5 text-xs font-bold gap-1.5" onClick={goNext}>
                Continuar →
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function parseCurrencyValue(v: any): number {
  if (typeof v === "number") return v;
  return Number(String(v ?? "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
}

// ─── Etapa 1: Contexto ──────────────────────────────────────────────────────

function StepContexto(props: any) {
  const {
    clienteSearch, setClienteSearch, clienteResults, selectedEntity, setSelectedEntity,
    tituloProposta, setTituloProposta, valorEstimado, setValorEstimado,
    probabilidade, setProbabilidade, origem, setOrigem,
    previsaoFechamento, setPrevisaoFechamento, objetivo, setObjetivo,
    tags, setTags, tagInput, setTagInput, colaboradores, equipeInterna, setEquipeInterna,
  } = props;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <SectionCard icon={Building2} title="Dados do cliente" desc="Escolha um cliente existente ou cadastre um novo.">
          {selectedEntity ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-[var(--color-primary-blue)] shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--color-text-primary)] truncate flex items-center gap-1.5">
                    {selectedEntity.name}
                    <span className={cn(
                      "text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0",
                      selectedEntity.source === "cliente" ? "bg-success/10 text-success" : "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]",
                    )}>
                      {selectedEntity.source === "cliente" ? "Cliente" : "Lead no Pipeline"}
                    </span>
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)] truncate">{selectedEntity.documento || "Sem documento"}</p>
                </div>
              </div>
              <button onClick={() => setSelectedEntity(null)} className="text-[10px] font-bold text-[var(--color-primary-blue)] shrink-0">Alterar</button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
              <input
                value={clienteSearch}
                onChange={(e) => setClienteSearch(e.target.value)}
                placeholder="Digite o nome, CNPJ, e-mail ou telefone..."
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl pl-9 pr-3 py-2.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              />
              {clienteSearch.trim() && (
                <div className="mt-1.5 border border-[var(--color-border-subtle)] rounded-xl overflow-hidden divide-y divide-[var(--color-border-subtle)]">
                  {clienteResults.length > 0 ? clienteResults.map((c: SelectedEntity) => (
                    <button key={`${c.source}-${c.id}`} onClick={() => setSelectedEntity(c)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-sunken)] bg-[var(--color-surface-elevated)]">
                      <Building2 className="w-3.5 h-3.5 text-[var(--color-text-faint)] shrink-0" />
                      <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate flex-1">{c.name}</span>
                      <span className={cn(
                        "text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0",
                        c.source === "cliente" ? "bg-success/10 text-success" : "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]",
                      )}>
                        {c.source === "cliente" ? "Cliente" : "Lead no Pipeline"}
                      </span>
                    </button>
                  )) : (
                    <div className="px-3 py-3 bg-[var(--color-surface-elevated)]">
                      <p className="text-[11px] font-semibold text-[var(--color-text-primary)]">Nenhum cadastro encontrado para "{clienteSearch}".</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Pode continuar com esse nome mesmo assim — o cadastro na Base de Clientes não é obrigatório pra criar a proposta.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Target} title="Dados da oportunidade" desc="Defina o contexto comercial desta proposta.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Título da proposta">
              <input value={tituloProposta} onChange={(e) => setTituloProposta(e.target.value)} className={inputCls} placeholder="Ex.: Implementação S.P.Y. CRM + Aurora" />
            </Field>
            <Field label="Valor estimado">
              <input type="number" min={0} value={valorEstimado} onChange={(e) => setValorEstimado(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Probabilidade">
              <select value={probabilidade} onChange={(e) => setProbabilidade(Number(e.target.value))} className={inputCls}>
                {[10, 25, 50, 70, 90].map((p) => <option key={p} value={p}>{p}%</option>)}
              </select>
            </Field>
            <Field label="Origem">
              <select value={origem} onChange={(e) => setOrigem(e.target.value)} className={inputCls}>
                {["Indicação", "Site", "Instagram", "WhatsApp", "Evento", "Outbound"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Previsão de fechamento" className="sm:col-span-2">
              <input type="date" value={previsaoFechamento} onChange={(e) => setPrevisaoFechamento(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard icon={ListChecks} title="Objetivo da proposta" desc="Descreva brevemente o que o cliente espera.">
          <textarea
            value={objetivo} onChange={(e) => setObjetivo(e.target.value.slice(0, 500))} rows={3} maxLength={500}
            className={cn(inputCls, "resize-none")}
            placeholder="Ex.: Implementar o S.P.Y. CRM para organizar o processo comercial e gerar mais oportunidades qualificadas."
          />
          <p className="text-[9px] text-[var(--color-text-faint)] text-right mt-1">{objetivo.length}/500</p>
        </SectionCard>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SectionCard icon={TagIcon} title="Tags" desc="Organize esta proposta (opcional).">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t: string) => (
                <span key={t} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/20">
                  {t}
                  <button onClick={() => setTags((prev: string[]) => prev.filter((x) => x !== t))}><X className="w-2.5 h-2.5" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && tagInput.trim()) { e.preventDefault(); setTags((prev: string[]) => [...new Set([...prev, tagInput.trim()])]); setTagInput(""); }
              }} placeholder="Adicionar tag..." className={inputCls} />
            </div>
          </SectionCard>

          <SectionCard icon={UsersIcon} title="Equipe interna" desc="Quem está envolvido (opcional).">
            <div className="flex flex-wrap gap-1.5">
              {equipeInterna.map((m: any) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 text-[10px] font-bold pl-1 pr-2 py-1 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)]">
                  <span className="w-5 h-5 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center text-[9px]">{m.nome.slice(0, 2).toUpperCase()}</span>
                  {m.nome}
                  <button onClick={() => setEquipeInterna((prev: any[]) => prev.filter((x) => x.id !== m.id))}><X className="w-2.5 h-2.5" /></button>
                </span>
              ))}
              <select
                value=""
                onChange={(e) => {
                  const col = (colaboradores || []).find((c: any) => c.id === e.target.value);
                  if (col) setEquipeInterna((prev: any[]) => [...prev, { id: col.id, nome: col.nome }]);
                }}
                className="text-[10px] font-bold px-2 py-1 rounded-full bg-[var(--color-surface-sunken)] border border-dashed border-[var(--color-border-default)]"
              >
                <option value="">+ Adicionar</option>
                {(colaboradores || []).filter((c: any) => !equipeInterna.some((m: any) => m.id === c.id)).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </SectionCard>
        </div>
      </div>

      <div>
        <SectionCard icon={FileText} title="Resumo do contexto" desc="Verifique se as informações estão corretas." sticky>
          <SummaryRow label="Cliente" value={selectedEntity?.name || clienteSearch || "—"} />
          <SummaryRow label="Título" value={tituloProposta || "—"} />
          <SummaryRow label="Valor estimado" value={formatCurrencyBR(Number(valorEstimado) || 0)} />
          <SummaryRow label="Probabilidade" value={`${probabilidade}%`} />
          <SummaryRow label="Origem" value={origem} />
          <SummaryRow label="Fechamento" value={formatDateBR(previsaoFechamento)} />
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Etapa 2: Solução ───────────────────────────────────────────────────────

function StepSolucao({ categorias, selectedCategoria, setSelectedCategoria, onAdoptCategoria }: any) {
  return (
    <div className="p-6 space-y-4">
      <SectionCard icon={Sparkles} title="Escolha a solução comercial" desc="Agrupamos seu catálogo por categoria — você pode ajustar os itens na próxima etapa.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categorias.map((cat: any) => (
            <button
              key={cat.nome}
              onClick={() => { setSelectedCategoria(cat.nome); onAdoptCategoria(cat.produtos); }}
              className={cn(
                "text-left p-4 rounded-2xl border-2 transition-all",
                selectedCategoria === cat.nome ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-primary-blue)]/40",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 flex items-center justify-center text-[var(--color-primary-blue)]"><Package2 className="w-[18px] h-[18px]" /></div>
                {selectedCategoria === cat.nome && <Check className="w-4 h-4 text-[var(--color-primary-blue)]" />}
              </div>
              <p className="text-sm font-black text-[var(--color-text-primary)]">{cat.nome}</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{cat.produtos.length} produto{cat.produtos.length !== 1 ? "s" : ""} no catálogo</p>
              <ul className="mt-2 space-y-1">
                {cat.produtos.slice(0, 3).map((p: any) => (
                  <li key={p.id} className="text-[10px] text-[var(--color-text-muted)] flex items-center gap-1"><Check className="w-2.5 h-2.5 text-success shrink-0" /> {p.name}</li>
                ))}
              </ul>
            </button>
          ))}
          <button
            onClick={() => { setSelectedCategoria("custom"); onAdoptCategoria([]); }}
            className={cn(
              "text-left p-4 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 text-center",
              selectedCategoria === "custom" ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40",
            )}
          >
            <Puzzle className="w-6 h-6 text-[var(--color-text-faint)]" />
            <p className="text-xs font-bold text-[var(--color-text-primary)]">Montar solução personalizada</p>
            <p className="text-[10px] text-[var(--color-text-muted)]">Combine itens livremente na próxima etapa</p>
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Etapa 3: Composição ────────────────────────────────────────────────────

function StepComposicao(props: any) {
  const {
    items, addItem, updateItem, removeItem, availableProducts,
    descontoTipo, setDescontoTipo, descontoValor, setDescontoValor,
    observacoes, setObservacoes, recurringTotal, oneTimeTotal, descontoCalc, totalProposta, formatCurrency,
  } = props;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <SectionCard icon={ListChecks} title="Itens da proposta" desc="Configure os produtos e serviços, ajuste quantidades e valores.">
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[9px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">
                  <th className="px-1 pb-2">Item</th>
                  <th className="px-1 pb-2">Tipo</th>
                  <th className="px-1 pb-2">Cobrança</th>
                  <th className="px-1 pb-2 text-center">Qtd.</th>
                  <th className="px-1 pb-2 text-right">Valor unit.</th>
                  <th className="px-1 pb-2 text-right">Total</th>
                  <th className="px-1 pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {items.map((item: ComposicaoItem) => (
                  <tr key={item.key}>
                    <td className="px-1 py-2 min-w-[160px]">
                      <input value={item.nome} onChange={(e) => updateItem(item.key, { nome: e.target.value })} className="w-full bg-transparent text-xs font-bold text-[var(--color-text-primary)] outline-none" />
                    </td>
                    <td className="px-1 py-2">
                      <select value={item.tipo} onChange={(e) => updateItem(item.key, { tipo: e.target.value as any })} className="text-[10px] font-bold bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-md px-1.5 py-1">
                        {["Software", "Serviço", "Módulo", "Personalizado"].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      <select value={item.isRecurring ? "recorrente" : "unica"} onChange={(e) => updateItem(item.key, { isRecurring: e.target.value === "recorrente" })} className="text-[10px] font-bold bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-md px-1.5 py-1">
                        <option value="recorrente">Recorrente mensal</option>
                        <option value="unica">Única</option>
                      </select>
                    </td>
                    <td className="px-1 py-2 w-16">
                      <input type="number" min={1} value={item.quantidade} onChange={(e) => updateItem(item.key, { quantidade: Math.max(1, parseInt(e.target.value) || 1) })} className="w-full text-center bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-md px-1 py-1 text-xs" />
                    </td>
                    <td className="px-1 py-2 w-28">
                      <input type="number" min={0} value={item.valorUnitario} onChange={(e) => updateItem(item.key, { valorUnitario: Math.max(0, parseFloat(e.target.value) || 0) })} className="w-full text-right bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-md px-1.5 py-1 text-xs font-mono" />
                    </td>
                    <td className="px-1 py-2 text-right font-mono font-bold whitespace-nowrap">
                      {formatCurrency(item.quantidade * item.valorUnitario)}{item.isRecurring && <span className="text-[9px] text-[var(--color-text-faint)]">/mês</span>}
                    </td>
                    <td className="px-1 py-2">
                      <button onClick={() => removeItem(item.key)} className="p-1 rounded-md hover:bg-danger/10 text-[var(--color-text-faint)] hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addItem} className="w-full mt-2 py-2.5 rounded-xl border border-dashed border-[var(--color-border-default)] text-[11px] font-bold text-[var(--color-text-muted)] hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)] flex items-center justify-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Adicionar item
          </button>
          {availableProducts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-[9px] font-bold text-[var(--color-text-faint)] uppercase self-center mr-1">Do catálogo:</span>
              {availableProducts.slice(0, 6).map((p: any) => (
                <button key={p.id} onClick={() => updateItem("__new__", {})} className="hidden" />
              ))}
            </div>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SectionCard icon={BarChart3} title="Desconto" desc="Aplique um desconto sobre o valor total (opcional).">
            <div className="grid grid-cols-2 gap-2">
              <select value={descontoTipo} onChange={(e) => setDescontoTipo(e.target.value as any)} className={inputCls}>
                <option value="valor">Valor (R$)</option>
                <option value="percentual">Percentual (%)</option>
              </select>
              <input type="number" min={0} value={descontoValor} onChange={(e) => setDescontoValor(e.target.value)} className={inputCls} />
            </div>
          </SectionCard>
          <SectionCard icon={FileText} title="Observações" desc="Condições especiais, escopo, etc. (opcional).">
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className={cn(inputCls, "resize-none")} />
          </SectionCard>
        </div>
      </div>

      <div>
        <SectionCard icon={BarChart3} title="Resumo financeiro" desc="Visão geral dos valores desta proposta." sticky>
          <SummaryRow label="Itens recorrentes (mensal)" value={formatCurrency(recurringTotal)} />
          <SummaryRow label="Itens únicos" value={formatCurrency(oneTimeTotal)} />
          <SummaryRow label="Desconto" value={formatCurrency(descontoCalc)} valueClass="text-success" />
          <div className="h-px bg-[var(--color-border-subtle)] my-2" />
          <SummaryRow label="Total da proposta" value={formatCurrency(totalProposta)} bold />
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Etapa 4: Condições ─────────────────────────────────────────────────────

function StepCondicoes(props: any) {
  const {
    validadeDias, setValidadeDias, prazoImplantacao, setPrazoImplantacao,
    prazoContratoMeses, setPrazoContratoMeses, renovacaoAutomatica, setRenovacaoAutomatica,
    reajusteIndice, setReajusteIndice, reajustePeriodicidade, setReajustePeriodicidade,
    condicoesAdicionais, toggleCondicao,
  } = props;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SectionCard icon={Calendar} title="Validade da proposta" desc="Por quanto tempo esta proposta será válida.">
            <select value={validadeDias} onChange={(e) => setValidadeDias(Number(e.target.value))} className={inputCls}>
              {[7, 15, 30].map((d) => <option key={d} value={d}>{d} dias</option>)}
            </select>
          </SectionCard>
          <SectionCard icon={Target} title="Prazo de implantação" desc="Tempo estimado para entrega e ativação.">
            <select value={prazoImplantacao} onChange={(e) => setPrazoImplantacao(e.target.value)} className={inputCls}>
              {["Imediato", "Até 15 dias após assinatura", "Até 30 dias após assinatura"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </SectionCard>
          <SectionCard icon={FileText} title="Prazo de contrato" desc="Período de vigência.">
            <div className="flex items-center gap-3">
              <select value={prazoContratoMeses} onChange={(e) => setPrazoContratoMeses(Number(e.target.value))} className={inputCls}>
                {[1, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} meses</option>)}
              </select>
              <label className="flex items-center gap-2 text-[10px] font-bold text-[var(--color-text-muted)] shrink-0 whitespace-nowrap">
                <Toggle checked={renovacaoAutomatica} onChange={setRenovacaoAutomatica} /> Renovação automática
              </label>
            </div>
          </SectionCard>
          <SectionCard icon={BarChart3} title="Reajuste" desc="Índice e periodicidade de reajuste.">
            <div className="grid grid-cols-2 gap-2">
              <select value={reajusteIndice} onChange={(e) => setReajusteIndice(e.target.value)} className={inputCls}>
                {["Nenhum", "IPCA", "IGP-M"].map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
              <select value={reajustePeriodicidade} onChange={(e) => setReajustePeriodicidade(e.target.value)} className={inputCls}>
                {["Anual", "Semestral"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </SectionCard>
        </div>

        <SectionCard icon={ListChecks} title="Condições comerciais adicionais" desc="Opcional.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CONDICOES_ADICIONAIS_OPTIONS.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-text-primary)] cursor-pointer">
                <input type="checkbox" checked={condicoesAdicionais.includes(opt)} onChange={() => toggleCondicao(opt)} className="w-3.5 h-3.5 accent-[var(--color-primary-blue)]" />
                {opt}
              </label>
            ))}
          </div>
        </SectionCard>
      </div>

      <div>
        <SectionCard icon={ClipboardCheck} title="Resumo das condições" sticky>
          <SummaryRow label="Validade" value={`${validadeDias} dias`} />
          <SummaryRow label="Implantação" value={prazoImplantacao} />
          <SummaryRow label="Contrato" value={`${prazoContratoMeses} meses`} />
          <SummaryRow label="Renovação automática" value={renovacaoAutomatica ? "Sim" : "Não"} />
          <SummaryRow label="Reajuste" value={reajusteIndice === "Nenhum" ? "Nenhum" : `${reajusteIndice} (${reajustePeriodicidade.toLowerCase()})`} />
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Etapa 5: Pagamento ─────────────────────────────────────────────────────

function StepPagamento(props: any) {
  const {
    formaPagamento, setFormaPagamento, metodosPagamento, toggleMetodo,
    entradaAuto, setEntradaAuto, entradaPercentInput, setEntradaPercentInput,
    entradaValorInput, setEntradaValorInput, entradaValor, entradaPercentReal,
    dataVencimentoEntrada, setDataVencimentoEntrada,
    numeroParcelas, setPrazoContratoMeses, parcelaValor,
    primeiroVencimentoParcela, setPrimeiroVencimentoParcela,
    diaFixoVencimento, setDiaFixoVencimento, diaDoMes, setDiaDoMes,
    descontoTipo, setDescontoTipo, descontoValor, setDescontoValor,
    observacoesPagamento, setObservacoesPagamento,
    totalProposta, descontoCalc, primeiroCiclo, totalEmNMeses, formatCurrency,
  } = props;

  const formaOptions = [
    { id: "unico", title: "Pagamento único", desc: "Valor total à vista", icon: CreditCard },
    { id: "entrada_recorrencia", title: "Entrada + recorrência", desc: "Parte agora, resto mensal", icon: Calendar },
    { id: "recorrencia", title: "Recorrência mensal", desc: "Cobrança mensal conforme itens", icon: Calendar },
  ];

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <SectionCard icon={CreditCard} title="Forma de pagamento" desc="Escolha a melhor forma de pagamento para o cliente.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {formaOptions.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormaPagamento(f.id)}
                className={cn(
                  "text-left p-3 rounded-xl border-2 transition-all",
                  formaPagamento === f.id ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)]",
                )}
              >
                <f.icon className={cn("w-4 h-4 mb-1.5", formaPagamento === f.id ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-faint)]")} />
                <p className="text-[11px] font-black text-[var(--color-text-primary)]">{f.title}</p>
                <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5">{f.desc}</p>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard icon={FileText} title="Métodos de pagamento" desc="Selecione os métodos aceitos.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-text-primary)] cursor-pointer">
                <input type="checkbox" checked={metodosPagamento.includes(m.id)} onChange={() => toggleMetodo(m.id)} className="w-3.5 h-3.5 accent-[var(--color-primary-blue)]" />
                <m.icon className="w-3.5 h-3.5 text-[var(--color-text-faint)]" /> {m.id}
              </label>
            ))}
          </div>
        </SectionCard>

        {formaPagamento !== "unico" && (
          <SectionCard icon={Banknote} title="Configuração do pagamento" desc="Defina valores, parcelas e datas de cobrança.">
            <div className="space-y-3">
              {formaPagamento === "entrada_recorrencia" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Entrada (valor inicial)">
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0} disabled={entradaAuto}
                        value={entradaAuto ? entradaValor.toFixed(2) : entradaValorInput}
                        onChange={(e) => setEntradaValorInput(e.target.value)}
                        className={cn(inputCls, "disabled:opacity-60")}
                      />
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] shrink-0">{entradaPercentReal.toFixed(1)}%</span>
                    </div>
                    <label className="flex items-center gap-1.5 mt-1.5 text-[9px] font-bold text-[var(--color-primary-blue)] cursor-pointer">
                      <input type="checkbox" checked={entradaAuto} onChange={(e) => setEntradaAuto(e.target.checked)} className="w-3 h-3 accent-[var(--color-primary-blue)]" />
                      Calcular automaticamente ({entradaPercentInput}%)
                    </label>
                  </Field>
                  <Field label="Data de vencimento da entrada">
                    <input type="date" value={dataVencimentoEntrada} onChange={(e) => setDataVencimentoEntrada(e.target.value)} className={inputCls} />
                  </Field>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Número de parcelas">
                  <select value={numeroParcelas} onChange={(e) => setPrazoContratoMeses(Number(e.target.value))} className={inputCls}>
                    {[1, 3, 6, 12, 24].map((n) => <option key={n} value={n}>{n}x</option>)}
                  </select>
                </Field>
                <Field label="Valor da parcela">
                  <input value={formatCurrency(parcelaValor)} disabled className={cn(inputCls, "opacity-70 font-mono")} />
                </Field>
                <Field label="Primeiro vencimento">
                  <input type="date" value={primeiroVencimentoParcela} onChange={(e) => setPrimeiroVencimentoParcela(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Dia do mês">
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={31} value={diaDoMes} disabled={!diaFixoVencimento} onChange={(e) => setDiaDoMes(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))} className={cn(inputCls, "disabled:opacity-60")} />
                    <label className="flex items-center gap-1.5 text-[9px] font-bold text-[var(--color-text-muted)] shrink-0 whitespace-nowrap">
                      <Toggle checked={diaFixoVencimento} onChange={setDiaFixoVencimento} /> Dia fixo
                    </label>
                  </div>
                </Field>
              </div>
            </div>
          </SectionCard>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SectionCard icon={BarChart3} title="Desconto" desc="Opcional.">
            <div className="grid grid-cols-2 gap-2">
              <select value={descontoTipo} onChange={(e) => setDescontoTipo(e.target.value as any)} className={inputCls}>
                <option value="valor">Valor fixo (R$)</option>
                <option value="percentual">Percentual (%)</option>
              </select>
              <input type="number" min={0} value={descontoValor} onChange={(e) => setDescontoValor(e.target.value)} className={inputCls} />
            </div>
          </SectionCard>
          <SectionCard icon={FileText} title="Observações de pagamento" desc="Opcional.">
            <textarea value={observacoesPagamento} onChange={(e) => setObservacoesPagamento(e.target.value)} rows={2} className={cn(inputCls, "resize-none")} placeholder="Instruções de emissão do boleto, etc." />
          </SectionCard>
        </div>
      </div>

      <div>
        <SectionCard icon={FileText} title="Resumo financeiro" sticky>
          <SummaryRow label="Total da proposta" value={formatCurrency(totalProposta)} />
          <SummaryRow label="Desconto" value={formatCurrency(descontoCalc)} valueClass="text-success" />
          <div className="h-px bg-[var(--color-border-subtle)] my-2" />
          <div className="p-3 rounded-xl bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/20 mb-2">
            <p className="text-[9px] font-black uppercase text-[var(--color-text-muted)]">Valor do primeiro ciclo</p>
            <p className="text-lg font-black text-[var(--color-primary-blue)]">{formatCurrency(primeiroCiclo)}</p>
          </div>
          <SummaryRow label={`Valor total em ${numeroParcelas} meses`} value={formatCurrency(totalEmNMeses)} bold />
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Etapa 6: Revisão ───────────────────────────────────────────────────────

function StepRevisao(props: any) {
  const {
    cliente, clienteSearch, companyName, tituloProposta, previsaoFechamento, probabilidade, valorEstimado,
    items, recurringTotal, oneTimeTotal, descontoCalc, totalProposta,
    validadeDias, prazoImplantacao, prazoContratoMeses, renovacaoAutomatica, reajusteIndice, reajustePeriodicidade,
    formaPagamento, metodosPagamento, entradaValor, numeroParcelas, parcelaValor, primeiroVencimentoParcela,
    dataVencimentoEntrada, diaDoMes, primeiroCiclo, totalEmNMeses, setStep, formatCurrency,
  } = props;

  const clientName = cliente?.name || clienteSearch || companyName || "—";
  const formaPagamentoLabel = formaPagamento === "unico" ? "Pagamento único" : formaPagamento === "recorrencia" ? "Recorrência mensal" : "Entrada + recorrência";

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <SectionCard icon={Building2} title="Cliente e oportunidade" onEdit={() => setStep(1)}>
          <p className="text-sm font-black text-[var(--color-text-primary)]">{clientName}</p>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{tituloProposta}</p>
          <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
            <SummaryRow label="Fechamento" value={formatDateBR(previsaoFechamento)} />
            <SummaryRow label="Probabilidade" value={`${probabilidade}%`} />
            <SummaryRow label="Valor estimado" value={formatCurrencyBR(Number(valorEstimado) || 0)} />
          </div>
        </SectionCard>

        <SectionCard icon={ListChecks} title="Itens da proposta" onEdit={() => setStep(3)}>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {items.map((item: ComposicaoItem) => (
              <div key={item.key} className="flex items-center justify-between py-1.5 text-xs">
                <span className="font-semibold text-[var(--color-text-primary)]">{item.nome} <span className="text-[var(--color-text-faint)] font-normal">× {item.quantidade}</span></span>
                <span className="font-mono font-bold">{formatCurrency(item.quantidade * item.valorUnitario)}{item.isRecurring && "/mês"}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SectionCard icon={Calendar} title="Condições comerciais" onEdit={() => setStep(4)}>
            <SummaryRow label="Validade" value={`${validadeDias} dias`} />
            <SummaryRow label="Implantação" value={prazoImplantacao} />
            <SummaryRow label="Contrato" value={`${prazoContratoMeses} meses`} />
            <SummaryRow label="Renovação automática" value={renovacaoAutomatica ? "Sim" : "Não"} />
            <SummaryRow label="Reajuste" value={reajusteIndice === "Nenhum" ? "Nenhum" : `${reajusteIndice} (${reajustePeriodicidade})`} />
          </SectionCard>
          <SectionCard icon={CreditCard} title="Pagamento" onEdit={() => setStep(5)}>
            <SummaryRow label="Forma de pagamento" value={formaPagamentoLabel} />
            {formaPagamento !== "unico" && (
              <>
                {formaPagamento === "entrada_recorrencia" && <SummaryRow label="Valor da entrada" value={`${formatCurrency(entradaValor)} (${formatDateBR(dataVencimentoEntrada)})`} />}
                <SummaryRow label="Parcelas recorrentes" value={`${numeroParcelas}x de ${formatCurrency(parcelaValor)}`} />
                <SummaryRow label="Data do primeiro vencimento" value={formatDateBR(primeiroVencimentoParcela)} />
                <SummaryRow label="Dia fixo de vencimento" value={String(diaDoMes)} />
              </>
            )}
            <SummaryRow label="Métodos de pagamento" value={metodosPagamento.join(", ") || "—"} />
          </SectionCard>
        </div>
      </div>

      <div>
        <SectionCard icon={BarChart3} title="Resumo financeiro" sticky>
          <SummaryRow label="Itens recorrentes (mensal)" value={formatCurrency(recurringTotal)} />
          <SummaryRow label="Itens únicos (implantação)" value={formatCurrency(oneTimeTotal)} />
          <SummaryRow label="Desconto" value={formatCurrency(descontoCalc)} valueClass="text-success" />
          <div className="h-px bg-[var(--color-border-subtle)] my-2" />
          <SummaryRow label="Total da proposta" value={formatCurrency(totalProposta)} bold />
          <div className="h-px bg-[var(--color-border-subtle)] my-2" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] font-black uppercase text-[var(--color-text-muted)]">1º ciclo</p>
              <p className="text-sm font-black text-[var(--color-primary-blue)]">{formatCurrency(primeiroCiclo)}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-[var(--color-text-muted)]">Total em {numeroParcelas}m</p>
              <p className="text-sm font-black text-[var(--color-text-primary)]">{formatCurrency(totalEmNMeses)}</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Primitivos visuais ─────────────────────────────────────────────────────

const inputCls = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all";

function SectionCard({ icon: Icon, title, desc, children, sticky, onEdit }: any) {
  return (
    <div className={cn("bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl p-4", sticky && "lg:sticky lg:top-0")}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5" /></div>
          <div>
            <p className="text-xs font-black text-[var(--color-text-primary)]">{title}</p>
            {desc && <p className="text-[10px] text-[var(--color-text-muted)]">{desc}</p>}
          </div>
        </div>
        {onEdit && (
          <button onClick={onEdit} className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary-blue)] shrink-0">
            <Pencil className="w-3 h-3" /> Editar
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, className }: any) {
  return (
    <div className={className}>
      <span className="text-[10px] font-bold text-[var(--color-text-muted)] block mb-1">{label}</span>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, bold, valueClass }: any) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] text-[var(--color-text-muted)]">{label}</span>
      <span className={cn("text-[11px] font-bold text-[var(--color-text-primary)] text-right", bold && "text-sm font-black text-[var(--color-primary-blue)]", valueClass)}>{value}</span>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn("w-8 h-[18px] rounded-full relative transition-colors shrink-0", checked ? "bg-[var(--color-primary-blue)]" : "bg-[var(--color-border-default)]")}
    >
      <span className={cn("absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-sm", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

function formatCurrencyBR(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDateBR(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
