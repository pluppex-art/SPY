import { useEffect, useState } from "react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { Trash2, Plus, Split, FileText, Calendar, FolderOpen, User, DollarSign, Scale, Check, AlertCircle, Equal, Copy } from "lucide-react";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { cn } from "../../../lib/utils";
import { splitInstallments } from "../../../lib/saleCalculator";
import { ClienteSelect } from "./ClienteSelect";
import { Field, ModalFooter, ModalTitle, inputCls, selectCls } from "./ModalKit";

export interface RateioParentEntry {
  id: string;
  description: string;
  date: string;
  value: number;
  type: "Pagar" | "Receber";
  category_id?: string | null;
}

export interface RateioDivisao {
  key: string;
  date: string;
  description: string;
  valor: string;
  counterparty: string;
  /** id do cadastro em Contatos/clientes, quando escolhido da lista. */
  contatoId?: string | null;
  categoryId: string;
  pago: boolean;
}

interface RateioModalProps {
  isOpen: boolean;
  onClose: () => void;
  parent: RateioParentEntry | null;
  categoriasDoTipo: { id: string; nome: string }[];
  onConfirm: (divisoes: RateioDivisao[]) => Promise<void>;
}

let seq = 0;
const newKey = () => `div_${Date.now()}_${seq++}`;

/**
 * "Detalhar valor" — divide um lançamento em N linhas (rateio). Cada
 * divisão herda data/descrição/categoria do pai (spec §3.7), e o botão de
 * confirmar só habilita quando a soma bate exatamente com o valor total —
 * comparando em centavos pra não cair em erro de ponto flutuante.
 */
