import { Button } from "../../../../components/ui/button";
import { Plus, ChevronDown, ChevronUp, LayoutDashboard, TrendingUp, Users2, Users, History } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { TeamMember } from "../../hooks/useEquipe";

interface EquipeSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  newSquadExpanded: boolean;
  onToggleNewSquad: () => void;
  newSquadData: { name: string; leader: string };
  onNewSquadDataChange: (data: { name: string; leader: string }) => void;
  team: TeamMember[];
  onAddSquad: (data: { name: string; leader: string }) => Promise<void>;
  onNewSquadDone: () => void;
}

const NAV_ITEMS = [
  { label: "Visão Geral", id: "visao-geral", icon: LayoutDashboard },
  { label: "Performance", id: "performance", icon: TrendingUp },
  { label: "Squads", id: "squads", icon: Users2 },
  { label: "Membros", id: "membros", icon: Users },
  { label: "Audit Logs", id: "logs", icon: History },
];

export function EquipeSidebar({
  activeTab, onTabChange,
  newSquadExpanded, onToggleNewSquad,
  newSquadData, onNewSquadDataChange,
  team, onAddSquad, onNewSquadDone,
}: EquipeSidebarProps) {
  return (
    <nav className="w-full lg:w-64 bg-[var(--color-surface)] border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col pt-4 lg:pt-6 shrink-0 z-20 lg:sticky lg:top-0 lg:h-[calc(100dvh-80px)] print:hidden">
      <div className="px-4 lg:px-6 mb-2 lg:mb-4 pb-2 lg:pb-0 hidden lg:block">
        <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Gestão de Equipe</h2>
      </div>

      <div className="px-2 pb-2 lg:pb-0 space-y-0 lg:space-y-0.5 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible shrink-0">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-fit lg:w-full flex shrink-0 items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2 text-xs lg:text-sm font-medium rounded-xl transition-all duration-200 group ${
              activeTab === item.id
                ? "bg-blue-600/10 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <item.icon className={`w-3.5 h-3.5 lg:w-4 lg:h-4 transition-colors ${activeTab === item.id ? "text-blue-500" : "text-slate-600 group-hover:text-slate-500"}`} />
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="pt-8 px-6 hidden lg:block">
        <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">Ações Rápidas</h2>
        <div className="space-y-2">
          <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${newSquadExpanded ? "border-white/10 bg-white/5" : "border-white/5 bg-transparent"}`}>
            <button
              onClick={onToggleNewSquad}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Squad</span>
              </div>
              {newSquadExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <AnimatePresence>
              {newSquadExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-3 pb-3 space-y-2"
                >
                  <input
                    placeholder="Nome da Squad"
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-[11px] text-white outline-none focus:border-blue-500 transition-colors"
                    value={newSquadData.name}
                    onChange={(e) => onNewSquadDataChange({ ...newSquadData, name: e.target.value })}
                  />
                  <select
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-[11px] text-white outline-none focus:border-blue-500 transition-colors"
                    value={newSquadData.leader}
                    onChange={(e) => onNewSquadDataChange({ ...newSquadData, leader: e.target.value })}
                  >
                    <option value="">Líder...</option>
                    {team.map((m) => <option key={m.id ?? m.name} value={m.name}>{m.name}</option>)}
                  </select>
                  <Button
                    size="sm"
                    className="w-full h-8 text-[11px] font-bold bg-blue-600 hover:bg-blue-700"
                    onClick={async () => {
                      if (newSquadData.name) {
                        await onAddSquad({ name: newSquadData.name, leader: newSquadData.leader });
                        onNewSquadDone();
                      }
                    }}
                  >
                    Confirmar
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </nav>
  );
}
