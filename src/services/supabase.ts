// Supabase client + data access for Monada Store.
//
// The store runs fully offline on localStorage and upgrades to Supabase the
// moment credentials exist, either in localStorage (set from the Admin Portal)
// or via VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time.
//
// Every function here is safe to call when Supabase is not configured: it
// returns a neutral value and the app keeps working locally.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ClothingProduct, ProductReview } from '../types';
import { StoreConfig } from '../config/storeConfig';

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  isConnected: boolean;
}

const LS_URL = 'monada_supabase_url';
const LS_KEY = 'monada_supabase_key';

export const DEFAULT_SUPABASE_CONFIG: SupabaseConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  isConnected: Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  ),
};

/** localStorage overrides the build-time env, so the admin can configure at runtime. */
export function readSupabaseConfig(): SupabaseConfig {
  const supabaseUrl = (
    localStorage.getItem(LS_URL) || DEFAULT_SUPABASE_CONFIG.supabaseUrl || ''
  ).trim();
  const supabaseAnonKey = (
    localStorage.getItem(LS_KEY) || DEFAULT_SUPABASE_CONFIG.supabaseAnonKey || ''
  ).trim();
  return {
    supabaseUrl,
    supabaseAnonKey,
    isConnected: Boolean(supabaseUrl && supabaseAnonKey),
  };
}

let cached: { url: string; key: string; client: SupabaseClient } | null = null;

/** Returns a client, or null when Supabase is not configured. */
export function getSupabaseClient(): SupabaseClient | null {
  const { supabaseUrl, supabaseAnonKey } = readSupabaseConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (cached && cached.url === supabaseUrl && cached.key === supabaseAnonKey) {
    return cached.client;
  }
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // The admin session must survive a reload, a new tab, and opening
      // /#admin in a fresh context. With persistSession disabled the session
      // lived only in memory, so a reload left the app writing as `anon` and
      // every catalog write was silently rejected by RLS.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'monada_auth_session',
    },
  });
  cached = { url: supabaseUrl, key: supabaseAnonKey, client };
  return client;
}

/** Call after credentials change so the next getSupabaseClient() rebuilds. */
export function resetSupabaseClient(): void {
  cached = null;
  // A session belongs to one project: drop it so a new URL/key never tries to
  // reuse a token minted by the old one.
  try {
    localStorage.removeItem('monada_auth_session');
  } catch {
    /* storage unavailable: nothing persisted to clear */
  }
}

// ---------------------------------------------------------------------------
// Row mapping (snake_case columns <-> camelCase app types)
// ---------------------------------------------------------------------------

interface ProductRow {
  id: number;
  name: string;
  series: string | null;
  price: number;
  size: string | null;
  sizes: string[] | null;
  colors: { name: string; hex: string }[] | null;
  description: string | null;
  image_url: string;
  gallery: string[] | null;
  categories: string[] | null;
  is_favorite: boolean | null;
  rating: number | null;
  review_count: number | null;
  reviews: ProductReview[] | null;
}

const rowToProduct = (row: ProductRow): ClothingProduct => ({
  id: Number(row.id),
  name: row.name,
  series: row.series ?? '',
  price: Number(row.price),
  size: row.size ?? row.sizes?.[0] ?? 'M',
  sizes: row.sizes ?? ['S', 'M', 'L', 'XL'],
  colors: row.colors ?? [],
  description: row.description ?? '',
  imageUrl: row.image_url,
  gallery: row.gallery?.length ? row.gallery : [row.image_url],
  categories: row.categories ?? [],
  isFavorite: Boolean(row.is_favorite),
  rating: row.rating ?? undefined,
  reviewCount: row.review_count ?? undefined,
  reviews: row.reviews ?? undefined,
});

