import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const sha256Hex = async (ip: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(503, { error: "orders_not_configured" });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "invalid_request" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) {
    const { data: allowed, error } = await supabase.rpc("consume_store_order_rate_limit", {
      p_ip_hash: await sha256Hex(ip),
    });
    if (error) return json(503, { error: "orders_not_configured" });
    if (!allowed) return json(429, { error: "too_many_requests" });
  }

  if (payload.action === "create") {
    const items = payload.items;
    const validItems = Array.isArray(items) && items.length > 0 && items.length <= 20 && items.every((item) =>
      item && typeof item === "object" &&
      Number.isSafeInteger((item as Record<string, unknown>).productId) &&
      Number.isSafeInteger((item as Record<string, unknown>).quantity) &&
      (item as Record<string, number>).quantity >= 1 &&
      (item as Record<string, number>).quantity <= 25
    );
    if (
      typeof payload.fullName !== "string" ||
      typeof payload.phone !== "string" ||
      typeof payload.deliveryArea !== "string" ||
      typeof payload.deliveryAddress !== "string" ||
      (payload.email !== null && payload.email !== undefined && typeof payload.email !== "string") ||
      (payload.customerNote !== undefined && typeof payload.customerNote !== "string") ||
      !validItems
    ) return json(400, { error: "invalid_order" });

    const { data, error } = await supabase.rpc("place_store_order", {
      p_full_name: payload.fullName,
      p_email: payload.email ?? null,
      p_phone: payload.phone,
      p_delivery_area: payload.deliveryArea,
      p_delivery_address: payload.deliveryAddress,
      p_customer_note: payload.customerNote ?? "",
      p_items: items,
    });
    if (error) return json(400, { error: "order_could_not_be_created" });
    return json(201, data);
  }

  if (payload.action === "inquiry") {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const product = typeof payload.product === "string" ? payload.product.trim() : "";
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    if (
      name.length < 1 || name.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      product.length < 1 || product.length > 160 ||
      message.length < 1 || message.length > 4000
    ) return json(400, { error: "invalid_inquiry" });

    const { data, error } = await supabase.from("store_inquiries").insert({
      customer_name: name,
      customer_email: email,
      product_name: product,
      message,
    }).select("id").single();
    if (error) return json(503, { error: "inquiry_unavailable" });
    return json(201, { saved: true, inquiryId: data.id });
  }

  if (payload.action === "track") {
    const orderNumber = Number(payload.orderNumber);
    const trackingToken = payload.trackingToken;
    if (!Number.isSafeInteger(orderNumber) || orderNumber < 1 || typeof trackingToken !== "string" || !/^[a-f0-9]{64}$/.test(trackingToken)) {
      return json(400, { error: "invalid_tracking_details" });
    }
    const tokenHash = await sha256Hex(trackingToken);
    const { data, error } = await supabase
      .from("store_orders")
      .select("id,order_number,status,created_at,delivery_area,subtotal_ghs,delivery_fee_ghs,total_ghs,store_order_items(product_name_snapshot,quantity,quoted_min_price_ghs,quoted_max_price_ghs,unit_price_ghs)")
      .eq("order_number", orderNumber)
      .eq("tracking_token_hash", tokenHash)
      .maybeSingle();
    if (error) return json(503, { error: "tracking_unavailable" });
    if (!data) return json(404, { error: "order_not_found" });
    return json(200, {
      orderNumber: data.order_number,
      status: data.status,
      createdAt: data.created_at,
      deliveryArea: data.delivery_area,
      subtotalGhs: data.subtotal_ghs,
      deliveryFeeGhs: data.delivery_fee_ghs,
      totalGhs: data.total_ghs,
      items: data.store_order_items.map((item) => ({
        name: item.product_name_snapshot,
        quantity: item.quantity,
        minimumPriceGhs: item.quoted_min_price_ghs,
        maximumPriceGhs: item.quoted_max_price_ghs,
        confirmedUnitPriceGhs: item.unit_price_ghs,
      })),
    });
  }

  return json(400, { error: "invalid_action" });
});
