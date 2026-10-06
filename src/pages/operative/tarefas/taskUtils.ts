import type { Task } from "../../../types";

/** Formata `due_date` (ISO) pro estilo "Hoje, 09:00" / "Amanhã, 14:00" / "12 mar, 10:00". */
export function formatDueDate(iso?: string | null): string {
  if (!iso) return "Sem prazo";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Sem prazo";
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return `Hoje, ${time}`;
  if (diffDays === 1) return `Amanhã, ${time}`;
  if (diffDays === -1) return `Ontem, ${time}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}, ${time}`;
}

export const isTaskClosed = (t: Pick<Task, "status">) => t.status === "Concluída" || t.status === "Cancelado";

/** Prazo vencido e tarefa ainda não encerrada — independe de o status ter sido movido pra "Atrasado". */
export function isTaskOverdue(t: Pick<Task, "status" | "due_date">): boolean {
  if (isTaskClosed(t)) return false;
  if (t.status === "Atrasado") return true;
  if (!t.due_date) return false;
  const d = new Date(t.due_date).getTime();
  return !isNaN(d) && d < Date.now();
}

/**
 * `tasks` não tem colunas de tipo/tags: ao cadastrar, o modal dobra essas
 * informações dentro de `description` como "Tipo: X · Produtos: a, b ·
 * Tags: t1, t2" (ver useTarefas.handleSaveTask). Aqui o caminho inverso, pra
 * exibir como chips — texto livre que não segue o padrão volta em `resto`.
 */
export function parseTaskMeta(description?: string | null): { tipo?: string; produtos: string[]; tags: string[]; resto: string } {
  const out = { tipo: undefined as string | undefined, produtos: [] as string[], tags: [] as string[], resto: "" };
  if (!description) return out;
  const resto: string[] = [];
  for (const part of description.split(" · ")) {
    const p = part.trim();
    if (p.startsWith("Tipo: ")) out.tipo = p.slice(6).trim();
    else if (p.startsWith("Produtos: ")) out.produtos = p.slice(10).split(",").map((x) => x.trim()).filter(Boolean);
    else if (p.startsWith("Tags: ")) out.tags = p.slice(6).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    else if (p) resto.push(p);
  }
  out.resto = resto.join(" · ");
  return out;
}

export const initialsOf = (name: string) =>
  (name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

export const PRIORITY_CHIP: Record<string, string> = {
  Alta: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "Média": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Baixa: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};
