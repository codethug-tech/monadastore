import { useState } from 'react';
import { ClothingCartItem } from '../types';
import { Language, translations } from '../i18n/translations';
import { StoreConfig } from '../config/storeConfig';
import { insertOrder } from '../services/supabase';
import {
  generateOrderId,
  buildWhatsAppMessage,
  buildOrderPayload,
  buildWhatsAppUrl,
  totalFor,
} from '../lib/order';
import {
  validateCheckout,
  isCheckoutComplete,
  missingFieldCount,
  REQUIRED_FIELD_COUNT,
  type FieldErrors,
} from '../lib/checkout';
import { IconWhatsApp, IconShield, IconCheck, IconClose } from './Icons';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: ClothingCartItem[];
  subTotal: number;
  config: StoreConfig;
  lang: Language;
  onSuccess: () => void;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  cartItems,
  subTotal,
  config,
  lang,
  onSuccess,
}: CheckoutModalProps) {
  const t = translations[lang];

  const [promoCode, setPromoCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [promoMessage, setPromoMessage] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cityAddress, setCityAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(t.paymentMethods[0].id);
  const [courier, setCourier] = useState(t.shippingCouriers[0].id);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Only show errors for fields the customer has already touched, so the form
  // does not open covered in red before they have typed anything.
  const [touched, setTouched] = useState<Partial<Record<keyof FieldErrors, boolean>>>({});

  if (!isOpen) return null;

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = promoCode.trim().toUpperCase();
    if (clean === 'MONADA10') {
      setDiscountPercent(10);
      setPromoMessage(lang === 'es' ? '✨ ¡10% de descuento aplicado!' : '✨ 10% discount applied!');
    } else if (clean === 'MONADA20') {
      setDiscountPercent(20);
      setPromoMessage(lang === 'es' ? '✨ ¡20% de descuento VIP aplicado!' : '✨ 20% VIP discount applied!');
    } else {
      setDiscountPercent(0);
      setPromoMessage(lang === 'es' ? 'Código no válido. Prueba MONADA10' : 'Invalid code. Try MONADA10');
    }
  };

  const totalUSD = totalFor(subTotal, discountPercent);

  const handleSendToWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();

    // Every required field must be filled before an order can be sent.
    const errors = validateCheckout(
      { customerName, customerPhone, cityAddress, paymentMethod, courier },
      lang
    );
    setFieldErrors(errors);

    if (!isCheckoutComplete(errors)) {
      // Reveal every outstanding field at once, not just the first.
      setTouched({
        customerName: true,
        customerPhone: true,
        cityAddress: true,
        paymentMethod: true,
        courier: true,
      });
      const missing = missingFieldCount(errors);
      setFormError(
        lang === 'es'
          ? `Faltan ${missing} de ${REQUIRED_FIELD_COUNT} datos obligatorios. Revisa los campos marcados.`
          : `${missing} of ${REQUIRED_FIELD_COUNT} required details are still missing. Check the highlighted fields.`
      );
      return;
    }

    setFormError('');

    const orderId = generateOrderId();

    const draft = {
      orderId,
      cartItems,
      subTotal,
      discountPercent,
      customerName,
      customerPhone,
      cityAddress,
      paymentMethod,
      courier,
      notes,
      bcvRate: config.bcvRate,
      lang,
    };

    const message = buildWhatsAppMessage(draft);
    const url = buildWhatsAppUrl(config.whatsappNumber, message);

    // The shop owner has not set a real business number yet. Sending the order
    // would open a chat with a stranger, so stop and say so plainly.
    if (!url) {
      setFormError(
        lang === 'es'
          ? 'La tienda aún no ha configurado su número de WhatsApp. Escríbenos por otro medio mientras lo activamos.'
          : 'This store has not set up its WhatsApp number yet. Please reach out another way while we finish setting it up.'
      );
      return;
    }

    // Record the order in Supabase first (no-op when not configured), so the
    // shop keeps a ledger even if the customer never sends the WhatsApp message.
    // Not awaited: the WhatsApp handoff must not wait on the network. The
    // failure is logged rather than swallowed, so a missing ledger entry is
    // traceable instead of invisible.
    void insertOrder(buildOrderPayload(draft)).then(ok => {
      if (!ok) {
        console.warn(
          '[checkout] the order was not saved to the database. The WhatsApp handoff still continues, but this entry will be missing from the admin ledger.'
        );
      }
    });

    // Direct redirect to WhatsApp
    const opened = window.open(url, '_blank');
    if (!opened) {
      window.location.href = url;
    }

    onSuccess();
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(10, 10, 10, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: 16,
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        background: 'var(--theme-bg)',
        color: 'var(--theme-ink)',
        borderRadius: 24,
        width: '100%',
        maxWidth: 580,
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--theme-line)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--theme-line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--theme-surface)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--whatsapp-green)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <IconWhatsApp size={20} />
            </span>
            <div>
              <h3 style={{
                fontFamily: 'Playfair Display, serif',
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--theme-ink)',
              }}>
                {t.checkoutModalTitle}
              </h3>
              <p style={{ fontSize: 11, color: 'var(--theme-muted)' }}>
                {t.secureOrder}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'var(--theme-surface-soft)',
              color: 'var(--theme-ink)',
              width: 32,
              height: 32,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSendToWhatsApp} style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Order Pieces Summary */}
          <div style={{
            background: 'var(--theme-surface)',
            borderRadius: 16,
            padding: '12px 16px',
            border: '1px solid var(--theme-line)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
              {t.orderSummary} ({cartItems.length})
            </div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {cartItems.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--theme-surface-soft)',
                  padding: '6px 10px',
                  borderRadius: 10,
                  flexShrink: 0,
                  border: '1px solid var(--theme-line)',
                }}>
                  <img src={item.product.imageUrl} alt="" style={{ width: 34, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-ink)' }}>{item.product.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--theme-muted)' }}>
                      {t.size}: <strong>{item.selectedSize}</strong> × {item.quantity} • ${(item.product.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer Details */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-ink)', display: 'block', marginBottom: 8 }}>
              {t.customerInfo}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <input
                  type="text"
                  placeholder={t.fullName + ' *'}
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, customerName: true }))}
                  aria-invalid={touched.customerName && Boolean(fieldErrors.customerName)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: `1px solid ${touched.customerName && fieldErrors.customerName ? 'var(--monada-danger)' : 'var(--theme-line)'}`,
                    background: 'var(--theme-surface)',
                    color: 'var(--theme-ink)',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                {touched.customerName && fieldErrors.customerName && (
                  <div style={{ fontSize: 11, color: 'var(--monada-danger)', marginTop: 4, fontWeight: 500 }}>
                    {fieldErrors.customerName}
                  </div>
                )}
              </div>

              <div>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder={t.phone + ' * (ej. 0412 1234567)'}
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, customerPhone: true }))}
                  aria-invalid={touched.customerPhone && Boolean(fieldErrors.customerPhone)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: `1px solid ${touched.customerPhone && fieldErrors.customerPhone ? 'var(--monada-danger)' : 'var(--theme-line)'}`,
                    background: 'var(--theme-surface)',
                    color: 'var(--theme-ink)',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                {touched.customerPhone && fieldErrors.customerPhone && (
                  <div style={{ fontSize: 11, color: 'var(--monada-danger)', marginTop: 4, fontWeight: 500 }}>
                    {fieldErrors.customerPhone}
                  </div>
                )}
              </div>

              <div>
                <input
                  type="text"
                  placeholder={t.cityAddress + ' *'}
                  value={cityAddress}
                  onChange={e => setCityAddress(e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, cityAddress: true }))}
                  aria-invalid={touched.cityAddress && Boolean(fieldErrors.cityAddress)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: `1px solid ${touched.cityAddress && fieldErrors.cityAddress ? 'var(--monada-danger)' : 'var(--theme-line)'}`,
                    background: 'var(--theme-surface)',
                    color: 'var(--theme-ink)',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                {touched.cityAddress && fieldErrors.cityAddress && (
                  <div style={{ fontSize: 11, color: 'var(--monada-danger)', marginTop: 4, fontWeight: 500 }}>
                    {fieldErrors.cityAddress}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Payment Method in Venezuela */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-ink)', display: 'block', marginBottom: 8 }}>
              {t.paymentMethod}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {t.paymentMethods.map(method => (
                <button
                  type="button"
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    textAlign: 'left',
                    background: paymentMethod === method.id ? 'var(--monada-sage-soft)' : 'var(--theme-surface)',
                    border: `1.5px solid ${paymentMethod === method.id ? 'var(--monada-sage)' : 'var(--theme-line)'}`,
                    color: 'var(--theme-ink)',
                    fontSize: 12,
                    fontWeight: paymentMethod === method.id ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {paymentMethod === method.id && <IconCheck size={13} />}
                    {method.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Courier Preference */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-ink)', display: 'block', marginBottom: 8 }}>
              {t.shippingCourier}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              {t.shippingCouriers.map(c => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCourier(c.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    textAlign: 'left',
                    background: courier === c.id ? 'var(--monada-sage-soft)' : 'var(--theme-surface)',
                    border: `1.5px solid ${courier === c.id ? 'var(--monada-sage)' : 'var(--theme-line)'}`,
                    color: 'var(--theme-ink)',
                    fontSize: 12,
                    fontWeight: courier === c.id ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {courier === c.id && <IconCheck size={13} />}
                    {c.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Promo code */}
          <div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder={lang === 'es' ? 'Cupón (ej. MONADA10)' : 'Promo Code (e.g. MONADA10)'}
                value={promoCode}
                onChange={e => setPromoCode(e.target.value)}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--theme-line)',
                  background: 'var(--theme-surface)',
                  color: 'var(--theme-ink)',
                  fontFamily: 'inherit',
                  fontSize: 12,
                }}
              />
              <button
                type="button"
                onClick={handleApplyPromo}
                style={{
                  padding: '0 16px',
                  borderRadius: 10,
                  background: 'var(--monada-sage)',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {lang === 'es' ? 'Aplicar' : 'Apply'}
              </button>
            </div>
            {promoMessage && (
              <div style={{ fontSize: 11, marginTop: 4, color: discountPercent > 0 ? 'var(--monada-sage)' : 'var(--monada-danger)' }}>
                {promoMessage}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <input
              type="text"
              placeholder={t.notes}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid var(--theme-line)',
                background: 'var(--theme-surface)',
                color: 'var(--theme-ink)',
                fontFamily: 'inherit',
                fontSize: 12,
                outline: 'none',
              }}
            />
          </div>

          {/* Total & Submit */}
          <div style={{
            background: 'var(--theme-surface)',
            borderRadius: 14,
            padding: '14px 18px',
            border: '1px solid var(--theme-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--theme-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t.total}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--monada-terracotta)', fontFamily: 'Playfair Display, serif' }}>
                ${totalUSD.toFixed(2)} USD
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--theme-muted)', textAlign: 'right', maxWidth: 180 }}>
              {t.taxesIncluded}
            </div>
          </div>

          {/* Direct WhatsApp Action Button */}
          {formError && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(220, 38, 38, 0.08)',
              color: 'var(--monada-danger)',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 10,
            }}>
              {formError}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: '100%',
              height: 54,
              borderRadius: 14,
              background: '#25D366',
              color: '#FFFFFF',
              fontFamily: 'inherit',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(37, 211, 102, 0.35)',
              border: 'none',
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm5.79 14.07c-.24.68-1.2 1.25-1.68 1.33-.46.07-1.04.1-1.68-.1-.4-.12-.92-.29-1.58-.58-2.77-1.2-4.58-4-4.72-4.19-.14-.19-1.13-1.5-1.13-2.86 0-1.36.71-2.03.96-2.31.25-.28.56-.35.74-.35.19 0 .37 0 .53.01.17.01.4.06.61.57.24.58.82 2 .89 2.15.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.32.38-.45.51-.15.15-.31.31-.13.62.18.31.79 1.3 1.7 2.11 1.17 1.04 2.15 1.36 2.46 1.51.31.15.49.13.67-.08.18-.21.78-.91.99-1.22.21-.31.42-.26.71-.15.29.11 1.84.87 2.15 1.03.31.16.52.24.59.37.07.12.07.72-.17 1.4z"/>
            </svg>
            {t.sendToWhatsappBtn}
          </button>

          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--theme-muted)' }}>
            {t.orderSentNotice}
          </p>
        </form>
      </div>
    </div>
  );
}
