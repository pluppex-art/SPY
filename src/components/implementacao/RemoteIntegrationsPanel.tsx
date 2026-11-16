import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, ChevronDown, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { INTEGRATION_DEFS, type IntegrationDef, type MaskedIntegration } from "../../lib/tenantIntegrations";
import { fetchTenantIntegrations, saveTenantIntegration } from "../../lib/implementationTenantApi";

import { HelpTip } from "../ui/help-tip";
const inputCls =
  "w-full bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]";

interface Props {
  implementationId: string;
  /** Chamado depois de gravar — a tela puxa de novo o ambiente pra atualizar status/campos do formulário. */
  onSaved: () => Promise<void> | void;
}

function IntegrationForm({ def, view, implementationId, onDone }: { def: IntegrationDef; view: MaskedIntegration; implementationId: string; onDone: (v: MaskedIntegration) => void }) {
  const [values, setValues] = useState<Record<string, string>>({ ...view.values });
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState(view.connected);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      // Segredo vazio = "manter o que já existe" (o servidor respeita); só vai o que foi digitado.
      const payload: Record<string, string> = { ...values };
      for (const [k, v] of Object.entries(secrets)) if (v.trim() !== "") payload[k] = v.trim();
      const r = await saveTenantIntegration(implementationId, def.id, payload, connected);
      if (r.ok === false) { toast.error(r.error); return; }
      toast.success(`${def.label} gravada no ambiente do cliente.`);
      setSecrets({});
      onDone(r.integration);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {def.fields.map((f) => (
          <div key={f.prop}>
            <label className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1 flex items-center gap-1.5">
              {f.label}{f.required && <span className="text-rose-500">*</span>}
              {f.kind === "secret" && <KeyRound className="w-3 h-3 text-[var(--color-text-faint)]" />}
            </label>
            {f.kind === "select" ? (
              <select value={values[f.prop] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [f.prop]: e.target.value }))} className={cn(inputCls, "cursor-pointer")}>
                {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.kind === "secret" ? (
              <input
                type="password" autoComplete="off" value={secrets[f.prop] ?? ""}
                onChange={(e) => setSecrets((p) => ({ ...p, [f.prop]: e.target.value }))}
                placeholder={view.secretsSet[f.prop] ? "•••••••• já definida — deixe vazio para manter" : "Não definida"}
                className={inputCls}
              />
            ) : (
              <input type="text" value={values[f.prop] ?? ""} placeholder={f.placeholder} onChange={(e) => setValues((p) => ({ ...p, [f.prop]: e.target.value }))} className={inputCls} />
            )}
            {f.help && <p className="text-[10px] text-[var(--color-text-faint)] mt-1">{f.help}</p>}
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
        <input type="checkbox" checked={connected} onChange={(e) => setConnected(e.target.checked)} className="cursor-pointer" />
        Marcar como conectada (só depois de testar — exige os campos obrigatórios)
      </label>
      <div className="flex justify-end">
        <Button size="sm" disabled={saving} onClick={save} className="h-8 px-4 text-xs font-medium gap-1.5">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />} Gravar no ambiente do cliente
        </Button>
      </div>
    </div>
  );
}

/**
 * Configura as integrações do ambiente do cliente sem entrar nele. As chaves
 * são gravadas direto lá e NUNCA voltam pra cá depois de salvas (o servidor só
 * informa "definida"); não entram no formulário, no relatório nem no link do cliente.
 */
export function RemoteIntegrationsPanel({ implementationId, onSaved }: Props) {
  const [items, setItems] = useState<MaskedIntegration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetchTenantIntegrations(implementationId);
    if (r.ok === false) { setError(r.error); return; }
    setError(null);
    setItems(r.integrations);
  }, [implementationId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-[var(--color-text-faint)]" /> Configurar integrações do cliente
       <HelpTip label="Sobre Configurar integrações do cliente">Aqui você configura as integrações do cliente direto do seu painel, sem precisar entrar na conta dele. Preencha o que o cliente já informou e salve: quando ele abrir o SPY, a conexão já estará pronta.</HelpTip></h3>

      {error && <p className="text-xs text-rose-500">{error}</p>}
      {!items && !error && <p className="text-xs text-[var(--color-text-faint)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</p>}

      {items && (
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {INTEGRATION_DEFS.map((def) => {
            const view = items.find((i) => i.id === def.id);
            if (!view) return null;
            const anySecret = Object.values(view.secretsSet).some(Boolean);
            const status = view.connected ? { t: "Conectada", c: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" }
              : anySecret || Object.values(view.values).some((v) => v && v !== "sandbox" && v !== "production") ? { t: "Preenchida", c: "bg-blue-500/10 text-blue-500 border-blue-500/30" }
              : { t: "Não configurada", c: "bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)] border-[var(--color-border-subtle)]" };
            const isOpen = open === def.id;
            return (
              <div key={def.id} className="py-3">
                <button type="button" onClick={() => setOpen(isOpen ? null : def.id)} className="w-full flex items-center justify-between gap-3 cursor-pointer text-left">
                  <span className="text-xs font-semibold text-[var(--color-text-primary)]">{def.label}</span>
                  <span className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", status.c)}>{status.t}</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-[var(--color-text-faint)] transition-transform", isOpen && "rotate-180")} />
                  </span>
                </button>
                {isOpen && (
                  <IntegrationForm
                    def={def} view={view} implementationId={implementationId}
                    onDone={async (v) => { setItems((prev) => prev && prev.map((i) => (i.id === v.id ? v : i))); await onSaved(); }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-[var(--color-text-faint)] mt-4 flex items-start gap-1">
        <ShieldCheck className="w-3 h-3 shrink-0 mt-px" />
        As chaves são gravadas direto no ambiente do cliente e nunca voltam pra esta tela, pro formulário, pro relatório nem pro link do cliente. WhatsApp e SMTP continuam no ambiente dele (WhatsApp exige ler o QR Code no número do cliente).
      </p>
    </Card>
  );
}
