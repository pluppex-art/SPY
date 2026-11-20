import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, UserX } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Base de clientes do tenant (tabela `clientes`). */
  clientes: any[];
  nomeAtual: string;
  cpfAtual: string;
  onSelect: (c: { nome: string; cpf: string }) => void;
  /** Cadastra o cliente e devolve o registro criado (ou undefined se não criou). */
  onCreate: (c: { name: string; documento: string | null; phone: string | null }) => Promise<any>;
}

const apenasDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const inputCls = "w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500";

/** Seleciona um cliente da base ou cadastra um novo sem sair do caixa. */
export function ClienteModal({ isOpen, onClose, clientes, nomeAtual, cpfAtual, onSelect, onCreate }: Props) {
  const [modo, setModo] = useState<"buscar" | "novo">("buscar");
  const [busca, setBusca] = useState("");
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setModo("buscar"); setBusca(""); setNome(""); setDocumento(""); setTelefone(""); setSalvando(false);
  }, [isOpen]);

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = apenasDigitos(busca);
    const base = (clientes || []).filter((c: any) => c?.name);
    const filtrados = !q ? base : base.filter((c: any) =>
      String(c.name).toLowerCase().includes(q) ||
      (qd.length >= 3 && (apenasDigitos(c.documento).includes(qd) || apenasDigitos(c.phone).includes(qd))) ||
      String(c.email || "").toLowerCase().includes(q));
    return filtrados.slice(0, 30);
  }, [clientes, busca]);

  const escolher = (c: any) => { onSelect({ nome: String(c.name), cpf: String(c.documento || "") }); onClose(); };

  const salvarNovo = async () => {
    const n = nome.trim();
    const d = apenasDigitos(documento);
    if (n.length < 2) { toast.error("Informe o nome do cliente."); return; }
    if (d && d.length !== 11 && d.length !== 14) { toast.error("CPF deve ter 11 dígitos e CNPJ, 14."); return; }
    setSalvando(true);
    try {
      const criado = await onCreate({ name: n, documento: documento.trim() || null, phone: telefone.trim() || null });
      if (!criado) return; // duplicado ou falha: o contexto já avisou
      toast.success("Cliente cadastrado.");
      onSelect({ nome: n, cpf: documento.trim() });
      onClose();
    } finally { setSalvando(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cliente da venda" description="Selecione um cliente da base ou cadastre um novo." maxWidth="max-w-lg"
      footer={modo === "novo" ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setModo("buscar")}>Voltar</Button>
          <Button onClick={salvarNovo} loading={salvando}>Cadastrar e usar</Button>
        </div>
      ) : undefined}
    >
      {modo === "buscar" ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ, telefone ou e-mail" className={`${inputCls} pl-9`} />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
            {resultados.map((c: any) => (
              <button key={c.id} type="button" onClick={() => escolher(c)}
                className="w-full text-left px-3 py-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:border-blue-500/40 transition-colors">
                <span className="block text-xs font-bold text-[var(--color-text-primary)] truncate">{c.name}</span>
                <span className="block text-[11px] text-[var(--color-text-muted)] truncate">{[c.documento, c.phone].filter(Boolean).join(" · ") || "Sem documento ou telefone"}</span>
              </button>
            ))}
            {resultados.length === 0 && (
              <p className="py-6 text-center text-xs text-[var(--color-text-muted)]">Nenhum cliente encontrado.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1 border-t border-[var(--color-border-subtle)]">
            <Button variant="outline" className="gap-1.5" onClick={() => { setNome(busca.trim() && !/^[\d.\-/\s()]+$/.test(busca) ? busca.trim() : ""); setModo("novo"); }}>
              <UserPlus className="w-3.5 h-3.5" /> Cadastrar novo cliente
            </Button>
            {(nomeAtual || cpfAtual) && (
              <Button variant="outline" className="gap-1.5 text-[var(--color-text-muted)]" onClick={() => { onSelect({ nome: "", cpf: "" }); onClose(); }}>
                <UserX className="w-3.5 h-3.5" /> Voltar para consumidor final
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Nome</label>
            <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">CPF / CNPJ (opcional)</label>
              <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="000.000.000-00" className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Telefone (opcional)</label>
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(63) 90000-0000" className={inputCls} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
