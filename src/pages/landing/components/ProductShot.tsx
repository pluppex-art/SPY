import type { ReactNode } from "react";

/**
 * Slots de screenshots reais do produto (dados fictícios), em public/lp/<slot>.png|jpg|jpeg|webp.
 * Slots: pipeline, financeiro, aurora, dashboard, produtos, propostas, agenda, tarefas.
 * Se o arquivo não existir, o `fallback` (ou nada) é exibido. Nenhuma imagem é inventada.
 */
const FILES = Object.keys(import.meta.glob("/public/lp/*.{png,jpg,jpeg,webp}", { query: "?url", import: "default" }));

export function shotUrl(slot: string): string | undefined {
  const key = FILES.find((k) => new RegExp(`/${slot}\\.(png|jpe?g|webp)$`).test(k));
  return key ? key.replace(/^\/public/, "") : undefined;
}

export function ProductShot({
  slot,
  alt,
  fallback,
  className = "",
  eager,
  caption = "Tela do S.P.Y. com dados fictícios",
}: {
  slot: string;
  alt: string;
  fallback?: ReactNode;
  className?: string;
  eager?: boolean;
  caption?: string | false;
}) {
  const url = shotUrl(slot);
  if (!url) return <>{fallback ?? null}</>;
  return (
    <figure className={`sp-shot ${className}`}>
      <div className="sp-frame">
        <div className="sp-frame__bar" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <img src={url} alt={alt} width={1600} height={1000} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : undefined} />
      </div>
      {caption && <figcaption className="sp-caption">{caption}</figcaption>}
    </figure>
  );
}
