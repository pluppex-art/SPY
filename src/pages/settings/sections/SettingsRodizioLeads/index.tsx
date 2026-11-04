import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Shuffle, FileText, Users } from "lucide-react";
import { useAuth } from "../../../../contexts/AuthContext";
import { TabClosersCRM } from "./TabClosersCRM";
import { TabFormularioSDR } from "./TabFormularioSDR";

const TABS = [
  { key: "formulario", label: "Formulário – SDRs", icon: <FileText className="w-3.5 h-3.5" /> },
  { key: "closers",    label: "CRM – Closers",      icon: <Users    className="w-3.5 h-3.5" /> },
] as const;

export function ConfigRodizioLeads() {
  const { user, tenantIdMap } = useAuth();
  const tenantId = user?.tenantName ? tenantIdMap[user.tenantName] : "default-tenant";
  const [tab, setTab] = useState<"closers" | "formulario">("formulario");

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Rodízio de Leads <Shuffle className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">Configure a distribuição automática de leads entre SDRs e Closers com base em capacidade e tags.</p>
      </div>

      <div className="flex items-center gap-1.5 p-1 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl w-fit max-w-full overflow-x-auto scrollbar-none [&>*]:shrink-0 [&>*]:whitespace-nowrap shadow-sm">
        {TABS.map(t => (
          <button 
            key={t.key} 
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${tab === t.key ? "bg-[var(--color-primary-blue)] !text-white shadow-xs" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          {tab === "closers" && <TabClosersCRM />}
          {tab === "formulario" && <TabFormularioSDR tenantId={tenantId} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
