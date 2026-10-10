import { GraduationCap } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { EDUCACAO_CONFIG_KEY, EDUCACAO_DEFAULTS } from "../../../lib/modules/educacaoConfig";

export const educacaoSettings: ModuleDef = {
  moduleId: "educacao",
  title: "Educação",
  icon: GraduationCap,
  storeKey: EDUCACAO_CONFIG_KEY,
  defaults: EDUCACAO_DEFAULTS,
  sections: [],
};
