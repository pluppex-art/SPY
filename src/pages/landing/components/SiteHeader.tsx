import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "../../../components/ui/Logo";

export const NAV_LINKS = [
  { href: "#recursos", label: "O que faz" },
  { href: "#modulos", label: "Módulos" },
  { href: "#aurora", label: "Aurora" },
  { href: "#nichos", label: "Segmentos" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "Perguntas" },
];

/** Âncoras da landing: na própria /landing viram <a href="#x">; nas outras páginas, link para /landing#x. */
function AnchorLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  const { pathname } = useLocation();
  if (pathname === "/landing") return <a href={href} onClick={onClick}>{children}</a>;
  return <Link to={`/landing${href}`} onClick={onClick}>{children}</Link>;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // Sombra após rolar + barra de progresso (listener passivo, throttled por rAF; só transform/opacity)
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled((v) => (v === y > 8 ? v : y > 8));
      if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) btnRef.current?.focus();
  }, []);

  // Gaveta: trava a rolagem, Esc fecha, foco preso entre o botão e a gaveta
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close(true);
      } else if (e.key === "Tab") {
        const nodes = [btnRef.current, ...(drawerRef.current?.querySelectorAll<HTMLElement>("a") ?? [])].filter(Boolean) as HTMLElement[];
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onResize = () => window.innerWidth >= 900 && setOpen(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  return (
    <header className="sp-header" ref={headerRef} data-scrolled={scrolled}>
      <div className="sp-wrap">
        <div className="sp-header__bar">
          <Link to="/landing" className="sp-brand" aria-label="S.P.Y. — página inicial">
            <Logo variant="full" color="orange" size={32} />
          </Link>

          <nav className="sp-nav" aria-label="Principal">
            {NAV_LINKS.map((l) => (
              <AnchorLink key={l.href} href={l.href}>
                {l.label}
              </AnchorLink>
            ))}
          </nav>

          <nav className="sp-nav" aria-label="Acesso">
            <Link to="/login">Acessar</Link>
          </nav>
          <Link to="/f/spy" className="sp-btn sp-btn--primary sp-btn--sm">
            Implantar
          </Link>

          <button
            ref={btnRef}
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
      </div>

      <nav id="sp-drawer" ref={drawerRef} className="sp-drawer" aria-label="Menu" data-open={open}>
        {NAV_LINKS.map((l) => (
          <AnchorLink key={l.href} href={l.href} onClick={() => close()}>
            {l.label}
          </AnchorLink>
        ))}
        <Link to="/contato" onClick={() => close()}>
          Contato
        </Link>
        <Link to="/login" onClick={() => close()}>
          Acessar o sistema
        </Link>
      </nav>

      <div className="sp-progress" ref={barRef} aria-hidden="true" />
    </header>
  );
}
