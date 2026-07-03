import { AudienceCards } from "@/components/AudienceCards";
import { ContactSection } from "@/components/ContactSection";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { NetworkSection } from "@/components/NetworkSection";
import { PlacementsSection } from "@/components/PlacementsSection";
import { TrustSection } from "@/components/TrustSection";

export default function Home() {
  return (
    <main>
      <div className="page-bg" aria-hidden="true" />
      <Header />
      <Hero />
      <AudienceCards />
      <PlacementsSection />
      <NetworkSection />
      <HowItWorks />
      <TrustSection />
      <ContactSection />
      <Footer />
    </main>
  );
}
