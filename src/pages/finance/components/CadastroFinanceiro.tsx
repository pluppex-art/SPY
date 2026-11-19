import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Edit2, Trash2, Inbox, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../../components/PageContainer";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Modal } from "../../../components/ui/modal";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { FilterBar, FilterSearch } from "../../../components/ui/kpi-filter-card";
import { StatCard } from "../../../components/ui/stat-card";
import { EmptyState } from "../../../components/ui/empty-state";
import { Skeleton } from "../../../components/ui/skeleton";
import type { LucideIcon } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { friendlyError } from "../../../lib/friendlyError";
import { exportarXlsx, dataParaArquivo, type ColunaXlsx } from "../../../lib/exportXlsx";
import { useAuth } from "../../../contexts/AuthContext";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { Field, ModalFooter, inputCls, selectCls, textareaCls } from "./ModalKit";

export type TipoCampo = "text" | "money" | "date" | "month" | "select" | "bool" | "textarea";

export interface CampoCadastro {
  key: string;
  label: string;
  tipo: TipoCampo;
  opcoes?: string[];
  obrigatorio?: boolean;
  /** Valor inicial ao criar. */
  padrao?: string | number | boolean;
  /** Mostra como coluna na lista (default: true, menos textarea). */
  naLista?: boolean;
}

export interface ResumoCadastro {
  label: string;
  icon: LucideIcon;
  tone?: "default" | "danger" | "success" | "warning";
  calcula: (linhas: any[]) => number | string;
  moeda?: boolean;
  sub?: (linhas: any[]) => string;
}

interface Props {
  tabela: string;
  titulo: string;
  descricao: string;
  nomeItem: string; // "promessa", "meta"...
  campos: CampoCadastro[];
  /** Campo (select) usado como filtro por chips/status. */
  campoStatus?: string;
  ordenarPor?: string;
  resumos?: ResumoCadastro[];
  /** Conteúdo extra abaixo da lista (dicas, atalhos). */
  rodape?: ReactNode;
  /** Barra de progresso numérica por linha (ex.: realizado / meta). */
  progresso?: { atual: string; total: string; label: string };
  /**
   * Troca valores digitados por valores calculados dos lançamentos reais. Cada linha devolvida pode
   * trazer `_auto` (texto da origem do número) — vira a coluna "Origem". A linha original (com o que
   * foi digitado) fica guardada em `_orig` e é ela que abre na edição.
   */
  enriquecer?: (linhas: any[], tenantId: string) => Promise<any[]>;
  dicaOrigem?: ReactNode;
}

const vazio = (campos: CampoCadastro[]) =>
  Object.fromEntries(
    campos.map((c) => [
      c.key,
      c.padrao ??
        (c.tipo === "bool" ? false : c.tipo === "money" ? "" : c.tipo === "select" ? c.opcoes?.[0] ?? "" : c.tipo === "date" ? new Date().toISOString().slice(0, 10) : c.tipo === "month" ? new Date().toISOString().slice(0, 7) : ""),
    ]),
  ) as Record<string, any>;

