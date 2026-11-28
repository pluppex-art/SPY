import { isVendedorColab } from "../../../../lib/sellers";
import { useAuth } from "../../../../contexts/AuthContext";
import { useRef, useState, useMemo } from "react";
import { Switch } from "../../../../components/ui/switch";
import { Users, UserPlus, Mail, Calendar, MoreVertical, TrendingUp, UserX, Coffee, Plane, Pencil, Phone, Building2 } from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips, usePeriodoIndicadores } from "../../../../components/ui/kpi-filter-card";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { Logo } from "../../../../components/ui/Logo";

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
  canManageSessions?: boolean;
  /** Editar, mudar status e desligar: só administrador. Quem não pode vê o perfil e, no próprio card, conecta o WhatsApp. */
  podeGerenciar?: boolean;
  onCriarSessao?: (colab: any) => void;
  /** Login do usuário atual: só o próprio colaborador conecta o WhatsApp dele (o QR é lido no celular dele). */
  currentUserId?: string | null;
  onConectarAgente?: () => void;
  /** Administrador conecta/reconecta o WhatsApp do Agente Secreto de um colaborador (QR lido no celular dele). */
  onConectarColaborador?: (colab: any) => void;
  /** Status do Agente Secreto por colaborador (só quem tem sessão aparece). */
  agenteStatus?: Record<string, string>;
  /** Abre os dois Agentes Secretos (Interno e Vendas) da pessoa. */
  onAbrirAgentes?: (colab: any) => void;
  /** Agentes ligados por colaborador: alimenta a chave de liga/desliga do cartão. */
  agentesEquipe?: Record<string, { vendas: boolean; interno: boolean }>;
  onAlternarAgente?: (colab: any, agente: "interno" | "vendas", ligar: boolean) => Promise<void>;
}

// Ícone próprio do Agente Secreto (símbolo do S.P.Y.: chapéu de espião + mira), separado do status Ativo do
// colaborador: verde = conectado, vermelho = desconectado, âmbar = pausado (férias/afastado), cinza = sem sessão.
const AGENTE_COR = { ativo: "#10B981", caiu: "#F43F5E", pausado: "#F59E0B", semSessao: "#94A3B8" } as const;

function AgenteSecretoBadge({ colab, status, ligado, rotulo = "Agente Secreto" }: { colab: any; status?: string; ligado?: boolean; rotulo?: string }) {
  let hex: string = AGENTE_COR.semSessao, texto = `${rotulo}: sem sessão`;
  if (status && ligado === false) texto = `${rotulo} desligado`;
  else if (status) {
    if (colab.status !== "Ativo") { hex = AGENTE_COR.pausado; texto = `${rotulo} pausado`; }
    else if (status === "CONNECTED") { hex = AGENTE_COR.ativo; texto = `${rotulo} ativo`; }
    else { hex = AGENTE_COR.caiu; texto = `${rotulo} desconectado`; }
  }
  return (
    <div className="inline-flex items-center gap-1.5 text-[10px] font-bold" style={{ color: hex }} title={texto}>
      <Logo variant="icon" color={hex} size={16} className="inline-flex shrink-0" />
      {texto}
    </div>
  );
}

// Uma linha por agente no cartão: situação e, para o administrador, a chave de ligar/desligar.
function LinhaAgente({ colab, status, ligado, rotulo, onAlternar }: { colab: any; status?: string; ligado?: boolean; rotulo: string; onAlternar?: (ligar: boolean) => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="flex items-center justify-center gap-2">
      <AgenteSecretoBadge colab={colab} status={status} ligado={ligado} rotulo={rotulo} />
      {onAlternar && ligado !== undefined && (
        <Switch
          size="sm" checked={ligado} disabled={ocupado} aria-label={`${ligado ? "Desligar" : "Ligar"} ${rotulo} de ${colab.nome}`}
          title={`${ligado ? "Desligar" : "Ligar"} ${rotulo}`}
          onCheckedChange={async (ligar) => { setOcupado(true); await onAlternar(ligar); setOcupado(false); }}
        />
      )}
    </div>
  );
}

