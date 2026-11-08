import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

/** Rota que não existe: avisa e leva o usuário para a página pai, em vez de exibir um formulário/placeholder falso. */
export default function RotaInexistente({ to }: { to: string }) {
  useEffect(() => {
    toast.error("Esta página não existe", { id: "rota-inexistente" });
  }, []);
  return <Navigate to={to} replace />;
}
