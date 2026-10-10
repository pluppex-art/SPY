import { ShoppingCart, type LucideIcon } from "lucide-react";

/**
 * Registro das configurações de cada módulo vertical. Ligou o módulo no tenant,
 * o grupo dele aparece em Configurações; desligou, some — igual para todos os
 * clientes, sem código por empresa. Para dar configurações a outro módulo
 * (clinica, dev, educacao, imobiliaria, automotivo, solar…), basta uma entrada
 * aqui + a rota da página em App.tsx.
 */
export interface ModuleSettingsItem { title: string; path: string; soon?: boolean }
export interface ModuleSettingsDef {
  /** Mesmo id de ALL_MODULES / isModuleEnabled. */
  moduleId: string;
  title: string;
  icon: LucideIcon;
  items: ModuleSettingsItem[];
}

export const MODULE_SETTINGS: ModuleSettingsDef[] = [
  {
    moduleId: "varejo",
    title: "Varejo & PDV",
    icon: ShoppingCart,
    items: [
      { title: "Conexões (Max Data)", path: "/app/configuracoes/varejo/conexoes" },
    ],
  },
];
