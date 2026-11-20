import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/apiClient";
import { useAuth } from "../../../contexts/AuthContext";

// O widget só é baixado quando alguém clica em "Conectar" (o pacote traz um iframe/zoid bem pesado).
const PluggyConnect = lazy(() => import("react-pluggy-connect").then((m) => ({ default: m.PluggyConnect })));

export interface ConexaoBanco {
  id: string;
  item_id: string;
  connector_name: string | null;
  pluggy_account_id: string;
  pluggy_account_name: string | null;
  pluggy_account_type: string | null;
  conta_bancaria_id: string | null;
  status: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

interface StatusPluggy {
  configured: boolean;
  sandbox: boolean;
  /** url: endereço https que o Pluggy chamaria (null se o app não tem https público); secret: se PLUGGY_WEBHOOK_SECRET está definido. */
  webhook: { url: string | null; secret: boolean };
  connections: ConexaoBanco[];
}

interface SessaoWidget {
  accessToken: string;
  sandbox: boolean;
  contaId: string | null;
  itemId: string | null;
}

/** Texto e tom do estado de uma conexão, do ponto de vista de quem usa (e não do status técnico do Pluggy). */
export function estadoDaConexao(c: Pick<ConexaoBanco, "status" | "last_error">): { texto: string; tom: "ok" | "aviso" | "erro"; precisaReconectar: boolean } {
  const s = String(c.status || "").toUpperCase();
  if (["LOGIN_ERROR", "OUTDATED", "ERROR"].includes(s) || c.last_error) return { texto: "Reconectar", tom: "erro", precisaReconectar: true };
  if (["UPDATING", "LOGIN_IN_PROGRESS"].includes(s)) return { texto: "Atualizando…", tom: "aviso", precisaReconectar: false };
  if (["WAITING_USER_INPUT", "WAITING_USER_ACTION"].includes(s)) return { texto: "Aguardando você", tom: "aviso", precisaReconectar: true };
  return { texto: "Conectada", tom: "ok", precisaReconectar: false };
}

async function chamar<T = any>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(caminho, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const corpo: any = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(corpo?.error || "Não foi possível concluir. Tente de novo."), { code: corpo?.code });
  return corpo as T;
}

/**
 * Conexão automática com os bancos (Pluggy): estado das conexões, conectar/reconectar (abre o widget), sincronizar e desconectar.
 * `widget` precisa ser renderizado em algum lugar da página; `aoSincronizar` roda depois de importar movimentações.
 */
export function useConexaoBanco(aoSincronizar?: () => void) {
  const { activeTenantId, user } = useAuth();
  // A empresa vai em toda chamada: master e parceiro conectam o banco do cliente que estão vendo, não só o da própria empresa.
  const rota = useCallback((caminho: string) => `${caminho}${caminho.includes("?") ? "&" : "?"}tenantId=${encodeURIComponent(activeTenantId ?? "")}`, [activeTenantId]);
  const [status, setStatus] = useState<StatusPluggy | null>(null);
  const [sessao, setSessao] = useState<SessaoWidget | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      setStatus(await chamar<StatusPluggy>(rota("/api/pluggy/status")));
    } catch {
      // Sem permissão (não é admin) ou servidor sem a integração: a tela cai no modo manual (extrato OFX/CSV).
      setStatus({ configured: false, sandbox: false, webhook: { url: null, secret: false }, connections: [] });
    }
  }, [activeTenantId, rota]);
  useEffect(() => { carregar(); }, [carregar]);

  const resumo = (r: any) => {
    if (r.aguardando === "reconectar") return toast.error("O banco recusou o acesso. Use \"Reconectar\" para entrar de novo.");
    if (r.aguardando) return toast.info("Conexão criada. O banco ainda está liberando os dados — sincronize de novo em alguns minutos.");
    toast.success(`${r.importadas} movimentação(ões) nova(s) importada(s)${r.parcial ? " (há mais para importar: sincronize de novo)" : ""}.`);
  };

  /** Abre o widget do Pluggy. Com `itemId`, reabre a conexão existente para o cliente entrar de novo. */
  const conectar = useCallback(async (contaId: string | null, itemId?: string | null) => {
    setOcupado(`conectar:${contaId ?? itemId}`);
    try {
      const r = await chamar<{ accessToken: string; sandbox: boolean }>(rota("/api/pluggy/connect-token"), { method: "POST", body: JSON.stringify({ contaId, itemId: itemId ?? undefined }) });
      setSessao({ accessToken: r.accessToken, sandbox: r.sandbox, contaId, itemId: itemId ?? null });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(null);
    }
  }, [rota]);

  const finalizar = useCallback(async (itemId: string, contaId: string | null) => {
    setSessao(null);
    setOcupado(`importar:${itemId}`);
    const t = toast.loading("Buscando suas movimentações no banco…");
    try {
      const r = await chamar(rota("/api/pluggy/items"), { method: "POST", body: JSON.stringify({ itemId, contaId }) });
      toast.dismiss(t);
      resumo(r);
      await carregar();
      aoSincronizar?.();
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(e.message);
    } finally {
      setOcupado(null);
    }
  }, [carregar, aoSincronizar, rota]);

  const sincronizar = useCallback(async (itemId?: string) => {
    setOcupado(`sync:${itemId ?? "todas"}`);
    try {
      const r = await chamar(rota("/api/pluggy/sync"), { method: "POST", body: JSON.stringify({ itemId }) });
      resumo(r);
      await carregar();
      aoSincronizar?.();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(null);
    }
  }, [carregar, aoSincronizar, rota]);

  const desconectar = useCallback(async (itemId: string) => {
    setOcupado(`desconectar:${itemId}`);
    try {
      await chamar(rota(`/api/pluggy/connections/${itemId}`), { method: "DELETE" });
      toast.success("Conta desconectada do banco. As movimentações já importadas continuam na Conciliação.");
      await carregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(null);
    }
  }, [carregar, rota]);

  /** Só master: liga a atualização automática (o Pluggy passa a avisar o sistema quando o banco tem movimento novo). */
  const ativarAtualizacaoAutomatica = useCallback(async () => {
    setOcupado("webhook");
    try {
      const r = await chamar<{ criado: boolean }>("/api/pluggy/webhook/register", { method: "POST", body: "{}" });
      toast.success(r.criado ? "Atualização automática ativada." : "A atualização automática já estava ativa.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(null);
    }
  }, []);

  const widget: ReactNode = sessao ? (
    <Suspense fallback={null}>
      <PluggyConnect
        connectToken={sessao.accessToken}
        includeSandbox={sessao.sandbox}
        updateItem={sessao.itemId ?? undefined}
        language="pt"
        onSuccess={({ item }) => finalizar(item.id, sessao.contaId)}
        onError={(e) => { toast.error(e?.message || "Não foi possível conectar ao banco."); setSessao(null); }}
        onClose={() => setSessao(null)}
        onLoadError={() => { toast.error("Não foi possível carregar a janela de conexão. Verifique sua internet e tente de novo."); setSessao(null); }}
      />
    </Suspense>
  ) : null;

  return { status, ocupado, conectar, sincronizar, desconectar, ativarAtualizacaoAutomatica, souMaster: !!user?.isMaster, recarregar: carregar, widget };
}
