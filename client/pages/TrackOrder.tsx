import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, LoaderCircle } from "lucide-react";

const orderApi = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/store-orders`;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function TrackOrder() {
  const location = useLocation();
  const state = location.state as { orderNumber?: number; trackingToken?: string } | null;
  const [orderNumber, setOrderNumber] = useState(state?.orderNumber?.toString() ?? "");
  const [trackingToken, setTrackingToken] = useState(state?.trackingToken ?? "");
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const track = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setOrder(null);
    try {
      const response = await fetch(orderApi, {
        method: "POST",
        headers: { apikey: publicKey, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "track", orderNumber, trackingToken }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "tracking_failed");
      setOrder(result);
    } catch {
      setError("We couldn’t find that order. Check your order number and private tracking code.");
    } finally {
      setBusy(false);
    }
  };

  const items = Array.isArray(order?.items) ? order.items as Record<string, unknown>[] : [];

  return (
    <main className="min-h-screen bg-[#f7f8fc] px-5 py-10 text-[#1d2942] sm:px-8">
      <div className="mx-auto max-w-xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#4163e8]"><ArrowLeft size={16} /> Store</Link>
        <h1 className="mt-6 font-serif text-4xl font-bold">Track your order</h1>
        <p className="mt-2 text-sm text-[#69758a]">Use the order number and private tracking code shown after you placed the order.</p>
        <form onSubmit={track} className="mt-6 space-y-4 rounded-2xl border border-[#e1e6ef] bg-white p-6">
          <label className="block text-sm font-semibold">Order number<input required inputMode="numeric" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#dbe0e9] px-3 py-2.5" /></label>
          <label className="block text-sm font-semibold">Private tracking code<input required minLength={64} maxLength={64} value={trackingToken} onChange={(event) => setTrackingToken(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#dbe0e9] px-3 py-2.5 font-mono text-xs" /></label>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#4163e8] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
            {busy && <LoaderCircle size={16} className="animate-spin" />} Find order
          </button>
        </form>
        {order && <section className="mt-5 rounded-2xl border border-[#e1e6ef] bg-white p-6">
          <div className="flex items-center justify-between gap-4"><h2 className="font-serif text-xl font-bold">Order #{String(order.orderNumber)}</h2><span className="rounded-full bg-[#eef1f8] px-3 py-1 text-xs font-bold capitalize">{String(order.status).replace(/_/g, " ")}</span></div>
          <p className="mt-3 text-sm text-[#69758a]">Delivery: {String(order.deliveryArea)}</p>
          <ul className="mt-4 space-y-3 border-t border-[#e8ebf1] pt-4">{items.map((item, index) => <li key={index} className="flex justify-between gap-3 text-sm"><span>{String(item.quantity)} × {String(item.name)}</span><span>{item.maximumPriceGhs ? `GH₵${Number(item.minimumPriceGhs).toFixed(2)}–${Number(item.maximumPriceGhs).toFixed(2)}` : `GH₵${Number(item.minimumPriceGhs).toFixed(2)}`}</span></li>)}</ul>
          <p className="mt-4 text-xs text-[#69758a]">Exact product prices and delivery fees are confirmed by WhatsApp before the order is confirmed.</p>
        </section>}
      </div>
    </main>
  );
}
