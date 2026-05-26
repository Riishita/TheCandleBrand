import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, Minus, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/context/CartContext";
import { sendOrderEmail } from "@/lib/orderEmail";

const CheckoutPage = () => {
  const { lines, subtotal, totalItems, clearCart, setQuantity, removeLine } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billAddress1, setBillAddress1] = useState("");
  const [billAddress2, setBillAddress2] = useState("");
  const [billCity, setBillCity] = useState("");
  const [billState, setBillState] = useState("");
  const [billPostalCode, setBillPostalCode] = useState("");
  const [billCountry, setBillCountry] = useState("");
  const [upiTxnRef, setUpiTxnRef] = useState("");
  const [upiConfirmed, setUpiConfirmed] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"upi" | "">("");
  const [upiPayClicked, setUpiPayClicked] = useState(false);

  const upiId = (import.meta.env.VITE_UPI_ID as string | undefined) || "";
  const upiName = (import.meta.env.VITE_UPI_NAME as string | undefined) || "Candle Charm";
  const upiQrUrl = (import.meta.env.VITE_UPI_QR_URL as string | undefined) || "";
  const upiDeepLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${encodeURIComponent(subtotal.toFixed(2))}&cu=INR`
    : "";

  const submitMutation = useMutation({
    mutationFn: async () => {
      const bAddress1 = billingSameAsShipping ? address1 : billAddress1;
      const bAddress2 = billingSameAsShipping ? address2 : billAddress2;
      const bCity = billingSameAsShipping ? city : billCity;
      const bState = billingSameAsShipping ? state : billState;
      const bPostalCode = billingSameAsShipping ? postalCode : billPostalCode;
      const bCountry = billingSameAsShipping ? country : billCountry;
      const billingNote = billingSameAsShipping
        ? ""
        : `\nBilling Address:\n${bAddress1}\n${bAddress2}\n${bCity}, ${bState} ${bPostalCode}\n${bCountry}`;
      const items = lines.map((l) => ({
        product_id: l.productId,
        product_name: l.name,
        quantity: l.quantity,
        unit_price: l.price,
      }));
      let { data, error } = await supabase.rpc("place_order_guest", {
        p_customer_name: name.trim(),
        p_customer_email: email.trim(),
        p_customer_phone: phone.trim(),
        p_address_line_1: address1.trim(),
        p_address_line_2: address2.trim(),
        p_city: city.trim(),
        p_state: state.trim(),
        p_postal_code: postalCode.trim(),
        p_country: country.trim(),
        p_notes: `${notes.trim()}${billingNote}`.trim(),
        p_payment_mode: "manual_upi",
        p_upi_transaction_ref: upiTxnRef.trim(),
        p_items: items,
      });
      if (error?.message?.toLowerCase().includes("place_order_guest")) {
        ({ data, error } = await supabase.rpc("place_order", {
          p_customer_name: name.trim(),
          p_customer_email: email.trim(),
          p_customer_phone: phone.trim(),
          p_shipping_address: `${address1}\n${address2}\n${city}, ${state} ${postalCode}\n${country}\nUPI Ref: ${upiTxnRef}`.trim(),
          p_items: items,
        }));
      }
      if (error) throw error;
      return { orderId: data as string, items };
    },
    onSuccess: async ({ orderId, items }) => {
      clearCart();
      await sendOrderEmail("order_placed", {
        orderId,
        customerName: name.trim(),
        customerEmail: email.trim(),
        status: "pending",
        total: subtotal,
        items,
      });
      toast({
        title: "Order placed",
        description: `Reference: ${orderId.slice(0, 8)}… Check your email and track on /track-order`,
      });
      navigate("/");
    },
    onError: (e: Error) => {
      toast({ title: "Checkout failed", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lines.length) return;
    if (!name.trim() || !email.trim() || !phone.trim() || !address1.trim() || !city.trim() || !state.trim() || !postalCode.trim() || !country.trim()) {
      toast({ title: "Missing details", description: "Please fill all required billing fields.", variant: "destructive" });
      return;
    }
    if (!billingSameAsShipping && (!billAddress1.trim() || !billCity.trim() || !billState.trim() || !billPostalCode.trim() || !billCountry.trim())) {
      toast({ title: "Missing billing details", description: "Please fill the billing address.", variant: "destructive" });
      return;
    }
    if (selectedPaymentMethod !== "upi") {
      toast({
        title: "Select payment method",
        description: "Please select UPI payment to continue.",
        variant: "destructive",
      });
      return;
    }
    if (!upiPayClicked) {
      toast({
        title: "Payment not started",
        description: "Please tap 'Open UPI app & Pay' first.",
        variant: "destructive",
      });
      return;
    }
    if (!upiConfirmed || !upiTxnRef.trim()) {
      toast({
        title: "UPI details required",
        description: "Please confirm payment and add your UPI transaction reference.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-20 px-6 max-w-6xl mx-auto">
        <h1 className="font-heading text-4xl text-foreground mb-2">Your Cart</h1>
        <p className="text-muted-foreground font-body text-sm mb-8">
          {totalItems} item{totalItems === 1 ? "" : "s"} in cart. Adjust quantity before checkout.
        </p>

        {!lines.length ? (
          <div className="bg-card border border-border rounded-lg p-10 text-center">
            <p className="text-muted-foreground font-body mb-6">Your cart is empty.</p>
            <Button asChild className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Link to="/">Continue shopping</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid lg:grid-cols-[1.35fr_1fr] gap-8 items-start">
            <div className="bg-card border border-border rounded-lg p-5 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-xl text-foreground">Cart items</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearCart}
                  className="text-muted-foreground hover:text-destructive"
                >
                  Clear cart
                </Button>
              </div>

              <ul className="divide-y divide-border">
                {lines.map((l) => (
                  <li key={l.productId} className="py-4 flex gap-3">
                    <div className="w-16 h-16 rounded-md overflow-hidden bg-muted shrink-0">
                      {l.image_url ? (
                        <img src={l.image_url} alt={l.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gold/20 to-primary/20" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-3">
                        <p className="font-body text-sm text-foreground truncate">{l.name}</p>
                        <p className="font-body text-sm text-foreground">${(l.price * l.quantity).toFixed(2)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">${l.price.toFixed(2)} each</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="inline-flex items-center rounded-md border border-border overflow-hidden">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-none"
                            onClick={() => setQuantity(l.productId, l.quantity - 1)}
                            aria-label={`Decrease quantity of ${l.name}`}
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                          <span className="w-9 text-center text-sm font-body">{l.quantity}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-none"
                            onClick={() => setQuantity(l.productId, l.quantity + 1)}
                            aria-label={`Increase quantity of ${l.name}`}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(l.productId)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="pt-3 border-t border-border flex justify-between items-center">
                <span className="font-body text-sm text-muted-foreground">Subtotal</span>
                <span className="font-body text-lg font-medium text-foreground">${subtotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-4 lg:sticky lg:top-28">
              <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                <h2 className="font-heading text-xl text-foreground">Shipping details</h2>
                <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Input placeholder="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                <Input placeholder="Address Line 1" value={address1} onChange={(e) => setAddress1(e.target.value)} required />
                <Input placeholder="Address Line 2 (optional)" value={address2} onChange={(e) => setAddress2(e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} required />
                  <Input placeholder="State" value={state} onChange={(e) => setState(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Postal Code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required />
                  <Input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} required />
                </div>
                <Textarea
                  placeholder="Order notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>

              <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                <div>
                  <h2 className="font-heading text-3xl text-foreground">Payment</h2>
                  <p className="text-muted-foreground font-body text-sm mt-1">All transactions are secure and encrypted.</p>
                </div>

                <div className="rounded-xl border border-rose-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod("upi")}
                    className={`w-full px-4 py-4 text-left transition-colors ${
                      selectedPaymentMethod === "upi" ? "bg-rose-50" : "bg-background"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-4">
                      <span className="text-[28px] leading-[1.2] text-foreground font-body">
                        Razorpay Secure (UPI, Cards, Int'l Cards, Wallets)
                      </span>
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                        <span className="px-2 py-1 rounded border border-border bg-white">UPI</span>
                        <span className="px-2 py-1 rounded border border-border bg-white">VISA</span>
                        <span className="px-2 py-1 rounded border border-border bg-white">MC</span>
                        <span className="px-2 py-1 rounded border border-border bg-white">+17</span>
                      </span>
                    </span>
                  </button>
                  <div className="px-4 py-4 bg-muted/40 border-t border-rose-100 text-muted-foreground font-body text-sm text-center">
                    You'll be redirected to Razorpay Secure (UPI, Cards, Int'l Cards, Wallets) to complete your purchase.
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="font-body text-sm text-foreground font-medium">Complete UPI payment</p>
                  {upiId ? (
                    <div className="text-xs text-muted-foreground font-body space-y-1">
                      <p>UPI ID: <span className="text-foreground font-medium">{upiId}</span></p>
                      <p>Payee: <span className="text-foreground">{upiName}</span></p>
                      <p>Amount: <span className="text-foreground font-medium">INR {subtotal.toFixed(2)}</span></p>
                    </div>
                  ) : (
                    <p className="text-xs text-destructive font-body">
                      UPI details not configured yet. Ask admin to set VITE_UPI_ID and VITE_UPI_NAME.
                    </p>
                  )}
                  {upiQrUrl ? (
                    <img src={upiQrUrl} alt="UPI QR" className="w-36 h-36 rounded border border-border object-cover" />
                  ) : null}
                  {upiDeepLink ? (
                    <a
                      href={upiDeepLink}
                      onClick={() => setUpiPayClicked(true)}
                      className="inline-flex items-center justify-center rounded-md bg-gold px-3 py-2 text-xs font-medium text-gold-foreground hover:bg-gold/90"
                    >
                      Open UPI app & Pay
                    </a>
                  ) : null}
                </div>

                {selectedPaymentMethod === "upi" && !upiPayClicked ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground font-body">
                    Step 2 (confirmation) will appear after you click <span className="text-foreground font-medium">Open UPI app & Pay</span>.
                  </div>
                ) : null}

                {selectedPaymentMethod === "upi" && upiPayClicked ? (
                  <div className="rounded-md border border-border p-4 space-y-3 bg-background">
                    <p className="text-sm font-medium text-foreground">Payment confirmation</p>
                    <Input
                      placeholder="UPI Transaction / UTR Reference"
                      value={upiTxnRef}
                      onChange={(e) => setUpiTxnRef(e.target.value)}
                      required
                    />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground font-body cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upiConfirmed}
                        onChange={(e) => setUpiConfirmed(e.target.checked)}
                      />
                      I have completed UPI payment.
                    </label>
                    {upiConfirmed && upiTxnRef.trim() ? (
                      <p className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <BadgeCheck className="w-3.5 h-3.5" />
                        Payment confirmation added.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                <h2 className="font-heading text-3xl text-foreground">Billing address</h2>
                <div className="rounded-xl border border-rose-200 overflow-hidden">
                  <label className={`flex items-center gap-3 px-4 py-4 cursor-pointer ${billingSameAsShipping ? "bg-rose-50" : "bg-background"}`}>
                    <input
                      type="radio"
                      name="billing_mode"
                      checked={billingSameAsShipping}
                      onChange={() => setBillingSameAsShipping(true)}
                    />
                    <span className="font-body text-lg text-foreground">Same as shipping address</span>
                  </label>
                  <label className={`flex items-center gap-3 px-4 py-4 border-t border-rose-100 cursor-pointer ${!billingSameAsShipping ? "bg-rose-50" : "bg-background"}`}>
                    <input
                      type="radio"
                      name="billing_mode"
                      checked={!billingSameAsShipping}
                      onChange={() => setBillingSameAsShipping(false)}
                    />
                    <span className="font-body text-lg text-foreground">Use a different billing address</span>
                  </label>
                </div>

                {!billingSameAsShipping && (
                  <div className="space-y-3">
                    <Input placeholder="Billing Address Line 1" value={billAddress1} onChange={(e) => setBillAddress1(e.target.value)} />
                    <Input placeholder="Billing Address Line 2 (optional)" value={billAddress2} onChange={(e) => setBillAddress2(e.target.value)} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Billing City" value={billCity} onChange={(e) => setBillCity(e.target.value)} />
                      <Input placeholder="Billing State" value={billState} onChange={(e) => setBillState(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Billing Postal Code" value={billPostalCode} onChange={(e) => setBillPostalCode(e.target.value)} />
                      <Input placeholder="Billing Country" value={billCountry} onChange={(e) => setBillCountry(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                <p className="flex justify-between font-body text-sm">
                  <span className="text-muted-foreground">Items</span>
                  <span className="text-foreground">{totalItems}</span>
                </p>
                <p className="flex justify-between font-body text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">${subtotal.toFixed(2)}</span>
                </p>
                <div className="pt-3 border-t border-border flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    className="bg-rose-300 text-black hover:bg-rose-300/90 flex-1 text-3xl h-14 font-medium"
                    disabled={submitMutation.isPending}
                  >
                    {submitMutation.isPending ? "Paying..." : "Pay now"}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link to="/">Back to shop</Link>
                  </Button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
      <FooterSection />
    </div>
  );
};

export default CheckoutPage;
