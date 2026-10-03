import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Printer, Save, Trash2, Wallet, Package } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { supabase } from "../../lib/supabase";
import {
  OS_NEXT, OS_PRIORIDADES, OS_STATUS_TONE, buildOsPrintHtml, isOsLocked, itemTotal, num, osCode, osTotals,
  type OsItem, type OsStatus,
} from "../../lib/ordemServico";
import { cn } from "../../lib/utils";
import { ClientePicker } from "../os/components/ClientePicker";
import { dadosDoCliente } from "../os/clienteOs";

const inputCls =
  "w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] disabled:opacity-60";
const labelCls = "text-[10px] font-bold uppercase text-[var(--color-text-muted)] mb-1 block";

const FORMAS_PAGAMENTO = ["", "Pix", "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Boleto Bancário", "Transferência / TED"];

const emptyItem = (tipo: OsItem["tipo"]): OsItem => ({ tipo, descricao: "", unidade: tipo === "Serviço" ? "serv" : "un", quantidade: 1, valor_unitario: 0, product_id: null });

export default function OrdemServicoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeTenantId } = useAuth();
  const { products, appSettings, addFinanceEntry, resolveFinanceCategoryId } = useData();
  const { formatCurrency } = useLocalization();

  const [os, setOs] = useState<any | null>(null);
  const [items, setItems] = useState<OsItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);

  const carregar = useCallback(async () => {
    if (!supabase || !activeTenantId || !id) return;
    const [{ data: o }, { data: its }] = await Promise.all([
      supabase.from("ordens_servico").select("*").eq("id", id).eq("tenant_id", activeTenantId).maybeSingle(),
      supabase.from("ordem_servico_itens").select("*").eq("ordem_id", id).eq("tenant_id", activeTenantId).order("posicao"),
    ]);
    setOs(o || null);
    setItems((its || []).map((i: any) => ({
      id: i.id, tipo: i.tipo, descricao: i.descricao, unidade: i.unidade || "", quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario), product_id: i.product_id,
    })));
    setDirty(false);
    setCarregando(false);
  }, [activeTenantId, id]);
  useEffect(() => { carregar(); }, [carregar]);

  const locked = os ? isOsLocked(os.status) : true;
  const totals = useMemo(() => osTotals(items, num(os?.valor_desconto)), [items, os?.valor_desconto]);

  const setField = (k: string, v: any) => { setOs((prev: any) => ({ ...prev, [k]: v })); setDirty(true); };
  const setItem = (idx: number, patch: Partial<OsItem>) => { setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))); setDirty(true); };
  const addItem = (tipo: OsItem["tipo"]) => { setItems((prev) => [...prev, emptyItem(tipo)]); setDirty(true); };
  const removeItem = (idx: number) => { setItems((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };

  const pickProduct = (idx: number, productId: string) => {
    const p = (products as any[]).find((x) => x.id === productId);
    if (!p) { setItem(idx, { product_id: null }); return; }
    setItem(idx, { product_id: p.id, descricao: p.name, valor_unitario: Number(p.price) || 0 });
  };

  /** Grava cabeçalho + itens (itens são regravados por inteiro: apaga e insere de novo). */
  const salvar = async (extra: Record<string, any> = {}): Promise<boolean> => {
    if (!supabase || !activeTenantId || !os) return false;
    const validos = items.filter((i) => i.descricao.trim());
    if (validos.some((i) => num(i.quantidade) <= 0)) { toast.error("A quantidade dos itens precisa ser maior que zero."); return false; }
    setSalvando(true);
    try {
      const t = osTotals(validos, num(os.valor_desconto));
      const header = {
        prioridade: os.prioridade, titulo: os.titulo || "", descricao: os.descricao || null,
        campos: os.campos ?? {},
        cliente_nome: os.cliente_nome || null, cliente_documento: os.cliente_documento || null, cliente_telefone: os.cliente_telefone || null,
        cliente_email: os.cliente_email || null, cliente_endereco: os.cliente_endereco || null, local_execucao: os.local_execucao || null,
        responsavel: os.responsavel || null, data_abertura: os.data_abertura || null, data_prevista: os.data_prevista || null,
        data_conclusao: os.data_conclusao || null, forma_pagamento: os.forma_pagamento || null, condicoes_pagamento: os.condicoes_pagamento || null,
        garantia: os.garantia || null, valor_desconto: Math.max(0, num(os.valor_desconto)), valor_total: t.total, observacoes: os.observacoes || null,
        ...extra,
      };
      const { error } = await supabase.from("ordens_servico").update(header).eq("id", os.id).eq("tenant_id", activeTenantId);
      if (error) throw error;
      const del = await supabase.from("ordem_servico_itens").delete().eq("ordem_id", os.id).eq("tenant_id", activeTenantId);
      if (del.error) throw del.error;
      if (validos.length > 0) {
        const ins = await supabase.from("ordem_servico_itens").insert(
          validos.map((i, idx) => ({
            tenant_id: activeTenantId, ordem_id: os.id, posicao: idx + 1, tipo: i.tipo, descricao: i.descricao.trim(),
            unidade: i.unidade || null, quantidade: num(i.quantidade), valor_unitario: num(i.valor_unitario), valor_total: itemTotal(i), product_id: i.product_id || null,
          }))
        );
        if (ins.error) throw ins.error;
      }
      await carregar();
      return true;
    } catch (e: any) {
      toast.error("Não foi possível salvar: " + (e?.message || "erro"));
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const mudarStatus = async (novo: OsStatus) => {
    if (!os) return;
    if (novo === "Cancelada" && !(await confirmDialog({ description: "Cancelar esta ordem de serviço?" }))) return;
    const extra: Record<string, any> = { status: novo };
    if (novo === "Concluída" && !os.data_conclusao) extra.data_conclusao = new Date().toISOString().slice(0, 10);
    if (novo === "Faturada" && totals.total <= 0) { toast.error("Adicione itens com valor antes de faturar."); return; }
    // Grava o status primeiro; a cobrança só é lançada se a gravação deu certo (senão a OS
    // ficaria sem status Faturada e um novo clique geraria cobrança duplicada).
    if (!(await salvar(extra))) return;
    if (novo === "Faturada") {
      const cliente = os.cliente_nome || "Cliente";
      const categoryId = await resolveFinanceCategoryId("Vendas / Serviços", "Receita");
      addFinanceEntry({
        description: `${osCode(os.numero)} — ${cliente}${os.titulo ? ` | ${os.titulo}` : ""}`,
        category: "Vendas / Serviços",
        category_id: categoryId,
        value: totals.total,
        type: "Receber",
        status: "A Vencer",
        date: os.data_prevista || new Date().toISOString().slice(0, 10),
        payment_method: os.forma_pagamento || null,
        notes: os.condicoes_pagamento || null,
      } as any);
    }
    toast.success(novo === "Faturada" ? "Cobrança gerada no Financeiro." : `Status: ${novo}`);
  };

  const imprimir = () => {
    if (!os) return;
    const html = buildOsPrintHtml({
      os, items: items.filter((i) => i.descricao.trim()), empresa: appSettings?.empresa_dados || {}, formatCurrency,
    });
    const w = window.open("", "_blank");
    if (!w) { toast.error("Permita pop-ups para imprimir/salvar em PDF."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  const excluir = async () => {
    if (!supabase || !os || os.status !== "Rascunho") return;
    if (!(await confirmDialog({ description: "Excluir este rascunho de ordem de serviço?" }))) return;
    const { error } = await supabase.from("ordens_servico").delete().eq("id", os.id).eq("tenant_id", activeTenantId!);
    if (error) { toast.error("Não foi possível excluir."); return; }
    toast.success("Ordem de serviço excluída.");
    navigate("/app/ordens-servico");
  };

  if (carregando) {
    return <PageContainer title="Ordem de Serviço"><p className="text-xs text-[var(--color-text-faint)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</p></PageContainer>;
  }
  if (!os) {
    return (
      <PageContainer title="Ordem de Serviço">
        <EmptyState icon={Package} title="Ordem de serviço não encontrada" description="Ela pode ter sido excluída." action={<Link to="/app/ordens-servico" className="text-xs text-[var(--color-primary-blue)] hover:underline">Voltar para a lista</Link>} />
      </PageContainer>
    );
  }

  const proximos = OS_NEXT[os.status as OsStatus] || [];

  return (
    <PageContainer
      title={`Ordem de Serviço ${osCode(os.numero)}`}
      description={os.titulo || "Preencha os dados do serviço, os itens e as condições."}
      breadcrumb={[{ label: "Operações" }, { label: "Ordens de Serviço", path: "/app/ordens-servico" }, { label: osCode(os.numero) }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/app/ordens-servico" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-2"><ArrowLeft className="w-3.5 h-3.5" /> Lista</Link>
          {os.origem_tipo === "implementation" && os.origem_id && (
            <Link to={`/app/crm/implementacoes/${os.origem_id}`} className="inline-flex items-center h-9 px-4 rounded-[var(--radius-control)] border border-[var(--color-border-default)] text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]">Abrir implementação</Link>
          )}
          <Button variant="outline" onClick={imprimir} className="h-9 px-4 text-xs font-medium gap-1.5"><Printer className="w-3.5 h-3.5" /> Imprimir / PDF</Button>
          {!locked && (
            <Button onClick={() => salvar()} disabled={salvando || !dirty} className="h-9 px-4 text-xs font-medium gap-1.5">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5 max-w-[1200px] mx-auto pb-12">
        {/* Status + próximos passos */}
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={cn("inline-flex px-3 py-1.5 rounded-lg text-xs font-bold border", OS_STATUS_TONE[os.status as OsStatus])}>{os.status}</span>
            {dirty && !locked && <span className="text-[11px] text-amber-600">Alterações não salvas</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {proximos.map((s, i) => (
              <Button
                key={s} variant={i === 0 && s !== "Cancelada" ? "default" : "outline"} onClick={() => mudarStatus(s)} disabled={salvando}
                className="h-9 px-4 text-xs font-medium gap-1.5"
              >
                {s === "Faturada" && <Wallet className="w-3.5 h-3.5" />}
                {s === "Aberta" ? "Emitir / Abrir OS" : s === "Em execução" ? "Iniciar execução" : s === "Concluída" ? "Concluir serviço" : s === "Faturada" ? "Gerar cobrança (Faturar)" : s === "Rascunho" ? "Reabrir como rascunho" : "Cancelar OS"}
              </Button>
            ))}
            {os.status === "Rascunho" && (
              <Button variant="outline" onClick={excluir} className="h-9 px-3 text-xs text-rose-500 gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Excluir</Button>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Cliente */}
          <Card className="p-5 space-y-3">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Cliente</h3>
            <div>
              <label className={labelCls}>Escolher da Base de Clientes</label>
              <ClientePicker
                clienteId={os.campos?.cliente_id}
                disabled={locked}
                mostrarDados={false}
                placeholder="Buscar cliente para preencher os dados…"
                onSelect={(c) => {
                  // Preenche nome, CPF/CNPJ, telefone, e-mail, endereço e local de execução com o cadastro do cliente.
                  if (c) Object.entries(dadosDoCliente(c)).forEach(([k, v]) => setField(k, v ?? ""));
                  const { cliente_id: _anterior, ...resto } = os.campos ?? {};
                  setField("campos", c ? { ...resto, cliente_id: c.id } : resto);
                }}
              />
            </div>
            <div><label className={labelCls}>Nome / Razão social</label><input className={inputCls} disabled={locked} value={os.cliente_nome || ""} onChange={(e) => setField("cliente_nome", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>CPF / CNPJ</label><input className={inputCls} disabled={locked} value={os.cliente_documento || ""} onChange={(e) => setField("cliente_documento", e.target.value)} /></div>
              <div><label className={labelCls}>Telefone</label><input className={inputCls} disabled={locked} value={os.cliente_telefone || ""} onChange={(e) => setField("cliente_telefone", e.target.value)} /></div>
            </div>
            <div><label className={labelCls}>E-mail</label><input className={inputCls} disabled={locked} value={os.cliente_email || ""} onChange={(e) => setField("cliente_email", e.target.value)} /></div>
            <div><label className={labelCls}>Endereço</label><input className={inputCls} disabled={locked} value={os.cliente_endereco || ""} onChange={(e) => setField("cliente_endereco", e.target.value)} /></div>
          </Card>

          {/* Serviço */}
          <Card className="p-5 space-y-3">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Serviço</h3>
            <div><label className={labelCls}>Título do serviço</label><input className={inputCls} disabled={locked} value={os.titulo || ""} onChange={(e) => setField("titulo", e.target.value)} placeholder="Ex.: Instalação de ar-condicionado" /></div>
            <div><label className={labelCls}>Descrição / escopo</label><textarea rows={3} className={inputCls} disabled={locked} value={os.descricao || ""} onChange={(e) => setField("descricao", e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={labelCls}>Abertura</label><input type="date" className={inputCls} disabled={locked} value={os.data_abertura || ""} onChange={(e) => setField("data_abertura", e.target.value)} /></div>
              <div><label className={labelCls}>Previsão</label><input type="date" className={inputCls} disabled={locked} value={os.data_prevista || ""} onChange={(e) => setField("data_prevista", e.target.value)} /></div>
              <div><label className={labelCls}>Prioridade</label>
                <select className={inputCls} disabled={locked} value={os.prioridade} onChange={(e) => setField("prioridade", e.target.value)}>
                  {OS_PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Responsável</label><input className={inputCls} disabled={locked} value={os.responsavel || ""} onChange={(e) => setField("responsavel", e.target.value)} /></div>
              <div><label className={labelCls}>Local de execução</label><input className={inputCls} disabled={locked} value={os.local_execucao || ""} onChange={(e) => setField("local_execucao", e.target.value)} /></div>
            </div>
          </Card>
        </div>

        {/* Itens */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Itens da ordem</h3>
            {!locked && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => addItem("Serviço")} className="h-8 px-3 text-xs gap-1.5"><Plus className="w-3.5 h-3.5" /> Serviço</Button>
                <Button variant="outline" onClick={() => addItem("Material")} className="h-8 px-3 text-xs gap-1.5"><Plus className="w-3.5 h-3.5" /> Material</Button>
              </div>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] py-4 text-center">Nenhum item. Adicione os serviços e materiais que compõem esta ordem.</p>
          ) : (
            <div className="space-y-2">
              <div className="hidden md:grid grid-cols-[90px_1.6fr_60px_80px_110px_110px_32px] gap-2 text-[10px] font-bold uppercase text-[var(--color-text-muted)] px-1">
                <span>Tipo</span><span>Descrição</span><span>Un.</span><span className="text-right">Qtd</span><span className="text-right">Valor unit.</span><span className="text-right">Total</span><span />
              </div>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-2 md:grid-cols-[90px_1.6fr_60px_80px_110px_110px_32px] gap-2 items-center bg-[var(--color-surface-sunken)]/60 rounded-lg p-2">
                  <select className={inputCls} disabled={locked} value={it.tipo} onChange={(e) => setItem(idx, { tipo: e.target.value as OsItem["tipo"] })}>
                    <option>Serviço</option><option>Material</option>
                  </select>
                  <div className="col-span-2 md:col-span-1 space-y-1">
                    <input className={inputCls} disabled={locked} placeholder="Descrição" value={it.descricao} onChange={(e) => setItem(idx, { descricao: e.target.value })} />
                    {!locked && (products as any[]).length > 0 && (
                      <select className={cn(inputCls, "!py-1 !text-[10px]")} value={it.product_id || ""} onChange={(e) => pickProduct(idx, e.target.value)}>
                        <option value="">Preencher a partir do catálogo…</option>
                        {(products as any[]).filter((p) => p.active !== false).map((p) => <option key={p.id} value={p.id}>{p.name} — {formatCurrency(Number(p.price) || 0)}</option>)}
                      </select>
                    )}
                  </div>
                  <input className={inputCls} disabled={locked} value={it.unidade} onChange={(e) => setItem(idx, { unidade: e.target.value })} />
                  <input type="number" min={0} step="any" className={cn(inputCls, "text-right")} disabled={locked} value={it.quantidade} onChange={(e) => setItem(idx, { quantidade: num(e.target.value) })} />
                  <input type="number" min={0} step="0.01" className={cn(inputCls, "text-right")} disabled={locked} value={it.valor_unitario} onChange={(e) => setItem(idx, { valor_unitario: num(e.target.value) })} />
                  <span className="text-xs font-mono font-bold text-right text-[var(--color-text-primary)]">{formatCurrency(itemTotal(it))}</span>
                  {!locked ? (
                    <button type="button" onClick={() => removeItem(idx)} title="Remover item" className="p-1.5 text-[var(--color-text-faint)] hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  ) : <span />}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Condições */}
          <Card className="p-5 space-y-3">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Condições</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Forma de pagamento</label>
                <select className={inputCls} disabled={locked} value={os.forma_pagamento || ""} onChange={(e) => setField("forma_pagamento", e.target.value)}>
                  {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f || "Selecione…"}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Condições de pagamento</label><input className={inputCls} disabled={locked} value={os.condicoes_pagamento || ""} onChange={(e) => setField("condicoes_pagamento", e.target.value)} placeholder="Ex.: 50% na entrada, 50% na entrega" /></div>
            </div>
            <div><label className={labelCls}>Garantia</label><input className={inputCls} disabled={locked} value={os.garantia || ""} onChange={(e) => setField("garantia", e.target.value)} placeholder="Ex.: 90 dias sobre o serviço" /></div>
            <div><label className={labelCls}>Observações</label><textarea rows={3} className={inputCls} disabled={locked} value={os.observacoes || ""} onChange={(e) => setField("observacoes", e.target.value)} /></div>
          </Card>

          {/* Totais */}
          <Card className="p-5 space-y-2.5 self-start">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Totais</h3>
            <div className="flex justify-between text-xs"><span className="text-[var(--color-text-muted)]">Serviços</span><span className="font-mono">{formatCurrency(totals.servicos)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-[var(--color-text-muted)]">Materiais</span><span className="font-mono">{formatCurrency(totals.materiais)}</span></div>
            <div className="flex justify-between items-center text-xs gap-3">
              <span className="text-[var(--color-text-muted)]">Desconto (R$)</span>
              <input type="number" min={0} step="0.01" disabled={locked} value={os.valor_desconto ?? 0} onChange={(e) => setField("valor_desconto", num(e.target.value))} className={cn(inputCls, "!w-28 text-right")} />
            </div>
            <div className="flex justify-between items-baseline pt-3 border-t border-[var(--color-border-default)]">
              <span className="text-xs font-bold uppercase">Total</span>
              <span className="text-xl font-black font-mono text-emerald-600">{formatCurrency(totals.total)}</span>
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
