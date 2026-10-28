import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight, Eye, EyeOff, ShieldCheck, ArrowLeft } from "lucide-react";
import { updatePassword, supabase } from "../../lib/supabase";
import { isValidBrandHex, relativeLuminance } from "../../lib/theme";
import { toast } from "sonner";
import { Logo } from "../../components/ui/Logo";

const DEFAULT_ACCENT = "#F97316";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  // Padrão S.P.Y.: laranja com branco (igual aos e-mails). Se a empresa tem cor própria, ela substitui o laranja.
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
  const accent = brand.color || DEFAULT_ACCENT;
  const onAccent = relativeLuminance(accent) > 0.4 ? "#0f172a" : "#ffffff";
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

  const inputCls = "w-full bg-white border border-slate-300 text-slate-900 rounded-xl pl-11 pr-11 py-3.5 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25 transition-colors";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex items-center justify-center px-4 py-10" style={{ ["--accent" as any]: accent }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-900/10 border border-slate-200 overflow-hidden">
          <div className="bg-[#0B1120] px-8 py-7 text-center" style={{ borderBottom: `4px solid ${accent}` }}>
            <Logo variant="full" size={48} className="mx-auto justify-center" color={accent} />
          </div>

          <div className="px-8 pt-8 pb-9">
            <div className="mx-auto mb-5 w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${accent}1f`, color: accent }}>
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h1 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              Redefinir <span style={{ color: accent }}>senha</span>
            </h1>
            <p className="text-center text-slate-500 text-sm mt-2 mb-7">Escolha uma nova senha para acessar sua conta.</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Nova senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={inputCls} placeholder="••••••••" />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Confirmar nova senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type={show ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className={inputCls} placeholder="••••••••" />
                </div>
              </div>

              <ul className="space-y-1.5 text-xs">
                {rules.map((r) => (
                  <li key={r.label} className="flex items-center gap-2" style={{ color: r.ok ? accent : "#94a3b8" }}>
                    <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold" style={{ borderColor: r.ok ? accent : "#cbd5e1", background: r.ok ? accent : "transparent", color: r.ok ? onAccent : "transparent" }}>✓</span>
                    {r.label}
                  </li>
                ))}
              </ul>

              {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>}

              <button type="submit" disabled={loading} className="w-full py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 group shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60" style={{ background: accent, color: onAccent, boxShadow: `0 10px 24px -10px ${accent}` }}>
                {loading ? "Salvando..." : "Redefinir senha"} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            <button type="button" onClick={() => navigate("/login")} className="mt-6 mx-auto flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Voltar ao login
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">S.P.Y. · Seus dados protegidos</p>
      </div>
    </div>
  );
}
