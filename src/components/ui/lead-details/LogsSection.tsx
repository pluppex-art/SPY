import React from "react";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { Badge } from "../badge";
import { ShieldCheck } from "lucide-react";

interface LogsSectionProps {
  alterationLogs: any[];
}

export function LogsSection({ alterationLogs }: LogsSectionProps) {
  return (
    <div className="px-5 py-4 space-y-4 animate-in fade-in duration-200">
      <Card className="p-4 space-y-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--color-primary-blue)]" /> Auditoria & Histórico de Modificações
          </h4>
          <Badge variant="secondary" className="text-[9px]">LGPD Audit</Badge>
        </div>

        {alterationLogs.length > 0 ? (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--color-border-default)]">
            {alterationLogs.map((log) => (
              <div key={log.id} className="relative text-xs">
                <div className="absolute -left-[22px] top-1 w-3.5 h-3.5 rounded-full border border-[var(--color-primary-blue)] bg-[var(--color-surface-elevated)] flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-blue)] animate-pulse"></span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-[var(--color-text-primary)] font-bold leading-normal">{log.desc}</p>
                    <span className="text-[10px] text-[var(--color-text-muted)] mt-0.5 block">
                      Operador: <strong className="text-[var(--color-text-primary)]">{log.author}</strong>
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-faint)] font-mono whitespace-nowrap">{log.time}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="Nenhum registro de auditoria"
            description="Alterações realizadas neste lead serão registradas aqui automaticamente."
            className="py-6"
          />
        )}
      </Card>
    </div>
  );
}
