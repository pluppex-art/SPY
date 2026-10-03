import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { supabase } from "../lib/supabase";
import { confirmDialog } from "./ui/confirm-dialog";

/** Verificação em duas etapas (TOTP — Google Authenticator/Authy) via Supabase Auth. */
export function MfaCard() {
  const [factorId, setFactorId] = useState<string | null>(null);   // fator já verificado
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp?.find((f) => f.status === "verified")?.id ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const start = async () => {
    if (!supabase) return;
    setBusy(true);
    try {
      // fator pendente de tentativas anteriores atrapalha o enroll: remove antes
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of (list?.all ?? []).filter((x) => x.factor_type === "totp" && x.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `S.P.Y. ${new Date().toLocaleDateString("pt-BR")}` });
      if (error || !data) throw error ?? new Error("Falha ao iniciar.");
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e: any) { toast.error(e?.message || "Não foi possível iniciar a verificação em duas etapas."); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!supabase || !enroll) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
      if (error) throw error;
      toast.success("Verificação em duas etapas ativada.");
      setEnroll(null); setCode(""); await load();
    } catch (e: any) { toast.error(e?.message === "Invalid TOTP code entered" ? "Código inválido." : (e?.message || "Código inválido.")); }
    finally { setBusy(false); }
  };

  const disable = async () => {
    if (!supabase || !factorId) return;
    if (!(await confirmDialog({ title: "Desativar verificação em duas etapas", description: "Sua conta voltará a depender só da senha. Deseja continuar?", confirmText: "Desativar" }))) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) { toast.error(error.message); return; }
    toast.success("Verificação em duas etapas desativada."); await load();
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold">{factorId ? <ShieldCheck className="w-4 h-4 text-success" /> : <ShieldOff className="w-4 h-4 text-warning" />} Verificação em duas etapas</div>
      {factorId ? (
        <>
          <p className="text-sm text-[var(--color-text-muted)]">Ativa. No login, além da senha, será pedido o código do seu aplicativo autenticador.</p>
          <Button variant="outline" onClick={() => void disable()}>Desativar</Button>
        </>
      ) : enroll ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">1. Escaneie o QR code no Google Authenticator ou Authy. 2. Digite o código de 6 dígitos gerado.</p>
          <img src={enroll.qr} alt="QR code para o aplicativo autenticador" className="w-40 h-40 bg-white p-2 rounded-lg" />
          <p className="text-xs text-[var(--color-text-muted)]">Sem câmera? Chave manual: <code className="select-all">{enroll.secret}</code></p>
          <div className="flex gap-2">
            <input className="w-36 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-3 py-2 text-sm tracking-widest text-center" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <Button disabled={busy || code.length !== 6} onClick={() => void confirm()}>Confirmar</Button>
            <Button variant="outline" onClick={() => { setEnroll(null); setCode(""); }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--color-text-muted)]">Recomendado para administradores: protege a conta mesmo se a senha vazar.</p>
          <Button disabled={busy} onClick={() => void start()}>Ativar</Button>
        </>
      )}
    </Card>
  );
}
