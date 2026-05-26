import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import CategoryGrid from "@/components/CategoryGrid";
import FragranceSection from "@/components/FragranceSection";
import StorySection from "@/components/StorySection";
import TestimonialSection from "@/components/TestimonialSection";
import CTASection from "@/components/CTASection";
import FooterSection from "@/components/FooterSection";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <CategoryGrid />
      <FragranceSection />
      <StorySection />
      <TestimonialSection />
      <CTASection />
      <FooterSection />
    </div>
  );
};

export default Index;
