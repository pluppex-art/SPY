/** Espiões decorativos que piscam pela tela toda (camada fixa, sem interação). */
const SPOTS = [
  { l: "4%", t: "18%", s: 64, d: "0s" },
  { l: "90%", t: "30%", s: 84, d: "1.3s" },
  { l: "8%", t: "62%", s: 90, d: "2.6s" },
  { l: "84%", t: "74%", s: 58, d: "0.7s" },
  { l: "47%", t: "88%", s: 52, d: "3.4s" },
  { l: "60%", t: "12%", s: 46, d: "2s" },
];

export function SpyWatchers() {
  return (
    <div className="sp-watchers" aria-hidden="true">
      {SPOTS.map((p, i) => (
        <img key={i} src="/spy-icon.png" alt="" width={p.s} height={p.s} draggable={false}
          style={{ left: p.l, top: p.t, width: p.s, height: p.s, animationDelay: p.d }} />
      ))}
    </div>
  );
}
