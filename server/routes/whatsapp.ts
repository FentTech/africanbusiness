import type { RequestHandler } from "express";
import { z } from "zod";
import { products } from "../../shared/productCatalog";

const orderQuerySchema = z.object({
  contact: z.enum(["1", "2"]),
  productId: z.coerce.number().int(),
  quantity: z.coerce.number().int().min(1).max(25),
});

const normalizePhone = (value: string | undefined) => {
  if (!value || !/^(?:\+|00)?[1-9]\d{7,14}$/.test(value)) return null;
  return value.replace(/^\+/, "").replace(/^00/, "");
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
