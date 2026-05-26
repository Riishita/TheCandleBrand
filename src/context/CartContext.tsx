import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartLine = {
  productId: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  /** Max units available when this line was last updated (from product stock). */
  stock_quantity: number;
};

const STORAGE_KEY = "candle-charm-cart";

type CartContextValue = {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, "quantity"> & { quantity?: number }) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeLine: (productId: string) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
};

const CartContext = createContext<CartContextValue | null>(null);

function lineCap(l: Pick<CartLine, "stock_quantity">) {
  return Number.isFinite(l.stock_quantity) && l.stock_quantity >= 0 ? l.stock_quantity : 999_999;
}

function readStored(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<CartLine>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((l) => ({
      productId: String(l.productId),
      name: String(l.name ?? ""),
      price: Number(l.price) || 0,
      image_url: l.image_url ?? null,
      quantity: Math.max(1, Number(l.quantity) || 1),
      stock_quantity: typeof l.stock_quantity === "number" ? l.stock_quantity : 999_999,
    }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => readStored());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines]);

  const addLine = useCallback((line: Omit<CartLine, "quantity"> & { quantity?: number }) => {
    const addQty = line.quantity ?? 1;
    const max = lineCap(line as CartLine);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === line.productId);
      if (idx === -1) {
        const q = Math.min(addQty, max);
        return [...prev, { ...line, quantity: Math.max(1, q), stock_quantity: line.stock_quantity }];
      }
      const next = [...prev];
      const mergedMax = Math.min(lineCap(line as CartLine), lineCap(next[idx]));
      next[idx] = {
        ...next[idx],
        stock_quantity: mergedMax,
        quantity: Math.min(next[idx].quantity + addQty, mergedMax),
      };
      return next;
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setLines((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const max = lineCap(l);
        return { ...l, quantity: Math.min(quantity, max) };
      }),
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clearCart = useCallback(() => setLines([]), []);

  const totalItems = useMemo(() => lines.reduce((n, l) => n + l.quantity, 0), [lines]);
  const subtotal = useMemo(() => lines.reduce((n, l) => n + l.quantity * l.price, 0), [lines]);

  const value = useMemo(
    () => ({
      lines,
      addLine,
      setQuantity,
      removeLine,
      clearCart,
      totalItems,
      subtotal,
    }),
    [lines, addLine, setQuantity, removeLine, clearCart, totalItems, subtotal],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
