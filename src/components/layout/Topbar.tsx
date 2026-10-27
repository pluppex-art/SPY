import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import type { Notification } from "../../contexts/DataContextTypes";
import { useLocalization } from "../../contexts/LocalizationContext";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { CommandPalette } from "../CommandPalette";
import { Logo } from "../ui/Logo";
import {
  Menu,
  Sun,
  Moon,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  Users,
  Settings2,
  AlertCircle,
  CheckCheck,
  Trash2,
  ChevronRight,
  X,
  ChevronDown,
} from "lucide-react";

interface TopbarProps {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (val: boolean) => void;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (val: boolean) => void;
}

// "category" nunca existiu como coluna em public.notifications — as abas
// CRM/Financeiro/Sistema filtravam um campo que nunca persistia. Simplificado
// pra usar só o que a tabela de fato tem: lida/não lida.
type NotificationTab = "todas" | "unread";

/** "Hoje, 09:00" / "Ontem" / "12 mar" — a partir de created_at (timestamptz real). */
function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return time;
  if (diffDays === -1) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Anteriores";
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === -1) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

interface NotificationGroup {
  key: string;
  items: Notification[]; // mais recente primeiro
}

/** Agrupa por dia e, dentro do dia, junta notificações com o mesmo título (ex.: 8x "Nova Tarefa"). */
function groupNotifications(list: Notification[]): { day: string; groups: NotificationGroup[] }[] {
  const days: { day: string; groups: NotificationGroup[] }[] = [];
  for (const n of list) {
    const label = dayLabel(n.created_at);
    let day = days.find((d) => d.day === label);
    if (!day) {
      day = { day: label, groups: [] };
      days.push(day);
    }
    const key = `${label}|${n.title}|${n.type || ""}`;
    const group = day.groups.find((g) => g.key === key);
    if (group) group.items.push(n);
    else day.groups.push({ key, items: [n] });
  }
  return days;
}

