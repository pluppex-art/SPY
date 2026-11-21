import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../../components/ui/button";
import { apiFetch } from "../../../../lib/apiClient";
import { useAuth } from "../../../../contexts/AuthContext";

const inputCls =
  "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary-blue)]";

/** Senha de supervisor do PDV: o caixa precisa dela para remover item ou cancelar a venda. Só o hash fica no banco. */
export function SupervisorSenhaCard() {
  const { user, activeTenantId } = useAuth();
  const podeDefinir = !!(user?.isMaster || user?.isTenantAdmin);
  const q = activeTenantId ? `?tenantId=${encodeURIComponent(activeTenantId)}` : "";
  const [definida, setDefinida] = useState<boolean | null>(null);
  const [atualizadaEm, setAtualizadaEm] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/varejo/supervisor-senha${q}`);
      const j = await r.json().catch(() => ({}));
      setDefinida(r.ok ? !!j.definida : null);
      setAtualizadaEm(r.ok ? j.atualizadaEm ?? null : null);
    } catch { setDefinida(null); }
  }, [q]);
  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async () => {
    if (senha.length < 4) { toast.error("A senha precisa ter ao menos 4 caracteres."); return; }
    if (senha !== confirmar) { toast.error("A confirmação não confere com a senha."); return; }
    setSalvando(true);
    try {
      const r = await apiFetch(`/api/varejo/supervisor-senha${q}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.error || "Não foi possível salvar a senha."); return; }
      toast.success("Senha de supervisor salva.");
      setSenha(""); setConfirmar(""); setMostrar(false); setDefinida(true);
      void carregar();
    } catch { toast.error("Não foi possível salvar a senha."); }
    finally { setSalvando(false); }
  };

  return (
    <div className="pt-4 border-t border-[var(--color-border-subtle)] space-y-3">
      <div className="flex items-start gap-2">
        <KeyRound className="w-4 h-4 mt-0.5 text-[var(--color-primary-blue)]" />
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Senha de supervisor</p>
          <p className="text-xs text-[var(--color-text-muted)]">Pedida no caixa para remover um item ou cancelar a venda. Só o gestor define; ela fica guardada criptografada.</p>
        </div>
      </div>
      <p className={`text-xs font-semibold flex items-center gap-1.5 ${definida ? "text-emerald-500" : "text-amber-500"}`}>
        <ShieldCheck className="w-3.5 h-3.5" />
        {definida === null ? "Verificando…" : definida ? `Senha definida${atualizadaEm ? ` · última alteração em ${new Date(atualizadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}.` : "Ainda não definida: sem ela, o caixa não consegue remover item nem cancelar venda."}
      </p>
      {podeDefinir ? (
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">{definida ? "Nova senha" : "Senha"}</label>
            <div className="relative">
              <input type={mostrar ? "text" : "password"} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} className={`${inputCls} pr-9`} />
              <button type="button" onClick={() => setMostrar((v) => !v)} aria-label={mostrar ? "Ocultar senha digitada" : "Mostrar senha digitada"} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Confirmar senha</label>
            <input type={mostrar ? "text" : "password"} autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={inputCls} />
          </div>
          <Button type="button" variant="outline" onClick={salvar} disabled={salvando || !senha}>{salvando ? "Salvando…" : definida ? "Trocar senha" : "Definir senha"}</Button>
        </div>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)]">Somente administradores da empresa podem definir ou trocar a senha.</p>
      )}
    </div>
  );
}
