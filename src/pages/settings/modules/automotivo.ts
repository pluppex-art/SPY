import { Car } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { AUTOMOTIVO_CONFIG_KEY, AUTOMOTIVO_DEFAULTS } from "../../../lib/modules/automotivoConfig";

export const automotivoSettings: ModuleDef = {
  moduleId: "automotivo",
  title: "Automotivo",
  icon: Car,
  storeKey: AUTOMOTIVO_CONFIG_KEY,
  defaults: AUTOMOTIVO_DEFAULTS,
  sections: [],
};
