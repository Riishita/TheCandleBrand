import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Fallback images for categories without uploaded images
import candleRelaxation from "@/assets/candle-relaxation.jpg";
import candleRomance from "@/assets/candle-romance.jpg";
import candleEnergy from "@/assets/candle-energy.jpg";
import candleCelebration from "@/assets/candle-celebration.jpg";
import candleNature from "@/assets/candle-nature.jpg";
import candleSpiritual from "@/assets/candle-spiritual.jpg";

const fallbackImages = [candleRelaxation, candleRomance, candleEnergy, candleCelebration, candleNature, candleSpiritual];

const CategoryGrid = () => {
  const navigate = useNavigate();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*, products(count)")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <section id="categories" className="py-24 md:py-32 px-6 bg-warm-gradient">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-6"
        >
          <p className="text-muted-foreground font-body text-sm tracking-[0.3em] uppercase mb-4">
            Curated Collections
          </p>
          <h2 className="font-heading text-4xl md:text-6xl font-light text-foreground">
            Find Your <span className="italic text-gradient-gold">Flame</span>
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center text-muted-foreground font-body text-lg font-light mb-16 max-w-2xl mx-auto"
        >
          Extraordinary candles crafted with the finest natural waxes and essential oils.
        </motion.p>

        {categories.length === 0 ? (
          <p className="text-center text-muted-foreground font-body text-base py-12">
            Collections coming soon...
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category, index) => {
              const productCount = (category as any).products?.[0]?.count ?? 0;
              const image = category.image_url || fallbackImages[index % fallbackImages.length];

              return (
                <motion.div
                  key={category.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="group cursor-pointer"
                  onClick={() => navigate(`/category/${category.id}`)}
                >
                  <div className="relative overflow-hidden rounded-lg shadow-warm">
                    <div className="aspect-[3/4] overflow-hidden">
                      <img
                        src={image}
                        alt={category.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-warm-dark/80 via-warm-dark/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />

                    <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                      <p className="text-warm-cream/60 font-body text-xs tracking-[0.2em] uppercase mb-2">
                        {productCount} Candles
                      </p>
                      <h3 className="font-heading text-2xl md:text-3xl text-warm-cream font-light mb-2">
                        {category.name}
                      </h3>
                      <p className="text-warm-cream/50 font-body text-sm font-light leading-relaxed">
                        {category.description}
                      </p>

                      <div className="mt-4">
                        <span className="inline-flex items-center gap-2 text-gold text-sm tracking-[0.15em] uppercase font-body opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                          View Collection
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="group-hover:translate-x-1 transition-transform duration-300">
                            <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default CategoryGrid;
