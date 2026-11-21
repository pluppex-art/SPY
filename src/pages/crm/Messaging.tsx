import { uniqueSellers, sameSeller } from "../../lib/sellerNames";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageCircle, Users, Bot, Loader2 } from "lucide-react";
import { useMessaging } from "./messaging/useMessaging";
import { ChatListSidebar } from "./messaging/ChatListSidebar";
import { ActiveChatArea } from "./messaging/ActiveChatArea";
import { RightControlDrawer } from "./messaging/RightControlDrawer";
import { AddActivityDialog } from "./messaging/AddActivityDialog";
import { InternalChatView } from "./messaging/InternalChatView";
import { normalizeText } from "../../lib/utils";
import { apiFetch } from "../../lib/apiClient";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { IA_AGENTS, podeVerIa, type IaAgentId } from "../../lib/iaAgents";

// O Chatbot é um agente vendido à parte: a aba só existe para quem contratou o módulo.
const ChatbotPage = lazy(() => import("../chatbot/Chatbot"));

type MessagingMode = "conversas" | "equipe" | "chatbot";

export default function Messaging() {
  const { isModuleEnabled } = useAuth();
  const temChatbot = isModuleEnabled("chatbot");
  const [params, setParams] = useSearchParams();
  const abaUrl = params.get("aba");
  const [mode, setModeState] = useState<MessagingMode>(abaUrl === "equipe" ? "equipe" : abaUrl === "chatbot" && temChatbot ? "chatbot" : "conversas");
  const setMode = (m: MessagingMode) => {
    setModeState(m);
    const next = new URLSearchParams(params);
    if (m === "conversas") next.delete("aba"); else next.set("aba", m);
    setParams(next, { replace: true });
  };

  // ── Filtro por IA (SDR / CS / Chatbot) ────────────────────────────────────
  // Cada IA tem o próprio número de WhatsApp (instância); a conversa herda a IA da instância.
  // Quem não tem a IA liberada no perfil não vê as conversas daquele número.
  const { user, activeTenantId } = useAuth();
  const { cargos } = useData() as any;
  const [iaPorInstancia, setIaPorInstancia] = useState<Record<string, IaAgentId>>({});
  const [iaFiltro, setIaFiltro] = useState<string>(() => (typeof window !== "undefined" ? window.sessionStorage.getItem("axis_iaFiltro") || "todas" : "todas"));
  useEffect(() => { try { window.sessionStorage.setItem("axis_iaFiltro", iaFiltro); } catch { /* sem sessionStorage */ } }, [iaFiltro]);
  useEffect(() => {
    let vivo = true;
    const carregar = () =>
      apiFetch(`/api/whatsapp/instances${activeTenantId ? `?tenantId=${encodeURIComponent(activeTenantId)}` : ""}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((lista: any[]) => {
          if (!vivo) return;
          const mapa: Record<string, IaAgentId> = {};
          for (const i of lista || []) if (i.iaAgent) mapa[i.id] = i.iaAgent;
          setIaPorInstancia(mapa);
        })
        .catch(() => {});
    carregar();
    const t = setInterval(carregar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, [activeTenantId]);
  const iasPermitidas = IA_AGENTS.filter((a) => podeVerIa(user, cargos || [], a.id));

  const {
    leads,
    leadActivities,
    activeTab, setActiveTab,
    searchQuery, setSearchQuery,
    isSearching,
    activeChat, setActiveChat,
    previousChat,
    rightPanel, setRightPanel,
    previousPanel,
    contacts,
    messages,
    inputText, setInputText,
    isOffline,
    sentiment,
    aiAnalysis,
    aiSuggestion,
    viewMode, setViewMode,
    showAddActivityModal, setShowAddActivityModal,
    newActivityType, setNewActivityType,
    newActivityTitle, setNewActivityTitle,
    newActivityDesc, setNewActivityDesc,
    aiPrompt, setAiPrompt,
    aiTyping,
    aiMessages,
    isMobile,
    parseMessageTimeToTimestamp,
    parseActivityDateToTimestamp,
    handleManualRetry,
    handleAiAsk,
    handleSendMessage,
    handleSendMedia,
    handleCreateActivity,
    handleChatSelect
  } = useMessaging();

  const tabs = ["Todas", "Não lidas", "WhatsApp", "Instagram", "E-mail"];

  // ── Filtro por vendedor ───────────────────────────────────────────────────
  // O vendedor da conversa é o responsável do lead com o mesmo telefone (compara os 8 últimos dígitos).
  const [vendedorFiltro, setVendedorFiltro] = useState("todos");
  const chaveTel = (v?: string | null) => String(v ?? "").replace(/\D/g, "").slice(-8);
  const vendedorPorTel = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leads as any[]) {
      const k = chaveTel(l.phone);
      if (k.length >= 8 && l.seller && !m.has(k)) m.set(k, String(l.seller));
    }
    return m;
  }, [leads]);
  const vendedorDoContato = (c: { phone?: string }) => vendedorPorTel.get(chaveTel(c.phone)) ?? "";

  const iaDoContato = (c: { instanceId?: string | null }): IaAgentId | null => (c.instanceId ? iaPorInstancia[c.instanceId] ?? null : null);
  // Conversas de uma IA que o perfil não pode ver ficam fora de qualquer visão.
  const contatosVisiveis = contacts.filter((c) => {
    const ia = iaDoContato(c);
    return !ia || iasPermitidas.some((a) => a.id === ia);
  });
  const iaOptions = iasPermitidas.map((a) => ({ id: a.id, label: a.label, count: contatosVisiveis.filter((c) => iaDoContato(c) === a.id).length }));

  const nomesVendedores = uniqueSellers(contatosVisiveis.map((c) => vendedorDoContato(c)));
  const vendedorOptions = nomesVendedores
    .map((nome) => ({ nome, count: contatosVisiveis.filter((c) => sameSeller(vendedorDoContato(c), nome)).length }));

  const filteredContacts = contatosVisiveis.filter(c => {
    if (iaFiltro !== "todas" && iaDoContato(c) !== iaFiltro) return false;
    if (vendedorFiltro === "sem" && vendedorDoContato(c)) return false;
    if (vendedorFiltro !== "todos" && vendedorFiltro !== "sem" && !sameSeller(vendedorDoContato(c), vendedorFiltro)) return false;
    if (activeTab === "Não lidas" && c.unread === 0) return false;
    if (activeTab === "WhatsApp" && c.channel !== "WhatsApp") return false;
    if (activeTab === "Instagram" && c.channel !== "Instagram") return false;
    if (activeTab === "E-mail" && c.channel !== "Email") return false;

    if (searchQuery.trim() !== "") {
      const query = normalizeText(searchQuery);
      const matchesName = normalizeText(c.name).includes(query);
      const matchesTag = c.tags ? c.tags.some(t => normalizeText(t).includes(query)) : false;
      return matchesName || matchesTag;
    }
    return true;
  });

  const viewChatId = isMobile ? (activeChat || previousChat) : activeChat;
  const currentContact = contacts.find(c => c.id === viewChatId);
  const currentMessages = currentContact ? (messages[currentContact.id] || []) : [];

  const cleanNumber = (num?: string) => {
    if (!num) return "";
    return num.replace(/\D/g, "").replace(/^55/, "");
  };

  const matchingLead = currentContact ? leads.find(l => {
    const phoneMatch = cleanNumber(l.phone) === cleanNumber(currentContact.phone);
    const nameMatch = l.name.toLowerCase().includes(currentContact.name.toLowerCase()) ||
                      currentContact.name.toLowerCase().includes(l.name.toLowerCase());
    return phoneMatch || nameMatch;
  }) : null;

  const relatedActivities = matchingLead
    ? leadActivities.filter(act => act.leadId === matchingLead.id)
    : [];

  return (
    <div className={`flex flex-col bg-[var(--color-surface)] overflow-clip min-w-0 ${isMobile ? "min-h-[100dvh] justify-center relative" : "h-full w-full"}`}>

      {/* Seções do Chat: tudo numa tela só — conversas (WhatsApp, Instagram, e-mail e as IAs), equipe e chatbot. */}
      <div className="shrink-0 flex items-center gap-1 p-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface)] overflow-x-auto scrollbar-none">
        {([
          { id: "conversas" as const, label: "Conversas", icon: MessageCircle, on: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" },
          { id: "equipe" as const, label: "Equipe", icon: Users, on: "bg-blue-500/15 text-blue-400 border border-blue-500/25" },
          ...(temChatbot ? [{ id: "chatbot" as const, label: "Chatbot", icon: Bot, on: "bg-violet-500/15 text-violet-400 border border-violet-500/25" }] : []),
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shrink-0 ${
              mode === t.id ? t.on : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Views */}
      <div className={`flex-1 min-h-0 min-w-0 overflow-clip ${isMobile ? "w-full max-w-[768px] self-center" : "w-full"}`}>

        {mode === "equipe" ? (
          <div className="h-full w-full flex border border-[var(--color-border-default)] rounded-b-2xl bg-[var(--color-surface)] shadow-2xl backdrop-blur-xl overflow-clip min-w-0">
            <InternalChatView />
          </div>
        ) : mode === "chatbot" ? (
          <div className="h-full w-full overflow-y-auto p-4 md:p-6 bg-[var(--color-surface)]">
            <Suspense fallback={<div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-faint)]" /></div>}>
              <ChatbotPage />
            </Suspense>
          </div>
        ) : (
          <div className={`${isMobile ? "h-[calc(100dvh-56px)] flex flex-col relative bg-[var(--color-surface)] overflow-clip" : "h-full min-w-0 rounded-b-2xl flex border border-[var(--color-border-default)] bg-[var(--color-surface)] shadow-2xl backdrop-blur-xl overflow-clip relative"}`}>

            <ChatListSidebar
              isMobile={isMobile}
              activeChat={activeChat}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isSearching={isSearching}
              filteredContacts={filteredContacts}
              handleChatSelect={handleChatSelect}
              tabs={tabs}
              iaOptions={iaOptions}
              iaFiltro={iaFiltro}
              setIaFiltro={setIaFiltro}
              vendedorOptions={vendedorOptions}
              vendedorFiltro={vendedorFiltro}
              setVendedorFiltro={setVendedorFiltro}
            />

            <ActiveChatArea
              isMobile={isMobile}
              activeChat={activeChat}
              setActiveChat={setActiveChat}
              previousChat={previousChat}
              rightPanel={rightPanel}
              setRightPanel={setRightPanel}
              currentContact={currentContact}
              currentMessages={currentMessages}
              isOffline={isOffline}
              handleManualRetry={handleManualRetry}
              sentiment={sentiment}
              viewMode={viewMode}
              setViewMode={setViewMode}
              matchingLead={matchingLead}
              setShowAddActivityModal={setShowAddActivityModal}
              relatedActivities={relatedActivities}
              parseMessageTimeToTimestamp={parseMessageTimeToTimestamp}
              parseActivityDateToTimestamp={parseActivityDateToTimestamp}
              inputText={inputText}
              setInputText={setInputText}
              handleSendMessage={handleSendMessage}
              handleSendMedia={handleSendMedia}
            />

            {currentContact && rightPanel !== "none" && (
              <RightControlDrawer
                rightPanel={rightPanel}
                setRightPanel={setRightPanel}
                previousPanel={previousPanel}
                currentContact={currentContact}
                sentiment={sentiment}
                aiAnalysis={aiAnalysis}
                aiSuggestion={aiSuggestion}
                aiMessages={aiMessages}
                aiPrompt={aiPrompt}
                setAiPrompt={setAiPrompt}
                aiTyping={aiTyping}
                handleAiAsk={handleAiAsk}
              />
            )}

            <AddActivityDialog
              showAddActivityModal={showAddActivityModal}
              setShowAddActivityModal={setShowAddActivityModal}
              matchingLead={matchingLead}
              newActivityType={newActivityType}
              setNewActivityType={setNewActivityType}
              newActivityTitle={newActivityTitle}
              setNewActivityTitle={setNewActivityTitle}
              newActivityDesc={newActivityDesc}
              setNewActivityDesc={setNewActivityDesc}
              handleCreateActivity={handleCreateActivity}
            />
          </div>
        )}
      </div>
    </div>
  );
}
