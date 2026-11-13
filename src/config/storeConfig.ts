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
  // Empty by default: a made-up handle would ship a link to someone else's
  // profile. The storefront hides the icon until the owner sets a real one.
  instagramUrl: '',
  tiktokUrl: '',
  bcvRate: 0, // Filled automatically from the official BCV feed (src/lib/bcv.ts)
  showBsRate: true,
  currency: 'USD',
  freeDeliveryThreshold: 100,
};
