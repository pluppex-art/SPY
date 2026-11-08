import React, { useEffect, useState } from "react";
import { Search, MoreVertical, X, MessageCircle, Instagram, Mail } from "lucide-react";
import { motion } from "motion/react";
import { Contact, Channel } from "./useMessaging";

const PAGE_SIZE = 50;

interface ChatListSidebarProps {
  isMobile: boolean;
  activeChat: string | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearching: boolean;
  filteredContacts: Contact[];
  handleChatSelect: (id: string) => void;
  tabs: string[];
  /** IAs que o usuário pode ver (SDR / CS / Chatbot), com a contagem de conversas de cada uma. */
  iaOptions?: { id: string; label: string; count: number }[];
  iaFiltro?: string;
  setIaFiltro?: (id: string) => void;
}

const getChannelIcon = (channel: Channel, className = "w-4 h-4") => {
  switch (channel) {
    case "WhatsApp": return <MessageCircle className={`${className} text-emerald-500`} />;
    case "Instagram": return <Instagram className={`${className} text-pink-500`} />;
    case "Email": return <Mail className={`${className} text-blue-500`} />;
  }
};

export function ChatListSidebar({
  isMobile,
  activeChat,
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  isSearching,
  filteredContacts,
  handleChatSelect,
  tabs,
  iaOptions = [],
  iaFiltro = "todas",
  setIaFiltro,
}: ChatListSidebarProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, activeTab, iaFiltro]);
  const visibleContacts = filteredContacts.slice(0, visibleCount);

  return (
    <div className={`${
        isMobile 
          ? `absolute inset-0 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] z-10 ${activeChat ? '-translate-x-1/4 opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}` 
          : 'w-[320px] lg:w-[380px] h-full flex flex-col shrink-0 border-r border-[var(--color-border-default)] z-10'
      } bg-[var(--color-surface-elevated)]`}>
      
      {/* Header */}
      <div className="shrink-0 h-[64px] px-5 flex items-center justify-between border-b border-[var(--color-border-subtle)]">
        <h1 className="text-base font-bold text-[var(--color-text-primary)] tracking-tight">Mensagens</h1>
        <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
          {/* Busca e menu "mais" escondidos: sem implementação. */}
          {false && (<>
          <button className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)] rounded-lg transition-colors cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"><Search className="w-4 h-4" /></button>
          <button className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)] rounded-lg transition-colors cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"><MoreVertical className="w-4 h-4" /></button>
          </>)}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex overflow-x-auto scrollbar-none border-b border-[var(--color-border-subtle)] px-3 py-2.5 gap-1.5 bg-[var(--color-surface-sunken)]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === tab 
                ? 'bg-[var(--color-primary-blue)] !text-white shadow-xs' 
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Filtro por IA (cada IA tem o próprio WhatsApp): só aparece para quem pode ver alguma IA */}
      {iaOptions.length > 0 && setIaFiltro && (
        <div className="shrink-0 flex items-center overflow-x-auto scrollbar-none border-b border-[var(--color-border-subtle)] px-3 py-2 gap-1.5 bg-[var(--color-surface-sunken)]" role="tablist" aria-label="Filtrar por IA">
          <span className="shrink-0 text-[11px] font-black uppercase tracking-wider text-[var(--color-text-faint)] pr-1">IA</span>
          {[{ id: "todas", label: "Todas", count: null as number | null }, ...iaOptions].map((o) => (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={iaFiltro === o.id}
              onClick={() => setIaFiltro(o.id)}
              className={`whitespace-nowrap px-3 py-1 text-xs font-bold rounded-lg border cursor-pointer transition-all ${
                iaFiltro === o.id
                  ? 'bg-violet-600 border-transparent !text-white shadow-xs'
                  : 'border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {o.label}{o.count !== null ? ` (${o.count})` : ""}
            </button>
          ))}
        </div>
      )}

      {/* Quick Search */}
      <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome ou tag..."
            className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl pl-9 pr-8 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all placeholder:text-[var(--color-text-muted)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-1 rounded-full hover:bg-[var(--color-surface)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Chat List */}
      <div className="scrollbar-none flex-1 overflow-y-auto pb-20">
        <motion.div
          key={`${searchQuery}-${activeTab}-${isSearching}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full flex flex-col"
        >
          {isSearching ? (
            /* Skeleton Loader */
            Array.from({ length: 4 }).map((_, idx) => (
              <div key={`skeleton-${idx}`} className="w-full flex items-center gap-3.5 px-4 py-3 border-b border-[var(--color-border-subtle)] animate-pulse">
                <div className="w-10 h-10 rounded-full bg-[var(--color-surface-sunken)] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="h-3.5 bg-[var(--color-surface-sunken)] rounded w-1/3" />
                    <div className="h-3 bg-[var(--color-surface-sunken)] rounded w-8" />
                  </div>
                  <div className="h-3 bg-[var(--color-surface-sunken)] rounded w-3/4" />
                </div>
              </div>
            ))
          ) : (
            /* Real contacts list */
            <>
              {visibleContacts.map(contact => {
                const isActive = !isMobile && activeChat === contact.id;
                return (
                  <button
                    key={contact.id}
                    onClick={() => handleChatSelect(contact.id)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 transition-all border-b border-[var(--color-border-subtle)] text-left cursor-pointer group border-l-4 ${
                      isActive 
                        ? 'border-l-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 text-[var(--color-text-primary)]' 
                        : 'border-transparent hover:bg-[var(--color-surface-sunken)]/60'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs ${
                        contact.channel === 'WhatsApp' ? 'bg-emerald-600' :
                        contact.channel === 'Instagram' ? 'bg-pink-600' :
                        'bg-blue-600'
                      }`}>
                        {contact.avatar}
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-[var(--color-surface-elevated)] rounded-full p-[2px] shadow-xs border border-[var(--color-border-subtle)]">
                        {getChannelIcon(contact.channel, "w-3 h-3")}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                      <div className="flex justify-between items-center">
                        <h3 className={`font-bold text-xs truncate ${contact.unread > 0 ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-primary)]"}`}>
                          {contact.name}
                        </h3>
                        <span className={`text-[10px] font-medium ${contact.unread > 0 ? 'text-[var(--color-primary-blue)] font-bold' : 'text-[var(--color-text-muted)]'}`}>
                          {contact.time}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs truncate flex-1 ${contact.unread > 0 ? "text-[var(--color-text-primary)] font-semibold" : "text-[var(--color-text-muted)]"}`}>
                          {contact.lastMessage}
                        </p>
                        {contact.unread > 0 && (
                          <span className="bg-[var(--color-primary-blue)] text-white text-[10px] font-bold h-4 min-w-4 rounded-full flex items-center justify-center px-1 shrink-0 shadow-xs">
                            {contact.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              
              {visibleCount < filteredContacts.length && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="w-full py-3 text-center text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]/60 transition-colors cursor-pointer"
                >
                  Carregar mais ({filteredContacts.length - visibleCount} restantes)
                </button>
              )}

              {filteredContacts.length === 0 && (
                <div className="p-8 flex flex-col items-center justify-center gap-3 text-center animate-in fade-in duration-200">
                  <div className="w-12 h-12 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)]">
                    <Search className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-[var(--color-text-primary)]">Nenhum resultado encontrado</h4>
                    <p className="text-[11px] text-[var(--color-text-muted)] max-w-[200px]">
                      Não encontramos nenhuma conversa que corresponda à busca.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
