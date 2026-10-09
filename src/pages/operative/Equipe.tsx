import { useState } from "react";
import { NovoMembroModal } from "../../components/ui/modals/hr/NovoMembroModal";
import { EditarMembroModal } from "../../components/ui/modals/hr/EditarMembroModal";
import { useEquipe, TeamMember } from "./hooks/useEquipe";
import { SquadsTab } from "./components/SquadsTab";
import { LogsTab } from "./components/LogsTab";
import { toast } from "sonner";
import { EquipeSidebar } from "./components/Equipe/EquipeSidebar";
import { EquipeOverview } from "./components/Equipe/EquipeOverview";
import { EquipePerformance } from "./components/Equipe/EquipePerformance";
import { EquipeMembros } from "./components/Equipe/EquipeMembros";

export default function Equipe() {
  const {
    activeTab, setActiveTab,
    memberSearch, setMemberSearch,
    isModalOpen, setIsModalOpen,
    newSquadExpanded, setNewSquadExpanded,
    newSquadData, setNewSquadData,
    expandedSquads, squads, team, logs,
    toggleSquad, filter, setFilter,
    currentPage, setCurrentPage,
    filteredLogs, filteredTeam, paginatedLogs, totalPages,
    moveMember, addMember, editMember, removeMember, toggleMemberStatus, addSquad,
  } = useEquipe();

  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const handleSaveMember = async (data: any) => {
    await addMember({
      name: data.nome,
      role: data.cargo,
      email: data.email,
      phone: data.phone || "",
      deals: 0,
      revenue: "R$ 0",
      status: "Ativo",
      squad: data.squad || "Sem squad"
    });
    toast.success("Membro adicionado à equipe com sucesso!");
    setIsModalOpen(false);
  };

  const handleEditMember = async (id: string, updates: Partial<TeamMember>) => {
    await editMember(id, updates);
    toast.success("Perfil atualizado com sucesso!");
  };

  return (
    <div className="flex flex-col lg:flex-row h-full -m-4 lg:-m-8">
      <EquipeSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        newSquadExpanded={newSquadExpanded}
        onToggleNewSquad={() => setNewSquadExpanded(!newSquadExpanded)}
        newSquadData={newSquadData}
        onNewSquadDataChange={setNewSquadData}
        team={team}
        onAddSquad={addSquad}
        onNewSquadDone={() => { setNewSquadData({ name: "", leader: "" }); setNewSquadExpanded(false); }}
      />

      <main className="flex-1 min-w-0 p-6 sm:p-10 pb-24 overflow-y-auto custom-scrollbar">
        {activeTab === "visao-geral" && (
          <EquipeOverview
            team={team} squads={squads} logs={logs}
            onAdmitir={() => setIsModalOpen(true)}
            onGoLogs={() => setActiveTab("logs")}
            onEditMember={setEditingMember}
            onToggleStatus={toggleMemberStatus}
            onDeleteMember={removeMember}
          />
        )}
        {activeTab === "performance" && (
          <EquipePerformance team={team} squads={squads} />
        )}
        {activeTab === "squads" && (
          <SquadsTab squads={squads} team={team} expandedSquads={expandedSquads} toggleSquad={toggleSquad} moveMember={moveMember} />
        )}
        {activeTab === "membros" && (
          <EquipeMembros
            filteredTeam={filteredTeam}
            memberSearch={memberSearch}
            onMemberSearchChange={setMemberSearch}
            onAdmitir={() => setIsModalOpen(true)}
            onEditMember={setEditingMember}
            onToggleStatus={toggleMemberStatus}
            onDeleteMember={removeMember}
          />
        )}
        {activeTab === "logs" && (
          <LogsTab paginatedLogs={paginatedLogs} filteredLogs={filteredLogs} filter={filter} setFilter={setFilter} currentPage={currentPage} setCurrentPage={setCurrentPage} totalPages={totalPages} />
        )}
      </main>

      <NovoMembroModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveMember} initialValue={null} showAccess={false} />
      <EditarMembroModal isOpen={editingMember !== null} onClose={() => setEditingMember(null)} onSave={handleEditMember} member={editingMember} squads={squads} />
    </div>
  );
}
