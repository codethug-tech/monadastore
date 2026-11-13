/**
 * WhatsApp number handling.
 *
 * The owner enters their business number once in the admin panel; every
 * checkout then redirects there. These helpers normalise whatever they type
 * into the digits-only form wa.me requires, and detect the placeholder so the
 * store can refuse to send orders into the void.
 */

/** The shipped default. Orders must never be sent here. */
export const PLACEHOLDER_WHATSAPP = '584120000000';

export interface NormalizedPhone {
  /** Digits only, country code first, no plus. This is what wa.me needs. */
  digits: string;
  /** Human-readable form, e.g. +58 412 123 4567 */
  pretty: string;
  /** True when the number is usable for a wa.me link. */
  valid: boolean;
  /** True when this is still the shipped placeholder. */
  isPlaceholder: boolean;
  /** Set when valid is false, explaining what is wrong. */
  error?: string;
}

/**
 * Cleans a typed number into wa.me digits.
 *
 * Handles the ways people actually type a Venezuelan number:
 *   +58 412-123 4567   → 584121234567
 *   584121234567       → 584121234567
 *   0412-1234567       → 584121234567   (local trunk 0 replaced by 58)
 *   4121234567         → 584121234567   (bare mobile, assume Venezuela)
 */
export function normalizeWhatsApp(raw: string): NormalizedPhone {
  const input = (raw ?? '').trim();

  let digits = input.replace(/\D/g, '');

  // 00 international prefix → drop it
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Venezuelan local format: 0412… → 58412…
  if (digits.startsWith('0') && digits.length === 11) {
    digits = `58${digits.slice(1)}`;
  }

  // Bare Venezuelan mobile: 4121234567 → 584121234567
  if (digits.length === 10 && digits.startsWith('4')) {
    digits = `58${digits}`;
  }

  // Bare Venezuelan landline: 2121234567 → 582121234567
  if (digits.length === 10 && digits.startsWith('2')) {
    digits = `58${digits}`;
  }

  const isPlaceholder = digits === PLACEHOLDER_WHATSAPP;

  if (digits.length === 0) {
    return {
      digits: '',
      pretty: '',
      valid: false,
      isPlaceholder: false,
      error: 'Enter your WhatsApp number.',
    };
  }

  // wa.me accepts 7–15 digits (E.164 max is 15).
  if (digits.length < 8 || digits.length > 15) {
    return {
      digits,
      pretty: formatPretty(digits),
      valid: false,
      isPlaceholder,
      error: `That is ${digits.length} digits. A full number with country code has 8 to 15.`,
    };
  }

  if (isPlaceholder) {
    return {
      digits,
      pretty: formatPretty(digits),
      valid: false,
      isPlaceholder: true,
      error: 'This is the placeholder number. Replace it with your real business number.',
    };
  }

  return {
    digits,
    pretty: formatPretty(digits),
    valid: true,
    isPlaceholder: false,
  };
}

/** Groups digits for display: 584121234567 → +58 412 123 4567 */
export function formatPretty(digits: string): string {
  if (!digits) return '';
  if (digits.startsWith('58')) {
    const rest = digits.slice(2);
    if (rest.length === 10) {
      return `+58 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
    }
    return `+58 ${rest}`;
  }
  return `+${digits}`;
}

/** True only when a number is safe to send real orders to. */
export function isWhatsAppConfigured(raw: string): boolean {
  return normalizeWhatsApp(raw).valid;
}

/** True when at least one real (non-placeholder) order number is configured. */
export function hasAnyWhatsAppNumber(...numbers: string[]): boolean {
  return numbers.some(n => isWhatsAppConfigured(n));
}

/**
 * Picks which WhatsApp number an order goes to.
 *
 * With one number, every order goes there. With two, the choice is a stable
 * function of the order id: the same order always resolves to the same number,
 * which is what round-robin needs without storing any counter.
 *
 * `primary_only` routes everything to the first number even when the second
 * exists (used when the owner wants a single inbox after all).
 */
export function pickOrderNumber(
  orderId: string,
  primary: string,
  secondary: string,
  mode: 'round_robin' | 'primary_only' | 'alternate_daily'
): string {
  const primaryOk = isWhatsAppConfigured(primary);
  const secondaryOk = isWhatsAppConfigured(secondary);

  // Never route a real order to a known-bad number. If only one side is usable,
  // everything goes there regardless of the chosen distribution mode.
  if (!primaryOk && secondaryOk) return secondary;
  if (primaryOk && !secondaryOk) return primary;
  if (!primaryOk && !secondaryOk) return primary;

  if (mode === 'primary_only') return primary;

  if (mode === 'alternate_daily') {
    // Even/odd day in UTC: today to number 1, tomorrow to number 2.
    const day = Math.floor(Date.now() / 86400000);
    return day % 2 === 0 ? primary : secondary;
  }

  // round_robin: hash the order id so each order deterministically alternates.
  let h = 0;
  for (let i = 0; i < orderId.length; i++) {
    h = (h * 31 + orderId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2 === 0 ? primary : secondary;
}

/**
 * Builds the wa.me link. Returns null when the number is not usable, so callers
 * can show an error instead of opening a chat with nobody.
 */
export function buildWaLink(raw: string, message: string): string | null {
  const { valid, digits } = normalizeWhatsApp(raw);
  if (!valid) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
