import type { RequestHandler } from "express";
import { z } from "zod";

const messageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  product: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(4000),
});

export const handleSupportMessage: RequestHandler = async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_message" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    res.status(503).json({ error: "support_not_configured" });
    return;
  }

  const { name, email, product, message } = parsed.data;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "Akwaaba-Goods/1.0",
      },
      body: JSON.stringify({
        from,
        to: [process.env.SUPPORT_EMAIL ?? "greatfent1@gmail.com"],
        reply_to: email,
        subject: `Product question: ${product}`,
        text: `From: ${name} <${email}>\nProduct: ${product}\n\n${message}`,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      res.status(502).json({ error: "support_delivery_failed" });
      return;
    }

    res.status(200).json({ sent: true });
  } catch {
    res.status(502).json({ error: "support_delivery_failed" });
  }
};
