const FooterSection = () => {
  return (
    <footer className="py-16 px-6 bg-warm-dark border-t border-warm-cream/5">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-2">
            <h3 className="font-heading text-3xl text-warm-cream font-light mb-4">
              Unique <span className="italic text-gold">&</span> Meaningful
            </h3>
            <p className="text-warm-cream/40 font-body text-sm font-light leading-relaxed max-w-sm">
              Hand-poured candles crafted with intention. Every flame tells a story worth sharing.
            </p>
          </div>

          <div>
            <p className="text-warm-cream/60 font-body text-xs tracking-[0.2em] uppercase mb-4">
              Quick Links
            </p>
            <ul className="space-y-3">
              {["Collections", "Our Story", "Shipping", "Contact"].map((link) => (
                <li key={link}>
                  <a href="#" className="text-warm-cream/40 font-body text-sm hover:text-gold transition-colors duration-300">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-warm-cream/60 font-body text-xs tracking-[0.2em] uppercase mb-4">
              Stay Connected
            </p>
            <p className="text-warm-cream/40 font-body text-sm mb-4 font-light">
              Join our newsletter for exclusive scents and stories.
            </p>
            <div className="flex">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 px-4 py-3 bg-warm-cream/5 border border-warm-cream/10 text-warm-cream font-body text-sm placeholder:text-warm-cream/20 focus:outline-none focus:border-gold/50 rounded-l-sm"
              />
              <button className="px-6 py-3 bg-gold text-gold-foreground font-body text-xs tracking-[0.15em] uppercase hover:bg-gold/90 transition-colors rounded-r-sm">
                Join
              </button>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-warm-cream/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-warm-cream/20 font-body text-xs">
            © 2026 Unique & Meaningful. All rights reserved.
          </p>
          <div className="flex gap-6">
            {["Instagram", "Pinterest", "TikTok"].map((social) => (
              <a key={social} href="#" className="text-warm-cream/30 font-body text-xs hover:text-gold transition-colors duration-300">
                {social}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
