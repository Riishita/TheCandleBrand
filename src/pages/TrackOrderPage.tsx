import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type TrackedOrder = {
  id: string;
  customer_name: string;
  customer_email: string;
  status: string;
  notes: string | null;
  payment_mode: string;
  upi_transaction_ref: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  carrier: string | null;
  total: number;
  created_at: string;
  updated_at: string;
};

type TrackedItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
};

const TrackOrderPage = () => {
  const { toast } = useToast();
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [items, setItems] = useState<TrackedItem[]>([]);

  const lookupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("get_order_tracking", {
        p_order_id: orderId.trim(),
        p_customer_email: email.trim(),
      });
      if (error) throw error;
      return data as { order?: TrackedOrder; items?: TrackedItem[] };
    },
    onSuccess: (data) => {
      if (!data?.order) {
        setOrder(null);
        setItems([]);
        toast({
          title: "Order not found",
          description: "Check your Order ID and email, then try again.",
          variant: "destructive",
        });
        return;
      }
      setOrder(data.order);
      setItems(data.items ?? []);
    },
    onError: (e: Error) => {
      toast({ title: "Lookup failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-20 px-6 max-w-4xl mx-auto">
        <h1 className="font-heading text-4xl text-foreground mb-2">Track Your Order</h1>
        <p className="text-muted-foreground font-body text-sm mb-8">
          No sign-in needed. Enter your Order ID and checkout email.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookupMutation.mutate();
          }}
          className="bg-card border border-border rounded-lg p-6 space-y-4 mb-8"
        >
          <Input
            placeholder="Order ID (e.g. 4d8f...uuid)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            required
          />
          <Input
            placeholder="Email used at checkout"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" className="bg-gold text-gold-foreground hover:bg-gold/90" disabled={lookupMutation.isPending}>
            {lookupMutation.isPending ? "Checking..." : "Track order"}
          </Button>
        </form>

        {order && (
          <div className="space-y-5">
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="font-body text-sm text-muted-foreground">Order ID</p>
              <p className="font-mono text-sm text-foreground mt-1">{order.id}</p>
              <p className="font-body text-sm text-muted-foreground mt-4">Status</p>
              <p className="text-foreground font-medium capitalize">{order.status.replaceAll("_", " ")}</p>
              <p className="font-body text-sm text-muted-foreground mt-4">Total</p>
              <p className="text-foreground font-medium">${Number(order.total).toFixed(2)}</p>
              {order.upi_transaction_ref ? (
                <>
                  <p className="font-body text-sm text-muted-foreground mt-4">UPI Reference</p>
                  <p className="text-foreground font-medium">{order.upi_transaction_ref}</p>
                </>
              ) : null}
              {order.tracking_url ? (
                <a href={order.tracking_url} target="_blank" rel="noreferrer" className="inline-block mt-4 text-gold text-sm hover:underline">
                  Track shipment
                </a>
              ) : null}
              {order.notes ? <p className="text-muted-foreground text-sm mt-4">Note: {order.notes}</p> : null}
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="font-heading text-xl text-foreground mb-3">Items</h2>
              <ul className="divide-y divide-border">
                {items.map((it, idx) => (
                  <li key={`${it.product_name}-${idx}`} className="py-3 flex justify-between gap-3 text-sm font-body">
                    <span>{it.product_name} × {it.quantity}</span>
                    <span>${(Number(it.unit_price) * it.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
      <FooterSection />
    </div>
  );
};

export default TrackOrderPage;
