import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Session } from "@supabase/supabase-js";
import { sendOrderEmail } from "@/lib/orderEmail";

const STORAGE_BUCKET = "product-images";

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
] as const;

/** DB or PostgREST does not expose products.stock_quantity yet (migration not applied / cache stale). */
function isMissingStockColumnError(err: { message?: string; code?: string } | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  const c = err.code ?? "";
  return (
    m.includes("stock_quantity") ||
    m.includes("schema cache") ||
    m.includes("could not find the") ||
    c === "PGRST204"
  );
}

function isStockRpcUnavailable(err: { message?: string } | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return (
    isMissingStockColumnError(err) ||
    (m.includes("decrement_product_stock") && (m.includes("does not exist") || m.includes("not found")))
  );
}

/** Matches DB NUMERIC(10,2): non-finite or negative → 0, rounded to cents. */
function normalizePrice(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

type Category = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
};

type Product = {
  id: string;
  category_id: string;
  name: string;
  scent: string | null;
  price: number;
  size: string | null;
  image_url: string | null;
  description: string | null;
  in_stock: boolean;
  /** Present only after `stock_quantity` column exists in Supabase. */
  stock_quantity?: number;
  sort_order: number;
};

type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  created_at: string;
};

type Order = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: string;
  billing_address_line_1?: string | null;
  billing_address_line_2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_postal_code?: string | null;
  billing_country?: string | null;
  payment_mode?: string;
  upi_transaction_ref?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  carrier?: string | null;
  status: string;
  notes: string | null;
  total: number;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
};

