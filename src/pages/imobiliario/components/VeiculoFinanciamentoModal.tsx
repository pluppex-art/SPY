import { useState, useMemo } from "react";
import { Landmark, Percent, Share2, CheckCircle2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Modal } from "../../../components/ui/modal";
import { toast } from "sonner";
import { useLocalization } from "../../../contexts/LocalizationContext";

const FIELD = "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-blue-500/50";
const LABEL = "text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider mb-1.5 block";

interface VeiculoFinanciamentoModalProps {
  veiculoValor: number;
  veiculoNome?: string;
  onClose: () => void;
  onSave: (data: any) => void;
}

export function VeiculoFinanciamentoModal({
  veiculoValor,
  veiculoNome = "Veículo",
  onClose,
  onSave,
}: VeiculoFinanciamentoModalProps) {
  const { formatCurrency } = useLocalization();
  const [form, setForm] = useState({
    cliente: "",
    telefone: "",
    cpf: "",
    valor_entrada: String(Math.round(veiculoValor * 0.2)), // 20% padrão
    parcelas: "48",
    taxa_juros: "1.49", // % a.m.
    banco_financeira: "Santander Financiamentos",
    veiculo_troca_descricao: "",
    veiculo_troca_valor: "",
    observacoes: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const entrada = Number(form.valor_entrada) || 0;
  const trocaValor = Number(form.veiculo_troca_valor) || 0;
  const valorFinanciado = Math.max(veiculoValor - entrada - trocaValor, 0);
  const numParcelas = Math.max(1, Number(form.parcelas) || 48);
  const taxaMensal = (Number(form.taxa_juros) || 1.49) / 100;

  // Cálculo da Parcela usando Tabela Price: PMT = PV * (i * (1+i)^n) / ((1+i)^n - 1)
  const valorParcelaEstimada = useMemo(() => {
    if (valorFinanciado <= 0) return 0;
    if (taxaMensal <= 0) return valorFinanciado / numParcelas;
    const fator = Math.pow(1 + taxaMensal, numParcelas);
    return (valorFinanciado * (taxaMensal * fator)) / (fator - 1);
  }, [valorFinanciado, numParcelas, taxaMensal]);

  const percentualEntrada = veiculoValor > 0 ? ((entrada + trocaValor) / veiculoValor) * 100 : 0;

  const handleSubmit = () => {
    if (!form.cliente.trim()) {
      toast.error("Nome do cliente é obrigatório.");
      return;
    }
    onSave({
      cliente: form.cliente.trim(),
      telefone: form.telefone.trim() || null,
      cpf: form.cpf.trim() || null,
      valor_veiculo: veiculoValor,
      valor_entrada: entrada,
      valor_financiado: valorFinanciado,
      parcelas: numParcelas,
      valor_parcela: valorParcelaEstimada,
      taxa_juros: Number(form.taxa_juros) || 1.49,
      banco_financeira: form.banco_financeira.trim() || null,
      veiculo_troca_descricao: form.veiculo_troca_descricao.trim() || null,
      veiculo_troca_valor: form.veiculo_troca_descricao.trim() ? trocaValor : null,
      observacoes: form.observacoes.trim() || null,
    });
    toast.success("Simulação de financiamento registrada com sucesso!");
    onClose();
  };

  const handleShareWhatsApp = () => {
    if (!form.cliente.trim()) {
      toast.error("Preencha o nome do cliente antes de enviar.");
      return;
    }
    const msg = encodeURIComponent(
      `Olá, ${form.cliente}!\n\nSegue a simulação de financiamento para o *${veiculoNome}*:\n` +
      `🚗 *Valor do Veículo:* ${formatCurrency(veiculoValor)}\n` +
      `💵 *Entrada:* ${formatCurrency(entrada)} (${percentualEntrada.toFixed(0)}%)\n` +
      (trocaValor > 0 ? `🔄 *Veículo na Troca:* ${formatCurrency(trocaValor)}\n` : "") +
      `🏦 *Valor Financiado:* ${formatCurrency(valorFinanciado)}\n` +
      `📅 *Plano:* ${numParcelas}x de *${formatCurrency(valorParcelaEstimada)}*\n` +
      `🏛️ *Banco/Financeira:* ${form.banco_financeira}\n\nFicamos à disposição para aprovação da sua ficha!`
    );
    const phone = form.telefone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone ? (phone.startsWith("55") ? phone : "55" + phone) : ""}?text=${msg}`, "_blank");
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-xl"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
            <Landmark className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-[var(--color-text-primary)]">
              Simulador de Financiamento Automotivo
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {veiculoNome} · Valor: <strong className="text-emerald-500 font-mono">{formatCurrency(veiculoValor)}</strong>
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleShareWhatsApp}
            className="gap-1.5 text-xs font-bold text-emerald-500 hover:bg-emerald-500/10 border-emerald-500/30"
          >
            <Share2 className="w-3.5 h-3.5" /> Enviar Proposta via WhatsApp
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 text-xs font-bold gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Salvar Simulação
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Dados do Cliente */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={LABEL}>Nome do Cliente *</label>
            <input
              value={form.cliente}
              onChange={(e) => set("cliente", e.target.value)}
              placeholder="Ex: João Silva"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL}>Telefone / WhatsApp</label>
            <input
              value={form.telefone}
              onChange={(e) => set("telefone", e.target.value)}
              placeholder="(11) 99999-9999"
              className={FIELD}
            />
          </div>
        </div>

        {/* Entrada & Atalhos Rápidos */}
        <div className="p-3.5 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border-default)] space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-blue-500" /> Valor de Entrada (R$)
            </label>
            <span className="text-[11px] font-bold text-blue-500">
              {percentualEntrada.toFixed(1)}% do veículo
            </span>
          </div>

          <input
            type="number"
            value={form.valor_entrada}
            onChange={(e) => set("valor_entrada", e.target.value)}
            className={`${FIELD} font-mono font-bold`}
          />

          {/* Atalhos Rápidos de Entrada */}
          <div className="flex gap-1.5 justify-end">
            <button
              type="button"
              onClick={() => set("valor_entrada", "0")}
              className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-blue-500 text-[var(--color-text-muted)]"
            >
              Zero Entrada
            </button>
            {[20, 30, 40, 50].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => set("valor_entrada", String(Math.round(veiculoValor * (pct / 100))))}
                className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-blue-500 text-[var(--color-text-muted)]"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Parcelas e Taxa */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Quantidade de Parcelas</label>
            <select
              value={form.parcelas}
              onChange={(e) => set("parcelas", e.target.value)}
              className={FIELD}
            >
              {[12, 24, 36, 48, 60].map((p) => (
                <option key={p} value={p}>
                  {p} meses ({p}x)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Taxa Estimada (% a.m.)</label>
            <input
              type="number"
              step="0.05"
              value={form.taxa_juros}
              onChange={(e) => set("taxa_juros", e.target.value)}
              className={FIELD}
            />
          </div>
        </div>

        {/* Instituição Financeira */}
        <div>
          <label className={LABEL}>Banco / Financeira Parceira</label>
          <select
            value={form.banco_financeira}
            onChange={(e) => set("banco_financeira", e.target.value)}
            className={FIELD}
          >
            <option value="Santander Financiamentos">Santander Financiamentos</option>
            <option value="BV Financeira">BV Financeira</option>
            <option value="Itaú Auto">Itaú Financiamentos</option>
            <option value="Bradesco Financiamentos">Bradesco Financiamentos</option>
            <option value="Banco Pan">Banco Pan</option>
            <option value="Safra Financeira">Safra Financeira</option>
          </select>
        </div>

        {/* Veículo de Troca */}
        <div className="p-3.5 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border-default)] space-y-2.5">
          <label className="text-xs font-bold text-[var(--color-text-primary)] block">
            Veículo na Troca (Opcional)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              value={form.veiculo_troca_descricao}
              onChange={(e) => set("veiculo_troca_descricao", e.target.value)}
              placeholder="Ex: Corolla 2019 XEi Prata"
              className={FIELD}
            />
            <input
              type="number"
              value={form.veiculo_troca_valor}
              onChange={(e) => set("veiculo_troca_valor", e.target.value)}
              placeholder="Valor avaliado (R$)"
              className={`${FIELD} font-mono`}
            />
          </div>
        </div>

        {/* Resumo Visual de Parcela */}
        <div className="p-4 bg-gradient-to-r from-blue-900/30 to-indigo-900/20 rounded-2xl border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 block">
              Valor Total Financiado
            </span>
            <span className="text-base font-black font-mono text-[var(--color-text-primary)]">
              {formatCurrency(valorFinanciado)}
            </span>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
              {numParcelas}x Parcelas Estimadas
            </span>
            <span className="text-2xl font-black font-mono text-emerald-400">
              {formatCurrency(valorParcelaEstimada)}
              <span className="text-xs font-normal text-slate-400">/mês</span>
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
