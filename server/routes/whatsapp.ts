import type { RequestHandler } from "express";
import { z } from "zod";

const orderQuerySchema = z.object({
  contact: z.enum(["1", "2"]),
  productId: z.coerce.number().int(),
  quantity: z.coerce.number().int().min(1).max(25),
});

const productDetails: Record<number, { name: string; price: number; maxPrice?: number; unit: string; minimumOrder?: number }> = {
  11: { name: "Automatic ice sphere maker", price: 600, unit: "unit" },
  12: { name: "D1434 Toyota Hiace brake pads", price: 700, unit: "set" },
  13: { name: "Toyota engine oil filter 90915", price: 400, unit: "filter" },
  14: { name: "Automatic magnetic screen curtain", price: 150, unit: "curtain" },
  15: { name: "Amber truck warning light", price: 700, unit: "light" },
  16: { name: "Portable Air Conditioner Cooling & Heating", price: 5700, unit: "piece" },
  17: { name: "49-inch curved gaming monitor", price: 1500, unit: "monitor" },
  18: { name: "Darkme Easy Bag 2Pcs Lip Combo", price: 70, unit: "piece", minimumOrder: 3 },
  19: { name: "HD Lace Front Human Hair Wig", price: 500, unit: "piece" },
  20: { name: "Torlin Swivel-Cord Hair Dryer", price: 480, unit: "unit" },
  21: { name: "YANAN 800W Low-Temperature Wig Dryer", price: 1800, unit: "piece" },
  22: { name: "Toyota D241 Front Ceramic Brake Pads", price: 250, maxPrice: 500, unit: "piece" },
  23: { name: "Toyota Engine Oil Filter 90915 Series", price: 30, maxPrice: 80, unit: "piece" },
  24: { name: "Toyota Engine Air Filter 17801", price: 50, maxPrice: 120, unit: "piece" },
  25: { name: "Front & Rear Hydraulic Shock Absorber", price: 200, maxPrice: 700, unit: "piece" },
  26: { name: "Toyota Corolla Rear Wheel Hub Unit", price: 150, maxPrice: 400, unit: "piece" },
  27: { name: "Oil Filter for Toyota Honda Hunydai Nissan Ford Isuzu Benz Bmw Vw Mazda Volvo Buick Mitsubishi Chevrolet Citroen", price: 30, maxPrice: 90, unit: "piece" },
  28: { name: "New Air Conditioner Filter Pipe and Box for Hyundai Models Elantra 2017 Accent I10 2009 H100 Genesis Coupe 2012", price: 50, maxPrice: 150, unit: "piece" },
  29: { name: "Wholesale Suspension Front and Rear Shock Absorbers 4700 for Toyota Cruiser Hyundai KIA SORENTO 2011-13 54650-0W550 335620", price: 300, maxPrice: 1000, unit: "piece" },
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
