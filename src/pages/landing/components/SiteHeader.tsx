import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

export const NAV_LINKS = [
  { href: "#recursos", label: "O que faz" },
  { href: "#aurora", label: "Aurora" },
  { href: "#nichos", label: "Por segmento" },
  { href: "#implantacao", label: "Implantação" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sp-header">
      <div className="sp-wrap">
        <div className="sp-header__bar">
          <Link to="/landing" className="sp-brand" aria-label="S.P.Y. — página inicial">
            <img src="/logo-icon.png" alt="" width={32} height={32} />
            S.P.Y.
          </Link>

          <nav className="sp-nav" aria-label="Principal">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>

          <Link to="/login" className="sp-nav sp-header__cta" style={{ minHeight: 44, padding: "0 12px", color: "var(--sp-muted)", fontSize: 15, fontWeight: 500 }}>
            Acessar
          </Link>
          <Link to="/f/spy" className="sp-btn sp-btn--primary sp-btn--sm">
            Implantar
          </Link>

          <button
            type="button"
            className="sp-menu-btn"
            aria-expanded={open}
            aria-controls="sp-drawer"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={22} strokeWidth={1.75} /> : <Menu size={22} strokeWidth={1.75} />}
          </button>
        </div>

        {open && (
          <nav id="sp-drawer" className="sp-drawer" aria-label="Menu">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
            <Link to="/login" onClick={() => setOpen(false)}>
              Acessar o sistema
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
