import { useState } from "react";
import { 
  Bell, AlertTriangle, CheckCircle2, Info, XCircle, 
  Check, ShieldAlert, Clock
} from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { toast } from "sonner";

export interface SystemAlert {
  id: string;
  title: string;
  message: string;
  severity: "critical" | "warning" | "info" | "success";
  timestamp: string;
  source: string;
  read: boolean;
}

const INITIAL_ALERTS: SystemAlert[] = [];

interface SystemAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAlertsChange?: (unreadCount: number) => void;
}

export function SystemAlertsModal({ isOpen, onClose, onAlertsChange }: SystemAlertsModalProps) {
  const [alerts, setAlerts] = useState<SystemAlert[]>(INITIAL_ALERTS);
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const unreadCount = alerts.filter(a => !a.read).length;

  const handleMarkAllAsRead = () => {
    const updated = alerts.map(a => ({ ...a, read: true }));
    setAlerts(updated);
    onAlertsChange?.(0);
    toast.success("Todos os alertas marcados como lidos.");
  };

  const handleToggleRead = (id: string) => {
    const updated = alerts.map(a => a.id === id ? { ...a, read: !a.read } : a);
    setAlerts(updated);
    const newUnread = updated.filter(a => !a.read).length;
    onAlertsChange?.(newUnread);
  };

  const filteredAlerts = alerts.filter(a => {
    if (severityFilter === "all") return true;
    if (severityFilter === "unread") return !a.read;
    return a.severity === severityFilter;
  });

  const getSeverityBadge = (severity: SystemAlert["severity"]) => {
    switch (severity) {
      case "critical":
        return {
          icon: XCircle,
          label: "Crítico",
          color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        };
      case "warning":
        return {
          icon: AlertTriangle,
          label: "Atenção",
          color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        };
      case "success":
        return {
          icon: CheckCircle2,
          label: "Sucesso",
          color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
        };
      default:
        return {
          icon: Info,
          label: "Informativo",
          color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        };
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center justify-between w-full pr-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-[var(--color-primary-blue)]">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[var(--color-text-primary)] tracking-tight">
                  Central de Alertas & Notificações
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                    {unreadCount} não lidos
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] font-medium mt-0.5">
                Monitoramento de integridade, eventos de infraestrutura e avisos operacionais
              </p>
            </div>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            type="button"
            variant="ghost"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <Check className="w-3.5 h-3.5 mr-1.5" /> Marcar todos como lidos
          </Button>
          <Button
            type="button"
            onClick={onClose}
            className="px-6 font-bold"
          >
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "all", label: "Todos" },
            { id: "unread", label: `Não Lidos (${unreadCount})` },
            { id: "critical", label: "Críticos" },
            { id: "warning", label: "Avisos" },
            { id: "success", label: "Sucesso" },
            { id: "info", label: "Informações" },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSeverityFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                severityFilter === f.id
                  ? "bg-[var(--color-primary-blue)] text-white shadow-xs"
                  : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-default)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Alerts List */}
        <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
          {filteredAlerts.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <ShieldAlert className="w-10 h-10 text-[var(--color-text-faint)]" />
              <p className="text-sm font-bold text-[var(--color-text-muted)]">Nenhum alerta para o filtro selecionado</p>
              <p className="text-xs text-[var(--color-text-faint)]">A infraestrutura do SPY está operando dentro dos parâmetros ideais.</p>
            </div>
          ) : (
            filteredAlerts.map(alert => {
              const badge = getSeverityBadge(alert.severity);
              const BadgeIcon = badge.icon;
              return (
                <div
                  key={alert.id}
                  onClick={() => handleToggleRead(alert.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer select-none relative group ${
                    !alert.read
                      ? "bg-[var(--color-surface-elevated)] border-[var(--color-primary-blue)]/40 shadow-xs ring-1 ring-[var(--color-primary-blue)]/15"
                      : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] opacity-85 hover:opacity-100 hover:border-[var(--color-border-default)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${badge.color}`}>
                        <BadgeIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-black text-[var(--color-text-primary)] truncate">
                            {alert.title}
                          </h4>
                          {!alert.read && (
                            <span className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mt-1 font-medium">
                          {alert.message}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--color-text-faint)] font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {alert.timestamp}
                          </span>
                          <span>•</span>
                          <span className="uppercase font-bold text-[var(--color-text-muted)]">
                            {alert.source}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      title={alert.read ? "Marcar como não lido" : "Marcar como lido"}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] shrink-0"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
