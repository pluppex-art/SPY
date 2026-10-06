import { useEffect, useState } from "react";
import { Modal } from "../../../../components/ui/modal";
import { Button } from "../../../../components/ui/button";
import {
  FileSignature, Building2, CircleDot, Package, DollarSign, FileText as FileTextIcon,
  QrCode, CreditCard, Landmark, Calendar, X, User, Tag, StickyNote,
} from "lucide-react";
import type { Contract } from "../../../../types";

const STATUS_OPTIONS: { id: string; dot: string }[] = [
  { id: "Ativo", dot: "bg-success" },
  { id: "Inadimplente", dot: "bg-warning" },
  { id: "Cancelado", dot: "bg-danger" },
];

const PAYMENT_METHOD_OPTIONS = [
  { id: "Boleto bancário", icon: FileTextIcon },
  { id: "PIX", icon: QrCode },
  { id: "Cartão de crédito", icon: CreditCard },
  { id: "Transferência bancária", icon: Landmark },
] as const;

// Mesma lista de SETORES do modal ativo de cliente (NovoClienteModal.tsx) —
// mantém consistência entre as duas telas que editam `clientes.industry`.
const SETORES = ["Tecnologia", "Engenharia", "Saúde", "Varejo", "Indústria", "Educação", "Financeiro", "Outros"];

function initials(name?: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

const fieldClass = "w-full h-11 pl-10 pr-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/30 focus:border-[var(--color-primary-blue)]";
const iconWrapClass = "absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-[var(--color-text-primary)] mb-1.5 block">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

export interface ContractFormPayload {
  client: string;
  plan: string;
  description: string | null;
  mrr: string;
  date: string;
  endDate: string | null;
  status: string;
  responsavelId: string | null;
  paymentMethod: string | null;
  observacoes: string | null;
  /** Setor do cliente vinculado — só é escrito de volta em `clientes.industry`
   * quando muda em relação ao valor original (ver ContractFormModal.onSave). */
  clienteIndustry: string | null;
}

interface ContractFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** null = criar um contrato novo. */
  contract: Contract | null;
  clienteBase: any[];
  colaboradores: any[];
  onSave: (payload: ContractFormPayload) => void | Promise<void>;
}

