import React, { useState, useEffect } from "react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import {
  Target,
  Users,
  ShieldAlert,
  Clock,
  Mail,
  Award,
  Bell,
  Volume2,
  ChevronDown,
  ChevronUp,
  Save,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  DollarSign,
  Play,
  RotateCcw,
  Send,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";
import { useAuth } from "../../../contexts/AuthContext";
import {
  isPushSupported,
  getPushPermission,
  requestNotificationPermission,
  sendPushNotification,
  playNotificationSound,
} from "../../../lib/notifications";

const SETTING_KEY = "notification_prefs";

interface NotificationTrigger {
  id: string;
  category: string;
  title: string;
  description: string;
  inApp: boolean;
  email: boolean;
  whatsapp: boolean;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationTrigger[] = [
  {
    id: "novo_lead",
    category: "Comercial / CRM",
    title: "Novo Lead Cadastrado",
    description: "Notificar quando um novo lead entrar pelo site, formulário, anúncio ou webhook",
    inApp: true,
    email: true,
    whatsapp: true,
  },
  {
    id: "lead_distribuido",
    category: "Comercial / CRM",
    title: "Lead Atribuído",
    description: "Avisar o vendedor ou SDR responsável no momento do rodízio ou atribuição manual",
    inApp: true,
    email: true,
    whatsapp: true,
  },
  {
    id: "lead_esquentou",
    category: "Comercial / CRM",
    title: "Oportunidade Quente",
    description: "Alerta de lead com score alto ou probabilidade máxima de fechamento",
    inApp: true,
    email: false,
    whatsapp: true,
  },
  {
    id: "tarefa_vencida",
    category: "Produtividade & Agenda",
    title: "Tarefa ou Follow-up Vencido",
    description: "Alerta de atraso em atividades comerciais pendentes ou reuniões sem conclusão",
    inApp: true,
    email: false,
    whatsapp: true,
  },
  {
    id: "tarefa_proxima",
    category: "Produtividade & Agenda",
    title: "Lembrete 15min Antes",
    description: "Aviso sonoro e notificação antes de reuniões ou chamadas de alinhamento",
    inApp: true,
    email: false,
    whatsapp: true,
  },
  {
    id: "reuniao_confirmada",
    category: "Produtividade & Agenda",
    title: "Reunião Confirmada / Sincronizada",
    description: "Notificar quando um compromisso for agendado no Google Calendar ou na plataforma",
    inApp: true,
    email: true,
    whatsapp: false,
  },
  {
    id: "proposta_aberta",
    category: "Vendas & Negociação",
    title: "Proposta Visualizada",
    description: "Alerta em tempo real quando o cliente abrir ou interagir com o link da proposta",
    inApp: true,
    email: true,
    whatsapp: false,
  },
  {
    id: "venda_fechada",
    category: "Vendas & Negociação",
    title: "Venda Fechada / Contrato Assinado",
    description: "Celebrar conversão e disparar fluxo de onboarding financeiro e operacional",
    inApp: true,
    email: true,
    whatsapp: true,
  },
  {
    id: "pagamento_recebido",
    category: "Vendas & Negociação",
    title: "Pagamento Recebido",
    description: "Notificação financeira quando um boleto, PIX ou fatura for liquidada",
    inApp: true,
    email: true,
    whatsapp: false,
  },
];

const iconMap: Record<string, any> = {
  novo_lead: Target,
  lead_distribuido: Users,
  lead_esquentou: Sparkles,
  tarefa_vencida: ShieldAlert,
  tarefa_proxima: Clock,
  reuniao_confirmada: Calendar,
  proposta_aberta: Mail,
  venda_fechada: Award,
  pagamento_recebido: DollarSign,
};

export function ConfigNotificacoesPreferencias() {
  const { appSettings, saveAppSetting, addNotification } = useData();
  const { user, updatePreferences } = useAuth();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [prefs, setPrefs] = useState<NotificationTrigger[]>(DEFAULT_NOTIFICATION_PREFS);

  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() => getPushPermission());
  const [isSaving, setIsSaving] = useState(false);

