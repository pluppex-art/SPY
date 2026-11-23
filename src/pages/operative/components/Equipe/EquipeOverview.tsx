import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Plus, LayoutDashboard, Users, Layers, Pencil, Trash2, CheckCircle2, XCircle, AlertTriangle, UserCheck } from "lucide-react";
import { motion } from "motion/react";
import { TeamMember, Squad } from "../../hooks/useEquipe";

import { HelpTip } from "../../../../components/ui/help-tip";
interface EquipeOverviewProps {
  team: TeamMember[];
  squads: Squad[];
  logs: Array<{ name: string; from: string; to: string; date: string }>;
  onAdmitir: () => void;
  onGoLogs: () => void;
  onEditMember: (m: TeamMember) => void;
  onToggleStatus: (id: string, currentStatus: string) => void;
  onDeleteMember: (id: string) => void;
}

export function EquipeOverview({ team, squads, logs, onAdmitir, onGoLogs, onEditMember, onToggleStatus, onDeleteMember }: EquipeOverviewProps) {
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null);

  const ativos = team.filter(m => m.status === "Ativo").length;
  const inativos = team.filter(m => m.status !== "Ativo").length;

  const stats = [
    { label: "Total de Membros", val: team.length, color: "text-blue-500", icon: Users },
    { label: "Membros Ativos", val: ativos, color: "text-emerald-500", icon: CheckCircle2 },
    { label: "Inativos / Afastados", val: inativos, color: "text-amber-500", icon: XCircle },
    { label: "Squads Operantes", val: squads.length, color: "text-cyan-500", icon: Layers },
  ];

  const confirmDelete = () => {
    if (memberToDelete) {
      onDeleteMember(memberToDelete.id);
      setMemberToDelete(null);
    }
  };

  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="p-2 w-fit rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
            <LayoutDashboard className="w-5 h-5 text-blue-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-[var(--color-text-primary)]">Equipe & Estrutura <HelpTip label="Sobre Equipe & Estrutura">Gerencie colaboradores e squads e acompanhe as mudanças de hierarquia da equipe.</HelpTip></h1>
        </div>
        <Button onClick={onAdmitir} className="gap-2 h-12 px-6 font-bold rounded-2xl shrink-0">
          <Plus className="w-5 h-5" /> Admitir Membro
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="p-4 sm:p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] transition-all">
            <stat.icon className={`w-5 h-5 ${stat.color} mb-3`} />
            <div className="text-2xl font-black text-[var(--color-text-primary)] mb-1">{stat.val}</div>
            <div className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{stat.label}</div>
          </Card>
        ))}
      </div>

      {/* Members List with Actions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Colaboradores da Equipe</h2>
          <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-3 py-1 rounded-full">
            {team.length} membros
          </span>
        </div>

        {/* Delete confirmation */}
        {memberToDelete && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-rose-500 text-xs font-bold uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4" /> Remover "{memberToDelete.name}"?
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              O colaborador será removido da equipe. Essa ação pode ser desfeita cadastrando-o novamente.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setMemberToDelete(null)}>Cancelar</Button>
              <Button variant="danger" size="sm" onClick={confirmDelete}>Confirmar Remoção</Button>
            </div>
          </div>
        )}

        {team.length === 0 ? (
          <Card className="p-10 text-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center mx-auto text-[var(--color-text-muted)]">
              <UserCheck className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Nenhum colaborador cadastrado</h3>
            <p className="text-xs text-[var(--color-text-muted)]">Clique em "Admitir Membro" para adicionar o primeiro colaborador.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {team.map((member) => {
              const isAtivo = member.status === "Ativo";
              return (
                <Card
                  key={member.id ?? `${member.email}-${member.name}`}
                  className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[var(--color-primary-blue)]/40 transition-all group shadow-xs"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-xs font-black shrink-0">
                      {member.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-primary-blue)] transition-colors">
                          {member.name}
                        </span>
                        <span className="text-[10px] font-extrabold text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 px-2 py-0.5 rounded-md border border-[var(--color-primary-blue)]/20">
                          {member.role || "Colaborador"}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {member.email || "Sem e-mail"}{member.squad && member.squad !== "Sem squad" ? ` · ${member.squad}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Toggle Status */}
                    <button
                      type="button"
                      onClick={() => member.id && onToggleStatus(member.id, member.status)}
                      title={`Clique para marcar como ${isAtivo ? "Inativo" : "Ativo"}`}
                      className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                        isAtivo
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 hover:bg-rose-500/20"
                      }`}
                    >
                      {isAtivo ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {member.status || "Ativo"}
                    </button>

                    {/* Edit */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs font-bold gap-1"
                      onClick={() => onEditMember(member)}
                      title="Editar Colaborador"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>

                    {/* Delete */}
                    <Button
                      variant="danger"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => member.id && setMemberToDelete({ id: member.id, name: member.name })}
                      title="Remover Colaborador"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Squads density */}
      {squads.length > 0 && (
        <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Distribuição por Squad</h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              Média: {squads.length > 0 ? (team.length / squads.length).toFixed(1) : "0"} / squad
            </span>
          </div>
          <div className="grid gap-4">
            {squads.map((s) => (
              <div key={s.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--color-text-muted)]">{s.name}</span>
                  <span className="font-black text-[var(--color-text-primary)]">
                    {team.filter((m) => m.squad === s.name).length} membro(s)
                  </span>
                </div>
                <div className="h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${team.length > 0 ? (team.filter((m) => m.squad === s.name).length / team.length) * 100 : 0}%` }}
                    className="h-full bg-[var(--color-primary-blue)] rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </motion.div>
  );
}
