import { createHmac, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { z } from "zod";
import { recordPaidOrder, sendOrderNotification } from "../orders";

const checkoutSchema = z.object({
  email: z.string().trim().email().max(254),
  items: z.array(z.object({
    productId: z.number().int(),
    quantity: z.number().int().min(1).max(25),
  })).min(1).max(20),
});

const productPricesGhs: Record<number, number> = {
  11: 600,
  12: 700,
  13: 400,
  14: 150,
  15: 700,
  16: 800,
  17: 1500,
};

const productNames: Record<number, string> = {
  11: "Ice sphere maker",
  12: "Toyota brake pads",
  13: "Toyota engine oil filter",
  14: "Automatic magnetic screen curtain",
  15: "Amber truck warning lights",
  16: "Cooling and heating fan",
  17: "Gaming monitor",
};

const paystackTransactionSchema = z.object({
  status: z.boolean(),
  data: z.object({
    authorization_url: z.string().url(),
    reference: z.string().min(1),
  }),
});

export const handleInitializePayment: RequestHandler = async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_checkout" });
    return;
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const appUrl = process.env.PUBLIC_APP_URL;
  if (!secretKey || !appUrl) {
    res.status(503).json({ error: "payments_not_configured" });
    return;
  }

  const items = parsed.data.items;
  if (items.some(({ productId }) => productPricesGhs[productId] === undefined)) {
    res.status(400).json({ error: "unknown_product" });
    return;
  }

  const amount = items.reduce(
    (total, { productId, quantity }) => total + productPricesGhs[productId] * quantity * 100,
    0,
  );

  let callbackUrl: string;
  try {
    callbackUrl = new URL("/?payment=paystack", appUrl).toString();
  } catch {
    res.status(503).json({ error: "payments_not_configured" });
    return;
  }

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: parsed.data.email,
        amount,
        currency: "GHS",
        channels: ["mobile_money", "card"],
        callback_url: callbackUrl,
        metadata: { customer_email: parsed.data.email, order_items: items },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body: unknown = await response.json();
    const transaction = paystackTransactionSchema.safeParse(body);
    const authorizationUrl = transaction.success ? new URL(transaction.data.data.authorization_url) : null;
    if (!response.ok || !transaction.success || !transaction.data.status || authorizationUrl?.hostname !== "checkout.paystack.com") {
      res.status(502).json({ error: "payment_initialization_failed" });
      return;
    }

    res.status(200).json({ authorizationUrl: authorizationUrl.toString() });
  } catch {
    res.status(502).json({ error: "payment_initialization_failed" });
  }
};

const paymentReferenceSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/);
const verifiedTransactionSchema = z.object({
  status: z.string(),
  currency: z.string(),
  amount: z.number().int().nonnegative(),
  reference: z.string(),
  customer: z.object({ email: z.string().email() }).optional(),
  metadata: z.object({
    customer_email: z.string().email(),
    order_items: z.array(z.object({
      productId: z.number().int(),
      quantity: z.number().int().min(1).max(25),
    })).min(1).max(20),
  }),
});

const verificationSchema = z.object({ status: z.boolean(), data: verifiedTransactionSchema });

const persistSuccessfulTransaction = async (transaction: z.infer<typeof verifiedTransactionSchema>) => {
  if (transaction.status !== "success" || transaction.currency !== "GHS") return { paid: false as const };
  const items = transaction.metadata.order_items;
  if (items.some(({ productId }) => productPricesGhs[productId] === undefined)) throw new Error("unknown_order_product");
  const expectedAmount = items.reduce((total, item) => total + productPricesGhs[item.productId] * item.quantity * 100, 0);
  if (transaction.amount !== expectedAmount) throw new Error("payment_order_mismatch");

  const recorded = await recordPaidOrder({
    reference: transaction.reference,
    email: transaction.metadata.customer_email,
    amount: transaction.amount,
    currency: "GHS",
    items: items.map((item) => ({ ...item, productName: productNames[item.productId] })),
  });
  const notificationSent = recorded.created ? await sendOrderNotification(recorded.order) : null;
  return { paid: true as const, orderNumber: recorded.order.orderNumber, notificationSent };
};

const webhookEventSchema = z.object({ event: z.string(), data: z.unknown() });

export const handlePaystackWebhook: RequestHandler = async (req, res) => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    res.status(503).json({ error: "payments_not_configured" });
    return;
  }

  const signature = req.get("x-paystack-signature") ?? "";
  if (!Buffer.isBuffer(req.body) || !/^[a-f0-9]{128}$/i.test(signature)) {
    res.status(401).json({ error: "invalid_webhook_signature" });
    return;
  }
  const expectedSignature = createHmac("sha512", secretKey).update(req.body).digest();
  const receivedSignature = Buffer.from(signature, "hex");
  if (expectedSignature.length !== receivedSignature.length || !timingSafeEqual(expectedSignature, receivedSignature)) {
    res.status(401).json({ error: "invalid_webhook_signature" });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(req.body.toString("utf8"));
  } catch {
    res.status(400).json({ error: "invalid_webhook_payload" });
    return;
  }
  const event = webhookEventSchema.safeParse(body);
  if (!event.success) {
    res.status(400).json({ error: "invalid_webhook_payload" });
    return;
  }
  if (event.data.event !== "charge.success") {
    res.status(200).json({ received: true });
    return;
  }

  const transaction = verifiedTransactionSchema.safeParse(event.data.data);
  if (!transaction.success) {
    res.status(400).json({ error: "invalid_webhook_payload" });
    return;
  }
  try {
    await persistSuccessfulTransaction(transaction.data);
    res.status(200).json({ received: true });
  } catch {
    res.status(503).json({ error: "order_recording_failed" });
  }
};

export const handleVerifyPayment: RequestHandler = async (req, res) => {
  const reference = paymentReferenceSchema.safeParse(req.query.reference);
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!reference.success) {
    res.status(400).json({ error: "invalid_reference" });
    return;
  }
  if (!secretKey) {
    res.status(503).json({ error: "payments_not_configured" });
    return;
  }

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference.data)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(15000),
    });
    const body: unknown = await response.json();
    const verification = verificationSchema.safeParse(body);
    if (!response.ok || !verification.success || !verification.data.status) {
      res.status(502).json({ error: "payment_verification_failed" });
      return;
    }

    const transaction = verification.data.data;
    if (transaction.reference !== reference.data) {
      res.status(502).json({ error: "payment_order_mismatch" });
      return;
    }

    const result = await persistSuccessfulTransaction(transaction);
    res.status(200).json({
      ...result,
      recorded: result.paid,
      amount: transaction.amount,
      currency: transaction.currency,
    });
  } catch {
    res.status(502).json({ error: "payment_verification_failed" });
  }
};
