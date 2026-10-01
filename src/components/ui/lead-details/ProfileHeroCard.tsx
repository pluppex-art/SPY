import React, { useMemo } from "react";

const TEMP_CFG = {
  Quente: {
    gradient: "from-danger/20 via-danger/5 to-transparent",
    badge: "bg-danger/10 border-danger/25 text-danger",
    avatar: "bg-danger/20 text-danger ring-danger/40",
    emoji: "🔥",
  },
  Morno: {
    gradient: "from-warning/20 via-warning/5 to-transparent",
    badge: "bg-warning/10 border-warning/25 text-warning",
    avatar: "bg-warning/20 text-warning ring-warning/40",
    emoji: "☀️",
  },
  Frio: {
    gradient: "from-[var(--color-primary-blue)]/20 via-[var(--color-primary-blue)]/5 to-transparent",
    badge: "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/25 text-[var(--color-primary-blue)]",
    avatar: "bg-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] ring-[var(--color-primary-blue)]/40",
    emoji: "❄️",
  },
};

interface ProfileHeroCardProps {
  temperature: "Quente" | "Morno" | "Frio";
  companyName: string;
  leadName: string;
  displayValue: string;
  slaStatus: string;
  priority: "Alta" | "Média" | "Baixa";
  score: number;
  probability: number;
  timeIdle: string;
}

export function ProfileHeroCard({
  temperature,
  companyName,
  leadName,
  displayValue,
  slaStatus,
  priority,
  score,
  probability,
  timeIdle,
}: ProfileHeroCardProps) {
  const tc = TEMP_CFG[temperature] || TEMP_CFG.Frio;
  const probNum = Math.round(Number(probability) || 0);
  const timeIdleNum = parseInt(String(timeIdle)) || 0;

  return (
    <div className={`rounded-2xl border border-[var(--color-border-default)] overflow-hidden bg-gradient-to-br ${tc.gradient} bg-[var(--color-surface-elevated)]`}>
      <div className="p-4">
        {/* Top badges */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] px-2.5 py-1 rounded-full border font-black uppercase tracking-wider ${tc.badge}`}>
              {tc.emoji} {temperature}
            </span>
            <span className={`text-[9px] px-2.5 py-1 rounded-full border font-black uppercase tracking-wider ${
              slaStatus === "Em Dia"
                ? "bg-success/10 border-success/20 text-success"
                : slaStatus === "Crítico"
                ? "bg-warning/10 border-warning/20 text-warning"
                : "bg-danger/10 border-danger/20 text-danger"
            }`}>
              SLA · {slaStatus}
            </span>
          </div>
          <span className={`text-[9px] px-2.5 py-1 rounded-full border font-black uppercase tracking-wider ${
            priority === "Alta"
              ? "bg-danger/10 border-danger/20 text-danger"
              : priority === "Média"
              ? "bg-warning/10 border-warning/20 text-warning"
              : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)]"
          }`}>
            ▲ {priority}
          </span>
        </div>

        {/* Avatar + identity */}
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0 ring-2 ring-offset-2 ring-offset-[var(--color-surface-sunken)] ${tc.avatar}`}>
            {(companyName || leadName || "LD").substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black text-[var(--color-text-primary)] leading-tight truncate">
              {companyName || leadName || <span className="text-[var(--color-text-faint)] italic font-normal text-sm">Sem nome cadastrado</span>}
            </h3>
            {companyName && leadName && (
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">{leadName}</p>
            )}
            <div className="mt-2">
              <span className="text-2xl font-black text-[var(--color-primary-blue)] font-mono tracking-tight">{displayValue}</span>
            </div>
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[var(--color-surface)]/70 rounded-xl p-3 border border-[var(--color-border-subtle)]">
            <div className="text-[8px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Score</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-black text-[var(--color-primary-blue)]">{score}</span>
              <span className="text-[9px] text-[var(--color-text-faint)]">/100</span>
            </div>
            <div className="mt-2 h-1 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-primary-blue)] rounded-full transition-all duration-700"
                style={{ width: `${score}%` }}
              />
            </div>
          </div>

          <div className="bg-[var(--color-surface)]/70 rounded-xl p-3 border border-[var(--color-border-subtle)]">
            <div className="text-[8px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Conversão</div>
            <div className="mt-1">
              <span className={`text-xl font-black ${
                probNum >= 70 ? "text-success" : probNum >= 40 ? "text-warning" : "text-[var(--color-text-muted)]"
              }`}>{probNum}%</span>
            </div>
            <div className="mt-2 h-1 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  probNum >= 70 ? "bg-success" : probNum >= 40 ? "bg-warning" : "bg-[var(--color-border-default)]"
                }`}
                style={{ width: `${probNum}%` }}
              />
            </div>
          </div>

          <div className={`rounded-xl p-3 border ${
            timeIdleNum > 7
              ? "bg-danger/10 border-danger/20"
              : timeIdleNum > 3
              ? "bg-warning/10 border-warning/20"
              : "bg-[var(--color-surface)]/70 border-[var(--color-border-subtle)]"
          }`}>
            <div className="text-[8px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Parado</div>
            <div className={`text-xl font-black mt-1 ${
              timeIdleNum > 7 ? "text-danger" : timeIdleNum > 3 ? "text-warning" : "text-[var(--color-text-muted)]"
            }`}>{timeIdle || "0d"}</div>
            <div className="text-[8px] text-[var(--color-text-faint)] mt-1">sem contato</div>
          </div>
        </div>
      </div>
    </div>
  );
}
