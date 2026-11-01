import type { RequestHandler } from "express";
import { z } from "zod";
import { products } from "../../shared/productCatalog";

const orderQuerySchema = z.object({
  contact: z.enum(["1", "2"]),
  productId: z.coerce.number().int(),
  quantity: z.coerce.number().int().min(1).max(25),
});

const cartOrderSchema = z.object({
  contact: z.enum(["1", "2"]),
  orderNumber: z.number().int().positive(),
  trackingToken: z.string().regex(/^[a-f0-9]{64}$/),
});

const savedOrderSchema = z.object({
  orderNumber: z.number().int().positive(),
  fullName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  deliveryArea: z.string(),
  deliveryAddress: z.string(),
  customerNote: z.string(),
  items: z.array(z.object({
    productName: z.string(),
    quantity: z.number().int().positive(),
    minPriceGhs: z.number().nonnegative(),
    maxPriceGhs: z.number().nonnegative().nullable(),
  })).min(1),
});

const normalizePhone = (value: string | undefined) => {
  if (!value || !/^(?:\+|00)?[1-9]\d{7,14}$/.test(value)) return null;
  return value.replace(/^\+/, "").replace(/^00/, "");
};

export const handleWhatsAppCartOrder: RequestHandler = async (req, res) => {
  let payload = req.body;
  if (typeof req.body?.payload === "string") {
    try {
      payload = { ...JSON.parse(req.body.payload), contact: req.body.contact };
    } catch {
      res.status(400).json({ error: "invalid_cart_order" });
      return;
    }
  }
  const parsed = cartOrderSchema.safeParse(payload);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_cart_order" });
    return;
  }

  const phone = normalizePhone(process.env[`WHATSAPP_ORDER_NUMBER_${parsed.data.contact}`])
    ?? normalizePhone(process.env.WHATSAPP_ORDER_NUMBER_1);
  if (!phone) {
    res.status(503).send("The store’s WhatsApp contact is not configured. Your order is still saved and visible to the owner in admin.");
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    res.status(503).send("Order handoff is temporarily unavailable. Your order is saved and visible to the owner.");
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/store-orders`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "handoff", orderNumber: parsed.data.orderNumber, trackingToken: parsed.data.trackingToken }),
    });
  } catch {
    res.status(503).send("Order handoff is temporarily unavailable. Your order is saved and visible to the owner.");
    return;
  }
  if (!response.ok) {
    res.status(response.status === 404 ? 404 : 503).send("The saved order could not be verified. It remains visible to the owner.");
    return;
  }
  const savedOrder = savedOrderSchema.safeParse(await response.json());
  if (!savedOrder.success) {
    res.status(503).send("Order handoff is temporarily unavailable. Your order is saved and visible to the owner.");
    return;
  }

  const order = savedOrder.data;
  const items = order.items.map((item) =>
    `${item.quantity} × ${item.productName} — ${item.maxPriceGhs === null ? `GH₵${item.minPriceGhs.toFixed(2)}` : `GH₵${item.minPriceGhs.toFixed(2)}–GH₵${item.maxPriceGhs.toFixed(2)} (confirm exact price)`}`
  );
  const message = [
    `New website cart order #${order.orderNumber} (saved pending)`,
    `Customer: ${order.fullName}`,
    `WhatsApp: ${order.phone}`,
    order.email ? `Email: ${order.email}` : null,
    `Delivery area: ${order.deliveryArea}`,
    `Address: ${order.deliveryAddress}`,
    order.customerNote ? `Note: ${order.customerNote}` : null,
    "Items:",
    ...items,
    "Please confirm availability, exact item prices, and the delivery fee with the customer.",
  ].filter(Boolean).join("\n");
  const destination = new URL(`https://wa.me/${phone}`);
  destination.searchParams.set("text", message);
  res.redirect(303, destination.toString());
};

export const handleWhatsAppOrder: RequestHandler = (req, res) => {
  const query = orderQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "invalid_order_request" });
    return;
  }
  const product = products.find(({ id }) => id === query.data.productId);
  if (!product) {
    res.status(404).json({ error: "product_not_found" });
    return;
  }
  if (query.data.quantity < (product.minimumOrder ?? 1)) {
    res.status(400).json({ error: "minimum_order_quantity_not_met", minimumQuantity: product.minimumOrder });
    return;
  }

  const phone = normalizePhone(process.env[`WHATSAPP_ORDER_NUMBER_${query.data.contact}`]);
  if (!phone) {
    res.status(503).json({ error: "whatsapp_contact_not_configured" });
    return;
  }

  const total = product.price * query.data.quantity;
  const priceLine = product.maxPrice
    ? `Price range: GH₵${product.price.toFixed(2)}–GH₵${product.maxPrice.toFixed(2)} per ${product.unit}. Please confirm the exact price and total for the selected variant.`
    : `Listed total: GH₵${total.toFixed(2)}`;
  const message = [
    "Hello, I would like to order:",
    `${query.data.quantity} × ${product.name} (${product.unit})`,
    priceLine,
    "Please confirm availability and delivery details.",
  ].join("\n");
  const destination = new URL(`https://wa.me/${phone}`);
  destination.searchParams.set("text", message);
  res.redirect(302, destination.toString());
};
