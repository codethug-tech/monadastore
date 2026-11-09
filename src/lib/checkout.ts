/**
 * Checkout field validation.
 *
 * The shop cannot fulfil an order without knowing who is buying, how to reach
 * them, and where it goes. These rules block the WhatsApp handoff until every
 * required field is genuinely filled in, and they explain what is missing in
 * the customer's own language.
 */

export type CheckoutField =
  | 'customerName'
  | 'customerPhone'
  | 'cityAddress'
  | 'paymentMethod'
  | 'courier';

export interface CheckoutValues {
  customerName: string;
  customerPhone: string;
  cityAddress: string;
  paymentMethod: string;
  courier: string;
}

export type FieldErrors = Partial<Record<CheckoutField, string>>;

const MIN_NAME = 3;
const MIN_ADDRESS = 8;

/** Strips formatting so "0412-123 4567" counts as 11 digits. */
const digitCount = (value: string): number => value.replace(/\D/g, '').length;

/**
 * Returns one message per invalid field. An empty object means the order is
 * complete enough to send.
 */
export function validateCheckout(
  values: CheckoutValues,
  lang: 'es' | 'en'
): FieldErrors {
  const es = lang === 'es';
  const errors: FieldErrors = {};

  // --- Name: a real name, not one character ---
  const name = values.customerName.trim();
  if (!name) {
    errors.customerName = es
      ? 'Escribe tu nombre y apellido.'
      : 'Enter your full name.';
  } else if (name.length < MIN_NAME) {
    errors.customerName = es
      ? 'Escribe tu nombre completo.'
      : 'Enter your full name.';
  } else if (!/[a-zA-ZÀ-ÿ]/.test(name)) {
    errors.customerName = es
      ? 'El nombre debe contener letras.'
      : 'The name must contain letters.';
  }

  // --- Phone: the shop must be able to call or message back ---
  const phoneDigits = digitCount(values.customerPhone);
  if (!values.customerPhone.trim()) {
    errors.customerPhone = es
      ? 'Escribe tu número de WhatsApp para coordinar la entrega.'
      : 'Enter your WhatsApp number so we can arrange delivery.';
  } else if (phoneDigits < 10) {
    errors.customerPhone = es
      ? `Ese número tiene ${phoneDigits} dígitos. Escribe el número completo (ej. 0412 1234567).`
      : `That number has ${phoneDigits} digits. Enter the full number (e.g. 0412 1234567).`;
  } else if (phoneDigits > 15) {
    errors.customerPhone = es
      ? 'Ese número es demasiado largo.'
      : 'That number is too long.';
  }

  // --- Address: a courier needs more than a city name ---
  const address = values.cityAddress.trim();
  if (!address) {
    errors.cityAddress = es
      ? 'Escribe tu ciudad y dirección de envío.'
      : 'Enter your city and delivery address.';
  } else if (address.length < MIN_ADDRESS) {
    errors.cityAddress = es
      ? 'Incluye ciudad y dirección (ej. Caracas, Chacao, Av. Principal).'
      : 'Include city and address (e.g. Caracas, Chacao, Main Ave).';
  }

  // --- Payment and courier: a choice must be made ---
  if (!values.paymentMethod) {
    errors.paymentMethod = es
      ? 'Selecciona un método de pago.'
      : 'Select a payment method.';
  }
  if (!values.courier) {
    errors.courier = es
      ? 'Selecciona cómo quieres recibir tu pedido.'
      : 'Select how you want to receive your order.';
  }

  return errors;
}

export const isCheckoutComplete = (errors: FieldErrors): boolean =>
  Object.keys(errors).length === 0;

/** Counts how many required fields are still missing, for the progress hint. */
export function missingFieldCount(errors: FieldErrors): number {
  return Object.keys(errors).length;
}

export const REQUIRED_FIELD_COUNT = 5;
