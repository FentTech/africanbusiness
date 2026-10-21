import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LoaderCircle, ShoppingBag } from "lucide-react";
import { fetchStoreProducts } from "@/lib/storeProducts";
import { readCart, writeCart, type CartLine } from "@/lib/cart";
import type { Product } from "@shared/productCatalog";

const formatGhs = (amount: number) => `GH₵${amount.toFixed(2)}`;

type WhatsAppOrder = {
  orderNumber: number;
  fullName: string;
  phone: string;
  email: string | null;
  deliveryArea: string;
  deliveryAddress: string;
  customerNote: string;
  items: { productName: string; quantity: number; minPriceGhs: number; maxPriceGhs: number | null }[];
};

export default function Checkout() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<{ orderNumber: number; trackingToken: string; minimumSubtotalGhs: number } | null>(null);
  const [whatsAppOrder, setWhatsAppOrder] = useState<WhatsAppOrder | null>(null);

  useEffect(() => {
    setCart(readCart());
    void fetchStoreProducts().then(setProducts).catch(() => {
      setError("Product details are temporarily unavailable.");
    }).finally(() => setCatalogReady(true));
  }, []);

  const cartProducts = useMemo(() => cart.map((line) => ({
    ...line,
    product: products.find((product) => product.id === line.productId),
  })).filter((line) => line.product), [cart, products]);
  const minimumSubtotal = cartProducts.reduce((total, line) => total + line.product!.price * line.quantity, 0);

  const updateQuantity = (productId: number, quantity: number) => {
    const next = cart.map((line) => line.productId === productId ? { ...line, quantity } : line).filter((line) => line.quantity > 0);
    setCart(next);
    writeCart(next);
  };

  const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/store-orders`, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          fullName: form.get("fullName"),
          phone: form.get("phone"),
          email: form.get("email") || null,
          deliveryArea: form.get("deliveryArea"),
          deliveryAddress: form.get("deliveryAddress"),
          customerNote: form.get("customerNote") || "",
          items: cartProducts.map(({ productId, quantity }) => ({ productId, quantity })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "order_failed");
      setOrder(data);
      setWhatsAppOrder({
        orderNumber: data.orderNumber,
        fullName: String(form.get("fullName")),
        phone: String(form.get("phone")),
        email: form.get("email") ? String(form.get("email")) : null,
        deliveryArea: String(form.get("deliveryArea")),
        deliveryAddress: String(form.get("deliveryAddress")),
        customerNote: String(form.get("customerNote") ?? ""),
        items: cartProducts.map(({ quantity, product }) => ({
          productName: product!.name,
          quantity,
          minPriceGhs: product!.price,
          maxPriceGhs: product!.maxPrice ?? null,
        })),
      });
      writeCart([]);
      setCart([]);
    } catch {
      setError("We couldn’t save your order. Please check your details and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f8fc] px-5 py-10 text-[#1d2942] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#4163e8]"><ArrowLeft size={16} /> Continue shopping</Link>
        <h1 className="mt-6 font-serif text-4xl font-bold">{order ? "Order received" : "Your order"}</h1>
        {!catalogReady ? <p className="mt-6 text-sm text-[#69758a]">Loading your cart…</p> : order ? (
          <section className="mt-6 rounded-2xl border border-[#e1e6ef] bg-white p-6 shadow-sm">
            <p className="text-sm leading-6 text-[#667086]">Your order is pending. We’ll confirm the exact variant prices and delivery fee with you on WhatsApp before confirming the order.</p>
            <p className="mt-5 text-sm font-bold">Order #{order.orderNumber}</p>
            <p className="mt-1 text-sm">Minimum item estimate: {formatGhs(order.minimumSubtotalGhs)}</p>
            {whatsAppOrder && <div className="mt-5 rounded-xl border border-[#e1e6ef] bg-white p-4"><h2 className="font-serif text-lg font-bold">Continue in WhatsApp</h2><p className="mt-1 text-xs leading-5 text-[#69758a]">Your order is saved for the store. Choose a contact to send the order details and confirm exact prices and delivery.</p><div className="mt-3"><form action="/api/orders/whatsapp/cart" method="post" target="_blank" rel="noopener noreferrer"><input type="hidden" name="contact" value="1" /><input type="hidden" name="payload" value={JSON.stringify(whatsAppOrder)} /><button className="w-full rounded-full bg-[#4163e8] px-4 py-3 text-sm font-bold text-white">Send order via WhatsApp</button></form></div></div>}
            <div className="mt-5 rounded-lg bg-[#eef1f8] p-4">
              <p className="text-xs font-bold uppercase tracking-wide">Save this private tracking code</p>
              <code className="mt-2 block break-all text-xs">{order.trackingToken}</code>
            </div>
            <Link to="/track-order" state={{ orderNumber: order.orderNumber, trackingToken: order.trackingToken }} className="mt-5 inline-flex rounded-full bg-[#4163e8] px-5 py-3 text-sm font-bold text-white">Track this order</Link>
          </section>
        ) : error && products.length === 0 ? (
          <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-white p-5 text-sm text-rose-700">{error}</p>
        ) : cartProducts.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-[#e1e6ef] bg-white p-7 text-center">
            <ShoppingBag className="mx-auto text-[#4163e8]" size={30} />
            <p className="mt-3 font-semibold">Your cart is empty.</p>
            <Link to="/" className="mt-4 inline-flex text-sm font-bold text-[#4163e8]">Browse products</Link>
          </section>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <section className="rounded-2xl border border-[#e1e6ef] bg-white p-5">
              <h2 className="font-serif text-xl font-bold">Items</h2>
              <div className="mt-4 divide-y divide-[#e8ebf1]">
                {cartProducts.map(({ productId, quantity, product }) => (
                  <div key={productId} className="flex gap-3 py-4 first:pt-0">
                    <img src={product!.image} alt="" className="h-16 w-16 rounded-lg bg-[#f0eee8] object-contain p-1" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{product!.name}</p>
                      <p className="mt-1 text-xs text-[#6d778c]">{formatGhs(product!.price)}{product!.maxPrice ? `–${formatGhs(product!.maxPrice)}` : ""} / {product!.unit}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" onClick={() => updateQuantity(productId, quantity - 1)} className="grid h-7 w-7 place-items-center rounded-full border" aria-label="Remove one">−</button>
                        <span className="min-w-5 text-center text-sm">{quantity}</span>
                        <button type="button" onClick={() => updateQuantity(productId, Math.min(25, quantity + 1))} disabled={quantity >= 25} className="grid h-7 w-7 place-items-center rounded-full border disabled:opacity-40" aria-label="Add one">+</button>
                        <button type="button" onClick={() => updateQuantity(productId, 0)} className="ml-auto text-xs font-semibold text-rose-600">Remove</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#e8ebf1] pt-4 text-sm font-bold">Minimum item estimate <span className="float-right">{formatGhs(minimumSubtotal)}</span></div>
              <p className="mt-2 text-xs leading-5 text-[#6d778c]">Some items have variable prices. Delivery and exact prices are confirmed on WhatsApp; this estimate is not a final total.</p>
            </section>

            <form onSubmit={submitOrder} className="space-y-3 rounded-2xl border border-[#e1e6ef] bg-white p-5">
              <h2 className="mb-2 font-serif text-xl font-bold">Delivery details</h2>
              <label className="block text-xs font-semibold">Full name<input name="fullName" required maxLength={100} className="mt-1.5 w-full rounded-lg border border-[#dbe0e9] px-3 py-2.5 text-sm" /></label>
              <label className="block text-xs font-semibold">WhatsApp phone<input name="phone" required type="tel" minLength={8} maxLength={24} className="mt-1.5 w-full rounded-lg border border-[#dbe0e9] px-3 py-2.5 text-sm" /></label>
              <label className="block text-xs font-semibold">Email (optional)<input name="email" type="email" maxLength={254} className="mt-1.5 w-full rounded-lg border border-[#dbe0e9] px-3 py-2.5 text-sm" /></label>
              <label className="block text-xs font-semibold">Town, city or delivery area<input name="deliveryArea" required maxLength={100} className="mt-1.5 w-full rounded-lg border border-[#dbe0e9] px-3 py-2.5 text-sm" /></label>
              <label className="block text-xs font-semibold">Delivery address<input name="deliveryAddress" required minLength={5} maxLength={500} className="mt-1.5 w-full rounded-lg border border-[#dbe0e9] px-3 py-2.5 text-sm" /></label>
              <label className="block text-xs font-semibold">Order note (optional)<textarea name="customerNote" maxLength={1000} rows={3} className="mt-1.5 w-full rounded-lg border border-[#dbe0e9] px-3 py-2.5 text-sm" /></label>
              {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
              <button disabled={busy || cartProducts.length === 0} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#4163e8] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
                {busy && <LoaderCircle size={16} className="animate-spin" />} Place pending WhatsApp order
              </button>
              <p className="text-xs leading-5 text-[#6d778c]">We’ll use these details to confirm product availability, exact prices and delivery by WhatsApp. No payment is collected here.</p>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
