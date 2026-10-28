import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { FieldInput } from "./components/LoginForm";
import { AuthLayout, hexAlpha } from "./components/AuthLayout";
import { updatePassword, supabase } from "../../lib/supabase";
import { isValidBrandHex, LOGIN_DEFAULT_COLOR } from "../../lib/theme";
import { toast } from "sonner";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  // Mesmo layout do login (AuthLayout). Padrão S.P.Y.: laranja (igual aos e-mails). Se a empresa tem cor própria, ela substitui o laranja.
  // A logo é sempre a do S.P.Y.; o link do e-mail abre direto aqui, sem host da empresa, então a cor vem da
  // sessão de recuperação que o próprio link estabelece.
  const [brand, setBrand] = useState<{ color: string }>({ color: "" });

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const loadBrand = async (userId: string) => {
      try {
        const { data: u } = await supabase!.from("users").select("tenant_id").eq("id", userId).maybeSingle();
        if (!u?.tenant_id) return;
        const { data: t } = await supabase!.from("tenants").select("name, primary_color").eq("id", u.tenant_id).maybeSingle();
        if (cancelled || !t) return;
        setBrand({ color: isValidBrandHex(t.primary_color || "") ? t.primary_color : "" });
      } catch { /* sem marca: fica no padrão do S.P.Y. */ }
    };
    supabase.auth.getSession().then(({ data }) => { if (data.session?.user) void loadBrand(data.session.user.id); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session?.user) void loadBrand(session.user.id); });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);
  const accent = brand.color || LOGIN_DEFAULT_COLOR;
  const rules = [
    { ok: password.length >= 6, label: "Pelo menos 6 caracteres" },
    { ok: password.length > 0 && password === confirmPassword, label: "As duas senhas são iguais" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (password !== confirmPassword) { setError("As senhas não coincidem."); return; }

    setLoading(true);
    // O link do e-mail de recuperação já autentica temporariamente a sessão via
    // Supabase Auth — updatePassword() só troca a senha dessa sessão já ativa.
    const result = await updatePassword(password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Não foi possível redefinir a senha. O link pode ter expirado — solicite um novo.");
      return;
    }
    toast.success("Senha redefinida com sucesso! Faça login com a nova senha.");
    navigate("/login", { replace: true });
  };

  const toggle = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors duration-200"
      style={{ color: "#475569" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#94A3B8")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
      tabIndex={-1}
      aria-label={show ? "Ocultar senha" : "Mostrar senha"}
    >
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <AuthLayout primaryColor={accent} title="Redefinir senha" subtitle="Escolha uma nova senha para acessar sua conta.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="new-password" className="text-xs font-semibold" style={{ color: "#94A3B8" }}>Nova senha</label>
          <FieldInput id="new-password" type={show ? "text" : "password"} value={password} onChange={setPassword} placeholder="••••••••" icon={Lock} primaryColor={accent} autoComplete="new-password" rightSlot={toggle} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm-password" className="text-xs font-semibold" style={{ color: "#94A3B8" }}>Confirmar nova senha</label>
          <FieldInput id="confirm-password" type={show ? "text" : "password"} value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" icon={Lock} primaryColor={accent} autoComplete="new-password" />
        </div>

        <ul className="space-y-1.5 text-xs">
          {rules.map((r) => (
            <li key={r.label} className="flex items-center gap-2 transition-colors duration-200" style={{ color: r.ok ? accent : "#64748B", filter: r.ok ? "brightness(1.3)" : "none" }}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-200" style={{ border: `1px solid ${r.ok ? accent : "rgba(255,255,255,0.15)"}`, background: r.ok ? hexAlpha(accent, 0.2) : "transparent" }}>{r.ok ? "✓" : ""}</span>
              {r.label}
            </li>
          ))}
        </ul>

        {error && (
          <div className="text-xs rounded-xl px-4 py-3 flex items-start gap-2" style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.2)", color: "#FB7185" }}>
            <span className="mt-0.5 flex-shrink-0">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 group transition-all duration-300 disabled:opacity-60"
          style={{ background: loading ? hexAlpha(accent, 0.5) : `linear-gradient(135deg, ${accent} 0%, ${hexAlpha(accent, 0.85)} 100%)`, color: "#fff", boxShadow: loading ? "none" : `0 4px 24px ${hexAlpha(accent, 0.45)}` }}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          ) : (
            <>Redefinir senha <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" /></>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="w-full text-xs text-center transition-colors duration-200 py-1"
          style={{ color: "#475569" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#94A3B8")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
        >
          ← Voltar para o login
        </button>
      </form>
    </AuthLayout>
  );
}
