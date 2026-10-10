import { Stethoscope } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { CLINICA_CONFIG_KEY, CLINICA_DEFAULTS } from "../../../lib/modules/clinicaConfig";

export const clinicaSettings: ModuleDef = {
  moduleId: "clinica",
  title: "Clínica",
  icon: Stethoscope,
  storeKey: CLINICA_CONFIG_KEY,
  defaults: CLINICA_DEFAULTS,
  sections: [],
};
