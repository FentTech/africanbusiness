export type CartLine = { productId: number; quantity: number };

const cartKey = "akwaaba-cart";

export function readCart(): CartLine[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(cartKey) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((line): line is CartLine =>
      line && Number.isSafeInteger(line.productId) &&
      Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.quantity <= 25,
    );
  } catch {
    return [];
  }
}

export function writeCart(cart: CartLine[]) {
  localStorage.setItem(cartKey, JSON.stringify(cart));
}
