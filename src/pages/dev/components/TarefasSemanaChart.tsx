import { Card } from "../../../components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { EIXO, ESTILO_TOOLTIP } from "./SprintVelocityChart";

export function TarefasSemanaChart({ dados }: { dados: { semana: string; criadas: number; concluidas: number }[] }) {
  return (
    <Card className="p-5 sm:p-8">
      <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-widest mb-6">Tarefas criadas x concluídas</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
          <XAxis dataKey="semana" tick={EIXO} axisLine={false} tickLine={false} />
          <YAxis tick={EIXO} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
          <Tooltip contentStyle={ESTILO_TOOLTIP} labelFormatter={(l) => `Semana de ${l}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="criadas" name="Criadas" fill="var(--color-text-faint)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="concluidas" name="Concluídas" fill="var(--color-primary-blue)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
