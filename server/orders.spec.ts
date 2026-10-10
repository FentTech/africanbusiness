import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listPaidOrders, recordPaidOrder } from "./orders";

const originalOrdersFile = process.env.ORDERS_FILE;
let temporaryDirectory: string;

afterEach(async () => {
  if (originalOrdersFile === undefined) delete process.env.ORDERS_FILE;
  else process.env.ORDERS_FILE = originalOrdersFile;
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("paid order storage", () => {
  it("assigns ascending order numbers and records each payment once", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "akwaaba-orders-"));
    process.env.ORDERS_FILE = path.join(temporaryDirectory, "orders.json");
    const order = {
      reference: "paystack-reference-1",
      email: "buyer@example.com",
      amount: 60000,
      currency: "GHS" as const,
      items: [{ productId: 11, productName: "Ice sphere maker", quantity: 1 }],
    };

    const first = await recordPaidOrder(order);
    const repeated = await recordPaidOrder(order);
    const second = await recordPaidOrder({ ...order, reference: "paystack-reference-2" });

    expect(first.order.orderNumber).toBe(1);
    expect(first.created).toBe(true);
    expect(repeated.order.orderNumber).toBe(1);
    expect(repeated.created).toBe(false);
    expect(second.order.orderNumber).toBe(2);
    expect((await listPaidOrders()).map(({ orderNumber }) => orderNumber)).toEqual([1, 2]);
  });
});