const productToRow = (product: ClothingProduct) => ({
  id: product.id,
  name: product.name,
  series: product.series,
  price: product.price,
  size: product.size,
  sizes: product.sizes,
  colors: product.colors,
  description: product.description,
  image_url: product.imageUrl,
  gallery: product.gallery,
  categories: product.categories,
  is_favorite: product.isFavorite,
  rating: product.rating ?? null,
  review_count: product.reviewCount ?? null,
  reviews: product.reviews ?? null,
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * Returns the remote catalog, `[]` when the table is empty, or `null` when
 * Supabase is not configured or the read failed (caller should fall back).
 */
export async function fetchProducts(): Promise<ClothingProduct[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from('products')
    .select('*')
    .order('id', { ascending: true });
  if (error) {
    console.warn('[supabase] fetchProducts failed:', error.message);
    return null;
  }
  return (data as ProductRow[]).map(rowToProduct);
}

/** Upserts the whole catalog and prunes rows that no longer exist locally. */
/**
 * Upserts the given catalog rows.
 *
 * Deliberately does NOT prune rows missing from the list: a browser holding a
 * stale catalog would otherwise delete products that were added from another
 * device. Removal is explicit, via deleteProduct().
 */
export async function saveProducts(products: ClothingProduct[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return true;
  if (products.length === 0) return true;

  const { data, error, count } = await client
    .from('products')
    .upsert(products.map(productToRow), { onConflict: 'id', count: 'exact' })
    .select('id');
  if (error) {
    console.warn('[supabase] saveProducts failed:', error.message, error.code);
    if (error.code === '42501') {
      // RLS rejected the write: the request went out as `anon`, not an admin.
      console.warn(
        '[supabase] RLS rejected the catalog write, so the admin session is missing. Sign in again.'
      );
    }
    return false;
  }

  // A blocked write can come back as HTTP 200 with zero affected rows.
  if ((count ?? data?.length ?? 0) === 0) {
    console.warn('[supabase] saveProducts wrote 0 rows; the admin session is missing.');
    return false;
  }
  return true;
}

/** Removes one product by id. Used when the admin deletes a piece. */
export async function deleteProduct(id: number): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return true;
  const { data, error, count } = await client
    .from('products')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) {
    console.warn('[supabase] deleteProduct failed:', error.message);
    return false;
  }
  if ((count ?? data?.length ?? 0) === 0) {
    console.warn('[supabase] deleteProduct removed 0 rows; the admin session is missing.');
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Store settings
// ---------------------------------------------------------------------------

export async function fetchStoreSettings(): Promise<Partial<StoreConfig> | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from('store_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    console.warn('[supabase] fetchStoreSettings failed:', error.message);
    return null;
  }
  if (!data) return null;
  return {
    storeName: data.store_name ?? undefined,
    whatsappNumber: data.whatsapp_number ?? undefined,
    instagramUrl: data.instagram_url ?? undefined,
    tiktokUrl: data.tiktok_url ?? undefined,
    currency: data.currency ?? undefined,
    bcvRate: data.bcv_rate != null ? Number(data.bcv_rate) : undefined,
    showBsRate: data.show_bs_rate ?? undefined,
    freeDeliveryThreshold:
      data.free_delivery_threshold != null
        ? Number(data.free_delivery_threshold)
        : undefined,
  };
}

export async function saveStoreSettings(config: StoreConfig): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return true;

  const row: Record<string, unknown> = {
    id: 1,
    store_name: config.storeName,
    whatsapp_number: config.whatsappNumber,
    instagram_url: config.instagramUrl,
    tiktok_url: config.tiktokUrl,
    currency: config.currency,
    show_bs_rate: config.showBsRate,
    free_delivery_threshold: config.freeDeliveryThreshold,
  };

  // Only send the rate when we actually have one. The rate is filled in
  // automatically, so a saved form on a cold browser could otherwise write 0
  // and replace a good rate (along with any manual override) with zero.
  if (Number.isFinite(config.bcvRate) && config.bcvRate > 0) {
    row.bcv_rate = config.bcvRate;
  }

  // PostgREST reports an UPDATE that RLS silently filtered out as HTTP 200 with
  // zero affected rows and NO error. Checking only `error` therefore claimed
  // success for a write that changed nothing, which is exactly how a new
  // WhatsApp number appeared to save and never reached the database.
  const { data, error, count } = await client
    .from('store_settings')
    .upsert(row, { onConflict: 'id', count: 'exact' })
    .select('id');

  if (error) {
    console.warn('[supabase] saveStoreSettings failed:', error.message, error.code);
    if (error.code === '42501') {
      console.warn('[supabase] RLS rejected the settings write: sign in as admin again.');
    }
    return false;
  }

  const affected = count ?? data?.length ?? 0;
  if (affected === 0) {
    console.warn(
      '[supabase] saveStoreSettings wrote 0 rows. The admin session is missing or RLS blocked it.'
    );
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderPayload {
  id: string;
  customerName: string;
  customerPhone: string;
  cityAddress: string;
  paymentMethod: string;
  courier: string;
  notes: string;
  subtotal: number;
  discount: number;
  total: number;
  items: {
    productId: number;
    name: string;
    size: string;
    color?: string;
    quantity: number;
    price: number;
  }[];
}

/** Records the WhatsApp order so the shop has a durable ledger, not just a chat. */
export async function insertOrder(order: OrderPayload): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return true;
  const { error } = await client.from('orders').insert({
    id: order.id,
    customer_name: order.customerName,
    customer_phone: order.customerPhone,
    city_address: order.cityAddress,
    payment_method: order.paymentMethod,
    courier: order.courier,
    notes: order.notes,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    status: 'pending_whatsapp',
    items: order.items,
  });
  if (error) {
    console.warn('[supabase] insertOrder failed:', error.message);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Order ledger (admin)
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'pending_whatsapp'
  | 'confirmed'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending_whatsapp',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
];

export interface OrderRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  cityAddress: string;
  paymentMethod: string;
  courier: string;
  notes: string;
  subtotal: number;
  discount: number;
  total: number;
  status: OrderStatus;
  items: OrderPayload['items'];
  createdAt: string;
}

interface OrderRow {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  city_address: string | null;
  payment_method: string | null;
  courier: string | null;
  notes: string | null;
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  status: string | null;
  items: OrderPayload['items'] | null;
  created_at: string | null;
}

const rowToOrder = (row: OrderRow): OrderRecord => ({
  id: row.id,
  customerName: row.customer_name ?? '',
  customerPhone: row.customer_phone ?? '',
  cityAddress: row.city_address ?? '',
  paymentMethod: row.payment_method ?? '',
  courier: row.courier ?? '',
  notes: row.notes ?? '',
  subtotal: Number(row.subtotal ?? 0),
  discount: Number(row.discount ?? 0),
  total: Number(row.total ?? 0),
  status: (ORDER_STATUSES.includes(row.status as OrderStatus)
    ? row.status
    : 'pending_whatsapp') as OrderStatus,
  items: row.items ?? [],
  createdAt: row.created_at ?? '',
});

/** Returns the order ledger, newest first. `null` when Supabase is unavailable. */
export async function fetchOrders(limit = 200): Promise<OrderRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[supabase] fetchOrders failed:', error.message);
    return null;
  }
  return (data as OrderRow[]).map(rowToOrder);
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.from('orders').update({ status }).eq('id', id);
  if (error) {
    console.warn('[supabase] updateOrderStatus failed:', error.message);
    return false;
  }
  return true;
}

