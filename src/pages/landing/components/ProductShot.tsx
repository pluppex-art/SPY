import type { ReactNode } from "react";

/**
 * Slots de screenshots reais do produto.
 * Coloque o arquivo em public/lp/<slot>.png (ou .jpg/.jpeg/.webp). Enquanto o arquivo não existir,
 * o `fallback` (composição de UI) é exibido. Nenhuma imagem é inventada.
 * Slots usados: pipeline, aurora, financeiro.
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
  className,
  eager,
}: {
  slot: string;
  alt: string;
  fallback?: ReactNode;
  className?: string;
  eager?: boolean;
}) {
  const url = shotUrl(slot);
  if (!url) return <>{fallback ?? null}</>;
  return (
    <figure className={`sp-shot ${className ?? ""}`}>
      <img src={url} alt={alt} width={1600} height={1000} loading={eager ? "eager" : "lazy"} decoding="async" />
    </figure>
  );
}
