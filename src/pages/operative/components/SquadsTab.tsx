import { useState } from "react";
import { motion } from "motion/react";
import { Users2, Users, UserPlus, Trophy, Shield, Zap } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { TeamMember, Squad } from "../hooks/useEquipe";

const SQUAD_THEMES = [
  { from: "from-indigo-800", via: "via-blue-900", to: "to-slate-950", accent: "text-blue-300", ring: "ring-blue-500/50", dot: "bg-blue-400" },
  { from: "from-emerald-800", via: "via-teal-900", to: "to-slate-950", accent: "text-emerald-300", ring: "ring-emerald-500/50", dot: "bg-emerald-400" },
  { from: "from-violet-800", via: "via-purple-900", to: "to-slate-950", accent: "text-violet-300", ring: "ring-violet-500/50", dot: "bg-violet-400" },
  { from: "from-rose-800", via: "via-pink-900", to: "to-slate-950", accent: "text-rose-300", ring: "ring-rose-500/50", dot: "bg-rose-400" },
  { from: "from-amber-800", via: "via-orange-900", to: "to-slate-950", accent: "text-amber-300", ring: "ring-amber-500/50", dot: "bg-amber-400" },
];

const ROLE_BADGE: Record<string, string> = {
  Gestor: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  Closer: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  SDR: "bg-violet-500/20 text-violet-400 border border-violet-500/30",
  Membro: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
};

const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-blue-600",
];

interface SquadsTabProps {
  squads: Squad[];
  team: TeamMember[];
  expandedSquads: string[];
  toggleSquad: (squadName: string) => void;
  moveMember: (name: string, newSquad: string) => void;
}

