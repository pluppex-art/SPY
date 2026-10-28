import type { ReactNode } from "react";
import { Logo } from "../../../components/ui/Logo";
import { Shield, Zap, Users, BarChart3 } from "lucide-react";

const features = [
  { icon: Shield,    label: "Segurança Corporativa",    desc: "Autenticação em múltiplos fatores e criptografia de ponta." },
  { icon: Zap,       label: "Aurora IA Integrada",      desc: "Inteligência artificial nativa em cada módulo da plataforma." },
  { icon: Users,     label: "Multi-tenant",              desc: "Gerencie equipes, clientes e parceiros em um só lugar." },
  { icon: BarChart3, label: "Analytics em tempo real",  desc: "Dashboards vivos com dados atualizados ao segundo." },
];

/** Dado um hex, gera uma versão com opacidade para uso em rgba() sem instalar libs */
export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Moldura das telas de autenticação (login, redefinir senha): painel de marca + painel do formulário. */
export function AuthLayout({ primaryColor, title, subtitle, children }: { primaryColor: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex overflow-hidden" style={{ background: "#070D1A" }}>

      {/* ── Painel esquerdo — branding animado ── */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden">

        {/* Fundo: gradiente radial usando a cor primária do tenant */}
        <div
          className="absolute inset-0 transition-all duration-700"
          style={{
            background:
              `radial-gradient(ellipse 80% 60% at 30% 40%, ${hexAlpha(primaryColor, 0.28)} 0%, transparent 70%), ` +
              `radial-gradient(ellipse 60% 50% at 80% 80%, ${hexAlpha(primaryColor, 0.12)} 0%, transparent 70%), ` +
              `#070D1A`,
          }}
        />

        {/* Grade pontilhada sutil */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />

        {/* Orbs animados — cor dinâmica do tenant */}
        <div
          className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl transition-colors duration-700"
          style={{
            background: `radial-gradient(circle, ${primaryColor}, transparent 70%)`,
            top: "10%", left: "5%",
            animation: "float1 8s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-72 h-72 rounded-full opacity-15 blur-3xl transition-colors duration-700"
          style={{
            background: `radial-gradient(circle, ${hexAlpha(primaryColor, 0.7)}, transparent 70%)`,
            bottom: "15%", right: "10%",
            animation: "float2 11s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-48 h-48 rounded-full opacity-10 blur-2xl transition-colors duration-700"
          style={{
            background: `radial-gradient(circle, ${hexAlpha(primaryColor, 0.5)}, transparent 70%)`,
            top: "55%", left: "40%",
            animation: "float3 14s ease-in-out infinite",
          }}
        />

        {/* Conteúdo do painel esquerdo */}
        <div className="relative z-10 flex flex-col h-full px-14 py-12">

          {/* Logo topo */}
          <div className="flex items-center gap-3">
            <div
              className="rounded-xl p-2.5 shadow-lg transition-all duration-700"
              style={{
                background: "rgba(255,255,255,0.06)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: `0 0 32px ${hexAlpha(primaryColor, 0.3)}`,
              }}
            >
              <Logo variant="icon" size={32} color={primaryColor} />
            </div>
            <span
              className="font-black tracking-[0.14em] text-xl transition-colors duration-700"
              style={{ color: primaryColor, textShadow: `0 0 20px ${hexAlpha(primaryColor, 0.5)}` }}
            >
              S.P.Y.
            </span>
          </div>

          {/* Headline */}
          <div className="mt-auto mb-10">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 transition-all duration-700"
              style={{
                background: hexAlpha(primaryColor, 0.15),
                border: `1px solid ${hexAlpha(primaryColor, 0.35)}`,
                color: primaryColor,
                filter: "brightness(1.4)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse inline-block"
                style={{ background: primaryColor }}
              />
              Plataforma Operacional Inteligente
            </div>

            <h1 className="text-5xl font-black leading-tight mb-4" style={{ color: "#F8FAFC" }}>
              Operação{" "}
              <span
                className="transition-colors duration-700 font-black"
                style={{
                  color: primaryColor,
                  textShadow: `0 0 32px ${hexAlpha(primaryColor, 0.4)}`,
                }}
              >
                inteligente,
              </span>
              <br />
              resultados reais.
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "#94A3B8", maxWidth: "420px" }}>
              Unifique CRM, finanças, clínicas, educação e muito mais numa única plataforma
              turbinada por Inteligência Artificial.
            </p>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-3 mb-12">
            {features.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-default"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 transition-all duration-700"
                  style={{
                    background: hexAlpha(primaryColor, 0.2),
                    border: `1px solid ${hexAlpha(primaryColor, 0.3)}`,
                  }}
                >
                  <Icon className="w-4 h-4 transition-colors duration-700" style={{ color: primaryColor, filter: "brightness(1.4)" }} />
                </div>
                <p className="text-xs font-semibold mb-1" style={{ color: "#E2E8F0" }}>{label}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: "#64748B" }}>{desc}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px]" style={{ color: "#334155" }}>
            © 2026 S.P.Y. Platform · Todos os direitos reservados
          </p>
        </div>
      </div>

      {/* ── Painel direito — formulário ── */}
      <div
        className="flex flex-col items-center justify-center w-full lg:w-[480px] xl:w-[520px] flex-shrink-0 px-8 py-12 relative"
        style={{
          background: "rgba(11,17,32,0.85)",
          backdropFilter: "blur(24px)",
          borderLeft: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Glow no topo do painel — cor do tenant */}
        <div
          className="absolute top-0 left-0 w-64 h-64 opacity-10 pointer-events-none transition-all duration-700"
          style={{
            background: `radial-gradient(circle at top left, ${primaryColor}, transparent 70%)`,
          }}
        />

        <div className="w-full max-w-sm relative z-10">

          {/* Logo mobile */}
          <div className="flex lg:hidden items-center gap-3 mb-10">
            <Logo variant="icon" size={28} color={primaryColor} />
            <span
              className="font-black tracking-[0.14em] text-lg transition-colors duration-700"
              style={{ color: primaryColor }}
            >
              S.P.Y.
            </span>
          </div>

          {/* Cabeçalho do form */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-1.5" style={{ color: "#F8FAFC" }}>
              {title}
            </h2>
            <p className="text-sm" style={{ color: "#64748B" }}>
              {subtitle}
            </p>
          </div>

          {/* Form com glass card */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {children}
          </div>

          <p className="text-[11px] text-center mt-8" style={{ color: "#334155" }}>
            © 2026 S.P.Y. Platform
          </p>
        </div>
      </div>

      {/* Keyframes para os orbs */}
      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%       { transform: translate(30px, -20px) scale(1.05); }
          66%       { transform: translate(-15px, 15px) scale(0.97); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40%       { transform: translate(-25px, 20px) scale(1.08); }
          70%       { transform: translate(20px, -10px) scale(0.95); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(15px, -30px) scale(1.1); }
        }
      `}</style>
    </div>
  );
}
