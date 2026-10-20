import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LoaderCircle, LogOut, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";

const adminEmail = "greatfent1@gmail.com";
const statuses = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];

type AdminProduct = {
  id: number;
  name: string;
  price_ghs: number;
  max_price_ghs: number | null;
  active: boolean;
  quantity_on_hand: number | null;
};

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<any>(null);
  const [authorized, setAuthorized] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);

  const loadDashboard = useCallback(async () => {
    const { data: productRows, error: productError } = await supabase
      .from("store_products")
      .select("id,name,price_ghs,max_price_ghs,active,store_inventory(quantity_on_hand)")
      .order("id");
    const { data: orderRows, error: orderError } = await supabase
      .from("store_orders")
      .select("*,store_customers(full_name,email,phone),store_order_items(id,product_name_snapshot,quantity,quoted_min_price_ghs,quoted_max_price_ghs,unit_price_ghs)")
      .order("created_at", { ascending: false })
      .order("id", { referencedTable: "store_order_items", ascending: true });
    const { data: inquiryRows, error: inquiryError } = await supabase
      .from("store_inquiries")
      .select("*")
      .order("created_at", { ascending: false });
    if (productError || orderError || inquiryError) {
      setMessage("Could not load store records. Check your admin permissions.");
      return;
    }
    setProducts((productRows ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      price_ghs: Number(row.price_ghs),
      max_price_ghs: row.max_price_ghs === null ? null : Number(row.max_price_ghs),
      active: row.active,
      quantity_on_hand: (Array.isArray(row.store_inventory) ? row.store_inventory[0] : row.store_inventory)?.quantity_on_hand ?? null,
    })));
    setOrders(orderRows ?? []);
    setInquiries(inquiryRows ?? []);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!session?.user?.id) {
        setAuthorized(false);
        return;
      }
      const { data, error } = await supabase
        .from("store_admins")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      const isAdmin = !error && Boolean(data);
      setAuthorized(isAdmin);
      if (isAdmin) await loadDashboard();
    };
    void checkAdmin();
  }, [session, loadDashboard]);

  const sendLoginLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (email.trim().toLowerCase() !== adminEmail) {
      setMessage("This email is not on the store-admin allowlist.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: adminEmail,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setMessage(error ? "Could not send the sign-in link. Please try again." : "Check the admin inbox for a secure sign-in link.");
  };

  const saveProduct = async (product: AdminProduct) => {
    const { error: productError } = await supabase.from("store_products").update({
      price_ghs: product.price_ghs,
      max_price_ghs: product.max_price_ghs,
      active: product.active,
      updated_at: new Date().toISOString(),
    }).eq("id", product.id);
    let inventoryError = null;
    if (product.quantity_on_hand !== null) {
      const result = await supabase.from("store_inventory").upsert({
        product_id: product.id,
        quantity_on_hand: product.quantity_on_hand,
        updated_at: new Date().toISOString(),
      });
      inventoryError = result.error;
    }
    setMessage(productError || inventoryError ? "Could not save product changes." : "Product and inventory saved.");
  };

  const updateOrder = async (order: any, status: string, deliveryFee: number | null, itemPrices: number[], paymentStatus: string, paymentMethod: string, paymentReference: string) => {
    if (deliveryFee === null || !Number.isFinite(deliveryFee) || deliveryFee < 0) {
      setMessage("Enter the confirmed delivery fee before confirming this order.");
      return;
    }
    const items = order.store_order_items ?? [];
    if (itemPrices.length !== items.length || itemPrices.some((price) => !Number.isFinite(price) || price < 0)) {
      setMessage("Enter a confirmed unit price for each item.");
      return;
    }
    if (paymentStatus !== "not_paid" && !paymentMethod) {
      setMessage("Select a payment method before recording payment.");
      return;
    }
    const { error } = await supabase.rpc("admin_update_store_order", {
      p_order_id: order.id,
      p_status: status,
      p_delivery_fee: deliveryFee,
      p_item_prices: itemPrices,
      p_payment_status: paymentStatus,
      p_payment_method: paymentMethod || null,
      p_payment_reference: paymentReference,
    });
    if (error) {
      setMessage("Could not update order.");
      return;
    }
    setMessage("Order updated.");
    await loadDashboard();
  };

  const updateInquiry = async (inquiryId: number, status: string) => {
    const { error } = await supabase.from("store_inquiries").update({ status, updated_at: new Date().toISOString() }).eq("id", inquiryId);
    if (error) {
      setMessage("Could not update inquiry.");
      return;
    }
    setInquiries((current) => current.map((inquiry) => inquiry.id === inquiryId ? { ...inquiry, status } : inquiry));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setAuthorized(false);
    setMessage("");
  };

  return (
    <main className="min-h-screen bg-[#f7f8fc] px-5 py-10 text-[#1d2942] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4"><div><Link to="/" className="text-sm font-semibold text-[#4163e8]">Akwaaba Goods</Link><h1 className="mt-2 font-serif text-4xl font-bold">Store admin</h1></div>{authorized && <button onClick={signOut} className="inline-flex items-center gap-2 rounded-full border border-[#dbe0e9] bg-white px-4 py-2 text-sm font-semibold"><LogOut size={15} /> Sign out</button>}</div>
        {message && <p role="status" className="mt-4 rounded-lg bg-white p-3 text-sm">{message}</p>}
        {!ready ? <div className="mt-8 flex items-center gap-2 text-sm"><LoaderCircle className="animate-spin" size={16} /> Loading…</div> : !session ? (
          <form onSubmit={sendLoginLink} className="mt-8 max-w-md space-y-4 rounded-2xl border border-[#e1e6ef] bg-white p-6">
            <h2 className="font-serif text-xl font-bold">Admin sign in</h2>
            <label className="block text-sm font-semibold">Admin email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#dbe0e9] px-3 py-2.5" /></label>
            <button className="w-full rounded-full bg-[#4163e8] px-5 py-3 text-sm font-bold text-white">Email me a secure sign-in link</button>
          </form>
        ) : !authorized ? <p className="mt-8 rounded-xl border border-[#e1e6ef] bg-white p-6">This signed-in account is not authorized to manage the store.</p> : (
          <div className="mt-8 space-y-10">
            <section><h2 className="font-serif text-2xl font-bold">Products and inventory</h2><p className="mt-1 text-sm text-[#69758a]">Blank stock means inventory has not been entered yet.</p><div className="mt-4 grid gap-3">{products.map((product) => <ProductEditor key={product.id} product={product} onChange={(next) => setProducts((current) => current.map((item) => item.id === next.id ? next : item))} onSave={saveProduct} />)}</div></section>
            <section><h2 className="font-serif text-2xl font-bold">Orders, delivery and payments</h2><p className="mt-1 text-sm text-[#69758a]">No online payments are collected; record the payment status after confirming with the customer.</p><div className="mt-4 grid gap-4">{orders.length === 0 ? <p className="rounded-xl border border-[#e1e6ef] bg-white p-5 text-sm">No orders yet.</p> : orders.map((order) => <OrderEditor key={order.id} order={order} onSave={updateOrder} />)}</div></section>
            <section><h2 className="font-serif text-2xl font-bold">Website inquiries</h2><div className="mt-4 grid gap-4">{inquiries.length === 0 ? <p className="rounded-xl border border-[#e1e6ef] bg-white p-5 text-sm">No inquiries yet.</p> : inquiries.map((inquiry) => <InquiryCard key={inquiry.id} inquiry={inquiry} onStatusChange={updateInquiry} />)}</div></section>
          </div>
        )}
      </div>
    </main>
  );
}