export async function deleteOrder(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.from('orders').delete().eq('id', id);
  if (error) {
    console.warn('[supabase] deleteOrder failed:', error.message);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Storage (product photos)
// ---------------------------------------------------------------------------

export const PRODUCT_IMAGE_BUCKET = 'product-images';

/**
 * Uploads one processed image and returns its public URL.
 * Returns null when Supabase is not configured, so the caller can fall back to
 * the embedded data URL and the store keeps working offline.
 */
export async function uploadProductImage(
  blob: Blob,
  fileName: string,
  contentType: string
): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { error } = await client.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, blob, { contentType, cacheControl: '31536000', upsert: false });

  if (error) {
    console.warn('[supabase] uploadProductImage failed:', error.message);
    return null;
  }

  const { data } = client.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
}

/** Best-effort removal of an uploaded image. Never throws. */
export async function deleteProductImage(publicUrl: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !publicUrl) return;
  const marker = `/object/public/${PRODUCT_IMAGE_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
  const { error } = await client.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
  if (error) {
    console.warn('[supabase] deleteProductImage failed:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Real round-trip to the database. Used by the admin badge and the test button. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'No Supabase URL or anon key configured.' };
  }
  const { count, error } = await client
    .from('products')
    .select('id', { count: 'exact', head: true });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: `Connected. ${count ?? 0} product rows visible.` };
}

// ---------------------------------------------------------------------------
// SQL schema (paste into the Supabase SQL editor)
// ---------------------------------------------------------------------------

export const SUPABASE_SQL_SCHEMA = `-- MONADA STORE — Supabase schema
-- Paste this whole block into the Supabase SQL Editor and run it once.

