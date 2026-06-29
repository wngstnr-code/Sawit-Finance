import SmoothScroll from '@/components/motion/SmoothScroll';
import SiteNav from '@/components/site/SiteNav';
import HeroMorph from '@/components/site/HeroMorph';
import StandardSection from '@/components/site/StandardSection';
import HowItWorks from '@/components/site/HowItWorks';
import RwaSection from '@/components/site/RwaSection';
import BeliefSection from '@/components/site/BeliefSection';
import TechSection from '@/components/site/TechSection';
import OnChainProof from '@/components/site/OnChainProof';
import BridgeSection from '@/components/site/BridgeSection';
import AccessSection from '@/components/site/AccessSection';
import SiteFooter from '@/components/site/SiteFooter';

export default function Home() {
  return (
    <SmoothScroll>
      <SiteNav />
      <main>
        <HeroMorph />
        <StandardSection />
        <HowItWorks />
        <RwaSection />
        <BeliefSection />
        <TechSection />
        <OnChainProof />
        <BridgeSection />
        <AccessSection />
      </main>
      <SiteFooter />
    </SmoothScroll>
  );
}
