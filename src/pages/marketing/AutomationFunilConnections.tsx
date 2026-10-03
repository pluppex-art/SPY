import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ArrowRight, Workflow, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useData } from "../../contexts/DataContext";
import { useOS } from "../os/hooks/useOS";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

interface ConnectionRow {
  id: string;
  nome: string;
  ativo: boolean;
  gatilho_tipo: "funil_etapa" | "produto_categoria";
  gatilho_funil_id: string | null;
  gatilho_etapa_idx: number | null;
  gatilho_categoria: string | null;
  os_departamento_id: string;
}

function funilStageNames(funil: any): string[] {
  if (Array.isArray(funil?.etapasConfig)) return funil.etapasConfig.map((e: any) => e.nome);
  return Array.isArray(funil?.etapas) ? funil.etapas : [];
}

/** Conexões entre funis do CRM (ou categoria de produto) e departamentos da
 * Operação (OS) — o próprio tenant monta: "quando X acontece, cria uma OS em
 * tal departamento", sem precisar de ninguém mexendo em banco. Lido/escrito
 * direto via Supabase (RLS por tenant, mesma tabela automation_connections) —
 * os gatilhos de verdade rodam no banco (ver trg_automacao_lead_etapa /
 * trg_automacao_proposta_categoria), então uma regra salva aqui já vale pra
 * qualquer caminho que mude o lead/proposta, não só esta tela aberta. */
