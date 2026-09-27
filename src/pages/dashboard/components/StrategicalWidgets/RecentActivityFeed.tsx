import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Clock, UserPlus, FileText, Video, PartyPopper, CheckSquare, type LucideIcon } from 'lucide-react';
import { timeAgo } from '../../../../lib/utils';

export type ActivityKind = 'lead' | 'proposta' | 'reuniao' | 'cliente' | 'tarefa';

export interface FeedActivity {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string;
  ts: number;
}

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  lead: UserPlus,
  proposta: FileText,
  reuniao: Video,
  cliente: PartyPopper,
  tarefa: CheckSquare,
};
const KIND_COLOR: Record<ActivityKind, string> = {
  lead: 'text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10',
  proposta: 'text-amber-600 bg-amber-500/10',
  reuniao: 'text-purple-600 bg-purple-500/10',
  cliente: 'text-emerald-600 bg-emerald-500/10',
  tarefa: 'text-cyan-600 bg-cyan-500/10',
};

/** Últimas Atividades: mistura leads criados, propostas enviadas, reuniões concluídas, leads
 * fechados (clientes) e tarefas concluídas — cada uma com o timestamp real do próprio registro,
 * ordenadas juntas por data. Nada de log manual (que fica sub-preenchido): direto das tabelas. */
export function RecentActivityFeed({ activities }: { activities: FeedActivity[] }) {
  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm h-full flex flex-col">
      <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2 mb-5">
        <Clock className="w-4 h-4 text-[var(--color-primary-blue)]" /> Últimas Atividades
      </h3>
      {activities.length === 0 ? (
        <EmptyState icon={Clock} title="Nenhuma atividade ainda" description="Leads, propostas, reuniões e tarefas aparecem aqui assim que acontecerem." className="py-8 flex-1" />
      ) : (
        <div className="space-y-1 flex-1">
          {activities.map((a) => {
            const Icon = KIND_ICON[a.kind];
            return (
              <div key={a.id} className="flex items-start gap-3 py-2.5 border-b border-[var(--color-border-subtle)] last:border-0">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${KIND_COLOR[a.kind]}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{a.title}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] truncate">{a.description}</p>
                </div>
                <span className="text-[10px] text-[var(--color-text-faint)] font-mono whitespace-nowrap shrink-0 mt-0.5">{timeAgo(a.ts)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
