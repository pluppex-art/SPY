import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { DocContent } from "./docTypes";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";
import { useDocumentMeta } from "../useDocumentMeta";
import "../landing.css";

/** Moldura das páginas institucionais (mesmo header, footer e tema claro da landing). */
export function InstitutionalShell({ children }: { children: ReactNode }) {
  return (
    <div className="sp-root">
      <a href="#conteudo" className="sp-skip">
        Ir para o conteúdo
      </a>
      <SiteHeader />
      <main id="conteudo">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** Documento longo com sumário lateral: política de privacidade, termos de uso. O texto vem de um módulo de conteúdo sem React (também usado no pré-render estático). */
export function InstitutionalPage({ doc }: { doc: DocContent }) {
  const { metaTitle, metaDescription, title, intro, updated, sections } = doc;
  const navigate = useNavigate();
  // links internos escritos como <a href="/contato"> navegam pelo router, sem recarregar a página
  const onBodyClick = (e: MouseEvent<HTMLElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (href.startsWith("/") && !href.startsWith("//")) {
      e.preventDefault();
      navigate(href);
    } else if (href.startsWith("#")) {
      e.preventDefault();
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", href);
    }
  };
  useDocumentMeta(metaTitle, metaDescription);
  const [active, setActive] = useState(sections[0].id);

  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (!h) window.scrollTo({ top: 0 });
    else window.setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: "start" }), 100);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const v = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (v) setActive(v.target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [sections]);

  return (
    <InstitutionalShell>
      <section className="sp-doc__hero" aria-labelledby="sp-doc-title">
        <div className="sp-wrap">
          <h1 id="sp-doc-title">{title}</h1>
          <p>{intro}</p>
          <p className="sp-doc__date">Última atualização: {updated}</p>
        </div>
      </section>

      <div className="sp-wrap sp-doc__grid">
        <aside className="sp-doc__toc">
          <nav aria-label="Sumário">
            <b>Nesta página</b>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                aria-current={active === s.id ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  history.replaceState(null, "", `#${s.id}`);
                }}
              >
                {s.title.replace(/^\d+\.\s*/, "")}
              </a>
            ))}
          </nav>
        </aside>

        <article className="sp-doc__body" onClick={onBodyClick}>
          {sections.map((s) => (
            <section key={s.id} id={s.id}>
              <h2>{s.title}</h2>
              <div className="sp-doc__rich" dangerouslySetInnerHTML={{ __html: s.html.filter(Boolean).join("") }} />
            </section>
          ))}
        </article>
      </div>
    </InstitutionalShell>
  );
}
