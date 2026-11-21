import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../../components/ui/modal";
import { Button } from "../../components/ui/button";
import { BotaoImportar } from "../../components/ImportadorPlanilha";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { supabase } from "../../lib/supabase";
import { useVarejoConfig } from "../../lib/varejoConfig";
import { carregarCatalogo, fornecedorCatalogoSpec, normTexto, type CatalogoItem } from "../../lib/fornecedorCatalogo";
import type { FornecedorItem } from "./FornecedorModal";

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const LIMITE_TELA = 200;

/** Catálogo de um fornecedor: subir planilha, consultar e montar o pedido marcando itens e quantidades. */
export function CatalogoFornecedorModal({
  fornecedor, tenantId, onClose,
}: {
  fornecedor: FornecedorItem | null;
  tenantId: string | null | undefined;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const cfgVarejo = useVarejoConfig();
  const [itens, setItens] = useState<CatalogoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [reload, setReload] = useState(0);
  const [busca, setBusca] = useState("");
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [lancando, setLancando] = useState(false);

  useEffect(() => {
    if (!fornecedor || !tenantId) return;
    let cancelado = false;
    setCarregando(true);
    carregarCatalogo(tenantId, fornecedor.id)
      .then((r) => { if (!cancelado) setItens(r); })
      .catch(() => { if (!cancelado) toast.error("Erro ao carregar o catálogo."); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [fornecedor?.id, tenantId, reload]);

  useEffect(() => { if (!fornecedor) { setBusca(""); setQtd({}); setItens([]); } }, [fornecedor]);

  const filtrados = useMemo(() => {
    const palavras = normTexto(busca).split(/\s+/).filter(Boolean);
    if (palavras.length === 0) return itens;
    return itens.filter((i) => {
      const alvo = normTexto(`${i.nome} ${i.codigo} ${i.ean} ${i.categoria}`);
      return palavras.every((w) => alvo.includes(w));
    });
  }, [itens, busca]);

  const escolhidos = itens.filter((i) => (parseInt(qtd[i.id], 10) || 0) > 0);
  const totalPedido = escolhidos.reduce((t, i) => t + (parseInt(qtd[i.id], 10) || 0) * (i.custo || 0), 0);

  const excluirItem = async (i: CatalogoItem) => {
    if (!supabase) return;
    if (!(await confirmDialog({ title: "Excluir item do catálogo", description: `Excluir "${i.nome}" do catálogo deste fornecedor? Seus produtos e ordens de compra não são afetados.` }))) return;
    const { data, error } = await supabase.from("fornecedor_catalogo_itens").delete().eq("id", i.id).select("id");
    if (error || !data || data.length === 0) { toast.error("Erro ao excluir o item."); return; }
    setItens((prev) => prev.filter((x) => x.id !== i.id));
  };

  const lancarOrdens = async () => {
    if (!fornecedor || !supabase || !tenantId || escolhidos.length === 0 || lancando) return;
    const prazo = cfgVarejo.compras.prazoEntregaPadraoDias;
    let previsao: string | null = null;
    if (prazo > 0) { const d = new Date(); d.setDate(d.getDate() + prazo); previsao = d.toISOString().slice(0, 10); }
    setLancando(true);
    const { error } = await supabase.from("compras").insert(
      escolhidos.map((i) => {
        const q = parseInt(qtd[i.id], 10);
        return {
          tenant_id: tenantId,
          fornecedor: fornecedor.razaoSocial,
          valor: q * (i.custo || 0),
          itens: `${q}x ${i.nome}`,
          item_nome: i.nome,
          quantidade: q,
          custo_unitario: i.custo,
          product_id: i.productId,
          catalogo_item_id: i.id,
          previsao_entrega: previsao,
          status: "Pendente",
        };
      }),
    );
    setLancando(false);
    if (error) { toast.error("Erro ao lançar as ordens de compra."); return; }
    toast.success(escolhidos.length > 1 ? `${escolhidos.length} ordens de compra lançadas!` : "Ordem de compra lançada!");
    onClose();
    navigate("/app/varejo/compras");
  };

  if (!fornecedor) return null;

  return (
    <Modal
      isOpen={!!fornecedor}
      onClose={onClose}
      maxWidth="max-w-4xl"
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">Catálogo de {fornecedor.razaoSocial}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{itens.length} {itens.length === 1 ? "item" : "itens"} • só entram no seu estoque quando você compra e dá entrada</p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-xs text-[var(--color-text-muted)]">
            {escolhidos.length > 0
              ? <>{escolhidos.length} {escolhidos.length === 1 ? "item" : "itens"} no pedido • Total estimado: <strong className="font-mono text-[var(--color-text-primary)]">R$ {brl(totalPedido)}</strong></>
              : "Informe a quantidade nos itens que quer pedir."}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-9 px-4 text-xs font-semibold">Fechar</Button>
            <Button type="button" onClick={lancarOrdens} disabled={escolhidos.length === 0 || lancando} className="h-9 px-4 text-xs font-semibold bg-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/90 text-white">
              {lancando ? "Lançando..." : `Lançar ${escolhidos.length > 1 ? "ordens" : "ordem"} de compra (${escolhidos.length})`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex items-center gap-2 mb-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, código, EAN ou categoria..."
          className="flex-1 px-3 py-2 text-xs bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
        />
        {tenantId && (
          <BotaoImportar
            label={itens.length > 0 ? "Atualizar catálogo" : "Subir catálogo"}
            spec={fornecedorCatalogoSpec({ tenantId, fornecedorId: fornecedor.id, fornecedorNome: fornecedor.razaoSocial, onDone: () => setReload((k) => k + 1) })}
          />
        )}
      </div>

      <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-[var(--color-border-subtle)]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--color-surface)]">
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
              <th className="py-2.5 px-3">Item</th>
              <th className="py-2.5 px-3">Código</th>
              <th className="py-2.5 px-3">Un.</th>
              <th className="py-2.5 px-3 text-right">Custo</th>
              <th className="py-2.5 px-3 text-right">Qtd a pedir</th>
              <th className="py-2.5 px-3" />
            </tr>
          </thead>
          <tbody>
            {filtrados.slice(0, LIMITE_TELA).map((i) => {
              const subiu = i.custo != null && i.custoAnterior != null && i.custo > i.custoAnterior;
              const caiu = i.custo != null && i.custoAnterior != null && i.custo < i.custoAnterior;
              return (
                <tr key={i.id} className="border-b border-[var(--color-border-subtle)] last:border-0">
                  <td className="py-2 px-3 max-w-[300px]">
                    <p className="font-semibold text-[var(--color-text-primary)] truncate" title={i.nome}>{i.nome}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      {[i.categoria, i.ean && `EAN ${i.ean}`].filter(Boolean).join(" • ")}
                      {i.productId && <span className="ml-1 font-bold text-emerald-500">Já é produto seu</span>}
                    </p>
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-[var(--color-text-muted)]">{i.codigo || "—"}</td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">{i.unidade || "—"}</td>
                  <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                    {i.custo != null ? brl(i.custo) : "—"}
                    {(subiu || caiu) && (
                      <span className={`ml-1 inline-flex items-center gap-0.5 text-[10px] ${subiu ? "text-rose-500" : "text-emerald-500"}`} title={`Antes: R$ ${brl(i.custoAnterior!)}${i.custoAtualizadoEm ? ` (mudou em ${new Date(i.custoAtualizadoEm).toLocaleDateString("pt-BR")})` : ""}`}>
                        {subiu ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number" min={0} placeholder="0"
                      value={qtd[i.id] ?? ""}
                      onChange={(e) => setQtd((prev) => ({ ...prev, [i.id]: e.target.value }))}
                      className="w-20 px-2 py-1.5 text-xs text-right bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                    />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button type="button" onClick={() => excluirItem(i)} title="Excluir do catálogo" className="text-red-500 hover:bg-red-500/10 rounded-lg p-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!carregando && filtrados.length === 0 && (
          <div className="p-8 text-center text-xs text-[var(--color-text-muted)]">
            {itens.length === 0 ? "Este fornecedor ainda não tem catálogo. Clique em “Subir catálogo” e envie a planilha dele." : "Nenhum item encontrado para essa busca."}
          </div>
        )}
        {carregando && <div className="p-8 text-center text-xs text-[var(--color-text-muted)]">Carregando catálogo...</div>}
      </div>
      {filtrados.length > LIMITE_TELA && (
        <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">Mostrando {LIMITE_TELA} de {filtrados.length} itens. Use a busca para achar os demais.</p>
      )}
    </Modal>
  );
}
