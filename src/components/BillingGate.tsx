import { AlertTriangle, Lock, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useBillingStatus } from "../hooks/useBillingStatus";
import { fmtDate } from "../lib/saasApi";

/**
 * Faixa de aviso (teste acabando / pagamento em atraso) e bloqueio total quando a assinatura está
 * suspensa ou cancelada. Master/parceiro nunca ficam trancados (precisam trocar de empresa e regularizar);
 * para eles vira só um aviso. Tenant sem assinatura = sem faixa nenhuma. Falha ao consultar = não bloqueia.
 */
export function BillingBanner() {
  const { status } = useBillingStatus();
  const { user } = useAuth();
  const sub = status?.subscription;
  if (!status || !sub) return null;

  const daysLeft = (iso?: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000) : null);

  if (status.blocked && user?.isMaster) {
    return (
      <div className="bg-danger/15 border-b border-danger/30 text-danger text-xs px-4 py-2 flex items-center gap-2">
        <Lock className="w-3.5 h-3.5" /> Esta empresa está com a assinatura {sub.status === "canceled" ? "cancelada" : "suspensa"} (visível só para administradores).
        <Link to="/app/admin?tab=subscriptions" className="underline font-semibold ml-1">Gerenciar assinatura</Link>
      </div>
    );
  }
  if (sub.status === "past_due") {
    return (
      <div className="bg-warning/15 border-b border-warning/30 text-warning text-xs px-4 py-2 flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5" /> Pagamento em atraso. Regularize para evitar a suspensão do acesso.
        <Link to="/app/configuracoes/empresa/plano" className="underline font-semibold ml-1">Ver plano</Link>
      </div>
    );
  }
  if (sub.status === "trial") {
    const d = daysLeft(sub.trial_ends_at);
    if (d !== null && d <= 5 && d >= 0) {
      return (
        <div className="bg-info/15 border-b border-info/30 text-info text-xs px-4 py-2 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" /> Seu período de teste termina em {d === 0 ? "hoje" : `${d} dia${d > 1 ? "s" : ""}`} ({fmtDate(sub.trial_ends_at)}).
          <Link to="/app/configuracoes/empresa/plano" className="underline font-semibold ml-1">Ver plano</Link>
        </div>
      );
    }
  }
  return null;
}

export function SuspendedScreen() {
  const { logout } = useAuth();
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-danger/10 border border-danger/25 flex items-center justify-center">
          <Lock className="w-6 h-6 text-danger" />
        </div>
        <h1 className="text-xl font-black text-[var(--color-text-primary)]">Acesso suspenso</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          A assinatura desta empresa está suspensa. Seus dados continuam guardados e o acesso volta assim que o pagamento for regularizado.
          Fale com o responsável pela sua conta.
        </p>
        <button onClick={logout} className="text-sm underline text-[var(--color-text-muted)]">Sair</button>
      </div>
    </div>
  );
}

/** true = a empresa ativa está bloqueada e o usuário NÃO é master (ver SuspendedScreen). */
export function useIsBlocked(): boolean {
  const { status } = useBillingStatus();
  const { user } = useAuth();
  return !!status?.blocked && !user?.isMaster;
}
