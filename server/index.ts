import "dotenv/config";
import express from "express";
import { handleDemo } from "./routes/demo";
import { handleSupportMessage } from "./routes/support";
import { handleWhatsAppOrder } from "./routes/whatsapp";
import { handleListOrders } from "./orders";

export function createServer() {
  const app = express();

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.use(express.urlencoded({ extended: true, limit: "8kb" }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.post("/api/support/message", handleSupportMessage);
  app.get("/api/orders/whatsapp", handleWhatsAppOrder);
  app.get("/api/admin/orders", handleListOrders);

  return app;
}
