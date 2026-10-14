import { Navigate, useLocation } from "react-router-dom";

/** /lp e /lp/* eram a landing antiga: agora redirecionam para /landing, preservando a âncora (#planos, #contato…). */
export function LpRedirect() {
  const { hash, search } = useLocation();
  return <Navigate to={`/landing${search}${hash}`} replace />;
}
