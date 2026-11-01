import { afterEach, describe, expect, it, vi } from "vitest";
import { handleWhatsAppCartOrder } from "./whatsapp";

const originalEnvironment = {
  url: process.env.VITE_SUPABASE_URL,
  key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  phone: process.env.WHATSAPP_ORDER_NUMBER_1,
};

const createResponse = () => ({
  status: vi.fn().mockReturnThis(),
  send: vi.fn(),
  redirect: vi.fn(),
  json: vi.fn(),
});

afterEach(() => {
  if (originalEnvironment.url === undefined) delete process.env.VITE_SUPABASE_URL;
  else process.env.VITE_SUPABASE_URL = originalEnvironment.url;
  if (originalEnvironment.key === undefined) delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  else process.env.VITE_SUPABASE_PUBLISHABLE_KEY = originalEnvironment.key;
  if (originalEnvironment.phone === undefined) delete process.env.WHATSAPP_ORDER_NUMBER_1;
  else process.env.WHATSAPP_ORDER_NUMBER_1 = originalEnvironment.phone;
  vi.unstubAllGlobals();
});

describe("WhatsApp cart order handoff", () => {
  it("loads the saved order using its tracking token before redirecting", async () => {
    process.env.VITE_SUPABASE_URL = "https://store.example.test";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.WHATSAPP_ORDER_NUMBER_1 = "+233555010100";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      orderNumber: 84,
      fullName: "Saved Customer",
      phone: "+233555010101",
      email: null,
      deliveryArea: "Accra",
      deliveryAddress: "Saved address",
      customerNote: "Saved note",
      items: [{ productName: "Saved item", quantity: 2, minPriceGhs: 10, maxPriceGhs: 15 }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = createResponse();
    const trackingToken = "a".repeat(64);

    await handleWhatsAppCartOrder({
      body: { contact: "1", payload: JSON.stringify({ orderNumber: 84, trackingToken, fullName: "Spoofed Customer" }) },
    } as never, response as never, vi.fn());

    expect(fetchMock).toHaveBeenCalledWith("https://store.example.test/functions/v1/store-orders", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ action: "handoff", orderNumber: 84, trackingToken }),
    }));
    expect(response.redirect).toHaveBeenCalledWith(303, expect.stringContaining("https://wa.me/233555010100"));
    const redirectUrl = new URL(response.redirect.mock.calls[0][1]);
    expect(redirectUrl.searchParams.get("text")).toContain("Saved Customer");
    expect(redirectUrl.searchParams.get("text")).not.toContain("Spoofed Customer");
  });

  it("rejects invalid tracking tokens without calling the order service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = createResponse();

    await handleWhatsAppCartOrder({
      body: { contact: "1", payload: JSON.stringify({ orderNumber: 84, trackingToken: "invalid" }) },
    } as never, response as never, vi.fn());

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: "invalid_cart_order" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
