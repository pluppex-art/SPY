import { Card } from "../../../components/ui/card";
import { Database } from "lucide-react";
import { useAmbientes } from "../hooks/useAmbientes";

const STATUS_LABEL: Record<string, string> = {
  operacional: "Operacional",
  degradado: "Degradado",
  offline: "Offline",
  "em deploy": "Em Deploy",
};

const STATUS_COLOR: Record<string, string> = {
  operacional: "bg-emerald-500",
  degradado: "bg-amber-500",
  offline: "bg-rose-500",
  "em deploy": "bg-amber-500",
};

export function DevEnvironmentStatus() {
  const { environments, loading } = useAmbientes();

  return (
    <Card className="p-5 sm:p-8">
      <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-widest mb-6 flex items-center gap-2">
        <Database className="w-4 h-4" /> Status dos Ambientes
      </h3>
      {loading ? (
        <p className="text-xs text-slate-500">Carregando...</p>
      ) : environments.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhum ambiente cadastrado ainda.</p>
      ) : (
        <div className="space-y-4">
          {environments.map((env) => (
            <div key={env.id} className="flex items-center justify-between p-3 bg-[var(--color-surface-sunken)] rounded-xl border border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${STATUS_COLOR[env.status] || 'bg-slate-500'} ${env.status === 'operacional' ? 'animate-pulse' : ''}`} />
                <div>
                  <p className="text-xs font-black text-[var(--color-text-primary)]">{env.name}</p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{env.version}</p>
                </div>
              </div>
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${env.status === "operacional" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                {STATUS_LABEL[env.status] || env.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
