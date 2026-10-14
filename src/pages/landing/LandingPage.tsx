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
import { useRevealOnScroll } from "./useRevealOnScroll";
import "./landing.css";

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  useRevealOnScroll(rootRef);
  return (
    <div className="sp-root" ref={rootRef}>
      <a href="#conteudo" className="sp-skip">
        Ir para o conteúdo
      </a>
      <SiteHeader />
      <main id="conteudo">
        <HeroSection />
        <TrustRow />
        <LifecycleSection />
        <ModuleExplorer />
        <NeuralSection />
        <FinanceSection />
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
