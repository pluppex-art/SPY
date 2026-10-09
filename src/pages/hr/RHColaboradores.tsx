import { useState, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { UserPlus, PlusCircle, Users } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useData } from "../../contexts/DataContext";
import { useRHColaboradores } from "./hooks/useRHColaboradores";
import { SquadsTabContent } from "./components/Squads/SquadsTabContent";
import { NovoMembroModal } from "../../components/ui/modals/hr/NovoMembroModal";
import { EditarColabModal } from "../../components/ui/modals/hr/EditarColabModal";
import { supabase, createUserWithProfile, setUserPartnerTenantAccess, requestPasswordReset } from "../../lib/supabase";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useAuth } from "../../contexts/AuthContext";
import { MembrosSection } from "./components/RHColaboradores/MembrosSection";
import { NewSquadModal } from "./components/RHColaboradores/NewSquadModal";
import { ColaboradorPerfilModal } from "./components/RHColaboradores/ColaboradorPerfilModal";

export default function RHColaboradores() {
  const {
    squads, colaboradores, activeTab, setActiveTab,
    search, setSearch, isNewSquadOpen, setIsNewSquadOpen,
    newSquadName, setNewSquadName, newSquadDepartamento, setNewSquadDepartamento,
    newSquadFoco, setNewSquadFoco, newSquadCor, setNewSquadCor,
    newSquadLogo, setNewSquadLogo, newSquadLeader, setNewSquadLeader,
    oteBaseSalary, setOteBaseSalary, oteCommPercentage, setOteCommPercentage,
    oteVendasRealizadas, setOteVendasRealizadas, oteAtingimentoMeta, setOteAtingimentoMeta,
    oteColaboradorId, setOteColaboradorId, oteNivel, setOteNivel, otePeriod, setOtePeriod,
    financeCommissionEntries, handleSaveOteEntry, handleDeleteOteEntry,
    handleCreateSquad, handleDeleteSquad, filtered,
    calcVariable, calcBonus, totalOTE,
  } = useRHColaboradores();

  const { addColaborador, updateColaborador, deleteColaborador, empresaFiliais } = useData();
  const filiaisOptions = empresaFiliais.map((f: any) => ({ id: f.id, nome: f.nome }));
  const { user, activeTenantId, activeTenantName } = useAuth();
  const [isMembroModalOpen, setIsMembroModalOpen] = useState(false);
  const [perfilColab, setPerfilColab] = useState<any | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingColab, setEditingColab] = useState<any | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menus = document.querySelectorAll("[data-menu-ref]");
      let inside = false;
      menus.forEach(m => { if (m.contains(target)) inside = true; });
      if (!inside) setMenuOpenId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSaveMembro = async (data: any) => {
    // Só master/admin do tenant pode criar contas reais de login — checagem de UI
    // (o botão "Novo Registro" já fica escondido pra quem não tem essa permissão),
    // repetida aqui como defesa em profundidade caso o modal seja aberto por outro caminho.
    if (!(user?.isMaster || user?.isTenantAdmin)) {
      toast.error("Você não tem permissão para criar novos usuários.");
      return;
    }

    const dataAdmissao = new Date().toLocaleDateString("pt-BR");
    // Sempre o tenant ATIVO — se um master estiver "dentro" de outro cliente, o novo
    // colaborador (e seu login) precisa ser criado nesse cliente, não no do master.
    let tenantId = activeTenantId || user?.tenantId || "tenant-default";
    let userId: string | null = null;

    if (supabase) {
      try {
        const { data: tenantRow } = await supabase.from("tenants").select("id").eq("name", activeTenantName || user?.tenantName || "").maybeSingle();
        if (tenantRow?.id) tenantId = tenantRow.id;

        const created = await createUserWithProfile({
          email: data.email, password: data.senha, name: data.nome,
          tenantId, role: data.cargo, isMaster: false,
        });
        if (created?.success) {
          userId = created.userId ?? null;
        } else if (created) {
          toast.error(`Não foi possível criar o acesso de ${data.nome}: ${created.error || "erro desconhecido."}`);
          return;
        }

        // Só chega aqui marcado se o modal mostrou a opção (canGrantTenantAccess=master) —
        // escrever em partners/tenant_partners é restrito a master via RLS mesmo, então só
        // funciona quando quem está criando já é master.
        if (userId && data.permiteTrocarEmpresa) {
          const granted = await setUserPartnerTenantAccess(userId, tenantId, activeTenantName || user?.tenantName || "Empresa", true);
          if (!granted.success) {
            toast.error(`Usuário criado, mas não foi possível liberar troca de empresa: ${granted.error}`);
          }
        }
      } catch (err) {
        console.warn("[RH] Auth notice:", err);
      }
    }

    addColaborador({
      id: Date.now().toString(),
      nome: data.nome,
      email: data.email,
      phone: data.phone || "",
      cargo: data.cargo,
      departamento: data.departamento,
      squad: data.squad || "",
      status: "Ativo",
      dataAdmissao,
      desempenho: 100,
      tenant_id: tenantId,
      user_id: userId,
      filial_id: data.filialId || null,
    });
    toast.success(`${data.nome} adicionado à equipe com sucesso!`);
    if (userId && data.modoAcesso === "convite") {
      const sent = await requestPasswordReset(data.email);
      if (sent.success) toast.info(`Convite enviado para ${data.email}`, { description: "O colaborador define a própria senha pelo link recebido por e-mail." });
      else toast.error(`Colaborador criado, mas o convite não foi enviado: ${sent.error}`);
    } else if (userId) {
      toast.info(`Senha de acesso de ${data.nome}: ${data.senha}`, {
        description: "Compartilhe com o colaborador por um canal seguro — essa senha não fica salva em nenhum outro lugar.",
        duration: 20000,
      });
    }
    setIsMembroModalOpen(false);
  };

  const handleSaveEditColab = async (id: string, updates: any, tenantAccess?: { userId: string; enabled: boolean }) => {
    // Cargo "Administrador" dá acesso de administrador da empresa (cadastrar cargos e permissões):
    // acompanha a troca de cargo no login vinculado. Só mexe quando o cargo cruza essa fronteira,
    // para nunca rebaixar quem já era administrador por outro motivo.
    const anterior = (colaboradores as any[]).find((c) => c.id === id);
    const ehAdm = (c?: string) => (c || "").trim().toLowerCase() === "administrador";
    if (supabase && anterior?.user_id && updates?.cargo !== undefined && ehAdm(updates.cargo) !== ehAdm(anterior.cargo)) {
      const { error: roleError } = await supabase.from("users")
        .update({ role: updates.cargo || "Colaborador", is_tenant_admin: ehAdm(updates.cargo) })
        .eq("id", anterior.user_id);
      if (roleError) toast.error(`Cargo salvo, mas não foi possível atualizar o acesso de administrador: ${roleError.message}`);
    }
    updateColaborador(id, updates);
    toast.success(`${updates.nome} atualizado com sucesso!`);
    if (tenantAccess) {
      const result = await setUserPartnerTenantAccess(
        tenantAccess.userId,
        activeTenantId || user?.tenantId || "",
        activeTenantName || user?.tenantName || "Empresa",
        tenantAccess.enabled
      );
      if (!result.success) {
        toast.error(`Não foi possível ${tenantAccess.enabled ? "liberar" : "revogar"} a troca de empresa: ${result.error}`);
      } else {
        toast.success(tenantAccess.enabled ? "Troca de empresa liberada para este usuário." : "Troca de empresa revogada.");
      }
    }
  };

  const handleChangeStatus = (colab: any, novoStatus: string) => {
    updateColaborador(colab.id, { status: novoStatus });
    setMenuOpenId(null);
    toast.success(`Status de ${colab.nome} alterado para ${novoStatus}.`);
  };

  const handleDesligar = async (colab: any) => {
    setMenuOpenId(null);
    if (!(await confirmDialog({
      title: "Desligar colaborador",
      description: `Remover ${colab.nome} da equipe? O registro será excluído do sistema e essa ação não pode ser desfeita.`,
      confirmText: "Desligar",
    }))) return;
    const ok = await deleteColaborador(colab.id);
    if (ok) toast.success(`${colab.nome} foi removido da equipe.`);
  };

  return (
    <PageContainer
      title="Equipe & Squads"
      description="Gerencie colaboradores, organize squads por área e acompanhe metas e desempenho da equipe."
      actions={
        <div className="flex items-center gap-2">
          {activeTab === "squads" ? (
            <Button onClick={() => setIsNewSquadOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
              <PlusCircle className="w-3.5 h-3.5" /> Criar Squad
            </Button>
          ) : (user?.isMaster || user?.isTenantAdmin) ? (
            <Button onClick={() => setIsMembroModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
              <UserPlus className="w-3.5 h-3.5" /> Novo Registro
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6 max-w-[1700px] mx-auto pb-12">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-1">
          {[
            { key: "membros", label: `Membros da Equipe (${filtered.length})` },
            { key: "squads", label: `Squads da Empresa (${squads.length})` },
          ].map(({ key, label }) => (
            <button 
              key={key} 
              type="button"
              onClick={() => setActiveTab(key as any)}
              className={`px-4 py-2.5 text-xs font-bold transition-all relative rounded-t-[var(--radius-control)] cursor-pointer border-b-2 ${
                activeTab === key 
                  ? "text-[var(--color-primary-blue)] border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" 
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "membros" ? (
          <MembrosSection
            filtered={filtered} search={search} onSearchChange={setSearch}
            menuOpenId={menuOpenId} setMenuOpenId={setMenuOpenId}
            onVerPerfil={setPerfilColab} onEditColab={setEditingColab}
            onChangeStatus={handleChangeStatus} onDesligar={handleDesligar}
          />
        ) : (
          <SquadsTabContent
            squads={squads} handleDeleteSquad={handleDeleteSquad}
            oteBaseSalary={oteBaseSalary} setOteBaseSalary={setOteBaseSalary}
            oteCommPercentage={oteCommPercentage} setOteCommPercentage={setOteCommPercentage}
            oteVendasRealizadas={oteVendasRealizadas} setOteVendasRealizadas={setOteVendasRealizadas}
            oteAtingimentoMeta={oteAtingimentoMeta} setOteAtingimentoMeta={setOteAtingimentoMeta}
            oteColaboradorId={oteColaboradorId} setOteColaboradorId={setOteColaboradorId}
            oteNivel={oteNivel} setOteNivel={setOteNivel}
            otePeriod={otePeriod} setOtePeriod={setOtePeriod}
            colaboradores={colaboradores}
            financeCommissionEntries={financeCommissionEntries}
            onSaveOteEntry={handleSaveOteEntry}
            onDeleteOteEntry={handleDeleteOteEntry}
            calcVariable={calcVariable} calcBonus={calcBonus} totalOTE={totalOTE}
          />
        )}
      </div>

      {isNewSquadOpen && (
        <NewSquadModal
          colaboradores={colaboradores}
          newSquadName={newSquadName} setNewSquadName={setNewSquadName}
          newSquadDepartamento={newSquadDepartamento} setNewSquadDepartamento={setNewSquadDepartamento}
          newSquadFoco={newSquadFoco} setNewSquadFoco={setNewSquadFoco}
          newSquadCor={newSquadCor} setNewSquadCor={setNewSquadCor}
          newSquadLogo={newSquadLogo} setNewSquadLogo={setNewSquadLogo}
          newSquadLeader={newSquadLeader} setNewSquadLeader={setNewSquadLeader}
          onSubmit={handleCreateSquad}
          onClose={() => setIsNewSquadOpen(false)}
        />
      )}

      <NovoMembroModal
        isOpen={isMembroModalOpen} onClose={() => setIsMembroModalOpen(false)} onSave={handleSaveMembro}
        canGrantTenantAccess={!!user?.isMaster} filiais={filiaisOptions}
      />
      <EditarColabModal
        colab={editingColab} onClose={() => setEditingColab(null)}
        onSave={handleSaveEditColab}
        canGrantTenantAccess={!!user?.isMaster} filiais={filiaisOptions}
      />
      <ColaboradorPerfilModal colab={perfilColab} onClose={() => setPerfilColab(null)} />
    </PageContainer>
  );
}
