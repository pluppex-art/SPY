import { AbasPagina } from "../../components/ui/abas-pagina";
import { useState, useEffect, useRef } from "react";
import { friendlyError } from "../../lib/friendlyError";
import { PageContainer } from "../../components/PageContainer";
import { UserPlus, PlusCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useData } from "../../contexts/DataContext";
import { useRHColaboradores } from "./hooks/useRHColaboradores";
import { SquadsTabContent } from "./components/Squads/SquadsTabContent";
import { GruposInternos } from "./GruposInternos";
import { NovoMembroModal } from "../../components/ui/modals/hr/NovoMembroModal";
import { EditarColabModal } from "../../components/ui/modals/hr/EditarColabModal";
import { apiFetch } from "../../lib/apiClient";
import { supabase, createUserWithProfile, setUserPartnerTenantAccess, requestPasswordReset } from "../../lib/supabase";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useAuth } from "../../contexts/AuthContext";
import { MembrosSection } from "./components/RHColaboradores/MembrosSection";
import { Modal } from "../../components/ui/modal";
import { AgentesSecretosPainel } from "../../components/AgentesSecretosPainel";
import { AgenteSecretoQrModal } from "../../components/AgenteSecretoQrModal";
import { AGENTE_SECRETO_STATUS_EVENT } from "../../components/AgenteSecretoConexao";
import { alternarAgente } from "../../components/alternarAgente";
import { NewSquadModal } from "./components/RHColaboradores/NewSquadModal";
import { ColaboradorPerfilModal } from "./components/RHColaboradores/ColaboradorPerfilModal";
import { colaboradoresVisiveis, squadsVisiveis, escopoEquipe, ROTULO_ESCOPO } from "../../lib/escopoEquipe";

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

  const { addColaborador, updateColaborador, deleteColaborador, empresaFiliais, cargos } = useData() as any;
  const filiaisOptions = empresaFiliais.map((f: any) => ({ id: f.id, nome: f.nome }));
  const { user, activeTenantId, activeTenantName, isModuleEnabled } = useAuth();
  // "Grupos de WhatsApp" é o módulo Agente Secreto Interno, vendido à parte: a aba só existe para quem contratou.
  const temGrupos = isModuleEnabled("agente_interno");

  // A página é aberta a todos; a lista depende do nível (Estratégico: todos · Tático: departamento e squad · demais: o próprio perfil e o squad).
  const podeGerenciar = !!(user?.isMaster || user?.isTenantAdmin);
  const escopo = escopoEquipe(user, cargos || []);
  const idsVisiveis = new Set(colaboradoresVisiveis(user, cargos || [], colaboradores as any[]).map((c: any) => c.id));
  const filteredVisiveis = (filtered as any[]).filter((c) => idsVisiveis.has(c.id));
  const squadsVis = squadsVisiveis(user, cargos || [], colaboradores as any[], squads as any[]);
  const colaboradoresVis = (colaboradores as any[]).filter((c) => idsVisiveis.has(c.id));
  const [isMembroModalOpen, setIsMembroModalOpen] = useState(false);
  const [perfilColab, setPerfilColab] = useState<any | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingColab, setEditingColab] = useState<any | null>(null);
  const [qrAberto, setQrAberto] = useState(false);
  const [agenteStatus, setAgenteStatus] = useState<Record<string, string>>({});
  const [agentesColab, setAgentesColab] = useState<any | null>(null);
  // Agentes ligados por colaborador (só quem tem sessão e cuja configuração foi lida).
  const [agentesEquipe, setAgentesEquipe] = useState<Record<string, { vendas: boolean; interno: boolean }>>({});

  // Bolinha verde/vermelha do Agente Secreto de cada colaborador. Atualiza a cada 30s e quando alguém conecta.
  useEffect(() => {
    let cancelled = false;
    const carregar = async () => {
      try {
        const r = await apiFetch("/api/agente-secreto/equipe");
        const d = r.ok ? await r.json().catch(() => null) : null;
        if (!cancelled && d?.items && !d.indisponivel) { setAgenteStatus(d.items); setAgentesEquipe(d.agentes || {}); }
      } catch { /* sem rede: mantém o último estado */ }
    };
    carregar();
    const t = setInterval(carregar, 30_000);
    window.addEventListener(AGENTE_SECRETO_STATUS_EVENT, carregar);
    return () => { cancelled = true; clearInterval(t); window.removeEventListener(AGENTE_SECRETO_STATUS_EVENT, carregar); };
  }, [activeTenantId]);

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

  // Só cria a sessão de WhatsApp (Agente Secreto) depois que o admin confirma; falha aqui não desfaz o cadastro.
  const criandoSessaoRef = useRef(new Set<string>());
  const handleCriarSessaoAgenteSecreto = async (colab: { nome: string; id: string }) => {
    setMenuOpenId(null);
    // Já tem sessão: avisa e não cria outra (nem pergunta). O servidor também confere — este é só o caminho rápido.
    if (agenteStatus[colab.id] !== undefined) {
      toast.info(`${colab.nome} já tem uma sessão do Agente Secreto.`, { description: "Não é preciso criar outra. Se estiver desconectada, ele reconecta pelo aviso no topo da tela." });
      window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));
      return;
    }
    if (criandoSessaoRef.current.has(colab.id)) return; // clique duplo
    criandoSessaoRef.current.add(colab.id);
    try {
      await criarSessaoAgenteSecreto(colab);
    } finally {
      criandoSessaoRef.current.delete(colab.id);
    }
  };

  const criarSessaoAgenteSecreto = async (colab: { nome: string; id: string }) => {
    if (!(await confirmDialog({
      title: "Criar sessão do Agente Secreto",
      description: `Criar a sessão de WhatsApp do Agente Secreto para ${colab.nome}? Depois, ${colab.nome} lê o QR code para conectar o número dele.`,
      confirmText: "Criar sessão",
      cancelText: "Agora não",
      variant: "success",
    }))) {
      toast.info(`A sessão do Agente Secreto de ${colab.nome} não foi criada.`, { description: "Você pode criar depois pelo menu do colaborador › Criar sessão do Agente Secreto." });
      return;
    }
    const criar = () => apiFetch("/api/agente-secreto/sessoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colaboradorId: colab.id }),
    });
    try {
      let res = await criar();
      // Colaborador recém-cadastrado: o registro pode ainda estar sendo gravado.
      if (res.status === 404) { await new Promise((r) => setTimeout(r, 1500)); res = await criar(); }
      const wa = await res.json().catch(() => ({}));
      if (res.ok) {
        if (wa.created === false) {
          // O servidor achou uma sessão que a tela ainda não conhecia: nada foi criado, só atualiza o status.
          toast.info(`${colab.nome} já tinha uma sessão do Agente Secreto.`, { description: "Nenhuma sessão nova foi criada." });
          window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));
        } else {
          toast.success(`Sessão criada para ${colab.nome}.`, { description: "Quando ele entrar no S.P.Y., o aviso Reconectar mostra o QR code para conectar o WhatsApp." });
          window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));
        }
      } else {
        toast.warning(`A sessão de ${colab.nome} não foi criada${wa.error ? `: ${wa.error}` : "."}`, { description: "Tente de novo pelo menu do colaborador." });
      }
    } catch {
      toast.warning(`Não foi possível criar a sessão de ${colab.nome} agora.`);
    }
  };

  // O próprio colaborador conecta o WhatsApp dele: o número exibido vem da sessão do WhatsApp (não de campo digitado),
  // então não diverge do cadastro. Só abre o QR se realmente precisa conectar.
  const consultarMinhaSessao = async () => {
    const r = await apiFetch("/api/agente-secreto/minha-sessao");
    return r.ok ? await r.json().catch(() => null) : null;
  };

  // Administrador conecta/reconecta o Agente Secreto de um colaborador: o QR aparece na tela do admin e é lido no celular dele.
  const [qrColab, setQrColab] = useState<{ id: string; nome: string } | null>(null);
  const consultarSessaoColab = async (id: string) => {
    const r = await apiFetch(`/api/agente-secreto/sessoes/${encodeURIComponent(id)}/status`);
    return r.ok ? await r.json().catch(() => null) : null;
  };
  const handleConectarColaborador = async (colab: { id: string; nome: string }) => {
    try {
      const s = await consultarSessaoColab(colab.id);
      if (!s?.session) toast.info(`${colab.nome} ainda não tem sessão do Agente Secreto.`, { description: "Crie a sessão primeiro (menu do colaborador › Criar sessão do Agente Secreto)." });
      else if (s.status === "CONNECTED") toast.success(`O Agente Secreto de ${colab.nome} já está conectado.`, { description: s.phone ? `WhatsApp +${String(s.phone).replace(/\D/g, "")}` : undefined });
      else setQrColab({ id: colab.id, nome: colab.nome });
    } catch {
      toast.error("Não foi possível consultar o Agente Secreto agora.");
    }
  };

  const handleConectarMeuWhatsApp = async () => {
    try {
      const s = await consultarMinhaSessao();
      if (!s?.session) {
        toast.info("Você ainda não tem uma sessão do Agente Secreto.", { description: "Peça ao administrador para criar a sua (menu do colaborador › Criar sessão do Agente Secreto)." });
      } else if (s.ativo === false) {
        toast.info("Seu Agente Secreto está pausado porque seu status não é Ativo.");
      } else if (s.status === "CONNECTED") {
        toast.success("Seu Agente Secreto já está conectado.", { description: s.phone ? `WhatsApp +${String(s.phone).replace(/\D/g, "")}` : undefined });
      } else {
        setQrAberto(true);
      }
    } catch {
      toast.error("Não foi possível consultar o seu Agente Secreto agora.");
    }
  };

  // Férias/afastado/inativo pausa a sessão do Agente Secreto do colaborador; voltar a Ativo religa.
  // Quem não tem sessão ignora (o servidor devolve session: null). Falha só avisa — o status já foi salvo.
  const sincronizarSessaoComStatus = async (colabId: string, nome: string, novoStatus: string) => {
    const pausado = novoStatus !== "Ativo";
    try {
      const res = await apiFetch(`/api/agente-secreto/sessoes/${encodeURIComponent(colabId)}/pausa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pausado }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.applied) {
        toast.info(pausado ? `Agente Secreto de ${nome} pausado.` : `Agente Secreto de ${nome} religado.`, pausado ? undefined : { description: "Se a sessão pedir, ele lê o QR code de novo pelo aviso Reconectar." });
      } else if (!res.ok) {
        toast.warning(`Status salvo, mas não foi possível ${pausado ? "pausar" : "religar"} o Agente Secreto de ${nome}.`);
      }
    } catch {
      toast.warning(`Status salvo, mas não foi possível ${pausado ? "pausar" : "religar"} o Agente Secreto de ${nome}.`);
    }
  };

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

    const novoColabId = Date.now().toString();
    addColaborador({
      id: novoColabId,
      nome: data.nome,
      email: data.email,
      phone: data.phone || "",
      cargo: data.cargoTexto ?? data.cargo,
      cargos: Array.isArray(data.cargos) ? data.cargos : [],
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
    if (userId) await handleCriarSessaoAgenteSecreto({ nome: data.nome, id: novoColabId });
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
    // A pessoa pode ter várias áreas: é administradora se QUALQUER cargo for "Administrador".
    const listaDeCargos = (c: any): string[] => (Array.isArray(c?.cargos) && c.cargos.length > 0 ? c.cargos : c?.cargo ? [c.cargo] : []);
    const cargosNovos = updates?.cargos !== undefined || updates?.cargo !== undefined ? listaDeCargos(updates) : null;
    if (supabase && anterior?.user_id && cargosNovos && cargosNovos.some(ehAdm) !== listaDeCargos(anterior).some(ehAdm)) {
      const { error: roleError } = await supabase.from("users")
        .update({ role: cargosNovos[0] || "Colaborador", is_tenant_admin: cargosNovos.some(ehAdm) })
        .eq("id", anterior.user_id);
      if (roleError) toast.error(`Cargo salvo, mas não foi possível atualizar o acesso de administrador: ${friendlyError(roleError)}`);
    }
    updateColaborador(id, updates);
    toast.success(`${updates.nome} atualizado com sucesso!`);
    if (updates?.status !== undefined && anterior && updates.status !== anterior.status) {
      void sincronizarSessaoComStatus(id, updates.nome || anterior.nome, updates.status);
    }
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
    if (colab.status !== novoStatus) void sincronizarSessaoComStatus(colab.id, colab.nome, novoStatus);
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
      description="Gerencie os colaboradores, organize os squads (times) por área e acompanhe metas e desempenho."
      actions={
        <div className="flex items-center gap-2">
          {activeTab === "grupos" ? null : activeTab === "squads" ? (podeGerenciar ? (
            <Button onClick={() => setIsNewSquadOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
              <PlusCircle className="w-3.5 h-3.5" /> Criar Squad
            </Button>
          ) : null) : podeGerenciar ? (
            <Button onClick={() => setIsMembroModalOpen(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
              <UserPlus className="w-3.5 h-3.5" /> Novo Registro
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6 max-w-[1700px] mx-auto pb-12">
        <AbasPagina
          value={activeTab}
          onChange={(v) => setActiveTab(v as any)}
          abas={[
            { id: "membros", label: `Membros da Equipe (${filteredVisiveis.length})` },
            { id: "squads", label: `${escopo === "todos" ? "Squads da Empresa" : "Meus Squads"} (${squadsVis.length})` },
            ...(temGrupos ? [{ id: "grupos", label: "Grupos de WhatsApp" }] : []),
          ]}
        />

        {escopo !== "todos" && (
          <p className="text-xs text-[var(--color-text-muted)]">{ROTULO_ESCOPO[escopo]}.</p>
        )}

        {activeTab === "grupos" && temGrupos ? (
          <GruposInternos />
        ) : activeTab === "membros" ? (
          <MembrosSection
            filtered={filteredVisiveis} search={search} onSearchChange={setSearch}
            podeGerenciar={podeGerenciar}
            menuOpenId={menuOpenId} setMenuOpenId={setMenuOpenId}
            onVerPerfil={setPerfilColab} onEditColab={setEditingColab}
            onChangeStatus={handleChangeStatus} onDesligar={handleDesligar}
            canManageSessions={!!(user?.isMaster || user?.isTenantAdmin)}
            onCriarSessao={handleCriarSessaoAgenteSecreto}
            currentUserId={user?.id ?? null}
            onConectarAgente={handleConectarMeuWhatsApp}
            onConectarColaborador={handleConectarColaborador}
            agenteStatus={agenteStatus}
            agentesEquipe={agentesEquipe}
            onAlternarAgente={alternarAgente}
            onAbrirAgentes={setAgentesColab}
          />
        ) : (
          <SquadsTabContent
            squads={squadsVis} handleDeleteSquad={handleDeleteSquad}
            somenteLeitura={!podeGerenciar} podeVerRemuneracao={escopo === "todos"}
            oteBaseSalary={oteBaseSalary} setOteBaseSalary={setOteBaseSalary}
            oteCommPercentage={oteCommPercentage} setOteCommPercentage={setOteCommPercentage}
            oteVendasRealizadas={oteVendasRealizadas} setOteVendasRealizadas={setOteVendasRealizadas}
            oteAtingimentoMeta={oteAtingimentoMeta} setOteAtingimentoMeta={setOteAtingimentoMeta}
            oteColaboradorId={oteColaboradorId} setOteColaboradorId={setOteColaboradorId}
            oteNivel={oteNivel} setOteNivel={setOteNivel}
            otePeriod={otePeriod} setOtePeriod={setOtePeriod}
            colaboradores={colaboradoresVis}
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
      <Modal isOpen={!!agentesColab} onClose={() => { setAgentesColab(null); window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT)); }} maxWidth="max-w-lg" title={`Agentes Secretos${agentesColab ? ` de ${agentesColab.nome}` : ""}`} description="Os dois agentes usam a mesma conexão de WhatsApp.">
        {agentesColab && <AgentesSecretosPainel colaborador={agentesColab} propria={!!(user?.id && agentesColab.user_id === user.id)} podeGerenciar={!!(user?.isMaster || user?.isTenantAdmin)} podeLigarDesligar={!!(user?.isMaster || user?.isTenantAdmin)} />}
      </Modal>
      <AgenteSecretoQrModal
        open={!!qrColab}
        onClose={() => setQrColab(null)}
        title={`Conectar o WhatsApp de ${qrColab?.nome ?? ""}`}
        colaboradorId={qrColab?.id}
        colaboradorNome={qrColab?.nome}
        checkConnected={async () => (qrColab ? (await consultarSessaoColab(qrColab.id))?.status === "CONNECTED" : false)}
        onConnected={() => {
          const nome = qrColab?.nome;
          setQrColab(null);
          window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));
          toast.success(`WhatsApp de ${nome ?? "o colaborador"} conectado! O Agente Secreto já está acompanhando as conversas dele.`);
        }}
      />
      <AgenteSecretoQrModal
        open={qrAberto}
        onClose={() => setQrAberto(false)}
        title="Conectar meu WhatsApp"
        checkConnected={async () => (await consultarMinhaSessao())?.status === "CONNECTED"}
        onConnected={() => {
          setQrAberto(false);
          window.dispatchEvent(new Event(AGENTE_SECRETO_STATUS_EVENT));
          toast.success("WhatsApp conectado! O Agente Secreto já está acompanhando suas conversas.");
        }}
      />
    </PageContainer>
  );
}