export function Topbar({
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
}: TopbarProps) {
  const navigate = useNavigate();
  const { user, logout, activeTenantName } = useAuth();
  const {
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotifications,
    clearAllNotifications,
    theme,
    toggleTheme,
    appSettings,
    tenantPrimaryColor,
  } = useData();
  const { t } = useLocalization();

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationTab>("todas");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [confirmingClear, setConfirmingClear] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const toggleNotifications = () => {
    setConfirmingClear(false);
    setIsNotificationsOpen((prev) => {
      if (!prev) setIsUserMenuOpen(false);
      return !prev;
    });
  };

  const toggleUserMenu = () => {
    setIsUserMenuOpen((prev) => {
      if (!prev) setIsNotificationsOpen(false);
      return !prev;
    });
  };

  useEffect(() => {
    if (!isNotificationsOpen && !isUserMenuOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        isNotificationsOpen &&
        notificationsRef.current &&
        !notificationsRef.current.contains(target)
      ) {
        setIsNotificationsOpen(false);
      }
      if (
        isUserMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(target)
      ) {
        setIsUserMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsNotificationsOpen(false);
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationsOpen, isUserMenuOpen]);

  // Nome/avatar do usuário e da empresa vêm do Supabase (public.users via
  // AuthContext, app_settings via DataContext) — reativos automaticamente,
  // sem localStorage nem eventos customizados.
  // Achado de UX 2026-09-21: fallback usava um nome de pessoa real e "S.P.Y.
  // Corp" — se os dados ainda não carregaram, qualquer cliente via o nome de
  // outra pessoa (aparentemente do desenvolvedor) como se fosse o dele.
  const liveProfile = { name: user?.name || "Usuário", avatar: user?.avatarUrl || null };
  const liveEmpresaName = appSettings?.empresa_dados?.nomeFantasia || user?.tenantName || "Minha Empresa";

  const unreadNotifications = notifications.filter((n) => !n.is_read).length;
  const userInitials = liveProfile.name ? liveProfile.name.substring(0, 2).toUpperCase() : "US";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const filteredNotifications = activeTab === "unread" ? notifications.filter((n) => !n.is_read) : notifications;
  const groupedByDay = useMemo(() => groupNotifications(filteredNotifications), [filteredNotifications]);

  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const openNotification = (n: Notification) => {
    markNotificationAsRead(n.id);
    const target = n.link_url || (n.title?.toLowerCase().includes("tarefa") ? "/app/tarefas" : undefined);
    if (target) {
      navigate(target);
      setIsNotificationsOpen(false);
    }
  };

  const getTypeStyle = (type?: string) => {
    switch (type) {
      case "success":
        return { icon: CheckCircle2, bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" };
      case "warning":
        return { icon: AlertTriangle, bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" };
      case "error":
        return { icon: AlertCircle, bg: "bg-rose-500/10 text-rose-500 border-rose-500/20" };
      default:
        return { icon: Info, bg: "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/20" };
    }
  };

  return (
    <header className="h-16 border-b border-[var(--color-border-default)] bg-[var(--color-surface)]/80 backdrop-blur-xl flex items-center justify-between px-6 z-40 shrink-0 select-none">
      <div className="flex items-center gap-4 flex-1">
        <button
          type="button"
          onClick={() => {
            if (window.innerWidth < 1024) {
              setIsMobileSidebarOpen(!isMobileSidebarOpen);
            } else {
              setIsSidebarCollapsed(!isSidebarCollapsed);
            }
          }}
          className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border-default)] rounded-xl transition-colors mr-2 cursor-pointer border-none"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile Branding Pill */}
        <div className="flex sm:hidden items-center gap-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-3 py-1.5 rounded-xl">
          <div className="w-6 h-6 rounded bg-transparent dark:bg-[var(--color-primary-blue)]/15 flex items-center justify-center">
            <Logo variant="icon" size={18} color={tenantPrimaryColor} />
          </div>
          {/* Achado de UX 2026-09-21: texto fixo "S.P.Y." aqui, enquanto o
              Sidebar já usa o nome real do tenant como padrão estabelecido —
              alinhado com o mesmo fallback usado lá (Sidebar.tsx). */}
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-primary)] truncate max-w-[120px]">
            {activeTenantName || user?.tenantName || "S.P.Y."}
          </span>
        </div>

        <div className="hidden md:block">
          <CommandPalette />
        </div>
      </div>

      <div className="flex items-center gap-4 sm:gap-5">
        <button
          type="button"
          onClick={() => toggleTheme()}
          className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border-default)] rounded-xl transition-colors cursor-pointer border-none"
          title={t("Alternar Tema (Light/Dark)")}
        >
          {theme === "dark" ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
        </button>

        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            onClick={toggleNotifications}
            className={`text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all relative p-2 rounded-xl border border-transparent cursor-pointer ${
              isNotificationsOpen
                ? "bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] shadow-sm"
                : unreadNotifications > 0
                ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                : "hover:bg-[var(--color-surface-sunken)]"
            }`}
            title={t("Notificações")}
          >
            <Bell className="w-4 h-4" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-xs">
                {unreadNotifications}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <Card className="fixed left-4 right-4 sm:left-auto sm:right-4 md:absolute md:left-auto md:right-0 top-16 md:top-full md:mt-3 md:w-[440px] bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200">
                {/* Header */}
                <div className="p-4 border-b border-[var(--color-border-subtle)] flex justify-between items-center bg-[var(--color-surface-sunken)]">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-blue)]/10 flex items-center justify-center">
                      <Bell className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">
                        {t("Central de Notificações")}
                      </h4>
                      <p className="text-[10px] text-[var(--color-text-muted)]">
                        {unreadNotifications} {t(unreadNotifications === 1 ? "pendente de leitura" : "pendentes de leitura")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {unreadNotifications > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllNotificationsAsRead()}
                        className="text-[11px] text-[var(--color-primary-blue)] font-bold hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
                      >
                        <CheckCheck className="w-3.5 h-3.5" /> {t("Ler todas")}
                      </button>
                    )}
                    {notifications.length > 0 &&
                      (confirmingClear ? (
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => {
                              clearAllNotifications();
                              setConfirmingClear(false);
                            }}
                            className="font-bold text-rose-500 hover:underline cursor-pointer bg-transparent border-none"
                          >
                            {t("Confirmar")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingClear(false)}
                            className="text-[var(--color-text-muted)] hover:underline cursor-pointer bg-transparent border-none"
                          >
                            {t("Cancelar")}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingClear(true)}
                          className="text-[11px] text-[var(--color-text-muted)] hover:text-rose-500 font-bold flex items-center gap-1 cursor-pointer bg-transparent border-none transition-colors"
                          title={t("Apagar todas as notificações")}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> {t("Limpar")}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Tabs filter */}
                <div className="flex items-center gap-1 p-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] overflow-x-auto scrollbar-none">
                  {[
                    { id: "todas" as const, label: "Todas", count: notifications.length },
                    { id: "unread" as const, label: "Não lidas", count: unreadNotifications },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all shrink-0 cursor-pointer border-none flex items-center gap-1.5 ${
                        activeTab === tab.id
                          ? "bg-[var(--color-primary-blue)] text-white shadow-xs"
                          : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      {t(tab.label)}
                      {tab.count > 0 && (
                        <span className={`px-1 rounded-full text-[8px] font-mono ${activeTab === tab.id ? "bg-white/25 text-white" : "bg-[var(--color-border-default)] text-[var(--color-text-muted)]"}`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Notifications List */}
                <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
                  {groupedByDay.length > 0 ? (
                    groupedByDay.map(({ day, groups }) => (
                      <div key={day}>
                        <div className="sticky top-0 z-10 px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
                          {day}
                        </div>
                        <div className="divide-y divide-[var(--color-border-subtle)]">
                          {groups.map((g) => {
                            const latest = g.items[0];
                            const style = getTypeStyle(latest.type);
                            const IconComp = style.icon;
                            const count = g.items.length;
                            const unread = g.items.filter((i) => !i.is_read).length;
                            const expanded = expandedGroups.has(g.key);
                            const rows = count > 1 && expanded ? g.items : [latest];

                            return (
                              <div key={g.key}>
                                {rows.map((n, idx) => (
                                  <div
                                    key={n.id}
                                    onClick={() => openNotification(n)}
                                    className={`pl-4 pr-3 py-3 hover:bg-[var(--color-surface-sunken)] cursor-pointer transition-all flex gap-3 relative group ${
                                      !n.is_read ? "bg-[var(--color-primary-blue)]/[0.04]" : ""
                                    } ${idx > 0 ? "border-t border-[var(--color-border-subtle)]" : ""}`}
                                  >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${style.bg}`}>
                                      <IconComp className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex justify-between items-start mb-0.5 gap-2">
                                        <h5 className={`text-xs font-bold truncate flex items-center gap-1.5 ${!n.is_read ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}`}>
                                          {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-blue)] shrink-0" />}
                                          <span className="truncate">{n.title}</span>
                                          {idx === 0 && count > 1 && !expanded && (
                                            <span className="px-1.5 py-px rounded-full text-[9px] font-mono font-bold bg-[var(--color-border-default)] text-[var(--color-text-muted)] shrink-0">
                                              {count}
                                            </span>
                                          )}
                                        </h5>
                                        <span className="text-[10px] text-[var(--color-text-faint)] font-mono shrink-0 group-hover:hidden">
                                          {formatNotificationTime(n.created_at)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteNotifications(count > 1 && !expanded ? g.items.map((i) => i.id) : [n.id]);
                                          }}
                                          className="hidden group-hover:flex p-0.5 rounded text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer bg-transparent border-none shrink-0"
                                          title={count > 1 && !expanded ? t("Excluir grupo") : t("Excluir")}
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
                                        {n.description}
                                      </p>
                                      {idx === 0 && count > 1 && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleGroup(g.key);
                                          }}
                                          className="mt-1 text-[10px] font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-0.5 cursor-pointer bg-transparent border-none p-0"
                                        >
                                          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                                          {expanded ? t("Recolher") : `${t("Ver mais")} ${count - 1}${unread > 0 ? ` · ${unread} ${t("não lidas")}` : ""}`}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      icon={Bell}
                      title="Nenhuma notificação"
                      description="Você será avisado aqui quando algo precisar da sua atenção."
                      className="border-0 bg-transparent py-10"
                    />
                  )}
                </div>
              </Card>
          )}
        </div>

        <div className="flex items-center gap-3 pl-4 sm:pl-6 border-l border-[var(--color-border-default)]">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-[var(--color-text-primary)] leading-tight">{liveProfile.name}</p>
            <p className="text-[10px] text-[var(--color-primary-blue)] font-bold uppercase tracking-wider">{liveEmpresaName}</p>
          </div>
          <div ref={userMenuRef} className="relative">
            <div
              onClick={toggleUserMenu}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-blue-700 flex items-center justify-center text-xs font-bold text-white hover:opacity-90 transition-all cursor-pointer shadow-xs overflow-hidden border border-[var(--color-border-default)]"
            >
              {liveProfile.avatar ? (
                <img src={liveProfile.avatar} alt={liveProfile.name} className="w-full h-full object-cover" />
              ) : (
                userInitials
              )}
            </div>
            {isUserMenuOpen && (
              <div className="absolute top-full right-0 pt-2 w-48 z-50">
                  <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl shadow-xl p-1 animate-in fade-in slide-in-from-top-2">
                    <button
                      type="button"
                      onClick={() => { setIsUserMenuOpen(false); navigate("/app/configuracoes/usuario/perfil"); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] rounded-lg transition-colors cursor-pointer border-none bg-transparent text-left"
                    >
                      <Users className="w-3.5 h-3.5" /> {t("Meu Perfil")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsUserMenuOpen(false); navigate("/app/configuracoes/usuario/preferencias"); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] rounded-lg transition-colors cursor-pointer border-none bg-transparent text-left"
                    >
                      <Settings2 className="w-3.5 h-3.5" /> {t("Preferências")}
                    </button>
                    <div className="h-px bg-[var(--color-border-subtle)] my-1"></div>
                    <button
                      type="button"
                      onClick={() => { setIsUserMenuOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer border-none bg-transparent text-left"
                    >
                      <AlertCircle className="w-3.5 h-3.5" /> {t("Sair da Conta")}
                    </button>
                  </div>
                </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
