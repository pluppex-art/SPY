import { useState } from "react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { OS_STATUS_TONE, isOsLocked, osCode } from "../../../lib/ordemServico";
import { cn } from "../../../lib/utils";
import type { NovaOrdemPayload, OrdemPatch } from "../hooks/useOS";
import { OS_ORIGEM_LABEL, OS_PRIORIDADES, type OrdemServico, type OsDepartamento, type OsEtapa, type OsPrioridade } from "../osTypes";

const inputCls =
  "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] disabled:opacity-60";
const labelCls = "block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5";

export function NovaOsModal({
  isOpen, onClose, departamentos, departamentoInicial, onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  departamentos: OsDepartamento[];
  departamentoInicial?: string;
  onSave: (p: NovaOrdemPayload) => Promise<boolean>;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [prioridade, setPrioridade] = useState<OsPrioridade>("Normal");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [prazo, setPrazo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const depSelecionado = departamentoId || departamentoInicial || departamentos[0]?.id || "";

  const salvar = async () => {
    if (!titulo.trim() || !depSelecionado) return;
    setSalvando(true);
    const ok = await onSave({
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      departamentoId: depSelecionado,
      prioridade,
      responsavelNome: responsavelNome.trim(),
      clienteNome: clienteNome.trim(),
      prazo: prazo || null,
    });
    setSalvando(false);
    if (!ok) return;
    setTitulo(""); setDescricao(""); setDepartamentoId(""); setPrioridade("Normal");
    setResponsavelNome(""); setClienteNome(""); setPrazo("");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nova ordem de serviço"
      description="Entra na primeira etapa do fluxo do departamento escolhido. Itens e valores você completa depois, na tela da OS."
      maxWidth="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={!titulo.trim() || !depSelecionado || salvando}>Criar OS</Button>
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

export function DetalheOsModal({
  ordem, departamento, etapas, onClose, onUpdate, onMover, onCancelar, onExcluir, onAbrirCompleta,
}: {
  ordem: OrdemServico | null;
  departamento?: OsDepartamento;
  etapas: OsEtapa[];
  onClose: () => void;
  onUpdate: (id: string, patch: OrdemPatch) => Promise<void>;
  onMover: (id: string, etapaId: string) => Promise<void>;
  onCancelar: (o: OrdemServico) => void;
  onExcluir: (o: OrdemServico) => void;
  onAbrirCompleta: (o: OrdemServico) => void;
}) {
  // Salva ao sair do campo, só se mudou — sem botão "Salvar" e sem request por tecla.
  const salvarCampo = (campo: "titulo" | "descricao" | "responsavelNome" | "clienteNome", valor: string) => {
    if (!ordem) return;
    if (campo === "titulo" && !valor.trim()) return;
    if (valor !== (ordem[campo] ?? "")) onUpdate(ordem.id, { [campo]: valor });
  };
  const travada = ordem ? isOsLocked(ordem.status) : false;

  return (
    <Modal
      isOpen={!!ordem}
      onClose={onClose}
      title={ordem ? `${osCode(ordem.numero)}${departamento ? ` · ${departamento.nome}` : ""}` : ""}
      maxWidth="max-w-lg"
      footer={
        ordem && (
          <div className="flex justify-between gap-2">
            {ordem.status === "Rascunho" ? (
              <Button variant="ghost" onClick={() => onExcluir(ordem)} className="text-rose-500 hover:text-rose-400">Excluir rascunho</Button>
            ) : !travada ? (
              <Button variant="ghost" onClick={() => onCancelar(ordem)} className="text-rose-500 hover:text-rose-400">Cancelar OS</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onAbrirCompleta(ordem)}>Abrir OS completa</Button>
              <Button onClick={onClose}>Fechar</Button>
            </div>
          </div>
        )
      }
    >
      {ordem && (
        // key = id: reinicia os campos não controlados ao abrir outra OS.
        <fieldset key={ordem.id} disabled={travada} className="space-y-4 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold border", OS_STATUS_TONE[ordem.status])}>{ordem.status}</span>
            {travada && <span className="text-[10px] text-[var(--color-text-faint)]">Travada para edição — use a tela completa da OS.</span>}
          </div>
          <div>
            <label className={labelCls}>Título</label>
            <input defaultValue={ordem.titulo} onBlur={e => salvarCampo("titulo", e.target.value)} className={inputCls} />
          </div>
          {etapas.length > 0 && ordem.etapaId && (
            <div>
              <label className={labelCls}>Etapa do departamento</label>
              <select value={ordem.etapaId} onChange={e => onMover(ordem.id, e.target.value)} className={inputCls}>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
          )}
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
          <p className="text-[10px] text-[var(--color-text-faint)]">
            {ordem.origemTipo && <>Origem: {OS_ORIGEM_LABEL[ordem.origemTipo] ?? ordem.origemTipo} · </>}
            Solicitante: {ordem.solicitanteNome || "—"} · Criada em {new Date(ordem.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </fieldset>
      )}
    </Modal>
  );
}
