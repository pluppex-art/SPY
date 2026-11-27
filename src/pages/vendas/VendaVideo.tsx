/** Página de venda 3, com vídeo de vendas (VSL): fundo preto, tudo no centro, um botão. */
import { ArrowDown, Play } from "lucide-react";
import { rv } from "../landing/reveal";
import { videoDaPagina } from "./conta";
import { Chamada, PaginaDeVenda, Perguntas, PlanosDeVenda } from "./comum";

/** Cole aqui o link do vídeo (YouTube, Vimeo ou arquivo .mp4 em https). Vazio = mostra o quadro de espera. */
const VIDEO_DE_VENDAS = "";

const BOTAO = "Escolher meu plano";

const NO_VIDEO: [string, string][] = [
  ["Inteligência", "Como o Agente Secreto de Vendas capta o que acontece na conversa."],
  ["Recuperação", "Como enxergar o negócio que está esfriando e retomar."],
  ["Dados", "Onde fica cada cliente, proposta e compromisso."],
  ["Gestão", "O que o gestor pergunta à Aurora e acompanha nos indicadores."],
];

export default function VendaVideo() {
  const video = videoDaPagina(VIDEO_DE_VENDAS);
  return (
    <PaginaDeVenda tema="sv-video" cta={BOTAO} titulo="S.P.Y. — Assista antes de escolher o plano"
      descricao="Veja como o S.P.Y. enxerga as vendas que hoje passam despercebidas, em quatro pilares.">
      <section className="sp-section sv-palco" aria-labelledby="sv-h1">
        <div className="sp-wrap">
          <p className="sv-carimbo">Assista antes de escolher o plano</p>
          <h1 id="sv-h1" className="sv-h1">Veja as vendas que hoje passam <span className="sp-grad">despercebidas</span></h1>
          <div className="sv-tela">
            {video?.tipo === "quadro" && <iframe src={video.url} title="Apresentação do S.P.Y." allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}
            {video?.tipo === "arquivo" && <video src={video.url} controls playsInline preload="metadata" />}
            {!video && (
              <div className="sv-tela__espera">
                <img src="/spy-icon.png" alt="" width={96} height={96} />
                <span><Play size={18} aria-hidden="true" /> O vídeo de apresentação estreia em breve</span>
              </div>
            )}
          </div>
          <a href="#planos" className="sp-btn sp-btn--primary sv-grande">{BOTAO}<ArrowDown size={18} strokeWidth={1.75} aria-hidden="true" /></a>
        </div>
      </section>

      <section className="sp-section" aria-labelledby="sv-roteiro">
        <div className="sp-wrap">
          <h2 id="sv-roteiro" className="sp-h2" {...rv()}>Uma plataforma. Quatro pilares.</h2>
          <ol className="sv-pilares">
            {NO_VIDEO.map(([nome, texto], i) => (
              <li key={nome} {...rv(i)}><span>0{i + 1}</span><h3>{nome}</h3><p>{texto}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <PlanosDeVenda titulo="Escolha o tamanho do time." texto="O mesmo S.P.Y. nos três planos. Muda o número de pessoas." botao={(n) => `Escolher ${n}`} />
      <Perguntas />
      <Chamada titulo="Decidiu? O próximo passo leva poucos minutos." texto="Preencha os dados, escolha o plano e pague por Pix." botao={BOTAO} />
    </PaginaDeVenda>
  );
}
