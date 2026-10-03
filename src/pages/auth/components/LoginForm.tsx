import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import { Lock, Mail, ArrowRight, Eye, EyeOff, Loader2, KeyRound } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { signIn, requestPasswordReset, verifyMfaAndFinish } from "../../../lib/supabase";
import { toast } from "sonner";
import { persistTenantTheme } from "../hooks/useLoginTheme";
import { DEFAULT_BRAND_COLOR } from "../../../lib/theme";

interface LoginFormProps {
  /** Cor primária do tenant (resolvida pelo useLoginTheme) */
  primaryColor?: string;
  /** Chamado a cada mudança de e-mail para re-resolver a cor do tenant */
  onEmailChange?: (email: string) => void;
}

function FieldInput({
  id,
  type,
  value,
  onChange,
  placeholder,
  icon: Icon,
  rightSlot,
  primaryColor,
}: {
  id: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: React.ElementType;
  rightSlot?: React.ReactNode;
  primaryColor: string;
}) {
  const [focused, setFocused] = useState(false);

  const r = parseInt(primaryColor.slice(1, 3), 16);
  const g = parseInt(primaryColor.slice(3, 5), 16);
  const b = parseInt(primaryColor.slice(5, 7), 16);
  const alpha = (a: number) => `rgba(${r},${g},${b},${a})`;

  return (
    <div className="relative">
      <Icon
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors duration-200"
        style={{ color: focused ? primaryColor : "#475569" }}
      />
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={type === "password" ? "current-password" : "email"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full rounded-xl pl-10 pr-4 py-3 text-sm outline-none placeholder:text-[#334155] transition-all duration-200"
        style={{
          background: focused ? alpha(0.08) : "rgba(255,255,255,0.05)",
          border: `1px solid ${focused ? alpha(0.5) : "rgba(255,255,255,0.1)"}`,
          color: "#E2E8F0",
          boxShadow: focused ? `0 0 0 3px ${alpha(0.15)}` : "none",
        }}
      />
      {rightSlot}
    </div>
  );
}

export function LoginForm({ primaryColor = DEFAULT_BRAND_COLOR, onEmailChange }: LoginFormProps) {
  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
  const [showPassword, setShowPassword]     = useState(false);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState("");
  const [showForgotPassword, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail]         = useState("");
  const [sendingReset, setSendingReset]     = useState(false);

  const navigate  = useNavigate();
  const location  = useLocation();
  const { login } = useAuth();
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const from      = location.state?.from?.pathname || "/app/dashboard";

  const r = parseInt(primaryColor.slice(1, 3), 16);
  const g = parseInt(primaryColor.slice(3, 5), 16);
  const b = parseInt(primaryColor.slice(5, 7), 16);
  const alpha = (a: number) => `rgba(${r},${g},${b},${a})`;

  const handleEmailChange = (v: string) => {
    setEmail(v);
    onEmailChange?.(v);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setSendingReset(true);
    await requestPasswordReset(resetEmail);
    setSendingReset(false);
    toast.success("Se esse e-mail estiver cadastrado, enviamos um link para redefinir a senha.");
    setShowForgot(false);
    setResetEmail("");
  };

  const completeLogin = (result: { user?: any }) => {
    login(result.user);
    // Persiste a cor do tenant para o favicon e para a tela de login
    const chosenColor = (result.user as any)?.tenantPrimaryColor || primaryColor;
    if (chosenColor) {
      persistTenantTheme(chosenColor, result.user.tenantName);
    }
    toast.success(`Bem-vindo, ${result.user.name}!`);
    navigate(from, { replace: true });
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId || mfaCode.length !== 6) return;
    setError(""); setLoading(true);
    try {
      const result = await verifyMfaAndFinish(mfaFactorId, mfaCode);
      if (!result.success) { setError(result.error || "Código inválido."); setMfaCode(""); return; }
      completeLogin(result);
    } catch { setError("Erro ao validar o código."); }
    finally { setLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Preencha e-mail e senha."); return; }
    setLoading(true);
    try {
      const result = await signIn(email, password);
      if (!result.success && result.error === "MFA_REQUIRED" && result.mfaFactorId) { setMfaFactorId(result.mfaFactorId); return; }
      if (!result.success) { setError(result.error || "Falha no login"); return; }
      completeLogin(result);
    } catch {
      setError("Erro ao processar autenticação.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Desafio de verificação em duas etapas ── */
  if (mfaFactorId) {
    return (
      <form onSubmit={handleMfa} className="space-y-5">
        <div>
          <h3 className="text-sm font-bold" style={{ color: "#F8FAFC" }}>Verificação em duas etapas</h3>
          <p className="text-[11px]" style={{ color: "#64748B" }}>Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
        </div>
        <input
          autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))} placeholder="000000"
          className="w-full rounded-xl px-4 py-3 text-center text-lg tracking-[0.5em] outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${alpha(0.35)}`, color: "#F8FAFC" }}
        />
        {error && <p className="text-xs" style={{ color: "#F87171" }}>{error}</p>}
        <Button type="submit" disabled={loading || mfaCode.length !== 6} className="w-full">{loading ? "Verificando…" : "Verificar e entrar"}</Button>
        <button type="button" className="text-xs underline" style={{ color: "#64748B" }} onClick={() => { setMfaFactorId(null); setMfaCode(""); setError(""); }}>Voltar</button>
      </form>
    );
  }

  /* ── Tela de recuperação de senha ── */
  if (showForgotPassword) {
    return (
      <form onSubmit={handleForgotPassword} className="space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-700"
            style={{ background: alpha(0.2), border: `1px solid ${alpha(0.3)}` }}
          >
            <KeyRound className="w-4 h-4 transition-colors duration-700" style={{ color: primaryColor, filter: "brightness(1.4)" }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "#F8FAFC" }}>Redefinir senha</h3>
            <p className="text-[11px]" style={{ color: "#64748B" }}>
              Enviaremos um link para seu e-mail.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reset-email" className="text-xs font-semibold" style={{ color: "#94A3B8" }}>
            E-mail Corporativo
          </label>
          <FieldInput
            id="reset-email"
            type="email"
            value={resetEmail}
            onChange={setResetEmail}
            placeholder="admin@empresa.com"
            icon={Mail}
            primaryColor={primaryColor}
          />
        </div>

        <button
          type="submit"
          disabled={sendingReset || !resetEmail}
          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${alpha(0.8)})`,
            color: "#fff",
            boxShadow: `0 4px 20px ${alpha(0.4)}`,
          }}
        >
          {sendingReset ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
          ) : (
            "Enviar link de redefinição"
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowForgot(false)}
          className="w-full text-xs text-center transition-colors duration-200 py-1"
          style={{ color: "#475569" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#94A3B8")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
        >
          ← Voltar para o login
        </button>
      </form>
    );
  }

  /* ── Formulário principal ── */
  return (
    <form onSubmit={handleLogin} className="space-y-5">

      {/* E-mail */}
      <div className="space-y-1.5">
        <label htmlFor="login-email" className="text-xs font-semibold" style={{ color: "#94A3B8" }}>
          E-mail Corporativo
        </label>
        <FieldInput
          id="login-email"
          type="email"
          value={email}
          onChange={handleEmailChange}
          placeholder="admin@empresa.com"
          icon={Mail}
          primaryColor={primaryColor}
        />
      </div>

      {/* Senha */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label htmlFor="login-password" className="text-xs font-semibold" style={{ color: "#94A3B8" }}>
            Senha
          </label>
          <button
            type="button"
            onClick={() => { setShowForgot(true); setResetEmail(email); }}
            className="text-xs transition-colors duration-200"
            style={{ color: primaryColor, filter: "brightness(1.3)" }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.6)")}
            onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1.3)")}
          >
            Esqueci a senha
          </button>
        </div>
        <FieldInput
          id="login-password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          icon={Lock}
          primaryColor={primaryColor}
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors duration-200"
              style={{ color: "#475569" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#94A3B8")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
              tabIndex={-1}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />
      </div>

      {/* Mensagem de erro */}
      {error && (
        <div
          className="text-xs rounded-xl px-4 py-3 flex items-start gap-2"
          style={{
            background: "rgba(244,63,94,0.1)",
            border: "1px solid rgba(244,63,94,0.2)",
            color: "#FB7185",
          }}
        >
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Botão de login */}
      <button
        id="login-submit"
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 group transition-all duration-300 disabled:opacity-60"
        style={{
          background: loading
            ? alpha(0.5)
            : `linear-gradient(135deg, ${primaryColor} 0%, ${alpha(0.85)} 100%)`,
          color: "#fff",
          boxShadow: loading ? "none" : `0 4px 24px ${alpha(0.45)}`,
        }}
        onMouseEnter={(e) => {
          if (!loading) e.currentTarget.style.boxShadow = `0 6px 32px ${alpha(0.6)}`;
        }}
        onMouseLeave={(e) => {
          if (!loading) e.currentTarget.style.boxShadow = `0 4px 24px ${alpha(0.45)}`;
        }}
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>
        ) : (
          <>
            Entrar
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </>
        )}
      </button>
    </form>
  );
}
