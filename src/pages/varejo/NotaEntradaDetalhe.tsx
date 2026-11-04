import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Boxes, Braces, Download, Link2, Loader2, PackagePlus, Save, Send, Trash2, XCircle, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { EmptyState } from "../../components/ui/empty-state";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import { formatCnpj } from "../../lib/nfe";
import {
  NOTA_STATUS_MANUAL, NOTA_STATUS_TONE, defaultQtdEstoque, isNotaLocked, normText, stockBlockers, type NotaStatus,
} from "../../lib/notaEntrada";
import { cn } from "../../lib/utils";

const inputCls =
  "w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] disabled:opacity-60";

const num = (v: any) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(n) ? 0 : n; };

/** Seletor de produto com busca — o catálogo do varejo pode ter milhares de itens, então nada de <select> gigante. */
function ProductPicker({ products, value, onChange, disabled }: { products: any[]; value: string | null; onChange: (id: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = products.find((p) => p.id === value);
  const results = useMemo(() => {
    const t = normText(q);
    const list = products.filter((p) => p.active !== false);
    return (t ? list.filter((p) => normText(p.name || "").includes(t) || normText(p.sku || "").includes(t)) : list).slice(0, 30);
  }, [products, q]);

  return (
    <div className="relative">
      <button
        type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className={cn("w-full text-left px-3 py-2 rounded-[var(--radius-control)] border text-xs truncate cursor-pointer disabled:cursor-default",
          current ? "bg-emerald-500/5 border-emerald-500/30 text-[var(--color-text-primary)]" : "bg-amber-500/5 border-amber-500/30 text-amber-600 dark:text-amber-400")}
      >
        {current ? `${current.name}${current.sku ? ` · ${current.sku}` : ""}` : "Ligar a um produto…"}
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-80 max-w-[80vw] bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] shadow-lg p-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou SKU…" className={inputCls} />
          <div className="max-h-56 overflow-y-auto mt-2 divide-y divide-[var(--color-border-subtle)]">
            {results.length === 0 && <p className="text-[11px] text-[var(--color-text-faint)] p-2">Nenhum produto encontrado.</p>}
            {results.map((p) => (
              <button key={p.id} type="button" onClick={() => { onChange(p.id); setOpen(false); setQ(""); }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--color-surface-sunken)] cursor-pointer">
                <span className="text-[var(--color-text-primary)]">{p.name}</span>{p.sku && <span className="text-[var(--color-text-faint)]"> · {p.sku}</span>}
              </button>
            ))}
          </div>
          {value && <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="mt-2 text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-danger)] cursor-pointer">Desligar produto</button>}
        </div>
      )}
    </div>
  );
}

