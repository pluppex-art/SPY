import { useRef, useState, useMemo } from "react";
import {
  Users, Search, UserPlus, Mail, Calendar,
  MoreVertical, TrendingUp, ShieldCheck,
  UserX, Coffee, Plane, Pencil, Phone, Building2
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../../../components/ui/kpi-filter-card";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";

interface MembrosSectionProps {
  filtered: any[];
  search: string;
  onSearchChange: (v: string) => void;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  onVerPerfil: (colab: any) => void;
  onEditColab: (colab: any) => void;
  onChangeStatus: (colab: any, status: string) => void;
  onDesligar: (colab: any) => void;
}

export function MembrosSection({
  filtered: filteredBySearch, search, onSearchChange,
  menuOpenId, setMenuOpenId, onVerPerfil, onEditColab,
  onChangeStatus, onDesligar,
}: MembrosSectionProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [depto, setDepto] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const deptoOptions = useMemo(
    () => Array.from(new Set(filteredBySearch.map(c => c.departamento).filter(Boolean))).sort() as string[],
    [filteredBySearch],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(filteredBySearch.map(c => c.status).filter(Boolean))).sort() as string[],
    [filteredBySearch],
  );
  const filtered = useMemo(
    () => filteredBySearch.filter(c => (!depto || c.departamento === depto) && (!statusFiltro || c.status === statusFiltro)),
    [filteredBySearch, depto, statusFiltro],
  );
  const desempenhos = filtered.map(c => Number(c.desempenho)).filter(n => Number.isFinite(n));
  const mediaDesempenho = desempenhos.length > 0 ? Math.round(desempenhos.reduce((a, b) => a + b, 0) / desempenhos.length) : 0;

  return (
    <div className="space-y-6">
      <KpiFilterCard
        id="rhColaboradores"
        kpis={[
          { label: "Colaboradores", value: filtered.length, icon: Users, tone: "primary" },
          { label: "Ativos", value: filtered.filter(f => f.status === "Ativo").length, icon: UserPlus, tone: "success" },
          { label: "Férias / Afastados", value: filtered.filter(f => f.status !== "Ativo").length, icon: Coffee, tone: "warning" },
          { label: "Média de Desempenho", value: `${mediaDesempenho}%`, icon: TrendingUp, tone: "accent" },
        ]}
        activeCount={(search.trim() ? 1 : 0) + (depto ? 1 : 0) + (statusFiltro ? 1 : 0)}
        onClear={() => { onSearchChange(""); setDepto(""); setStatusFiltro(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={onSearchChange} placeholder="Pesquisar por nome ou cargo..." />
          <FilterSelect icon={Building2} value={depto} onChange={setDepto} options={deptoOptions} allLabel="Todos os departamentos" />
          <FilterChips value={statusFiltro} onChange={setStatusFiltro} options={statusOptions} />
        </FilterBar>
      </KpiFilterCard>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
          <Users className="w-10 h-10 text-[var(--color-text-faint)] mx-auto mb-3 opacity-40" />
          <p className="text-sm font-bold text-[var(--color-text-primary)]">Nenhum colaborador encontrado</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Cadastre novos membros utilizando o botão "Novo Registro" acima.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((colab) => (
            <Card key={colab.id} className="group overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/50 transition-all p-0 shadow-sm flex flex-col justify-between">
              <div>
                <div className="h-16 bg-[var(--color-primary-blue)]/10 flex items-end justify-center p-0 border-b border-[var(--color-border-subtle)]">
                  <div className="w-14 h-14 rounded-xl bg-[var(--color-primary-blue)] text-white font-bold text-lg border-2 border-[var(--color-surface-elevated)] -mb-7 flex items-center justify-center shadow-sm">
                    {(colab.nome || "?").substring(0, 2).toUpperCase()}
                  </div>
                </div>
                <div className="p-5 pt-9 text-center space-y-2">
                  <div>
                    <Badge variant={colab.status === "Ativo" ? "success" : colab.status === "Férias" ? "info" : "destructive"}>
                      ● {colab.status}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)] truncate">{colab.nome}</h3>
                  <p className="text-[11px] text-[var(--color-text-muted)] font-medium truncate">{colab.cargo}</p>

                  <div className="grid grid-cols-2 gap-2 border-y border-[var(--color-border-subtle)] py-2.5 my-3 text-left">
                    <div>
                      <div className="text-[9px] font-black text-[var(--color-text-faint)] uppercase">Departamento</div>
                      <div className="text-xs font-bold text-[var(--color-text-primary)] truncate">{colab.departamento || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-black text-[var(--color-text-faint)] uppercase">Desempenho</div>
                      <div className="text-xs font-bold text-emerald-500">{colab.desempenho ?? 100}%</div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-left text-xs text-[var(--color-text-muted)]">
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-faint)]" />
                      <span className="text-[11px] truncate">{colab.email}</span>
                    </div>
                    {colab.phone && (
                      <div className="flex items-center gap-2 truncate">
                        <Phone className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-faint)]" />
                        <span className="text-[11px] font-mono">{colab.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 truncate">
                      <Calendar className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-faint)]" />
                      <span className="text-[11px]">Desde: {colab.dataAdmissao}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Actions */}
              <div className="p-4 pt-0 border-t border-[var(--color-border-subtle)] mt-2 flex items-center gap-2">
                <Button
                  onClick={() => onVerPerfil(colab)}
                  variant="outline"
                  className="flex-1 h-8 text-xs font-bold border-[var(--color-border-default)]"
                >
                  Ver Perfil
                </Button>
                <Button
                  size="xs" 
                  variant="ghost"
                  onClick={() => onEditColab(colab)}
                  className="h-8 w-8 p-0"
                  title="Editar dados"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <div className="relative" ref={menuOpenId === colab.id ? menuRef : null} data-menu-ref>
                  <Button
                    size="xs" 
                    variant="ghost"
                    onClick={() => setMenuOpenId(menuOpenId === colab.id ? null : colab.id)}
                    className="h-8 w-8 p-0"
                    title="Mais opções"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </Button>
                  {menuOpenId === colab.id && (
                    <div className="absolute right-0 bottom-10 z-50 w-48 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl shadow-xl p-1 animate-in fade-in">
                      <button onClick={() => onChangeStatus(colab, "Férias")} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] rounded-lg transition-colors text-left cursor-pointer">
                        <Plane className="w-3.5 h-3.5 text-blue-500" /> Marcar como Férias
                      </button>
                      <button onClick={() => onChangeStatus(colab, "Afastado")} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] rounded-lg transition-colors text-left cursor-pointer">
                        <Coffee className="w-3.5 h-3.5 text-amber-500" /> Marcar como Afastado
                      </button>
                      <button onClick={() => onChangeStatus(colab, "Ativo")} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] rounded-lg transition-colors text-left cursor-pointer">
                        <Users className="w-3.5 h-3.5 text-emerald-500" /> Marcar como Ativo
                      </button>
                      <div className="h-px bg-[var(--color-border-subtle)] my-1" />
                      <button onClick={() => onDesligar(colab)} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors text-left cursor-pointer">
                        <UserX className="w-3.5 h-3.5" /> Remover Colaborador
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
