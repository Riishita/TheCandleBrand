import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/hooks/use-toast";

function availableUnits(product: { stock_quantity?: number; in_stock: boolean }) {
  if (typeof product.stock_quantity === "number") return Math.max(0, product.stock_quantity);
  return product.in_stock ? 999 : 0;
}

const CategoryPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addLine } = useCart();
  const { toast } = useToast();

  const { data: category } = useQuery({
    queryKey: ["category", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("category_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero banner */}
      <section className="relative h-[50vh] md:h-[60vh] overflow-hidden">
        {category?.image_url ? (
          <img
            src={category.image_url}
            alt={category?.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/10 to-gold/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-warm-dark/80 via-warm-dark/30 to-warm-dark/20" />

        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <motion.button
            onClick={() => navigate("/")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-24 left-6 md:left-12 text-warm-cream/60 hover:text-warm-cream font-body text-sm tracking-[0.15em] uppercase flex items-center gap-2 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13 8H3M3 8L7 4M3 8L7 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </motion.button>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-warm-cream/50 font-body text-xs tracking-[0.3em] uppercase mb-4"
          >
            {products.length} Candles
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="font-heading italic text-5xl md:text-7xl lg:text-8xl text-warm-cream font-light text-center"
          >
            {category?.name}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-warm-cream/40 font-body text-base mt-4 max-w-lg text-center"
          >
            {category?.description}
          </motion.p>
        </div>
      </section>

      {/* Products grid */}
      <section className="py-16 md:py-24 px-6">
        <div className="max-w-7xl mx-auto">
          {products.length === 0 ? (
            <p className="text-center text-muted-foreground font-body text-lg py-20">
              No candles in this collection yet. Check back soon!
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">
              {products.map((product, i) => {
                const units = availableUnits(product);
                const canBuy = units > 0;
                return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                  className="group cursor-pointer"
                >
                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden mb-4 shadow-warm bg-card">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-gold/20 via-accent/10 to-primary/20">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className="w-10 h-14 mx-auto mb-2 relative">
                              <div className="absolute bottom-0 w-full h-12 bg-foreground/10 rounded-t-sm rounded-b-lg" />
                              <motion.div
                                animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
                                transition={{ repeat: Infinity, duration: 2 + i * 0.2, ease: "easeInOut" }}
                                className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-3.5 bg-gold rounded-full blur-[1px]"
                              />
                            </div>
                            <p className="font-heading text-xs text-muted-foreground italic">{product.size}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-warm-dark/0 group-hover:bg-warm-dark/30 transition-colors duration-500" />

                    {/* Add to cart */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                      <button
                        type="button"
                        disabled={!canBuy}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canBuy) return;
                          addLine({
                            productId: product.id,
                            name: product.name,
                            price: Number(product.price),
                            image_url: product.image_url,
                            stock_quantity: units,
                          });
                          toast({ title: "Added to cart", description: product.name });
                        }}
                        className="w-full py-3 bg-gold text-gold-foreground font-body text-xs tracking-[0.15em] uppercase rounded-sm hover:bg-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add to Cart
                      </button>
                    </div>

                    {!canBuy && (
                      <div className="absolute top-3 left-3 bg-destructive text-destructive-foreground font-body text-xs px-3 py-1 rounded-sm tracking-wider uppercase">
                        Sold Out
                      </div>
                    )}
                  </div>

                  <h3 className="font-heading text-lg md:text-xl text-foreground font-medium leading-tight">
                    {product.name}
                  </h3>
                  <p className="text-muted-foreground font-body text-xs mt-1">
                    {product.scent}
                  </p>
                  <p className="text-foreground font-body text-sm font-medium mt-1.5">
                    ${Number(product.price).toFixed(2)}
                  </p>
                  {canBuy && typeof product.stock_quantity === "number" && product.stock_quantity <= 10 && (
                    <p className="text-gold/90 font-body text-[11px] mt-1 tracking-wide uppercase">
                      {units} left in stock
                    </p>
                  )}
                </motion.div>
              );
              })}
            </div>
          )}
        </div>
      </section>

      <FooterSection />
    </div>
  );
};

export default CategoryPage;