export function SquadsTab({ squads, team, moveMember }: SquadsTabProps) {
  const [selectedSquad, setSelectedSquad] = useState<string>(squads[0]?.name ?? "");
  const [addUser, setAddUser] = useState("");

  const selected = squads.find(s => s.name === selectedSquad);
  const members = team.filter(m => m.squad === selectedSquad);
  const outside = team.filter(m => m.squad !== selectedSquad);

  function handleAdd() {
    if (!addUser || !selectedSquad) return;
    moveMember(addUser, selectedSquad);
    setAddUser("");
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black text-white tracking-tighter">Gestão de Squads</h2>
        <p className="text-sm text-slate-400 mt-2">Células dinâmicas de conversão e atendimento especializado.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Squad Cards Grid */}
        <div className="lg:col-span-2">
          {squads.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl gap-3">
              <Users2 className="w-10 h-10 text-slate-700" />
              <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Nenhuma squad criada</p>
              <p className="text-xs text-slate-600">Use o painel lateral para criar sua primeira squad</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {squads.map((squad, i) => {
                const theme = SQUAD_THEMES[i % SQUAD_THEMES.length];
                const count = team.filter(m => m.squad === squad.name).length;
                const isActive = selectedSquad === squad.name;

                return (
                  <motion.button
                    key={squad.name}
                    onClick={() => setSelectedSquad(squad.name)}
                    className={`relative h-60 rounded-3xl overflow-hidden text-left transition-all ${
                      isActive ? `ring-2 ${theme.ring} shadow-2xl` : "opacity-80 hover:opacity-100"
                    }`}
                    whileHover={{ scale: isActive ? 1 : 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Background gradient */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${theme.from} ${theme.via} ${theme.to}`} />

                    {/* Large decorative letter */}
                    <div className="absolute -bottom-4 -right-4 text-[140px] font-black text-white/5 leading-none select-none pointer-events-none">
                      {squad.name?.[0]}
                    </div>

                    {/* Trophy icon decoration */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.07]">
                      <Trophy className="w-32 h-32 text-white" />
                    </div>

                    {/* Top badge */}
                    <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/30 backdrop-blur-sm rounded-full border border-white/10">
                        <div className={`w-1.5 h-1.5 rounded-full ${isActive ? `${theme.dot} animate-pulse` : "bg-white/30"}`} />
                        <span className="text-[9px] font-black text-white uppercase tracking-widest">{squad.name}</span>
                      </div>
                      <div className="flex items-center gap-1 px-2.5 py-1 bg-black/30 backdrop-blur-sm rounded-full border border-white/10">
                        <Users2 className="w-3 h-3 text-white/60" />
                        <span className="text-[9px] font-black text-white">{count}</span>
                      </div>
                    </div>

                    {/* Bottom info */}
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <h3 className="text-2xl font-black text-white tracking-tighter uppercase leading-none">
                        {squad.name}
                      </h3>
                      {squad.leader && (
                        <p className={`text-xs font-bold mt-1.5 ${theme.accent} opacity-80`}>
                          Líder: {squad.leader}
                        </p>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* Member Panel — key fixo: trocar de squad só troca o conteúdo, sem
            desmontar/remontar o motion.div (evita a dança de exit/enter do
            Framer Motion, que nesse ponto causava o crash de insertBefore) */}
          {selectedSquad && selected && (
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-[var(--color-surface-elevated)]/80 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-widest">Membros</h4>
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5">{members.length} na squad</p>
                </div>
                <div className="p-2 bg-white/5 rounded-xl">
                  <Users className="w-4 h-4 text-slate-400" />
                </div>
              </div>

              {/* Member list */}
              <div className="flex-1 p-3 space-y-1.5 max-h-[320px] overflow-y-auto custom-scrollbar">
                {members.map((m, i) => (
                  <motion.div
                    key={m.id ?? `${m.name}-${i}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-transparent hover:border-white/5 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]} flex items-center justify-center text-[10px] font-black text-white shrink-0`}>
                        {m.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </div>
                      <span className="text-xs font-bold text-white leading-tight">{m.name}</span>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${ROLE_BADGE[m.role] || ROLE_BADGE.Membro}`}>
                      {m.role}
                    </span>
                  </motion.div>
                ))}

                {members.length === 0 && (
                  <div className="py-10 flex flex-col items-center justify-center gap-2 opacity-40">
                    <Users className="w-6 h-6 text-slate-600" />
                    <p className="text-[10px] font-black text-slate-500 uppercase">Sem membros</p>
                  </div>
                )}
              </div>

              {/* Add to squad */}
              <div className="p-4 border-t border-white/5 space-y-3">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Adicionar à Equipe</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Usuário</label>
                    <select
                      value={addUser}
                      onChange={e => setAddUser(e.target.value)}
                      className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-2.5 py-2 text-[11px] text-white outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="">Adicionar...</option>
                      {outside.map(m => (
                        <option key={m.name} value={m.name}>{m.name.split(' ')[0]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Função</label>
                    <select className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-2.5 py-2 text-[11px] text-white outline-none focus:border-blue-500 transition-colors">
                      {['Membro', 'Closer', 'SDR', 'Gestor'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={!addUser}
                  className="w-full h-10 bg-emerald-600/80 hover:bg-emerald-600 text-white font-black text-[9px] uppercase tracking-[0.2em] rounded-xl disabled:opacity-30 gap-2"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Adicionar à Equipe
                </Button>
              </div>
            </motion.div>
          )}
      </div>

      {/* Stats row */}
      {squads.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Users2, label: "Total Squads", value: squads.length, color: "text-indigo-500" },
            { icon: Users, label: "Total Membros", value: team.length, color: "text-emerald-500" },
            { icon: Shield, label: "Líderes Ativos", value: squads.filter(s => s.leader).length, color: "text-blue-500" },
            { icon: Zap, label: "Média / Squad", value: squads.length > 0 ? (team.length / squads.length).toFixed(1) : "0", color: "text-amber-500" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all">
                <stat.icon className={`w-5 h-5 ${stat.color} mb-2 sm:mb-3`} />
                <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{stat.value}</div>
                <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">{stat.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
