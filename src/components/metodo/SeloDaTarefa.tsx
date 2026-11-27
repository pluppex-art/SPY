/** Marca a tarefa criada pelo método do funil e mostra a situação que a gerou. */
import { useData } from "../../contexts/DataContext";
import type { Task } from "../../types";
import { useMetodo } from "./MetodoProvider";

export function SeloDaTarefa({ task }: { task: Task }) {
  const metodo = useMetodo();
  const { leads } = useData();
  if (!metodo.ligado || task.origem !== "automacao") return null;
  const lead = task.situacao_codigo ? (leads as any[]).find((l) => l.id === task.lead_id) : null;
  const nome = task.situacao_codigo ? metodo.situacoes(metodo.info(lead)?.funil.id ?? "").find((s) => s.codigo === task.situacao_codigo)?.nome_exibido : undefined;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-400 text-[10px] font-bold">Automática{nome ? ` · ${nome}` : ""}</span>;
}
