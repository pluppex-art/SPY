import { PipelineDemo } from "./PipelineDemo";
import { ProductShot, shotUrl } from "./ProductShot";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { SpyEmblem } from "./SpyEmblem";

const EASE = [0.23, 1, 0.32, 1] as const;

export function HeroSection() {
  const reduce = useReducedMotion();

  const item = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, ease: EASE, delay: i * 0.06 },
        };

  return (
    <section className="sp-hero" aria-labelledby="sp-hero-title">
      <div className="sp-hero__radar" aria-hidden="true" />
      <div className="sp-wrap sp-hero__grid">
        <div>
          <motion.h1 id="sp-hero-title" {...item(0)}>
            <span className="sp-nowrap">Nenhum lead esquecido.</span> <span className="sp-nowrap sp-grad">Toda venda, até o caixa.</span>
          </motion.h1>
          <motion.p className="sp-hero__sub" {...item(1)}>
            O S.P.Y. SOA é o Sistema Operacional Autônomo da sua empresa: ele organiza o seu pipeline, envia propostas, fecha contratos e controla o financeiro num só
            lugar. E a Aurora, nossa IA, acompanha cada lead e aponta o próximo passo, para nenhuma oportunidade esfriar.
          </motion.p>
          <motion.div className="sp-hero__actions" {...item(2)}>
            <Link to="/f/spy" className="sp-btn sp-btn--primary">
              Implantar o S.P.Y.
              <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </Link>
            <Link to="/login" className="sp-link">
              Já sou cliente: acessar
            </Link>
          </motion.div>
          <motion.p className="sp-hero__note" {...item(3)}>
            Cada empresa tem seu ambiente isolado, com os módulos do seu segmento.
          </motion.p>
        </div>

        <motion.figure
          style={{ margin: 0 }}
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, y: 20 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.6, ease: EASE, delay: 0.2 },
              })}
        >
          <div className="sp-hero__stage">
            <SpyEmblem />
            <ProductShot
              slot="pipeline"
              eager
              alt="Tela de Leads e Pipeline do S.P.Y. em kanban, com leads por etapa, score e valor"
              fallback={<PipelineDemo />}
            />
          </div>
          {!shotUrl("pipeline") && <figcaption className="sp-caption">Exemplo ilustrativo, com dados fictícios.</figcaption>}
        </motion.figure>
      </div>
    </section>
  );
}
