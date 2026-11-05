import { useState, useEffect } from "react";
import { Brain } from "lucide-react";
import { toast } from "sonner";
import { Squad } from "../../../../types";
import { useData } from "../../../../contexts/DataContext";
import { SquadEditModal } from "./SquadEditModal";
import { SquadOTECalculator } from "./SquadOTECalculator";
import { SquadsPanel } from "./SquadsPanel";
import { SquadDetailPanel } from "./SquadDetailPanel";

interface SquadsTabContentProps {
  squads: Squad[];
  handleDeleteSquad: (id: string) => void;
  /** Só administrador edita/exclui squads e mexe em membros e clientes. */
  somenteLeitura?: boolean;
  /** OTE, salário-base e comissões: só quem enxerga toda a equipe. */
  podeVerRemuneracao?: boolean;
  oteBaseSalary: string;
  setOteBaseSalary: (val: string) => void;
  oteCommPercentage: string;
  setOteCommPercentage: (val: string) => void;
  oteVendasRealizadas: string;
  setOteVendasRealizadas: (val: string) => void;
  oteAtingimentoMeta: string;
  setOteAtingimentoMeta: (val: string) => void;
  oteColaboradorId: string;
  setOteColaboradorId: (val: string) => void;
  oteNivel: string;
  setOteNivel: (val: string) => void;
  otePeriod: string;
  setOtePeriod: (val: string) => void;
  colaboradores: any[];
  financeCommissionEntries: any[];
  onSaveOteEntry: () => void;
  onDeleteOteEntry: (id: string) => void;
  calcVariable: number;
  calcBonus: number;
  totalOTE: number;
}

