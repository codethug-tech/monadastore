import { ClothingCartItem } from '../types';
import { Language, translations } from '../i18n/translations';
import { OrderPayload } from '../services/supabase';
import { buildWaLink } from './phone';

/**
 * Everything the WhatsApp handoff needs, in one plain object.
 * Kept free of React so the message format can be tested directly.
 */
export interface OrderDraft {
  orderId: string;
  cartItems: ClothingCartItem[];
  subTotal: number;
  discountPercent: number;
  customerName: string;
  customerPhone: string;
  cityAddress: string;
  paymentMethod: string;
  courier: string;
  notes: string;
  bcvRate: number;
  lang: Language;
}

export const generateOrderId = (): string =>
  `MND-${Math.floor(100000 + Math.random() * 900000)}`;

export const discountAmountFor = (subTotal: number, discountPercent: number): number =>
  (subTotal * discountPercent) / 100;

export const totalFor = (subTotal: number, discountPercent: number): number =>
  Math.max(0, subTotal - discountAmountFor(subTotal, discountPercent));

const LABELS = {
  es: {
    orderTag: 'PEDIDO',
    customer: 'Cliente',
    phone: 'WhatsApp',
    address: 'Ciudad / Dirección',
    shipping: 'Envío/Entrega',
    payment: 'Método de Pago',
    notes: 'Notas',
    items: 'PRENDAS SOLICITADAS:',
    size: 'Talla/Size',
    color: 'Color',
    quantity: 'Cantidad',
    price: 'Precio',
    subtotal: 'Subtotal',
    discount: 'Descuento',
    total: 'TOTAL A PAGAR',
    approx: 'Aprox. Bs.',
    standardColor: 'Estándar',
    noName: 'No indicado',
    samePhone: 'Mismo número',
    toArrange: 'A coordinar',
    closing:
      '¿Tienen disponibilidad de estas tallas para concretar el pago y envío? ¡Muchas gracias!',
  },
  en: {
    orderTag: 'ORDER',
    customer: 'Customer',
    phone: 'WhatsApp',
    address: 'City / Address',
    shipping: 'Shipping',
    payment: 'Payment Method',
    notes: 'Notes',
    items: 'ITEMS REQUESTED:',
    size: 'Size',
    color: 'Color',
    quantity: 'Quantity',
    price: 'Price',
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'TOTAL TO PAY',
    approx: 'Approx. Bs.',
    standardColor: 'Standard',
    noName: 'Not provided',
    samePhone: 'Same number',
    toArrange: 'To be arranged',
    closing:
      'Do you have these sizes available so we can arrange payment and delivery? Thank you!',
  },
} as const;

/** Resolves the human label for a payment/courier id in the active language. */
function labelFor(
  list: readonly { id: string; label: string }[],
  id: string
): string {
  return list.find(entry => entry.id === id)?.label ?? id;
}

export function buildWhatsAppMessage(draft: OrderDraft): string {
  const t = translations[draft.lang];
  const L = LABELS[draft.lang];

  const discountAmount = discountAmountFor(draft.subTotal, draft.discountPercent);
  const totalUSD = totalFor(draft.subTotal, draft.discountPercent);
  const totalBs = (totalUSD * draft.bcvRate).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const itemsText = draft.cartItems
    .map((item, i) =>
      [
        `  ${i + 1}. *${item.product.name}*`,
        `     • ${L.size}: *${item.selectedSize}*`,
        `     • ${L.color}: *${item.selectedColor || L.standardColor}*`,
        `     • ${L.quantity}: *${item.quantity}*`,
        `     • ${L.price}: *$${(item.product.price * item.quantity).toFixed(2)} USD*`,
      ].join('\n')
    )
    .join('\n\n');

  const discountText =
    draft.discountPercent > 0
      ? `\n🎟️ *${L.discount} (${draft.discountPercent}%):* -$${discountAmount.toFixed(2)} USD`
      : '';

  const notesText = draft.notes.trim() ? `\n📝 *${L.notes}:* ${draft.notes.trim()}` : '';

  const paymentLabel = labelFor(t.paymentMethods, draft.paymentMethod);
  const courierLabel = labelFor(t.shippingCouriers, draft.courier);

  return `${t.orderGreeting}

🏷️ *${L.orderTag} #${draft.orderId}*
━━━━━━━━━━━━━━━━━━
👤 *${L.customer}:* ${draft.customerName || L.noName}
📞 *${L.phone}:* ${draft.customerPhone || L.samePhone}
📍 *${L.address}:* ${draft.cityAddress || L.toArrange}
🚚 *${L.shipping}:* ${courierLabel}
💳 *${L.payment}:* ${paymentLabel}
${notesText}

🛍️ *${L.items}*
${itemsText}
━━━━━━━━━━━━━━━━━━
💵 *${L.subtotal}:* $${draft.subTotal.toFixed(2)} USD${discountText}
✨ *${L.total}:* *$${totalUSD.toFixed(2)} USD* (${L.approx} ${totalBs})

${L.closing}`;
}

/** The durable ledger row written to Supabase alongside the WhatsApp handoff. */
export function buildOrderPayload(draft: OrderDraft): OrderPayload {
  return {
    id: draft.orderId,
    customerName: draft.customerName.trim(),
    customerPhone: draft.customerPhone.trim(),
    cityAddress: draft.cityAddress.trim(),
    paymentMethod: draft.paymentMethod,
    courier: draft.courier,
    notes: draft.notes.trim(),
    subtotal: draft.subTotal,
    discount: discountAmountFor(draft.subTotal, draft.discountPercent),
    total: totalFor(draft.subTotal, draft.discountPercent),
    items: draft.cartItems.map(item => ({
      productId: item.product.id,
      name: item.product.name,
      size: item.selectedSize,
      color: item.selectedColor,
      quantity: item.quantity,
      price: item.product.price,
    })),
  };
}

/**
 * wa.me link for a finished order message.
 * Returns null when the configured number is missing or still the placeholder,
 * so checkout can refuse to send an order to nobody.
 */
export function buildWhatsAppUrl(whatsappNumber: string, message: string): string | null {
  return buildWaLink(whatsappNumber, message);
}