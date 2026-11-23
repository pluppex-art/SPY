import { useEffect, useState } from "react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { PLATAFORMAS_TRAFEGO, type Campanha } from "../useMarketingTrafego";
import { cn } from "../../../lib/utils";

interface Coluna { id: string; title: string }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  colunas: Coluna[];
  /** Campanha em edição; null = criar uma nova. */
  campanha: Campanha | null;
  /** Data sugerida ao criar (vem do clique num dia do calendário). */
  dataInicial?: string;
  /** Etapa sugerida ao criar (vem do botão “Adicionar” de uma coluna do quadro). */
  etapaInicial?: string;
  onSalvar: (dados: Omit<Campanha, "id" | "date">, id?: string) => Promise<boolean>;
  onExcluir?: (id: string) => Promise<boolean>;
}

const rotulo = "text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]";
const campo = "w-full h-10 px-3 rounded-xl text-sm border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)]";

/** Criar ou editar uma campanha de tráfego pago. */
export function CampanhaModal({ isOpen, onClose, colunas, campanha, dataInicial, etapaInicial, onSalvar, onExcluir }: Props) {
  const [titulo, setTitulo] = useState("");
  const [plataforma, setPlataforma] = useState(PLATAFORMAS_TRAFEGO[0]);
  const [etapa, setEtapa] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [prioridade, setPrioridade] = useState<Campanha["priority"]>("Média");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitulo(campanha?.title ?? "");
    setPlataforma(campanha?.platform ?? PLATAFORMAS_TRAFEGO[0]);
    setEtapa(campanha?.colId ?? etapaInicial ?? colunas[0]?.id ?? "planejamento");
    setOrcamento(campanha ? String(campanha.value || "") : "");
    setInicio(campanha?.publishDateISO ?? dataInicial ?? "");
    setFim(campanha?.endDateISO ?? "");
    setPrioridade(campanha?.priority ?? "Média");
    setDescricao(campanha?.desc ?? "");
    setSalvando(false);
  }, [isOpen, campanha, dataInicial, etapaInicial, colunas]);

  const fimAntesDoInicio = !!inicio && !!fim && fim < inicio;

  const salvar = async () => {
    if (fimAntesDoInicio) return;
    setSalvando(true);
    const ok = await onSalvar(
      { title: titulo, platform: plataforma, colId: etapa, value: Number(orcamento.replace(",", ".")) || 0, publishDateISO: inicio, endDateISO: fim, priority: prioridade, desc: descricao },
      campanha?.id,
    );
    setSalvando(false);
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-lg"
      title={campanha ? "Editar campanha" : "Nova campanha de tráfego"}
      description="Planeje a campanha: onde vai rodar, quanto vai investir e quando começa e termina."
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          {campanha && onExcluir ? (
            <Button variant="outline" className="text-rose-500 border-rose-500/30 hover:bg-rose-500/10" onClick={async () => { if (await onExcluir(campanha.id)) onClose(); }}>Excluir</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || !titulo.trim() || fimAntesDoInicio}>{campanha ? "Salvar" : "Criar campanha"}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className={rotulo}>Nome da campanha</label>
          <Input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Remarketing — leads dos últimos 30 dias" maxLength={160} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={rotulo}>Plataforma</label>
            <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)} className={campo}>
              {PLATAFORMAS_TRAFEGO.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={rotulo}>Etapa</label>
            <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className={campo}>
              {colunas.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className={rotulo}>Orçamento (R$)</label>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={orcamento} onChange={(e) => setOrcamento(e.target.value)} placeholder="0,00" className={campo} />
          </div>
          <div className="space-y-1.5">
            <label className={rotulo}>Início</label>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
          </div>
          <div className="space-y-1.5">
            <label className={rotulo}>Fim</label>
            <input type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} className={cn(campo, fimAntesDoInicio && "border-rose-500")} />
          </div>
        </div>
        {fimAntesDoInicio && <p className="text-[11px] text-rose-500 -mt-2">A data final não pode ser antes da data de início.</p>}
        <div className="space-y-1.5">
          <label className={rotulo}>Prioridade</label>
          <div className="grid grid-cols-3 gap-2">
            {(["Alta", "Média", "Baixa"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrioridade(p)}
                className={cn(
                  "h-9 rounded-xl border text-xs font-bold transition-colors cursor-pointer",
                  prioridade === p
                    ? p === "Alta" ? "bg-rose-500/10 border-rose-500 text-rose-600" : p === "Média" ? "bg-amber-500/10 border-amber-500 text-amber-600" : "bg-emerald-500/10 border-emerald-500 text-emerald-600"
                    : "bg-[var(--color-surface)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={rotulo}>Objetivo e observações</label>
          <textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Objetivo (leads, vendas, tráfego…), público, criativos usados…" className={cn(campo, "h-auto py-2 resize-none")} />
        </div>
      </div>
    </Modal>
  );
}
