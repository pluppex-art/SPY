import { useRef } from "react";
import { SiteHeader } from "./components/SiteHeader";
import { HeroSection } from "./components/HeroSection";
import { CapabilitiesSection } from "./components/CapabilitiesSection";
import { NeuralSection } from "./components/NeuralSection";
import { NichesSection } from "./components/NichesSection";
import { ProcessSection } from "./components/ProcessSection";
import { TrustRow } from "./components/TrustRow";
import { PlansSection } from "./components/PlansSection";
import { FaqSection } from "./components/FaqSection";
import { FinalCta } from "./components/FinalCta";
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
        <CapabilitiesSection />
        <NeuralSection />
        <NichesSection />
        <PlansSection />
        <ProcessSection />
        <FaqSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
