import { supabase } from "@/lib/supabase";
import type { Product } from "@shared/productCatalog";

export async function fetchStoreProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("store_products")
    .select("*")
    .eq("active", true)
    .order("id");
  if (error) throw error;
  return data.map((product) => ({
    id: product.id,
    name: product.name,
    subtitle: product.subtitle,
    price: Number(product.price_ghs),
    maxPrice: product.max_price_ghs === null ? undefined : Number(product.max_price_ghs),
    unit: product.unit,
    minimumOrder: product.minimum_order,
    category: product.category,
    location: product.location,
    image: product.image_url,
    gallery: product.gallery_urls.length ? product.gallery_urls : undefined,
    videoUrl: product.video_url ?? "",
    videoLabel: product.video_label ?? undefined,
    badge: product.badge ?? undefined,
    rating: product.rating ?? undefined,
  }));
}
