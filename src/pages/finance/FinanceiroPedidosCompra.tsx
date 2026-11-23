import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Plus, Pencil, Trash2, Send, CheckCircle2, PackageCheck, Ban, Clock, Wallet, FileText, Layers, ShoppingCart, Users } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { Pagination } from "../../components/ui/Pagination";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";
import { FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { addPeriodo, splitInstallments } from "../../lib/saleCalculator";
import { FinanceKpiFilter } from "./components/FinanceKpiFilter";
import { SecaoCard } from "./components/SecaoCard";
import { ClienteSelect } from "./components/ClienteSelect";
import { Field, FormSection, ModalFooter, ModalTitle, inputCls, selectCls, textareaCls } from "./components/ModalKit";
import { usePedidosCompra, totalDosItens, type ItemPedido, type PedidoCompra, type StatusPedido } from "./hooks/usePedidosCompra";

const STATUS: StatusPedido[] = ["Rascunho", "Aguardando aprovação", "Aprovado", "Recebido", "Cancelado"];
const COR_STATUS: Record<StatusPedido, string> = {
  Rascunho: "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]",
  "Aguardando aprovação": "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  Aprovado: "bg-[var(--color-info)]/15 text-[var(--color-info)]",
  Recebido: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  Cancelado: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
};
const FORMAS = ["PIX", "Boleto", "Transferência bancária", "Cartão de crédito", "Dinheiro"];
const POR_PAGINA = 15;
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

interface Rascunho {
  fornecedor: string; contato_id: string | null; centro_custo_id: string; solicitante: string;
  data_pedido: string; previsao_entrega: string; forma_pagamento: string; parcelas: string; primeiro_vencimento: string;
  observacoes: string; itens: ItemPedido[];
}
const itemVazio = (): ItemPedido => ({ descricao: "", quantidade: 1, valor_unitario: 0, category_id: null });

/**
 * Pedidos de compra: quem pede, para qual centro de custo, de qual fornecedor e quanto. O pedido passa por
 * Rascunho → Aguardando aprovação → Aprovado → Recebido; ao receber, gera as contas a pagar (com o centro de custo).
 */
export default function FinanceiroPedidosCompra() {
  const { financeCentrosCusto, financeCategories, addFinanceEntry } = useData();
  const { user } = useAuth();
  const { formatCurrency } = useLocalization();
  const { pedidos, loading, criar, atualizar, mudarStatus, excluir } = usePedidosCompra();
  const podeAprovar = !!(user?.isMaster || (user as any)?.isTenantAdmin);

  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [centro, setCentro] = useState("");
  const [de, setDe] = useState<string | null>(null);
  const [ate, setAte] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [modal, setModal] = useState<{ pedido: PedidoCompra | null } | null>(null);
  const [ver, setVer] = useState<PedidoCompra | null>(null);

  const centros = (financeCentrosCusto as any[]);
  const nomeCentro = (id: string | null) => centros.find((c) => c.id === id)?.nome ?? "—";
  const categoriasDespesa = (financeCategories as any[]).filter((c) => c.tipo === "Despesa").sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter((p) =>
      (!q || `${p.numero} ${p.fornecedor} ${p.solicitante ?? ""}`.toLowerCase().includes(q)) &&
      (!status || p.status === status) &&
      (!centro || p.centro_custo_id === centro) &&
      (!de || p.data_pedido >= de) && (!ate || p.data_pedido <= ate));
  }, [pedidos, busca, status, centro, de, ate]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const daPagina = filtrados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);
  const soma = (st: StatusPedido) => pedidos.filter((p) => p.status === st).reduce((s, p) => s + p.total, 0);
  const qtd = (st: StatusPedido) => pedidos.filter((p) => p.status === st).length;

  // ── Formulário ──
  const [f, setF] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const abrir = (pedido: PedidoCompra | null) => {
    setErro(null);
    setF(pedido ? {
      fornecedor: pedido.fornecedor, contato_id: pedido.contato_id, centro_custo_id: pedido.centro_custo_id ?? "", solicitante: pedido.solicitante ?? "",
      data_pedido: pedido.data_pedido, previsao_entrega: pedido.previsao_entrega ?? "", forma_pagamento: pedido.forma_pagamento ?? "", parcelas: String(pedido.parcelas),
      primeiro_vencimento: pedido.primeiro_vencimento ?? "", observacoes: pedido.observacoes ?? "", itens: pedido.itens.length ? pedido.itens : [itemVazio()],
    } : {
      fornecedor: "", contato_id: null, centro_custo_id: "", solicitante: user?.name ?? "", data_pedido: hojeISO(), previsao_entrega: "", forma_pagamento: "", parcelas: "1",
      primeiro_vencimento: "", observacoes: "", itens: [itemVazio()],
    });
    setModal({ pedido });
  };
  const fechar = () => { setModal(null); setF(null); };
  const setItem = (i: number, patch: Partial<ItemPedido>) => setF((x) => x && { ...x, itens: x.itens.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  const totalForm = f ? totalDosItens(f.itens) : 0;

  const salvar = async (enviar: boolean) => {
    if (!f) return;
    if (!f.fornecedor.trim()) { setErro("Informe o fornecedor."); return; }
    if (!f.centro_custo_id) { setErro("Escolha o centro de custo do pedido."); return; }
    const itens = f.itens.filter((i) => i.descricao.trim());
    if (itens.length === 0) { setErro("Inclua ao menos um item com descrição."); return; }
    if (totalDosItens(itens) <= 0) { setErro("O total do pedido precisa ser maior que zero."); return; }
    setErro(null); setSalvando(true);
    const dados = {
      fornecedor: f.fornecedor.trim(), contato_id: f.contato_id, centro_custo_id: f.centro_custo_id, solicitante: f.solicitante.trim() || null,
      data_pedido: f.data_pedido, previsao_entrega: f.previsao_entrega || null, forma_pagamento: f.forma_pagamento || null,
      parcelas: Math.min(60, Math.max(1, parseInt(f.parcelas, 10) || 1)), primeiro_vencimento: f.primeiro_vencimento || null,
      observacoes: f.observacoes.trim() || null, itens,
    };
    let ok = false; let id = modal?.pedido?.id ?? null;
    if (modal?.pedido) ok = await atualizar(modal.pedido.id, dados);
    else { const novo = await criar(dados); ok = !!novo; id = novo?.id ?? null; }
    if (ok && enviar && id) { await mudarStatus(id, "Aguardando aprovação"); toast.success("Pedido enviado para aprovação."); }
    else if (ok && modal?.pedido) toast.success("Pedido atualizado.");
    setSalvando(false);
    if (ok) fechar();
  };

  // ── Ações do fluxo ──
  const enviar = async (p: PedidoCompra) => { if (await mudarStatus(p.id, "Aguardando aprovação")) toast.success("Pedido enviado para aprovação."); };
  const aprovar = async (p: PedidoCompra) => { if (await mudarStatus(p.id, "Aprovado", { aprovado_por: user?.name ?? null, aprovado_em: new Date().toISOString() })) toast.success(`Pedido #${p.numero} aprovado.`); };
  const recusar = async (p: PedidoCompra) => {
    if (!(await confirmDialog({ title: "Recusar pedido", description: `O pedido #${p.numero} será cancelado. Quer continuar?` }))) return;
    if (await mudarStatus(p.id, "Cancelado")) toast.success("Pedido cancelado.");
  };
  const cancelar = async (p: PedidoCompra) => {
    if (!(await confirmDialog({ title: "Cancelar pedido", description: `Cancelar o pedido #${p.numero}?` }))) return;
    if (await mudarStatus(p.id, "Cancelado")) toast.success("Pedido cancelado.");
  };
  const apagar = async (p: PedidoCompra) => {
    if (!(await confirmDialog({ title: "Excluir pedido", description: `Excluir o pedido #${p.numero}? Essa ação não pode ser desfeita.` }))) return;
    if (await excluir(p.id)) toast.success("Pedido excluído.");
  };
  const receber = async (p: PedidoCompra) => {
    const n = Math.max(1, p.parcelas);
    if (!(await confirmDialog({ title: "Receber pedido", description: `Marcar o pedido #${p.numero} como recebido e gerar ${n} conta(s) a pagar de ${formatCurrency(p.total / n)} (${p.fornecedor}, ${nomeCentro(p.centro_custo_id)})?` }))) return;
    const base = new Date(`${(p.primeiro_vencimento || p.data_pedido)}T12:00:00`);
    const valores = splitInstallments(p.total, n);
    const grupo = n > 1 ? crypto.randomUUID() : null;
    // Categoria do lançamento: a do item de maior valor (se tiver categoria cadastrada).
    const maior = [...p.itens].sort((a, b) => b.quantidade * b.valor_unitario - a.quantidade * a.valor_unitario).find((i) => i.category_id);
    const cat = (financeCategories as any[]).find((c) => c.id === maior?.category_id);
    let primeiroId: string | undefined;
    for (let i = 0; i < n; i++) {
      const venc = i === 0 ? base : addPeriodo(base, "mensal", i);
      const id = await addFinanceEntry({
        type: "Pagar", status: "A Vencer", value: valores[i], date: venc.toLocaleDateString("pt-BR"),
        description: `Pedido de compra #${p.numero} — ${p.fornecedor}${n > 1 ? ` (${i + 1}/${n})` : ""}`,
        category: cat?.nome || "Compras", category_id: cat?.id ?? null, centro_custo_id: p.centro_custo_id, counterparty: p.fornecedor, contato_id: p.contato_id,
        payment_method: p.forma_pagamento, numero_documento: `PC-${p.numero}`, notes: p.observacoes,
        ...(grupo ? { installment_group_id: grupo, installment_number: i + 1, installment_total: n } : {}),
      } as any, { silent: true });
      if (i === 0) primeiroId = id as any;
    }
    if (await mudarStatus(p.id, "Recebido", { recebido_em: new Date().toISOString(), lancamento_grupo_id: grupo ?? primeiroId ?? null })) toast.success(`Pedido #${p.numero} recebido: ${n} conta(s) a pagar gerada(s).`);
  };

  const acoes = (p: PedidoCompra) => {
    const btn = "p-1.5 rounded-lg cursor-pointer text-[var(--color-text-muted)]";
    return (
      <div className="flex items-center justify-end gap-0.5">
        {p.status === "Rascunho" && <button type="button" onClick={() => enviar(p)} title="Enviar para aprovação" className={`${btn} hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10`}><Send className="w-3.5 h-3.5" /></button>}
        {p.status === "Aguardando aprovação" && podeAprovar && <button type="button" onClick={() => aprovar(p)} title="Aprovar" className={`${btn} hover:text-[var(--color-success)] hover:bg-[var(--color-success)]/10`}><CheckCircle2 className="w-3.5 h-3.5" /></button>}
        {p.status === "Aguardando aprovação" && podeAprovar && <button type="button" onClick={() => recusar(p)} title="Recusar" className={`${btn} hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10`}><Ban className="w-3.5 h-3.5" /></button>}
        {p.status === "Aprovado" && <button type="button" onClick={() => receber(p)} title="Receber e gerar contas a pagar" className={`${btn} hover:text-[var(--color-success)] hover:bg-[var(--color-success)]/10`}><PackageCheck className="w-3.5 h-3.5" /></button>}
        <button type="button" onClick={() => setVer(p)} title="Ver detalhes" className={`${btn} hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]`}><FileText className="w-3.5 h-3.5" /></button>
        {(p.status === "Rascunho" || p.status === "Aguardando aprovação") && <button type="button" onClick={() => abrir(p)} title="Editar" className={`${btn} hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10`}><Pencil className="w-3.5 h-3.5" /></button>}
        {(p.status === "Aprovado") && <button type="button" onClick={() => cancelar(p)} title="Cancelar pedido" className={`${btn} hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10`}><Ban className="w-3.5 h-3.5" /></button>}
        {(p.status === "Rascunho" || p.status === "Cancelado") && <button type="button" onClick={() => apagar(p)} title="Excluir" className={`${btn} hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10`}><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
    );
  };

  return (
    <PageContainer
      title="Pedidos de Compra"
      description="Peça uma compra informando o fornecedor, o centro de custo e os itens. Depois de aprovado e recebido, o pedido vira conta a pagar já ligada ao centro de custo."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Pedidos de Compra" }]}
      actions={<Button onClick={() => abrir(null)} className="h-9 px-4 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo Pedido</Button>}
    >
      <div className="space-y-4 max-w-[1700px] mx-auto pb-12">
        <FinanceKpiFilter
          id="finPedidosCompra"
          kpis={[
            { label: "Pedidos", value: pedidos.length, icon: ClipboardList, tone: "primary" },
            { label: "Aguardando aprovação", value: qtd("Aguardando aprovação"), icon: Clock, tone: qtd("Aguardando aprovação") > 0 ? "warning" : "neutral", hint: formatCurrency(soma("Aguardando aprovação")) },
            { label: "Aprovados a receber", value: qtd("Aprovado"), icon: CheckCircle2, tone: "info", hint: formatCurrency(soma("Aprovado")) },
            { label: "Recebidos", value: qtd("Recebido"), icon: PackageCheck, tone: "success", hint: formatCurrency(soma("Recebido")) },
            { label: "Total em compras", value: formatCurrency(soma("Aprovado") + soma("Recebido")), icon: Wallet, tone: "accent", hint: "Pedidos aprovados e recebidos" },
          ]}
          activeCount={(busca ? 1 : 0) + (status ? 1 : 0) + (centro ? 1 : 0) + (de || ate ? 1 : 0)}
          onClear={() => { setBusca(""); setStatus(""); setCentro(""); setDe(null); setAte(null); setPagina(0); }}
        >
          <FilterBar>
            <FilterSearch value={busca} onChange={(v) => { setBusca(v); setPagina(0); }} placeholder="Buscar por número, fornecedor ou solicitante..." />
            <FilterSelect icon={Layers} value={status} onChange={(v) => { setStatus(v); setPagina(0); }} allLabel="Todas as situações" options={STATUS.map((s) => ({ value: s, label: s }))} />
            <FilterSelect icon={ShoppingCart} value={centro} onChange={(v) => { setCentro(v); setPagina(0); }} allLabel="Todos os centros de custo" options={centros.map((c) => ({ value: c.id, label: c.nome }))} />
            <DateRangeFilter dateFrom={de} setDateFrom={(v) => { setDe(v); setPagina(0); }} dateTo={ate} setDateTo={(v) => { setAte(v); setPagina(0); }} emptyLabel="Data do pedido: Tudo" />
          </FilterBar>
        </FinanceKpiFilter>

        <SecaoCard titulo={`Pedidos (${filtrados.length})`} icon={ClipboardList} semPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] uppercase font-semibold tracking-wide text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                <tr><th className="px-4 py-2.5">Nº</th><th className="px-4 py-2.5">Fornecedor</th><th className="px-4 py-2.5">Centro de custo</th><th className="px-4 py-2.5">Pedido</th><th className="px-4 py-2.5">Entrega</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5">Situação</th><th className="px-4 py-2.5 text-right">Ações</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {loading ? <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--color-text-faint)]">Carregando…</td></tr>
                  : daPagina.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center">
                      <p className="text-sm font-bold text-[var(--color-text-primary)]">{pedidos.length === 0 ? "Nenhum pedido de compra ainda" : "Nenhum pedido neste filtro"}</p>
                      {pedidos.length === 0 && <><p className="text-xs text-[var(--color-text-muted)] mt-1 mb-4">Crie o primeiro pedido para controlar o que está sendo comprado, por centro de custo.</p><Button onClick={() => abrir(null)} className="h-9 px-4 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo Pedido</Button></>}
                    </td></tr>
                  ) : daPagina.map((p) => (
                    <tr key={p.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-[var(--color-text-muted)]">#{p.numero}</td>
                      <td className="px-4 py-2.5"><div className="font-medium text-[var(--color-text-primary)]">{p.fornecedor}</div><div className="text-[10px] text-[var(--color-text-faint)]">{p.itens.length} item(ns){p.solicitante ? ` · ${p.solicitante}` : ""}</div></td>
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{nomeCentro(p.centro_custo_id)}</td>
                      <td className="px-4 py-2.5 font-mono text-[var(--color-text-muted)]">{dataBR(p.data_pedido)}</td>
                      <td className="px-4 py-2.5 font-mono text-[var(--color-text-muted)]">{dataBR(p.previsao_entrega)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatCurrency(p.total)}</td>
                      <td className="px-4 py-2.5"><span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${COR_STATUS[p.status]}`}>{p.status}</span></td>
                      <td className="px-4 py-2.5">{acoes(p)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3"><Pagination page={paginaAtual} totalPages={totalPaginas} total={filtrados.length} pageSize={POR_PAGINA} onPageChange={setPagina} itemLabel="pedido" /></div>
        </SecaoCard>
      </div>

      {/* Novo / editar pedido */}
      <Modal isOpen={!!modal} onClose={fechar} maxWidth="max-w-3xl" title={<ModalTitle icon={ClipboardList} title={modal?.pedido ? `Editar pedido #${modal.pedido.numero}` : "Novo pedido de compra"} subtitle="Fornecedor, centro de custo e itens do que será comprado." />}>
        {f && (
          <form onSubmit={(e) => { e.preventDefault(); void salvar(false); }} className="space-y-4">
            <FormSection icon={Users} title="Pedido">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Fornecedor" required><ClienteSelect value={f.fornecedor} contatoId={f.contato_id} preferTipo="FORNECEDOR" onChange={(nome, id) => setF({ ...f, fornecedor: nome, contato_id: id })} /></Field>
                <Field label="Centro de custo" required>
                  <select value={f.centro_custo_id} onChange={(e) => setF({ ...f, centro_custo_id: e.target.value })} className={selectCls()}>
                    <option value="">Selecione…</option>
                    {centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </Field>
                <Field label="Solicitante"><input value={f.solicitante} onChange={(e) => setF({ ...f, solicitante: e.target.value })} className={inputCls()} /></Field>
                <Field label="Data do pedido"><input type="date" value={f.data_pedido} onChange={(e) => setF({ ...f, data_pedido: e.target.value })} className={inputCls()} /></Field>
                <Field label="Previsão de entrega"><input type="date" value={f.previsao_entrega} onChange={(e) => setF({ ...f, previsao_entrega: e.target.value })} className={inputCls()} /></Field>
                <Field label="Forma de pagamento">
                  <select value={f.forma_pagamento} onChange={(e) => setF({ ...f, forma_pagamento: e.target.value })} className={selectCls()}>
                    <option value="">A definir</option>
                    {FORMAS.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Parcelas" hint="Em quantas vezes será pago ao receber"><input type="number" min={1} max={60} value={f.parcelas} onChange={(e) => setF({ ...f, parcelas: e.target.value })} className={inputCls()} /></Field>
                <Field label="Primeiro vencimento" hint="Vazio = data do pedido"><input type="date" value={f.primeiro_vencimento} onChange={(e) => setF({ ...f, primeiro_vencimento: e.target.value })} className={inputCls()} /></Field>
              </div>
            </FormSection>

            <FormSection icon={ShoppingCart} title="Itens" hint={`Total ${formatCurrency(totalForm)}`}>
              <div className="space-y-2">
                {f.itens.map((it, i) => (
                  <div key={i} className="grid gap-2 grid-cols-12 items-end">
                    <div className="col-span-12 sm:col-span-5"><input placeholder="Descrição do item" value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} className={inputCls()} /></div>
                    <div className="col-span-3 sm:col-span-1"><input type="number" min={0} step="any" aria-label="Quantidade" value={it.quantidade} onChange={(e) => setItem(i, { quantidade: Number(e.target.value) })} className={inputCls()} /></div>
                    <div className="col-span-4 sm:col-span-2"><input type="number" min={0} step="0.01" aria-label="Valor unitário" placeholder="Valor un." value={it.valor_unitario || ""} onChange={(e) => setItem(i, { valor_unitario: Number(e.target.value) })} className={inputCls()} /></div>
                    <div className="col-span-5 sm:col-span-3">
                      <select aria-label="Categoria" value={it.category_id ?? ""} onChange={(e) => setItem(i, { category_id: e.target.value || null })} className={selectCls()}>
                        <option value="">Categoria…</option>
                        {categoriasDespesa.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-1 flex justify-end">
                      <button type="button" disabled={f.itens.length === 1} onClick={() => setF({ ...f, itens: f.itens.filter((_, k) => k !== i) })} aria-label="Remover item" className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-30 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={() => setF({ ...f, itens: [...f.itens, itemVazio()] })} className="h-8 px-3 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Adicionar item</Button>
              </div>
            </FormSection>

            <Field label="Observações"><textarea rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} className={textareaCls} placeholder="Condições, contato, motivo da compra…" /></Field>
            {erro && <p className="text-xs text-[var(--color-danger)]">{erro}</p>}
            <ModalFooter onCancel={fechar} submitLabel="Salvar rascunho" saving={salvando} left={<Button type="button" disabled={salvando} onClick={() => void salvar(true)} className="h-9 px-4 text-xs font-bold gap-1.5"><Send className="w-3.5 h-3.5" /> Salvar e enviar para aprovação</Button>} />
          </form>
        )}
      </Modal>

      {/* Detalhes */}
      <Modal isOpen={!!ver} onClose={() => setVer(null)} maxWidth="max-w-2xl" title={ver ? <ModalTitle icon={FileText} title={`Pedido #${ver.numero}`} subtitle={ver.fornecedor} /> : undefined}>
        {ver && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-2"><span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${COR_STATUS[ver.status]}`}>{ver.status}</span><span className="text-[var(--color-text-muted)]">Centro de custo: <strong className="text-[var(--color-text-primary)]">{nomeCentro(ver.centro_custo_id)}</strong></span></div>
            <div className="grid grid-cols-2 gap-2 text-[var(--color-text-muted)]">
              <span>Solicitante: <strong className="text-[var(--color-text-primary)]">{ver.solicitante || "—"}</strong></span>
              <span>Pedido: <strong className="text-[var(--color-text-primary)]">{dataBR(ver.data_pedido)}</strong></span>
              <span>Entrega prevista: <strong className="text-[var(--color-text-primary)]">{dataBR(ver.previsao_entrega)}</strong></span>
              <span>Pagamento: <strong className="text-[var(--color-text-primary)]">{ver.forma_pagamento || "—"}{ver.parcelas > 1 ? ` · ${ver.parcelas}x` : ""}</strong></span>
              {ver.aprovado_em && <span>Aprovado por: <strong className="text-[var(--color-text-primary)]">{ver.aprovado_por || "—"} em {dataBR(ver.aprovado_em)}</strong></span>}
              {ver.recebido_em && <span>Recebido em: <strong className="text-[var(--color-text-primary)]">{dataBR(ver.recebido_em)}</strong></span>}
            </div>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]"><tr><th className="py-1.5 text-left">Item</th><th className="py-1.5 text-right">Qtd.</th><th className="py-1.5 text-right">Valor un.</th><th className="py-1.5 text-right">Subtotal</th></tr></thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {ver.itens.map((i, k) => <tr key={k}><td className="py-1.5">{i.descricao}</td><td className="py-1.5 text-right tabular-nums">{i.quantidade}</td><td className="py-1.5 text-right tabular-nums">{formatCurrency(i.valor_unitario)}</td><td className="py-1.5 text-right tabular-nums font-semibold">{formatCurrency(i.quantidade * i.valor_unitario)}</td></tr>)}
              </tbody>
              <tfoot><tr><td colSpan={3} className="pt-2 text-right font-bold">Total</td><td className="pt-2 text-right font-black tabular-nums">{formatCurrency(ver.total)}</td></tr></tfoot>
            </table>
            {ver.observacoes && <p className="text-[var(--color-text-muted)] whitespace-pre-wrap">{ver.observacoes}</p>}
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