export function RateioModal({ isOpen, onClose, parent, categoriasDoTipo, onConfirm }: RateioModalProps) {
  const { formatCurrency } = useLocalization();
  const [divisoes, setDivisoes] = useState<RateioDivisao[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) { setDivisoes([]); setSaving(false); }
  }, [isOpen, parent?.id]);

  if (!parent) return null;

  const totalCents = Math.round(parent.value * 100);
  const somaCents = divisoes.reduce((s, d) => s + Math.round((parseFloat(d.valor) || 0) * 100), 0);
  const restanteCents = totalCents - somaCents;
  const bate = divisoes.length >= 2 && restanteCents === 0 && divisoes.every(d => d.categoryId && parseFloat(d.valor) > 0);
  const tipoContato = parent.type === "Receber" ? "CLIENTE" : "FORNECEDOR";
  const pct = totalCents > 0 ? Math.min(100, Math.max(0, (somaCents / totalCents) * 100)) : 0;
  const excedeu = restanteCents < 0;

  // Motivos pelos quais ainda não dá pra confirmar — mostrados como checklist.
  const pendencias: string[] = [];
  if (divisoes.length < 2) pendencias.push("Adicione ao menos 2 divisões.");
  if (divisoes.some(d => !(parseFloat(d.valor) > 0))) pendencias.push("Toda divisão precisa de um valor maior que zero.");
  if (divisoes.some(d => !d.categoryId)) pendencias.push("Escolha a categoria de cada divisão.");
  if (restanteCents > 0) pendencias.push(`Faltam ${formatCurrency(restanteCents / 100)} para fechar o valor total.`);
  if (restanteCents < 0) pendencias.push(`A soma excede o total em ${formatCurrency(Math.abs(restanteCents) / 100)}.`);

  const handleClose = async () => {
    if (saving) return;
    if (divisoes.length > 0 && !(await confirmDialog({ title: "Descartar divisão?", description: "As divisões que você montou ainda não foram salvas e serão perdidas.", confirmText: "Descartar", cancelText: "Continuar editando", variant: "danger" }))) return;
    onClose();
  };

  const handleDividirIgualmente = () => {
    const n = Math.max(2, divisoes.length);
    const valores = splitInstallments(parent.value, n);
    setDivisoes(prev => {
      const base = prev.length >= 2 ? prev : [
        ...prev,
        ...Array.from({ length: n - prev.length }, () => ({ key: newKey(), date: parent.date, description: parent.description, valor: "", counterparty: "", contatoId: null, categoryId: parent.category_id || "", pago: false })),
      ];
      return base.map((d, i) => ({ ...d, valor: valores[i].toFixed(2) }));
    });
  };

  const handleDuplicar = (key: string) => {
    setDivisoes(prev => {
      const i = prev.findIndex(d => d.key === key);
      if (i < 0) return prev;
      const copy = { ...prev[i], key: newKey(), valor: "" };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  };

  const addDivisoes = (n: number, valorSugerido?: number) => {
    const novas: RateioDivisao[] = Array.from({ length: n }, () => ({
      key: newKey(),
      date: parent.date,
      description: parent.description,
      valor: valorSugerido !== undefined ? valorSugerido.toFixed(2) : "",
      counterparty: "",
      contatoId: null,
      categoryId: parent.category_id || "",
      pago: false,
    }));
    setDivisoes(prev => [...prev, ...novas]);
  };

  const updateDivisao = (key: string, patch: Partial<RateioDivisao>) => {
    setDivisoes(prev => prev.map(d => d.key === key ? { ...d, ...patch } : d));
  };

  const removeDivisao = (key: string) => setDivisoes(prev => prev.filter(d => d.key !== key));

  const handleCriarRestante = () => addDivisoes(1, restanteCents / 100);

  const handleConfirm = async () => {
    if (!bate) return;
    setSaving(true);
    try {
      await onConfirm(divisoes);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={<ModalTitle icon={Split} title="Detalhar Valor" subtitle="Divida este lançamento em várias linhas — cada uma com sua categoria, data ou contato." />}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Lançamento de origem */}
        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/60 p-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Lançamento de origem</div>
            <div className="text-sm font-bold text-[var(--color-text-primary)] truncate">{parent.description || "Sem nome"}</div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{parent.type === "Receber" ? "A receber" : "A pagar"} · {parent.date}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Valor total</div>
            <div className="text-lg font-black font-mono text-[var(--color-text-primary)]">{formatCurrency(parent.value)}</div>
          </div>
        </div>

        {/* Progresso do rateio */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5"><Scale className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Distribuído {formatCurrency(somaCents / 100)} de {formatCurrency(parent.value)}</span>
            <span className={cn("font-mono font-bold", excedeu ? "text-[var(--color-danger)]" : restanteCents === 0 && divisoes.length > 0 ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]")}>{pct.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", excedeu ? "bg-[var(--color-danger)]" : restanteCents === 0 && divisoes.length > 0 ? "bg-[var(--color-success)]" : "bg-[var(--color-primary-blue)]")} style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
          {divisoes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border-default)] py-8 text-center">
              <Split className="w-6 h-6 text-[var(--color-text-faint)] mx-auto mb-2" />
              <p className="text-xs text-[var(--color-text-muted)]">Nenhuma divisão ainda.</p>
              <p className="text-[11px] text-[var(--color-text-faint)]">Use “Adicionar divisão” ou “Dividir igualmente” para começar.</p>
            </div>
          ) : divisoes.map((d, i) => {
            const v = parseFloat(d.valor) || 0;
            const semValor = d.valor !== "" && !(v > 0);
            const dPct = parent.value > 0 ? (v / parent.value) * 100 : 0;
            return (
              <div key={d.key} className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/40 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-primary)] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-[10px] flex items-center justify-center">{i + 1}</span>
                    Divisão {i + 1}
                    {v > 0 && <span className="text-[10px] font-mono font-bold text-[var(--color-text-faint)] normal-case tracking-normal">{dPct.toFixed(1)}% do total</span>}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => handleDuplicar(d.key)} disabled={saving} title="Duplicar divisão" className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-surface-sunken)] cursor-pointer disabled:opacity-50"><Copy className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => removeDivisao(d.key)} disabled={saving} title="Remover divisão" className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 cursor-pointer disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  <Field label="Descrição" icon={FileText} className="sm:col-span-3">
                    <input type="text" placeholder="Descrição" value={d.description} onChange={(e) => updateDivisao(d.key, { description: e.target.value })} className={inputCls()} />
                  </Field>
                  <Field label="Data" icon={Calendar} className="sm:col-span-3">
                    <input type="date" value={d.date} onChange={(e) => updateDivisao(d.key, { date: e.target.value })} className={inputCls()} />
                  </Field>
                  <Field label="Categoria" icon={FolderOpen} required className="sm:col-span-2" error={!d.categoryId && divisoes.length >= 2 && somaCents > 0 ? "Escolha a categoria." : undefined}>
                    <select value={d.categoryId} onChange={(e) => updateDivisao(d.key, { categoryId: e.target.value })} className={selectCls(!d.categoryId && divisoes.length >= 2 && somaCents > 0)}>
                      <option value="">Selecione...</option>
                      {categoriasDoTipo.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </Field>
                  <Field label={parent.type === "Receber" ? "Cliente" : "Fornecedor"} icon={User} className="sm:col-span-2">
                    <ClienteSelect value={d.counterparty} contatoId={d.contatoId} onChange={(n, id) => updateDivisao(d.key, { counterparty: n, contatoId: id })} preferTipo={tipoContato} placeholder="Opcional — buscar cadastro" />
                  </Field>
                  <Field label="Valor (R$)" icon={DollarSign} required className="sm:col-span-2" error={semValor ? "Informe um valor maior que zero." : undefined}>
                    <input type="number" step="0.01" min="0" placeholder="0,00" value={d.valor} onChange={(e) => updateDivisao(d.key, { valor: e.target.value })} className={`${inputCls(semValor)} font-mono`} />
                  </Field>
                </div>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] cursor-pointer">
                  <input type="checkbox" checked={d.pago} onChange={(e) => updateDivisao(d.key, { pago: e.target.checked })} className="cursor-pointer" /> {parent.type === "Receber" ? "Já recebida" : "Já paga"}
                </label>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => addDivisoes(divisoes.length === 0 ? 2 : 1)} disabled={saving} className="h-9 px-3 text-xs font-bold gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Adicionar divisão
          </Button>
          <Button type="button" variant="outline" onClick={handleDividirIgualmente} disabled={saving || parent.value <= 0} className="h-9 px-3 text-xs font-bold gap-1.5" title="Distribui o valor total igualmente entre as divisões (centavos sobrando vão para a última)">
            <Equal className="w-3.5 h-3.5" /> Dividir igualmente{divisoes.length >= 2 ? ` em ${divisoes.length}` : ""}
          </Button>
        </div>

        {/* Resumo */}
        <div className="rounded-xl border border-[var(--color-border-subtle)] p-3.5 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">Soma da divisão</span>
            <span className={cn("font-mono font-semibold", somaCents !== totalCents ? "text-[var(--color-danger)]" : "text-[var(--color-success)]")}>{formatCurrency(somaCents / 100)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">{excedeu ? "Excedente" : "Valor restante"}</span>
            <span className={cn("font-mono font-semibold", restanteCents === 0 ? "text-[var(--color-text-primary)]" : "text-[var(--color-danger)]")}>{formatCurrency(Math.abs(restanteCents) / 100)}</span>
          </div>
          {restanteCents > 0 && divisoes.length > 0 && (
            <button type="button" onClick={handleCriarRestante} disabled={saving} className="text-[11px] font-bold text-[var(--color-primary-blue)] hover:underline cursor-pointer">
              + Criar divisão com o restante ({formatCurrency(restanteCents / 100)})
            </button>
          )}
          {divisoes.length > 0 && (
            <ul className="pt-1.5 mt-1 border-t border-[var(--color-border-subtle)] space-y-0.5">
              {bate ? (
                <li className="flex items-center gap-1.5 text-[11px] text-[var(--color-success)] font-bold"><Check className="w-3 h-3" /> Tudo certo: a soma fecha com o valor total.</li>
              ) : pendencias.map(p => (
                <li key={p} className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]"><AlertCircle className="w-3 h-3 text-[var(--color-warning)] shrink-0" /> {p}</li>
              ))}
            </ul>
          )}
        </div>

        <ModalFooter type="button" onCancel={handleClose} onSubmit={handleConfirm} saving={saving} disabled={!bate} submitLabel="Confirmar divisão" submitIcon={Check} />
      </div>
    </Modal>
  );
}
