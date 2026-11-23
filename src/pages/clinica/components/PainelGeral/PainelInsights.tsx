import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Zap, ShieldCheck, Inbox, BellRing, CalendarPlus } from "lucide-react";

interface Appointment {
  id: string;
  patient: string;
  drName: string;
  time: string;
  status: string;
  phone?: string;
}

interface PainelInsightsProps {
  totalAppointments: number;
  confirmed: number;
  late: number;
  activeToday: Appointment[];
  onNewBooking: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  'Finalizado': 'bg-emerald-500', 'Em Atendimento': 'bg-blue-500',
  'Confirmado': 'bg-cyan-500', 'Aguardando': 'bg-amber-500',
  'Atrasado': 'bg-rose-500', 'Cancelado': 'bg-slate-500',
};
const STATUS_TEXT: Record<string, string> = {
  'Finalizado': 'text-emerald-500', 'Em Atendimento': 'text-blue-500',
  'Confirmado': 'text-cyan-400', 'Aguardando': 'text-amber-500',
  'Atrasado': 'text-rose-500', 'Cancelado': 'text-slate-500',
};

export function PainelInsights({ totalAppointments, confirmed, late, activeToday, onNewBooking }: PainelInsightsProps) {
  const lateList = activeToday.filter(a => a.status === 'Atrasado');
  const buildReminderLink = (a: Appointment) => {
    const phoneRaw = (a.phone || '').replace(/\D/g, '');
    const text = encodeURIComponent(`Olá, ${a.patient}! Notamos que seu horário das ${a.time} com ${a.drName} está atrasado. Você ainda vai comparecer?`);
    return phoneRaw ? `https://wa.me/55${phoneRaw}?text=${text}` : null;
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] relative overflow-hidden group shadow-sm">
        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:rotate-6 transition-transform">
          <ShieldCheck className="w-24 h-24 text-[var(--color-primary-blue)]" />
        </div>
        <h4 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-[var(--color-primary-blue)]" /> Inteligência Operacional Clínica
        </h4>
        <div className="space-y-3">
          {late > 0 && (
            <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-[var(--radius-panel)] space-y-3">
              <h5 className="text-xs font-bold text-[var(--color-text-primary)] mb-1 flex items-center gap-1.5">
                ⚠️ Atrasos Detectados
              </h5>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {late} paciente(s) com horário ultrapassado.
              </p>
              <div className="space-y-1.5">
                {lateList.map((a) => {
                  const link = buildReminderLink(a);
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">{a.patient}</span>
                      {link ? (
                        <Button variant="danger" size="sm" className="h-7 font-bold text-[10px] gap-1 shrink-0" onClick={() => window.open(link, "_blank")}>
                          <BellRing className="w-3 h-3" /> Lembrete
                        </Button>
                      ) : (
                        <span className="text-[10px] text-[var(--color-text-faint)] shrink-0">sem telefone cadastrado</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {totalAppointments === 0 && (
            <div className="p-4 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-panel)]">
              <h5 className="text-xs font-bold text-[var(--color-text-primary)] mb-1">
                📅 Agenda do Dia Pronta
              </h5>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mb-3">
                Nenhum atendimento em andamento no momento. Agende novos atendimentos clínicos.
              </p>
              <Button onClick={onNewBooking} size="sm" className="h-8 font-bold text-xs gap-1.5 shadow-xs">
                <CalendarPlus className="w-3.5 h-3.5" /> Novo Agendamento
              </Button>
            </div>
          )}
          {totalAppointments > 0 && late === 0 && (
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-[var(--radius-panel)]">
              <h5 className="text-xs font-bold text-[var(--color-text-primary)] mb-1">
                ✅ Operação Pontual
              </h5>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {totalAppointments} atendimentos registrados ({confirmed} confirmados) com fila de espera sob controle.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--color-border-subtle)]">
          <h4 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">
            Jornada do Paciente (Tempo Real)
          </h4>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)] animate-pulse" />
            <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase">Hoje</span>
          </div>
        </div>
        {activeToday.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 opacity-50">
            <Inbox className="w-8 h-8 text-[var(--color-text-faint)]" />
            <p className="text-xs font-bold text-[var(--color-text-muted)] text-center">
              Nenhum paciente agendado para hoje.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {activeToday.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-1 h-8 rounded-full ${STATUS_COLORS[p.status] || 'bg-slate-500'}`} />
                  <div>
                    <p className="text-xs font-bold text-[var(--color-text-primary)]">{p.patient}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-medium flex items-center gap-1.5">
                      {p.drName} • {p.time}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${STATUS_TEXT[p.status] || 'text-[var(--color-text-muted)]'}`}>
                    {p.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
