import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const StorySection = () => {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0]);

  return (
    <section ref={ref} id="story" className="py-24 md:py-32 px-6 bg-warm-dark overflow-hidden">
      <div className="max-w-5xl mx-auto text-center">
        <motion.div style={{ y, opacity }}>
          <motion.p
            initial={{ opacity: 0, letterSpacing: "0.1em" }}
            whileInView={{ opacity: 1, letterSpacing: "0.3em" }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="text-warm-cream/40 font-body text-sm tracking-[0.3em] uppercase mb-6"
          >
            The Happy Space
          </motion.p>
          <h2 className="font-heading text-4xl md:text-6xl lg:text-7xl font-light text-warm-cream leading-tight mb-8">
            Every candle is a{" "}
            <motion.span
              className="italic text-gradient-gold inline-block"
              whileInView={{ rotate: [0, -2, 0] }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, delay: 0.5 }}
            >
              conversation
            </motion.span>
            <br />
            between light and soul
          </h2>
          <p className="text-warm-cream/50 font-body text-lg md:text-xl max-w-2xl mx-auto font-light leading-relaxed">
            Unique & Meaningful was born from a singular passion to make extraordinary
            candles — that not only look gorgeous and smell ethereal but are a gentle
            call to slow down and discover the everyday magic in and around us.
          </p>
        </motion.div>

        {/* Stats with stagger animation */}
        <div className="grid grid-cols-3 gap-8 mt-20 pt-12 border-t border-warm-cream/10">
          {[
            { value: "100%", label: "Natural Ingredients" },
            { value: "50+", label: "Unique Scents" },
            { value: "10K+", label: "Happy Homes" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.15 }}
              whileHover={{ scale: 1.05 }}
            >
              <motion.p
                className="font-heading text-3xl md:text-5xl text-gold font-light mb-2"
                whileInView={{ opacity: [0, 1] }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.4 + i * 0.2 }}
              >
                {stat.value}
              </motion.p>
              <p className="text-warm-cream/40 font-body text-xs md:text-sm tracking-[0.15em] uppercase">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StorySection;
