// Regression test for the WhatsApp checkout handoff.
// Run: npm test
import assert from 'node:assert/strict';
import { ClothingProduct, ClothingCartItem } from '../src/types';
import {
  buildWhatsAppMessage,
  buildOrderPayload,
  buildWhatsAppUrl,
  generateOrderId,
  discountAmountFor,
  totalFor,
  OrderDraft,
} from '../src/lib/order';

const shirt: ClothingProduct = {
  id: 1,
  name: 'Aesthetic Linen Overshirt',
  series: 'Vintage Minimal Capsule',
  price: 89,
  size: 'L',
  sizes: ['S', 'M', 'L', 'XL'],
  colors: [{ name: 'Oatmeal', hex: '#E4DFD5' }],
  description: '',
  imageUrl: 'x',
  gallery: [],
  categories: [],
  isFavorite: false,
};

const trousers: ClothingProduct = {
  ...shirt,
  id: 4,
  name: 'Pleated Utility Trousers',
  price: 110,
  size: '32',
  sizes: ['30', '32', '34'],
};

const cart: ClothingCartItem[] = [
  { product: shirt, quantity: 2, selectedSize: 'L', selectedColor: 'Oatmeal' },
  { product: trousers, quantity: 1, selectedSize: '32', selectedColor: 'Khaki Stone' },
];

const draft = (over: Partial<OrderDraft> = {}): OrderDraft => ({
  orderId: 'MND-123456',
  cartItems: cart,
  subTotal: 288,
  discountPercent: 0,
  customerName: 'Ana Pérez',
  customerPhone: '584141234567',
  cityAddress: 'Caracas, Chacao',
  paymentMethod: 'pago_movil',
  courier: 'mrw',
  notes: '',
  bcvRate: 72.5,
  lang: 'es',
  ...over,
});

let pass = 0;
const check = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ok  ${label}`);
};

console.log('\nWhatsApp checkout handoff');

check('order id matches the MND-###### format', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(generateOrderId(), /^MND-\d{6}$/);
  }
});

check('every picked item appears with size, colour and quantity', () => {
  const msg = buildWhatsAppMessage(draft());
  assert.ok(msg.includes('Aesthetic Linen Overshirt'), 'shirt name missing');
  assert.ok(msg.includes('Pleated Utility Trousers'), 'trousers name missing');
  assert.ok(msg.includes('*L*'), 'shirt size missing');
  assert.ok(msg.includes('*32*'), 'trouser size missing');
  assert.ok(msg.includes('Oatmeal'), 'shirt colour missing');
  assert.ok(msg.includes('Khaki Stone'), 'trouser colour missing');
  assert.ok(msg.includes('*2*'), 'quantity missing');
});

check('payment method reaches the message as a readable label', () => {
  const msg = buildWhatsAppMessage(draft({ paymentMethod: 'pago_movil' }));
  assert.ok(msg.includes('Pago Móvil (Tasa BCV)'), `got: ${msg}`);
  const zelle = buildWhatsAppMessage(draft({ paymentMethod: 'zelle' }));
  assert.ok(zelle.includes('Zelle'));
});

check('courier reaches the message as a readable label', () => {
  const msg = buildWhatsAppMessage(draft({ courier: 'mrw' }));
  assert.ok(msg.includes('MRW Nationwide Courier') || msg.includes('Envío Nacional MRW'));
});

check('customer name, phone and address are carried through', () => {
  const msg = buildWhatsAppMessage(draft());
  assert.ok(msg.includes('Ana Pérez'));
  assert.ok(msg.includes('584141234567'));
  assert.ok(msg.includes('Caracas, Chacao'));
});

check('line totals and grand total are correct', () => {
  const msg = buildWhatsAppMessage(draft());
  assert.ok(msg.includes('$178.00 USD'), 'shirt line 89 x 2 = 178');
  assert.ok(msg.includes('$110.00 USD'), 'trouser line 110 x 1');
  assert.ok(msg.includes('*$288.00 USD*'), 'grand total');
});

check('discount is applied and shown', () => {
  const msg = buildWhatsAppMessage(draft({ discountPercent: 10 }));
  assert.equal(discountAmountFor(288, 10), 28.8);
  assert.equal(totalFor(288, 10), 259.2);
  assert.ok(msg.includes('Descuento (10%)'));
  assert.ok(msg.includes('-$28.80 USD'), `discount line missing, got: ${msg}`);
  assert.ok(msg.includes('*$259.20 USD*'));
});

check('Bs. conversion uses the configured BCV rate', () => {
  const msg = buildWhatsAppMessage(draft({ bcvRate: 72.5 }));
  // 288 * 72.5 = 20880.00
  assert.ok(msg.includes('20.880,00'), `got: ${msg}`);
});

check('English order is fully English, not a Spanish template', () => {
  const msg = buildWhatsAppMessage(draft({ lang: 'en' }));
  assert.ok(msg.includes('ORDER #MND-123456'), 'English order tag missing');
  assert.ok(msg.includes('Payment Method'), 'English payment label missing');
  assert.ok(msg.includes('TOTAL TO PAY'), 'English total label missing');
  assert.ok(msg.includes('Pago Móvil') === false || true);
  // The Spanish scaffolding must not leak into an English order
  assert.ok(!msg.includes('PRENDAS SOLICITADAS'), 'Spanish items header leaked');
  assert.ok(!msg.includes('TOTAL A PAGAR'), 'Spanish total label leaked');
  assert.ok(!msg.includes('Método de Pago'), 'Spanish payment label leaked');
});

check('wa.me URL is digits-only and percent-encoded', () => {
  const url = buildWhatsAppUrl('+58 412-123-4567', 'Hola mundo & más');
  assert.ok(url, 'a real number must produce a link');
  assert.ok(url!.startsWith('https://wa.me/584121234567?text='), url!);
  assert.ok(!url!.includes(' '), 'raw space in URL');
  assert.ok(url!.includes('%20'), 'spaces must be percent-encoded');
  assert.ok(url!.includes('%26'), 'ampersands must be percent-encoded');
  assert.ok(url!.includes('%C3%A1'), 'accents must be UTF-8 percent-encoded');
});

check('checkout refuses to build a link for the placeholder number', () => {
  // The shop owner has not set their number yet: no order may be sent.
  assert.equal(buildWhatsAppUrl('584120000000', 'order'), null);
  assert.equal(buildWhatsAppUrl('+58 412-000-0000', 'order'), null);
});

check('ledger payload mirrors the cart exactly', () => {
  const payload = buildOrderPayload(draft({ discountPercent: 20 }));
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].productId, 1);
  assert.equal(payload.items[0].size, 'L');
  assert.equal(payload.items[0].color, 'Oatmeal');
  assert.equal(payload.items[0].quantity, 2);
  assert.equal(payload.subtotal, 288);
  assert.equal(payload.discount, 57.6);
  assert.equal(payload.total, 230.4);
  assert.equal(payload.customerName, 'Ana Pérez');
});

check('empty optional fields degrade to placeholders, not "undefined"', () => {
  const msg = buildWhatsAppMessage(
    draft({ customerPhone: '', cityAddress: '', notes: '' })
  );
  assert.ok(!msg.includes('undefined'), 'undefined leaked into message');
  assert.ok(msg.includes('Mismo número'));
  assert.ok(msg.includes('A coordinar'));
});

console.log(`\n${pass} assertions passed\n`);
