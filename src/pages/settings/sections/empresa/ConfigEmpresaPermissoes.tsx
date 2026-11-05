import { useEffect, useMemo, useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { ShieldCheck, Pencil, Trash2, CheckCircle2, Users, Eye, UserRound, Sparkles, Info, AlertTriangle } from "lucide-react";
import { useData } from "../../../../contexts/DataContext";
import { toast } from "sonner";
import { PermissaoModal } from "./PermissaoModal";
import { ALL_MODULES } from "./ModulesCombobox";
import { IA_AGENTS } from "../../../../lib/iaAgents";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";
import { supabase } from "../../../../lib/supabase";
import { useAuth } from "../../../../contexts/AuthContext";

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM & Central de Vendas", financeiro: "Financeiro", engajamento: "Engajamento",
  marketing: "Marketing", educacao: "Educação", clinica: "Clínica",
  rh: "RH & Equipe", bi: "BI & Dashboards", produtividade: "Tarefas", catalogo: "Catálogo", dev: "Dev",
  agenda: "Agenda", sdr: "SDR", closer: "Closer", radar: "Radar",
};

const IDS_IA = new Set(IA_AGENTS.map((a) => a.modulo));

const NIVEL_COLORS: Record<string, string> = {
  "Estratégico": "text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/20",
  "Tático": "text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]",
  "Operacional": "text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]",
};

const chip = "text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1";

