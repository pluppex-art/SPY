import { Clock, Flame, MessageSquare, Info, Package, ScrollText, Sun, StickyNote, ListTodo } from "lucide-react";

// Removidas as abas "Chat" (mensagens — composição de template pra copiar/colar
// manualmente, nunca teve envio real de WhatsApp/e-mail/Instagram) e "Relatório
// IA" (relatorio/SdrReportSection) a pedido do usuário — o painel "IA Copilot"
// (ícone de cérebro no cabeçalho do modal, LeadCopilot.tsx) é um recurso
// separado e continua existindo.
export const LeadDetailsModalTabs = [
  { id: "informacoes", label: "Informações",  short: "INFO",     icon: Info          },
  { id: "notas",       label: "Notas",        short: "NOTAS",    icon: StickyNote    },
  { id: "tarefas",     label: "Tarefas",      short: "TAREFAS",  icon: ListTodo      },
  { id: "conversas",   label: "Conversas",    short: "CONV.",    icon: MessageSquare },
  { id: "historico",   label: "Histórico",    short: "HIST.",    icon: Clock         },
  { id: "produtos",    label: "Produtos",     short: "PROD.",    icon: Package       },
  { id: "logs",        label: "Logs",         short: "LOGS",     icon: ScrollText    },
] as const;

export const LeadDetailsTempCfg = {
  Quente: {
    stripe: "from-rose-500 via-orange-400 to-rose-500/0",
    hero: "from-rose-500/5 via-transparent to-transparent",
    avatar: "bg-rose-500/10 text-rose-500 ring-rose-500/30 border border-rose-500/20",
    badge: "bg-rose-500/10 border-rose-500/25 text-rose-500",
    icon: Flame,
    iconCls: "text-rose-500",
    label: "Quente",
    dot: "bg-rose-500",
  },
  Morno: {
    stripe: "from-amber-400 via-yellow-300 to-amber-400/0",
    hero: "from-amber-500/5 via-transparent to-transparent",
    avatar: "bg-amber-500/10 text-amber-500 ring-amber-500/30 border border-amber-500/20",
    badge: "bg-amber-500/10 border-amber-500/25 text-amber-500",
    icon: Sun,
    iconCls: "text-amber-500",
    label: "Morno",
    dot: "bg-amber-500",
  },
  Frio: {
    stripe: "from-blue-500 via-cyan-400 to-blue-500/0",
    hero: "from-blue-500/5 via-transparent to-transparent",
    avatar: "bg-blue-500/10 text-[var(--color-primary-blue)] ring-blue-500/30 border border-blue-500/20",
    badge: "bg-blue-500/10 border-blue-500/25 text-[var(--color-primary-blue)]",
    icon: Sun,
    iconCls: "text-[var(--color-primary-blue)]",
    label: "Frio",
    dot: "bg-[var(--color-primary-blue)]",
  },
} as const;
