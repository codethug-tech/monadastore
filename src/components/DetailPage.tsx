import { useState } from 'react';
import { ClothingProduct } from '../types';
import { Language, translations } from '../i18n/translations';
import { StoreConfig } from '../config/storeConfig';
import { categoryLabel, isKnownCategory } from '../config/categories';
import { buildWaLink } from '../lib/phone';
import { useIsMobile } from '../lib/useIsMobile';
import { IconArrowLeft, IconHeart, IconWhatsApp, IconBag, IconRuler, IconStar } from './Icons';

interface DetailPageProps {
  product: ClothingProduct;
  lang: Language;
  config: StoreConfig;
  onBack: () => void;
  onAddToCart: (product: ClothingProduct, selectedSize: string, selectedColor: string) => void;
  onFavoriteTap: () => void;
  onOpenSizeGuide: () => void;
}

export default function DetailPage({
  product,
  lang,
  config,
  onBack,
  onAddToCart,
  onFavoriteTap,
  onOpenSizeGuide,
}: DetailPageProps) {
  const t = translations[lang];
  const isMobile = useIsMobile();

  // A product may have no gallery, one photo, or many. Normalise once so the
  // rest of the component never has to think about it.
  const images = (() => {
    const list = (product.gallery ?? []).filter(Boolean);
    if (list.length > 0) return list;
    return product.imageUrl ? [product.imageUrl] : [];
  })();

  const [selectedImage, setSelectedImage] = useState(images[0] ?? '');
  const [isFavorite, setIsFavorite] = useState(product.isFavorite);
  const [selectedSize, setSelectedSize] = useState(product.sizes?.[0] || product.size);
  const [selectedColor, setSelectedColor] = useState(product.colors?.[0]?.name || 'Standard');

  // Index-based selection so duplicate URLs still highlight the right thumb.
  const activeIndex = Math.max(0, images.indexOf(selectedImage));

  const nextImage = () => {
    if (images.length < 2) return;
    setSelectedImage(images[(activeIndex + 1) % images.length]);
  };
  const prevImage = () => {
    if (images.length < 2) return;
    setSelectedImage(images[(activeIndex - 1 + images.length) % images.length]);
  };

  const primaryCategory = (product.categories ?? []).find(c => isKnownCategory(c));

  const handleFavorite = () => {
    setIsFavorite(f => !f);
    onFavoriteTap();
  };

  const bsPrice = (product.price * config.bcvRate).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handleConsultWhatsApp = () => {
    const msg = lang === 'es'
      ? `¡Hola Monada Store! Me interesa la prenda: *${product.name}*\n• Talla: *${selectedSize}*\n• Color: *${selectedColor}*\n• Precio: *$${product.price.toFixed(2)} USD* (≈ Bs. ${bsPrice})\n\n¿Tienen disponibilidad para envío/entrega? ¡Gracias!`
      : `Hello Monada Store! I am interested in: *${product.name}*\n• Size: *${selectedSize}*\n• Color: *${selectedColor}*\n• Price: *$${product.price.toFixed(2)} USD*\n\nIs this available? Thank you!`;

    const url = buildWaLink(config.whatsappNumber, msg);
    if (!url) return;
    window.open(url, '_blank');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: 'var(--theme-bg)',
      color: 'var(--theme-ink)',
    }}>
      {/* Sticky Navigation Bar */}
      <div style={{
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: 'var(--theme-bg)',
        borderBottom: '1px solid var(--theme-line)',
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

        {/* Brand Name / Logo */}
        <img
          src="/logo-transparent.png"
          alt="Monada Store"
          style={{
            height: 38,
            objectFit: 'contain',
            filter: 'var(--logo-filter)',
          }}
        />

        <button
          onClick={handleFavorite}
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
            transition: 'transform 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <IconHeart
            size={18}
            fill={isFavorite ? 'var(--monada-danger)' : 'none'}
            style={{ color: isFavorite ? 'var(--monada-danger)' : 'var(--theme-muted)' }}
          />
        </button>
      </div>

      {/* Main Content Layout */}
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        width: '100%',
        padding: '24px 24px 100px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 36,
        alignItems: 'start',
      }}>
        {/* Left: Gallery & Main Image */}
        <div>
          <div style={{
            position: 'relative',
            borderRadius: 24,
            overflow: 'hidden',
            aspectRatio: '4/5',
            background: 'var(--theme-surface-soft)',
            boxShadow: 'var(--theme-card-shadow)',
          }}>
            <img
              src={selectedImage}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />

            {/* Prev / next arrows, only when there is more than one photo.
                On narrow screens the thumbnail rail is hidden (see below), so
                the arrows sit at the edges without colliding with it. */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevImage}
                  aria-label={lang === 'es' ? 'Foto anterior' : 'Previous photo'}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: 'rgba(23, 23, 23, 0.6)',
                    backdropFilter: 'blur(6px)',
                    border: 'none',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                  }}
                >
                  <IconArrowLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={nextImage}
                  aria-label={lang === 'es' ? 'Foto siguiente' : 'Next photo'}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%) rotate(180deg)',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: 'rgba(23, 23, 23, 0.6)',
                    backdropFilter: 'blur(6px)',
                    border: 'none',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                  }}
                >
                  <IconArrowLeft size={16} />
                </button>
              </>
            )}

            {/* Side thumbnail rail — desktop only. On phones it would sit on
                top of the next/prev arrows, so the counter and swipe-less
                arrows carry navigation there instead. */}
            {images.length > 1 && !isMobile && (
              <div style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(23, 23, 23, 0.75)',
                backdropFilter: 'blur(8px)',
                borderRadius: 20,
                padding: '6px 5px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                maxHeight: '70%',
                overflowY: 'auto',
              }}>
                {images.map((img, i) => (
                  <button
                    key={`${img}-${i}`}
                    type="button"
                    onClick={() => setSelectedImage(img)}
                    aria-label={`${lang === 'es' ? 'Ver foto' : 'View photo'} ${i + 1}`}
                    style={{
                      width: 44,
                      height: 50,
                      borderRadius: 12,
                      overflow: 'hidden',
                      padding: activeIndex === i ? 2 : 0,
                      border: `2px solid ${activeIndex === i ? 'var(--monada-sage)' : 'transparent'}`,
                      cursor: 'pointer',
                      background: 'transparent',
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                    }}
                  >
                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 9 }} />
                  </button>
                ))}
              </div>
            )}

            {/* Photo counter */}
            {images.length > 1 && (
              <div style={{
                position: 'absolute',
                bottom: 14,
                right: 14,
                background: 'rgba(23, 23, 23, 0.75)',
                backdropFilter: 'blur(6px)',
                padding: '5px 11px',
                borderRadius: 30,
                fontSize: 11,
                fontWeight: 600,
                color: '#FFFFFF',
              }}>
                {activeIndex + 1} / {images.length}
              </div>
            )}

            {/* Badge overlay */}
            {primaryCategory && (
              <div style={{
                position: 'absolute',
                bottom: 14,
                left: 14,
                background: 'rgba(23, 23, 23, 0.75)',
                backdropFilter: 'blur(6px)',
                padding: '6px 12px',
                borderRadius: 30,
                fontSize: 11,
                fontWeight: 600,
                color: '#FFFFFF',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}>
                {categoryLabel(primaryCategory, lang)}
              </div>
            )}
          </div>
        </div>

        {/* Right: Product Spec & Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Header & Price */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--theme-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500 }}>
                {product.series}
              </span>
              <span style={{ color: 'var(--theme-line)' }}>•</span>
              <span style={{ fontSize: 12, color: 'var(--monada-terracotta)', fontWeight: 600 }}>
                <IconStar size={13} style={{ color: 'var(--monada-terracotta)' }} /> {product.rating || 4.9} ({product.reviewCount || 42} {t.reviews})
              </span>
            </div>

            <h1 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 32,
              fontWeight: 600,
              color: 'var(--theme-ink)',
              letterSpacing: '-0.5px',
              lineHeight: 1.15,
              marginBottom: 8,
            }}>
              {product.name}
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
              <span style={{
                fontSize: 28,
                fontWeight: 700,
                color: 'var(--monada-terracotta)',
                fontFamily: 'Playfair Display, serif',
              }}>
                ${product.price.toFixed(2)} USD
              </span>
            </div>
            {config.showBsRate && (
              <div style={{ fontSize: 12, color: 'var(--theme-muted)', marginTop: 2, fontWeight: 500 }}>
                ≈ Bs. {bsPrice}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--theme-muted)', marginTop: 4 }}>
              {t.taxesIncluded}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--theme-line)' }} />

          {/* Description */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-ink)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {t.storyCraft}
            </div>
            <p style={{ fontSize: 14, color: 'var(--theme-ink-secondary)', lineHeight: 1.7, fontWeight: 400 }}>
              {product.description}
            </p>
          </div>

          {/* Color Selector */}
          {product.colors && product.colors.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-ink)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {t.color}: <span style={{ fontWeight: 400, color: 'var(--theme-muted)', textTransform: 'none' }}>{selectedColor}</span>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {product.colors.map(col => (
                  <button
                    key={col.name}
                    onClick={() => setSelectedColor(col.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      borderRadius: 12,
                      border: `1.5px solid ${selectedColor === col.name ? 'var(--monada-sage)' : 'var(--theme-line)'}`,
                      background: selectedColor === col.name ? 'var(--monada-sage-soft)' : 'var(--theme-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: col.hex,
                      border: '1px solid rgba(0,0,0,0.1)',
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--theme-ink)' }}>{col.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Size Selector + Size Guide Link */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-ink)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {t.selectSize}
              </span>
              <button
                type="button"
                onClick={onOpenSizeGuide}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 12,
                  color: 'var(--monada-sage)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <IconRuler size={14} />
                <span>{lang === 'es' ? 'Guía de Tallas' : 'Size Guide'}</span>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(product.sizes || ['S', 'M', 'L', 'XL']).map(sz => (
                <button
                  key={sz}
                  onClick={() => setSelectedSize(sz)}
                  style={{
                    minWidth: 48,
                    height: 44,
                    padding: '0 16px',
                    borderRadius: 12,
                    background: selectedSize === sz ? 'var(--theme-ink)' : 'var(--theme-surface)',
                    border: `1.5px solid ${selectedSize === sz ? 'var(--theme-ink)' : 'var(--theme-line)'}`,
                    color: selectedSize === sz ? 'var(--theme-bg)' : 'var(--theme-ink)',
                    fontFamily: 'Poppins, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons: Add to Bag + Consult on WhatsApp */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            paddingTop: 8,
          }}>
            <button
              onClick={() => onAddToCart(product, selectedSize, selectedColor)}
              style={{
                width: '100%',
                height: 52,
                borderRadius: 14,
                background: 'var(--monada-sage)',
                color: '#FFFFFF',
                fontFamily: 'Poppins, sans-serif',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(117,138,119,0.3)',
                transition: 'transform 0.15s ease',
                border: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <IconBag size={18} />
              <span>{t.addToCart} • ${product.price.toFixed(2)} USD</span>
            </button>

            {/* Direct WhatsApp Consultation */}
            <button
              onClick={handleConsultWhatsApp}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 14,
                background: 'var(--theme-surface)',
                color: 'var(--theme-ink)',
                fontFamily: 'Poppins, sans-serif',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                border: '1.5px solid var(--whatsapp-green)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-surface-soft)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--theme-surface)')}
            >
              <IconWhatsApp size={18} style={{ color: 'var(--whatsapp-green)' }} />
              <span>{t.consultOnWhatsapp}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
