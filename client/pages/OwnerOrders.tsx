import { useState } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";

type Order = {
  orderNumber: number;
  reference: string;
  email: string;
  amount: number;
  currency: "GHS";
  items: { productName: string; quantity: number }[];
  createdAt: string;
};

const OwnerOrders = () => {
  const [token, setToken] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadOrders = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json() as { orders?: Order[]; error?: string };
      if (!response.ok || !data.orders) {
        setError(response.status === 401 ? "That owner access token is not valid." : "Order history is unavailable right now.");
        return;
      }
      setOrders(data.orders);
    } catch {
      setError("Could not connect to the order service. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f8fc] px-4 py-10 text-[#1d2942] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="text-sm font-bold text-[#4163e8]">Akwaaba Goods</a>
        <div className="mt-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#e8edfb] text-[#4163e8]"><LockKeyhole size={19} /></span>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#778174]">Owner area</p><h1 className="font-serif text-3xl font-bold">Paid orders</h1></div>
        </div>

        <form onSubmit={loadOrders} className="mt-7 flex flex-col gap-3 rounded-xl border border-[#e1e6ef] bg-white p-4 sm:flex-row">
          <input type="password" required autoComplete="current-password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Owner access token" aria-label="Owner access token" className="h-11 min-w-0 flex-1 rounded-lg border border-[#e1e6ef] px-3 text-sm outline-none focus:border-[#4163e8]" />
          <button type="submit" disabled={loading} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#4163e8] px-5 text-sm font-bold text-white disabled:opacity-60"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />{loading ? "Loading orders…" : orders ? "Refresh orders" : "View orders"}</button>
        </form>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {orders && <section aria-live="polite" className="mt-7">
          <p className="mb-3 text-sm text-[#778174]">{orders.length} paid {orders.length === 1 ? "order" : "orders"}, oldest first.</p>
          {orders.length === 0 ? <div className="rounded-xl border border-[#e1e6ef] bg-white p-8 text-center text-sm text-[#778174]">No paid orders yet.</div> : <div className="space-y-3">{orders.map((order) => <article key={order.reference} className="rounded-xl border border-[#e1e6ef] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#edf0f5] pb-3">
              <div><h2 className="font-serif text-xl font-bold">Order #{order.orderNumber}</h2><p className="mt-1 text-xs text-[#778174]">{new Date(order.createdAt).toLocaleString()}</p></div>
              <p className="text-lg font-bold text-[#4163e8]">GH₵ {(order.amount / 100).toFixed(2)}</p>
            </div>
            <p className="mt-3 text-sm">{order.email}</p>
            <ul className="mt-2 space-y-1 text-sm text-[#52604e]">{order.items.map((item, index) => <li key={`${order.reference}-${index}`}>{item.quantity} × {item.productName}</li>)}</ul>
            <p className="mt-3 break-all text-[11px] text-[#858a7e]">Payment reference: {order.reference}</p>
          </article>)}</div>}
        </section>}
      </div>
    </main>
  );
};

export default OwnerOrders;
