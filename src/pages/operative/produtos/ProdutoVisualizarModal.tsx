import { useEffect, useState } from "react";
import { formatBRL } from "../../../lib/dinheiro";
import { margemPct } from "../../../lib/tabelaPrecos";
import { createPortal } from "react-dom";
import { X, Package, DollarSign, Layers, Info, Pencil } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/apiClient";

const brl = (n: any) => formatBRL(n);
const num = (n: any) => (Number(n) || 0).toLocaleString("pt-BR");
const ORIGEM: Record<string, string> = { "maxdata:estoque": "Casa São Paulo (principal)", "maxdata:notas": "SR (filial)" };

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
export function ProdutoVisualizarModal({ produto, onClose, podeEditar, tenantId, onSalvo }: { produto: any | null; onClose: () => void; podeEditar?: boolean; tenantId?: string | null; onSalvo?: () => void }) {
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [f, setF] = useState({ descricao: "", valorVenda: "", valorCusto: "", ativo: true });
  useEffect(() => {
    setEditando(false);
    if (produto) setF({ descricao: produto.name || "", valorVenda: String(produto.price ?? ""), valorCusto: String(produto.cost ?? ""), ativo: !!produto.active });
  }, [produto?.id]);
  // Confere o saldo AO VIVO na Max Data ao abrir (o sincronismo pode estar atrasado) e mostra os campos de estoque que ela devolve.
  const [vivo, setVivo] = useState<{ saldo: number; minimo: number; campos: Record<string, any> } | "erro" | "carregando" | null>(null);
  useEffect(() => {
    setVivo(null);
    if (!produto || !tenantId || !String(produto.externo_sistema || "").startsWith("maxdata")) return;
    let off = false;
    setVivo("carregando");
    const which = String(produto.externo_sistema).endsWith("notas") ? "notas" : "estoque";
    apiFetch(`/api/integrations/maxdata/produtos/${encodeURIComponent(String(produto.externo_id))}/saldo?which=${which}&tenantId=${encodeURIComponent(tenantId)}`)
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (off) return; if (!r.ok) { setVivo("erro"); return; } setVivo(j); if (Number(j.saldo) !== Number(produto.currentStock)) onSalvo?.(); })
      .catch(() => { if (!off) setVivo("erro"); });
    return () => { off = true; };
  }, [produto?.id, tenantId]);
  const num2 = (v: string) => Number(String(v).replace(/\./g, "").replace(",", ".")) ;
  const salvar = async () => {
    if (!produto || !tenantId) return;
    const venda = String(f.valorVenda).includes(",") ? num2(f.valorVenda) : Number(f.valorVenda);
    const custo = String(f.valorCusto).includes(",") ? num2(f.valorCusto) : Number(f.valorCusto);
    if (!f.descricao.trim()) return toast.error("A descrição é obrigatória.");
    if (!Number.isFinite(venda) || venda < 0 || !Number.isFinite(custo) || custo < 0) return toast.error("Preço e custo precisam ser números válidos.");
    setSalvando(true);
    try {
      const r = await apiFetch(`/api/integrations/maxdata/produtos/${encodeURIComponent(produto.externo_id)}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ which: String(produto.externo_sistema || "").endsWith("notas") ? "notas" : "estoque", produto: { descricao: f.descricao, valorVenda: venda, valorCusto: custo, desativado: !f.ativo } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.error || "A Max Data não aceitou a gravação."); return; }
      toast.success("Produto atualizado na Max Data.");
      onSalvo?.(); onClose();
    } catch { toast.error("Não foi possível falar com o servidor."); }
    finally { setSalvando(false); }
  };
  useEffect(() => {
    if (!produto) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [produto, onClose]);
  if (!produto) return null;

  const p = produto, d = p.externo_dados || {};
  const ao = typeof vivo === "object" && vivo ? vivo : null;
  const saldo = ao ? ao.saldo : Number(p.currentStock) || 0, min = ao ? ao.minimo : Number(p.stockMin) || 0;
  const situacao = saldo <= 0 ? { t: "Sem saldo", c: "text-danger" } : saldo <= min ? { t: "Abaixo do mínimo", c: "text-warning" } : { t: "Em estoque", c: "text-success" };
  const margem = p.price > 0 ? margemPct(p.price, p.cost) : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex items-start justify-between gap-3 p-5 bg-[var(--color-surface)] border-b border-[var(--color-border-subtle)]">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--color-text-primary)] break-words">{p.name}</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">SKU {p.sku || "—"} · {p.active ? <span className="text-success font-semibold">Ativo</span> : <span className="text-danger font-semibold">Inativo</span>}</p>
          </div>
          {podeEditar && !editando && <button onClick={() => setEditando(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--color-border-default)] text-xs font-semibold text-[var(--color-text-primary)] hover:bg-white/5 shrink-0"><Pencil className="w-3.5 h-3.5" />Editar</button>}
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--color-text-muted)]"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-5 space-y-6">
          {editando && (
            <section className="space-y-3 rounded-xl border border-[var(--color-primary-blue)]/40 p-4">
              <h3 className="text-xs font-bold text-[var(--color-text-primary)]">Editar na Max Data</h3>
              <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Descrição
                <input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} className="mt-1 w-full h-9 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-transparent px-3 text-sm normal-case tracking-normal font-normal text-[var(--color-text-primary)]" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Preço de venda (R$)
                  <input inputMode="decimal" value={f.valorVenda} onChange={(e) => setF({ ...f, valorVenda: e.target.value })} className="mt-1 w-full h-9 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-transparent px-3 text-sm normal-case tracking-normal font-normal text-[var(--color-text-primary)]" />
                </label>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Custo (R$)
                  <input inputMode="decimal" value={f.valorCusto} onChange={(e) => setF({ ...f, valorCusto: e.target.value })} className="mt-1 w-full h-9 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-transparent px-3 text-sm normal-case tracking-normal font-normal text-[var(--color-text-primary)]" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-primary)]"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Produto ativo</label>
              <p className="text-[11px] text-[var(--color-text-faint)]">O saldo de estoque não é alterado aqui. Para acertar saldo, use um ajuste de estoque.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditando(false)} disabled={salvando} className="h-9 px-4 rounded-lg border border-[var(--color-border-default)] text-xs font-semibold">Cancelar</button>
                <button onClick={salvar} disabled={salvando} className="h-9 px-4 rounded-lg bg-[var(--color-primary-blue)] text-white text-xs font-bold disabled:opacity-60">{salvando ? "Gravando…" : "Gravar na Max Data"}</button>
              </div>
            </section>
          )}
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
            <Campo label="Conferência na Max Data">{vivo === "carregando" ? "Consultando…" : vivo === "erro" ? "Não foi possível consultar agora" : ao ? `Saldo ao vivo: ${num(ao.saldo)} (campos: ${Object.entries(ao.campos).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhum"})` : ""}</Campo>
            <Campo label="Valor em estoque (custo)">{brl(Math.max(saldo, 0) * (Number(p.cost) || 0))}</Campo>
            <Campo label="Valor em estoque (venda)">{brl(Math.max(saldo, 0) * (Number(p.price) || 0))}</Campo>
            <Campo label="Estoque mínimo">{num(min)}</Campo>
            <Campo label="Estoque máximo">{Number(p.stockMax) ? num(p.stockMax) : ""}</Campo>
          </Secao>
          <Secao icon={Info} titulo="Origem">
            <Campo label="Sistema">{ORIGEM[p.externo_sistema] || p.externo_sistema}</Campo>
            <Campo label="Código na Max Data">{p.externo_id}</Campo>
            <Campo label="Atualizado em">{p.updated_at ? new Date(p.updated_at).toLocaleString("pt-BR") : ""}</Campo>
          </Secao>
          {p.description && <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{p.description}</p>}
          <p className="text-[11px] text-[var(--color-text-faint)]">{podeEditar ? "Alterações são gravadas na Max Data e depois refletidas aqui." : "Produto importado da Max Data: somente consulta. Para ligar a edição, ative \"Gravar na Max Data\" nas integrações (administrador)."}</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
