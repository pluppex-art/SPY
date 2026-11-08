import { X, UserPlus, Trophy, Users } from "lucide-react";
import { Squad } from "../../../../types";

interface SquadDetailPanelProps {
  selectedSquad: Squad | null;
  detailTab: "membros" | "clientes";
  onTabChange: (tab: "membros" | "clientes") => void;
  colaboradores: any[];
  clienteBase: any[];
  addMemberName: string;
  setAddMemberName: (v: string) => void;
  addMemberRole: "Membro" | "Gestor";
  setAddMemberRole: (v: "Membro" | "Gestor") => void;
  addClientId: string;
  setAddClientId: (v: string) => void;
  onAddMember: () => void;
  onRemoveMember: (nome: string) => void;
  onAddClient: () => void;
  onRemoveClient: (id: string) => void;
  /** Quem só pode ver o squad não adiciona nem remove membros/clientes. */
  somenteLeitura?: boolean;
}

export function SquadDetailPanel({
  selectedSquad, detailTab, onTabChange, colaboradores, clienteBase,
  addMemberName, setAddMemberName, addMemberRole, setAddMemberRole,
  addClientId, setAddClientId, onAddMember, onRemoveMember, onAddClient, onRemoveClient, somenteLeitura = false,
}: SquadDetailPanelProps) {
  if (!selectedSquad) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-3">
        <Users className="w-12 h-12 opacity-20" />
        <p className="italic text-sm">Selecione um squad para ver os detalhes.</p>
      </div>
    );
  }

  const cor = selectedSquad.cor || "#6366f1";

  return (
    <>
      {/* Panel header */}
      <div className="px-6 pt-5 pb-4 border-b border-white/5" style={{ borderLeft: `4px solid ${cor}` }}>
        <div className="flex items-center gap-3">
          {selectedSquad.logo ? (
            <img loading="lazy" decoding="async" src={selectedSquad.logo} className="w-10 h-10 rounded-xl object-cover" alt="logo" />
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${cor}20`, border: `1px solid ${cor}40` }}>
              <Trophy className="w-5 h-5" style={{ color: cor }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-white uppercase tracking-tight truncate">{selectedSquad.nome}</h2>
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: cor }}>{selectedSquad.departamento || "Geral"}</span>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-0.5">Gestor</div>
            <div className="text-sm font-bold text-slate-200">{selectedSquad.leader || "—"}</div>
          </div>
        </div>
        {selectedSquad.focoComercial && (
          <p className="text-xs text-slate-400 mt-3 italic leading-relaxed">"{selectedSquad.focoComercial}"</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 px-6">
        {(["membros", "clientes"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`py-3.5 px-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
              detailTab === tab ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "membros"
              ? `Membros (${(selectedSquad.membros ?? []).length})`
              : `Clientes (${(selectedSquad.clientes ?? []).length})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2.5">
        {detailTab === "membros" ? (
          <>
            {(selectedSquad.membros ?? []).length === 0 ? (
              <p className="text-sm text-slate-600 italic text-center py-8">Nenhum membro adicionado ainda.</p>
            ) : (
              (selectedSquad.membros ?? []).map((nome, idx) => {
                const funcao = (selectedSquad.membrosFuncoes ?? {})[nome] || "Membro";
                return (
                  <div key={idx} className="flex items-center justify-between p-3.5 bg-white/5 rounded-xl border border-white/5 group transition-all hover:border-white/10">
                    <span className="text-sm font-bold text-white">{nome}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full ${funcao === "Gestor" ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300"}`}>
                        {funcao}
                      </span>
                      {!somenteLeitura && <button onClick={() => onRemoveMember(nome)} className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <X className="w-3 h-3" />
                      </button>}
                    </div>
                  </div>
                );
              })
            )}
            {!somenteLeitura && <div className="pt-4 border-t border-white/5 space-y-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Adicionar Membro</p>
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-3">
                  <select value={addMemberName} onChange={e => setAddMemberName(e.target.value)} className="w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none transition-all">
                    <option value="">Usuário...</option>
                    {colaboradores.filter((c: any) => !(selectedSquad.membros ?? []).includes(c.nome)).map((c: any) => (
                      <option key={c.id} value={c.nome}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <select value={addMemberRole} onChange={e => setAddMemberRole(e.target.value as "Membro" | "Gestor")} className="w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none transition-all">
                    <option value="Membro">Membro</option>
                    <option value="Gestor">Gestor</option>
                  </select>
                </div>
              </div>
              <button onClick={onAddMember} disabled={!addMemberName} className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2">
                <UserPlus className="w-4 h-4" /> Adicionar à Equipe
              </button>
            </div>}
          </>
        ) : (
          <>
            {(selectedSquad.clientes ?? []).length === 0 ? (
              <p className="text-sm text-slate-600 italic text-center py-8">Nenhum cliente atribuído ainda.</p>
            ) : (
              (selectedSquad.clientes ?? []).map((clientId, idx) => {
                const cliente = clienteBase.find((c: any) => c.id === clientId);
                if (!cliente) return null;
                return (
                  <div key={idx} className="flex items-center justify-between p-3.5 bg-white/5 rounded-xl border border-white/5 group transition-all hover:border-white/10">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">{cliente.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {cliente.industry}
                        {(cliente.city || cliente.state) && ` · ${cliente.city && cliente.state ? `${cliente.city}, ${cliente.state}` : (cliente.city || cliente.state)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border ${cliente.status === 'Ativo' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : 'bg-slate-700/50 text-slate-400 border-slate-600/30'}`}>
                        {cliente.status}
                      </span>
                      {!somenteLeitura && <button onClick={() => onRemoveClient(clientId)} className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <X className="w-3 h-3" />
                      </button>}
                    </div>
                  </div>
                );
              })
            )}
            {!somenteLeitura && <div className="pt-4 border-t border-white/5 space-y-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Atribuir Cliente</p>
              <select value={addClientId} onChange={e => setAddClientId(e.target.value)} className="w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none transition-all">
                <option value="">Selecionar cliente...</option>
                {clienteBase.filter((c: any) => !(selectedSquad.clientes ?? []).includes(c.id)).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.industry}</option>
                ))}
              </select>
              <button onClick={onAddClient} disabled={!addClientId} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all">
                Atribuir ao Squad
              </button>
            </div>}
          </>
        )}
      </div>
    </>
  );
}
