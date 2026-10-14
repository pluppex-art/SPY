import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";
import { useDocumentMeta } from "../useDocumentMeta";
import "../landing.css";

export type Block = { type: "p"; text: ReactNode } | { type: "ul"; items: ReactNode[] };
export interface Sec {
  id: string;
  title: string;
  blocks: Block[];
}

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

/** Documento longo com sumário lateral: política de privacidade, termos de uso. */
export function InstitutionalPage({
  metaTitle,
  metaDescription,
  title,
  intro,
  updated,
  sections,
}: {
  metaTitle: string;
  metaDescription: string;
  title: string;
  intro: string;
  updated: string;
  sections: Sec[];
}) {
  useDocumentMeta(metaTitle, metaDescription);
  const [active, setActive] = useState(sections[0].id);

  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0 });
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

        <article className="sp-doc__body">
          {sections.map((s) => (
            <section key={s.id} id={s.id}>
              <h2>{s.title}</h2>
              {s.blocks.map((b, i) =>
                b.type === "p" ? (
                  <p key={i}>{b.text}</p>
                ) : (
                  <ul key={i}>
                    {b.items.map((it, j) => (
                      <li key={j}>{it}</li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
        </article>
      </div>
    </InstitutionalShell>
  );
}
