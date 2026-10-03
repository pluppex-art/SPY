import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Clock, Play } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { useData } from "../../../contexts/DataContext";
import { supabase } from "../../../lib/supabase";
import { startImplementationForClient } from "../../../lib/implementationAutoStart";
import { cn } from "../../../lib/utils";
import { ClientePicker } from "./ClientePicker";

/**
 * Início de implementação dentro da aba "Implementação" da OS: clientes que já fecharam e ainda não
 * começaram, e "iniciar para outro cliente". Substitui o que a página de Implementações do CRM fazia —
 * agora o trabalho de implementar vive só na OS.
 */
export function IniciarImplementacao({ onIniciada }: { onIniciada: () => void }) {
  const { implementations, clienteBase, leads, products, addImplementation, updateClienteBase } = useData();
  const navigate = useNavigate();
  const [iniciando, setIniciando] = useState<string | null>(null);
  const trava = useRef(false);
  const [outroId, setOutroId] = useState("");

  const comImplementacao = useMemo(() => new Set((implementations as any[]).map(i => i.cliente_id)), [implementations]);
  const clientePorId = useMemo(() => new Map((clienteBase as any[]).map(c => [c.id, c])), [clienteBase]);

  // Clientes com negócio ganho (lead Fechado com cliente vinculado) que ainda não têm implementação — um por cliente.
  const aguardando = useMemo(() => {
    const vistos = new Set<string>();
    const out: { cliente: any; lead: any }[] = [];
    for (const l of leads as any[]) {
      if (l.status !== "Fechado" || !l.clientId || vistos.has(l.clientId) || comImplementacao.has(l.clientId)) continue;
      const cliente = clientePorId.get(l.clientId);
      if (!cliente) continue;
      vistos.add(l.clientId);
      out.push({ cliente, lead: l });
    }
    return out;
  }, [leads, clientePorId, comImplementacao]);

  const [aberto, setAberto] = useState(false);
  const mostrar = aberto || aguardando.length > 0;

  const iniciar = async (cliente: any, lead?: any) => {
    // Trava síncrona (o estado só atualiza no próximo render — um duplo clique passaria).
    if (trava.current) return;
    trava.current = true;
    setIniciando(cliente.id);
    try {
      const r = await startImplementationForClient(cliente, lead, {
        supabase, addImplementation, updateClienteBase, produtos: products as any[],
      });
      if (r?.id) {
        toast.success(r.alreadyExisted ? `"${cliente.name}" já tinha implementação.` : `Implementação iniciada para "${cliente.name}".`);
        setOutroId("");
        onIniciada();
        navigate(`/app/crm/implementacoes/${r.id}`);
      }
    } finally {
      trava.current = false;
      setIniciando(null);
    }
  };

  if (!mostrar) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary-blue)] hover:underline"
      >
        <Play className="w-3 h-3" /> Iniciar implementação para um cliente
      </button>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          {aguardando.length > 0 ? <Clock className="w-4 h-4 text-amber-500" /> : <Play className="w-4 h-4 text-[var(--color-primary-blue)]" />}
          {aguardando.length > 0 ? `Aguardando início (${aguardando.length})` : "Iniciar implementação"}
        </h3>
        {aguardando.length === 0 && (
          <button type="button" onClick={() => setAberto(false)} className="text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]">
            <ChevronDown className="w-4 h-4 rotate-180" />
          </button>
        )}
      </div>

      {aguardando.length > 0 && (
        <>
          <p className="text-xs text-[var(--color-text-muted)]">
            Clientes que já fecharam e ainda não têm implementação. Iniciar cria a OS no funil, com o cliente e o produto vendido.
          </p>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {aguardando.map(({ cliente, lead }) => (
              <div key={cliente.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{cliente.name}</p>
                  <p className="text-[11px] text-[var(--color-text-faint)] truncate">{[lead.name, lead.value ? `Venda ${lead.value}` : null].filter(Boolean).join(" · ")}</p>
                </div>
                <Button size="sm" disabled={iniciando === cliente.id} onClick={() => iniciar(cliente, lead)} className={cn("h-8 px-3 text-xs font-medium gap-1.5 shrink-0")}>
                  <Play className="w-3 h-3" /> Iniciar
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-start gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
        <span className="text-[11px] text-[var(--color-text-muted)] pt-2">Iniciar para outro cliente:</span>
        <div className="w-[300px] max-w-full">
          <ClientePicker clienteId={outroId} excluirIds={comImplementacao} onSelect={c => setOutroId(c?.id ?? "")} placeholder="Buscar cliente…" />
        </div>
        <Button
          size="sm" variant="outline" disabled={!outroId || iniciando === outroId}
          onClick={() => { const c = clientePorId.get(outroId); if (c) iniciar(c); }}
          className="h-8 px-3 text-xs font-medium mt-0.5"
        >
          Iniciar
        </Button>
      </div>
    </Card>
  );
}
