import { AlertTriangle, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useBillingStatus } from "../hooks/useBillingStatus";

/** "2026-12-10" → "10/12/2026" (sem conversão de fuso). */
const diaBr = (dia?: string | null) => (dia ? dia.split("-").reverse().join("/") : "");

/**
 * Faixa de aviso (15 dias antes do vencimento) e bloqueio total a partir do dia do vencimento, ou quando a assinatura está
 * suspensa ou cancelada. Master/parceiro nunca ficam trancados (precisam trocar de empresa e regularizar);
 * para eles vira só um aviso. Tenant sem assinatura = sem faixa nenhuma. Falha ao consultar = não bloqueia.
 */
export function BillingBanner() {
  const { status } = useBillingStatus();
  const { user } = useAuth();
  const sub = status?.subscription;
  const situacao = status?.situacao;
  if (!status) return null;

  if (status.blocked && user?.isMaster) {
    return (
      <div className="bg-danger/15 border-b border-danger/30 text-danger text-xs px-4 py-2 flex items-center gap-2">
        <Lock className="w-3.5 h-3.5" /> {situacao?.estado === "excluir" ? `Empresa pronta para exclusão (${situacao.diasAtraso} dias de atraso).` : situacao?.motivo === "manual" ? "Empresa desabilitada manualmente." : "Empresa desabilitada por falta de pagamento."} Você vê porque é administrador.
        <Link to="/app/admin?tab=tenants" className="underline font-semibold ml-1">Gerenciar empresas</Link>
      </div>
    );
  }
  if (situacao?.estado === "aviso") {
    const d = situacao.diasParaDesabilitar ?? 0;
    return (
      <div className="bg-warning/15 border-b border-warning/30 text-warning text-xs px-4 py-2 flex items-center gap-2 flex-wrap">
        <AlertTriangle className="w-3.5 h-3.5" /> {sub?.status === "trial" ? "Seu período de teste termina" : "Sua mensalidade vence"} em <strong>{d} {d === 1 ? "dia" : "dias"}</strong> ({diaBr(situacao.vencimento)}). Sem o pagamento, o acesso é bloqueado nessa data.
        <Link to="/checkout?renovar=1" className="underline font-semibold ml-1">Pagar agora</Link>
        <Link to="/app/configuracoes/empresa/plano" className="underline ml-2">Ver plano</Link>
      </div>
    );
  }
  return null;
}

export function SuspendedScreen() {
  const { logout } = useAuth();
  const { status } = useBillingStatus();
  const s = status?.situacao;
  const manual = s?.motivo === "manual";
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-danger/10 border border-danger/25 flex items-center justify-center">
          <Lock className="w-6 h-6 text-danger" />
        </div>
        <h1 className="text-xl font-black text-[var(--color-text-primary)]">{manual ? "Empresa desabilitada" : "Acesso suspenso"}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          {manual
            ? "O acesso desta empresa foi desabilitado. Seus dados continuam guardados. Fale com o suporte para reativar."
            : `A mensalidade desta empresa ${s?.vencimento ? `venceu em ${diaBr(s.vencimento)}` : "está suspensa"}. Seus dados continuam guardados e o acesso volta assim que o pagamento for conferido.`}
        </p>
        {!manual && s?.diasParaExclusao != null && s.diasParaExclusao > 0 && (
          <p className="text-sm font-bold text-danger">Sem pagamento, a empresa entra na fila de exclusão em {s.diasParaExclusao} {s.diasParaExclusao === 1 ? "dia" : "dias"}.</p>
        )}
        {s?.estado === "excluir" && <p className="text-sm font-bold text-danger">O prazo terminou: a empresa está na fila de exclusão. Fale com o suporte agora.</p>}
        {!manual && <Link to="/checkout?renovar=1" className="inline-flex items-center justify-center rounded-xl bg-[var(--color-primary-blue)] px-5 py-3 text-sm font-bold text-white">Renovar / pagar</Link>}
        <div><button onClick={logout} className="text-sm underline text-[var(--color-text-muted)]">Sair</button></div>
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
