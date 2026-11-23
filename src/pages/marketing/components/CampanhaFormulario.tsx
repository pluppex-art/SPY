import { useEffect, useState } from "react";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { useData } from "../../../contexts/DataContext";
import { PLATAFORMAS_TRAFEGO, OBJETIVOS_TRAFEGO, CHECKLIST_PADRAO, type Campanha } from "../useMarketingTrafego";
import { cn } from "../../../lib/utils";

interface Coluna { id: string; title: string }

interface Props {
  /** Campanha em edição; null = criar uma nova. */
  campanha: Campanha | null;
  colunas: Coluna[];
  /** Data sugerida ao criar (vem do clique num dia do calendário). */
  dataInicial?: string;
  /** Etapa sugerida ao criar (vem do botão “Adicionar” de uma coluna do quadro). */
  etapaInicial?: string;
  onSalvar: (dados: Omit<Campanha, "id" | "date">, id?: string) => Promise<boolean>;
  /** Chamado depois de salvar com sucesso. */
  onSalvo: () => void;
  onCancelar: () => void;
}

const rotulo = "text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]";
const campo = "w-full h-10 px-3 rounded-xl text-sm border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)]";

/** Campos da campanha de tráfego (usado para criar, no modal, e para editar, dentro do painel de detalhes). */
export function CampanhaFormulario({ campanha, colunas, dataInicial, etapaInicial, onSalvar, onSalvo, onCancelar }: Props) {
  const [titulo, setTitulo] = useState("");
  const [plataforma, setPlataforma] = useState(PLATAFORMAS_TRAFEGO[0]);
  const [etapa, setEtapa] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [prioridade, setPrioridade] = useState<Campanha["priority"]>("Média");
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [publico, setPublico] = useState("");
  const [gastoReal, setGastoReal] = useState("");
  const [salvando, setSalvando] = useState(false);
  const { colaboradores } = useData();
  const nomes = Array.from(new Set([...(colaboradores as any[]).map((c) => String(c.nome || "").trim()).filter(Boolean), ...(campanha?.responsavel ? [campanha.responsavel] : [])])).sort();

  useEffect(() => {
    setTitulo(campanha?.title ?? "");
    setPlataforma(campanha?.platform ?? PLATAFORMAS_TRAFEGO[0]);
    setEtapa(campanha?.colId ?? etapaInicial ?? colunas[0]?.id ?? "planejamento");
    setOrcamento(campanha ? String(campanha.value || "") : "");
    setInicio(campanha?.publishDateISO ?? dataInicial ?? "");
    setFim(campanha?.endDateISO ?? "");
    setPrioridade(campanha?.priority ?? "Média");
    setDescricao(campanha?.desc ?? "");
    setResponsavel(campanha?.responsavel ?? "");
    setObjetivo(campanha?.objetivo ?? "");
    setPublico(campanha?.publico ?? "");
    setGastoReal(campanha?.gastoReal ? String(campanha.gastoReal) : "");
    setSalvando(false);
  }, [campanha?.id, dataInicial, etapaInicial]); // eslint-disable-line react-hooks/exhaustive-deps

  const fimAntesDoInicio = !!inicio && !!fim && fim < inicio;

  const salvar = async () => {
    if (fimAntesDoInicio) return;
    setSalvando(true);
    const ok = await onSalvar(
      { title: titulo, platform: plataforma, colId: etapa, value: Number(orcamento.replace(",", ".")) || 0, publishDateISO: inicio, endDateISO: fim, priority: prioridade, desc: descricao,
        responsavel, objetivo, publico, gastoReal: Number(gastoReal.replace(",", ".")) || 0,
        checklist: campanha?.checklist ?? CHECKLIST_PADRAO.map((texto, i) => ({ id: `p${i}`, texto, feito: false })), notas: campanha?.notas ?? [] },
      campanha?.id,
    );
    setSalvando(false);
    if (ok) onSalvo();
  };

  return (
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={rotulo}>Responsável</label>
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}>
            <option value="">Sem responsável</option>
            {nomes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={rotulo}>Objetivo</label>
          <select value={objetivo} onChange={(e) => setObjetivo(e.target.value)} className={campo}>
            <option value="">Não definido</option>
            {OBJETIVOS_TRAFEGO.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={rotulo}>Público-alvo</label>
          <Input value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Ex.: mulheres 25–40, São Paulo" maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <label className={rotulo}>Gasto real até agora (R$)</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={gastoReal} onChange={(e) => setGastoReal(e.target.value)} placeholder="0,00" className={campo} />
        </div>
      </div>
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
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button onClick={salvar} disabled={salvando || !titulo.trim() || fimAntesDoInicio}>{salvando ? "Salvando…" : campanha ? "Salvar alterações" : "Criar campanha"}</Button>
      </div>
    </div>
  );
}