function ProductEditor({ product, onChange, onSave }: { product: AdminProduct; onChange: (product: AdminProduct) => void; onSave: (product: AdminProduct) => void }) {
  return <div className="grid gap-3 rounded-xl border border-[#e1e6ef] bg-white p-4 sm:grid-cols-[1fr_130px_130px_140px_auto] sm:items-center">
    <div className="min-w-0"><p className="truncate text-sm font-bold">{product.name}</p><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={product.active} onChange={(event) => onChange({ ...product, active: event.target.checked })} /> Listed in store</label></div>
    <label className="text-xs font-semibold">Min price GH₵<input type="number" min="0" step="0.01" value={product.price_ghs} onChange={(event) => onChange({ ...product, price_ghs: Number(event.target.value) })} className="mt-1 w-full rounded-lg border px-2 py-2" /></label>
    <label className="text-xs font-semibold">Max price GH₵<input type="number" min="0" step="0.01" value={product.max_price_ghs ?? ""} onChange={(event) => onChange({ ...product, max_price_ghs: event.target.value ? Number(event.target.value) : null })} className="mt-1 w-full rounded-lg border px-2 py-2" /></label>
    <label className="text-xs font-semibold">Stock<input type="number" min="0" step="1" value={product.quantity_on_hand ?? ""} placeholder="Not entered" onChange={(event) => onChange({ ...product, quantity_on_hand: event.target.value ? Number(event.target.value) : null })} className="mt-1 w-full rounded-lg border px-2 py-2" /></label>
    <button onClick={() => onSave(product)} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#4163e8] px-4 py-2.5 text-xs font-bold text-white"><Save size={14} /> Save</button>
  </div>;
}

