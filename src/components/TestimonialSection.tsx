import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

const testimonials = [
  {
    text: "The moment I lit the Relaxation candle, my entire apartment transformed. It's not just a candle — it's an experience.",
    author: "Sarah M.",
    location: "New York",
    rating: 5,
  },
  {
    text: "I bought the Romance collection for our anniversary. My partner was speechless. The scent lingers beautifully for hours.",
    author: "James K.",
    location: "London",
    rating: 5,
  },
  {
    text: "These candles have become part of my daily meditation ritual. The Spirituality collection is absolutely transcendent.",
    author: "Priya R.",
    location: "Mumbai",
    rating: 5,
  },
  {
    text: "Gorgeous packaging, divine scents, and they burn so evenly. I've tried dozens of brands and nothing compares.",
    author: "Elena V.",
    location: "Paris",
    rating: 5,
  },
];

const TestimonialSection = () => {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((p) => (p + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-24 md:py-32 px-6 bg-warm-gradient relative overflow-hidden">
      {/* Decorative elements */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
        className="absolute -top-40 -right-40 w-80 h-80 border border-border/20 rounded-full"
      />

      <div className="max-w-4xl mx-auto text-center relative z-10">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-muted-foreground font-body text-sm tracking-[0.3em] uppercase mb-16"
        >
          What Our Customers Say
        </motion.p>

        <div className="relative min-h-[250px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.6 }}
            >
              {/* Stars */}
              <div className="flex justify-center gap-1 mb-6">
                {Array.from({ length: testimonials[active].rating }).map((_, i) => (
                  <motion.svg
                    key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    width="16" height="16" viewBox="0 0 24 24" fill="hsl(var(--gold))" className="text-gold"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </motion.svg>
                ))}
              </div>

              <blockquote className="font-heading text-2xl md:text-4xl font-light text-foreground leading-relaxed italic mb-8">
                "{testimonials[active].text}"
              </blockquote>
              <p className="text-muted-foreground font-body text-sm tracking-[0.15em] uppercase">
                {testimonials[active].author} — {testimonials[active].location}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-3 mt-12">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`h-2 rounded-full transition-all duration-500 ${
                active === i ? "bg-gold w-10" : "bg-border w-2"
              }`}
              aria-label={`View testimonial ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialSection;
