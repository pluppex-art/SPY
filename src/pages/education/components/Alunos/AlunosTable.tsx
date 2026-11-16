import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { Users, Trash2, GraduationCap } from "lucide-react";

import { HelpTip } from "../../../../components/ui/help-tip";
interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  course: string;
  progress: number;
  status: string;
  avatar: string;
  grades: any[];
}

interface AlunosTableProps {
  students: Student[];
  onManage: (student: Student) => void;
  onDelete?: (id: string) => void;
}

export function AlunosTable({ students, onManage, onDelete }: AlunosTableProps) {
  return (
    <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)]">
            <tr>
              <th className="px-6 py-3.5">Aluno</th>
              <th className="px-6 py-3.5">Contato</th>
              <th className="px-6 py-3.5">Curso</th>
              <th className="px-6 py-3.5">Progresso</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5 text-right"><span className="inline-flex items-center gap-1">Ações<HelpTip label="O que cada botão faz">Notas: abre as notas do aluno para você lançar e consultar. Lixeira: remove o aluno.</HelpTip></span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)]">
            {students.length > 0 ? students.map((aluno) => (
              <tr key={aluno.id} className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center font-bold text-xs border border-[var(--color-primary-blue)]/20">
                      {aluno.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="font-bold text-[var(--color-text-primary)]">{aluno.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-[var(--color-text-muted)] font-medium">{aluno.email}</div>
                  <div className="text-[10px] text-[var(--color-text-faint)] font-mono mt-0.5">{aluno.phone || "—"}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-[var(--color-primary-blue)]">{aluno.course || "Geral"}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-[var(--color-surface-sunken)] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${aluno.progress}%` }} />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-emerald-500">{aluno.progress}%</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={aluno.status === "Ativo" ? "success" : "secondary"}>
                    {aluno.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => onManage(aluno)}
                      className="h-8 px-3 text-xs font-bold border-[var(--color-border-default)]"
                    >
                      <GraduationCap className="w-3.5 h-3.5 mr-1" /> Notas
                    </Button>
                    {onDelete && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => onDelete(aluno.id)}
                        className="h-8 w-8 p-0 text-[var(--color-text-faint)] hover:text-rose-500 hover:bg-rose-500/10"
                        title="Remover Aluno"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                  <Users className="w-8 h-8 opacity-40 mx-auto mb-2" />
                  Nenhum aluno encontrado com os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