function OrderEditor({ order, onSave }: { order: any; onSave: (order: any, status: string, deliveryFee: number | null, prices: number[], paymentStatus: string, paymentMethod: string, paymentReference: string) => void }) {
  const items = order.store_order_items ?? [];
  const [status, setStatus] = useState(order.status);
  const [deliveryFee, setDeliveryFee] = useState(order.delivery_fee_ghs === null ? "" : String(order.delivery_fee_ghs));
  const [prices, setPrices] = useState(items.map((item: any) => item.unit_price_ghs === null ? "" : String(item.unit_price_ghs)));
  const [paymentStatus, setPaymentStatus] = useState(order.payment_status ?? "not_paid");
  const [paymentMethod, setPaymentMethod] = useState(order.payment_method ?? "");
  const [paymentReference, setPaymentReference] = useState(order.payment_reference ?? "");
  const customer = order.store_customers;
  return <article className="rounded-xl border border-[#e1e6ef] bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-serif text-lg font-bold">Order #{order.order_number}</h3><p className="mt-1 text-xs text-[#69758a]">{new Date(order.created_at).toLocaleString()} · {customer?.full_name} · {customer?.phone}</p><p className="text-xs text-[#69758a]">{customer?.email ?? "No email"} · {order.delivery_area} · {order.delivery_address}</p></div><span className="rounded-full bg-[#eef1f8] px-3 py-1 text-xs font-bold capitalize">{String(order.status).replace(/_/g, " ")}</span></div>
    <div className="mt-4 grid gap-3">{items.map((item: any, index: number) => <label key={`${item.product_name_snapshot}-${index}`} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{item.quantity} × {item.product_name_snapshot} <span className="text-xs text-[#69758a]">({item.quoted_min_price_ghs}{item.quoted_max_price_ghs ? `–${item.quoted_max_price_ghs}` : ""} estimate)</span></span><span className="flex items-center gap-2 text-xs">Confirmed unit GH₵<input type="number" min="0" step="0.01" value={prices[index]} onChange={(event) => setPrices((current: string[]) => current.map((price, itemIndex) => itemIndex === index ? event.target.value : price))} className="w-24 rounded border px-2 py-1.5" /></span></label>)}</div>
    <p className="mt-3 text-sm font-bold">Confirmed total: {order.total_ghs === null ? "Not confirmed" : `GH₵${Number(order.total_ghs).toFixed(2)}`} · Payment: {String(order.payment_status ?? "not_paid").replace(/_/g, " ")}</p>
    <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[#e8ebf1] pt-4"><label className="text-xs font-semibold">Delivery fee GH₵<input type="number" min="0" step="0.01" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} className="mt-1 block w-28 rounded border px-2 py-2" /></label><label className="text-xs font-semibold">Order status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 block rounded border px-2 py-2">{statuses.map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}</select></label><label className="text-xs font-semibold">Payment status<select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} className="mt-1 block rounded border px-2 py-2"><option value="not_paid">Not paid</option><option value="paid">Paid</option><option value="refunded">Refunded</option></select></label>{paymentStatus !== "not_paid" && <><label className="text-xs font-semibold">Method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 block rounded border px-2 py-2"><option value="">Select method</option><option value="mobile_money">Mobile money</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label><label className="text-xs font-semibold">Reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={160} className="mt-1 block w-36 rounded border px-2 py-2" /></label></>}<button onClick={() => onSave(order, status, deliveryFee === "" ? null : Number(deliveryFee), prices.map((price: string) => price === "" ? NaN : Number(price)), paymentStatus, paymentMethod, paymentReference)} className="inline-flex items-center gap-2 rounded-full bg-[#4163e8] px-4 py-2.5 text-xs font-bold text-white"><Save size={14} /> Save order</button></div>
  </article>;
}

function InquiryCard({ inquiry, onStatusChange }: { inquiry: any; onStatusChange: (id: number, status: string) => void }) {
  return <article className="rounded-xl border border-[#e1e6ef] bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{inquiry.product_name}</h3><p className="mt-1 text-xs text-[#69758a]">{inquiry.customer_name} · <a href={`mailto:${inquiry.customer_email}`} className="text-[#4163e8]">{inquiry.customer_email}</a> · {new Date(inquiry.created_at).toLocaleString()}</p></div><select aria-label="Inquiry status" value={inquiry.status} onChange={(event) => onStatusChange(inquiry.id, event.target.value)} className="rounded border px-2 py-2 text-xs"><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></div>
    <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{inquiry.message}</p>
  </article>;
}
