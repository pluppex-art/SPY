/** Pré-visualização ao vivo do e-mail, montada pelo servidor (igual ao envio), no tamanho de computador ou de celular. */
import { useEffect, useRef, useState } from "react";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import { cn } from "../../../lib/utils";

export function PreviaEmail({ assunto, corpo, api }: { assunto: string; corpo: string; api: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [tela, setTela] = useState<"computador" | "celular">("computador");
  const [previa, setPrevia] = useState<{ subject: string; html: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [largura, setLargura] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const pedido = useRef(0);
  const chamar = useRef(api);
  chamar.current = api;

  useEffect(() => {
    const meu = ++pedido.current;
    if (!corpo.trim()) { setPrevia(null); setErro(""); setCarregando(false); return; }
    setCarregando(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await chamar.current("/api/email-campaigns/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: assunto, body: corpo }) });
        const j = await r.json().catch(() => ({}));
        if (meu !== pedido.current) return;
        if (!r.ok) throw new Error(j?.error || (r.status === 429 ? "Muitas atualizações seguidas. A pré-visualização volta em instantes." : "Não foi possível montar a pré-visualização."));
        setPrevia(j); setErro("");
      } catch (e: any) { if (meu === pedido.current) setErro(e.message); }
      finally { if (meu === pedido.current) setCarregando(false); }
    }, 900);
    return () => window.clearTimeout(t);
  }, [assunto, corpo]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // O e-mail é desenhado na largura real do aparelho e reduzido para caber no espaço.
  const base = tela === "computador" ? 680 : 375;
  const escala = largura ? Math.min(1, largura / base) : 1;
  const ALTURA = 520;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
          Pré-visualização {carregando && <Loader2 className="w-3 h-3 animate-spin" />}
        </span>
        <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
          {([["computador", "Computador", Monitor], ["celular", "Celular", Smartphone]] as const).map(([v, rotulo, Icone]) => (
            <button key={v} type="button" aria-pressed={tela === v} aria-label={rotulo} title={rotulo} onClick={() => setTela(v)}
              className={cn("rounded-md px-2 py-1 border-0 cursor-pointer", tela === v ? "bg-[var(--color-surface-elevated)] text-[var(--color-primary-blue)] shadow-sm" : "bg-transparent text-[var(--color-text-muted)]")}>
              <Icone className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden bg-[var(--color-surface-sunken)]">
        <div className="px-3 py-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]">
          <p className="text-[10px] text-[var(--color-text-faint)]">Assunto</p>
          <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{previa?.subject || assunto || "—"}</p>
        </div>
        <div ref={area} className="relative overflow-hidden" style={{ height: ALTURA }}>
          {previa && !erro ? (
            // sandbox vazio: nada do e-mail executa nem acessa o sistema.
            <iframe title="Pré-visualização do e-mail" sandbox="" srcDoc={previa.html} className="absolute top-0 border-0 bg-white"
              style={{ width: base, height: ALTURA / escala, transform: `scale(${escala})`, transformOrigin: "top left", left: Math.max(0, (largura - base * escala) / 2) }} />
          ) : (
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-[var(--color-text-faint)]">{erro || (corpo.trim() ? "Montando…" : "Escreva a mensagem ou envie o seu HTML para ver aqui.")}</p>
          )}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-text-faint)]">Exemplo com a pessoa "Maria da Silva". Os apps de e-mail podem mostrar pequenas diferenças.</p>
    </div>
  );
}
