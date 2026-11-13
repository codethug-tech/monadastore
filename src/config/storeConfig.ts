export interface StoreConfig {
  storeName: string;
  /** Primary WhatsApp number (digits only, country code first). */
  whatsappNumber: string;
  /**
   * Optional second number. When set, orders are distributed between the two so
   * a busy shop can share the load instead of one inbox taking everything.
   */
  whatsappNumber2: string;
  /** How new orders are split when a second number exists. */
  orderDistribution: 'round_robin' | 'primary_only' | 'alternate_daily';
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
  whatsappNumber2: '',
  orderDistribution: 'round_robin',
  // Empty by default: a made-up handle would ship a link to someone else's
  // profile. The storefront hides the icon until the owner sets a real one.
  instagramUrl: '',
  tiktokUrl: '',
  bcvRate: 0, // Filled automatically from the official BCV feed (src/lib/bcv.ts)
  showBsRate: true,
  currency: 'USD',
  freeDeliveryThreshold: 100,
};