export function ContractFormModal({ isOpen, onClose, contract, clienteBase, colaboradores, onSave }: ContractFormModalProps) {
  const isEditing = !!contract;
  const [client, setClient] = useState("");
  const [plan, setPlan] = useState("");
  const [description, setDescription] = useState("");
  const [mrr, setMrr] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("Ativo");
  const [responsavelId, setResponsavelId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [clienteIndustry, setClienteIndustry] = useState("");
  const [saving, setSaving] = useState(false);

  const clienteSelecionado = clienteBase.find((c: any) => c.name === client);

  useEffect(() => {
    if (!isOpen) return;
    if (contract) {
      setClient(contract.client);
      setPlan(contract.plan);
      setDescription(contract.description || "");
      setMrr(String(typeof contract.mrr === "number" ? contract.mrr : contract.mrr).replace(/[^\d,.-]/g, ""));
      setDate(contract.date || "");
      setEndDate(contract.endDate || "");
      setStatus(contract.status || "Ativo");
      setResponsavelId(contract.responsavelId || "");
      setPaymentMethod(contract.paymentMethod || "");
      setObservacoes(contract.observacoes || "");
      const clienteDoContrato = clienteBase.find((c: any) => c.name === contract.client);
      setClienteIndustry(clienteDoContrato?.industry || "");
    } else {
      setClient(""); setPlan(""); setDescription(""); setMrr(""); setDate(""); setEndDate("");
      setStatus("Ativo"); setResponsavelId(""); setPaymentMethod(""); setObservacoes(""); setClienteIndustry("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contract]);

  // Ao trocar de cliente no select, carrega o setor atual dele — sem isso o
  // campo "Setor do Cliente" ficaria com o setor do cliente ANTERIOR.
  const handleClientChange = (nome: string) => {
    setClient(nome);
    const c = clienteBase.find((cb: any) => cb.name === nome);
    setClienteIndustry(c?.industry || "");
  };

  const toISODate = (br: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(br) ? br.split("/").reverse().join("-") : br);
  const toBRDate = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

  const handleSubmit = async () => {
    if (!client.trim() || !plan.trim() || !mrr.trim() || !date.trim()) return;
    setSaving(true);
    try {
      await onSave({
        client: client.trim(),
        plan: plan.trim(),
        description: description.trim() || null,
        mrr,
        date,
        endDate: endDate || null,
        status,
        responsavelId: responsavelId || null,
        paymentMethod: paymentMethod || null,
        observacoes: observacoes.trim() || null,
        clienteIndustry: clienteIndustry || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center shrink-0">
            <FileSignature className="w-5 h-5 text-[var(--color-primary-blue)]" />
          </div>
          <div>
            <div className="text-base font-black text-[var(--color-text-primary)]">{isEditing ? "Editar Contrato" : "Novo Contrato"}</div>
            <div className="text-xs text-[var(--color-text-muted)] font-medium">Atualize as informações do contrato e mantenha sua carteira organizada.</div>
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !client.trim() || !plan.trim() || !mrr.trim() || !date.trim()} className="gap-1.5">
            {isEditing ? "Salvar Alterações" : "Salvar Contrato"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Cliente" required>
            <div className="relative">
              <Building2 className={`w-4 h-4 ${iconWrapClass}`} />
              <select value={client} onChange={(e) => handleClientChange(e.target.value)} className={fieldClass}>
                <option value="">Selecione o cliente</option>
                {/* Contrato de proposta aceita pode trazer um nome de cliente que não
                    existe (mais) em clienteBase — sem essa opção extra, o select caía
                    pro placeholder em branco ao editar, escondendo o cliente real. */}
                {client && !clienteBase.some((c: any) => c.name === client) && (
                  <option value={client}>{client} (fora da lista de clientes)</option>
                )}
                {clienteBase.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {clienteSelecionado?.documento && <p className="text-[10px] text-[var(--color-text-faint)] mt-1 ml-1">CNPJ {clienteSelecionado.documento}</p>}
          </Field>

          <Field label="Status" required>
            <div className="relative">
              <CircleDot className={`w-4 h-4 ${iconWrapClass} ${status === "Ativo" ? "text-success" : status === "Inadimplente" ? "text-warning" : "text-danger"}`} />
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
                {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
            </div>
          </Field>

          <Field label="Plano Acordado" required>
            <div className="relative">
              <Package className={`w-4 h-4 ${iconWrapClass}`} />
              <input type="text" list="planos-sugeridos" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Ex: Starter, Pro, ou o título da proposta" className={fieldClass} />
              <datalist id="planos-sugeridos">
                <option value="Starter" /><option value="Pro" /><option value="Enterprise" /><option value="Consultoria Avulsa" />
              </datalist>
            </div>
          </Field>

          <Field label="Mensalidade (MRR)" required>
            <div className="relative">
              <DollarSign className={`w-4 h-4 ${iconWrapClass}`} />
              <input type="text" value={mrr} onChange={(e) => setMrr(e.target.value)} placeholder="Ex: 1500,00" className={fieldClass} />
            </div>
          </Field>

          <Field label="Descrição (opcional)">
            <textarea value={description} onChange={(e) => e.target.value.length <= 500 && setDescription(e.target.value)} placeholder="Ex: Proposta Comercial — Nome do Cliente" rows={2} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] p-3 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/30 focus:border-[var(--color-primary-blue)] resize-none" />
            <p className="text-[10px] text-[var(--color-text-faint)] text-right mt-0.5">{description.length}/500</p>
          </Field>

          <Field label="Forma de Pagamento">
            <div className="relative">
              <CreditCard className={`w-4 h-4 ${iconWrapClass}`} />
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={fieldClass}>
                <option value="">Não informado</option>
                {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
              </select>
            </div>
          </Field>

          <Field label="Data de Assinatura" required>
            <div className="relative">
              <Calendar className={`w-4 h-4 ${iconWrapClass}`} />
              <input type="date" value={toISODate(date)} onChange={(e) => setDate(toBRDate(e.target.value))} className={`${fieldClass} pr-9`} />
              {date && <button type="button" onClick={() => setDate("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </Field>

          <Field label="Data de Término (opcional)">
            <div className="relative">
              <Calendar className={`w-4 h-4 ${iconWrapClass}`} />
              <input type="date" value={toISODate(endDate)} onChange={(e) => setEndDate(toBRDate(e.target.value))} className={`${fieldClass} pr-9`} />
              {endDate && <button type="button" onClick={() => setEndDate("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </Field>

          <Field label="Responsável">
            <div className="relative">
              {responsavelId ? (
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[var(--color-primary-blue)]/15 flex items-center justify-center text-[8px] font-black text-[var(--color-primary-blue)]">
                  {initials(colaboradores.find((c: any) => c.id === responsavelId)?.nome)}
                </span>
              ) : (
                <User className={`w-4 h-4 ${iconWrapClass}`} />
              )}
              <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={fieldClass}>
                <option value="">Sem responsável definido</option>
                {colaboradores.map((c: any) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` — ${c.cargo}` : ""}</option>)}
              </select>
            </div>
          </Field>

          <Field label="Setor do Cliente">
            <div className="relative">
              <Tag className={`w-4 h-4 ${iconWrapClass}`} />
              <select value={clienteIndustry} onChange={(e) => setClienteIndustry(e.target.value)} className={fieldClass} disabled={!client}>
                <option value="">{client ? "Selecione o setor" : "Selecione um cliente primeiro"}</option>
                {clienteIndustry && !SETORES.includes(clienteIndustry) && <option value={clienteIndustry}>{clienteIndustry}</option>}
                {SETORES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </Field>
        </div>

        <div className="rounded-2xl bg-[var(--color-surface-sunken)] p-4 border border-[var(--color-border-subtle)]">
          <div className="flex items-start gap-2.5 mb-2">
            <StickyNote className="w-4 h-4 text-[var(--color-primary-blue)] mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">Observações (opcional)</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">Adicione informações importantes sobre este contrato.</p>
            </div>
          </div>
          <textarea
            value={observacoes}
            onChange={(e) => e.target.value.length <= 1000 && setObservacoes(e.target.value)}
            placeholder="Ex.: condições especiais, próximos passos, contato principal..."
            rows={3}
            className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] p-3 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/30 focus:border-[var(--color-primary-blue)] resize-none"
          />
          <p className="text-[10px] text-[var(--color-text-faint)] text-right mt-0.5">{observacoes.length}/1000</p>
        </div>
      </div>
    </Modal>
  );
}
