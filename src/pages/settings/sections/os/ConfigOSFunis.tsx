import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2, ToggleLeft, ToggleRight, Layers, Check, Star } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { confirmDialog } from "../../../../components/ui/confirm-dialog";
import { Spinner } from "../../../../components/ui/spinner";
import { cn } from "../../../../lib/utils";
import { CORES_LISTA, ETAPA_CORES } from "../crm/funisTypes";
import { EtapaCard } from "../crm/EtapaCard";
import { useOS } from "../../../os/hooks/useOS";
import {
  OS_ETAPA_TIPOS,
  OS_TEMPLATES,
  novoIdEtapa,
  type OsDepartamento,
  type OsEtapa,
  type OsEtapaTipo,
  type OsFunil,
} from "../../../os/osTypes";

export function ConfigOSFunis() {
  const os = useOS();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);
  // Vários funis por departamento: qual está aberto no editor, criação e renomeação de funil.
  const [funilSelPorDep, setFunilSelPorDep] = useState<Record<string, string>>({});
  const [novoFunil, setNovoFunil] = useState<{ dep: string; nome: string } | null>(null);
  const [renomeandoFunil, setRenomeandoFunil] = useState<{ id: string; nome: string } | null>(null);

  if (os.loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const funisDe = (d: OsDepartamento): OsFunil[] => os.funis.filter(f => f.departamentoId === d.id);
  const funilDe = (d: OsDepartamento): OsFunil | undefined =>
    funisDe(d).find(f => f.id === funilSelPorDep[d.id]) ?? os.funilPadraoDe(d.id) ?? funisDe(d)[0];

  const handleCriarFunil = async (depId: string) => {
    const nome = (novoFunil?.dep === depId ? novoFunil.nome : "").trim();
    setNovoFunil(null);
    if (!nome) return;
    if (os.funis.some(f => f.departamentoId === depId && f.nome.toLowerCase() === nome.toLowerCase())) {
      toast.error(`Já existe um funil "${nome}" neste departamento.`);
      return;
    }
    const f = await os.addFunil(depId, nome);
    if (f) {
      setFunilSelPorDep(prev => ({ ...prev, [depId]: f.id }));
      toast.success(`Funil "${nome}" criado, com as etapas do funil padrão para você ajustar.`);
    }
  };

  const handleRenomearFunil = async () => {
    if (!renomeandoFunil) return;
    const nome = renomeandoFunil.nome.trim();
    const atual = os.funis.find(f => f.id === renomeandoFunil.id);
    setRenomeandoFunil(null);
    if (nome && atual && nome !== atual.nome) await os.renomearFunil(atual.id, nome);
  };

  const handleAlternarFunil = async (f: OsFunil) => {
    if (f.ativo && f.padrao) {
      toast.error("O funil padrão não pode ser desativado. Defina outro como padrão antes.");
      return;
    }
    const emUso = os.ordens.filter(o => o.funilId === f.id).length;
    if (f.ativo && emUso > 0 && !(await confirmDialog({
      title: "Desativar funil",
      description: `${emUso} OS usam o funil "${f.nome}" e deixam de aparecer na aba do departamento enquanto ele estiver inativo. Desativar mesmo assim?`,
    }))) return;
    await os.updateFunil(f.id, { ativo: !f.ativo });
  };

  const handleExcluirFunil = async (f: OsFunil) => {
    if (!(await confirmDialog({ title: "Excluir funil", description: `Excluir o funil "${f.nome}" e as etapas dele? Essa ação não pode ser desfeita.` }))) return;
    if (await os.deleteFunil(f.id)) {
      setFunilSelPorDep(prev => { const n = { ...prev }; delete n[f.departamentoId]; return n; });
      toast.success("Funil removido.");
    }
  };

  const handleCriar = async () => {
    const nome = novoNome.trim();
    if (!nome) return;
    if (os.departamentos.some(d => d.nome.toLowerCase() === nome.toLowerCase())) {
      toast.error(`Já existe um departamento "${nome}".`);
      return;
    }
    setCriando(true);
    const cor = CORES_LISTA[os.departamentos.length % CORES_LISTA.length];
    const dep = await os.addDepartamento(nome, cor);
    setCriando(false);
    if (dep) {
      setNovoNome("");
      setExpandedId(dep.id);
      toast.success(`Departamento "${nome}" criado!`);
    }
  };

  const handleRenomear = async () => {
    if (!renomeando) return;
    const nome = renomeando.nome.trim();
    const atual = os.departamentos.find(d => d.id === renomeando.id);
    setRenomeando(null);
    if (!nome || !atual || nome === atual.nome) return;
    await os.updateDepartamento(atual.id, { nome });
  };

  const handleExcluir = async (d: OsDepartamento) => {
    if (!(await confirmDialog({
      title: "Excluir departamento",
      description: `Excluir o departamento "${d.nome}" e o fluxo dele? Essa ação não pode ser desfeita.`,
    }))) return;
    if (await os.deleteDepartamento(d.id)) {
      if (expandedId === d.id) setExpandedId(null);
      toast.success("Departamento removido.");
    }
  };

  // ─── Edição de etapas (sempre sobre o array completo, ids estáveis) ──────
  const salvarEtapas = (f: OsFunil, etapas: OsEtapa[]) => os.updateFunil(f.id, { etapas });

  const patchEtapa = (f: OsFunil, etapaId: string, patch: Partial<OsEtapa>) =>
    salvarEtapas(f, f.etapas.map(e => (e.id === etapaId ? { ...e, ...patch } : e)));

  const adicionarEtapa = (f: OsFunil) => {
    const n = f.etapas.length;
    const nova: OsEtapa = {
      id: novoIdEtapa(),
      nome: `Nova Etapa ${n + 1}`,
      cor: CORES_LISTA[n % CORES_LISTA.length],
      iniciarMinimizado: false,
      tipo: "aberta",
    };
    // Entra antes das etapas finais (concluída/cancelada) para o fluxo continuar fazendo sentido.
    const primeiraFinal = f.etapas.findIndex(e => e.tipo !== "aberta");
    const etapas = [...f.etapas];
    etapas.splice(primeiraFinal === -1 ? etapas.length : primeiraFinal, 0, nova);
    salvarEtapas(f, etapas);
  };

  const excluirEtapa = async (f: OsFunil, etapa: OsEtapa) => {
    const emUso = os.ordens.filter(o => o.funilId === f.id && o.etapaId === etapa.id).length;
    if (!(await confirmDialog({
      title: "Excluir etapa",
      description: emUso > 0
        ? `Excluir a etapa "${etapa.nome}"? As ${emUso} OS que estão nela vão para a primeira etapa do fluxo.`
        : `Excluir a etapa "${etapa.nome}"? Essa ação não pode ser desfeita.`,
    }))) return;
    salvarEtapas(f, f.etapas.filter(e => e.id !== etapa.id));
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const f = os.funis.find(x => x.id === result.source.droppableId);
    if (!f) return;
    const etapas = [...f.etapas];
    const [movida] = etapas.splice(result.source.index, 1);
    etapas.splice(result.destination.index, 0, movida);
    salvarEtapas(f, etapas);
  };

  const vazio = os.departamentos.length === 0;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Funis de Operação</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Cadastre os departamentos da empresa e o fluxo (etapas) de cada um. Eles viram as abas da página de Ordens de Serviço.
        </p>
      </div>

      {vazio && (
        <div className="space-y-3">
          <p className="text-[11px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Comece por um modelo (tudo é editável depois)</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {OS_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => os.aplicarTemplate(t.id)}
                className="text-left rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]/80 hover:border-blue-500/40 p-4 transition-all"
              >
                <div className="text-sm font-black text-[var(--color-text-primary)]">{t.nome}</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-1">{t.descricao}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCriar()}
          placeholder="Novo departamento (ex.: Suporte, Design, Financeiro)"
          className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-blue-500/50 focus:outline-none"
        />
        <Button
          onClick={handleCriar}
          disabled={!novoNome.trim() || criando}
          className="px-6"
        >
          <Plus className="w-4 h-4 mr-2" /> Departamento
        </Button>
      </div>

      <div className="space-y-3">
        {os.departamentos.map(d => {
          const f = funilDe(d);
          const aberto = expandedId === d.id;
          const cor = ETAPA_CORES[d.cor] ?? ETAPA_CORES.slate;
          const qtdOs = os.ordens.filter(o => o.departamentoId === d.id).length;

          return (
            <Card key={d.id} className="bg-[var(--color-surface-elevated)]/80 backdrop-blur-xl border border-[var(--color-border-default)] hover:border-white/15 transition-all">
              <div className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-[var(--color-border-default)]" style={{ backgroundColor: `${cor.dot}22` }}>
                  <Layers className="w-5 h-5" style={{ color: cor.dot }} />
                </div>

                <div className="flex-1 min-w-0">
                  {renomeando?.id === d.id ? (
                    <input
                      autoFocus
                      value={renomeando.nome}
                      onChange={e => setRenomeando({ id: d.id, nome: e.target.value })}
                      onBlur={handleRenomear}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRenomear();
                        if (e.key === "Escape") setRenomeando(null);
                      }}
                      className="text-sm font-black bg-transparent border-b border-blue-500 text-[var(--color-text-primary)] outline-none w-full max-w-xs"
                    />
                  ) : (
                    <span className="font-black text-[var(--color-text-primary)] text-sm uppercase tracking-tight">{d.nome}</span>
                  )}
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {(f?.etapas ?? []).slice(0, 6).map((e, i, arr) => {
                      const c = ETAPA_CORES[e.cor] ?? ETAPA_CORES.slate;
                      return (
                        <React.Fragment key={e.id}>
                          <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded border bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
                            {e.nome}
                          </span>
                          {i < arr.length - 1 && <ChevronRight className="w-2.5 h-2.5 text-[var(--color-text-faint)] shrink-0" />}
                        </React.Fragment>
                      );
                    })}
                    {(f?.etapas.length ?? 0) > 6 && <span className="text-[9px] text-[var(--color-text-faint)] font-bold">+{(f?.etapas.length ?? 0) - 6}</span>}
                    <span className="text-[9px] text-[var(--color-text-faint)] font-bold ml-2">{qtdOs} OS{funisDe(d).length > 1 ? ` · ${funisDe(d).length} funis` : ""}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => os.updateDepartamento(d.id, { ativo: !d.ativo })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${d.ativo ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)]"}`}
                  >
                    {d.ativo ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    {d.ativo ? "Ativo" : "Inativo"}
                  </button>
                  <button
                    onClick={() => setRenomeando({ id: d.id, nome: d.nome })}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)] transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleExcluir(d)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-faint)] hover:text-rose-400 hover:border-rose-500/30 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setExpandedId(aberto ? null : d.id)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all ${aberto ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)]"}`}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${aberto ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {aberto && (
                <div className="border-t border-[var(--color-border-subtle)] px-4 pt-3 pb-1 flex flex-wrap items-center gap-2">
                  {funisDe(d).map(x => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => setFunilSelPorDep(prev => ({ ...prev, [d.id]: x.id }))}
                      title={x.padrao ? "Funil padrão: é nele que as OS novas entram" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                        f?.id === x.id
                          ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/30 text-[var(--color-primary-blue)]"
                          : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                        !x.ativo && "opacity-60",
                      )}
                    >
                      {x.padrao && <Star className="w-3 h-3 fill-current" />}
                      {x.nome}
                      {!x.ativo && <span className="text-[9px] uppercase">inativo</span>}
                    </button>
                  ))}
                  {novoFunil?.dep === d.id ? (
                    <input
                      autoFocus
                      value={novoFunil.nome}
                      onChange={e => setNovoFunil({ dep: d.id, nome: e.target.value })}
                      onBlur={() => handleCriarFunil(d.id)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleCriarFunil(d.id);
                        if (e.key === "Escape") setNovoFunil(null);
                      }}
                      placeholder="Nome do novo funil"
                      className="h-8 px-3 text-xs rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-primary-blue)] outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNovoFunil({ dep: d.id, nome: "" })}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-[var(--color-border-default)] text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all"
                    >
                      <Plus className="w-3 h-3" /> Novo funil
                    </button>
                  )}

                  {f && (
                    <div className="ml-auto flex items-center gap-1.5">
                      {renomeandoFunil?.id === f.id ? (
                        <input
                          autoFocus
                          value={renomeandoFunil.nome}
                          onChange={e => setRenomeandoFunil({ id: f.id, nome: e.target.value })}
                          onBlur={handleRenomearFunil}
                          onKeyDown={e => {
                            if (e.key === "Enter") handleRenomearFunil();
                            if (e.key === "Escape") setRenomeandoFunil(null);
                          }}
                          className="h-8 px-3 text-xs rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-primary-blue)] outline-none"
                        />
                      ) : (
                        <button type="button" onClick={() => setRenomeandoFunil({ id: f.id, nome: f.nome })} className="h-8 px-2.5 flex items-center gap-1 rounded-lg border border-[var(--color-border-default)] text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                          <Pencil className="w-3 h-3" /> Renomear
                        </button>
                      )}
                      {!f.padrao && (
                        <button type="button" onClick={() => os.definirFunilPadrao(f.id)} className="h-8 px-2.5 flex items-center gap-1 rounded-lg border border-[var(--color-border-default)] text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                          <Star className="w-3 h-3" /> Tornar padrão
                        </button>
                      )}
                      <button type="button" onClick={() => handleAlternarFunil(f)} className="h-8 px-2.5 flex items-center gap-1 rounded-lg border border-[var(--color-border-default)] text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                        {f.ativo ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5" />} {f.ativo ? "Ativo" : "Inativo"}
                      </button>
                      <button type="button" onClick={() => handleExcluirFunil(f)} title="Excluir funil" className="h-8 w-8 flex items-center justify-center rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-faint)] hover:text-rose-500 hover:border-rose-500/30">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {aberto && f && (
                <div className="border-t border-[var(--color-border-subtle)] overflow-x-auto">
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId={f.id} direction="horizontal">
                      {provided => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="flex gap-3 p-4 min-w-max">
                          {f.etapas.map((etapa, idx) => {
                            const corInfo = ETAPA_CORES[etapa.cor] ?? ETAPA_CORES.slate;
                            return (
                              <Draggable key={etapa.id} draggableId={etapa.id} index={idx}>
                                {(drag, snapshot) => (
                                  <div ref={drag.innerRef} {...drag.draggableProps} className={snapshot.isDragging ? "opacity-80 rotate-1 scale-105" : ""}>
                                    <EtapaCard
                                      stage={etapa}
                                      idx={idx}
                                      corInfo={corInfo}
                                      dragHandleProps={drag.dragHandleProps}
                                      onRename={nome => patchEtapa(f, etapa.id, { nome })}
                                      onDelete={() => excluirEtapa(f, etapa)}
                                      onUpdate={patch => patchEtapa(f, etapa.id, patch)}
                                      onColorChange={cor => patchEtapa(f, etapa.id, { cor })}
                                    />
                                    <label className="mt-2 block">
                                      <span className="text-[8px] font-black text-[var(--color-text-muted)] uppercase tracking-widest flex items-center gap-1">
                                        {etapa.tipo !== "aberta" && <Check className="w-2.5 h-2.5" />} Ao chegar aqui
                                      </span>
                                      <select
                                        value={etapa.tipo}
                                        onChange={e => patchEtapa(f, etapa.id, { tipo: e.target.value as OsEtapaTipo })}
                                        className="mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] focus:border-blue-500/50 focus:outline-none"
                                      >
                                        {OS_ETAPA_TIPOS.map(t => (
                                          <option key={t.id} value={t.id}>{t.label}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                          <button
                            onClick={() => adicionarEtapa(f)}
                            className="flex-shrink-0 w-[200px] rounded-2xl border border-dashed border-[var(--color-border-default)] bg-transparent flex flex-col items-center justify-center min-h-[220px] gap-2 text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] hover:border-[var(--color-border-default)] transition-all"
                          >
                            <Plus className="w-6 h-6" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Adicionar Etapa</span>
                          </button>
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
