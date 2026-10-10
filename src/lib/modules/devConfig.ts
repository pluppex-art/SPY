// Configuração do módulo Desenvolvimento. Os padrões reproduzem exatamente o que as telas já faziam
// (valores iniciais dos formulários, listas de sugestões), então quem não configurar nada não vê diferença.
// Colunas do board ficam em Configurações → Produtividade → Funis & Kanbans (não duplicamos aqui).
import { useModuleConfig } from "../moduleConfig";

export const DEV_CONFIG_KEY = "dev_config";

export const DEV_TIPOS_TAREFA = ["feature", "bug", "chore", "refactor"];
export const DEV_PRIORIDADES = ["crítica", "alta", "média", "baixa"];
export const DEV_COLUNAS_TAREFA = ["Backlog", "A Fazer", "Em Progresso", "Em Review", "Concluído"];
export const DEV_SEVERIDADES = ["crítico", "alto", "médio", "baixo"];
export const DEV_STATUS_PROJETO = ["Em Planejamento", "Em Desenvolvimento", "Em Produção", "Pausado", "Concluído"];
export const DEV_VISIBILIDADES = ["Privado", "Público"];

export const DEV_DEFAULTS: Record<string, Record<string, any>> = {
  sprint: {
    tipoPadrao: "feature",
    prioridadePadrao: "média",
    pontosPadrao: 1,
    pontosMaximo: 21,
    colunaPadrao: "Backlog",
    capacidadePontos: 0, // 0 = sem limite
  },
  issues: {
    severidadePadrao: "médio",
    labelsSugeridas: ["backend", "frontend", "mobile", "auth", "performance", "ui", "api", "banco de dados", "email", "exportação", "segurança"],
  },
  projetos: {
    statusInicial: "Em Planejamento",
    stacksSugeridas: ["React", "TypeScript", "Node.js", "Supabase", "PostgreSQL", "React Native", "Expo", "Fastify", "Redis", "Docker", "AWS", "Python", "Go", "Tailwind", "GraphQL", "Next.js"],
  },
  repositorios: {
    linguagemPadrao: "TypeScript",
    visibilidadePadrao: "Privado",
    linguagens: ["TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "C#", "PHP", "Ruby", "Dart", "Swift", "Kotlin"],
  },
};

export interface DevConfig {
  sprint: { tipoPadrao: string; prioridadePadrao: string; pontosPadrao: number; pontosMaximo: number; colunaPadrao: string; capacidadePontos: number };
  issues: { severidadePadrao: string; labelsSugeridas: string[] };
  projetos: { statusInicial: string; stacksSugeridas: string[] };
  repositorios: { linguagemPadrao: string; visibilidadePadrao: string; linguagens: string[] };
}

export function useDevConfig(): DevConfig {
  return useModuleConfig<DevConfig>(DEV_CONFIG_KEY, DEV_DEFAULTS);
}

/** Valor da config se estiver na lista válida; senão o fallback (protege contra lixo salvo). */
export function pick(value: any, valid: string[], fallback: string): string {
  return valid.includes(value) ? value : fallback;
}
