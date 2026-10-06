import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "../../components/ui/Logo";
import { useLpTheme } from "./theme/LpThemeContext";
import { LP_THEMES } from "./theme/LP_THEMES";

const LINKS = [
  { href: "#produto",       label: "Produto" },
  { href: "#inteligencia",  label: "Aurora" },
  { href: "#funcionalidades", label: "Recursos" },
  { href: "#segmentos",     label: "Para empresas" },
];

/** Seletor de 4 dots coloridos — troca o tema da LP ao vivo */
function ThemePicker() {
  const { theme, setThemeId } = useLpTheme();
  return (
    <div className="flex items-center gap-2" aria-label="Escolher tema de cor">
      {(Object.values(LP_THEMES)).map((t) => (
        <button
          key={t.id}
          onClick={() => setThemeId(t.id)}
          title={t.label}
          aria-label={`Tema ${t.label}`}
          className="relative w-5 h-5 rounded-full transition-all duration-200 focus-visible:outline-2"
          style={{
            background: t.primary,
            transform: theme.id === t.id ? "scale(1.25)" : "scale(1)",
            boxShadow: theme.id === t.id
              ? `0 0 0 2px white, 0 0 0 3.5px ${t.primary}`
              : "none",
          }}
        />
      ))}
    </div>
  );
}

export function Navbar({ onCtaClick }: { onCtaClick: () => void }) {
  const { theme } = useLpTheme();
  const [scrolled, setScrolled]     = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (href: string) => {
    setMobileOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/85 backdrop-blur-xl border-b border-slate-200 shadow-sm"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-5 sm:px-8 h-16 sm:h-20">
        {/* Logo */}
        <a
          href="#top"
          className="flex items-center gap-2.5 shrink-0"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        >
          <Logo variant="full" size={32} color={theme.logoColor} />
        </a>

        {/* Links desktop */}
        <div className="hidden lg:flex items-center gap-8">
          {LINKS.map((l) => (
            <button
              key={l.href}
              onClick={() => go(l.href)}
              className="text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              {l.label}
            </button>
          ))}
          <Link to="/privacidade" className="text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors">
            Privacidade
          </Link>
        </div>

        {/* Right side: picker + CTAs */}
        <div className="hidden lg:flex items-center gap-5">
          <ThemePicker />
          <button
            onClick={onCtaClick}
            className="text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            Acessar
          </button>
          <button
            onClick={onCtaClick}
            className={`px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${theme.ctaClass}`}
          >
            Quero conhecer o S.P.Y.
          </button>
        </div>

        {/* Hamburger mobile */}
        <button
          className="lg:hidden text-slate-900 p-2 -mr-2"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Menu mobile */}
      {mobileOpen && (
        <div className="lg:hidden bg-white/95 backdrop-blur-xl border-t border-slate-200 px-5 py-6 space-y-4">
          {/* Picker mobile */}
          <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Tema</span>
            <ThemePicker />
          </div>
          {LINKS.map((l) => (
            <button
              key={l.href}
              onClick={() => go(l.href)}
              className="block w-full text-left text-sm font-medium text-slate-600 py-1.5"
            >
              {l.label}
            </button>
          ))}
          <Link to="/privacidade" onClick={() => setMobileOpen(false)} className="block w-full text-left text-sm font-medium text-slate-600 py-1.5">
            Privacidade
          </Link>
          <button
            onClick={() => { setMobileOpen(false); onCtaClick(); }}
            className={`w-full mt-3 px-5 py-3 rounded-xl text-sm font-bold ${theme.ctaClass}`}
          >
            Quero conhecer o S.P.Y.
          </button>
        </div>
      )}
    </header>
  );
}
