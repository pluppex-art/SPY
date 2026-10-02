import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { Spinner } from "../../components/ui/spinner";
import { EmptyState } from "../../components/ui/empty-state";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { KANBAN_COR_CLASS } from "../../hooks/useKanbanConfig";
import { isOsLocked, osCode } from "../../lib/ordemServico";
import { useOS, type NovaOrdemPayload } from "./hooks/useOS";
import {
  OS_ORIGEM_LABEL,
  OS_PRIORIDADES,
  osEmAberto,
  type OrdemServico,
  type OsDepartamento,
  type OsEtapa,
  type OsPrioridade,
} from "./osTypes";

const GERAL = "geral";

const inputCls =
  "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-blue-500/50 focus:outline-none";
const labelCls = "block text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-2";

function PrioridadeBadge({ p }: { p: OsPrioridade }) {
  const cfg = OS_PRIORIDADES.find(x => x.id === p) ?? OS_PRIORIDADES[1];
  return (
    <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${cfg.style}`}>
      {cfg.label}
    </span>
  );
}

function prazoInfo(o: OrdemServico, etapa?: OsEtapa) {
  if (!o.prazo) return null;
  const aberta = osEmAberto(o, etapa);
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasada = aberta && o.prazo < hoje;
  const [y, m, d] = o.prazo.split("-");
  return { texto: `${d}/${m}/${y}`, atrasada };
}

export default function QuadroDepartamentos() {
  const os = useOS();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const aba = params.get("dep") || GERAL;

  const [busca, setBusca] = useState("");
  const [filtroDep, setFiltroDep] = useState("");
  const [novaOpen, setNovaOpen] = useState(false);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);

  const depsAtivos = useMemo(() => os.departamentos.filter(d => d.ativo), [os.departamentos]);
  const depAtual = depsAtivos.find(d => d.id === aba);
  const funilAtual = depAtual ? os.funilPadraoDe(depAtual.id) : undefined;
  const selecionada = os.ordens.find(o => o.id === selecionadaId) ?? null;

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of os.ordens) {
      if (o.departamentoId && osEmAberto(o, os.etapaDaOrdem(o))) m.set(o.departamentoId, (m.get(o.departamentoId) ?? 0) + 1);
    }
    return m;
  }, [os.ordens, os.etapaDaOrdem]);

  const depPorId = useMemo(() => new Map(os.departamentos.map(d => [d.id, d])), [os.departamentos]);
  const funilDaOrdem = (o: OrdemServico) => os.funis.find(f => f.id === o.funilId);

  const visaoGeral = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return os.ordens.filter(o => {
      if (filtroDep && o.departamentoId !== filtroDep) return false;
      if (!q) return true;
      return [o.titulo, o.clienteNome, o.responsavelNome, `os-${o.numero}`].some(v => v?.toLowerCase().includes(q));
    });
  }, [os.ordens, busca, filtroDep]);

  const abrirNova = () => setNovaOpen(true);
  // Preserva os demais parâmetros da URL (ex.: a vista "quadro" da página pai).
  const irParaAba = (id: string) =>
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (id === GERAL) next.delete("dep");
      else next.set("dep", id);
      return next;
    });

  const soltar = async (etapaId: string) => {
    if (arrastandoId) await os.moverOrdem(arrastandoId, etapaId);
    setArrastandoId(null);
    setColunaAlvo(null);
  };

  const excluir = async (o: OrdemServico) => {
    if (!(await confirmDialog({ title: "Excluir OS", description: `Excluir a ${osCode(o.numero)} "${o.titulo}"?` }))) return;
    setSelecionadaId(null);
    await os.deleteOrdem(o.id);
  };

  if (os.loading) {
    return (
      <div className="flex justify-center py-20"><Spinner /></div>
    );
  }

  if (depsAtivos.length === 0) {
    return (
      <>
        <EmptyState
          icon={ClipboardList}
          title="Nenhum departamento configurado"
          description="Cadastre os departamentos e o fluxo de cada um para começar a abrir Ordens de Serviço."
          action={
            <Link to="/app/configuracoes/os/funis">
              <Button className="h-9 px-4 text-xs font-medium gap-1.5">
                <Settings2 className="w-4 h-4" /> Configurar departamentos
              </Button>
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="pb-10 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-[var(--color-text-muted)]">Cada aba segue o fluxo configurado para o departamento. Arraste os cartões para mudar de etapa.</p>
          <div className="flex items-center gap-2">
            <Link
              to="/app/configuracoes/os/funis"
              className="flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all"
            >
              <Settings2 className="w-3.5 h-3.5" /> Departamentos e funis
            </Link>
            <Button onClick={abrirNova} className="h-9 px-4 text-xs font-medium gap-1.5">
              <Plus className="w-4 h-4" /> Nova OS
            </Button>
          </div>
        </div>
        {/* Abas por departamento */}
        {depsAtivos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <TabBtn ativo={aba === GERAL || !depAtual} onClick={() => irParaAba(GERAL)} label="Todos" total={os.ordens.filter(o => osEmAberto(o, os.etapaDaOrdem(o))).length} />
            {depsAtivos.map(d => (
              <TabBtn key={d.id} ativo={aba === d.id} onClick={() => irParaAba(d.id)} label={d.nome} total={contagem.get(d.id) ?? 0} />
            ))}
          </div>
        )}

        {/* Aba de departamento: kanban do funil configurado */}
        {depAtual && funilAtual ? (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {funilAtual.etapas.map(etapa => {
              const cards = os.ordens.filter(o => o.funilId === funilAtual.id && o.etapaId === etapa.id);
              return (
                <div
                  key={etapa.id}
                  className={`flex-shrink-0 w-72 flex flex-col rounded-2xl border transition-all ${colunaAlvo === etapa.id ? "border-blue-500/40 bg-blue-600/[0.03]" : "border-[var(--color-border-subtle)] bg-[var(--color-surface)]/40"}`}
                  onDragOver={e => { e.preventDefault(); setColunaAlvo(etapa.id); }}
                  onDragLeave={() => setColunaAlvo(null)}
                  onDrop={() => soltar(etapa.id)}
                >
                  <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${KANBAN_COR_CLASS[etapa.cor] ?? "bg-slate-500"}`} />
                    <span className="text-[11px] font-black text-[var(--color-text-primary)] uppercase tracking-wider">{etapa.nome}</span>
                    <span className="text-[10px] font-black text-[var(--color-text-muted)] ml-1">{cards.length}</span>
                  </div>
                  <div className="flex-1 p-3 space-y-3 min-h-[120px]">
                    {cards.map(o => {
                      const prazo = prazoInfo(o, etapa);
                      return (
                        <div
                          key={o.id}
                          draggable={o.status !== "Faturada"}
                          onDragStart={() => setArrastandoId(o.id)}
                          onDragEnd={() => { setArrastandoId(null); setColunaAlvo(null); }}
                          onClick={() => setSelecionadaId(o.id)}
                          className={`p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl cursor-grab active:cursor-grabbing hover:border-[var(--color-border-default)] transition-all select-none ${arrastandoId === o.id ? "opacity-40 scale-95" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="text-[10px] font-black text-[var(--color-text-muted)]">{osCode(o.numero)}</span>
                              <p className="text-xs font-bold text-[var(--color-text-primary)] leading-snug mt-1 line-clamp-3">{o.titulo}</p>
                            </div>
                            <PrioridadeBadge p={o.prioridade} />
                          </div>
                          {o.clienteNome && <div className="text-[10px] text-[var(--color-text-muted)] mt-2 truncate">{o.clienteNome}</div>}
                          <div className="flex items-center justify-between mt-3 text-[10px] font-black">
                            <span className="text-[var(--color-text-muted)] truncate">{o.responsavelNome || "Sem responsável"}</span>
                            {prazo && <span className={prazo.atrasada ? "text-red-400" : "text-[var(--color-text-muted)]"}>{prazo.texto}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Visão geral: todas as OS de todos os departamentos */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título, cliente, responsável ou número" className={`${inputCls} pl-10`} />
              </div>
              {depsAtivos.length > 1 && (
                <select value={filtroDep} onChange={e => setFiltroDep(e.target.value)} className={`${inputCls} sm:w-56`}>
                  <option value="">Todos os departamentos</option>
                  {depsAtivos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              )}
            </div>

            {visaoGeral.length === 0 ? (
              <EmptyState icon={ClipboardList} title="Nenhuma OS encontrada" description={'Crie a primeira OS no botão "Nova OS".'} />
            ) : (
              <div className="rounded-2xl border border-[var(--color-border-subtle)] overflow-hidden divide-y divide-[var(--color-border-subtle)]">
                {visaoGeral.map(o => {
                  const etapa = os.etapaDaOrdem(o);
                  const dep = o.departamentoId ? depPorId.get(o.departamentoId) : undefined;
                  const prazo = prazoInfo(o, etapa);
                  return (
                    <button key={o.id} onClick={() => setSelecionadaId(o.id)} className="w-full text-left px-4 py-3 flex items-center gap-4 bg-[var(--color-surface)]/40 hover:bg-[var(--color-surface-sunken)]/50 transition-colors">
                      <span className="text-[10px] font-black text-[var(--color-text-muted)] w-14 shrink-0">{osCode(o.numero)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-[var(--color-text-primary)] truncate">{o.titulo}</div>
                        <div className="text-[10px] text-[var(--color-text-muted)] truncate">{[o.clienteNome, o.responsavelNome].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      {dep && <span className="hidden sm:inline text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-muted)]">{dep.nome}</span>}
                      <span className="flex items-center gap-1.5 text-[10px] font-black text-[var(--color-text-primary)] w-32 shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${etapa ? KANBAN_COR_CLASS[etapa.cor] ?? "bg-slate-500" : "bg-slate-600"}`} />
                        <span className="truncate">{etapa ? etapa.nome : o.status}</span>
                      </span>
                      <PrioridadeBadge p={o.prioridade} />
                      {prazo && <span className={`hidden md:inline text-[10px] font-black w-20 text-right ${prazo.atrasada ? "text-red-400" : "text-[var(--color-text-muted)]"}`}>{prazo.texto}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <NovaOsModal
        isOpen={novaOpen}
        onClose={() => setNovaOpen(false)}
        departamentos={depsAtivos}
        departamentoInicial={depAtual?.id ?? depsAtivos[0]?.id}
        onSave={async p => {
          const criada = await os.addOrdem(p);
          if (criada) setNovaOpen(false);
        }}
      />

      <DetalheOsModal
        ordem={selecionada}
        departamento={selecionada?.departamentoId ? depPorId.get(selecionada.departamentoId) : undefined}
        etapas={selecionada ? funilDaOrdem(selecionada)?.etapas ?? [] : []}
        onClose={() => setSelecionadaId(null)}
        onUpdate={os.updateOrdem}
        onMover={os.moverOrdem}
        onDelete={excluir}
        onAbrirCompleta={o => navigate(`/app/ordens-servico/${o.id}`)}
      />
    </>
  );
}

function TabBtn({ ativo, onClick, label, total }: { ativo: boolean; onClick: () => void; label: string; total: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
        ativo ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30" : "bg-[var(--color-surface-sunken)]/40 text-[var(--color-text-muted)] border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-sunken)]"
      }`}
    >
      {label}
      <span className={`px-1.5 rounded ${ativo ? "bg-[var(--color-primary-blue)]/20" : "bg-[var(--color-surface-sunken)]"}`}>{total}</span>
    </button>
  );
}

function NovaOsModal({
  isOpen, onClose, departamentos, departamentoInicial, onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  departamentos: OsDepartamento[];
  departamentoInicial?: string;
  onSave: (p: NovaOrdemPayload) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [prioridade, setPrioridade] = useState<OsPrioridade>("Normal");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [prazo, setPrazo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const depSelecionado = departamentoId || departamentoInicial || "";

  const salvar = async () => {
    if (!titulo.trim() || !depSelecionado) return;
    setSalvando(true);
    await onSave({
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      departamentoId: depSelecionado,
      prioridade,
      responsavelNome: responsavelNome.trim(),
      clienteNome: clienteNome.trim(),
      prazo: prazo || null,
    });
    setSalvando(false);
    setTitulo(""); setDescricao(""); setDepartamentoId(""); setPrioridade("Normal");
    setResponsavelNome(""); setClienteNome(""); setPrazo("");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nova Ordem de Serviço"
      description="A OS entra na primeira etapa do fluxo do departamento escolhido."
      maxWidth="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={!titulo.trim() || !depSelecionado || salvando} className="">Criar OS</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Título</label>
          <input autoFocus value={titulo} onChange={e => setTitulo(e.target.value)} className={inputCls} placeholder="O que precisa ser feito?" />
        </div>
        <div>
          <label className={labelCls}>Descrição</label>
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Departamento</label>
            <select value={depSelecionado} onChange={e => setDepartamentoId(e.target.value)} className={inputCls}>
              {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Prioridade</label>
            <select value={prioridade} onChange={e => setPrioridade(e.target.value as OsPrioridade)} className={inputCls}>
              {OS_PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Responsável</label>
            <input value={responsavelNome} onChange={e => setResponsavelNome(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Prazo</label>
            <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Cliente / projeto</label>
          <input value={clienteNome} onChange={e => setClienteNome(e.target.value)} className={inputCls} />
        </div>
      </div>
    </Modal>
  );
}

function DetalheOsModal({
  ordem, departamento, etapas, onClose, onUpdate, onMover, onDelete, onAbrirCompleta,
}: {
  ordem: OrdemServico | null;
  departamento?: OsDepartamento;
  etapas: OsEtapa[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Pick<OrdemServico, "titulo" | "descricao" | "prioridade" | "responsavelNome" | "clienteNome" | "prazo">>) => Promise<void>;
  onMover: (id: string, etapaId: string) => Promise<void>;
  onDelete: (o: OrdemServico) => void;
  onAbrirCompleta: (o: OrdemServico) => void;
}) {
  // Salva ao sair do campo (onBlur), só se mudou — sem botão "Salvar" e sem request por tecla.
  const salvarCampo = (campo: "titulo" | "descricao" | "responsavelNome" | "clienteNome", valor: string) => {
    if (!ordem) return;
    if (campo === "titulo" && !valor.trim()) return;
    if (valor !== (ordem[campo] ?? "")) onUpdate(ordem.id, { [campo]: valor });
  };

  return (
    <Modal
      isOpen={!!ordem}
      onClose={onClose}
      title={ordem ? `${osCode(ordem.numero)}${departamento ? ` · ${departamento.nome}` : ""}` : ""}
      maxWidth="max-w-lg"
      footer={
        ordem && (
          <div className="flex justify-between">
            <Button
              variant="ghost"
              disabled={ordem.status === "Faturada"}
              title={ordem.status === "Faturada" ? "OS faturada não pode ser excluída" : undefined}
              onClick={() => onDelete(ordem)}
              className="text-rose-500 hover:text-rose-400 gap-2"
            >
              <Trash2 className="w-4 h-4" /> Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onAbrirCompleta(ordem)}>Abrir OS completa</Button>
              <Button onClick={onClose}>Fechar</Button>
            </div>
          </div>
        )
      }
    >
      {ordem && (
        // key = id: reinicia os campos não controlados ao abrir outra OS.
        <fieldset key={ordem.id} disabled={isOsLocked(ordem.status)} className="space-y-4 min-w-0">
          <div>
            <label className={labelCls}>Título</label>
            <input defaultValue={ordem.titulo} onBlur={e => salvarCampo("titulo", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Etapa (status)</label>
            {etapas.length > 0 && ordem.etapaId ? (
              <select value={ordem.etapaId} onChange={e => onMover(ordem.id, e.target.value)} className={inputCls}>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            ) : (
              <div className={`${inputCls} text-[var(--color-text-muted)]`}>{ordem.status} · OS sem departamento</div>
            )}
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <textarea defaultValue={ordem.descricao} onBlur={e => salvarCampo("descricao", e.target.value)} rows={3} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Prioridade</label>
              <select value={ordem.prioridade} onChange={e => onUpdate(ordem.id, { prioridade: e.target.value as OsPrioridade })} className={inputCls}>
                {OS_PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Prazo</label>
              <input type="date" value={ordem.prazo ?? ""} onChange={e => onUpdate(ordem.id, { prazo: e.target.value || null })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Responsável</label>
              <input defaultValue={ordem.responsavelNome} onBlur={e => salvarCampo("responsavelNome", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Cliente / projeto</label>
              <input defaultValue={ordem.clienteNome} onBlur={e => salvarCampo("clienteNome", e.target.value)} className={inputCls} />
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] font-bold">
            {ordem.origemTipo && <>Origem: {OS_ORIGEM_LABEL[ordem.origemTipo] ?? ordem.origemTipo} · </>}
            Solicitante: {ordem.solicitanteNome || "—"} · Criada em {new Date(ordem.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </fieldset>
      )}
    </Modal>
  );
}
