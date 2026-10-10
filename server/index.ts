import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleSupportMessage } from "./routes/support";
import { handleInitializePayment, handlePaystackWebhook, handleVerifyPayment } from "./routes/payments";
import { handleListOrders } from "./orders";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.post("/api/payments/paystack/webhook", express.raw({ type: "application/json", limit: "1mb" }), handlePaystackWebhook);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.post("/api/support/message", handleSupportMessage);
  app.post("/api/payments/paystack/initialize", handleInitializePayment);
  app.get("/api/payments/paystack/verify", handleVerifyPayment);
  app.get("/api/admin/orders", handleListOrders);

  return app;
}
