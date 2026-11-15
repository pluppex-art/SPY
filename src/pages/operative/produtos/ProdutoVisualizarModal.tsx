import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Package, DollarSign, Layers, Info } from "lucide-react";

const brl = (n: any) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: any) => (Number(n) || 0).toLocaleString("pt-BR");
const ORIGEM: Record<string, string> = { "maxdata:estoque": "Max Data · Estoque", "maxdata:notas": "Max Data · Notas fiscais" };

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-0.5">{label}</div>
      <div className="text-sm text-[var(--color-text-primary)] break-words">{children === "" || children == null ? "—" : children}</div>
    </div>
  );
}

function Secao({ icon: Icon, titulo, children }: { icon: any; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)]"><Icon className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />{titulo}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">{children}</div>
    </section>
  );
}

/** Visualização somente leitura de um produto da Max Data (as linhas vêm de maxdata_produtos, já com o saldo mapeado). */
export function ProdutoVisualizarModal({ produto, onClose }: { produto: any | null; onClose: () => void }) {
  useEffect(() => {
    if (!produto) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [produto, onClose]);
  if (!produto) return null;

  const p = produto, d = p.externo_dados || {};
  const saldo = Number(p.currentStock) || 0, min = Number(p.stockMin) || 0;
  const situacao = saldo <= 0 ? { t: "Sem saldo", c: "text-danger" } : saldo <= min ? { t: "Abaixo do mínimo", c: "text-warning" } : { t: "Em estoque", c: "text-success" };
  const margem = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex items-start justify-between gap-3 p-5 bg-[var(--color-surface)] border-b border-[var(--color-border-subtle)]">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--color-text-primary)] break-words">{p.name}</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">SKU {p.sku || "—"} · {p.active ? <span className="text-success font-semibold">Ativo</span> : <span className="text-danger font-semibold">Inativo</span>}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--color-text-muted)]"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-5 space-y-6">
          <Secao icon={Package} titulo="Cadastro">
            <Campo label="Categoria">{p.category}</Campo>
            <Campo label="Fabricante">{p.provider}</Campo>
            <Campo label="Tipo">{p.type}</Campo>
            <Campo label="Unidade">{d.un}</Campo>
            <Campo label="Sub-grupo">{d.subGrupo}</Campo>
            <Campo label="Localização">{d.localizador}</Campo>
            <Campo label="Peso">{p.weight ? `${num(p.weight)} kg` : ""}</Campo>
            <Campo label="Dimensões">{p.dimensions}</Campo>
            <Campo label="Fracionado">{d.fracionado ? "Sim" : "Não"}</Campo>
          </Secao>
          <Secao icon={DollarSign} titulo="Preços">
            <Campo label="Preço de venda">{brl(p.price)}</Campo>
            <Campo label="Custo">{brl(p.cost)}</Campo>
            <Campo label="Margem">{margem === null ? "—" : `${margem.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</Campo>
            <Campo label="Atacado">{d.valorAtacado ? brl(d.valorAtacado) : ""}</Campo>
          </Secao>
          <Secao icon={Layers} titulo="Estoque">
            <Campo label="Saldo atual"><span className="font-bold tabular-nums">{num(saldo)}</span> <span className={`text-xs font-semibold ${situacao.c}`}>· {situacao.t}</span></Campo>
            <Campo label="Estoque mínimo">{num(min)}</Campo>
            <Campo label="Estoque máximo">{Number(p.stockMax) ? num(p.stockMax) : ""}</Campo>
          </Secao>
          <Secao icon={Info} titulo="Origem">
            <Campo label="Sistema">{ORIGEM[p.externo_sistema] || p.externo_sistema}</Campo>
            <Campo label="Código na Max Data">{p.externo_id}</Campo>
            <Campo label="Atualizado em">{p.updated_at ? new Date(p.updated_at).toLocaleString("pt-BR") : ""}</Campo>
          </Secao>
          {p.description && <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{p.description}</p>}
          <p className="text-[11px] text-[var(--color-text-faint)]">Produto importado da Max Data: somente consulta. Para alterar, edite no sistema de origem.</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
