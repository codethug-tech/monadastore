import { useState, useMemo } from 'react';
import { ClothingProduct } from '../types';
import { Language, translations } from '../i18n/translations';
import { StoreConfig } from '../config/storeConfig';
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  categoryLabel,
  isKnownCategory,
} from '../config/categories';
import { buildWaLink, isWhatsAppConfigured } from '../lib/phone';
import { isUsableSocialUrl } from '../lib/social';
import { useIsMobile } from '../lib/useIsMobile';
import {
  IconSearch,
  IconCamera,
  IconSun,
  IconMoon,
  IconInstagram,
  IconTikTok,
  IconWhatsApp,
  IconBag,
  IconLock,
} from './Icons';

interface StorePageProps {
  products: ClothingProduct[];
  /** True while the first catalog fetch is still in flight. */
  loading?: boolean;
  cartCount: number;
  lang: Language;
  theme: 'light' | 'dark';
  config: StoreConfig;
  onLanguageChange: (lang: Language) => void;
  onToggleTheme: () => void;
  onOpenAdmin: () => void;
  onProductTap: (product: ClothingProduct) => void;
  onCartTap: () => void;
}

export default function StorePage({
  products,
  loading = false,
  cartCount,
  lang,
  theme,
  config,
  onLanguageChange,
  onToggleTheme,
  onOpenAdmin,
  onProductTap,
  onCartTap,
}: StorePageProps) {
  const t = translations[lang];
  const isMobile = useIsMobile();

  const categories = [
    { key: 'all', label: t.allCurations },
    ...CATEGORIES.map(c => ({
      key: c.slug,
      label: lang === 'es' ? c.es : c.en,
      group: c.group,
    })),
  ];

  const [selectedCategory, setSelectedCategory] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc' | 'rating'>('default');

  // Only offer a category pill when something is actually in it, so the
  // storefront never shows an empty section.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      for (const c of p.categories ?? []) {
        counts[c] = (counts[c] ?? 0) + 1;
      }
    }
    return counts;
  }, [products]);

  // Products whose categories are all unknown (legacy tags, or none at all)
  // would otherwise be invisible. Surface them under "Sin categoría".
  const uncategorisedCount = useMemo(
    () =>
      products.filter(p => !(p.categories ?? []).some(c => isKnownCategory(c))).length,
    [products]
  );

  const visibleCategories = useMemo(() => {
    const base = categories.filter(c => c.key === 'all' || (categoryCounts[c.key] ?? 0) > 0);
    if (uncategorisedCount > 0) {
      base.push({
        key: '__uncategorised__',
        label: lang === 'es' ? 'Sin categoría' : 'Uncategorised',
        group: undefined as never,
      });
    }
    return base;
  }, [categories, categoryCounts, uncategorisedCount, lang]);

  const filteredProducts = useMemo(() => {
    let result = products;

    // Filter by category
    const cat = categories[selectedCategory];
    if (cat && cat.key === '__uncategorised__') {
      result = result.filter(p => !(p.categories ?? []).some(c => isKnownCategory(c)));
    } else if (cat && cat.key !== 'all') {
      result = result.filter(p => (p.categories ?? []).includes(cat.key));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.series.toLowerCase().includes(q) ||
        (p.categories ?? []).some(c =>
          c.toLowerCase().includes(q) || categoryLabel(c, lang).toLowerCase().includes(q)
        )
      );
    }

    // Sort
    if (sortBy === 'price-asc') {
      result = [...result].sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
      result = [...result].sort((a, b) => b.price - a.price);
    } else if (sortBy === 'rating') {
      result = [...result].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return result;
  }, [products, categories, selectedCategory, searchQuery, sortBy, lang]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: 'var(--theme-bg)',
      color: 'var(--theme-ink)',
    }}>
      {/* Top Banner Notice with BCV Rate */}
      <header style={{
        background: 'var(--theme-bg)',
        borderBottom: '1px solid var(--theme-line)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{
          background: 'var(--monada-sage)',
          color: '#FFFFFF',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 0.8,
          textAlign: 'center',
          padding: '7px 16px',
        }}>
          <span>{t.announcement}</span>
        </div>

        {/* Main Header with Logo, Socials & Controls */}
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: isMobile ? '10px 14px' : '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobile ? 6 : 12,
        }}>
          {/* Left Controls: Search, Theme Toggle, Language */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, flexShrink: 0 }}>
            {/* Search */}
            <button
              onClick={() => setIsSearchOpen(s => !s)}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--theme-ink)',
              }}
              title={lang === 'es' ? 'Buscar prenda' : 'Search apparel'}
            >
              <IconSearch size={17} />
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={onToggleTheme}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--theme-ink)',
              }}
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
            >
              {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
            </button>

            {/* Language Switcher */}
            <div style={{
              display: 'flex',
              background: 'var(--theme-surface)',
              borderRadius: 20,
              padding: 2,
              border: '1px solid var(--theme-line)',
            }}>
              <button
                onClick={() => onLanguageChange('es')}
                style={{
                  padding: '4px 8px',
                  borderRadius: 14,
                  border: 'none',
                  background: lang === 'es' ? 'var(--monada-sage)' : 'transparent',
                  color: lang === 'es' ? '#FFFFFF' : 'var(--theme-muted)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                ES
              </button>
              <button
                onClick={() => onLanguageChange('en')}
                style={{
                  padding: '4px 8px',
                  borderRadius: 14,
                  border: 'none',
                  background: lang === 'en' ? 'var(--monada-sage)' : 'transparent',
                  color: lang === 'en' ? '#FFFFFF' : 'var(--theme-muted)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                EN
              </button>
            </div>
          </div>

          {/* Centered Monada Logo - Responsive & Theme Adaptive */}
          <div
            onClick={() => { setSelectedCategory(0); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
          >
            <img
              src="/logo-transparent.png"
              alt="Monada Store"
              style={{
                height: 48,
                maxWidth: 160,
                objectFit: 'contain',
                display: 'block',
                filter: 'var(--logo-filter)',
                transition: 'filter 0.3s ease',
              }}
            />
          </div>

          {/* Right Actions: Socials & Bag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, flexShrink: 0 }}>
            {/* Instagram Link — hidden on mobile to keep the header on one line */}
            {isUsableSocialUrl(config.instagramUrl) && !isMobile && (
              <a
                href={config.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--theme-ink)',
                  textDecoration: 'none',
                }}
                title="Instagram"
              >
                <IconInstagram size={17} />
              </a>
            )}

            {/* Bag */}
            <button
              onClick={onCartTap}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'var(--monada-sage)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                color: '#FFFFFF',
                boxShadow: '0 4px 14px rgba(117,138,119,0.35)',
              }}
              title={t.shoppingBag}
            >
              <IconBag size={17} />
              {cartCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  background: 'var(--theme-ink)',
                  color: 'var(--theme-bg)',
                  width: 17,
                  height: 17,
                  borderRadius: '50%',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid var(--theme-bg)',
                }}>
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Live Search Bar */}
        {isSearchOpen && (
          <div style={{
            background: 'var(--theme-surface)',
            borderTop: '1px solid var(--theme-line)',
            padding: '12px 24px',
            animation: 'fadeIn 0.2s ease',
          }}>
            <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', gap: 12 }}>
              <input
                type="text"
                autoFocus
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: '1.5px solid var(--monada-sage)',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  outline: 'none',
                  background: 'var(--theme-bg)',
                  color: 'var(--theme-ink)',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    padding: '0 14px',
                    borderRadius: 10,
                    background: 'var(--theme-surface-soft)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--theme-muted)',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Editorial Subheader */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        width: '100%',
        padding: '28px 24px 14px',
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              color: 'var(--monada-sage)',
            }}>
              {t.heroSubtitle}
            </span>
            <h2 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 'clamp(26px, 3.5vw, 38px)',
              fontWeight: 600,
              color: 'var(--theme-ink)',
              letterSpacing: '-0.5px',
              marginTop: 4,
              lineHeight: 1.2,
            }}>
              {t.heroTitlePrefix}{' '}
              <span style={{
                fontStyle: 'italic',
                color: 'var(--monada-terracotta)',
                borderBottom: '2px solid var(--monada-sage)',
                paddingBottom: 2,
              }}>
                {t.heroTitleHighlight}
              </span>
            </h2>
          </div>

          {/* Sort Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--theme-muted)', fontWeight: 500 }}>{t.sortBy}</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid var(--theme-line)',
                background: 'var(--theme-surface)',
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--theme-ink)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="default">{t.sortDefault}</option>
              <option value="price-asc">{t.sortPriceAsc}</option>
              <option value="price-desc">{t.sortPriceDesc}</option>
              <option value="rating">{t.sortRating}</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          padding: '20px 0 6px',
          scrollbarWidth: 'none',
        }}>
          {visibleCategories.map(cat => {
            // Index into the full list so selection survives filtering
            const i = categories.findIndex(c => c.key === cat.key);
            const isSelected = selectedCategory === i;
            const count =
              cat.key === 'all'
                ? products.length
                : cat.key === '__uncategorised__'
                  ? uncategorisedCount
                  : categoryCounts[cat.key] ?? 0;
            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(i)}
                style={{
                  flexShrink: 0,
                  padding: '9px 18px',
                  borderRadius: 12,
                  background: isSelected ? 'var(--theme-ink)' : 'var(--theme-surface)',
                  color: isSelected ? 'var(--theme-bg)' : 'var(--theme-muted)',
                  border: `1px solid ${isSelected ? 'var(--theme-ink)' : 'var(--theme-line)'}`,
                  fontSize: 13,
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 4px 14px rgba(0,0,0,0.15)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <span>{cat.label}</span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 20,
                  background: isSelected ? 'rgba(255,255,255,0.18)' : 'var(--theme-surface-soft)',
                  color: isSelected ? 'var(--theme-bg)' : 'var(--theme-muted)',
                  minWidth: 16,
                  textAlign: 'center',
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Catalog Grid */}
      <main style={{
        maxWidth: 1200,
        margin: '0 auto',
        width: '100%',
        padding: '10px 24px 80px',
        flex: 1,
      }}>
        {loading && products.length === 0 ? (
          // Skeleton grid: never tell a customer "no products" while the
          // catalog is still loading.
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 22,
          }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--theme-surface)',
                  borderRadius: 22,
                  border: '1px solid var(--theme-line)',
                  overflow: 'hidden',
                }}
              >
                <div style={{
                  width: '100%',
                  aspectRatio: '3/4',
                  background: 'var(--theme-surface-soft)',
                  animation: 'pulse 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.08}s`,
                }} />
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ height: 10, width: '40%', borderRadius: 4, background: 'var(--theme-surface-soft)' }} />
                  <div style={{ height: 14, width: '75%', borderRadius: 4, background: 'var(--theme-surface-soft)' }} />
                  <div style={{ height: 12, width: '30%', borderRadius: 4, background: 'var(--theme-surface-soft)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '70px 20px',
            color: 'var(--theme-muted)',
          }}>
            <p style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, color: 'var(--theme-ink)', marginBottom: 8 }}>
              {t.noProductsFound}
            </p>
            <button
              onClick={() => { setSearchQuery(''); setSelectedCategory(0); }}
              style={{
                marginTop: 16,
                padding: '10px 22px',
                borderRadius: 10,
                background: 'var(--monada-sage)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t.resetFilters}
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 22,
          }}>
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                config={config}
                lang={lang}
                onTap={() => onProductTap(product)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer with Brand, Social Media & Security Link */}
      <footer style={{
        background: 'var(--theme-surface)',
        borderTop: '1px solid var(--theme-line)',
        padding: '36px 24px 100px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <img
            src="/logo-transparent.png"
            alt="Monada Store"
            style={{
              height: 40,
              objectFit: 'contain',
              filter: 'var(--logo-filter)',
            }}
          />
          <p style={{ fontSize: 12, color: 'var(--theme-muted)', lineHeight: 1.6 }}>
            {lang === 'es'
              ? 'Piezas seleccionadas con estética minimalista y confección contemporánea. Envíos a toda Venezuela.'
              : 'Curated apparel with minimalist aesthetics and contemporary tailoring. Venezuela & Worldwide.'}
          </p>

          {/* Social Icons Row */}
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            {isUsableSocialUrl(config.instagramUrl) && (
              <a
                href={config.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'var(--theme-surface-soft)',
                  border: '1px solid var(--theme-line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--theme-ink)',
                  textDecoration: 'none',
                }}
                title="Instagram"
              >
                <IconInstagram size={17} />
              </a>
            )}

            {isUsableSocialUrl(config.tiktokUrl) && (
              <a
                href={config.tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'var(--theme-surface-soft)',
                  border: '1px solid var(--theme-line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--theme-ink)',
                  textDecoration: 'none',
                }}
                title="TikTok"
              >
                <IconTikTok size={16} />
              </a>
            )}

            {isWhatsAppConfigured(config.whatsappNumber) && (
              <a
                href={buildWaLink(config.whatsappNumber, '') ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'var(--theme-surface-soft)',
                  border: '1px solid var(--theme-line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--whatsapp-green)',
                  textDecoration: 'none',
                }}
                title="WhatsApp"
              >
                <IconWhatsApp size={18} />
              </a>
            )}
          </div>

          {/* Subtle Private Admin Portal Access */}
          <div style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--theme-line)',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--theme-muted)',
          }}>
            <span>© {new Date().getFullYear()} {config.storeName}</span>

            <button
              onClick={onOpenAdmin}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--theme-muted)',
                fontSize: 11,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 8px',
                borderRadius: 6,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--monada-sage)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--theme-muted)')}
            >
              <IconLock size={12} />
              <span>{lang === 'es' ? 'Portal Administrativo' : 'Admin Portal'}</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Floating Bottom Nav */}
      <div style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(23, 23, 23, 0.94)',
        backdropFilter: 'blur(12px)',
        borderRadius: 40,
        padding: '8px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 28,
        boxShadow: '0 16px 36px rgba(0,0,0,0.3)',
        zIndex: 50,
      }}>
        <button
          onClick={() => { setSelectedCategory(0); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          style={{
            background: 'transparent',
            color: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          <IconBag size={18} style={{ color: 'var(--monada-sage)' }} />
          <span style={{ color: 'var(--monada-sage)' }}>{t.navCatalog}</span>
        </button>

        <button
          onClick={onCartTap}
          style={{
            background: 'transparent',
            color: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          <IconBag size={18} />
          <span>{t.navBag} ({cartCount})</span>
        </button>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  config,
  lang,
  onTap,
}: {
  product: ClothingProduct;
  config: StoreConfig;
  lang: Language;
  onTap: () => void;
}) {
  const bsPrice = (product.price * config.bcvRate).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const photoCount = (product.gallery ?? []).filter(Boolean).length;
  const coverImage = product.imageUrl || product.gallery?.[0] || '';
  const primaryCategory = (product.categories ?? []).find(c => isKnownCategory(c));

  return (
    <div
      onClick={onTap}
      role="button"
      tabIndex={0}
      aria-label={product.name}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      style={{
        background: 'var(--theme-surface)',
        borderRadius: 22,
        overflow: 'hidden',
        border: '1px solid var(--theme-line)',
        cursor: 'pointer',
        boxShadow: 'var(--theme-card-shadow)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = 'var(--theme-card-shadow-hover)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'var(--theme-card-shadow)';
      }}
    >
      {/* Product Image Area */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '3/4',
        background: 'var(--theme-surface-soft)',
        overflow: 'hidden',
      }}>
        <img
          src={coverImage}
          alt={product.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
          onError={e => {
            // A dead image URL should not leave a broken-image icon in the grid.
            const el = e.currentTarget;
            el.style.display = 'none';
            const parent = el.parentElement;
            if (parent && !parent.querySelector('[data-img-fallback]')) {
              const fb = document.createElement('div');
              fb.setAttribute('data-img-fallback', '1');
              fb.style.cssText =
                'width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--theme-muted);font-size:11px;';
              fb.textContent = product.name;
              parent.appendChild(fb);
            }
          }}
        />

        {/* Photo count, so a multi-image product is obvious from the grid */}
        {photoCount > 1 && (
          <span style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: 'rgba(23, 23, 23, 0.72)',
            backdropFilter: 'blur(6px)',
            padding: '3px 8px',
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 600,
            color: '#FFFFFF',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <IconCamera size={10} />
            {photoCount}
          </span>
        )}

        {/* Category Pill */}
        {primaryCategory && (
          <span style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            background: 'rgba(23, 23, 23, 0.75)',
            backdropFilter: 'blur(6px)',
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 600,
            color: '#FFFFFF',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}>
            {categoryLabel(primaryCategory, lang)}
          </span>
        )}
      </div>

      {/* Info Content */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontSize: 11,
            color: 'var(--theme-muted)',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            fontWeight: 500,
          }}>
            {product.series}
          </div>

          <h3 style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--theme-ink)',
            margin: '4px 0 6px',
            lineHeight: 1.25,
          }}>
            {product.name}
          </h3>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--theme-line)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--monada-terracotta)',
                fontFamily: 'Playfair Display, serif',
              }}>
                ${product.price.toFixed(2)} USD
              </span>
              {config.showBsRate && config.bcvRate > 0 && (
                <div style={{ fontSize: 10, color: 'var(--theme-muted)', marginTop: 1 }}>
                  Bs. {bsPrice}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              {(product.sizes || [product.size]).slice(0, 3).map(s => (
                <span key={s} style={{
                  fontSize: 10,
                  color: 'var(--theme-muted)',
                  background: 'var(--theme-surface-soft)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: '1px solid var(--theme-line)',
                }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
