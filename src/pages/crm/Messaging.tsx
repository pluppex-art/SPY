import { useState } from "react";
import { MessageCircle, Building2 } from "lucide-react";
import { useMessaging } from "./messaging/useMessaging";
import { ChatListSidebar } from "./messaging/ChatListSidebar";
import { ActiveChatArea } from "./messaging/ActiveChatArea";
import { RightControlDrawer } from "./messaging/RightControlDrawer";
import { AddActivityDialog } from "./messaging/AddActivityDialog";
import { InternalChatView } from "./messaging/InternalChatView";
import { normalizeText } from "../../lib/utils";

type MessagingMode = "whatsapp" | "interno";

export default function Messaging() {
  const [mode, setMode] = useState<MessagingMode>("whatsapp");

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
    handleCreateActivity,
    handleChatSelect
  } = useMessaging();

  const tabs = ["Todas", "Não lidas", "WhatsApp", "Instagram", "E-mail"];

  const filteredContacts = contacts.filter(c => {
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
    <div className={`flex flex-col bg-[var(--color-surface)] overflow-hidden ${isMobile ? "min-h-[100dvh] justify-center relative" : "h-full w-full"}`}>

      {/* Mode Toggle */}
      <div className="shrink-0 flex items-center gap-1 p-2 border-b border-white/5 bg-[var(--color-surface)]">
        <button
          onClick={() => setMode("whatsapp")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
            mode === "whatsapp"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
              : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          WhatsApp / IA
        </button>
        <button
          onClick={() => setMode("interno")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
            mode === "interno"
              ? "bg-blue-500/15 text-blue-400 border border-blue-500/25"
              : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Chat Interno
        </button>
      </div>

      {/* Views */}
      <div className={`flex-1 min-h-0 overflow-hidden ${isMobile ? "w-full max-w-[768px] self-center" : "w-full"}`}>

        {mode === "interno" ? (
          <div className="h-full w-full flex border border-white/10 rounded-b-2xl bg-[#0F172A]/85 shadow-2xl backdrop-blur-xl overflow-hidden">
            <InternalChatView />
          </div>
        ) : (
          <div className={`${isMobile ? "h-[calc(100dvh-56px)] flex flex-col relative bg-[var(--color-surface)] overflow-hidden" : "h-full rounded-b-2xl flex border border-white/10 bg-[#0F172A]/85 shadow-2xl backdrop-blur-xl overflow-hidden relative"}`}>

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
