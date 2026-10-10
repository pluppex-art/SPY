import { Code2 } from "lucide-react";
import type { ModuleDef } from "../../../lib/moduleConfig";
import { DEV_CONFIG_KEY, DEV_DEFAULTS } from "../../../lib/modules/devConfig";

export const devSettings: ModuleDef = {
  moduleId: "dev",
  title: "Desenvolvimento",
  icon: Code2,
  storeKey: DEV_CONFIG_KEY,
  defaults: DEV_DEFAULTS,
  sections: [],
};
