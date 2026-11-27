/**
 * Motor dos vídeos de venda: monta cada cena uma vez e, a cada quadro, aplica o estado do instante t.
 * Nada usa relógio nem animação de CSS, então o mesmo t gera sempre o mesmo quadro.
 *
 * Marcas de tempo: "f2" = começo da 3ª fala da cena; "f2+0.4" = 0,4 s depois; "f2$" = fim da fala; número = segundos.
 */
(() => {
  const trava = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const suave = (p) => 1 - Math.pow(1 - trava(p), 3);
  const mola = (p) => {
    const x = trava(p);
    return 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);
  };
  const entre = (t, ini, dur = 0.5) => trava((t - ini) / dur);

  function instante(marca, cena) {
    if (typeof marca === "number") return marca;
    const m = /^f(\d+)(\$)?([+-][\d.]+)?$/.exec(marca);
    if (!m) throw new Error(`marca de tempo inválida: ${marca}`);
    const fala = cena.falas[Number(m[1])];
    if (!fala) throw new Error(`fala inexistente em ${cena.id}: ${marca}`);
    return (m[2] ? fala.fim : fala.ini) + Number(m[3] || 0);
  }

  /** Efeitos de entrada: devolvem [transform, opacidade] para o avanço p (0 a 1). */
  const EFEITOS = {
    sobe: (p) => [`translateY(${(1 - suave(p)) * 46}px)`, suave(p)],
    desce: (p) => [`translateY(${(suave(p) - 1) * 46}px)`, suave(p)],
    esq: (p) => [`translateX(${(suave(p) - 1) * 90}px)`, suave(p)],
    dir: (p) => [`translateX(${(1 - suave(p)) * 90}px)`, suave(p)],
    pop: (p) => [`scale(${0.6 + 0.4 * mola(p)})`, trava(p * 2.5)],
    some: (p) => [`none`, suave(p)],
    carimbo: (p) => [`scale(${2.2 - 1.2 * suave(p)}) rotate(-4deg)`, trava(p * 2)],
  };

  let cenas = [];
  let montadas = [];

  window.montar = (roteiro, tempos) => {
    const palco = document.getElementById("cenas");
    palco.innerHTML = "";
    cenas = roteiro.cenas.map((c, i) => ({ ...c, ...tempos.cenas[i] }));
    montadas = cenas.map((cena) => {
      const el = document.createElement("section");
      el.className = `cena cena--${cena.id}`;
      el.innerHTML = cena.html;
      palco.appendChild(el);
      const partes = [...el.querySelectorAll("[data-em]")].map((n) => ({
        n,
        efeito: EFEITOS[n.dataset.fx || "sobe"],
        em: instante(Number.isNaN(Number(n.dataset.em)) ? n.dataset.em : Number(n.dataset.em), cena),
        ate: n.dataset.ate ? instante(Number.isNaN(Number(n.dataset.ate)) ? n.dataset.ate : Number(n.dataset.ate), cena) : null,
        base: n.style.transform || "",
      }));
      return { el, partes };
    });
  };

  window.desenhar = (t) => {
    let atual = cenas.findIndex((c) => t < c.ini + c.dur);
    if (atual < 0) atual = cenas.length - 1;
    const total = cenas.reduce((s, c) => s + c.dur, 0);
    cenas.forEach((cena, i) => {
      const { el, partes } = montadas[i];
      if (i !== atual) { el.style.display = "none"; return; }
      el.style.display = "block";
      const lt = t - cena.ini;
      const entra = suave(entre(lt, 0, 0.35));
      const sai = i === cenas.length - 1 ? 0 : entre(lt, cena.dur - 0.25, 0.25);
      el.style.opacity = String(entra * (1 - sai));
      el.style.transform = `scale(${1 + 0.018 * trava(lt / cena.dur)})`;
      for (const p of partes) {
        const a = entre(lt, p.em, 0.55);
        const [tr, op] = p.efeito(a);
        const fora = p.ate === null ? 0 : entre(lt, p.ate, 0.3);
        p.n.style.opacity = String(op * (1 - fora));
        p.n.style.transform = `${p.base} ${tr === "none" ? "" : tr}`;
        p.n.style.visibility = a <= 0 || fora >= 1 ? "hidden" : "visible";
      }
      const em = (marca) => instante(marca, cena);
      window.Desenho.animar(el, lt, em);
      if (cena.animar) cena.animar(el, lt, em, { trava, suave, mola, entre });
    });
    const cena = cenas[atual];
    const lt = t - cena.ini;
    const fala = cena.falas.find((f) => lt >= f.ini - 0.1 && lt < f.fim + 0.25);
    const legenda = document.getElementById("legenda");
    legenda.textContent = fala ? fala.legenda : "";
    legenda.style.display = fala && !cena.semLegenda ? "block" : "none";
    document.getElementById("progresso").style.width = `${(100 * t) / total}%`;
    // fundo em movimento lento
    document.getElementById("grade").style.backgroundPosition = `${(t * 12) % 80}px ${(t * 8) % 80}px`;
  };

  window.Motor = { trava, suave, mola, entre };
})();
