import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { apiFetch } from "../../lib/apiClient";
import { formatBRLCentavos } from "../../lib/dinheiro";

type Estado = { disponivel: boolean; ativa: boolean; podeAtivar: boolean; motivo: string | null; valorCents: number; primeiraCobranca: string | null };

async function chamar<T>(method: "GET" | "POST" | "DELETE"): Promise<T> {
  const res = await apiFetch("/api/checkout/recorrencia", { method });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Não foi possível concluir. Tente de novo.");
  return json as T;
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** Forma de pagamento da mensalidade. Não aparece enquanto a cobrança recorrente não estiver configurada no servidor. */
export function CobrancaDaAssinatura({ voltou }: { voltou?: boolean }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => chamar<Estado>("GET").then(setEstado).catch(() => setEstado(null)), []);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!estado?.disponivel) return null;

  const ligar = async () => {
    setOcupado(true); setErro("");
    try { window.location.assign((await chamar<{ url: string }>("POST")).url); }
    catch (e: any) { setErro(e.message); setOcupado(false); }
  };
  const cancelar = async () => {
    if (!(await confirmDialog({ title: "Cancelar a cobrança automática", description: "Você continua usando até o fim do período já pago. Depois disso, a renovação é feita por Pix. Deseja cancelar?", confirmText: "Cancelar cobrança", cancelText: "Voltar", variant: "success" }))) return;
    setOcupado(true); setErro("");
    try { await chamar("DELETE"); await carregar(); }
    catch (e: any) { setErro(e.message); }
    finally { setOcupado(false); }
  };
  const botao = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-60";
  const valor = estado.valorCents > 0 ? `${formatBRLCentavos(estado.valorCents)} por mês` : "";

  return (
    <section aria-labelledby="cobranca-titulo" className="mb-4 flex flex-col gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 id="cobranca-titulo" className="flex items-center gap-2 text-sm font-black text-[var(--color-text-primary)]"><CreditCard className="w-4 h-4" aria-hidden="true" /> Cobrança da assinatura</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {estado.ativa ? `Recorrente no cartão: ${valor}. Sem fidelidade.`
            : estado.podeAtivar ? `Um mês por vez, por Pix. Se ligar a cobrança automática, o cartão passa a pagar ${valor}, a primeira em ${dataBr(estado.primeiraCobranca!)}. Cancele quando quiser.`
            : estado.motivo}
        </p>
        {voltou && !estado.ativa && <p role="status" className="mt-1 text-xs font-bold text-[var(--color-text-primary)]">Cartão enviado ao Asaas. A confirmação pode levar alguns minutos.</p>}
        {erro && <p role="alert" className="mt-1 text-xs font-bold text-danger">{erro}</p>}
      </div>
      {estado.ativa ? (
        <button type="button" disabled={ocupado} onClick={() => void cancelar()} className={`${botao} border border-[var(--color-border-default)] text-[var(--color-text-primary)]`}>
          {ocupado && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Cancelar cobrança automática
        </button>
      ) : estado.podeAtivar && (
        <button type="button" disabled={ocupado} onClick={() => void ligar()} className={`${botao} bg-[var(--color-primary-blue)] !text-white`}>
          {ocupado && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Pagar no cartão todo mês
        </button>
      )}
    </section>
  );
}
