import React, { useEffect, useMemo, useState } from "react";
import { FolderCode } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { useData } from "../../../contexts/DataContext";
import { useDevConfig, pick, DEV_STATUS_PROJETO } from "../../../lib/modules/devConfig";

const STATUSES = ["Em Planejamento", "Em Desenvolvimento", "Em Produção", "Pausado", "Concluído"];

export type NovoProjetoPayload = {
  name: string;
  description: string;
  status: string;
  stack: string[];
  productId?: string | number | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: NovoProjetoPayload) => void;
};

const label = "text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider";
const input = "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-4 py-2.5 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-primary-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-blue)] transition-all placeholder-[var(--color-text-faint)]";

export function NovoProjetoDevModal({ isOpen, onClose, onSave }: Props) {
  const { projetos: cfg } = useDevConfig();
  const STACKS = cfg.stacksSugeridas;
  const statusInicial = pick(cfg.statusInicial, DEV_STATUS_PROJETO, "Em Planejamento");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(statusInicial);
  const [stack, setStack] = useState<string[]>([]);
  const [productId, setProductId] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(false);

  const { products } = useData();
  const softwareProducts = useMemo(
    () => (products || []).filter((p: any) => p?.category === "Software"),
    [products]
  );

  useEffect(() => {
    if (!isOpen) return;
    setName(""); setDescription(""); setStatus("Em Planejamento"); setStack([]);
    setProductId(null);
    setLoading(false);
  }, [isOpen]);

  const canSubmit = useMemo(() => !loading && Boolean(name.trim()), [loading, name]);

  const toggleStack = (tech: string) =>
    setStack(prev => prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
      try {
      onSave({ name: name.trim(), description: description.trim(), status, stack, productId });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mt-0.5">
            <FolderCode className="w-4 h-4 text-blue-400" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-black text-white">Novo Projeto</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Dev & Tecnologia</div>
          </div>
        </div>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white" disabled={loading}>Cancelar</Button>
          <Button type="submit" form="novo-projeto-dev-form" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6" disabled={!canSubmit}>
            {loading ? "Criando..." : "Criar Projeto"}
          </Button>
        </>
      }
    >
      <form id="novo-projeto-dev-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={label}>Nome do Projeto *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={input} placeholder="Ex.: Módulo Financeiro 3.0" required />
          </div>
          <div className="space-y-2">
            <label className={label}>Status Inicial</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={input}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className={label}>Descrição</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className={`${input} resize-none`} placeholder="Descreva o objetivo e escopo do projeto..." />
        </div>

        <div className="space-y-2">
          <label className={label}>Vincular Produto (opcional)</label>
          <select
            className={input}
            value={String((productId as any) ?? "")}
            onChange={(e) => {
              const v = e.target.value;
              const next = v ? v : null;
              setProductId(next);

              if (!next) return;
              const selected = softwareProducts.find((p: any) => String(p.id) === String(next));
              if (selected?.description) setDescription(selected.description);
              else setDescription("");
            }}
          >
            <option value="">Nenhum produto</option>
            {softwareProducts.map((p: any) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500">Selecione um produto para vincular ao projeto. Ao conectar o hook de produtos, a descrição será preenchida automaticamente.</p>
        </div>

        <div className="space-y-2">
          <label className={label}>Stack Tecnológica</label>
          <div className="flex flex-wrap gap-2 p-3 bg-[var(--color-surface)] border border-white/10 rounded-xl min-h-[48px]">
            {STACKS.map(tech => (
              <button key={tech} type="button" onClick={() => toggleStack(tech)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${stack.includes(tech)
                  ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                  : "bg-white/[0.03] text-slate-500 border-white/5 hover:border-white/20 hover:text-slate-300"
                }`}>
                {stack.includes(tech) && <span className="mr-1">✓</span>}{tech}
              </button>
            ))}
          </div>
          {stack.length > 0 && (
            <p className="text-[10px] text-slate-500">{stack.length} tecnologia{stack.length !== 1 ? "s" : ""} selecionada{stack.length !== 1 ? "s" : ""}</p>
          )}
        </div>
      </form>
    </Modal>
  );
}
