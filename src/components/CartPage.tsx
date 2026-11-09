import { ClothingCartItem, ClothingProduct } from '../types';
import { Language, translations } from '../i18n/translations';
import { IconArrowLeft, IconBag, IconTrash, IconWhatsApp, IconShield, IconTruck } from './Icons';

interface CartPageProps {
  cartItems: ClothingCartItem[];
  lang: Language;
  freeDeliveryThreshold: number;
  onBack: () => void;
  onIncrease: (item: ClothingCartItem) => void;
  onDecrease: (item: ClothingCartItem) => void;
  onRemove: (item: ClothingCartItem) => void;
  onOpenCheckout: () => void;
}

export default function CartPage({
  cartItems,
  lang,
  freeDeliveryThreshold,
  onBack,
  onIncrease,
  onDecrease,
  onRemove,
  onOpenCheckout,
}: CartPageProps) {
  const t = translations[lang];
  const subTotal = cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const qualifiesFreeDelivery = freeDeliveryThreshold > 0 && subTotal >= freeDeliveryThreshold;
  const remainingForFreeDelivery = Math.max(0, freeDeliveryThreshold - subTotal);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: '#FAF8F5',
      color: '#171717',
    }}>
      {/* Top Bar */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid #E7E3DC',
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: '#FAF8F5',
      }}>
        <div style={{
          maxWidth: 960,
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <button
            onClick={onBack}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--theme-ink)',
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <IconArrowLeft size={18} />
          </button>

          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 22,
              fontWeight: 600,
              color: '#171717',
              letterSpacing: '-0.2px',
            }}>
              {t.shoppingBag}
            </h1>
            <span style={{
              fontFamily: 'Poppins, sans-serif',
              fontSize: 12,
              color: '#7E7E84',
            }}>
              {cartItems.length} {cartItems.length === 1 ? 'prenda' : 'prendas'}
            </span>
          </div>

          <div style={{ width: 40 }} />
        </div>
      </div>

      {/* Main Bag Area */}
      <div style={{
        flex: 1,
        maxWidth: 960,
        margin: '0 auto',
        width: '100%',
        padding: '24px 24px 80px',
        display: 'grid',
        gridTemplateColumns: cartItems.length > 0 ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
        gap: 32,
        alignItems: 'start',
      }}>
        {cartItems.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 20px',
            textAlign: 'center',
          }}>
            <div style={{
              width: 70,
              height: 70,
              borderRadius: '50%',
              background: 'var(--monada-sage-soft)',
              color: 'var(--monada-sage)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
            }}>
              <IconBag size={30} />
            </div>
            <h3 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 24,
              fontWeight: 600,
              color: '#171717',
              marginBottom: 8,
            }}>
              {t.emptyBagTitle}
            </h3>
            <p style={{ fontSize: 13, color: '#7E7E84', maxWidth: 320, lineHeight: 1.6, marginBottom: 24 }}>
              {t.emptyBagDesc}
            </p>
            <button
              onClick={onBack}
              style={{
                padding: '12px 28px',
                borderRadius: 12,
                background: '#758A77',
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(117,138,119,0.3)',
              }}
            >
              {t.continueShopping}
            </button>
          </div>
        ) : (
          <>
            {/* Items Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {cartItems.map((item, index) => (
                <div
                  key={`${item.product.id}-${item.selectedSize}-${item.selectedColor ?? ''}-${index}`}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 18,
                    padding: 16,
                    border: '1px solid #E7E3DC',
                    display: 'flex',
                    gap: 16,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                  }}
                >
                  <img
                    src={item.product.imageUrl}
                    alt={item.product.name}
                    style={{
                      width: 90,
                      height: 110,
                      objectFit: 'cover',
                      borderRadius: 14,
                      background: '#F1ECE5',
                      flexShrink: 0,
                    }}
                  />

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#7E7E84', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 500 }}>
                        {item.product.series}
                      </div>
                      <h4 style={{
                        fontFamily: 'Playfair Display, serif',
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#171717',
                        margin: '2px 0 6px',
                      }}>
                        {item.product.name}
                      </h4>
                      <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#7E7E84' }}>
                        <span>{t.size}: <strong style={{ color: '#171717' }}>{item.selectedSize}</strong></span>
                        {item.selectedColor && (
                          <span>• {t.color}: <strong style={{ color: '#171717' }}>{item.selectedColor}</strong></span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: '#FAF8F5',
                        padding: '4px 8px',
                        borderRadius: 10,
                        border: '1px solid #E7E3DC',
                      }}>
                        <button
                          onClick={() => onDecrease(item)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: '#FFFFFF',
                            border: '1px solid #E7E3DC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: 13,
                            color: '#171717',
                          }}
                        >
                          −
                        </button>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 16, textAlign: 'center' }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onIncrease(item)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: '#FFFFFF',
                            border: '1px solid #E7E3DC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: 13,
                            color: '#171717',
                          }}
                        >
                          +
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#9B6F5A' }}>
                          ${(item.product.price * item.quantity).toFixed(2)} USD
                        </span>
                        <button
                          onClick={() => onRemove(item)}
                          style={{
                            background: 'transparent',
                            color: 'var(--theme-muted)',
                            cursor: 'pointer',
                            padding: 4,
                            border: 'none',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--monada-danger)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--theme-muted)')}
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary Column */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: 20,
              padding: 24,
              border: '1px solid #E7E3DC',
              boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
              position: 'sticky',
              top: 100,
            }}>
              <h3 style={{
                fontFamily: 'Playfair Display, serif',
                fontSize: 18,
                fontWeight: 600,
                color: '#171717',
                marginBottom: 16,
              }}>
                {t.orderSummary}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7E7E84' }}>
                  <span>{t.subtotal}</span>
                  <span style={{ color: '#171717', fontWeight: 600 }}>${subTotal.toFixed(2)} USD</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7E7E84' }}>
                  <span>{t.estimatedShipping}</span>
                  {qualifiesFreeDelivery ? (
                    <span style={{ color: '#758A77', fontWeight: 600, fontSize: 12 }}>
                      {lang === 'es' ? 'Envío gratis' : 'Free delivery'}
                    </span>
                  ) : (
                    <span style={{ color: '#758A77', fontWeight: 500, fontSize: 12 }}>{t.shippingNote}</span>
                  )}
                </div>
                <div style={{ height: 1, background: '#E7E3DC', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700 }}>
                  <span>{t.total}</span>
                  <span style={{ color: '#9B6F5A' }}>${subTotal.toFixed(2)} USD</span>
                </div>
              </div>

              <div style={{ fontSize: 11, color: '#7E7E84', marginTop: 10, lineHeight: 1.5 }}>
                {t.taxesIncluded}
              </div>

              {freeDeliveryThreshold > 0 && !qualifiesFreeDelivery && (
                <div style={{
                  marginTop: 10,
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: '#F1ECE5',
                  fontSize: 11,
                  color: '#52525B',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <IconTruck size={13} style={{ color: '#758A77', flexShrink: 0 }} />
                  <span>
                    {lang === 'es'
                      ? `Te faltan $${remainingForFreeDelivery.toFixed(2)} para envío gratis`
                      : `$${remainingForFreeDelivery.toFixed(2)} away from free delivery`}
                  </span>
                </div>
              )}

              {/* Complete Order via WhatsApp button */}
              <button
                onClick={onOpenCheckout}
                style={{
                  marginTop: 20,
                  width: '100%',
                  height: 54,
                  borderRadius: 14,
                  background: '#25D366',
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(37, 211, 102, 0.35)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  border: 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm5.79 14.07c-.24.68-1.2 1.25-1.68 1.33-.46.07-1.04.1-1.68-.1-.4-.12-.92-.29-1.58-.58-2.77-1.2-4.58-4-4.72-4.19-.14-.19-1.13-1.5-1.13-2.86 0-1.36.71-2.03.96-2.31.25-.28.56-.35.74-.35.19 0 .37 0 .53.01.17.01.4.06.61.57.24.58.82 2 .89 2.15.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.32.38-.45.51-.15.15-.31.31-.13.62.18.31.79 1.3 1.7 2.11 1.17 1.04 2.15 1.36 2.46 1.51.31.15.49.13.67-.08.18-.21.78-.91.99-1.22.21-.31.42-.26.71-.15.29.11 1.84.87 2.15 1.03.31.16.52.24.59.37.07.12.07.72-.17 1.4z"/>
                </svg>
                {t.proceedToCheckout}
              </button>

              <div style={{
                textAlign: 'center',
                marginTop: 14,
                fontSize: 11,
                color: 'var(--theme-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}>
                <IconShield size={14} style={{ color: 'var(--monada-sage)' }} />
                <span>{t.secureOrder}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
