import { ColaboradorPerfilCompleto } from "./ColaboradorPerfilCompleto";

interface ColaboradorPerfilModalProps {
  colab: any;
  onClose: () => void;
}

/** Perfil do colaborador: agora o perfil completo (resumo, vendas, tarefas, reuniões e acessos). */
export function ColaboradorPerfilModal({ colab, onClose }: ColaboradorPerfilModalProps) {
  if (!colab) return null;
  return <ColaboradorPerfilCompleto colab={colab} onClose={onClose} />;
}
