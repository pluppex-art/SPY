import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Loader2, Plus, Trash2, UserCheck, ListChecks } from "lucide-react";
import { useData } from "../../../contexts/DataContext";
import { useAuth } from "../../../contexts/AuthContext";
import { colaboradorDoUsuario } from "../../../lib/escopoEquipe";
import { cn } from "../../../lib/utils";
import { OS_PASSO_STATUS, useOsPassos, type OsPasso, type OsPassoStatus } from "../hooks/useOsPassos";

const selCls = "bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] min-w-0";

const tom: Record<OsPassoStatus, string> = {
  "A fazer": "text-[var(--color-text-faint)]",
  "Em andamento": "text-amber-500",
  "Feito": "text-emerald-500",
};

/** Passo a passo da OS: quem pega o passo vira o responsável, e o andamento aparece na barra. */
export function OsPassosPanel({ ordemId, departamentoId, desabilitado }: { ordemId: string; departamentoId?: string | null; desabilitado?: boolean }) {
  const { colaboradores } = useData();
  const { user } = useAuth();
  const { passos, carregando, atualizar, adicionar, remover, aplicarModelo } = useOsPassos(ordemId, departamentoId);
  const [novo, setNovo] = useState("");

  const eu = useMemo(() => colaboradorDoUsuario(user, colaboradores as any[]), [user, colaboradores]);
  const pessoas = useMemo(
    () => (colaboradores as any[]).filter(c => c.status !== "Desligado" && c.nome).map(c => ({ id: String(c.id), nome: String(c.nome) })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [colaboradores],
  );

  const feitos = passos.filter(p => p.status === "Feito").length;
  const pct = passos.length ? Math.round((feitos / passos.length) * 100) : 0;

  const trocarResponsavel = (p: OsPasso, id: string) => {
    const pessoa = pessoas.find(x => x.id === id);
    void atualizar(p.id, { responsavelId: pessoa?.id ?? null, responsavelNome: pessoa?.nome ?? null });
  };
  const assumir = (p: OsPasso) => {
    if (!eu) return;
    void atualizar(p.id, { responsavelId: String(eu.id), responsavelNome: String(eu.nome), status: p.status === "A fazer" ? "Em andamento" : p.status });
  };
  const alternar = (p: OsPasso) => void atualizar(p.id, { status: p.status === "Feito" ? "A fazer" : "Feito" });

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          <ListChecks className="w-3.5 h-3.5" /> Passo a passo {passos.length > 0 && <span className="normal-case tracking-normal font-bold">({feitos}/{passos.length})</span>}
        </span>
        {!desabilitado && (
          <button type="button" onClick={() => void aplicarModelo()} className="text-[10px] font-bold text-[var(--color-primary-blue)] bg-transparent border-none cursor-pointer hover:underline">
            Aplicar modelo do departamento
          </button>
        )}
      </div>

      {passos.length > 0 && (
        <div className="h-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {carregando && passos.length === 0 && <p className="flex items-center gap-2 text-xs text-[var(--color-text-faint)]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...</p>}
      {!carregando && passos.length === 0 && (
        <p className="text-xs text-[var(--color-text-faint)]">Nenhum passo ainda. Use "Aplicar modelo do departamento" ou adicione o primeiro abaixo.</p>
      )}

      <ul className="space-y-1.5 m-0 p-0 list-none">
        {passos.map(p => (
          <li key={p.id} className={cn("rounded-xl border border-[var(--color-border-subtle)] p-2.5 space-y-2", p.status === "Feito" && "bg-emerald-500/5")}>
            <div className="flex items-start gap-2">
              <button type="button" onClick={() => alternar(p)} disabled={desabilitado} aria-label={p.status === "Feito" ? "Desmarcar passo" : "Marcar passo como feito"}
                className={cn("mt-0.5 shrink-0 bg-transparent border-none cursor-pointer p-0 disabled:cursor-default", tom[p.status])}>
                {p.status === "Feito" ? <CheckCircle2 className="w-[18px] h-[18px]" /> : <Circle className="w-[18px] h-[18px]" />}
              </button>
              <span className={cn("flex-1 min-w-0 text-xs font-semibold break-words", p.status === "Feito" ? "line-through text-[var(--color-text-faint)]" : "text-[var(--color-text-primary)]")}>{p.titulo}</span>
              {!desabilitado && (
                <button type="button" onClick={() => void remover(p.id)} aria-label="Remover passo" className="shrink-0 bg-transparent border-none cursor-pointer text-[var(--color-text-faint)] hover:text-rose-500 p-0.5">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pl-6">
              <select aria-label="Status do passo" value={p.status} onChange={e => void atualizar(p.id, { status: e.target.value as OsPassoStatus })} disabled={desabilitado} className={selCls}>
                {OS_PASSO_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select aria-label="Responsável pelo passo" value={p.responsavelId ?? ""} onChange={e => trocarResponsavel(p, e.target.value)} disabled={desabilitado} className={cn(selCls, "max-w-[150px]")}>
                <option value="">Sem responsável</option>
                {p.responsavelId && !pessoas.some(x => x.id === p.responsavelId) && <option value={p.responsavelId}>{p.responsavelNome ?? "Responsável"}</option>}
                {pessoas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
              <input type="date" aria-label="Prazo do passo" value={p.prazo ?? ""} onChange={e => void atualizar(p.id, { prazo: e.target.value || null })} disabled={desabilitado} className={selCls} />
              {!desabilitado && eu && p.responsavelId !== String(eu.id) && p.status !== "Feito" && (
                <button type="button" onClick={() => assumir(p)} className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 border-none rounded-lg px-2 py-1 cursor-pointer">
                  <UserCheck className="w-3 h-3" /> Assumir
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!desabilitado && (
        <form onSubmit={e => { e.preventDefault(); void adicionar(novo); setNovo(""); }} className="flex gap-1.5">
          <input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Adicionar passo..." aria-label="Novo passo" className={cn(selCls, "flex-1 py-1.5 text-xs")} />
          <button type="submit" disabled={!novo.trim()} className="flex items-center gap-1 px-2.5 rounded-lg bg-[var(--color-primary-blue)] text-white text-[11px] font-bold border-none cursor-pointer disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Adicionar</button>
        </form>
      )}
    </div>
  );
}
