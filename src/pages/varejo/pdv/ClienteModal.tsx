import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, UserX } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Base de clientes do tenant (tabela `clientes`). */
  clientes: any[];
  /** Leads do CRM visíveis ao usuário; só entram na lista os que têm telefone. */
  leads?: any[];
  /** Cliente escolhido a partir de um lead (o chamador cria/vincula o cadastro de cliente). */
  onSelectLead?: (lead: any) => void | Promise<void>;
  nomeAtual: string;
  cpfAtual: string;
  onSelect: (c: { nome: string; cpf: string; id?: string }) => void;
  /** Abre o cadastro completo de cliente (o mesmo modal do CRM). */
  onNovoCliente: () => void;
}

const apenasDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const inputCls = "w-full px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500";

/** Seleciona um cliente da base; o cadastro de cliente novo usa o mesmo formulário completo do CRM. */
export function ClienteModal({ isOpen, onClose, clientes, leads = [], onSelectLead, nomeAtual, cpfAtual, onSelect, onNovoCliente }: Props) {
  const [busca, setBusca] = useState("");
  useEffect(() => { if (isOpen) setBusca(""); }, [isOpen]);

  const documentoDoLead = (l: any) => String(l.cnpj || l.customFields?.cpf || l.customFields?.documento || "");

  // Lista única: clientes da base + leads com telefone que ainda não são clientes (mesmo telefone ou vínculo).
  const itens = useMemo(() => {
    const base = (clientes || []).filter((c: any) => c?.name).map((c: any) => ({ tipo: "cliente" as const, raw: c, id: String(c.id), nome: String(c.name), documento: String(c.documento || ""), phone: String(c.phone || ""), extra: String(c.email || "") }));
    const telefonesBase = new Set(base.map((b) => apenasDigitos(b.phone)).filter((t) => t.length >= 8));
    const idsBase = new Set(base.map((b) => b.id));
    const doLead = (leads || [])
      .filter((l: any) => l?.name && apenasDigitos(l.phone).length >= 8)
      .filter((l: any) => !(l.clientId && idsBase.has(String(l.clientId))) && !telefonesBase.has(apenasDigitos(l.phone)))
      .map((l: any) => ({ tipo: "lead" as const, raw: l, id: String(l.id), nome: String(l.name), documento: documentoDoLead(l), phone: String(l.phone || ""), extra: String(l.company || "") }));
    return [...base, ...doLead];
  }, [clientes, leads]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = apenasDigitos(busca);
    if (!q) return itens;
    return itens.filter((i) =>
      i.nome.toLowerCase().includes(q) ||
      i.extra.toLowerCase().includes(q) ||
      (qd.length >= 2 && (apenasDigitos(i.documento).includes(qd) || apenasDigitos(i.phone).includes(qd))));
  }, [itens, busca]);
  const LIMITE = 100;
  const resultados = filtrados.slice(0, LIMITE);

  const escolher = (i: (typeof itens)[number]) => {
    if (i.tipo === "lead") { void onSelectLead?.(i.raw); onClose(); return; }
    onSelect({ nome: i.nome, cpf: i.documento, id: i.id });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cliente da venda" description="Clientes e leads com telefone. Busque por nome, telefone, CPF ou CNPJ." maxWidth="max-w-lg">
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, telefone, CPF ou CNPJ" className={`${inputCls} pl-9`} />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
          {resultados.map((i) => (
            <button key={`${i.tipo}-${i.id}`} type="button" onClick={() => escolher(i)}
              className="w-full text-left px-3 py-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:border-blue-500/40 transition-colors">
              <span className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">{i.nome}</span>
                <span className={`shrink-0 text-[9px] font-bold px-1.5 rounded-full border ${i.tipo === "lead" ? "bg-amber-500/10 text-amber-600 border-amber-500/30" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"}`}>{i.tipo === "lead" ? "Lead" : "Cliente"}</span>
              </span>
              <span className="block text-[11px] text-[var(--color-text-muted)] truncate">{[i.documento, i.phone, i.tipo === "lead" ? i.extra : ""].filter(Boolean).join(" · ") || "Sem documento ou telefone"}</span>
            </button>
          ))}
          {resultados.length === 0 && (
            <p className="py-6 text-center text-xs text-[var(--color-text-muted)]">Nenhum cliente ou lead encontrado.</p>
          )}
          {filtrados.length > LIMITE && (
            <p className="py-2 text-center text-[11px] text-[var(--color-text-muted)]">Mostrando {LIMITE} de {filtrados.length}. Refine a busca para ver os demais.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-1 border-t border-[var(--color-border-subtle)]">
          <Button variant="outline" className="gap-1.5" onClick={onNovoCliente}>
            <UserPlus className="w-3.5 h-3.5" /> Cadastrar novo cliente
          </Button>
          {(nomeAtual || cpfAtual) && (
            <Button variant="outline" className="gap-1.5 text-[var(--color-text-muted)]" onClick={() => { onSelect({ nome: "", cpf: "" }); onClose(); }}>
              <UserX className="w-3.5 h-3.5" /> Voltar para consumidor final
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