/** Perfis & Permissões: quadro de cada cargo — que páginas acessa, quais IAs vê, se vê todos os dados ou só os próprios. */
export function ConfigEmpresaPermissoes() {
  const { cargos, updateCargo } = useData() as any;
  const { activeTenantId } = useAuth() as any;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCargo, setEditingCargo] = useState<any | null>(null);

  // Quem usa o sistema, por cargo: cada pessoa conta em TODOS os cargos que tem
  // (colaboradores.cargos; na falta, o cargo do login, users.role).
  const [papeis, setPapeis] = useState<string[][] | null>(null);
  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    let vivo = true;
    Promise.all([
      supabase.from("users").select("id,email,role").eq("tenant_id", activeTenantId).is("deleted_at", null).eq("active", true),
      supabase.from("colaboradores").select("user_id,email,cargos").eq("tenant_id", activeTenantId),
    ]).then(([u, c]: any[]) => {
      if (!vivo) return;
      const colabs: any[] = c?.data || [];
      setPapeis((u?.data || []).map((usr: any) => {
        const colab = colabs.find((x) => (x.user_id === usr.id || (x.email && x.email === usr.email)) && Array.isArray(x.cargos) && x.cargos.length > 0);
        return colab ? (colab.cargos as string[]) : [String(usr.role ?? "").trim()];
      }));
    });
    return () => { vivo = false; };
  }, [activeTenantId]);

  const pessoasPorCargo = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const lista of papeis || []) for (const r of new Set(lista)) mapa.set(r, (mapa.get(r) ?? 0) + 1);
    return mapa;
  }, [papeis]);

  // Perfis em uso que não existem em Cargos: essas pessoas ficam SEM restrição nenhuma.
  const semCargo = useMemo(() => {
    const nomes = new Set((cargos as any[]).map((c) => String(c.nome || "").trim()));
    return [...pessoasPorCargo.entries()].filter(([r]) => r && !nomes.has(r)).sort((a, b) => b[1] - a[1]);
  }, [pessoasPorCargo, cargos]);

  const semPermissao = (cargos as any[]).filter((c) => !Array.isArray(c.modulos) || c.modulos.length === 0).length;

  const handleSave = (cargoId: string, modulos: string[]) => {
    updateCargo(cargoId, { modulos });
    const cargo = (cargos as any[]).find((c) => c.id === cargoId);
    toast.success(`Permissões de "${cargo?.nome}" salvas com sucesso!`);
    setIsModalOpen(false);
  };

  const handleRemovePermissoes = async (cargo: any) => {
    if (!(await confirmDialog({
      title: "Remover restrições",
      description: `Remover as restrições de "${cargo.nome}"? O cargo voltará a ter acesso a todas as páginas e a todas as IAs.`,
    }))) return;
    updateCargo(cargo.id, { modulos: [] });
    toast.success(`Restrições de "${cargo.nome}" removidas — acesso total.`);
  };

  return (
    <div className="max-w-5xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Perfis & Permissões <ShieldCheck className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">Defina, para cada cargo, quais páginas e quais IAs a pessoa vê e se enxerga todos os dados ou só os próprios.</p>
      </div>

      <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-[var(--color-primary-blue)]/8 border border-[var(--color-primary-blue)]/20 text-xs text-[var(--color-primary-blue)]">
        <Info className="w-4 h-4 shrink-0 mt-px" />
        <ul className="space-y-1 list-disc pl-4">
          <li><strong>Cargo sem restrições</strong> tem acesso a todas as páginas e IAs da empresa. Ao marcar módulos, o cargo passa a ver <strong>só</strong> o que foi marcado.</li>
          <li>O que não é liberado some do menu e <strong>também não abre</strong> se a pessoa digitar o endereço da página.</li>
          <li>O escopo dos dados ("só os próprios") é definido em <strong>Cargos</strong>. O administrador do sistema (master) nunca é restringido.</li>
        </ul>
      </div>

      {semCargo.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <div className="space-y-1">
            <p className="font-bold">Pessoas com um perfil que não existe em Cargos — ficam sem nenhuma restrição</p>
            <p>{semCargo.map(([r, n]) => `${r} (${n})`).join(" · ")}</p>
            <p>Cadastre um cargo com exatamente este nome (maiúsculas e minúsculas contam) ou ajuste o perfil da pessoa em Equipe.</p>
          </div>
        </div>
      )}

      {semPermissao > 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">{semPermissao} cargo{semPermissao === 1 ? "" : "s"} sem restrições (acesso total). Use "Configurar" para limitar.</p>
      )}

      {(cargos as any[]).length === 0 ? (
        <Card className="p-12 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-[var(--color-text-primary)] font-bold text-sm">Nenhum cargo cadastrado ainda.</p>
          <p className="text-[var(--color-text-muted)] text-xs">Cadastre os cargos da sua equipe para liberar acessos.</p>
          <Button onClick={() => { window.location.href = "/app/configuracoes/empresa/cargos"; }} variant="outline" className="mt-2 h-9 px-4 text-xs font-bold text-[var(--color-primary-blue)] border-[var(--color-border-default)]">
            Cadastrar primeiro cargo →
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(cargos as any[]).map((cargo) => {
            const nivelClass = NIVEL_COLORS[cargo.nivel as string] ?? NIVEL_COLORS["Operacional"];
            const todos: string[] = Array.isArray(cargo.modulos) ? cargo.modulos : [];
            const modulos = todos.filter((m) => !IDS_IA.has(m));
            const ias = IA_AGENTS.filter((a) => todos.includes(a.modulo));
            const irrestrito = todos.length === 0;
            const pessoas = pessoasPorCargo.get(String(cargo.nome || "").trim()) ?? 0;
            const soProprios = !!cargo.restringir_aos_proprios_dados;
            return (
              <Card key={cargo.id} className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-[var(--color-text-primary)] text-base break-words">{cargo.nome}</span>
                      <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${nivelClass}`}>{cargo.nivel || "Operacional"}</span>
                    </div>
                    {cargo.descricao && <p className="text-xs text-[var(--color-text-muted)] break-words">{cargo.descricao}</p>}
                    <p className="text-xs text-[var(--color-text-faint)] flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {papeis === null ? "…" : pessoas} {pessoas === 1 ? "pessoa" : "pessoas"} com este cargo</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="xs" onClick={() => { setEditingCargo(cargo); setIsModalOpen(true); }} className="h-9 px-3 text-xs font-bold border-[var(--color-border-default)]">
                      <Pencil className="w-3.5 h-3.5 mr-1" /> {irrestrito ? "Configurar" : "Editar"}
                    </Button>
                    {!irrestrito && (
                      <Button variant="ghost" size="xs" onClick={() => handleRemovePermissoes(cargo)} className="h-9 w-9 p-0 text-[var(--color-text-faint)] hover:text-danger hover:bg-danger/10" title="Remover restrições (acesso total)" aria-label="Remover restrições">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <dt className="font-black uppercase tracking-wider text-[var(--color-text-faint)] text-[11px]">Páginas</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {irrestrito || modulos.length === 0 ? (
                        <span className={`${chip} text-emerald-600 bg-emerald-500/10 border-emerald-500/20`}><CheckCircle2 className="w-3 h-3" /> Todas as páginas</span>
                      ) : modulos.map((mod) => (
                        <span key={mod} className={`${chip} bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/20`}>
                          <CheckCircle2 className="w-3 h-3" /> {MODULE_LABELS[mod] || ALL_MODULES.find((m) => m.id === mod)?.label || mod}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div className="space-y-1.5">
                    <dt className="font-black uppercase tracking-wider text-[var(--color-text-faint)] text-[11px]">IAs na Mensageria</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {irrestrito ? (
                        <span className={`${chip} text-emerald-600 bg-emerald-500/10 border-emerald-500/20`}><Sparkles className="w-3 h-3" /> Todas as IAs</span>
                      ) : ias.length === 0 ? (
                        <span className={`${chip} text-[var(--color-text-faint)] bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]`}>Nenhuma IA</span>
                      ) : ias.map((a) => (
                        <span key={a.id} className={`${chip} text-violet-600 bg-violet-500/10 border-violet-500/20`}><Sparkles className="w-3 h-3" /> {a.label}</span>
                      ))}
                    </dd>
                  </div>
                  <div className="space-y-1.5">
                    <dt className="font-black uppercase tracking-wider text-[var(--color-text-faint)] text-[11px]">Dados</dt>
                    <dd>
                      {soProprios ? (
                        <span className={`${chip} text-amber-600 bg-amber-500/10 border-amber-500/20 w-fit`}><UserRound className="w-3 h-3" /> Só os próprios (leads e negócios dele)</span>
                      ) : (
                        <span className={`${chip} text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] w-fit`}><Eye className="w-3 h-3" /> Vê todos os dados</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
      )}

      <PermissaoModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingCargo(null); }}
        editing={editingCargo}
        cargos={cargos}
        onSave={handleSave}
      />
    </div>
  );
}
