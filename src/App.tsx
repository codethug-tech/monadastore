import { useState, useCallback, useEffect, useRef } from 'react';
import { ClothingProduct, ClothingCartItem } from './types';
import { clothingProducts as initialProducts } from './data/products';
import { Language, translations } from './i18n/translations';
import { StoreConfig, DEFAULT_STORE_CONFIG } from './config/storeConfig';
import { cartLineKey, itemLineKey, addLine, increaseLine, decreaseLine, removeLine, cartCount, cartSubtotal } from './lib/cart';
import {
  readSupabaseConfig,
  fetchProducts,
  fetchStoreSettings,
  saveProducts,
  saveStoreSettings,
  deleteProduct,
} from './services/supabase';
import StorePage from './components/StorePage';
import DetailPage from './components/DetailPage';
import CartPage from './components/CartPage';
import CheckoutModal from './components/CheckoutModal';
import SizeGuideModal from './components/SizeGuideModal';
import AdminPortal from './components/AdminPortal';
import FloatingWhatsApp from './components/FloatingWhatsApp';

type Page = 'store' | 'detail' | 'cart';

function App() {
  const [page, setPage] = useState<Page>('store');

  // Theme State: 'light' | 'dark'
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('monada_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Language State: 'es' | 'en'
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('monada_lang');
    return (saved === 'en' || saved === 'es') ? saved : 'es';
  });

  // Store Configuration State (WhatsApp, BCV rate, socials)
  const [config, setConfig] = useState<StoreConfig>(() => {
    const saved = localStorage.getItem('monada_store_config');
    if (saved) {
      try {
        return { ...DEFAULT_STORE_CONFIG, ...JSON.parse(saved) };
      } catch (e) {
        return DEFAULT_STORE_CONFIG;
      }
    }
    return DEFAULT_STORE_CONFIG;
  });

  // Products Catalog State (editable via Admin)
  const [products, setProducts] = useState<ClothingProduct[]>(() => {
    const saved = localStorage.getItem('monada_custom_products');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return initialProducts;
      }
    }
    return initialProducts;
  });

  // Cart survives a reload. A customer who refreshes, or comes back from
  // WhatsApp, must not find an empty bag.
  const [cartItems, setCartItems] = useState<ClothingCartItem[]>(() => {
    try {
      const saved = localStorage.getItem('monada_cart');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      // Drop anything malformed rather than letting it break the cart page.
      return parsed.filter(
        (item): item is ClothingCartItem =>
          Boolean(item) &&
          typeof item === 'object' &&
          Boolean(item.product) &&
          typeof item.product?.id === 'number' &&
          typeof item.quantity === 'number' &&
          item.quantity > 0 &&
          typeof item.selectedSize === 'string'
      );
    } catch {
      return [];
    }
  });
  const [selectedProduct, setSelectedProduct] = useState<ClothingProduct | null>(null);

  // Latest catalog, so the boot sync can push local data up without stale closures
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // Modals state
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(() => window.location.hash === '#admin');
  const [toast, setToast] = useState<{ message: string; sub?: string } | null>(null);

  const t = translations[lang];

  // Listen for hash changes e.g. #admin
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#admin') {
        setIsAdminOpen(true);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('monada_theme', theme);
  }, [theme]);

  // Persist language
  useEffect(() => {
    localStorage.setItem('monada_lang', lang);
  }, [lang]);

  // Persist the cart so a reload never empties the bag.
  useEffect(() => {
    try {
      localStorage.setItem('monada_cart', JSON.stringify(cartItems));
    } catch {
      /* quota or private mode: the in-memory cart still works */
    }
  }, [cartItems]);

  // True until the first catalog fetch settles, so the storefront can show a
  // loading state instead of briefly claiming there are no products.
  const [catalogLoading, setCatalogLoading] = useState(() => readSupabaseConfig().isConnected);

  // Pull catalog + settings from Supabase.
  //
  // `seedWhenEmpty` is only true on the very first boot: on that first
  // connection an empty remote table gets filled from whatever this browser
  // already has. Later re-syncs never write, so a phone holding an old catalog
  // can never overwrite products added from another device.
  const syncFromRemote = useCallback(async (seedWhenEmpty: boolean): Promise<void> => {
    if (!readSupabaseConfig().isConnected) return;

    const [remoteProducts, remoteSettings] = await Promise.all([
      fetchProducts(),
      fetchStoreSettings(),
    ]);

    if (remoteProducts && remoteProducts.length > 0) {
      // The database is the source of truth. Replace the local snapshot so a
      // product added on another device shows up here too.
      setProducts(remoteProducts);
      try {
        localStorage.setItem('monada_custom_products', JSON.stringify(remoteProducts));
      } catch {
        /* quota: the in-memory catalog is still correct */
      }
    } else if (remoteProducts && remoteProducts.length === 0 && seedWhenEmpty) {
      // Empty remote table on first boot: seed it from this browser.
      await saveProducts(productsRef.current);
    }
    // remoteProducts === null means the read failed; keep the local catalog
    // rather than blanking the storefront.

    if (remoteSettings) {
      setConfig(prev => {
        const merged = { ...prev, ...remoteSettings };
        localStorage.setItem('monada_store_config', JSON.stringify(merged));
        return merged;
      });
    }
  }, []);

  // Boot sync, then keep the catalog fresh while the page stays open.
  //
  // Phones usually keep the tab alive in the background, so a product added from
  // the admin portal never appeared until a hard refresh. Re-syncing whenever the
  // page becomes visible again, regains focus, or the network returns makes the
  // storefront catch up without a reload.
  useEffect(() => {
    if (!readSupabaseConfig().isConnected) {
      setCatalogLoading(false);
      return;
    }

    let cancelled = false;
    const run = async (seedWhenEmpty: boolean) => {
      try {
        await syncFromRemote(seedWhenEmpty);
      } catch (err) {
        console.warn('[app] catalog sync failed:', err);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    };

    // First load: pull, and seed the database if it has never been filled.
    void run(true);

    const resync = () => {
      if (document.visibilityState === 'hidden') return;
      void run(false);
    };

    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
    };
  }, [syncFromRemote]);

  // Persist config changes (localStorage always, Supabase when configured)
  const handleSaveConfig = (updated: StoreConfig) => {
    setConfig(updated);
    localStorage.setItem('monada_store_config', JSON.stringify(updated));
    showToast(
      lang === 'es' ? 'Ajustes guardados' : 'Settings saved',
      `WhatsApp: ${updated.whatsappNumber}`
    );
    if (readSupabaseConfig().isConnected) {
      saveStoreSettings(updated).then(ok => {
        if (!ok) {
          showToast(
            lang === 'es' ? 'Guardado localmente' : 'Saved locally',
            lang === 'es'
              ? 'Supabase rechazó el cambio. Revisa las credenciales.'
              : 'Supabase rejected the write. Check your credentials.'
          );
        }
      });
    }
  };

  // Persist products changes.
  //
  // The toast must not claim success before the database write resolves: that
  // is what hid a rejected write behind a product that only existed in
  // localStorage, so it showed on the device that made it and nowhere else.
  const handleSaveProducts = (updated: ClothingProduct[]) => {
    setProducts(updated);
    let storedLocally = true;
    try {
      localStorage.setItem('monada_custom_products', JSON.stringify(updated));
    } catch {
      // Data URLs for photos can exceed the ~5 MB origin quota. The catalog is
      // still live in memory and syncs to Supabase, so warn instead of dying.
      storedLocally = false;
    }

    if (!readSupabaseConfig().isConnected) {
      showToast(
        lang === 'es' ? 'Catálogo actualizado' : 'Catalog updated',
        storedLocally
          ? undefined
          : lang === 'es'
            ? 'Aviso: sin espacio local.'
            : 'Warning: local storage full.'
      );
      return;
    }

    const pendingSub =
      lang === 'es' ? 'Guardando en la nube…' : 'Saving to the cloud…';
    showToast(
      lang === 'es' ? 'Catálogo actualizado' : 'Catalog updated',
      storedLocally ? pendingSub : lang === 'es'
        ? 'Sin espacio local. Guardando en la nube…'
        : 'Local storage full. Saving to the cloud…'
    );

    saveProducts(updated).then(ok => {
      if (ok) {
        showToast(
          lang === 'es' ? 'Catálogo publicado' : 'Catalog published',
          lang === 'es'
            ? 'Visible en todos los dispositivos.'
            : 'Visible on every device.'
        );
      } else {
        // Most likely: the admin session expired, so RLS rejected the write.
        showToast(
          lang === 'es' ? 'No se publicó' : 'Not published',
          lang === 'es'
            ? 'Solo en este navegador. Inicia sesión de nuevo en Admin y vuelve a guardar.'
            : 'This browser only. Sign in to Admin again and re-save.'
        );
      }
    });
  };

  // Deleting a piece must remove it from the database explicitly, because
  // saveProducts no longer prunes rows that are missing from the local list.
  const handleDeleteProduct = (id: number) => {
    const updated = products.filter(p => p.id !== id);
    setProducts(updated);
    try {
      localStorage.setItem('monada_custom_products', JSON.stringify(updated));
    } catch {
      /* quota: the in-memory catalog and Supabase are still correct */
    }
    if (readSupabaseConfig().isConnected) {
      deleteProduct(id).then(ok => {
        if (!ok) {
          showToast(
            lang === 'es' ? 'Eliminado localmente' : 'Deleted locally',
            lang === 'es'
              ? 'Supabase rechazó la eliminación.'
              : 'Supabase rejected the delete.'
          );
        }
      });
    }
  };

  const handleResetProducts = () => {    setProducts(initialProducts);
    localStorage.removeItem('monada_custom_products');
    showToast(lang === 'es' ? 'Catálogo inicial restaurado' : 'Default catalog restored');
    if (readSupabaseConfig().isConnected) {
      saveProducts(initialProducts);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const showToast = (message: string, sub?: string) => {
    setToast({ message, sub });
    setTimeout(() => setToast(null), 2500);
  };

  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const addToCart = useCallback((product: ClothingProduct, size?: string, color?: string) => {
    const chosenSize = size || product.sizes?.[0] || product.size;
    const chosenColor = color || product.colors?.[0]?.name;
    setCartItems(prev => addLine(prev, product, size, color));
    showToast(t.addedToCart, `${product.name} (${t.size}: ${chosenSize})`);
  }, [t]);

  const increaseQuantity = useCallback((line: ClothingCartItem) => {
    const key = itemLineKey(line);
    setCartItems(prev => increaseLine(prev, key));
  }, []);

  const decreaseQuantity = useCallback((line: ClothingCartItem) => {
    const key = itemLineKey(line);
    setCartItems(prev => decreaseLine(prev, key));
  }, []);

  const removeFromCart = useCallback((line: ClothingCartItem) => {
    const key = itemLineKey(line);
    setCartItems(prev => removeLine(prev, key));
    showToast(t.removedFromCart, line.product.name);
  }, [t]);

  const openDetail = (product: ClothingProduct) => {
    const latest = products.find(p => p.id === product.id) ?? product;
    setSelectedProduct(latest);
    setPage('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOrderSuccess = () => {
    setCartItems([]);
    setPage('store');
    showToast(
      lang === 'es' ? '¡Redirigido a WhatsApp!' : 'Redirected to WhatsApp!',
      lang === 'es' ? 'Tu pedido está listo para enviar en el chat' : 'Your order is ready to send in the chat'
    );
  };

  const subTotal = cartSubtotal(cartItems);

  const currentDetailProduct = selectedProduct
    ? products.find(p => p.id === selectedProduct.id) ?? selectedProduct
    : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-bg)' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 24,
          right: 24,
          background: 'var(--theme-surface)',
          color: 'var(--theme-ink)',
          border: '1px solid var(--theme-line)',
          padding: '12px 20px',
          borderRadius: 14,
          zIndex: 99999,
          boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          animation: 'slideUp 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--whatsapp-green)',
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{toast.message}</div>
            {toast.sub && <div style={{ fontSize: 11, color: 'var(--theme-muted)' }}>{toast.sub}</div>}
          </div>
        </div>
      )}

      {/* Pages View */}
      {page === 'store' && (
        <StorePage
          products={products}
          loading={catalogLoading}
          cartCount={cartCount}
          lang={lang}
          theme={theme}
          config={config}
          onLanguageChange={setLang}
          onToggleTheme={toggleTheme}
          onOpenAdmin={() => setIsAdminOpen(true)}
          onProductTap={openDetail}
          onCartTap={() => { setPage('cart'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        />
      )}

      {page === 'detail' && currentDetailProduct && (
        <DetailPage
          product={currentDetailProduct}
          lang={lang}
          config={config}
          onBack={() => setPage('store')}
          onAddToCart={(p, sz, col) => addToCart(p, sz, col)}
          onOpenSizeGuide={() => setIsSizeGuideOpen(true)}
        />
      )}

      {page === 'cart' && (
        <CartPage
          cartItems={cartItems}
          lang={lang}
          freeDeliveryThreshold={config.freeDeliveryThreshold}
          onBack={() => setPage('store')}
          onIncrease={increaseQuantity}
          onDecrease={decreaseQuantity}
          onRemove={removeFromCart}
          onOpenCheckout={() => setIsCheckoutOpen(true)}
        />
      )}

      {/* WhatsApp Catalog Order Builder Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cartItems}
        subTotal={subTotal}
        config={config}
        lang={lang}
        onSuccess={handleOrderSuccess}
      />

      {/* Interactive Size Guide Modal */}
      <SizeGuideModal
        isOpen={isSizeGuideOpen}
        onClose={() => setIsSizeGuideOpen(false)}
        lang={lang}
      />

      {/* Separate Protected Admin Portal with Login Gate & Security */}
      <AdminPortal
        isOpen={isAdminOpen}
        onClose={() => {
          setIsAdminOpen(false);
          if (window.location.hash === '#admin') {
            history.replaceState(null, '', ' ');
          }
        }}
        config={config}
        onSaveConfig={handleSaveConfig}
        products={products}
        onSaveProducts={handleSaveProducts}
        onDeleteProduct={handleDeleteProduct}
        onResetProducts={handleResetProducts}
        lang={lang}
      />

      {/* Global Floating WhatsApp Support Button */}
      <FloatingWhatsApp lang={lang} whatsappNumber={config.whatsappNumber} />
    </div>
  );
}

export default App;
