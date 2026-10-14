import type { RequestHandler } from "express";
import { z } from "zod";

const orderQuerySchema = z.object({
  contact: z.enum(["1", "2"]),
  productId: z.coerce.number().int(),
  quantity: z.coerce.number().int().min(1).max(25),
});

const productDetails: Record<number, { name: string; price: number; unit: string }> = {
  11: { name: "Automatic ice sphere maker", price: 600, unit: "unit" },
  12: { name: "D1434 Toyota Hiace brake pads", price: 700, unit: "set" },
  13: { name: "Toyota engine oil filter 90915", price: 400, unit: "filter" },
  14: { name: "Automatic magnetic screen curtain", price: 150, unit: "curtain" },
  15: { name: "Amber truck warning light", price: 700, unit: "light" },
  16: { name: "Portable cooling & heating fan", price: 800, unit: "unit" },
  17: { name: "49-inch curved gaming monitor", price: 1500, unit: "monitor" },
};

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
  const product = productDetails[query.data.productId];
  if (!product) {
    res.status(404).json({ error: "product_not_found" });
    return;
  }

  const phone = normalizePhone(process.env[`WHATSAPP_ORDER_NUMBER_${query.data.contact}`]);
  if (!phone) {
    res.status(503).json({ error: "whatsapp_contact_not_configured" });
    return;
  }

  const total = product.price * query.data.quantity;
  const message = [
    "Hello, I would like to order:",
    `${query.data.quantity} × ${product.name} (${product.unit})`,
    `Listed total: GH₵${total.toFixed(2)}`,
    "Please confirm availability and delivery details.",
  ].join("\n");
  const destination = new URL(`https://wa.me/${phone}`);
  destination.searchParams.set("text", message);
  res.redirect(302, destination.toString());
};
