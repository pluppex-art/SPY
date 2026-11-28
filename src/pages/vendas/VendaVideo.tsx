/** Página de venda com vídeo (VSL): fundo preto, tudo no centro, um botão. Uma versão consultiva e uma de varejo. */
import { ArrowDown, Play } from "lucide-react";
import { rv } from "../landing/reveal";
import { videoDaPagina } from "./conta";
import { Chamada, PaginaDeVenda, Perguntas, PlanosDeVenda } from "./comum";

const BOTAO = "Escolher meu plano";

type Publico = "consultiva" | "varejo";

const VERSOES: Record<Publico, {
  /** Link do vídeo (YouTube, Vimeo, .mp4 em https ou arquivo de public/videos). Vazio = mostra o quadro de espera. */
  video: string;
  titulo: string; descricao: string; antes: string; destaque: string; pilares: [string, string][];
}> = {
  consultiva: {
    video: "/videos/vsl-consultiva-v3.mp4",
    titulo: "S.P.Y. — Assista antes de escolher o plano",
    descricao: "Veja como o S.P.Y. acompanha a venda consultiva em quatro pilares: captura, análise, repescagem e relatórios.",
    antes: "Veja as vendas que hoje passam ", destaque: "despercebidas",
    pilares: [
      ["Captura", "O Agente Secreto de Vendas leva a conversa do WhatsApp conectado para o funil."],
      ["Análise", "Necessidade, quem decide, orçamento e objeção organizados, com o próximo passo."],
      ["Repescagem", "Enxergue o que está esfriando e seja avisado quando um cliente espera resposta."],
      ["Relatórios", "Pergunte à Aurora e acompanhe os relatórios e a ruptura na tela."],
    ],
  },
  varejo: {
    video: "/videos/vsl-varejo-v3.mp4",
    titulo: "S.P.Y. para o varejo — Venda sem perder conversa",
    descricao: "Para quem vende no balcão e no WhatsApp: captura, análise, repescagem e relatórios no S.P.Y.",
    antes: "Atenda no balcão sem perder a venda do ", destaque: "WhatsApp",
    pilares: [
      ["Captura", "O cliente chamou no WhatsApp conectado? O Agente Secreto de Vendas anota no funil."],
      ["Análise", "O que ele quer, para quando e qual a dúvida, com a tarefa de retorno."],
      ["Repescagem", "Aviso quando o cliente espera demais, e a lista de quem está sem comprar."],
      ["Relatórios", "Pergunte à Aurora e veja vendas, estoque e ruptura na tela."],
    ],
  },
};

export default function VendaVideo({ publico = "consultiva" }: { publico?: Publico }) {
  const v = VERSOES[publico];
  const video = videoDaPagina(v.video);
  return (
    <PaginaDeVenda tema="sv-video" cta={BOTAO} titulo={v.titulo} descricao={v.descricao}>
      <section className="sp-section sv-palco" aria-labelledby="sv-h1">
        <div className="sp-wrap">
          <p className="sv-carimbo">Assista antes de escolher o plano</p>
          <h1 id="sv-h1" className="sv-h1">{v.antes}<span className="sp-grad">{v.destaque}</span></h1>
          <div className="sv-tela">
            {video?.tipo === "quadro" && <iframe src={video.url} title="Apresentação do S.P.Y." allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}
            {video?.tipo === "arquivo" && (
              // os vídeos do site têm a imagem de capa ao lado, com o mesmo nome
              <video src={video.url} poster={video.url.startsWith("/videos/") ? video.url.replace(/\.\w+$/, ".jpg") : undefined} controls playsInline preload="metadata" />
            )}
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
            {v.pilares.map(([nome, texto], i) => (
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