const TOM_STATUS: Record<string, string> = {
  Pendente: "bg-amber-500/15 text-amber-600", "Em aberto": "bg-amber-500/15 text-amber-600", "Em andamento": "bg-amber-500/15 text-amber-600", Negociando: "bg-amber-500/15 text-amber-600",
  Cumprida: "bg-emerald-500/15 text-emerald-600", Concluído: "bg-emerald-500/15 text-emerald-600", Descontado: "bg-emerald-500/15 text-emerald-600", Recebido: "bg-emerald-500/15 text-emerald-600", Fechado: "bg-sky-500/15 text-sky-600",
  Quebrada: "bg-red-500/15 text-red-600", Cancelado: "bg-slate-500/15 text-slate-600", Cancelada: "bg-slate-500/15 text-slate-600",
};
const chipStatus = (v?: string | null) =>
  v ? <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TOM_STATUS[v] ?? "bg-slate-500/15 text-slate-600"}`}>{v}</span> : "—";

const dataBR = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/**
 * CRUD genérico dos cadastros de gestão do Financeiro (promessas, metas,
 * reservas, adiantamentos, acordos, patrocínios, viagens). Cada tela é só uma
 * configuração: tabela + campos. Tudo isolado por empresa (tenant_id + RLS).
 */
export function CadastroFinanceiro({ tabela, titulo, descricao, nomeItem, campos, campoStatus, ordenarPor = "created_at", resumos = [], rodape, progresso, enriquecer, dicaOrigem }: Props) {
  const { activeTenantId: tenantId } = useAuth();
  const { formatCurrency: brl } = useLocalization();
  const [linhas, setLinhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [editando, setEditando] = useState<any | null>(null); // linha existente ou {} (novo)
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const campoLista = campos.filter((c) => c.naLista ?? c.tipo !== "textarea");
  const principal = campos[0];

  const carregar = useCallback(async () => {
    if (!supabase || !tenantId) return;
    setLoading(true);
    const { data, error } = await supabase.from(tabela).select("*").eq("tenant_id", tenantId).order(ordenarPor, { ascending: false }).limit(2000);
    if (error) toast.error(friendlyError(error));
    else {
      let rows = data || [];
      if (enriquecer && rows.length) {
        try {
          rows = (await enriquecer(rows, tenantId)).map((r, i) => ({ ...r, _orig: (data || [])[i] }));
        } catch (e) {
          toast.error("Não foi possível calcular os valores pelos lançamentos; mostrando os valores digitados.");
        }
      }
      setLinhas(rows);
    }
    setLoading(false);
  }, [tabela, tenantId, ordenarPor, enriquecer]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (filtro && campoStatus && l[campoStatus] !== filtro) return false;
      if (!q) return true;
      return campos.some((c) => String(l[c.key] ?? "").toLowerCase().includes(q));
    });
  }, [linhas, busca, filtro, campoStatus, campos]);

  const statusOpcoes = campoStatus ? campos.find((c) => c.key === campoStatus)?.opcoes ?? [] : [];

  const exportar = async () => {
    const colunas: ColunaXlsx[] = [
      ...campos.map((c) => ({ titulo: c.label, tipo: (c.tipo === "money" ? "moeda" : c.tipo === "date" ? "data" : "texto") as ColunaXlsx["tipo"], largura: c.tipo === "textarea" ? 40 : undefined })),
      ...(enriquecer ? [{ titulo: "Origem do valor" } as ColunaXlsx] : []),
    ];
    const dados = filtradas.map((l) => [
      ...campos.map((c) => (c.tipo === "month" ? String(l[c.key] ?? "").split("-").reverse().join("/") : l[c.key])),
      ...(enriquecer ? [l._auto ? `Automático · ${l._auto}` : "Manual"] : []),
    ]);
    try {
      await exportarXlsx(`${tabela.replace("finance_", "")}-${dataParaArquivo()}`, [{ nome: titulo, colunas, linhas: dados }]);
      toast.success(`${dados.length} linha(s) exportada(s).`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const abrirNovo = () => {
    setForm(vazio(campos));
    setEditando({});
  };
  const abrirEdicao = (linha: any) => {
    const l = linha._orig ?? linha;
    setForm({
      ...vazio(campos),
      ...Object.fromEntries(
        campos.map((c) => [c.key, c.tipo === "money" ? (l[c.key] == null ? "" : Number(l[c.key]).toFixed(2).replace(".", ",")) : l[c.key] ?? (c.tipo === "bool" ? false : "")]),
      ),
    });
    setEditando(l);
  };

  const salvar = async () => {
    if (!supabase || !tenantId) return;
    for (const c of campos) {
      if (c.obrigatorio && (form[c.key] === "" || form[c.key] == null)) {
        toast.error(`Preencha: ${c.label}`);
        return;
      }
    }
    const payload: Record<string, any> = {};
    for (const c of campos) {
      const v = form[c.key];
      if (c.tipo === "money") {
        const t = String(v ?? "").trim();
        // "1.500,50" (pt-BR) → 1500.50; "1500.50" (ponto decimal, sem vírgula) → 1500.50
        const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
        payload[c.key] = Number(n.replace(/[^0-9.-]/g, "")) || 0;
      }
      else if (c.tipo === "date") payload[c.key] = v || null;
      else if (c.tipo === "bool") payload[c.key] = !!v;
      else payload[c.key] = v === "" ? null : v;
    }
    setSaving(true);
    const { error } = editando?.id
      ? await supabase.from(tabela).update(payload).eq("id", editando.id).eq("tenant_id", tenantId)
      : await supabase.from(tabela).insert({ ...payload, tenant_id: tenantId });
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(editando?.id ? "Atualizado." : "Cadastrado.");
    setEditando(null);
    carregar();
  };

  const excluir = async (l: any) => {
    if (!supabase || !tenantId) return;
    if (!(await confirmDialog({ title: `Excluir ${nomeItem}`, description: `Excluir "${l[principal.key]}"? Essa ação não pode ser desfeita.` }))) return;
    const { error } = await supabase.from(tabela).delete().eq("id", l.id).eq("tenant_id", tenantId);
    if (error) return toast.error(friendlyError(error));
    toast.success("Excluído.");
    carregar();
  };

  const mostra = (c: CampoCadastro, v: any) => {
    if (c.tipo === "money") return brl(Number(v) || 0);
    if (c.tipo === "date") return dataBR(v);
    if (c.tipo === "month") return v ? String(v).split("-").reverse().join("/") : "—";
    if (c.tipo === "bool") return v ? "Sim" : "Não";
    return v || "—";
  };

  return (
    <PageContainer
      title={titulo}
      description={descricao}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportar} disabled={filtradas.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar planilha</Button>
          <Button onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" />Nova {nomeItem}</Button>
        </div>
      }
    >
      {resumos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {resumos.map((r) => {
            const v = r.calcula(linhas);
            return <StatCard key={r.label} icon={r.icon} label={r.label} tone={r.tone} value={loading ? "…" : r.moeda && typeof v === "number" ? brl(v) : v} sub={r.sub?.(linhas)} />;
          })}
        </div>
      )}

      <FilterBar>
        {statusOpcoes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {["", ...statusOpcoes].map((s) => (
              <button
                key={s || "todos"}
                type="button"
                onClick={() => setFiltro(s)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${filtro === s ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)] text-white" : "border-[var(--color-border-default)]"}`}
              >
                {s || "Todos"}
              </button>
            ))}
          </div>
        )}
        <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar…" />
      </FilterBar>

      {loading && linhas.length === 0 ? (
        <Card className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </Card>
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={linhas.length === 0 ? `Nenhuma ${nomeItem} cadastrada` : "Nada encontrado"}
          description={linhas.length === 0 ? `Cadastre a primeira ${nomeItem} para começar a acompanhar aqui.` : "Tente limpar a busca ou o filtro."}
          action={linhas.length === 0 ? <Button onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" />Nova {nomeItem}</Button> : undefined}
        />
      ) : (
        <>
          {/* Celular: um cartão por linha */}
          <div className="space-y-2 md:hidden">
            {filtradas.map((l) => {
              const pct = progresso ? Math.min(100, (Number(l[progresso.atual]) / (Number(l[progresso.total]) || 1)) * 100) : 0;
              return (
                <Card key={l.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold">{l[principal.key]}</p>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicao(l)} aria-label="Editar"><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => excluir(l)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    {campoLista.slice(1).map((c) => (
                      <div key={c.key}>
                        <dt className="text-[var(--color-text-muted)]">{c.label}</dt>
                        <dd className="font-medium">{c.key === "status" ? chipStatus(l[c.key]) : mostra(c, l[c.key])}</dd>
                      </div>
                    ))}
                  </dl>
                  {progresso && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-[var(--color-text-muted)]"><span>{progresso.label}</span><span>{pct.toFixed(0)}%</span></div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border-default)]"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )}
                  {enriquecer && <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">{l._auto ? `Automático · ${l._auto}` : "Valor manual"}</p>}
                </Card>
              );
            })}
          </div>

          {/* Computador: tabela */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]/60 text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                  {campoLista.map((c) => <th key={c.key} className={`px-3 py-2.5 font-semibold ${c.tipo === "money" ? "text-right" : ""}`}>{c.label}</th>)}
                  {progresso && <th className="px-3 py-2.5 font-semibold">{progresso.label}</th>}
                  {enriquecer && <th className="px-3 py-2.5 font-semibold">Origem do valor</th>}
                  <th className="w-20 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => {
                  const pct = progresso ? Math.min(100, (Number(l[progresso.atual]) / (Number(l[progresso.total]) || 1)) * 100) : 0;
                  return (
                    <tr key={l.id} className="border-b border-[var(--color-border-default)] transition-colors last:border-0 hover:bg-[var(--color-surface-sunken)]/50">
                      {campoLista.map((c) => (
                        <td key={c.key} className={`px-3 py-2.5 ${c.tipo === "money" ? "text-right font-medium tabular-nums" : ""} ${c === principal ? "font-semibold" : ""}`}>
                          {c.key === "status" ? chipStatus(l[c.key]) : mostra(c, l[c.key])}
                        </td>
                      ))}
                      {progresso && (
                        <td className="min-w-[9rem] px-3 py-2.5">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border-default)]">
                            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-[var(--color-text-muted)]">{pct.toFixed(0)}%</span>
                        </td>
                      )}
                      {enriquecer && (
                        <td className="px-3 py-2.5 text-xs">
                          {l._auto ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-600">Automático · {l._auto}</span> : <span className="text-[var(--color-text-muted)]">Manual</span>}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => abrirEdicao(l)} aria-label="Editar"><Edit2 className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => excluir(l)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {dicaOrigem && <p className="text-xs text-[var(--color-text-muted)]">{dicaOrigem}</p>}
      {rodape}

      <Modal isOpen={!!editando} onClose={() => setEditando(null)} title={editando?.id ? `Editar ${nomeItem}` : `Nova ${nomeItem}`} footer={<ModalFooter onCancel={() => setEditando(null)} submitLabel="Salvar" saving={saving} type="button" onSubmit={salvar} />}>
        <div className="space-y-3">
          {campos.map((c) => (
            <Field key={c.key} label={c.label} required={c.obrigatorio}>
              {c.tipo === "select" ? (
                <select className={selectCls()} value={form[c.key] ?? ""} onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}>
                  {c.opcoes?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : c.tipo === "bool" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form[c.key]} onChange={(e) => setForm({ ...form, [c.key]: e.target.checked })} />
                  Sim
                </label>
              ) : c.tipo === "textarea" ? (
                <textarea className={textareaCls} rows={3} value={form[c.key] ?? ""} onChange={(e) => setForm({ ...form, [c.key]: e.target.value })} />
              ) : (
                <input
                  className={inputCls()}
                  type={c.tipo === "date" ? "date" : c.tipo === "month" ? "month" : "text"}
                  inputMode={c.tipo === "money" ? "decimal" : undefined}
                  placeholder={c.tipo === "money" ? "0,00" : undefined}
                  value={form[c.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
      </Modal>
    </PageContainer>
  );
}
