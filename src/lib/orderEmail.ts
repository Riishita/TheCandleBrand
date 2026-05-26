type OrderEmailEvent = "order_placed" | "order_delivered" | "order_cancelled";

type OrderEmailPayload = {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: string;
  total: number;
  items?: Array<{ product_name: string; quantity: number; unit_price: number }>;
  trackingUrl?: string | null;
};

export async function sendOrderEmail(event: OrderEmailEvent, payload: OrderEmailPayload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supabaseUrl || !anonKey) return;

  try {
    await fetch(`${supabaseUrl}/functions/v1/send-order-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ event, payload }),
    });
  } catch {
    // Email failures should not block checkout/admin status changes.
  }
}