export function AutomationFunilConnections() {
  const { activeTenantId } = useAuth();
  const { funis, products } = useData();
  const { departamentos: osDepartamentos } = useOS();

  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const comercialFunis = useMemo(() => (funis as any[]).filter((f) => f.tipo === "comercial" && f.ativo !== false), [funis]);
  const categorias = useMemo(
    () => [...new Set((products as any[]).map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"funil_etapa" | "produto_categoria">("funil_etapa");
  const [funilId, setFunilId] = useState("");
  const [etapaIdx, setEtapaIdx] = useState(0);
  const [categoria, setCategoria] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");

  const fetchRows = async () => {
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await supabase.from("automation_connections").select("*").order("created_at", { ascending: false });
    if (!error) setRows((data as ConnectionRow[]) || []);
    setLoading(false);
  };
  useEffect(() => { fetchRows(); }, []);

  const etapasDoFunilSelecionado = funilStageNames(comercialFunis.find((f) => f.id === funilId));

  const resetForm = () => {
    setNome(""); setTipo("funil_etapa"); setFunilId(""); setEtapaIdx(0); setCategoria(""); setDepartamentoId("");
  };

  const handleCriar = async () => {
    if (!supabase || !activeTenantId) return;
    if (!nome.trim()) { toast.error("Dê um nome pra essa conexão."); return; }
    if (!departamentoId) { toast.error("Escolha o departamento da Operação que recebe a OS."); return; }
    if (tipo === "funil_etapa" && !funilId) { toast.error("Escolha o funil de origem."); return; }
    if (tipo === "produto_categoria" && !categoria) { toast.error("Escolha a categoria de produto."); return; }

    setSaving(true);
    const { error } = await supabase.from("automation_connections").insert({
      tenant_id: activeTenantId,
      nome: nome.trim(),
      ativo: true,
      gatilho_tipo: tipo,
      gatilho_funil_id: tipo === "funil_etapa" ? funilId : null,
      gatilho_etapa_idx: tipo === "funil_etapa" ? etapaIdx : null,
      gatilho_categoria: tipo === "produto_categoria" ? categoria : null,
      os_departamento_id: departamentoId,
    });
    setSaving(false);
    if (error) { toast.error("Não foi possível criar a conexão."); return; }
    toast.success("Conexão criada — já vale a partir de agora.");
    resetForm();
    fetchRows();
  };

  const handleToggle = async (row: ConnectionRow) => {
    if (!supabase) return;
    const { error } = await supabase.from("automation_connections").update({ ativo: !row.ativo }).eq("id", row.id);
    if (error) { toast.error("Não foi possível atualizar."); return; }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ativo: !r.ativo } : r)));
  };

  const handleDelete = async (row: ConnectionRow) => {
    if (!(await confirmDialog({ title: "Excluir conexão", description: `Excluir a conexão "${row.nome}"? Essa ação não pode ser desfeita.` }))) return;
    if (!supabase) return;
    const { error } = await supabase.from("automation_connections").delete().eq("id", row.id);
    if (error) { toast.error("Não foi possível excluir."); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success("Conexão removida.");
  };

  const describe = (row: ConnectionRow) => {
    const dep = (osDepartamentos as any[]).find((d) => d.id === row.os_departamento_id);
    if (row.gatilho_tipo === "funil_etapa") {
      const funil = comercialFunis.find((f) => f.id === row.gatilho_funil_id);
      const etapaNome = funil ? funilStageNames(funil)[row.gatilho_etapa_idx ?? -1] : null;
      return {
        origem: funil ? `${funil.nome} — etapa "${etapaNome || row.gatilho_etapa_idx}"` : "Funil removido",
        destino: dep?.nome || "Departamento removido",
      };
    }
    return {
      origem: `Proposta aceita com produto da categoria "${row.gatilho_categoria}"`,
      destino: dep?.nome || "Departamento removido",
    };
  };

  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <Plus className="w-4 h-4 text-[var(--color-primary-blue)]" /> Nova conexão
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder='Nome (ex.: "Tráfego vendido vira OS")'
            className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none sm:col-span-2"
          />

          <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] sm:col-span-2 w-fit">
            {([["funil_etapa", "Etapa de funil"], ["produto_categoria", "Categoria de produto"]] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setTipo(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer transition-all ${tipo === v ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
                {label}
              </button>
            ))}
          </div>

          {tipo === "funil_etapa" ? (
            <>
              <select value={funilId} onChange={(e) => { setFunilId(e.target.value); setEtapaIdx(0); }}
                className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none">
                <option value="">Funil do CRM…</option>
                {comercialFunis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
              <select value={etapaIdx} onChange={(e) => setEtapaIdx(Number(e.target.value))} disabled={!funilId}
                className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none disabled:opacity-50">
                {etapasDoFunilSelecionado.map((nomeEtapa, idx) => <option key={idx} value={idx}>{nomeEtapa}</option>)}
              </select>
            </>
          ) : (
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
              className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none sm:col-span-2">
              <option value="">Categoria de produto…</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          <select value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)}
            className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none sm:col-span-2">
            <option value="">→ Cria OS no departamento…</option>
            {(osDepartamentos as any[]).filter((d) => d.ativo).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
        <Button onClick={handleCriar} loading={saving} className="text-xs font-bold">Criar conexão</Button>
      </Card>

      <Card className="p-5 space-y-3 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <Workflow className="w-4 h-4 text-[var(--color-primary-blue)]" /> Conexões configuradas
        </h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-faint)]" /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Workflow} title="Nenhuma conexão ainda" description='Monte uma acima — ex.: "quando um lead entra em Negociação, cria uma OS em Dev".' className="py-6" />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const { origem, destino } = describe(row);
              return (
                <div key={row.id} className="flex items-center gap-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{row.nome}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="truncate">{origem}</span>
                      <ArrowRight className="w-3 h-3 text-[var(--color-primary-blue)] shrink-0" />
                      <span className="font-bold text-[var(--color-primary-blue)]">{destino}</span>
                    </p>
                  </div>
                  <button onClick={() => handleToggle(row)} className="shrink-0 cursor-pointer" title={row.ativo ? "Ativa — clique pra pausar" : "Pausada — clique pra ativar"}>
                    {row.ativo ? <ToggleRight className="w-5 h-5 text-success" /> : <ToggleLeft className="w-5 h-5 text-[var(--color-text-faint)]" />}
                  </button>
                  <button onClick={() => handleDelete(row)} className="shrink-0 text-[var(--color-text-faint)] hover:text-danger p-1 transition-colors cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