-- 1. PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  series TEXT,
  price NUMERIC(10, 2) NOT NULL,
  size TEXT,
  sizes TEXT[] DEFAULT ARRAY['S', 'M', 'L', 'XL'],
  colors JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  image_url TEXT NOT NULL,
  gallery TEXT[] DEFAULT ARRAY[]::TEXT[],
  categories TEXT[] DEFAULT ARRAY['Trending Now']::TEXT[],
  is_favorite BOOLEAN DEFAULT false,
  rating NUMERIC(2, 1) DEFAULT 5.0,
  review_count INTEGER DEFAULT 0,
  reviews JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. ORDERS (WhatsApp checkout ledger)
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  city_address TEXT,
  payment_method TEXT,
  courier TEXT,
  notes TEXT,
  subtotal NUMERIC(10, 2) NOT NULL,
  discount NUMERIC(10, 2) DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'pending_whatsapp',
  items JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. STORE SETTINGS (single row, id = 1)
CREATE TABLE IF NOT EXISTS public.store_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  store_name TEXT DEFAULT 'Monada Store',
  whatsapp_number TEXT DEFAULT '584120000000',
  instagram_url TEXT DEFAULT 'https://instagram.com/monadastore',
  tiktok_url TEXT DEFAULT 'https://tiktok.com/@monadastore',
  currency TEXT DEFAULT 'USD',
  bcv_rate NUMERIC(12, 2) DEFAULT 72.50,
  show_bs_rate BOOLEAN DEFAULT true,
  free_delivery_threshold NUMERIC(10, 2) DEFAULT 100,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. PRODUCT IMAGE STORAGE
-- Creates the public bucket the admin panel uploads photos into.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

-- Storage access rules are defined in section 5, alongside the table policies.

-- 5. ROW LEVEL SECURITY
-- Public storefront reads products and settings. Everything else requires a
-- signed-in admin. This is what actually protects customer data: the anon key
-- in the browser can only read the catalog, nothing more.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_read" ON public.products;
DROP POLICY IF EXISTS "products_write" ON public.products;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_read" ON public.orders;
DROP POLICY IF EXISTS "orders_update" ON public.orders;
DROP POLICY IF EXISTS "orders_delete" ON public.orders;
DROP POLICY IF EXISTS "settings_read" ON public.store_settings;
DROP POLICY IF EXISTS "settings_write" ON public.store_settings;

-- CATALOG: anyone may read (the storefront needs it). Only admins may change it.
CREATE POLICY "products_read" ON public.products
  FOR SELECT USING (true);
CREATE POLICY "products_write" ON public.products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ORDERS: customers may create an order at checkout. Only admins may read,
-- update or delete them. This is what keeps customer names, phone numbers and
-- addresses private.
CREATE POLICY "orders_insert" ON public.orders
  FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_read" ON public.orders
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "orders_delete" ON public.orders
  FOR DELETE TO authenticated USING (true);

-- SETTINGS: anyone may read (the storefront needs the WhatsApp number, rate
-- and free-delivery threshold). Only admins may change them.
CREATE POLICY "settings_read" ON public.store_settings
  FOR SELECT USING (true);
CREATE POLICY "settings_write" ON public.store_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- STORAGE: product photos are public to read (the storefront shows them),
-- but only admins may upload, replace or delete them.
DROP POLICY IF EXISTS "product_images_read" ON storage.objects;
DROP POLICY IF EXISTS "product_images_write" ON storage.objects;
DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;

CREATE POLICY "product_images_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "product_images_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'product-images');

-- NOTE: create your admin account in Supabase → Authentication → Users →
-- "Add user" (email + password, "Auto Confirm User" on). Then sign in at
-- yoursite.com/#admin. Only signed-in users can change the catalog, read
-- orders, or upload photos.
`;
