import { ClothingProduct } from '../types';
import { Language, translations } from '../i18n/translations';

interface WishlistPageProps {
  products: ClothingProduct[];
  lang: Language;
  onBack: () => void;
  onProductTap: (product: ClothingProduct) => void;
  onFavoriteTap: (product: ClothingProduct) => void;
  onAddToCart: (product: ClothingProduct) => void;
}

export default function WishlistPage({
  products,
  lang,
  onBack,
  onProductTap,
  onFavoriteTap,
  onAddToCart,
}: WishlistPageProps) {
  const t = translations[lang];
  const favoriteProducts = products.filter(p => p.isFavorite);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: '#FAF8F5',
      color: '#171717',
    }}>
      {/* Top Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid #E7E3DC',
        background: '#FAF8F5',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
        }}>
          <button
            onClick={onBack}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#FFFFFF',
              border: '1px solid #E7E3DC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#171717',
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 22,
              fontWeight: 600,
              color: '#171717',
              letterSpacing: '-0.2px',
            }}>
              {t.favoritePieces}
            </h1>
            <span style={{
              fontFamily: 'Poppins, sans-serif',
              fontSize: 12,
              color: '#7E7E84',
              fontWeight: 400,
            }}>
              {favoriteProducts.length} {favoriteProducts.length === 1 ? 'prenda' : 'prendas'}
            </span>
          </div>

          <div style={{ width: 40 }} />
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        padding: '28px 24px 80px',
        maxWidth: 1200,
        margin: '0 auto',
        width: '100%',
      }}>
        {favoriteProducts.length === 0 ? (
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
              background: '#EBF0EC',
              color: '#758A77',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
            }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </div>
            <h3 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 22,
              fontWeight: 600,
              color: '#171717',
              marginBottom: 8,
            }}>
              {t.wishlistEmptyTitle}
            </h3>
            <p style={{
              fontSize: 13,
              color: '#7E7E84',
              maxWidth: 320,
              lineHeight: 1.6,
              marginBottom: 24,
            }}>
              {t.wishlistEmptyDesc}
            </p>
            <button
              onClick={onBack}
              style={{
                padding: '12px 28px',
                borderRadius: 12,
                background: '#758A77',
                color: '#FFFFFF',
                fontFamily: 'Poppins, sans-serif',
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
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 20,
          }}>
            {favoriteProducts.map(product => (
              <div
                key={product.id}
                onClick={() => onProductTap(product)}
                style={{
                  background: '#FFFFFF',
                  borderRadius: 20,
                  overflow: 'hidden',
                  border: '1px solid #E7E3DC',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.03)';
                }}
              >
                {/* Image */}
                <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', background: '#F1ECE5' }}>
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onFavoriteTap(product);
                    }}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.92)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#D64545" stroke="#D64545" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  </button>
                </div>

                {/* Info */}
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 11, color: '#7E7E84', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 500 }}>
                      {product.series}
                    </span>
                    <h4 style={{
                      fontFamily: 'Playfair Display, serif',
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#171717',
                      margin: '4px 0 6px',
                      lineHeight: 1.2,
                    }}>
                      {product.name}
                    </h4>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#9B6F5A' }}>
                      ${product.price.toFixed(2)} USD
                    </div>
                  </div>

                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onAddToCart(product);
                    }}
                    style={{
                      marginTop: 14,
                      width: '100%',
                      padding: '10px 0',
                      borderRadius: 10,
                      background: '#758A77',
                      color: '#FFFFFF',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {t.moveToCart}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