  // Global channel states
  const [generalInApp, setGeneralInApp] = useState(true);
  const [generalEmail, setGeneralEmail] = useState(true);
  const [generalWhatsapp, setGeneralWhatsapp] = useState(true);

  // Sound preference from user
  const soundEnabled = user?.preferences?.whatsappSound !== false && user?.preferences?.systemPreferences?.soundEnabled !== false;

  // Hydrate from user preferences or appSettings
  useEffect(() => {
    const savedInUser = user?.preferences?.[SETTING_KEY];
    const savedInApp = appSettings?.[SETTING_KEY];
    const candidates = savedInUser || savedInApp;

    if (candidates && Array.isArray(candidates) && candidates.length > 0) {
      setPrefs(candidates);
    }
  }, [user?.preferences, appSettings]);

  // Recalculate general switches based on current prefs
  useEffect(() => {
    if (prefs.length > 0) {
      setGeneralInApp(prefs.some((p) => p.inApp));
      setGeneralEmail(prefs.some((p) => p.email));
      setGeneralWhatsapp(prefs.some((p) => p.whatsapp));
    }
  }, [prefs]);

  const persistPrefs = async (newPrefs: NotificationTrigger[]) => {
    setPrefs(newPrefs);

    // Persist in user preferences
    updatePreferences({ [SETTING_KEY]: newPrefs });

    // Persist in app_settings table
    try {
      await saveAppSetting(SETTING_KEY, newPrefs);
    } catch (e) {
      console.warn("Falha ao salvar em appSettings:", e);
    }
  };

  const handleToggle = (id: string, channel: "inApp" | "email" | "whatsapp") => {
    const updated = prefs.map((p) => {
      if (p.id === id) {
        return { ...p, [channel]: !p[channel] };
      }
      return p;
    });
    persistPrefs(updated);
  };

  const handleToggleChannelAll = (channel: "inApp" | "email" | "whatsapp", value: boolean) => {
    const updated = prefs.map((p) => ({ ...p, [channel]: value }));
    persistPrefs(updated);

    if (channel === "inApp") setGeneralInApp(value);
    if (channel === "email") setGeneralEmail(value);
    if (channel === "whatsapp") setGeneralWhatsapp(value);

    const label = channel === "inApp" ? "Plataforma (In-App)" : channel === "email" ? "E-mail" : "WhatsApp";
    toast.info(`Alertas de ${label} foram ${value ? "ativados" : "desativados"} para todos os gatilhos.`);
  };

  const toggleSound = () => {
    const newVal = !soundEnabled;
    updatePreferences({
      whatsappSound: newVal,
      systemPreferences: {
        ...(user?.preferences?.systemPreferences || {}),
        soundEnabled: newVal,
      },
    });
    if (newVal) {
      playNotificationSound();
      toast.success("Alertas sonoros ativados!");
    } else {
      toast.info("Alertas sonoros desativados.");
    }
  };

  const handleTestSound = () => {
    playNotificationSound();
    toast.info("Reproduzindo som de notificação padrão.");
  };

  const handleRequestPush = async () => {
    if (!isPushSupported()) {
      toast.error("Notificações do navegador não são suportadas neste dispositivo.");
      return;
    }
    const perm = await requestNotificationPermission();
    setPushPermission(perm);
    if (perm === "granted") {
      sendPushNotification("S.P.Y. Notificações", "Alertas nativos do navegador ativados com sucesso! 🚀");
      toast.success("Notificações no navegador ativadas!");
    } else if (perm === "denied") {
      toast.error("Permissão de notificações bloqueada nas configurações do navegador.");
    }
  };

  const handleTestNotification = () => {
    if (soundEnabled) {
      playNotificationSound();
    }
    sendPushNotification("S.P.Y. Alerta Comercial", "Nova oportunidade qualificada identificada pelo S.P.Y.!");
    addNotification({
      title: "Oportunidade Comercial",
      description: "Lead qualificado interagiu com a proposta via WhatsApp.",
      type: "info",
    }, true);
    toast.success("Notificação de teste disparada em todos os canais ativos!");
  };

  const handleSave = async () => {
    setIsSaving(true);
    await persistPrefs(prefs);
    setTimeout(() => {
      setIsSaving(false);
      toast.success("Preferências de notificação salvas com sucesso!");
    }, 400);
  };

