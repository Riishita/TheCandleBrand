import { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import candleRelaxation from "@/assets/candle-relaxation.jpg";
import candleRomance from "@/assets/candle-romance.jpg";
import candleEnergy from "@/assets/candle-energy.jpg";
import candleNature from "@/assets/candle-nature.jpg";
import candleSpiritual from "@/assets/candle-spiritual.jpg";
import candleCelebration from "@/assets/candle-celebration.jpg";

const fallbackImages = [candleRomance, candleRelaxation, candleSpiritual, candleEnergy, candleCelebration, candleNature];

type ProductRow = {
  category_id: string;
  scent: string | null;
  image_url: string | null;
};

const FragranceSection = () => {
  const navigate = useNavigate();

  const { data: categoriesById = {} } = useQuery({
    queryKey: ["fragrance-categories-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,name");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        map[row.id] = row.name;
      }
      return map;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["fragrance-products"],
    queryFn: async () => {
      const withStock = await supabase
        .from("products")
        .select("category_id,scent,image_url")
        .order("name");
      let data = withStock.data;
      let error = withStock.error;
      // Compatibility for projects where stock_quantity column is not applied yet.
      if (error?.message?.toLowerCase().includes("stock_quantity")) {
        const legacy = await supabase
          .from("products")
          .select("category_id,scent,image_url")
          .order("name");
        data = legacy.data;
        error = legacy.error;
      }
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const scentGroups = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; label: string; items: ProductRow[]; image: string | null; categories: Set<string> }
    >();
    for (const p of products) {
      const scent = p.scent?.trim() || "Unspecified Fragrance";
      const key = scent.toLowerCase();
      const current = groups.get(key);
      if (!current) {
        groups.set(key, {
          key,
          label: scent,
          items: [p],
          image: p.image_url ?? null,
          categories: new Set([categoriesById[p.category_id] || "Uncategorized"]),
        });
      } else {
        current.items.push(p);
        current.categories.add(categoriesById[p.category_id] || "Uncategorized");
        if (!current.image && p.image_url) current.image = p.image_url;
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [products, categoriesById]);

  return (
    <section id="fragrance" className="py-24 md:py-32 px-6 bg-background">
      <div className="max-w-7xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="font-heading text-4xl md:text-5xl text-center text-foreground font-light mb-4"
        >
          Shop by <span className="italic text-gradient-gold">Fragrance</span>
        </motion.h2>
        <p className="text-center text-muted-foreground font-body text-sm md:text-base mb-12">
          Choose a fragrance to open its page and browse candles across categories.
        </p>

        {scentGroups.length === 0 ? (
          <p className="text-center text-muted-foreground font-body py-12">
            Add candle scent names in Admin to enable fragrance-wise shopping.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {scentGroups.map((group, i) => (
              <motion.button
                key={group.key}
                type="button"
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                whileHover={{ y: -6 }}
                onClick={() => navigate(`/fragrance/${encodeURIComponent(group.label)}`)}
                className="group cursor-pointer relative rounded-lg overflow-hidden aspect-[4/3] text-left"
              >
                <img
                  src={group.image || fallbackImages[i % fallbackImages.length]}
                  alt={group.label}
                  loading="lazy"
                  width={600}
                  height={450}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-warm-dark/45 group-hover:bg-warm-dark/65 transition-colors duration-500" />
                <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
                  <h3 className="font-heading text-lg md:text-2xl text-warm-cream font-light text-center mb-1">{group.label}</h3>
                  <p className="text-warm-cream/75 font-body text-[11px] md:text-xs text-center">
                    {group.items.length} candle{group.items.length > 1 ? "s" : ""} · {group.categories.size}{" "}
                    {group.categories.size > 1 ? "categories" : "category"}
                  </p>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default FragranceSection;
