import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, FileText, User, DollarSign, Calendar, Briefcase, Loader2 } from "lucide-react";
import { Button } from "../../button";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";

interface NovaPropostaRapidaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    cliente: string;
    titulo: string;
    valor: string;
    vencimento: string;
    vendedor: string;
  }) => void;
}

const inputClass =
  "w-full bg-white/[0.04] text-white border border-white/10 rounded-xl h-12 px-4 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all placeholder:text-slate-600";

export function NovaPropostaRapidaModal({ isOpen, onClose, onSubmit }: NovaPropostaRapidaModalProps) {
  const { colaboradores, clienteBase } = useData();
  const { user } = useAuth();
  const vendedores = useMemo(() => {
    const nomes = colaboradores.filter((c: any) => c.status === "Ativo").map((c: any) => c.nome);
    const unique = Array.from(new Set([user?.name, ...nomes].filter(Boolean))) as string[];
    return unique.length > 0 ? unique : ["Sem colaboradores cadastrados"];
  }, [colaboradores, user?.name]);

  const [cliente, setCliente] = useState("");
  const [titulo, setTitulo] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [vendedor, setVendedor] = useState(user?.name || "");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setCliente(""); setTitulo(""); setValor(""); setVencimento(""); setVendedor(user?.name || "");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente || !titulo || !valor) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 300));
    onSubmit({ cliente, titulo, valor, vencimento, vendedor });
    setLoading(false);
    reset();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--color-surface-elevated)] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl shadow-black/60 max-h-[90dvh] overflow-y-auto ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
          >
            {/* Header */}
            <div className="relative p-6 border-b border-white/10 bg-gradient-to-br from-blue-600/10 via-transparent to-transparent">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center border border-blue-500/20 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white tracking-tight">Nova Proposta Comercial</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Preencha os dados da oferta ao cliente</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="absolute right-4 top-4 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Cliente */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                  <User className="w-3 h-3" /> Nome do Cliente
                </label>
                <input
                  type="text"
                  required
                  list="nova-proposta-rapida-clientes"
                  placeholder="Busque ou digite o nome do cliente"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className={inputClass}
                />
                <datalist id="nova-proposta-rapida-clientes">
                  {clienteBase.map((c: any) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>

              {/* Título */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                  <Briefcase className="w-3 h-3" /> Projeto / Título
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Consultoria CRM, Migração de Sistema"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Valor */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                    <DollarSign className="w-3 h-3" /> Valor (R$)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 15000"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className={inputClass}
                  />
                </div>

                {/* Vencimento */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Validade
                  </label>
                  <input
                    type="date"
                    value={vencimento}
                    onChange={(e) => setVencimento(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Vendedor */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                  Vendedor Responsável
                </label>
                <select
                  value={vendedor}
                  onChange={(e) => setVendedor(e.target.value)}
                  className={inputClass}
                >
                  {vendedores.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Footer */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 h-12 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Proposta"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
