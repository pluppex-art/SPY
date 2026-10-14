import { SiteHeader } from "./components/SiteHeader";
import { HeroSection } from "./components/HeroSection";
import { CapabilitiesSection } from "./components/CapabilitiesSection";
import { NeuralSection } from "./components/NeuralSection";
import { NichesSection } from "./components/NichesSection";
import { ProcessSection } from "./components/ProcessSection";
import { FinalCta } from "./components/FinalCta";
import { SiteFooter } from "./components/SiteFooter";
import "./landing.css";

export default function LandingPage() {
  return (
    <div className="sp-root">
      <a href="#conteudo" className="sp-skip">
        Ir para o conteúdo
      </a>
      <SiteHeader />
      <main id="conteudo">
        <HeroSection />
        <CapabilitiesSection />
        <NeuralSection />
        <NichesSection />
        <ProcessSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
