export interface StoreConfig {
  storeName: string;
  whatsappNumber: string;
  instagramUrl: string;
  tiktokUrl: string;
  bcvRate: number; // Venezuelan BCV Exchange rate (Bs. per USD)
  showBsRate: boolean;
  currency: string;
  freeDeliveryThreshold: number;
}

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  storeName: 'Monada Store',
  whatsappNumber: '584120000000', // Owner's WhatsApp (58 + phone without +)
  instagramUrl: 'https://instagram.com/monadastore',
  tiktokUrl: 'https://tiktok.com/@monadastore',
  bcvRate: 0, // Filled automatically from the official BCV feed (src/lib/bcv.ts)
  showBsRate: true,
  currency: 'USD',
  freeDeliveryThreshold: 100,
};
