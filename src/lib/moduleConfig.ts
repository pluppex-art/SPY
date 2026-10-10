// Infra de configurações por módulo vertical. Cada módulo guarda UM documento por empresa em app_settings
// (chave "<moduleId>_config"), dividido em seções. Os padrões reproduzem o comportamento que as telas já tinham,
// então quem não configurar nada não vê diferença. Nada aqui é específico de cliente.
import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { useData } from "../contexts/DataContext";

export type FieldDef =
  | { kind: "toggle"; key: string; label: string; hint?: string }
  | { kind: "number"; key: string; label: string; hint?: string; min?: number; max?: number; suffix?: string }
  | { kind: "text"; key: string; label: string; hint?: string; placeholder?: string; multiline?: boolean }
  | { kind: "select"; key: string; label: string; hint?: string; options: string[] }
  | { kind: "multi"; key: string; label: string; hint?: string; options: string[] }
  | { kind: "tags"; key: string; label: string; hint?: string };

export interface SectionDef {
  /** Vira o último pedaço da URL: /app/configuracoes/modulos/<moduleId>/<id> */
  id: string;
  title: string;
  subtitle: string;
  fields: FieldDef[];
  /** Validação antes de salvar; devolve a mensagem de erro ou null. */
  validate?: (draft: any) => string | null;
}

export interface ModuleDef {
  /** Mesmo id de isModuleEnabled / ALL_MODULES. */
  moduleId: string;
  title: string;
  icon: LucideIcon;
  /** Chave em app_settings. */
  storeKey: string;
  /** Padrões por seção (as chaves são os ids das seções). */
  defaults: Record<string, Record<string, any>>;
  sections: SectionDef[];
}

/** Junta o salvo com os padrões, seção a seção (campo novo nunca quebra configuração antiga). */
export function mergeModuleConfig<T = any>(defaults: Record<string, Record<string, any>>, saved: any): T {
  const out: Record<string, any> = {};
  for (const k of Object.keys(defaults)) out[k] = { ...defaults[k], ...((saved ?? {})[k] ?? {}) };
  return out as T;
}

/** Hook de leitura: `useModuleConfig<MinhaConfig>("clinica_config", DEFAULTS)`. */
export function useModuleConfig<T = any>(storeKey: string, defaults: Record<string, Record<string, any>>): T {
  const { appSettings } = useData();
  const saved = appSettings?.[storeKey];
  return useMemo(() => mergeModuleConfig<T>(defaults, saved), [saved, defaults]);
}
