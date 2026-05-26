import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/hooks/use-toast";

type ProductRow = {
  id: string;
  name: string;
  category_id: string;
  scent: string | null;
  image_url: string | null;
  price: number;
  in_stock: boolean;
  stock_quantity?: number;
};

function normScent(value: string | null | undefined) {
  return (value?.trim() || "Unspecified Fragrance").toLowerCase();
}

function availableUnits(product: { stock_quantity?: number; in_stock: boolean }) {
  if (typeof product.stock_quantity === "number") return Math.max(0, product.stock_quantity);
  return product.in_stock ? 999 : 0;
}

const FragrancePage = () => {
  const navigate = useNavigate();
  const { scent = "" } = useParams<{ scent: string }>();
  const { addLine } = useCart();
  const { toast } = useToast();

  const scentLabel = decodeURIComponent(scent || "").trim() || "Unspecified Fragrance";
  const scentKey = normScent(scentLabel);

  const { data: categoriesById = {} } = useQuery({
    queryKey: ["fragrance-categories-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,name");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.id] = row.name;
      return map;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["fragrance-products"],
    queryFn: async () => {
      const withStock = await supabase
        .from("products")
        .select("id,name,category_id,scent,image_url,price,in_stock,stock_quantity")
        .order("sort_order");
      let data = withStock.data;
      let error = withStock.error;
      if (error?.message?.toLowerCase().includes("stock_quantity")) {
        const legacy = await supabase
          .from("products")
          .select("id,name,category_id,scent,image_url,price,in_stock")
          .order("sort_order");
        data = legacy.data;
        error = legacy.error;
      }
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const filtered = useMemo(
    () => products.filter((p) => normScent(p.scent) === scentKey),
    [products, scentKey],
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-28 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          <button
            type="button"
            onClick={() => navigate("/#fragrance")}
            className="text-muted-foreground hover:text-foreground font-body text-sm tracking-[0.15em] uppercase mb-6"
          >
            ← Back to Fragrance
          </button>
          <h1 className="font-heading italic text-4xl md:text-6xl text-foreground">
            {scentLabel}
          </h1>
          <p className="text-muted-foreground font-body text-sm mt-3">
            {filtered.length} candle{filtered.length === 1 ? "" : "s"} found across categories
          </p>
        </div>
      </section>

      <section className="pb-16 md:pb-24 px-6">
        <div className="max-w-7xl mx-auto">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground font-body text-lg py-20">
              No candles found for this fragrance yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">
              {filtered.map((product, i) => {
                const units = availableUnits(product);
                const canBuy = units > 0;
                return (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.04 }}
                    className="group"
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
                        <div className="absolute inset-0 bg-gradient-to-br from-gold/20 via-accent/10 to-primary/20" />
                      )}
                      <div className="absolute inset-0 bg-warm-dark/0 group-hover:bg-warm-dark/30 transition-colors duration-500" />
                      <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                        <button
                          type="button"
                          disabled={!canBuy}
                          onClick={() => {
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
                    <h3 className="font-heading text-lg md:text-xl text-foreground leading-tight">{product.name}</h3>
                    <p className="text-muted-foreground font-body text-xs mt-1">
                      {categoriesById[product.category_id] || "Uncategorized"}
                    </p>
                    <p className="text-foreground font-body text-sm font-medium mt-1.5">
                      ${Number(product.price).toFixed(2)}
                    </p>
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

export default FragrancePage;
