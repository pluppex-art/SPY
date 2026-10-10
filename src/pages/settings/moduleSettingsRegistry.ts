import type { ModuleDef } from "../../lib/moduleConfig";
import { automotivoSettings } from "./modules/automotivo";
import { clinicaSettings } from "./modules/clinica";
import { educacaoSettings } from "./modules/educacao";
import { imobiliariaSettings } from "./modules/imobiliaria";
import { solarSettings } from "./modules/solar";
import { devSettings } from "./modules/dev";

/** Módulos verticais com configurações próprias. Seção vazia = módulo ainda sem configuração (não aparece no menu). */
export const MODULE_SETTINGS_REGISTRY: ModuleDef[] = [
  automotivoSettings, clinicaSettings, educacaoSettings, imobiliariaSettings, solarSettings, devSettings,
];

export const moduleSettingsPath = (moduleId: string, sectionId: string) => `/app/configuracoes/modulos/${moduleId}/${sectionId}`;