export function MembrosSection({
  filtered: filteredBySearch, search, onSearchChange,
  menuOpenId, setMenuOpenId, onVerPerfil, onEditColab,
  onChangeStatus, onDesligar, canManageSessions, podeGerenciar = true, onCriarSessao, currentUserId, onConectarAgente, onConectarColaborador, agenteStatus, onAbrirAgentes, agentesEquipe, onAlternarAgente,
}: MembrosSectionProps) {
  // Cada Agente Secreto é um produto com a sua chave em Admin > Módulos: Interno (agente_interno) e Vendas (agente_secreto, só vendedor/closer).
  const { isModuleEnabled } = useAuth();
  const temInterno = isModuleEnabled("agente_interno");
  const temVendas = isModuleEnabled("agente_secreto");
  // Quem não é de vendas só aparece com o de Vendas se a sessão estiver entregando conversas (ou se não deu para saber).
  const usaVendas = (c: any) => temVendas && (isVendedorColab(c) || (agenteStatus?.[c.id] !== undefined && agentesEquipe?.[c.id]?.vendas !== false));
  const alternavel = (c: any, agente: "interno" | "vendas") => canManageSessions && onAlternarAgente ? (ligar: boolean) => onAlternarAgente(c, agente, ligar) : undefined;
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
  const periodo = usePeriodoIndicadores("data de cadastro");
  const base = periodo.filtrar(filtered, c => c.created_at);
  const desempenhos = base.map(c => Number(c.desempenho)).filter(n => Number.isFinite(n));
  const mediaDesempenho = desempenhos.length > 0 ? Math.round(desempenhos.reduce((a, b) => a + b, 0) / desempenhos.length) : 0;

  return (
    <div className="space-y-6">
      <KpiFilterCard
        id="rhColaboradores"
        periodo={periodo}
        kpis={[
          { label: "Colaboradores", value: base.length, icon: Users, tone: "primary" },
          { label: "Ativos", value: base.filter(f => f.status === "Ativo").length, icon: UserPlus, tone: "success" },
          { label: "Férias / Afastados", value: base.filter(f => f.status !== "Ativo").length, icon: Coffee, tone: "warning" },
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
                  <div className="space-y-0.5">
                    {temInterno && <LinhaAgente colab={colab} status={agenteStatus?.[colab.id]} ligado={agentesEquipe?.[colab.id]?.interno} rotulo="Agente Interno" onAlternar={alternavel(colab, "interno")} />}
                    {usaVendas(colab) && <LinhaAgente colab={colab} status={agenteStatus?.[colab.id]} ligado={agentesEquipe?.[colab.id]?.vendas} rotulo="Agente de Vendas" onAlternar={alternavel(colab, "vendas")} />}
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
                {podeGerenciar && <Button
                  size="xs" 
                  variant="ghost"
                  onClick={() => onEditColab(colab)}
                  className="h-8 w-8 p-0"
                  title="Editar dados"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>}
                {(podeGerenciar || (onConectarAgente && currentUserId && colab.user_id === currentUserId)) && <div className="relative" ref={menuOpenId === colab.id ? menuRef : null} data-menu-ref>
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
                      {podeGerenciar && (<>
                      <button onClick={() => onChangeStatus(colab, "Férias")} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] rounded-lg transition-colors text-left cursor-pointer">
                        <Plane className="w-3.5 h-3.5 text-blue-500" /> Marcar como Férias
                      </button>
                      <button onClick={() => onChangeStatus(colab, "Afastado")} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] rounded-lg transition-colors text-left cursor-pointer">
                        <Coffee className="w-3.5 h-3.5 text-amber-500" /> Marcar como Afastado
                      </button>
                      <button onClick={() => onChangeStatus(colab, "Ativo")} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] rounded-lg transition-colors text-left cursor-pointer">
                        <Users className="w-3.5 h-3.5 text-emerald-500" /> Marcar como Ativo
                      </button>
                      </>)}
                      {onAbrirAgentes && (temInterno || usaVendas(colab)) && (podeGerenciar || (currentUserId && colab.user_id === currentUserId)) && (
                        <button onClick={() => { setMenuOpenId(null); onAbrirAgentes(colab); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] rounded-lg transition-colors text-left cursor-pointer">
                          <Logo variant="icon" color={AGENTE_COR.ativo} size={14} className="inline-flex shrink-0" /> Agentes Secretos ({[temInterno && "Interno", usaVendas(colab) && "Vendas"].filter(Boolean).join(" e ")})
                        </button>
                      )}
                      {podeGerenciar && (<>
                      <div className="h-px bg-[var(--color-border-subtle)] my-1" />
                      <button onClick={() => onDesligar(colab)} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors text-left cursor-pointer">
                        <UserX className="w-3.5 h-3.5" /> Remover Colaborador
                      </button>
                      </>)}
                    </div>
                  )}
                </div>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
