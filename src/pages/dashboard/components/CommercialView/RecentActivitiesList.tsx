import { Card } from '../../../../components/ui/card';
import { Eye, MessageSquare, Users, Zap, Target, AlertCircle } from 'lucide-react';
import { Badge } from '../../../../components/ui/badge';
import { EmptyState } from '../../../../components/ui/empty-state';

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  'Ligação': Users,
  'Reunião': Zap,
  'E-mail': MessageSquare,
  'Visita': Target,
  'Nota': AlertCircle,
};

interface Activity {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  seller?: string;
}

export function RecentActivitiesList({ recentActivities }: { recentActivities: Activity[] }) {
  const hasActivities = recentActivities.length > 0;

  return (
    <Card className="lg:col-span-2 p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
          <Eye className="w-4 h-4 text-[var(--color-primary-blue)]" /> Atividades Recentes do Time
        </h3>
        <Badge variant="success" dot dotPulse>
          Tempo Real
        </Badge>
      </div>

      {!hasActivities ? (
        <EmptyState
          icon={Zap}
          title="Nenhuma atividade registrada"
          description="Registre ligações, reuniões e e-mails nos leads para ver a linha do tempo."
          className="py-10"
        />
      ) : (
        <div className="space-y-3">
          {recentActivities.map((activity) => {
            const Icon = ACTIVITY_ICONS[activity.type] || Zap;
            return (
              <div
                key={activity.id}
                className="flex items-start gap-3.5 p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:border-[var(--color-primary-blue)]/40 rounded-[var(--radius-control)] transition-all cursor-pointer group"
              >
                <div className="p-2.5 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary-blue)] transition-colors">
                      {activity.title}
                    </h4>
                    <span className="text-[10px] text-[var(--color-text-faint)] font-mono">{activity.date}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">{activity.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
