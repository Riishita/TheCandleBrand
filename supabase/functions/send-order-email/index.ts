import { Resend } from "npm:resend@4.0.1";

type OrderEmailEvent = "order_placed" | "order_delivered" | "order_cancelled";

type Payload = {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: string;
  total: number;
  items?: Array<{ product_name: string; quantity: number; unit_price: number }>;
  trackingUrl?: string | null;
};

const resendKey = Deno.env.get("RESEND_API_KEY");
const from = Deno.env.get("ORDER_FROM_EMAIL") || "orders@example.com";
const resend = resendKey ? new Resend(resendKey) : null;

function subjectFor(event: OrderEmailEvent, orderId: string) {
  if (event === "order_placed") return `Order Confirmed: ${orderId.slice(0, 8)}`;
  if (event === "order_delivered") return `Order Delivered: ${orderId.slice(0, 8)}`;
  return `Order Update: ${orderId.slice(0, 8)}`;
}

function htmlFor(event: OrderEmailEvent, p: Payload) {
  const itemsHtml = (p.items ?? [])
    .map((i) => `<li>${i.product_name} × ${i.quantity} — $${(Number(i.unit_price) * i.quantity).toFixed(2)}</li>`)
    .join("");
  const status = p.status.replaceAll("_", " ");
  const intro =
    event === "order_placed"
      ? "Thanks for your order. We have received it and will update you as it moves."
      : event === "order_delivered"
        ? "Great news — your order is marked delivered."
        : "Your order status has been updated.";
  return `
    <div style="font-family: Arial, sans-serif; line-height:1.5;">
      <h2>${intro}</h2>
      <p><strong>Order ID:</strong> ${p.orderId}</p>
      <p><strong>Status:</strong> ${status}</p>
      <p><strong>Total:</strong> $${Number(p.total).toFixed(2)}</p>
      ${itemsHtml ? `<h3>Items</h3><ul>${itemsHtml}</ul>` : ""}
      ${p.trackingUrl ? `<p><a href="${p.trackingUrl}">Track shipment</a></p>` : ""}
      <p>You can track your order anytime using Order ID + Email on our site.</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!resend) return new Response("Resend not configured", { status: 500 });

  try {
    const { event, payload } = await req.json() as { event: OrderEmailEvent; payload: Payload };
    if (!payload?.customerEmail || !payload?.orderId) {
      return new Response("Missing fields", { status: 400 });
    }

    await resend.emails.send({
      from,
      to: payload.customerEmail,
      subject: subjectFor(event, payload.orderId),
      html: htmlFor(event, payload),
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
