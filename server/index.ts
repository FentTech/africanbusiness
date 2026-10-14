import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleSupportMessage } from "./routes/support";
import { handleWhatsAppOrder } from "./routes/whatsapp";
import { handleListOrders } from "./orders";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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
