import { useRef } from "react";
import { SiteHeader } from "./components/SiteHeader";
import { HeroSection } from "./components/HeroSection";
import { LifecycleSection } from "./components/LifecycleSection";
import { ModuleExplorer } from "./components/ModuleExplorer";
import { AgentsSection } from "./components/AgentsSection";
import { ComplementSection } from "./components/ComplementSection";
import { TrustSecuritySection } from "./components/TrustSecuritySection";
import { ContactSection } from "./components/ContactSection";
import { NeuralSection } from "./components/NeuralSection";
import { ProcessSection } from "./components/ProcessSection";
import { TrustRow } from "./components/TrustRow";
import { PlansSection } from "./components/PlansSection";
import { FaqSection } from "./components/FaqSection";
import { SiteFooter } from "./components/SiteFooter";
import { ProblemSection } from "./components/ProblemSection";
import { RoiSimulator } from "./components/RoiSimulator";
import { useDocumentMeta } from "./useDocumentMeta";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useRevealOnScroll } from "./useRevealOnScroll";
import { useLandingFx } from "./useLandingFx";
import { SpyWatchers } from "./components/SpyWatchers";
import { SocialProofPopup } from "../../components/SocialProofPopup";
import "./landing.css";
import "./landing-polish.css";

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  useRevealOnScroll(rootRef);
  useLandingFx(rootRef);
  useDocumentMeta(
    "S.P.Y. — Plataforma de Inteligência e Gestão Empresarial",
    "Uma plataforma, quatro pilares: inteligência, recuperação, dados e gestão. Capte oportunidades, retome negociações, centralize as informações e acompanhe os indicadores.",
  );
  const { hash } = useLocation();
  // âncoras vindas de outra página (ex.: /lp#planos redirecionado, /landing#contato)
  useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }), 120);
    return () => window.clearTimeout(t);
  }, [hash]);
  return (
    <div className="sp-root" ref={rootRef}>
      <a href="#conteudo" className="sp-skip">
        Ir para o conteúdo
      </a>
      <SpyWatchers />
      <SiteHeader />
      <main id="conteudo">
        <HeroSection />
        <TrustRow />
        <ProblemSection />
        <ModuleExplorer />
        <AgentsSection />
        <ComplementSection />
        <LifecycleSection />
        <NeuralSection />
        <RoiSimulator />
        <TrustSecuritySection />
        <PlansSection />
        <ProcessSection />
        <FaqSection />
        <ContactSection />
      </main>
      <SiteFooter />
      <SocialProofPopup />
    </div>
  );
}
