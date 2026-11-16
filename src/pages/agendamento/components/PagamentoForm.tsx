import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { HelpTip } from "../../../components/ui/help-tip";
import { cn } from "../../../lib/utils";
import { FORMAS, reaisBR } from "../../../lib/agendamento/cliente";
import { campo, rotulo } from "./Estilos";

export type PedidoPagamento =
  | { modo: "pendente" }
  | { modo: "receber"; forma?: string; misto?: { method: string; amount: number }[] }
  | { modo: "comanda" | "comanda_paga"; comanda: string };

type Escolha = "depois" | "unica" | "misto" | "comanda" | "comanda_paga";

interface Props {
  total: number;
  admin: boolean;
  podeReceber: boolean;
  /** Mostra a opção "Receber depois" (nova reserva). Na tela de receber ela não faz sentido. */
  permitirDepois?: boolean;
  onChange: (pedido: PedidoPagamento | null, erro: string | null) => void;
}

/** Escolha de como a reserva é paga: depois, uma forma, várias formas (misto), comanda ou baixa pela comanda. */
export function PagamentoForm({ total, admin, podeReceber, permitirDepois = true, onChange }: Props) {
  const [escolha, setEscolha] = useState<Escolha>(permitirDepois ? "depois" : "unica");
  const [forma, setForma] = useState<string>("PIX");
  const [comanda, setComanda] = useState("");
  const [partes, setPartes] = useState<{ method: string; amount: string }[]>([{ method: "PIX", amount: "" }, { method: "DINHEIRO", amount: "" }]);

  useEffect(() => {
    if (escolha === "depois") return onChange({ modo: "pendente" }, null);
    if (escolha === "unica") return onChange({ modo: "receber", forma }, null);
    if (escolha === "comanda" || escolha === "comanda_paga") return onChange(comanda.trim() ? { modo: escolha, comanda: comanda.trim() } : null, comanda.trim() ? null : "Informe o número da comanda.");
    const misto = partes.map((p) => ({ method: p.method, amount: Number(p.amount.replace(",", ".")) || 0 })).filter((p) => p.amount > 0);
    const soma = Math.round(misto.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    if (Math.abs(soma - total) > 0.009) return onChange(null, `As partes somam ${reaisBR(soma)} e o total é ${reaisBR(total)}.`);
    onChange({ modo: "receber", misto }, null);
  }, [escolha, forma, comanda, partes, total]); // eslint-disable-line react-hooks/exhaustive-deps

  const soma = partes.reduce((s, p) => s + (Number(p.amount.replace(",", ".")) || 0), 0);
  const opcoes: { id: Escolha; rotulo: string; ok: boolean }[] = [
    { id: "depois", rotulo: "Receber depois", ok: permitirDepois },
    { id: "unica", rotulo: "Receber agora", ok: podeReceber },
    { id: "misto", rotulo: "Várias formas", ok: podeReceber },
    { id: "comanda", rotulo: "Lançar na comanda", ok: podeReceber },
    { id: "comanda_paga", rotulo: "Já pago na comanda", ok: podeReceber },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <span className={rotulo}>Pagamento · total {reaisBR(total)}</span>
        <HelpTip label="Pagamento">Receber agora confirma a reserva e lança no Financeiro. “Lançar na comanda” guarda a reserva sem cobrar e ela não vence. “Já pago na comanda” dá baixa direto.</HelpTip>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.filter((o) => o.ok).map((o) => (
          <button key={o.id} type="button" onClick={() => setEscolha(o.id)} className={cn("px-3 h-8 rounded-lg text-xs font-bold border transition-colors", escolha === o.id ? "bg-[var(--color-primary)] text-white border-transparent" : "border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]")}>{o.rotulo}</button>
        ))}
      </div>

      {escolha === "unica" && (
        <div className="flex flex-wrap gap-1.5">
          {[...FORMAS.map((f) => ({ id: f.id as string, rotulo: f.rotulo })), ...(admin ? [{ id: "CORTESIA", rotulo: "Cortesia" }] : [])].map((f) => (
            <button key={f.id} type="button" onClick={() => setForma(f.id)} className={cn("px-3 h-9 rounded-xl text-sm font-semibold border", forma === f.id ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]" : "border-[var(--color-border-default)] text-[var(--color-text-secondary)]")}>{f.rotulo}</button>
          ))}
          {forma === "CORTESIA" && <p className="w-full text-xs text-amber-600">Cortesia zera o valor da reserva e não gera receita.</p>}
        </div>
      )}

      {escolha === "misto" && (
        <div className="space-y-2">
          {partes.map((p, i) => (
            <div key={i} className="flex gap-2">
              <select value={p.method} onChange={(e) => setPartes(partes.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))} className={cn(campo, "w-40")}>
                {FORMAS.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
              </select>
              <input inputMode="decimal" placeholder="0,00" value={p.amount} onChange={(e) => setPartes(partes.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className={campo} />
              {partes.length > 2 && <Button type="button" variant="ghost" size="icon" onClick={() => setPartes(partes.filter((_, j) => j !== i))} aria-label="Remover parte"><Trash2 className="w-4 h-4" /></Button>}
            </div>
          ))}
          <div className="flex items-center justify-between text-xs">
            <Button type="button" variant="ghost" size="sm" onClick={() => setPartes([...partes, { method: "DINHEIRO", amount: "" }])}><Plus className="w-3.5 h-3.5 mr-1" />Adicionar forma</Button>
            <span className={cn("font-bold", Math.abs(soma - total) < 0.01 ? "text-emerald-600" : "text-amber-600")}>{reaisBR(soma)} de {reaisBR(total)}</span>
          </div>
        </div>
      )}

      {(escolha === "comanda" || escolha === "comanda_paga") && (
        <input autoFocus value={comanda} onChange={(e) => setComanda(e.target.value)} placeholder="Número da comanda" maxLength={40} className={campo} />
      )}
    </div>
  );
}
