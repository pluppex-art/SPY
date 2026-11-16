import { useEffect, useMemo, useState } from "react";
import { Database, Loader2, RefreshCw, Unlink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { supabase } from "../../lib/supabase";
import { syncImplementationTenant } from "../../lib/implementationTenantApi";

import { HelpTip } from "../ui/help-tip";
const norm = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

interface Props {
  implementationId: string;
  clienteNome: string;
  linkedTenantId?: string | null;
  lastSyncedAt?: string | null;
  /** Atualiza o estado local (contexto) com o resultado — não depende de tempo real. */
  onSynced: (patch: { data: Record<string, any>; linked_tenant_id: string | null; last_synced_at: string | null }) => Promise<void> | void;
  onUnlink: () => Promise<void> | void;
  /** Chamado antes de sincronizar — a tela descarrega edições pendentes pra não perdê-las. */
  beforeSync?: () => Promise<void> | void;
}

/**
 * Vincula a implementação ao AMBIENTE que o cliente já tem no SPY e puxa o que
 * está lá (logins/usuários, integrações conectadas, funil, Aurora). Só master —
 * o servidor também exige. Senha e chaves de acesso nunca são lidas.
 */
export function TenantLinkCard({ implementationId, clienteNome, linkedTenantId, lastSyncedAt, onSynced, onUnlink, beforeSync }: Props) {
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("tenants").select("id, name").is("deleted_at", null).order("name").then(({ data }) => setTenants(data || []));
  }, []);

  // Sugere o ambiente com nome parecido com o do cliente.
  const sugestao = useMemo(() => {
    const c = norm(clienteNome);
    if (c.length < 4) return null;
    return tenants.find((t) => { const n = norm(t.name); return n.length >= 4 && (n.includes(c) || c.includes(n)); }) || null;
  }, [tenants, clienteNome]);

  useEffect(() => { if (!selected && sugestao) setSelected(sugestao.id); }, [sugestao, selected]);

  const linkedName = tenants.find((t) => t.id === linkedTenantId)?.name;

  const sync = async (tenantId: string) => {
    if (!tenantId) return;
    setBusy(true);
    try {
      await beforeSync?.();
      const r = await syncImplementationTenant(implementationId, tenantId);
      if (r.ok === false) { toast.error(r.error); return; }
      const body = r.body;
      await onSynced({ data: body.data, linked_tenant_id: tenantId, last_synced_at: body.syncedAt });
      const nCampos = body.filled?.length || 0;
      const nStatus = body.statusRaised?.length || 0;
      toast.success(
        nCampos + nStatus === 0
          ? `Nada novo — o formulário já tem tudo que o ambiente de ${body.tenantName} tinha.`
          : `Puxei ${nCampos} campo(s) e atualizei ${nStatus} status a partir de ${body.tenantName}.`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Database className="w-4 h-4 mt-0.5 text-[var(--color-text-faint)] shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Ambiente do cliente no SPY <HelpTip label="Sobre Ambiente do cliente no SPY">Se o cliente já tem conta no SPY, puxa usuários (logins), integrações já conectadas, funil e Aurora. Só preenche o que está vazio e nunca apaga o que você digitou.</HelpTip></h3>

          {linkedTenantId ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-[var(--color-text-primary)]">
                Vinculado a <strong>{linkedName || "ambiente do cliente"}</strong>
                {lastSyncedAt && <span className="text-[var(--color-text-faint)]"> · sincronizado em {new Date(lastSyncedAt).toLocaleString("pt-BR")}</span>}
              </span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => sync(linkedTenantId)} className="h-8 px-3 text-xs font-medium gap-1.5">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sincronizar de novo
              </Button>
              <button type="button" disabled={busy} onClick={() => onUnlink()} className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-danger)] inline-flex items-center gap-1 cursor-pointer">
                <Unlink className="w-3 h-3" /> Desvincular
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-1.5 text-xs cursor-pointer max-w-[280px]"
              >
                <option value="">Selecione o ambiente…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === sugestao?.id ? "  (sugerido)" : ""}</option>)}
              </select>
              <Button size="sm" disabled={!selected || busy} onClick={() => sync(selected)} className="h-8 px-3 text-xs font-medium gap-1.5">
                {busy && <Loader2 className="w-3 h-3 animate-spin" />} Vincular e puxar dados
              </Button>
            </div>
          )}

          <p className="text-[10px] text-[var(--color-text-faint)] mt-3 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Senhas e chaves de acesso nunca são lidas nem copiadas — só e-mail de login, IDs públicos e o status "conectado".
          </p>
        </div>
      </div>
    </Card>
  );
}
