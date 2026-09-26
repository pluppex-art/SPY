import { Building2, ClipboardList, Plug, Rocket, Sparkles, Target, Users, Wallet, type LucideIcon } from "lucide-react";

/** Ícone de cada seção do formulário de implantação (equipe e link do cliente usam o mesmo). */
export const SECTION_ICON: Record<string, LucideIcon> = {
  empresa: Building2, responsaveis: Users, comercial: Target, integracoes: Plug, financeiro: Wallet, aurora: Sparkles, golive: Rocket,
};

export const sectionIcon = (id: string): LucideIcon => SECTION_ICON[id] || ClipboardList;
