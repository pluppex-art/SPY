import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Modal } from "../../components/ui/modal";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useData } from "../../contexts/DataContext";
import { supabase } from "../../lib/supabase";

export type TipoAjuste = "entrada" | "saida" | "ajuste";

export interface AjusteAplicado {
  tipo: TipoAjuste;
  quantidadeMovimentada: number;
  motivo: string;
  novoSaldo: number;
}

/**
 * Modal único de movimentação de saldo. Usado em Estoque ("Ajustar Saldo") e em
 * Compras ("Dar Entrada"), para o mesmo produto sempre passar pela mesma regra.
 * A movimentação vai pelo RPC registrar_movimentacao_estoque; só atualiza a tela se o banco aceitar.
 */
export function AjusteEstoqueModal({
  product, isOpen, onClose, initialTipo = "entrada", initialQtd = "", initialMotivo = "Compra de Fornecedor",
  referencia, confirmLabel = "Confirmar Ajuste", onApplied,
}: {
  product: any | null;
  isOpen: boolean;
  onClose: () => void;
  initialTipo?: TipoAjuste;
  initialQtd?: string;
  initialMotivo?: string;
  /** Texto anexado ao motivo no histórico (ex.: "Ordem OC-1B50D8 • Fornecedor"). */
  referencia?: string;
  confirmLabel?: string;
  onApplied?: (r: AjusteAplicado) => void | Promise<void>;
}) {
  const { products, setProducts } = useData();
  const [tipo, setTipo] = useState<TipoAjuste>(initialTipo);
  const [qtd, setQtd] = useState(initialQtd);
  const [motivo, setMotivo] = useState(initialMotivo);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) { setTipo(initialTipo); setQtd(initialQtd); setMotivo(initialMotivo); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, product?.id]);

  if (!product) return null;

  const salvar = async () => {
    const n = Number(qtd);
    if (isNaN(n) || n <= 0) { toast.error("Informe uma quantidade válida."); return; }
    const saldoAtual = Number(product.currentStock ?? 0);
    let novoSaldo = saldoAtual;
    let movimentada = n;
    if (tipo === "entrada") { novoSaldo = saldoAtual + n; }
    else if (tipo === "saida") {
      if (n > saldoAtual) { toast.error(`Saldo insuficiente para saída. Estoque atual: ${saldoAtual}`); return; }
      novoSaldo = saldoAtual - n; movimentada = -n;
    } else { movimentada = n - saldoAtual; novoSaldo = n; }

    if (!supabase) { toast.error("Sem conexão com o banco de dados."); return; }
    const motivoFinal = [motivo || "Ajuste de Estoque", referencia].filter(Boolean).join(" • ");
    setSaving(true);
    try {
      const { error } = await supabase.rpc("registrar_movimentacao_estoque", {
        p_product_id: product.id,
        p_tipo: tipo,
        p_quantidade: n,
        p_motivo: motivoFinal,
      });
      if (error) { toast.error("Erro ao registrar a movimentação no estoque."); return; }
      setProducts(products.map((p: any) => (p.id === product.id ? { ...p, currentStock: novoSaldo } : p)));
      toast.success(`Estoque de "${product.name}" atualizado para ${novoSaldo} unidades!`);
      await onApplied?.({ tipo, quantidadeMovimentada: movimentada, motivo: motivoFinal, novoSaldo });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar estoque.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-md"
      title={
        <div>
          <h3 className="text-base font-bold text-[var(--color-text-primary)]">Ajustar Estoque</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
            {product.name} (Saldo atual: <strong>{product.currentStock ?? 0} un.</strong>)
          </p>
          {referencia && <p className="text-[10px] text-[var(--color-text-faint)] mt-0.5 truncate">{referencia}</p>}
        </div>
      }
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={salvar} loading={saving} className="font-bold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white">
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5 py-1">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] block mb-1.5">Tipo de Movimentação</label>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { id: "entrada", label: "Entrada (+)" },
              { id: "saida", label: "Saída (-)" },
              { id: "ajuste", label: "Inventário (=)" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                className={`p-2 rounded-xl text-xs font-bold border transition-all text-center ${
                  tipo === t.id
                    ? "bg-[var(--color-primary-blue)] text-white border-[var(--color-primary-blue)] shadow-xs"
                    : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1">
            {tipo === "ajuste" ? "Novo Saldo Exato (unidades)" : "Quantidade a Movimentar"}
          </label>
          <Input type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" className="font-mono font-bold text-sm" />
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-text-primary)] block mb-1">Motivo da Movimentação</label>
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
          >
            {["Compra de Fornecedor", "Reposição de Loja", "Inventário Periódico", "Avaria / Quebra", "Validade Vencida", "Devolução de Cliente", "Consumo Interno", "Outros"].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
