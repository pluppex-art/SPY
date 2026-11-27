/** Espiões decorativos que piscam pela tela toda (camada fixa, sem interação). Em pares espelhados nas bordas. */
const PARES = [
  { borda: "3%", t: "18%", s: 60, d: "0s" },
  { borda: "5%", t: "72%", s: 72, d: "2.6s" },
];
const SPOTS = PARES.flatMap((p) => [
  { ...p, x: { left: p.borda } },
  { ...p, x: { right: p.borda } },
]);

export function SpyWatchers() {
  return (
    <div className="sp-watchers" aria-hidden="true">
      {SPOTS.map((p, i) => (
        <img key={i} src="/spy-icon.png" alt="" width={p.s} height={p.s} draggable={false}
          style={{ ...p.x, top: p.t, width: p.s, height: p.s, animationDelay: p.d }} />
      ))}
    </div>
  );
}