export default function NotaEntradaDetalhe() {
  const { id } = useParams();
  const { activeTenantId } = useAuth();
  const { products, setProducts, addProduct } = useData();
  const { formatCurrency } = useLocalization();

  const [nota, setNota] = useState<any | null | undefined>(undefined);
  const [itens, setItens] = useState<any[]>([]);
  const [head, setHead] = useState<Record<string, any>>({});
  const [salvando, setSalvando] = useState(false);
  const [lancando, setLancando] = useState(false);
  const [atualizarCusto, setAtualizarCusto] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [novoProdItem, setNovoProdItem] = useState<any | null>(null);
  const [novoProd, setNovoProd] = useState({ name: "", sku: "", custo: "", preco: "" });
  const [novoItem, setNovoItem] = useState({ descricao: "", codigo: "", quantidade: "1", valor_unitario: "" });

  const carregar = useCallback(async () => {
    if (!supabase || !id) return;
    const [{ data: n }, { data: its }] = await Promise.all([
      supabase.from("notas_entrada").select("*").eq("id", id).maybeSingle(),
      supabase.from("nota_entrada_itens").select("*").eq("nota_id", id).order("numero_item"),
    ]);
    setNota(n || null);
    setItens(its || []);
    if (n) setHead({ ...n });
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const locked = nota ? isNotaLocked(nota.status) : true;
  const blockers = useMemo(() => stockBlockers(itens), [itens]);
  const somaItens = useMemo(() => itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0), [itens]);
  const unidades = useMemo(() => itens.reduce((s, i) => s + (Number(i.qtd_estoque) || 0), 0), [itens]);

  if (nota === undefined) {
    return <div className="p-10 text-xs text-[var(--color-text-faint)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</div>;
  }
  if (nota === null) {
    return (
      <PageContainer title="Nota de Entrada" breadcrumb={[{ label: "Varejo" }, { label: "Notas de Entrada", path: "/app/varejo/notas-entrada" }, { label: "Detalhe" }]}>
        <EmptyState icon={Boxes} title="Nota não encontrada" action={<Link to="/app/varejo/notas-entrada"><Button variant="outline" className="h-9 px-4 text-xs gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</Button></Link>} />
      </PageContainer>
    );
  }

  const status = nota.status as NotaStatus;
  const setH = (k: string, v: any) => setHead((p) => ({ ...p, [k]: v }));

  const salvarCabecalho = async () => {
    if (!supabase) return;
    const chave = String(head.chave_acesso || "").replace(/\D/g, "");
    if (chave && chave.length !== 44) { toast.error("A chave de acesso precisa ter 44 dígitos."); return; }
    setSalvando(true);
    const patch = {
      numero: head.numero || null, serie: head.serie || null, chave_acesso: chave || null,
      data_emissao: head.data_emissao || null, natureza_operacao: head.natureza_operacao || null,
      fornecedor_nome: head.fornecedor_nome || null, fornecedor_cnpj: String(head.fornecedor_cnpj || "").replace(/\D/g, "") || null,
      valor_produtos: num(head.valor_produtos), valor_frete: num(head.valor_frete), valor_desconto: num(head.valor_desconto),
      valor_outras: num(head.valor_outras), valor_total: num(head.valor_total), observacoes: head.observacoes || null,
    };
    const { error } = await supabase.from("notas_entrada").update(patch).eq("id", nota.id);
    setSalvando(false);
    if (error) { toast.error(error.code === "23505" ? "Já existe outra nota ativa com essa chave de acesso." : "Não foi possível salvar."); return; }
    toast.success("Dados da nota salvos.");
    carregar();
  };

  const mudarStatus = async (novo: NotaStatus) => {
    if (!supabase || novo === status) return;
    if ((novo === "Pronta para envio" || novo === "Enviada" || novo === "Validada") && blockers.length > 0) {
      toast.error(`Antes de avançar: ${blockers[0]}${blockers.length > 1 ? ` (+${blockers.length - 1} pendência(s))` : ""}`);
      return;
    }
    const patch: Record<string, any> = { status: novo };
    if (novo === "Enviada") patch.enviada_em = new Date().toISOString();
    if (novo === "Validada") patch.validada_em = new Date().toISOString();
    const { error } = await supabase.from("notas_entrada").update(patch).eq("id", nota.id);
    if (error) { toast.error("Não foi possível mudar o status."); return; }
    carregar();
  };

  const cancelar = async () => {
    if (!supabase) return;
    if (!(await confirmDialog({ title: "Cancelar nota", description: "A nota deixa de contar e a chave de acesso fica livre pra ser cadastrada de novo. O estoque não é alterado." }))) return;
    const { error } = await supabase.from("notas_entrada").update({ status: "Cancelada" }).eq("id", nota.id);
    if (error) { toast.error("Não foi possível cancelar."); return; }
    carregar();
  };

  const atualizarItem = async (item: any, patch: Record<string, any>) => {
    if (!supabase) return;
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from("nota_entrada_itens").update(patch).eq("id", item.id);
    if (error) { toast.error("Não foi possível salvar o item."); carregar(); }
  };

  const adicionarItem = async () => {
    if (!supabase || !activeTenantId) return;
    const q = num(novoItem.quantidade), vu = num(novoItem.valor_unitario);
    if (!novoItem.descricao.trim() || q <= 0) { toast.error("Informe a descrição e uma quantidade maior que zero."); return; }
    const { error } = await supabase.from("nota_entrada_itens").insert({
      tenant_id: activeTenantId, nota_id: nota.id, numero_item: (Math.max(0, ...itens.map((i) => i.numero_item)) || 0) + 1,
      codigo: novoItem.codigo.trim() || null, descricao: novoItem.descricao.trim(), quantidade: q,
      valor_unitario: vu, valor_total: Math.round(q * vu * 100) / 100, qtd_estoque: defaultQtdEstoque(q),
    });
    if (error) { toast.error("Não foi possível adicionar o item."); return; }
    setNovoItem({ descricao: "", codigo: "", quantidade: "1", valor_unitario: "" });
    carregar();
  };

  const removerItem = async (item: any) => {
    if (!supabase) return;
    const { error } = await supabase.from("nota_entrada_itens").delete().eq("id", item.id);
    if (error) { toast.error("Não foi possível remover o item."); return; }
    carregar();
  };

  const abrirNovoProduto = (item: any) => {
    const qtd = Number(item.qtd_estoque) || Number(item.quantidade) || 1;
    setNovoProdItem(item);
    setNovoProd({ name: item.descricao || "", sku: item.codigo || "", custo: String(Math.round(((Number(item.valor_total) || 0) / qtd) * 100) / 100), preco: "" });
  };

  const criarProduto = async () => {
    if (!novoProdItem) return;
    const preco = num(novoProd.preco), custo = num(novoProd.custo);
    if (!novoProd.name.trim() || preco <= 0) { toast.error("Informe o nome e o preço de venda (maior que zero)."); return; }
    const productId = crypto.randomUUID();
    await addProduct({
      id: productId, name: novoProd.name.trim(), sku: novoProd.sku.trim(), category: "Geral", type: "Físico",
      price: preco, cost: custo, margin: preco > 0 ? Math.round(((preco - custo) / preco) * 1000) / 10 : 0, commission: 5, active: true,
      currentStock: 0, stockMin: 5, stockMax: 25, provider: nota.fornecedor_nome || "", tags: ["varejo"],
      typeAttributes: { barcode: novoProdItem.ean || "", ean: novoProdItem.ean || "" },
    });
    await atualizarItem(novoProdItem, { product_id: productId });
    setNovoProdItem(null);
    toast.success("Produto criado e ligado ao item.");
  };

  const lancarEstoque = async () => {
    if (!supabase) return;
    if (blockers.length > 0) { toast.error(blockers[0]); return; }
    if (!(await confirmDialog({
      title: "Dar entrada no estoque",
      description: `Entrada de ${unidades} unidade(s) em ${itens.length} item(ns) da NF ${nota.numero || "s/n"}. Depois disso a nota fica travada.`,
    }))) return;
    setLancando(true);
    try {
      const { error } = await supabase.rpc("lancar_nota_entrada_estoque", { p_nota_id: nota.id, p_atualizar_custo: atualizarCusto });
      if (error) { toast.error(error.message || "Não foi possível dar entrada no estoque."); return; }
      // Reflete no catálogo em memória (o Estoque/PDV leem daqui) sem esperar recarregar.
      const porProduto = new Map<string, { qtd: number; custo: number }>();
      for (const i of itens) {
        const cur = porProduto.get(i.product_id) || { qtd: 0, custo: 0 };
        cur.qtd += Number(i.qtd_estoque) || 0;
        cur.custo = Number(i.qtd_estoque) > 0 ? Math.round(((Number(i.valor_total) || 0) / Number(i.qtd_estoque)) * 100) / 100 : cur.custo;
        porProduto.set(i.product_id, cur);
      }
      setProducts(products.map((p: any) => {
        const add = porProduto.get(p.id);
        return add ? { ...p, currentStock: (p.currentStock ?? 0) + add.qtd, ...(atualizarCusto && add.custo > 0 ? { cost: add.custo } : {}) } : p;
      }));
      toast.success(`Entrada confirmada: +${unidades} unidade(s) no estoque.`);
      carregar();
    } finally {
      setLancando(false);
    }
  };

  const baixarXml = () => {
    const blob = new Blob([nota.xml_original || ""], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `nfe-${nota.chave_acesso || nota.numero || nota.id}.xml`; a.click();
    URL.revokeObjectURL(url);
  };

  // Formato canônico da nota — é o que a integração vai mapear pra API externa.
  const payload = { nota: { numero: nota.numero, serie: nota.serie, chave_acesso: nota.chave_acesso, data_emissao: nota.data_emissao, natureza_operacao: nota.natureza_operacao, fornecedor: { nome: nota.fornecedor_nome, cnpj: nota.fornecedor_cnpj }, totais: { produtos: nota.valor_produtos, frete: nota.valor_frete, desconto: nota.valor_desconto, outras: nota.valor_outras, total: nota.valor_total } },
    itens: itens.map((i) => ({ item: i.numero_item, codigo: i.codigo, ean: i.ean, descricao: i.descricao, ncm: i.ncm, cfop: i.cfop, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario, valor_total: i.valor_total, produto_id: i.product_id, quantidade_estoque: i.qtd_estoque })) };

  const field = (k: string, label: string, opts: { type?: string; wide?: boolean } = {}) => (
    <div className={opts.wide ? "md:col-span-2" : ""}>
      <label className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1 block">{label}</label>
      <input type={opts.type || "text"} value={head[k] ?? ""} disabled={locked} onChange={(e) => setH(k, e.target.value)} className={inputCls} />
    </div>
  );

  return (
    <PageContainer
      title={`NF ${nota.numero || "s/n"}${nota.serie ? `/${nota.serie}` : ""} — ${nota.fornecedor_nome || "Fornecedor"}`}
      description="Confira os dados, ligue cada item a um produto e dê entrada no estoque."
      breadcrumb={[{ label: "Varejo" }, { label: "Notas de Entrada", path: "/app/varejo/notas-entrada" }, { label: `NF ${nota.numero || "s/n"}` }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          {!locked ? (
            <select value={status} onChange={(e) => mudarStatus(e.target.value as NotaStatus)} className={cn("h-9 px-3 rounded-[var(--radius-control)] text-xs font-bold border cursor-pointer bg-transparent", NOTA_STATUS_TONE[status])}>
              {NOTA_STATUS_MANUAL.map((s) => <option key={s} value={s} className="text-[var(--color-text-primary)] bg-[var(--color-surface-elevated)]">{s}</option>)}
            </select>
          ) : (
            <span className={cn("inline-flex px-3 py-2 rounded-lg text-xs font-bold border", NOTA_STATUS_TONE[status])}>{status}</span>
          )}
          <Button variant="outline" onClick={() => setJsonOpen(true)} className="h-9 px-3 text-xs font-medium gap-1.5"><Braces className="w-3.5 h-3.5" /> Dados da nota</Button>
          {nota.xml_original && <Button variant="outline" onClick={baixarXml} className="h-9 px-3 text-xs font-medium gap-1.5"><Download className="w-3.5 h-3.5" /> XML</Button>}
        </div>
      }
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        {nota.erro_mensagem && (
          <div className="flex items-start gap-2 rounded-[var(--radius-control)] bg-rose-500/10 border border-rose-500/25 px-4 py-3 text-xs text-rose-500"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {nota.erro_mensagem}</div>
        )}

        <Card className="p-6">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Dados da nota</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {field("numero", "Número")}{field("serie", "Série")}{field("data_emissao", "Emissão", { type: "date" })}{field("natureza_operacao", "Natureza da operação")}
            {field("fornecedor_nome", "Fornecedor", { wide: true })}
            <div>
              <label className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1 block">CNPJ do fornecedor</label>
              <input value={locked ? formatCnpj(head.fornecedor_cnpj || "") : head.fornecedor_cnpj ?? ""} disabled={locked} onChange={(e) => setH("fornecedor_cnpj", e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-4">
              <label className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1 block">Chave de acesso (44 dígitos)</label>
              <input value={head.chave_acesso ?? ""} disabled={locked} onChange={(e) => setH("chave_acesso", e.target.value)} className={cn(inputCls, "font-mono")} />
            </div>
            {field("valor_produtos", "Valor dos produtos", { type: "number" })}{field("valor_frete", "Frete", { type: "number" })}{field("valor_desconto", "Desconto", { type: "number" })}{field("valor_total", "Total da nota", { type: "number" })}
            <div className="md:col-span-4">
              <label className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1 block">Observações</label>
              <textarea rows={2} value={head.observacoes ?? ""} disabled={locked} onChange={(e) => setH("observacoes", e.target.value)} className={cn(inputCls, "resize-y")} />
            </div>
          </div>
          {!locked && (
            <div className="flex justify-end mt-4">
              <Button onClick={salvarCabecalho} disabled={salvando} className="h-9 px-4 text-xs font-medium gap-1.5">{salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar dados</Button>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Itens ({itens.length})</h3>
            <span className="text-[11px] text-[var(--color-text-faint)]">
              Soma dos itens {formatCurrency(somaItens)}{Math.abs(somaItens - num(nota.valor_produtos)) > 0.05 && <span className="text-amber-500"> · difere do total de produtos ({formatCurrency(num(nota.valor_produtos))})</span>}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-4 py-3">#</th><th className="px-4 py-3">Item da nota</th><th className="px-4 py-3 text-right">Qtd nota</th>
                  <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 w-72">Produto do estoque</th><th className="px-4 py-3 w-28">Entra no estoque</th><th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {itens.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3 text-[var(--color-text-faint)] font-mono">{i.numero_item}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--color-text-primary)]">{i.descricao}</p>
                      <p className="text-[10px] text-[var(--color-text-faint)] font-mono">{[i.codigo && `cód ${i.codigo}`, i.ean && `EAN ${i.ean}`, i.ncm && `NCM ${i.ncm}`].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-muted)]">{Number(i.quantidade)} {i.unidade || ""}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-[var(--color-text-primary)]">{formatCurrency(Number(i.valor_total) || 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 min-w-0"><ProductPicker products={products as any[]} value={i.product_id} disabled={locked} onChange={(pid) => atualizarItem(i, { product_id: pid })} /></div>
                        {!locked && !i.product_id && (
                          <button type="button" title="Criar produto novo a partir deste item" onClick={() => abrirNovoProduto(i)} className="p-2 rounded-[var(--radius-control)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] cursor-pointer"><PackagePlus className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" min={1} step={1} disabled={locked} value={i.qtd_estoque ?? ""} onChange={(e) => atualizarItem(i, { qtd_estoque: e.target.value === "" ? null : Number(e.target.value) })} className={cn(inputCls, "text-right tabular-nums")} title="Unidades que entram no estoque (ex.: 2 caixas com 12 = 24)" />
                    </td>
                    <td className="px-2 py-3">{!locked && nota.origem === "manual" && <button type="button" onClick={() => removerItem(i)} className="p-1.5 text-[var(--color-text-faint)] hover:text-[var(--color-danger)] cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                  </tr>
                ))}
                {itens.length === 0 && <tr><td colSpan={7} className="px-6 py-10 text-center text-[var(--color-text-faint)]">Nenhum item ainda.</td></tr>}
              </tbody>
            </table>
          </div>
          {!locked && nota.origem === "manual" && (
            <div className="p-4 border-t border-[var(--color-border-subtle)] grid grid-cols-2 md:grid-cols-[1fr_140px_100px_130px_auto] gap-2 items-end">
              <input placeholder="Descrição do item" value={novoItem.descricao} onChange={(e) => setNovoItem((p) => ({ ...p, descricao: e.target.value }))} className={cn(inputCls, "col-span-2 md:col-span-1")} />
              <input placeholder="Código" value={novoItem.codigo} onChange={(e) => setNovoItem((p) => ({ ...p, codigo: e.target.value }))} className={inputCls} />
              <input type="number" placeholder="Qtd" value={novoItem.quantidade} onChange={(e) => setNovoItem((p) => ({ ...p, quantidade: e.target.value }))} className={inputCls} />
              <input type="number" placeholder="Valor unit." value={novoItem.valor_unitario} onChange={(e) => setNovoItem((p) => ({ ...p, valor_unitario: e.target.value }))} className={inputCls} />
              <Button onClick={adicionarItem} className="h-9 px-3 text-xs">Adicionar</Button>
            </div>
          )}
        </Card>

        {!locked && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Fluxo da nota</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-4">Rascunho → Pronta para envio → Enviada → Validada → No estoque. O envio e a validação pela API externa ainda não estão ligados: por enquanto marque o status à mão no topo da página.</p>
            {blockers.length > 0 ? (
              <ul className="space-y-1 mb-4">{blockers.slice(0, 6).map((b) => <li key={b} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5"><Link2 className="w-3 h-3 mt-0.5 shrink-0" /> {b}</li>)}{blockers.length > 6 && <li className="text-[11px] text-[var(--color-text-faint)]">+{blockers.length - 6} pendência(s)…</li>}</ul>
            ) : (
              <p className="text-xs text-emerald-500 mb-4">Todos os itens estão ligados: {unidades} unidade(s) prontas para entrar no estoque.</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer"><input type="checkbox" checked={atualizarCusto} onChange={(e) => setAtualizarCusto(e.target.checked)} /> Atualizar o custo dos produtos com o valor desta nota</label>
              <div className="flex-1" />
              <Button variant="outline" disabled title="A conexão com a API externa ainda não foi mapeada (Configurações › Integrações › Max Data)." className="h-9 px-4 text-xs gap-1.5"><Send className="w-3.5 h-3.5" /> Enviar para validação</Button>
              <Button onClick={lancarEstoque} disabled={lancando || blockers.length > 0} className="h-9 px-4 text-xs font-medium gap-1.5">{lancando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Boxes className="w-3.5 h-3.5" />} Dar entrada no estoque</Button>
            </div>
            {status !== "No estoque" && <button type="button" onClick={cancelar} className="mt-4 text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-danger)] inline-flex items-center gap-1 cursor-pointer"><XCircle className="w-3 h-3" /> Cancelar nota</button>}
          </Card>
        )}
        {status === "No estoque" && <p className="text-xs text-emerald-500">Entrada feita em {nota.stock_posted_at ? new Date(nota.stock_posted_at).toLocaleString("pt-BR") : "—"}. As movimentações estão no histórico do estoque de cada produto.</p>}
      </div>

      <Modal isOpen={!!novoProdItem} onClose={() => setNovoProdItem(null)} title="Criar produto a partir do item" description="O produto entra no catálogo com estoque zero; a entrada da nota soma depois." maxWidth="max-w-md">
        <div className="space-y-3">
          <div><label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nome *</label><input value={novoProd.name} onChange={(e) => setNovoProd((p) => ({ ...p, name: e.target.value }))} className={inputCls} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">SKU</label><input value={novoProd.sku} onChange={(e) => setNovoProd((p) => ({ ...p, sku: e.target.value }))} className={inputCls} /></div>
            <div><label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Custo (un.)</label><input type="number" value={novoProd.custo} onChange={(e) => setNovoProd((p) => ({ ...p, custo: e.target.value }))} className={inputCls} /></div>
            <div><label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Preço de venda *</label><input type="number" value={novoProd.preco} onChange={(e) => setNovoProd((p) => ({ ...p, preco: e.target.value }))} className={inputCls} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setNovoProdItem(null)} className="h-9 px-4 text-xs">Cancelar</Button><Button onClick={criarProduto} className="h-9 px-4 text-xs">Criar e ligar</Button></div>
        </div>
      </Modal>

      <Modal isOpen={jsonOpen} onClose={() => setJsonOpen(false)} title="Dados da nota (formato do SPY)" description="É este o conjunto de dados que o envio à API externa vai mapear." maxWidth="max-w-2xl">
        <div className="space-y-3">
          <pre className="text-[11px] bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3 overflow-auto max-h-[50dvh] text-[var(--color-text-primary)]">{JSON.stringify(payload, null, 2)}</pre>
          <div className="flex justify-end"><Button variant="outline" onClick={() => { navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); toast.success("Copiado."); }} className="h-9 px-4 text-xs gap-1.5"><Copy className="w-3.5 h-3.5" /> Copiar</Button></div>
        </div>
      </Modal>
    </PageContainer>
  );
}
