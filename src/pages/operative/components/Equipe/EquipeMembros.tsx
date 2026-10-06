import React, { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, AlertTriangle, UserCheck, Users, UserX, Network, Briefcase } from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../../../components/ui/kpi-filter-card";
import { motion } from "motion/react";
import { TeamMember } from "../../hooks/useEquipe";

interface TeamMemberCardProps {
  member: TeamMember;
  onEdit: (m: TeamMember) => void;
  onToggleStatus: (id: string, currentStatus: string) => void;
  onDelete: (id: string, name: string) => void;
}

function TeamMemberCard({ member, onEdit, onToggleStatus, onDelete }: TeamMemberCardProps) {
  const isAtivo = member.status === "Ativo";

  return (
    <Card className="p-4 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[var(--color-primary-blue)]/40 transition-all duration-200 group shadow-xs">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-11 h-11 rounded-2xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-xs font-black shrink-0">
          {member.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-primary-blue)] transition-colors truncate">
              {member.name}
            </h3>
            <span className="text-[10px] text-[var(--color-primary-blue)] font-extrabold uppercase bg-[var(--color-primary-blue)]/10 px-2 py-0.5 rounded-md border border-[var(--color-primary-blue)]/20">
              {member.role || "Colaborador"}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-[var(--color-text-muted)]">
            <span>{member.email || "Sem e-mail"}</span>
            {member.phone && (
              <>
                <span>&bull;</span>
                <span>{member.phone}</span>
              </>
            )}
            <span>&bull;</span>
            <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">{member.squad}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--color-border-subtle)] shrink-0">
        {/* Toggle Status Button */}
        <button
          type="button"
          onClick={() => member.id && onToggleStatus(member.id, member.status)}
          title={`Clique para marcar como ${isAtivo ? 'Inativo' : 'Ativo'}`}
          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
            isAtivo
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20"
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 hover:bg-rose-500/20"
          }`}
        >
          {isAtivo ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {member.status || "Ativo"}
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs font-bold gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            onClick={() => onEdit(member)}
            title="Editar Colaborador"
          >
            <Pencil className="w-3.5 h-3.5" /> Editar
          </Button>

          <Button
            variant="danger"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => member.id && onDelete(member.id, member.name)}
            title="Remover Colaborador"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface EquipeMembrosProps {
  filteredTeam: TeamMember[];
  memberSearch: string;
  onMemberSearchChange: (v: string) => void;
  onAdmitir: () => void;
  onEditMember: (m: TeamMember) => void;
  onToggleStatus: (id: string, currentStatus: string) => void;
  onDeleteMember: (id: string) => void;
}

export function EquipeMembros({
  filteredTeam,
  memberSearch,
  onMemberSearchChange,
  onAdmitir,
  onEditMember,
  onToggleStatus,
  onDeleteMember,
}: EquipeMembrosProps) {
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativo" | "inativo">("todos");
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null);

  const [squadFilter, setSquadFilter] = useState("");
  const squadOptions = Array.from(new Set(filteredTeam.map((m) => m.squad).filter(Boolean))).sort();

  const displayedTeam = filteredTeam.filter((m) => {
    if (squadFilter && m.squad !== squadFilter) return false;
    if (statusFilter === "ativo") return m.status === "Ativo";
    if (statusFilter === "inativo") return m.status !== "Ativo";
    return true;
  });

  const confirmDelete = () => {
    if (memberToDelete) {
      onDeleteMember(memberToDelete.id);
      setMemberToDelete(null);
    }
  };

  return (
    <motion.div
      key="members"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tracking-tight">
            Membros da Equipe
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1">
            Gestão de colaboradores, cargos, squads e status de atividade.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onAdmitir}
            className="gap-2 h-10 px-5 font-bold text-xs uppercase tracking-wider shadow-xs"
          >
            <Plus className="w-4 h-4" /> Novo Colaborador
          </Button>
        </div>
      </div>

      <KpiFilterCard
        id="opsEquipeMembros"
        kpis={[
          { label: "Colaboradores", value: displayedTeam.length, icon: Users, tone: "primary" },
          { label: "Ativos", value: displayedTeam.filter((m) => m.status === "Ativo").length, icon: UserCheck, tone: "success" },
          { label: "Inativos", value: displayedTeam.filter((m) => m.status !== "Ativo").length, icon: UserX, tone: "neutral" },
          { label: "Squads", value: new Set(displayedTeam.map((m) => m.squad).filter(Boolean)).size, icon: Network, tone: "info" },
        ]}
        activeCount={(memberSearch.trim() ? 1 : 0) + (statusFilter !== "todos" ? 1 : 0) + (squadFilter ? 1 : 0)}
        onClear={() => { onMemberSearchChange(""); setStatusFilter("todos"); setSquadFilter(""); }}
      >
        <FilterBar>
          <FilterSearch value={memberSearch} onChange={onMemberSearchChange} placeholder="Buscar por nome, cargo ou squad..." />
          <FilterSelect icon={Briefcase} value={squadFilter} onChange={setSquadFilter} options={squadOptions} allLabel="Todos os squads" />
          <FilterChips
            value={statusFilter === "todos" ? "" : statusFilter}
            onChange={(v) => setStatusFilter((v || "todos") as "todos" | "ativo" | "inativo")}
            options={[{ value: "ativo", label: "Ativos" }, { value: "inativo", label: "Inativos" }]}
          />
        </FilterBar>
      </KpiFilterCard>

      {/* Delete Confirmation Banner */}
      {memberToDelete && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-rose-500 text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4" /> Remover Colaborador "{memberToDelete.name}"?
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            O colaborador será desvinculado dos squads e das atividades atuais. Essa ação pode ser desfeita cadastrando-o novamente.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setMemberToDelete(null)}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDelete}>
              Confirmar Remoção
            </Button>
          </div>
        </div>
      )}

      {/* Members Grid */}
      <div className="grid grid-cols-1 gap-3">
        {displayedTeam.map((member) => (
          <TeamMemberCard
            key={member.id ?? `${member.email}-${member.name}`}
            member={member}
            onEdit={onEditMember}
            onToggleStatus={onToggleStatus}
            onDelete={(id, name) => setMemberToDelete({ id, name })}
          />
        ))}

        {displayedTeam.length === 0 && (
          <div className="py-20 text-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-3xl p-8 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center mx-auto text-[var(--color-text-muted)]">
              <UserCheck className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
              Nenhum colaborador encontrado
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
              Nenhum membro corresponde aos filtros de busca ou status selecionados.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
