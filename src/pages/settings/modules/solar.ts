import { Sun } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { SOLAR_CONFIG_KEY, SOLAR_DEFAULTS } from "../../../lib/modules/solarConfig";

export const solarSettings: ModuleDef = {
  moduleId: "solar",
  title: "Energia Solar",
  icon: Sun,
  storeKey: SOLAR_CONFIG_KEY,
  defaults: SOLAR_DEFAULTS,
  sections: [],
};
