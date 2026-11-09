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
  bcvRate: 72.50, // Default estimated BCV rate, can be adjusted in Admin Panel
  showBsRate: true,
  currency: 'USD',
  freeDeliveryThreshold: 100,
};
