import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { totalItems } = useCart();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "bg-warm-dark/95 backdrop-blur-md py-4" : "bg-transparent py-6"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Link to="/" className="font-heading text-xl md:text-2xl text-warm-cream font-light">
          U<span className="italic text-gold">&</span>M
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {["Collections", "Story", "Contact"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-warm-cream/60 font-body text-xs tracking-[0.2em] uppercase hover:text-gold transition-colors duration-300"
            >
              {item}
            </a>
          ))}
          <a
            href="#categories"
            className="px-6 py-2.5 bg-gold/10 border border-gold/30 text-gold font-body text-xs tracking-[0.15em] uppercase hover:bg-gold hover:text-gold-foreground transition-all duration-300 rounded-sm"
          >
            Shop Now
          </a>
          <Link
            to="/track-order"
            className="text-warm-cream/70 font-body text-xs tracking-[0.15em] uppercase hover:text-gold transition-colors"
          >
            Track Order
          </Link>
          <Link
            to="/checkout"
            className="relative text-warm-cream/70 hover:text-gold transition-colors p-2"
            aria-label={`Shopping cart, ${totalItems} items`}
          >
            <ShoppingBag className="w-5 h-5" strokeWidth={1.5} />
            {totalItems > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] flex items-center justify-center rounded-full bg-gold text-[10px] font-body text-gold-foreground font-medium px-1">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </Link>
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden text-warm-cream"
          aria-label="Toggle menu"
        >
          <div className="flex flex-col gap-1.5">
            <span className={`w-6 h-px bg-warm-cream transition-all duration-300 ${menuOpen ? "rotate-45 translate-y-[3.5px]" : ""}`} />
            <span className={`w-6 h-px bg-warm-cream transition-all duration-300 ${menuOpen ? "-rotate-45 -translate-y-[3.5px]" : ""}`} />
          </div>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-warm-dark/98 backdrop-blur-md px-6 py-8 flex flex-col gap-6"
        >
          {["Collections", "Story", "Contact"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              onClick={() => setMenuOpen(false)}
              className="text-warm-cream/60 font-body text-sm tracking-[0.2em] uppercase hover:text-gold transition-colors"
            >
              {item}
            </a>
          ))}
          <a
            href="#categories"
            onClick={() => setMenuOpen(false)}
            className="inline-block px-6 py-3 bg-gold text-gold-foreground font-body text-xs tracking-[0.15em] uppercase text-center rounded-sm"
          >
            Shop Now
          </a>
          <Link
            to="/checkout"
            onClick={() => setMenuOpen(false)}
            className="inline-flex items-center gap-2 text-warm-cream/60 font-body text-sm tracking-[0.2em] uppercase hover:text-gold transition-colors"
          >
            <ShoppingBag className="w-4 h-4" strokeWidth={1.5} />
            Cart {totalItems > 0 ? `(${totalItems})` : ""}
          </Link>
          <Link
            to="/track-order"
            onClick={() => setMenuOpen(false)}
            className="inline-flex items-center gap-2 text-warm-cream/60 font-body text-sm tracking-[0.2em] uppercase hover:text-gold transition-colors"
          >
            Track Order
          </Link>
        </motion.div>
      )}
    </motion.nav>
  );
};

export default Navbar;
