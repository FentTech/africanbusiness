import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { z } from "zod";

const orderItemSchema = z.object({
  productId: z.number().int(),
  productName: z.string(),
  quantity: z.number().int().min(1),
});

const orderSchema = z.object({
  orderNumber: z.number().int().positive(),
  reference: z.string(),
  email: z.string().email(),
  amount: z.number().int().nonnegative(),
  currency: z.literal("GHS"),
  items: z.array(orderItemSchema),
  createdAt: z.string(),
});

export type PaidOrder = z.infer<typeof orderSchema>;

const ordersFile = () => process.env.ORDERS_FILE ?? path.join(process.cwd(), "data", "orders.json");
let writeQueue = Promise.resolve();

const readOrders = async (): Promise<PaidOrder[]> => {
  try {
    const stored = JSON.parse(await readFile(ordersFile(), "utf8")) as unknown;
    return z.array(orderSchema).parse(stored);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};

export const recordPaidOrder = (order: Omit<PaidOrder, "orderNumber" | "createdAt">) => {
  const operation = writeQueue.then(async () => {
    const orders = await readOrders();
    const existing = orders.find((item) => item.reference === order.reference);
    if (existing) return { order: existing, created: false };

    const record = orderSchema.parse({
      ...order,
      orderNumber: Math.max(0, ...orders.map((item) => item.orderNumber)) + 1,
      createdAt: new Date().toISOString(),
    });
    const file = ordersFile();
    await mkdir(path.dirname(file), { recursive: true });
    const temporaryFile = `${file}.${process.pid}.tmp`;
    await writeFile(temporaryFile, JSON.stringify([...orders, record], null, 2), { mode: 0o600 });
    await rename(temporaryFile, file);
    return { order: record, created: true };
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
};

export const listPaidOrders = async () => (await readOrders()).sort((a, b) => a.orderNumber - b.orderNumber);

export const sendOrderNotification = async (order: PaidOrder) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return false;

  const itemSummary = order.items.map((item) => `${item.quantity} × ${item.productName}`).join("\n");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [process.env.SUPPORT_EMAIL ?? "greatfent1@gmail.com"],
        subject: `Order #${order.orderNumber} paid — Akwaaba Goods`,
        text: `Order #${order.orderNumber}\nPayment reference: ${order.reference}\nCustomer: ${order.email}\nTotal: GH₵${(order.amount / 100).toFixed(2)}\n\nProducts:\n${itemSummary}`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const handleListOrders: RequestHandler = async (req, res) => {
  const adminToken = process.env.ORDERS_ADMIN_TOKEN;
  if (!adminToken) {
    res.status(503).json({ error: "orders_access_not_configured" });
    return;
  }

  const authorization = req.get("authorization") ?? "";
  const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expected = Buffer.from(adminToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    res.status(200).json({ orders: await listPaidOrders() });
  } catch {
    res.status(500).json({ error: "orders_unavailable" });
  }
};