  const handleResetDefaults = async () => {
    await persistPrefs(DEFAULT_NOTIFICATION_PREFS);
    toast.success("Configurações padrão restauradas!");
  };

  const categories = Array.from(new Set(prefs.map((p) => p.category)));

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-1 sm:p-2 animate-in fade-in duration-300 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
            Preferências de Notificações <Bell className="w-5 h-5 text-[var(--color-primary-blue)]" />
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1">
            Configure alertas em tempo real no painel, e-mail, WhatsApp e navegador para sua operação comercial.
          </p>
        </div>

        <Button
          onClick={handleTestNotification}
          variant="outline"
          size="sm"
          className="text-xs font-bold gap-1.5 h-9 shrink-0 shadow-xs hover:border-[var(--color-primary-blue)]"
        >
          <Send className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
          Testar Notificação
        </Button>
      </div>

      {/* 4 Cards de Canais Globais */}
      <div className="grid grid-cols-1 min-[450px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* In-App */}
        <Card className="p-3.5 sm:p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-row items-center justify-between gap-3 shadow-sm min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-xs text-[var(--color-text-primary)] truncate">No Painel (In-App)</h4>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">Sininho & Toasts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggleChannelAll("inApp", !generalInApp)}
            className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 shrink-0 border-none ${
              generalInApp ? "bg-[var(--color-primary-blue)]" : "bg-[var(--color-border-default)]"
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-xs transform duration-200 ${
                generalInApp ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </Card>

        {/* E-mails */}
        <Card className="p-3.5 sm:p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-row items-center justify-between gap-3 shadow-sm min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-xs text-[var(--color-text-primary)] truncate">E-mails</h4>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">Caixa de entrada</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggleChannelAll("email", !generalEmail)}
            className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 shrink-0 border-none ${
              generalEmail ? "bg-[var(--color-primary-blue)]" : "bg-[var(--color-border-default)]"
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-xs transform duration-200 ${
                generalEmail ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </Card>

        {/* WhatsApp */}
        <Card className="p-3.5 sm:p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-row items-center justify-between gap-3 shadow-sm min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500 shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-xs text-[var(--color-text-primary)] truncate">WhatsApp</h4>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">Mensagens diretas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggleChannelAll("whatsapp", !generalWhatsapp)}
            className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 shrink-0 border-none ${
              generalWhatsapp ? "bg-cyan-500" : "bg-[var(--color-border-default)]"
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-xs transform duration-200 ${
                generalWhatsapp ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </Card>

        {/* Sons & Alerta Sonoro */}
        <Card className="p-3.5 sm:p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-row items-center justify-between gap-3 shadow-sm min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] shrink-0">
              <Volume2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="font-bold text-xs text-[var(--color-text-primary)] truncate">Sons</h4>
                <button
                  type="button"
                  onClick={handleTestSound}
                  title="Ouvir som de teste"
                  className="text-[var(--color-primary-blue)] hover:brightness-110 p-0.5 rounded cursor-pointer border-none bg-transparent"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                </button>
              </div>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">Alerta sonoro</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleSound}
            className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 shrink-0 border-none ${
              soundEnabled ? "bg-[var(--color-primary-blue)]" : "bg-[var(--color-border-default)]"
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-xs transform duration-200 ${
                soundEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </Card>
      </div>

      {/* Push no Navegador (Web Notification) Banner */}
      <Card className="p-4 bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-[var(--color-text-primary)]">Alertas Nativos do Navegador (Web Push)</h4>
              {pushPermission === "granted" ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/30">
                  ✓ Ativo
                </span>
              ) : pushPermission === "denied" ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/30">
                  Bloqueado no navegador
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/30">
                  Não ativado
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Receba avisos instantâneos de novos leads e reuniões mesmo com o sistema em segundo plano.
            </p>
          </div>
        </div>

        {pushPermission !== "granted" && (
          <Button
            size="sm"
            onClick={handleRequestPush}
            className="text-xs font-bold h-8 px-3 shrink-0"
          >
            Ativar Alertas Nativos
          </Button>
        )}
      </Card>

      {/* Disparadores por Categoria */}
      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
        <div className="p-4 sm:p-5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
          <div>
            <h3 className="text-xs font-black text-[var(--color-primary-blue)] uppercase tracking-wider">
              Disparadores por Categoria
            </h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Defina os canais de entrega para cada evento de vendas e operação
            </p>
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider bg-[var(--color-surface-elevated)] px-2.5 py-1 rounded-md border border-[var(--color-border-subtle)]">
            Auto-salvamento ativo
          </span>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {categories.map((category) => (
            <div key={category}>
              <button
                type="button"
                className="w-full p-4 flex flex-row items-center justify-between gap-4 bg-[var(--color-surface-sunken)] hover:bg-[var(--color-surface-elevated)] transition-colors cursor-pointer border-none"
                onClick={() => setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))}
              >
                <h4 className="font-bold text-sm text-[var(--color-text-primary)] flex items-center gap-2">
                  <span>{category}</span>
                  <span className="text-xs font-normal text-[var(--color-text-muted)]">
                    ({prefs.filter((p) => p.category === category).length} gatilhos)
                  </span>
                </h4>
                {collapsed[category] ? (
                  <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-[var(--color-text-muted)]" />
                )}
              </button>

              {!collapsed[category] && (
                <div className="divide-y divide-[var(--color-border-subtle)]">
                  {prefs
                    .filter((p) => p.category === category)
                    .map((pref) => {
                      const IconComponent = iconMap[pref.id] || Target;
                      return (
                        <div
                          key={pref.id}
                          className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[var(--color-surface-sunken)]/50 transition-colors duration-150"
                        >
                          <div className="flex gap-3 sm:gap-4 items-start min-w-0 flex-1">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-primary-blue)] shrink-0 mt-0.5 shadow-2xs">
                              <IconComponent className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)]">
                                  {pref.category}
                                </span>
                                <h4 className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)] leading-snug">
                                  {pref.title}
                                </h4>
                              </div>
                              <p className="text-xs text-[var(--color-text-muted)] mt-1 mr-2 sm:mr-4">
                                {pref.description}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-4 sm:gap-6 md:gap-8 justify-between md:justify-end items-center shrink-0 border-t border-[var(--color-border-subtle)] pt-3 md:pt-0 md:border-none w-full md:w-auto">
                            {/* In-App */}
                            <div className="flex flex-col items-center gap-1.5 min-w-[50px]">
                              <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                                Painel
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggle(pref.id, "inApp")}
                                className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 shrink-0 border-none ${
                                  pref.inApp ? "bg-[var(--color-primary-blue)]" : "bg-[var(--color-border-default)]"
                                }`}
                              >
                                <div
                                  className={`bg-white w-4 h-4 rounded-full shadow-xs transform duration-200 ${
                                    pref.inApp ? "translate-x-4" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>

                            {/* Email */}
                            <div className="flex flex-col items-center gap-1.5 min-w-[50px]">
                              <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                                E-mail
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggle(pref.id, "email")}
                                className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 shrink-0 border-none ${
                                  pref.email ? "bg-[var(--color-primary-blue)]" : "bg-[var(--color-border-default)]"
                                }`}
                              >
                                <div
                                  className={`bg-white w-4 h-4 rounded-full shadow-xs transform duration-200 ${
                                    pref.email ? "translate-x-4" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>

                            {/* WhatsApp */}
                            <div className="flex flex-col items-center gap-1.5 min-w-[50px]">
                              <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                                Whats
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggle(pref.id, "whatsapp")}
                                className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 shrink-0 border-none ${
                                  pref.whatsapp ? "bg-cyan-500" : "bg-[var(--color-border-default)]"
                                }`}
                              >
                                <div
                                  className={`bg-white w-4 h-4 rounded-full shadow-xs transform duration-200 ${
                                    pref.whatsapp ? "translate-x-4" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-[var(--color-surface-sunken)] border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row justify-between items-center gap-3 w-full">
          <Button
            type="button"
            onClick={handleResetDefaults}
            variant="ghost"
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Padrões
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="h-9 px-6 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? "Salvando..." : "Salvar Preferências"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
