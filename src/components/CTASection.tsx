import { motion } from "framer-motion";

const CTASection = () => {
  return (
    <section className="py-24 md:py-32 px-6 bg-warm-dark relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold/5 rounded-full blur-[120px]" />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <p className="text-warm-cream/40 font-body text-sm tracking-[0.3em] uppercase mb-6">
            Limited Edition
          </p>
          <h2 className="font-heading text-4xl md:text-6xl font-light text-warm-cream mb-6">
            Light the way to something{" "}
            <span className="italic text-gradient-gold">beautiful</span>
          </h2>
          <p className="text-warm-cream/50 font-body text-lg font-light mb-10 max-w-lg mx-auto">
            Our seasonal collection is here. Hand-numbered, limited-run candles that won't last long.
          </p>
          <a
            href="#categories"
            className="inline-block px-12 py-4 bg-gold text-gold-foreground font-body text-sm tracking-[0.15em] uppercase hover:bg-gold/90 transition-all duration-300 rounded-sm shadow-glow"
          >
            Shop the Collection
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