export function SquadsTabContent({
  squads, handleDeleteSquad, somenteLeitura = false, podeVerRemuneracao = true,
  oteBaseSalary, setOteBaseSalary, oteCommPercentage, setOteCommPercentage,
  oteVendasRealizadas, setOteVendasRealizadas, oteAtingimentoMeta, setOteAtingimentoMeta,
  oteColaboradorId, setOteColaboradorId, oteNivel, setOteNivel, otePeriod, setOtePeriod,
  colaboradores: colaboradoresForOte, financeCommissionEntries, onSaveOteEntry, onDeleteOteEntry,
  calcVariable, calcBonus, totalOTE,
}: SquadsTabContentProps) {
  // `clienteBase` já vem de useData() escopado ao tenant ativo — um fetch
  // próprio de "clientes" aqui não filtrava por tenant_id e vazava linhas de
  // outros tenants pra contas de parceiro (has_tenant_access verdadeiro pra
  // vários tenants ao mesmo tempo).
  const { colaboradores, updateSquad, clienteBase } = useData();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"membros" | "clientes">("membros");
  const [addMemberName, setAddMemberName] = useState("");
  const [addMemberRole, setAddMemberRole] = useState<"Membro" | "Gestor">("Membro");
  const [addClientId, setAddClientId] = useState("");

  // Edit modal state
  const [editingSquad, setEditingSquad] = useState<Squad | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editDepartamento, setEditDepartamento] = useState("");
  const [editFoco, setEditFoco] = useState("");
  const [editCor, setEditCor] = useState("#6366f1");
  const [editLeader, setEditLeader] = useState("");
  const [editLogo, setEditLogo] = useState("");

  useEffect(() => {
    if (selectedId === null && squads.length > 0) setSelectedId(squads[0].id);
  }, [squads]);

  const selectedSquad = squads.find(s => s.id === selectedId) ?? null;

  const openEdit = (sq: Squad) => {
    setEditingSquad(sq);
    setEditNome(sq.nome);
    setEditDepartamento(sq.departamento || "");
    setEditFoco(sq.focoComercial || "");
    setEditCor(sq.cor || "#6366f1");
    setEditLeader(sq.leader || "");
    setEditLogo(sq.logo || "");
  };

  const handleSaveEdit = () => {
    if (!editingSquad || !editNome.trim()) { toast.error("Nome do squad é obrigatório!"); return; }
    updateSquad(editingSquad.id, { nome: editNome.trim(), departamento: editDepartamento || "Geral", focoComercial: editFoco, cor: editCor, leader: editLeader, logo: editLogo });
    toast.success("Squad atualizado!");
    setEditingSquad(null);
  };

  const handleEditLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 2MB."); return; }
    const reader = new FileReader();
    reader.onload = ev => setEditLogo((ev.target?.result as string) || "");
    reader.readAsDataURL(file);
  };

  const handleAddMember = async () => {
    if (!addMemberName || !selectedSquad) return;
    const membros = [...(selectedSquad.membros ?? [])];
    if (!membros.includes(addMemberName)) membros.push(addMemberName);
    const membrosFuncoes = { ...(selectedSquad.membrosFuncoes ?? {}), [addMemberName]: addMemberRole };
    updateSquad(selectedSquad.id, { membros, membrosFuncoes });
    setAddMemberName("");
    toast.success(`${addMemberName} adicionado ao squad!`);
  };

  const handleRemoveMember = async (nome: string) => {
    if (!selectedSquad) return;
    const membros = selectedSquad.membros.filter(m => m !== nome);
    const membrosFuncoes = { ...(selectedSquad.membrosFuncoes ?? {}) };
    delete membrosFuncoes[nome];
    updateSquad(selectedSquad.id, { membros, membrosFuncoes });
  };

  const handleAddClient = async () => {
    if (!addClientId || !selectedSquad) return;
    const clientes = [...(selectedSquad.clientes ?? [])];
    if (!clientes.includes(addClientId)) clientes.push(addClientId);
    updateSquad(selectedSquad.id, { clientes });
    setAddClientId("");
    toast.success("Cliente atribuído ao squad!");
  };

  const handleRemoveClient = async (clientId: string) => {
    if (!selectedSquad) return;
    const clientes = (selectedSquad.clientes ?? []).filter(c => c !== clientId);
    updateSquad(selectedSquad.id, { clientes });
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-5 bg-blue-600/10 border border-blue-500/20 rounded-3xl">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-blue-400" />
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-wider">Estrutura de Squads sob Medida</h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Organize times por área, atribua membros com funções e controle quais clientes cada squad atende.</p>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex gap-5 min-h-[520px]">
        <div className="w-64 flex-shrink-0 space-y-3 overflow-y-auto pr-1">
          <SquadsPanel
            squads={squads}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEdit={openEdit}
            onDelete={handleDeleteSquad}
            somenteLeitura={somenteLeitura}
          />
        </div>

        <div className="flex-1 bg-[var(--color-surface)]/60 border border-white/10 rounded-2xl overflow-hidden flex flex-col min-h-0">
          <SquadDetailPanel
            selectedSquad={selectedSquad}
            detailTab={detailTab}
            onTabChange={setDetailTab}
            colaboradores={colaboradores}
            clienteBase={clienteBase}
            addMemberName={addMemberName}
            setAddMemberName={setAddMemberName}
            addMemberRole={addMemberRole}
            setAddMemberRole={setAddMemberRole}
            addClientId={addClientId}
            setAddClientId={setAddClientId}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            onAddClient={handleAddClient}
            onRemoveClient={handleRemoveClient}
            somenteLeitura={somenteLeitura}
          />
        </div>
      </div>

      {editingSquad && (
        <SquadEditModal
          editingSquad={editingSquad}
          editNome={editNome} setEditNome={setEditNome}
          editDepartamento={editDepartamento} setEditDepartamento={setEditDepartamento}
          editFoco={editFoco} setEditFoco={setEditFoco}
          editCor={editCor} setEditCor={setEditCor}
          editLeader={editLeader} setEditLeader={setEditLeader}
          editLogo={editLogo} setEditLogo={setEditLogo}
          colaboradores={colaboradores}
          onClose={() => setEditingSquad(null)}
          onSave={handleSaveEdit}
          onLogoUpload={handleEditLogoUpload}
        />
      )}

      {podeVerRemuneracao && <SquadOTECalculator
        oteBaseSalary={oteBaseSalary} setOteBaseSalary={setOteBaseSalary}
        oteCommPercentage={oteCommPercentage} setOteCommPercentage={setOteCommPercentage}
        oteVendasRealizadas={oteVendasRealizadas} setOteVendasRealizadas={setOteVendasRealizadas}
        oteAtingimentoMeta={oteAtingimentoMeta} setOteAtingimentoMeta={setOteAtingimentoMeta}
        oteColaboradorId={oteColaboradorId} setOteColaboradorId={setOteColaboradorId}
        oteNivel={oteNivel} setOteNivel={setOteNivel}
        otePeriod={otePeriod} setOtePeriod={setOtePeriod}
        colaboradores={colaboradoresForOte}
        financeCommissionEntries={financeCommissionEntries}
        onSaveOteEntry={onSaveOteEntry}
        onDeleteOteEntry={onDeleteOteEntry}
        calcVariable={calcVariable} calcBonus={calcBonus} totalOTE={totalOTE}
      />}
    </div>
  );
}
