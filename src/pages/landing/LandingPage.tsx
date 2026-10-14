import { useRef } from "react";
import { SiteHeader } from "./components/SiteHeader";
import { HeroSection } from "./components/HeroSection";
import { LifecycleSection } from "./components/LifecycleSection";
import { ModuleExplorer } from "./components/ModuleExplorer";
import { FinanceSection } from "./components/FinanceSection";
import { SegmentsSection } from "./components/SegmentsSection";
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
import "./landing.css";

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  useRevealOnScroll(rootRef);
  useDocumentMeta(
    "S.P.Y. — CRM e ERP com IA para pequenas e médias empresas",
    "Do lead ao financeiro em um só sistema: pipeline de vendas, propostas e contratos, financeiro completo, módulos por segmento e a Aurora, assistente de IA.",
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
      <SiteHeader />
      <main id="conteudo">
        <HeroSection />
        <TrustRow />
        <ProblemSection />
        <LifecycleSection />
        <ModuleExplorer />
        <NeuralSection />
        <FinanceSection />
        <RoiSimulator />
        <SegmentsSection />
        <TrustSecuritySection />
        <PlansSection />
        <ProcessSection />
        <FaqSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
