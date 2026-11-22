import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Star } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../../lib/apiClient";

type Modelo = { id: string; nome: string };
type Lista = { padrao: Modelo; modelos: Modelo[]; principalId: string };

// A lista de modelos é a mesma para todas as linhas: busca uma vez e reaproveita.
let cacheLista: Promise<Lista | null> | null = null;
const carregarLista = () => (cacheLista ??= apiFetch("/api/financeiro/modelos-recibo").then((r) => (r.ok ? r.json() : null)).catch(() => null));
/** Chamada após salvar modelos novos, para o seletor enxergá-los sem recarregar a página. */
export const esquecerListaDeModelos = () => { cacheLista = null; };

/** Botão "Fatura/Recibo em PDF" de uma receita: com só o modelo do SPY gera direto; com modelos próprios, deixa escolher qual usar. */
export function BotaoFaturaPdf({ id, pago, className }: { id: string; pago: boolean; className: string }) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Lista | null>(null);
  const caixa = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { const alvo = e.target as Node; if (!caixa.current?.contains(alvo) && !menu.current?.contains(alvo)) setAberto(false); };
    const fechar = () => setAberto(false);
    window.addEventListener("scroll", fechar, true); window.addEventListener("resize", fechar);
    document.addEventListener("mousedown", fora);
    return () => { document.removeEventListener("mousedown", fora); window.removeEventListener("scroll", fechar, true); window.removeEventListener("resize", fechar); };
  }, [aberto]);

  async function gerar(modeloId?: string) {
    setAberto(false);
    try {
      const r = await apiFetch(`/api/financeiro/fatura/${encodeURIComponent(id)}${modeloId ? `?modelo=${encodeURIComponent(modeloId)}` : ""}`);
      if (!r.ok) { const j = await r.json().catch(() => ({})); toast.error(j.error || "Não foi possível gerar o PDF."); return; }
      window.open(URL.createObjectURL(await r.blob()), "_blank");
    } catch { toast.error("Não foi possível gerar o PDF agora."); }
  }

  async function clicar() {
    if (aberto) { setAberto(false); return; }
    const l = lista ?? (await carregarLista());
    if (l) setLista(l);
    if (!l || l.modelos.length === 0) return gerar();   // só o modelo do SPY: não há o que escolher
    const r = caixa.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setAberto(true);
  }

  const todos = lista ? [lista.padrao, ...lista.modelos] : [];
  return (
    <span ref={caixa} className="inline-flex">
      <button type="button" onClick={clicar} className={className} title={pago ? "Recibo em PDF" : "Fatura em PDF"}><FileText className="w-3.5 h-3.5" /></button>
      {aberto && lista && createPortal(
        <div ref={menu} style={{ position: "fixed", top: pos.top, right: pos.right }} className="z-[1000] min-w-[210px] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-lg p-1">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">{pago ? "Recibo" : "Fatura"}: escolha o modelo</div>
          {todos.map((m) => (
            <button key={m.id} type="button" onClick={() => gerar(m.id)} className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-1.5 hover:bg-[var(--color-surface-sunken)] cursor-pointer">
              {lista.principalId === m.id ? <Star className="w-3 h-3 fill-current shrink-0" /> : <span className="w-3 shrink-0" />}
              <span className="truncate">{m.nome}</span>{lista.principalId === m.id && <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">principal</span>}
            </button>
          ))}
        </div>, document.body)}
    </span>
  );
}