async function uploadImageToStorage(file: File, folder: string) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  if (!["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
    throw new Error("Please use JPG, PNG, GIF, or WebP.");
  }
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

const demoEmail = typeof import.meta.env.VITE_DEMO_ADMIN_EMAIL === "string" ? import.meta.env.VITE_DEMO_ADMIN_EMAIL : "";
const demoPassword =
  typeof import.meta.env.VITE_DEMO_ADMIN_PASSWORD === "string" ? import.meta.env.VITE_DEMO_ADMIN_PASSWORD : "";

const AdminPage = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState(demoPassword);
  const [activeTab, setActiveTab] = useState<"categories" | "products" | "orders">("categories");
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [categoryUploading, setCategoryUploading] = useState(false);
  const [productUploading, setProductUploading] = useState(false);
  const categoryFileRef = useRef<HTMLInputElement>(null);
  const productFileRef = useRef<HTMLInputElement>(null);

  const [ordersView, setOrdersView] = useState<Order | null>(null);
  const [editOrderStatus, setEditOrderStatus] = useState<string>("pending");
  const [editOrderNotes, setEditOrderNotes] = useState<string>("");
  const [editTrackingNumber, setEditTrackingNumber] = useState("");
  const [editTrackingUrl, setEditTrackingUrl] = useState("");
  const [editCarrier, setEditCarrier] = useState("");

  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [manualCustomer, setManualCustomer] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    shipping_address: "",
    notes: "",
  });
  const [manualLines, setManualLines] = useState<{ product_id: string; quantity: number }[]>([
    { product_id: "", quantity: 1 },
  ]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
    enabled: !!session,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("sort_order");
      if (error) throw error;
      return (data as Product[]).map((row) => {
        const stock =
          typeof (row as { stock_quantity?: number }).stock_quantity === "number"
            ? (row as { stock_quantity: number }).stock_quantity
            : undefined;
        return { ...row, stock_quantity: stock };
      });
    },
    enabled: !!session,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Order[]).map((row) => ({
        ...row,
        order_items: (row.order_items as OrderItem[] | undefined) ?? [],
      }));
    },
    enabled: !!session,
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async (cat: Partial<Category>) => {
      if (cat.id) {
        const { error } = await supabase
          .from("categories")
          .update({
            name: cat.name!,
            description: cat.description,
            image_url: cat.image_url,
            sort_order: cat.sort_order ?? 0,
          })
          .eq("id", cat.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert({
          name: cat.name!,
          description: cat.description,
          image_url: cat.image_url,
          sort_order: cat.sort_order ?? 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      setEditingCategory(null);
      toast({ title: "Category saved!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast({ title: "Category deleted" });
    },
  });

  const saveProductMutation = useMutation({
    mutationFn: async (p: Partial<Product>) => {
      const stockQty = Math.max(0, Math.floor(Number(p.stock_quantity ?? 0)));
      const inStock = stockQty > 0;
      const unitPrice = normalizePrice(p.price);
      const base = {
        name: (p.name ?? "").trim() || "Untitled candle",
        category_id: p.category_id!,
        scent: p.scent,
        price: unitPrice,
        size: p.size,
        image_url: p.image_url,
        description: p.description,
        sort_order: p.sort_order ?? 0,
      };
      const full = { ...base, stock_quantity: stockQty, in_stock: inStock };
      const legacy = { ...base, in_stock: inStock };
      let savedWithoutStockColumn = false;

      if (p.id) {
        let { error } = await supabase.from("products").update(full).eq("id", p.id);
        if (error && isMissingStockColumnError(error)) {
          savedWithoutStockColumn = true;
          ({ error } = await supabase.from("products").update(legacy).eq("id", p.id));
        }
        if (error) throw error;
      } else {
        let { error } = await supabase.from("products").insert(full);
        if (error && isMissingStockColumnError(error)) {
          savedWithoutStockColumn = true;
          ({ error } = await supabase.from("products").insert(legacy));
        }
        if (error) throw error;
      }
      return { savedWithoutStockColumn };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["fragrance-products"] });
      setEditingProduct(null);
      toast({ title: "Candle saved!" });
      if (data.savedWithoutStockColumn) {
        toast({
          title: "Inventory counts need SQL",
          description:
            "The database has no stock_quantity column (or the API cache is stale). Run supabase/migrations/20260329140000_product_stock_quantity.sql in the SQL Editor, then run: NOTIFY pgrst, 'reload schema'; — until then, only in-stock / sold-out is saved from your quantity field.",
        });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["fragrance-products"] });
      toast({ title: "Product deleted" });
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
      tracking_number,
      tracking_url,
      carrier,
    }: {
      id: string;
      status: string;
      notes: string | null;
      tracking_number: string | null;
      tracking_url: string | null;
      carrier: string | null;
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status, notes, tracking_number, tracking_url, carrier })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setOrdersView(null);
      toast({ title: "Order updated" });
      if (ordersView && (vars.status === "delivered" || vars.status === "cancelled")) {
        await sendOrderEmail(vars.status === "delivered" ? "order_delivered" : "order_cancelled", {
          orderId: ordersView.id,
          customerName: ordersView.customer_name,
          customerEmail: ordersView.customer_email,
          status: vars.status,
          total: Number(ordersView.total),
          items: ordersView.order_items,
          trackingUrl: vars.tracking_url,
        });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setOrdersView(null);
      toast({ title: "Order deleted" });
    },
  });

  const createManualOrderMutation = useMutation({
    mutationFn: async () => {
      const lines = manualLines.filter((l) => l.product_id && l.quantity > 0);
      if (!lines.length) throw new Error("Add at least one product line.");
      let total = 0;
      const items: {
        order_id: string;
        product_id: string;
        product_name: string;
        quantity: number;
        unit_price: number;
      }[] = [];

      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert({
          customer_name: manualCustomer.customer_name.trim(),
          customer_email: manualCustomer.customer_email.trim(),
          customer_phone: manualCustomer.customer_phone.trim() || null,
          shipping_address: manualCustomer.shipping_address.trim(),
          notes: manualCustomer.notes.trim() || null,
          status: "pending",
          total: 0,
        })
        .select("id")
        .single();

      if (orderErr) throw orderErr;
      const orderId = orderRow.id;

      for (const line of lines) {
        const prod = products.find((p) => p.id === line.product_id);
        if (!prod) continue;
        const stock =
          typeof prod.stock_quantity === "number"
            ? prod.stock_quantity
            : prod.in_stock
              ? Number.MAX_SAFE_INTEGER
              : 0;
        if (stock < line.quantity) {
          throw new Error(`Not enough stock for “${prod.name}” (have ${stock}, need ${line.quantity}).`);
        }
        const unit = Number(prod.price);
        total += unit * line.quantity;
        items.push({
          order_id: orderId,
          product_id: prod.id,
          product_name: prod.name,
          quantity: line.quantity,
          unit_price: unit,
        });
      }
      if (!items.length) throw new Error("No valid products in this order.");

      const { error: itemsErr } = await supabase.from("order_items").insert(items);
      if (itemsErr) throw itemsErr;

      const { error: totErr } = await supabase.from("orders").update({ total }).eq("id", orderId);
      if (totErr) throw totErr;

      for (const item of items) {
        const { error: decErr } = await supabase.rpc("decrement_product_stock", {
          p_product_id: item.product_id,
          p_qty: item.quantity,
        });
        if (decErr && !isStockRpcUnavailable(decErr)) throw decErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["fragrance-products"] });
      setManualOrderOpen(false);
      setManualCustomer({
        customer_name: "",
        customer_email: "",
        customer_phone: "",
        shipping_address: "",
        notes: "",
      });
      setManualLines([{ product_id: products[0]?.id ?? "", quantity: 1 }]);
      toast({ title: "Order created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast({ title: "Login failed", description: error.message, variant: "destructive" });
  };

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    else toast({ title: "Account created", description: "You can sign in now (confirm email if your project requires it)." });
  };

  const onCategoryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editingCategory) return;
    setCategoryUploading(true);
    try {
      const url = await uploadImageToStorage(file, "categories");
      setEditingCategory({ ...editingCategory, image_url: url });
      toast({ title: "Image uploaded" });
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setCategoryUploading(false);
    }
  };

  const onProductFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editingProduct) return;
    setProductUploading(true);
    try {
      const url = await uploadImageToStorage(file, "products");
      setEditingProduct({ ...editingProduct, image_url: url });
      toast({ title: "Image uploaded" });
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setProductUploading(false);
    }
  };

  const openOrderDialog = (o: Order) => {
    setOrdersView(o);
    setEditOrderStatus(o.status);
    setEditOrderNotes(o.notes ?? "");
    setEditTrackingNumber(o.tracking_number ?? "");
    setEditTrackingUrl(o.tracking_url ?? "");
    setEditCarrier(o.carrier ?? "");
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="font-heading text-3xl text-foreground">Admin Login</h1>
            <p className="text-muted-foreground font-body text-sm mt-2">Sign in to manage your candle store</p>
          </div>
          <div className="space-y-3">
            <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            <Input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Button onClick={handleLogin} className="w-full bg-gold text-gold-foreground hover:bg-gold/90">
              Sign In
            </Button>
            <Button onClick={handleSignUp} variant="outline" className="w-full">
              Create Account
            </Button>
            {(demoEmail || demoPassword) && (
              <p className="text-xs text-muted-foreground font-body text-center">
                Demo fields are pre-filled from environment. Use Create Account once if this user does not exist yet.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="font-heading text-xl text-foreground hover:text-gold transition-colors">
            ← Store
          </a>
          <h1 className="font-heading text-2xl text-foreground">Admin Panel</h1>
        </div>
        <Button variant="ghost" onClick={() => supabase.auth.signOut()} className="font-body text-sm">
          Sign Out
        </Button>
      </header>

      <div className="border-b border-border px-6">
        <div className="flex gap-6 flex-wrap">
          {(
            [
              { id: "categories" as const, label: "Categories" },
              { id: "products" as const, label: "Candles" },
              { id: "orders" as const, label: "Orders" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`py-3 font-body text-sm tracking-wider uppercase border-b-2 transition-colors ${
                activeTab === id
                  ? "border-gold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {activeTab === "categories" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="font-heading text-2xl text-foreground">Categories ({categories.length})</h2>
              <Button
                onClick={() => setEditingCategory({ name: "", description: "", image_url: "", sort_order: 0 })}
                className="bg-gold text-gold-foreground hover:bg-gold/90 font-body text-sm"
              >
                + Add Category
              </Button>
            </div>

            {editingCategory && (
              <div className="bg-card rounded-lg p-6 border border-border space-y-4">
                <h3 className="font-heading text-lg">{editingCategory.id ? "Edit" : "New"} Category</h3>
                <Input
                  placeholder="Name"
                  value={editingCategory.name ?? ""}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                />
                <Input
                  placeholder="Description"
                  value={editingCategory.description ?? ""}
                  onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                />
                <div className="space-y-2">
                  <Label className="font-body text-foreground">Image</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input ref={categoryFileRef} type="file" accept="image/*" className="hidden" onChange={onCategoryFile} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={categoryUploading}
                      onClick={() => categoryFileRef.current?.click()}
                    >
                      {categoryUploading ? "Uploading…" : "Upload image"}
                    </Button>
                    <Input
                      placeholder="Or paste image URL"
                      value={editingCategory.image_url ?? ""}
                      onChange={(e) => setEditingCategory({ ...editingCategory, image_url: e.target.value })}
                    />
                  </div>
                  {editingCategory.image_url ? (
                    <img src={editingCategory.image_url} alt="" className="h-24 w-24 rounded object-cover border border-border" />
                  ) : null}
                </div>
                <Input
                  placeholder="Sort Order"
                  type="number"
                  value={editingCategory.sort_order ?? 0}
                  onChange={(e) => setEditingCategory({ ...editingCategory, sort_order: Number(e.target.value) })}
                />
                <div className="flex gap-3">
                  <Button
                    onClick={() => saveCategoryMutation.mutate(editingCategory)}
                    className="bg-gold text-gold-foreground hover:bg-gold/90"
                  >
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => setEditingCategory(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {categories.map((cat) => (
                <div key={cat.id} className="bg-card rounded-lg p-4 border border-border flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    {cat.image_url && <img src={cat.image_url} alt={cat.name} className="w-12 h-12 rounded object-cover" />}
                    <div>
                      <h4 className="font-heading text-lg text-foreground">{cat.name}</h4>
                      <p className="text-muted-foreground font-body text-xs">{cat.description}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="font-body text-xs"
                      onClick={() => {
                        setActiveTab("products");
                        setEditingProduct({
                          name: "",
                          category_id: cat.id,
                          scent: "",
                          price: 0,
                          size: "",
                          image_url: "",
                          description: "",
                          in_stock: true,
                          stock_quantity: 20,
                          sort_order: 0,
                        });
                      }}
                    >
                      Add candle
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingCategory(cat)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteCategoryMutation.mutate(cat.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-muted-foreground text-center py-8 font-body">No categories yet. Add one above!</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "products" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-heading text-2xl text-foreground">Candles ({products.length})</h2>
                <p className="text-muted-foreground font-body text-sm mt-1">
                  Each candle belongs to one category. Stock = 0 marks it sold out on the store.
                </p>
              </div>
              <Button
                onClick={() =>
                  setEditingProduct({
                    name: "",
                    category_id: categories[0]?.id ?? "",
                    scent: "",
                    price: 0,
                    size: "",
                    image_url: "",
                    description: "",
                    in_stock: true,
                    stock_quantity: 20,
                    sort_order: 0,
                  })
                }
                className="bg-gold text-gold-foreground hover:bg-gold/90 font-body text-sm"
                disabled={categories.length === 0}
              >
                + Add candle (first category)
              </Button>
            </div>

            {categories.length === 0 && (
              <p className="text-muted-foreground font-body text-sm bg-card p-4 rounded-lg border border-border">
                Create a category first, then add candles to it from here or with “Add candle” on the category row.
              </p>
            )}

            {editingProduct && (
              <div className="bg-card rounded-lg p-6 border border-border space-y-4">
                <h3 className="font-heading text-lg">
                  {editingProduct.id ? "Edit" : "New"} candle —{" "}
                  {categories.find((c) => c.id === editingProduct.category_id)?.name ?? "Collection"}
                </h3>
                <Input
                  placeholder="Name"
                  value={editingProduct.name ?? ""}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                />
                <div className="space-y-2">
                  <Label className="font-body text-foreground">Collection (category)</Label>
                  <select
                    value={editingProduct.category_id ?? ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category_id: e.target.value })}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-body"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  placeholder="Scent (e.g., Lavender & Vanilla)"
                  value={editingProduct.scent ?? ""}
                  onChange={(e) => setEditingProduct({ ...editingProduct, scent: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="font-body text-foreground">Price</Label>
                    <Input
                      placeholder="0.00"
                      type="number"
                      min={0}
                      step="0.01"
                      value={editingProduct.price ?? 0}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          price: normalizePrice(e.target.value === "" ? NaN : e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-body text-foreground">Size</Label>
                    <Input
                      placeholder="e.g., 8 oz"
                      value={editingProduct.size ?? ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, size: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="font-body text-foreground">Stock quantity</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={editingProduct.stock_quantity ?? 0}
                      onChange={(e) => {
                        const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                        setEditingProduct({
                          ...editingProduct,
                          stock_quantity: n,
                          in_stock: n > 0,
                        });
                      }}
                    />
                    <p className="text-xs text-muted-foreground font-body">0 = sold out on the shop.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-body text-foreground">Sort order</Label>
                    <Input
                      placeholder="Sort order"
                      type="number"
                      value={editingProduct.sort_order ?? 0}
                      onChange={(e) => setEditingProduct({ ...editingProduct, sort_order: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-body text-foreground">Candle image</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input ref={productFileRef} type="file" accept="image/*" className="hidden" onChange={onProductFile} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={productUploading}
                      onClick={() => productFileRef.current?.click()}
                    >
                      {productUploading ? "Uploading…" : "Upload image"}
                    </Button>
                    <Input
                      placeholder="Or paste image URL"
                      value={editingProduct.image_url ?? ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, image_url: e.target.value })}
                    />
                  </div>
                  {editingProduct.image_url ? (
                    <img src={editingProduct.image_url} alt="" className="h-32 w-24 rounded object-cover border border-border" />
                  ) : null}
                </div>
                <Input
                  placeholder="Description"
                  value={editingProduct.description ?? ""}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                />
                <div className="flex gap-3">
                  <Button
                    onClick={() => saveProductMutation.mutate(editingProduct)}
                    className="bg-gold text-gold-foreground hover:bg-gold/90"
                  >
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => setEditingProduct(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-10">
              {categories.map((cat) => {
                const catProducts = products
                  .filter((p) => p.category_id === cat.id)
                  .slice()
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
                return (
                  <section key={cat.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
                      <div>
                        <h3 className="font-heading text-xl text-foreground">{cat.name}</h3>
                        <p className="text-muted-foreground font-body text-xs">{catProducts.length} candle(s)</p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-gold text-gold-foreground hover:bg-gold/90 font-body text-xs"
                        onClick={() =>
                          setEditingProduct({
                            name: "",
                            category_id: cat.id,
                            scent: "",
                            price: 0,
                            size: "",
                            image_url: "",
                            description: "",
                            in_stock: true,
                            stock_quantity: 20,
                            sort_order: 0,
                          })
                        }
                      >
                        + Add candle here
                      </Button>
                    </div>
                    {catProducts.length === 0 ? (
                      <p className="text-muted-foreground font-body text-sm py-4 px-1">
                        No candles in this collection yet. Use “Add candle here”.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {catProducts.map((p) => (
                          <div
                            key={p.id}
                            className="bg-card rounded-lg p-4 border border-border flex items-center justify-between gap-4 flex-wrap"
                          >
                            <div className="flex items-center gap-4">
                              {p.image_url && <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded object-cover" />}
                              <div>
                                <h4 className="font-heading text-base text-foreground">{p.name}</h4>
                                <p className="text-muted-foreground font-body text-xs">
                                  {p.scent} · ${Number(p.price).toFixed(2)} · {p.size}
                                </p>
                                <p className="text-muted-foreground font-body text-xs mt-1">
                                  Stock:{" "}
                                  <span
                                    className={
                                      (typeof p.stock_quantity === "number" ? p.stock_quantity <= 0 : !p.in_stock)
                                        ? "text-destructive font-medium"
                                        : "text-foreground"
                                    }
                                  >
                                    {typeof p.stock_quantity === "number" ? p.stock_quantity : "—"}
                                  </span>
                                  {(typeof p.stock_quantity === "number" ? p.stock_quantity <= 0 : !p.in_stock)
                                    ? " · Sold out"
                                    : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2 items-center flex-wrap">
                              <Button size="sm" variant="outline" onClick={() => setEditingProduct(p)}>
                                Edit
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteProductMutation.mutate(p.id)}>
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
              {categories.length > 0 && products.length === 0 && (
                <p className="text-muted-foreground text-center py-8 font-body">No candles yet. Add one to a collection above.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "orders" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="font-heading text-2xl text-foreground">Orders ({orders.length})</h2>
              <Button
                className="bg-gold text-gold-foreground hover:bg-gold/90 font-body text-sm"
                disabled={products.length === 0}
                onClick={() => {
                  setManualLines([{ product_id: products[0]?.id ?? "", quantity: 1 }]);
                  setManualOrderOpen(true);
                }}
              >
                + New order
              </Button>
            </div>

            {products.length === 0 && (
              <p className="text-muted-foreground font-body text-sm bg-card p-4 rounded-lg border border-border">
                Add products before creating a manual order.
              </p>
            )}

            <div className="space-y-3">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="bg-card rounded-lg p-4 border border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <p className="font-heading text-foreground">{o.customer_name}</p>
                    <p className="text-muted-foreground font-body text-xs">{o.customer_email}</p>
                    <p className="text-muted-foreground font-body text-xs mt-1">
                      {new Date(o.created_at).toLocaleString()} · ${Number(o.total).toFixed(2)} ·{" "}
                      <span className="capitalize">{o.status}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openOrderDialog(o)}>
                      Manage
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteOrderMutation.mutate(o.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              {orders.length === 0 && (
                <p className="text-muted-foreground text-center py-8 font-body">No orders yet. Customer checkout or manual order will appear here.</p>
              )}
            </div>

            <Dialog open={!!ordersView} onOpenChange={(open) => !open && setOrdersView(null)}>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading">Order details</DialogTitle>
                </DialogHeader>
                {ordersView && (
                  <div className="space-y-4 font-body text-sm">
                    <div>
                      <p className="text-muted-foreground">Customer</p>
                      <p className="text-foreground">{ordersView.customer_name}</p>
                      <p className="text-muted-foreground">{ordersView.customer_email}</p>
                      {ordersView.customer_phone && <p className="text-muted-foreground">{ordersView.customer_phone}</p>}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Ship to</p>
                      <p className="text-foreground whitespace-pre-wrap">{ordersView.shipping_address}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Payment</p>
                      <p className="text-foreground capitalize">{ordersView.payment_mode?.replaceAll("_", " ") ?? "manual_upi"}</p>
                      {ordersView.upi_transaction_ref ? (
                        <p className="text-xs text-muted-foreground mt-1">UPI Ref: {ordersView.upi_transaction_ref}</p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-2">Items</p>
                      <ul className="border border-border rounded-md divide-y divide-border">
                        {ordersView.order_items.map((li) => (
                          <li key={li.id} className="px-3 py-2 flex justify-between gap-2">
                            <span>
                              {li.product_name} × {li.quantity}
                            </span>
                            <span className="text-muted-foreground">${(Number(li.unit_price) * li.quantity).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="flex justify-between mt-2 font-medium">
                        <span>Total</span>
                        <span>${Number(ordersView.total).toFixed(2)}</span>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={editOrderStatus} onValueChange={setEditOrderStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORDER_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Internal notes</Label>
                      <Textarea value={editOrderNotes} onChange={(e) => setEditOrderNotes(e.target.value)} rows={3} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Carrier</Label>
                        <Input value={editCarrier} onChange={(e) => setEditCarrier(e.target.value)} placeholder="BlueDart / Delhivery / ..." />
                      </div>
                      <div className="space-y-2">
                        <Label>Tracking number</Label>
                        <Input value={editTrackingNumber} onChange={(e) => setEditTrackingNumber(e.target.value)} placeholder="Tracking number" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Tracking URL</Label>
                      <Input
                        value={editTrackingUrl}
                        onChange={(e) => setEditTrackingUrl(e.target.value)}
                        placeholder="https://carrier.example/track/..."
                      />
                    </div>
                  </div>
                )}
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setOrdersView(null)}>
                    Close
                  </Button>
                  {ordersView && (
                    <Button
                      className="bg-gold text-gold-foreground hover:bg-gold/90"
                      onClick={() =>
                        updateOrderMutation.mutate({
                          id: ordersView.id,
                          status: editOrderStatus,
                          notes: editOrderNotes.trim() || null,
                          tracking_number: editTrackingNumber.trim() || null,
                          tracking_url: editTrackingUrl.trim() || null,
                          carrier: editCarrier.trim() || null,
                        })
                      }
                      disabled={updateOrderMutation.isPending}
                    >
                      Save changes
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={manualOrderOpen} onOpenChange={setManualOrderOpen}>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading">Create order</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 font-body text-sm">
                  <Input
                    placeholder="Customer name"
                    value={manualCustomer.customer_name}
                    onChange={(e) => setManualCustomer({ ...manualCustomer, customer_name: e.target.value })}
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={manualCustomer.customer_email}
                    onChange={(e) => setManualCustomer({ ...manualCustomer, customer_email: e.target.value })}
                  />
                  <Input
                    placeholder="Phone"
                    value={manualCustomer.customer_phone}
                    onChange={(e) => setManualCustomer({ ...manualCustomer, customer_phone: e.target.value })}
                  />
                  <Textarea
                    placeholder="Shipping address"
                    value={manualCustomer.shipping_address}
                    onChange={(e) => setManualCustomer({ ...manualCustomer, shipping_address: e.target.value })}
                    className="min-h-[80px]"
                  />
                  <Textarea
                    placeholder="Notes (optional)"
                    value={manualCustomer.notes}
                    onChange={(e) => setManualCustomer({ ...manualCustomer, notes: e.target.value })}
                    className="min-h-[60px]"
                  />
                  <div className="space-y-2">
                    <Label>Line items</Label>
                    {manualLines.map((line, idx) => (
                      <div key={idx} className="flex gap-2 items-center flex-wrap">
                        <select
                          value={line.product_id}
                          onChange={(e) => {
                            const next = [...manualLines];
                            next[idx] = { ...next[idx], product_id: e.target.value };
                            setManualLines(next);
                          }}
                          className="flex-1 min-w-[140px] h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (${Number(p.price).toFixed(2)})
                            </option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          min={1}
                          className="w-24"
                          value={line.quantity}
                          onChange={(e) => {
                            const next = [...manualLines];
                            next[idx] = { ...next[idx], quantity: Math.max(1, Number(e.target.value) || 1) };
                            setManualLines(next);
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setManualLines(manualLines.filter((_, i) => i !== idx))}
                          disabled={manualLines.length <= 1}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setManualLines([...manualLines, { product_id: products[0]?.id ?? "", quantity: 1 }])}
                    >
                      Add line
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setManualOrderOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="bg-gold text-gold-foreground hover:bg-gold/90"
                    disabled={
                      createManualOrderMutation.isPending ||
                      !manualCustomer.customer_name.trim() ||
                      !manualCustomer.customer_email.trim() ||
                      !manualCustomer.shipping_address.trim()
                    }
                    onClick={() => createManualOrderMutation.mutate()}
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
