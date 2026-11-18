/**
 * Emblema do espião (ícone oficial da empresa) com radar: anéis que pulsam e um aro tracejado girando.
 * Puramente decorativo (aria-hidden); o movimento vem do CSS e respeita prefers-reduced-motion.
 */
export function SpyEmblem({ className = "" }: { className?: string }) {
  return (
    <div className={`sp-emblem ${className}`} aria-hidden="true">
      <span className="sp-emblem__ping" />
      <span className="sp-emblem__ping" style={{ animationDelay: "1.2s" }} />
      <svg className="sp-emblem__ring" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 5" strokeLinecap="round" />
      </svg>
      <img src="/spy-icon.png" alt="" width={96} height={96} decoding="async" draggable={false} />
    </div>
  );
}
