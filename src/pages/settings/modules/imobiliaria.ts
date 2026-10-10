import { Building2 } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { IMOBILIARIA_CONFIG_KEY, IMOBILIARIA_DEFAULTS } from "../../../lib/modules/imobiliariaConfig";

export const imobiliariaSettings: ModuleDef = {
  moduleId: "imobiliaria",
  title: "Imobiliária",
  icon: Building2,
  storeKey: IMOBILIARIA_CONFIG_KEY,
  defaults: IMOBILIARIA_DEFAULTS,
  sections: [],
};
