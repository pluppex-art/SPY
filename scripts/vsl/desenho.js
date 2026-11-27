/**
 * Peças desenhadas dos vídeos: personagens, o espião, a Aurora, celular, janelas do sistema.
 * Só devolvem texto HTML/SVG (o Node também carrega este arquivo); o movimento fica em animar().
 */
(() => {
  const TINTA = "#1b1830";

  /** Personagem de meio corpo. humor: "bem" | "aperto" | "surpresa". */
  function pessoa({ pele = "#e0a47c", cabelo = "curto", cor = "#2b1d16", roupa = "#2f6fed", humor = "bem", avental, oculos, fone, barba, classe = "" } = {}) {
    const fios = {
      curto: `<path d="M122 150c-8-70 34-104 80-104 54 0 88 36 78 106-8-30-16-44-28-52-30 20-78 26-112 18-10 8-14 18-18 32z" fill="${cor}"/>`,
      longo: `<path d="M112 250c-16-120 4-206 90-206s110 84 90 208c-14 10-30 12-40 6 18-60 14-106-4-134-28 22-68 34-104 32-8 24-8 62 6 100-12 6-26 4-38-6z" fill="${cor}"/>`,
      coque: `<circle cx="200" cy="48" r="34" fill="${cor}"/><path d="M122 154c-8-68 32-100 80-100s88 32 78 102c-10-34-20-46-34-56-34 20-70 28-106 24-8 8-14 18-18 30z" fill="${cor}"/>`,
      raspado: `<path d="M126 140c2-58 36-86 74-86s72 28 74 86c-20-34-44-44-74-44s-54 10-74 44z" fill="${cor}"/>`,
    }[cabelo];
    const boca = humor === "aperto" ? "M178 214q22-16 44 0" : humor === "surpresa" ? "M190 205a11 13 0 1 0 22 0a11 13 0 1 0 -22 0" : "M174 202q26 28 52 0";
    const sobr = humor === "aperto" ? ["M152 142l34-12", "M248 142l-34-12"] : ["M154 138q16-10 32 0", "M214 138q16-10 32 0"];
    return `<svg class="pessoa ${classe}" viewBox="0 0 400 480" aria-hidden="true">
      <g class="respira">
        <path d="M60 480c0-120 56-194 140-194s140 74 140 194z" fill="${roupa}"/>
        <path d="M170 262h60v44c-16 18-44 18-60 0z" fill="${pele}"/>
        <path d="M168 292l32 34 32-34 14 8-28 48-18-22-18 22-28-48z" fill="#fff" opacity=".85"/>
        ${avental ? `<path d="M128 372h144l14 108H114z" fill="${avental}"/><path d="M140 372l26-66M260 372l-26-66" stroke="${avental}" stroke-width="12" fill="none"/>` : ""}
        <g class="cabeca">
          <ellipse cx="200" cy="164" rx="76" ry="102" fill="${pele}"/>
          <ellipse cx="124" cy="172" rx="13" ry="19" fill="${pele}"/><ellipse cx="276" cy="172" rx="13" ry="19" fill="${pele}"/>
          ${barba ? `<path d="M132 190c4 58 34 78 68 78s64-20 68-78c-14 28-30 14-68 14s-54 14-68-14z" fill="${cor}"/>` : ""}
          ${fios}
          <path d="${sobr[0]}" stroke="${cor}" stroke-width="7" stroke-linecap="round" fill="none"/>
          <path d="${sobr[1]}" stroke="${cor}" stroke-width="7" stroke-linecap="round" fill="none"/>
          <g class="olhos"><ellipse cx="170" cy="163" rx="8" ry="11" fill="${TINTA}"/><ellipse cx="230" cy="163" rx="8" ry="11" fill="${TINTA}"/></g>
          ${oculos ? `<g fill="none" stroke="${TINTA}" stroke-width="6"><circle cx="170" cy="164" r="26"/><circle cx="230" cy="164" r="26"/><path d="M196 162h8"/></g>` : ""}
          <path d="M200 170q-8 22 6 24" stroke="#00000030" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path class="boca" d="${boca}" stroke="${barba ? "#fff" : "#7a3b34"}" stroke-width="7" fill="${humor === "surpresa" ? "#7a3b34" : "none"}" stroke-linecap="round"/>
          ${fone ? `<path d="M120 170c-6-150 166-150 160 0" stroke="#111" stroke-width="12" fill="none"/><rect x="106" y="152" width="26" height="52" rx="12" fill="#111"/><rect x="268" y="152" width="26" height="52" rx="12" fill="#111"/>` : ""}
          ${humor === "aperto" ? `<path class="suor" d="M286 108q18 28 0 36q-18-8 0-36" fill="#7dd3fc"/>` : ""}
        </g>
        <g class="braco braco--e"><path d="M96 384q-18 66 62 82" stroke="${roupa}" stroke-width="46" fill="none" stroke-linecap="round"/><circle cx="168" cy="466" r="24" fill="${pele}"/></g>
        <g class="braco braco--d"><path d="M304 384q18 66 -62 82" stroke="${roupa}" stroke-width="46" fill="none" stroke-linecap="round"/><circle cx="232" cy="466" r="24" fill="${pele}"/></g>
      </g>
    </svg>`;
  }

  /** O Agente Secreto: o espião do logo (chapéu, olhos e mira) em versão animável. */
  let quantos = 0;
  function espiao({ mira = true, corpo = false, classe = "" } = {}) {
    // id próprio: um degradê definido numa cena escondida não pinta as outras
    const lar = `lar${++quantos}`;
    return `<svg class="espiao ${classe}" viewBox="0 0 400 ${corpo ? 520 : 400}" aria-hidden="true">
      <defs><linearGradient id="${lar}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffab4a"/><stop offset="1" stop-color="#f26a14"/></linearGradient></defs>
      ${mira ? `<g class="mira" stroke="url(#${lar})" stroke-width="14" fill="none" stroke-linecap="round"><circle cx="200" cy="200" r="164"/><path d="M200 8v60M200 332v60M8 200h60M332 200h60"/></g>` : ""}
      <g class="flutua">
        ${corpo ? `<path d="M96 520c0-110 38-196 104-196s104 86 104 196z" fill="#2a2342"/><path d="M158 330l42 72 42-72 28 20-48 110-22-40-22 40-48-110z" fill="#f26a14"/>` : ""}
        <ellipse cx="200" cy="250" rx="92" ry="74" fill="#0d0b16"/>
        <g class="olhar">
          <path class="olho-e" d="M132 248q38-8 62 28q-44 18-62-28z" fill="#fff"/>
          <path class="olho-d" d="M268 248q-38-8-62 28q44 18 62-28z" fill="#fff"/>
        </g>
        <path d="M130 186c4-82 28-100 46-98 10 0 16 8 24 8s14-8 24-8c18-2 42 16 46 98-44 16-96 16-140 0z" fill="url(#${lar})"/>
        <path d="M130 166c42 16 98 16 140 0l2 22c-44 18-100 18-144 0z" fill="#14101f"/>
        <path d="M80 188c20-12 40-6 50-2 42 18 98 18 140 0 10-4 30-10 50 2 6 26-48 44-120 44S74 214 80 188z" fill="url(#${lar})"/>
      </g>
    </svg>`;
  }

  const aurora = (classe = "") => `<div class="aurora ${classe}"><i></i><i></i><img src="../../public/avatar-ia.webp" alt=""></div>`;

  /** Bolha de conversa. lado "c" = cliente (esquerda), "v" = vendedor. */
  const bolha = (lado, texto, em, hora = "") => `<p class="bolha bolha--${lado}" data-em="${em}" data-fx="pop">${texto}${hora ? `<small>${hora}</small>` : ""}</p>`;

  const celular = ({ nome, foto = "👤", corpo, classe = "", extra = "" }) => `<div class="celular ${classe}">
      <div class="celular__tela">
        <header><b>${foto}</b><span>${nome}<small>online</small></span></header>
        <div class="celular__chat">${corpo}</div>
        <footer><span>Mensagem</span><i>➤</i></footer>
      </div>${extra}
    </div>`;

  const janela = (titulo, corpo, classe = "") => `<div class="janela ${classe}">
      <header><i></i><i></i><i></i><span><img src="../../public/spy-icon.png" alt="">${titulo}</span></header>
      <div class="janela__corpo">${corpo}</div>
    </div>`;

  /** Texto que se digita sozinho a partir da marca. */
  const digita = (texto, em, porSegundo = 34) => `<span data-digita="${em}" data-vel="${porSegundo}" data-texto="${texto.replace(/"/g, "&quot;")}"></span>`;

  const pilar = (n, nome) => `<div class="pilar" data-em="0.1" data-fx="carimbo"><b>Pilar ${n}</b><span>${nome}</span></div>`;

  const logo = (classe = "") => `<div class="logo ${classe}">${espiao({ classe: "logo__espiao" })}<div><strong>SPY</strong><em>SOA</em></div></div>`;

  function animar(el, t, em) {
    el.querySelectorAll(".olhos").forEach((g, i) => {
      const p = (t + i * 1.3) % 3.4;
      g.style.transformOrigin = "200px 163px";
      g.style.transform = `scaleY(${p < 0.14 ? 0.12 : 1})`;
    });
    el.querySelectorAll(".pessoa .respira").forEach((g, i) => { g.style.transform = `translateY(${Math.sin(t * 2.1 + i) * 3.5}px)`; });
    el.querySelectorAll(".pessoa .cabeca").forEach((g, i) => { g.style.transformOrigin = "200px 266px"; g.style.transform = `rotate(${Math.sin(t * 1.3 + i * 2) * 2.2}deg)`; });
    el.querySelectorAll(".pessoa--digitando .braco").forEach((g, i) => { g.style.transform = `translateY(${Math.max(0, Math.sin(t * 17 + i * Math.PI)) * -11}px)`; });
    el.querySelectorAll(".suor").forEach((g) => { const p = (t % 1.4) / 1.4; g.style.transform = `translateY(${p * 40}px)`; g.style.opacity = String(1 - p); });
    el.querySelectorAll(".espiao .flutua").forEach((g, i) => { g.style.transform = `translateY(${Math.sin(t * 2.4 + i) * 7}px)`; });
    el.querySelectorAll(".espiao .olhar").forEach((g) => {
      const x = Math.sin(t * 1.7) > 0.35 ? 9 : Math.sin(t * 1.7) < -0.35 ? -9 : 0;
      const pisca = t % 4.1 < 0.13 ? 0.1 : 1;
      g.style.transformOrigin = "200px 262px";
      g.style.transform = `translateX(${x}px) scaleY(${pisca})`;
    });
    el.querySelectorAll(".espiao .mira").forEach((g) => { g.style.transformOrigin = "200px 200px"; g.style.transform = `rotate(${Math.sin(t * 0.9) * 14}deg)`; });
    el.querySelectorAll(".aurora i").forEach((g, i) => { const p = (t * 0.55 + i * 0.5) % 1; g.style.transform = `scale(${1 + p * 0.55})`; g.style.opacity = String(0.8 * (1 - p)); });
    el.querySelectorAll("[data-digita]").forEach((n) => {
      const ini = em(Number.isNaN(Number(n.dataset.digita)) ? n.dataset.digita : Number(n.dataset.digita));
      const qtd = Math.max(0, Math.floor((t - ini) * Number(n.dataset.vel)));
      n.textContent = n.dataset.texto.slice(0, qtd);
      n.classList.toggle("digitando", qtd > 0 && qtd < n.dataset.texto.length);
    });
    el.querySelectorAll("[data-conta]").forEach((n) => {
      const p = Math.min(1, Math.max(0, (t - em(n.dataset.de)) / 1.2));
      n.textContent = (n.dataset.antes || "") + Math.round(Number(n.dataset.conta) * (1 - Math.pow(1 - p, 3))).toLocaleString("pt-BR") + (n.dataset.depois || "");
    });
    el.querySelectorAll("[data-barra]").forEach((n) => {
      const p = Math.min(1, Math.max(0, (t - em(n.dataset.de)) / 1));
      n.style.width = `${Number(n.dataset.barra) * (1 - Math.pow(1 - p, 3))}%`;
    });
    // conversa longa: rola para a mensagem mais nova
    el.querySelectorAll(".celular__chat").forEach((chat) => {
      let altura = 0;
      for (const b of chat.children) if (b.style.visibility !== "hidden") altura = Math.max(altura, b.offsetTop - chat.offsetTop + b.offsetHeight);
      const sobra = Math.max(0, altura + 20 - chat.clientHeight);
      for (const b of chat.children) b.style.top = `${-sobra}px`;
    });
  }

  /** Informação que sai de um ponto e chega a outro (centros em pixels). */
  const voo = (texto, de, x1, y1, x2, y2) => `<span class="dado" data-voo="${x1},${y1},${x2},${y2}" data-de="${de}" style="visibility:hidden">${texto}</span>`;

  const exemplo = `<span class="exemplo">Cena ilustrativa · dados fictícios</span>`;

  const indicadores = (lista) => `<div class="indicadores">${lista.map(([rotulo, valor, de, cor = ""]) => `<div class="indicador"><em>${rotulo}</em><strong class="${cor}" data-conta="${valor}" data-de="${de}">0</strong></div>`).join("")}</div>`;

  const barras = (lista, de) => lista.map(([rotulo, pct, valor]) => `<div class="linha-barra"><span>${rotulo}</span><div><i data-barra="${pct}" data-de="${de}"></i></div><strong>${valor}</strong></div>`).join("");

  // ---------- cenas iguais nos dois vídeos ----------
  const cenaMarca = (fala) => ({
    id: "marca",
    falas: [fala],
    sons: [["vuush", 0], ["carimbo", 0.55]],
    cauda: 0.5,
    html: `<div class="centro">
      <div data-em="0.15" data-fx="pop">${logo()}</div>
      <p class="sub" data-em="f0+0.9">Inteligência e gestão empresarial</p>
      <div class="quatro">${["Captura", "Análise", "Repescagem", "Relatórios"].map((n, i) => `<div data-em="${(1.5 + i * 0.28).toFixed(2)}"><b>0${i + 1}</b><span>${n}</span></div>`).join("")}</div>
    </div>`,
  });

  const cenaFinal = (falas, titulo) => ({
    id: "final",
    falas,
    sons: [["vuush", 0], ["ding", "f1"]],
    cauda: 2.4,
    html: `<div class="centro">
      <div data-em="0.1" data-fx="pop">${logo()}</div>
      <h2 data-em="f0">${titulo}</h2>
      <div class="quatro">${["Captura", "Análise", "Repescagem", "Relatórios"].map((n, i) => `<div data-em="f0+${(0.3 + i * 0.25).toFixed(2)}"><b>0${i + 1}</b><span>${n}</span></div>`).join("")}</div>
      <div data-em="f1" data-fx="pop"><span class="botao-final">Escolha o seu plano ↓</span></div>
    </div>`,
  });

  function voar(el, t, em) {
    el.querySelectorAll("[data-voo]").forEach((n) => {
      const [x1, y1, x2, y2] = n.dataset.voo.split(",").map(Number);
      const p = (t - em(n.dataset.de)) / 1.25;
      if (p <= 0 || p >= 1) { n.style.visibility = "hidden"; return; }
      const s = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      n.style.visibility = "visible";
      n.style.left = `${x1 + (x2 - x1) * s}px`;
      n.style.top = `${y1 + (y2 - y1) * s - Math.sin(Math.PI * s) * 70}px`;
      n.style.transform = `translate(-50%, -50%) scale(${1 - 0.25 * s})`;
      n.style.opacity = String(Math.min(1, p * 5, (1 - p) * 5));
    });
  }

  window.Desenho = {
    pessoa, espiao, aurora, bolha, celular, janela, digita, pilar, logo, voo, exemplo, indicadores, barras, cenaMarca, cenaFinal,
    animar: (el, t, em) => { animar(el, t, em); voar(el, t, em); },
  };
})();
