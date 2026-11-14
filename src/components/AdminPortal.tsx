import { useState, useEffect } from 'react';
import { ClothingProduct } from '../types';
import { StoreConfig } from '../config/storeConfig';
import { Language } from '../i18n/translations';
import { fetchBcvRate } from '../lib/bcv';
import { normalizeSocial } from '../lib/social';
import {
  SUPABASE_SQL_SCHEMA,
  readSupabaseConfig,
  resetSupabaseClient,
  testConnection,
  fetchOrders,
  checkSchemaCapabilities,
  updateOrderStatus,
  deleteOrder,
  ORDER_STATUSES,
  type OrderRecord,
  type OrderStatus,
} from '../services/supabase';
import {
  IconLock,
  IconShield,
  IconSliders,
  IconPackage,
  IconPlus,
  IconEdit,
  IconTrash,
  IconArrowLeft,
  IconLogOut,
  IconCheck,
  IconInstagram,
  IconTikTok,
  IconWhatsApp,
  IconDatabase,
  IconChart,
  IconCopy,
  IconExternalLink,
  IconClose,
  IconReceipt,
  IconRefresh,
  IconTruck,
  IconCard,
} from './Icons';
import ImageUploader from './ImageUploader';
import { normalizeWhatsApp } from '../lib/phone';
import { CATEGORIES, CATEGORY_GROUPS, categoryLabel } from '../config/categories';
import {
  getAdminSession,
  signInAdmin,
  signOutAdmin,
  isAuthAvailable,
  type AdminSession,
} from '../services/auth';
import { getSupabaseClient } from '../services/supabase';

interface AdminPortalProps {  isOpen: boolean;
  onClose: () => void;
  config: StoreConfig;
  onSaveConfig: (updated: StoreConfig) => void;
  products: ClothingProduct[];
  onSaveProducts: (updated: ClothingProduct[]) => void;
  onDeleteProduct: (id: number) => void;
  onResetProducts: () => void;
  lang: Language;
}

export default function AdminPortal({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  products,
  onSaveProducts,
  onDeleteProduct,
  onResetProducts,
  lang,
}: AdminPortalProps) {
  const isEs = lang === 'es';

  const statusLabel = (status: 'all' | OrderStatus, es: boolean): string => {
    const map: Record<'all' | OrderStatus, [string, string]> = {
      all: ['Todos', 'All'],
      pending_whatsapp: ['Enviado a WhatsApp', 'Sent to WhatsApp'],
      confirmed: ['Confirmado', 'Confirmed'],
      preparing: ['Preparando', 'Preparing'],
      shipped: ['Enviado', 'Shipped'],
      delivered: ['Entregado', 'Delivered'],
      cancelled: ['Cancelado', 'Cancelled'],
    };
    return es ? map[status][0] : map[status][1];
  };

  // Security Auth State — real Supabase Auth, verified server-side.
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const authAvailable = isAuthAvailable();

  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Inline Supabase setup, shown only when the build has no credentials.
  // Without this the login screen is a dead end: it tells you to configure
  // Supabase in a tab that is itself behind the login.
  const [setupUrl, setSetupUrl] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState('');

  const handleConnectSupabase = async () => {
    const url = setupUrl.trim();
    const key = setupKey.trim();

    if (!/^https?:\/\//i.test(url)) {
      setSetupError(isEs ? 'La URL debe empezar con https://' : 'The URL must start with https://');
      return;
    }
    if (!key) {
      setSetupError(isEs ? 'Pega la clave anon (public).' : 'Paste the anon (public) key.');
      return;
    }

    setSetupBusy(true);
    setSetupError('');

    // Store first, then prove the credentials actually work before trusting them.
    localStorage.setItem('monada_supabase_url', url);
    localStorage.setItem('monada_supabase_key', key);
    resetSupabaseClient();

    const result = await testConnection();
    setSetupBusy(false);

    if (!result.ok) {
      localStorage.removeItem('monada_supabase_url');
      localStorage.removeItem('monada_supabase_key');
      resetSupabaseClient();
      setSetupError(result.message);
      return;
    }

    // Credentials work. Reload so the whole app picks up the new client.
    window.location.reload();
  };

  // Restore an existing session on mount so a reload does not force a re-login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getAdminSession();
      if (!cancelled) {
        setAdminSession(session);
        setAuthChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect once whether the second-number columns exist, so the form can say so
  // up front rather than letting the owner type into a field that is dropped.
  useEffect(() => {
    let cancelled = false;
    if (!readSupabaseConfig().isConnected) return;
    (async () => {
      const capabilities = await checkSchemaCapabilities();
      if (!cancelled) setMissingTwoNumberColumns(!capabilities.twoNumberColumns);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAuthenticated = adminSession !== null;

  // Dashboard Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'add_product' | 'supabase' | 'settings' | 'security'>('overview');

  // Supabase connection state
  const [supabaseUrl, setSupabaseUrl] = useState(() => readSupabaseConfig().supabaseUrl);
  const [supabaseKey, setSupabaseKey] = useState(() => readSupabaseConfig().supabaseAnonKey);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [supabaseNotice, setSupabaseNotice] = useState('');
  // Live connection state, driven by a real query — not by "a URL string exists"
  const [connection, setConnection] = useState<{
    status: 'idle' | 'testing' | 'ok' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });

  // Store Settings Form State
  const [storeName, setStoreName] = useState(config.storeName);
  const [whatsapp, setWhatsapp] = useState(config.whatsappNumber);
  const [whatsapp2, setWhatsapp2] = useState(config.whatsappNumber2 ?? '');
  const [orderDistribution, setOrderDistribution] = useState<
    'round_robin' | 'primary_only' | 'alternate_daily'
  >(config.orderDistribution ?? 'round_robin');
  // Live validation: the owner sees exactly where orders will land.
  const waStatus = normalizeWhatsApp(whatsapp);
  // The second number is optional: blank means every order goes to the first.
  const wa2Raw = whatsapp2.trim();
  const wa2Status = normalizeWhatsApp(wa2Raw);
  const wa2Active = wa2Raw !== '' && wa2Status.valid;
  const wa2Problem = wa2Raw !== '' && !wa2Status.valid;
  const [instagram, setInstagram] = useState(config.instagramUrl);
  const [tiktok, setTiktok] = useState(config.tiktokUrl);
  // Normalise as the owner types, so they see the exact link customers get.
  const igStatus = normalizeSocial(instagram, 'instagram');
  const ttStatus = normalizeSocial(tiktok, 'tiktok');
  const [bcvRate, setBcvRate] = useState(String(config.bcvRate));
  const [bcvBusy, setBcvBusy] = useState(false);
  const [bcvNotice, setBcvNotice] = useState('');
  const [showBsRate, setShowBsRate] = useState(config.showBsRate);
  const [freeDelivery, setFreeDelivery] = useState(String(config.freeDeliveryThreshold));
  const [settingsNotice, setSettingsNotice] = useState('');
  // True when the two-number columns are missing from the database. Detected
  // once on mount so the form can explain itself before the owner types into a
  // field that cannot be saved.
  const [missingTwoNumberColumns, setMissingTwoNumberColumns] = useState(false);

  // Order ledger state
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [orderFilter, setOrderFilter] = useState<'all' | OrderStatus>('all');

  // Inline validation (replaces alert())
  const [formError, setFormError] = useState('');

  // Reflect externally-saved settings (and the auto BCV rate) back into the form,
  // so the inputs never disagree with what the store is actually using.
  useEffect(() => {
    setStoreName(config.storeName);
    setWhatsapp(config.whatsappNumber);
    setWhatsapp2(config.whatsappNumber2 ?? '');
    setOrderDistribution(config.orderDistribution ?? 'round_robin');
    setInstagram(config.instagramUrl);
    setTiktok(config.tiktokUrl);
    setBcvRate(config.bcvRate > 0 ? String(config.bcvRate) : '');
    setShowBsRate(config.showBsRate);
    setFreeDelivery(String(config.freeDeliveryThreshold));
  }, [
    config.storeName,
    config.whatsappNumber,
    config.whatsappNumber2,
    config.orderDistribution,
    config.instagramUrl,
    config.tiktokUrl,
    config.bcvRate,
    config.showBsRate,
    config.freeDeliveryThreshold,
  ]);

  // Editing Product State
  const [editingProduct, setEditingProduct] = useState<ClothingProduct | null>(null);
  const [searchCatalog, setSearchCatalog] = useState('');

  // New Product Form State
  const [newName, setNewName] = useState('');
  const [newSeries, setNewSeries] = useState('New Season');
  const [newPrice, setNewPrice] = useState('75.00');
  const [newSizes, setNewSizes] = useState('S, M, L, XL');
  const [newCategories, setNewCategories] = useState<string[]>(['pijamas']);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newGallery, setNewGallery] = useState<string[]>([]);
  const [newDescription, setNewDescription] = useState('');

  // Security Change Password State
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [securityNotice, setSecurityNotice] = useState<{ text: string; error?: boolean } | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError('');

    const result = await signInAdmin(emailInput, passwordInput);

    if (!result.ok) {
      setAuthError(result.message);
      setAuthBusy(false);
      return;
    }

    const session = await getAdminSession();
    setAdminSession(session);
    setPasswordInput('');
    setAuthBusy(false);

    if (!session) {
      setAuthError(
        isEs
          ? 'Sesión iniciada pero no se pudo leer. Recarga la página.'
          : 'Signed in but the session could not be read. Reload the page.'
      );
    }
  };

  const handleLogout = async () => {
    await signOutAdmin();
    setAdminSession(null);
    setPasswordInput('');
    setEmailInput('');
  };

  // Pull the official rate on demand, so the owner never has to look it up.
  const handleRefreshBcv = async () => {
    setBcvBusy(true);
    setBcvNotice('');
    try {
      const result = await fetchBcvRate({ force: true });
      if (result && result.rate > 0) {
        setBcvRate(String(result.rate));
        setBcvNotice(
          isEs
            ? `Tasa oficial actualizada: Bs. ${result.rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Pulsa Guardar para aplicarla.`
            : `Official rate updated: Bs. ${result.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Press Save to apply.`
        );
      } else {
        setBcvNotice(
          isEs
            ? 'No se pudo obtener la tasa ahora. Se mantiene la tasa actual.'
            : 'Could not fetch the rate right now. Keeping the current rate.'
        );
      }
    } finally {
      setBcvBusy(false);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();

    // The rate is maintained automatically now, so an empty field must not
    // block saving the rest of the form. A typed value still has to be valid.
    const rateTyped = bcvRate.trim() !== '';
    const rate = parseFloat(bcvRate);
    if (rateTyped && (!Number.isFinite(rate) || rate <= 0)) {
      setFormError(isEs ? 'La tasa BCV debe ser un número mayor que cero' : 'BCV rate must be a number greater than zero');
      return;
    }
    // Keep the rate already in use when the field is blank.
    const effectiveRate = rateTyped ? rate : config.bcvRate;

    const threshold = parseFloat(freeDelivery);
    if (!Number.isFinite(threshold) || threshold < 0) {
      setFormError(isEs ? 'El umbral de envío gratis debe ser cero o mayor' : 'Free delivery threshold must be zero or greater');
      return;
    }
    // Refuse to save a number that cannot receive orders.
    if (!waStatus.valid) {
      setFormError(
        isEs
          ? `Número de WhatsApp inválido. ${waStatus.error}`
          : `Invalid WhatsApp number. ${waStatus.error}`
      );
      return;
    }
    // A second number is optional, but if one was typed it must be usable.
    if (wa2Problem) {
      setFormError(
        isEs
          ? `Segundo número inválido. ${wa2Status.error}`
          : `Second number is invalid. ${wa2Status.error}`
      );
      return;
    }
    if (wa2Active && wa2Status.digits === waStatus.digits) {
      setFormError(
        isEs
          ? 'El segundo número es igual al primero. Usa dos números distintos o deja el segundo vacío.'
          : 'The second number is the same as the first. Use two different numbers, or leave the second empty.'
      );
      return;
    }
    if (!igStatus.valid) {
      setFormError(
        isEs ? `Instagram: ${igStatus.error}` : `Instagram: ${igStatus.error}`
      );
      return;
    }
    if (!ttStatus.valid) {
      setFormError(isEs ? `TikTok: ${ttStatus.error}` : `TikTok: ${ttStatus.error}`);
      return;
    }
    setFormError('');
    onSaveConfig({
      ...config,
      storeName: storeName.trim() || 'Monada Store',
      whatsappNumber: waStatus.digits,
      whatsappNumber2: wa2Active ? wa2Status.digits : '',
      orderDistribution,
      instagramUrl: igStatus.url,
      tiktokUrl: ttStatus.url,
      bcvRate: effectiveRate,
      showBsRate,
      freeDeliveryThreshold: threshold,
    });
    // Do NOT claim success here. The database write happens in onSaveConfig and
    // can still fail; saying "saved" before it resolves is exactly what made a
    // rejected write look like it worked and then never appear on the storefront.
    setFormError('');
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    setOrdersError('');
    const result = await fetchOrders();
    if (result === null) {
      setOrders([]);
      setOrdersError(
        readSupabaseConfig().isConnected
          ? (isEs ? 'No se pudieron leer los pedidos. Revisa la conexión.' : 'Could not read orders. Check the connection.')
          : (isEs ? 'Conecta Supabase para ver los pedidos guardados.' : 'Connect Supabase to see saved orders.')
      );
    } else {
      setOrders(result);
    }
    setOrdersLoading(false);
  };

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    const previous = orders;
    setOrders(prev => prev.map(o => (o.id === id ? { ...o, status } : o)));
    const ok = await updateOrderStatus(id, status);
    if (!ok) {
      setOrders(previous);
      setOrdersError(isEs ? 'No se pudo actualizar el estado del pedido' : 'Could not update the order status');
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (!confirm(isEs ? '¿Eliminar este pedido del registro?' : 'Delete this order from the ledger?')) return;
    const previous = orders;
    setOrders(prev => prev.filter(o => o.id !== id));
    const ok = await deleteOrder(id);
    if (!ok) {
      setOrders(previous);
      setOrdersError(isEs ? 'No se pudo eliminar el pedido' : 'Could not delete the order');
    }
  };

  const handleSaveSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('monada_supabase_url', supabaseUrl.trim());
    localStorage.setItem('monada_supabase_key', supabaseKey.trim());
    resetSupabaseClient();
    setSupabaseNotice(isEs ? 'Credenciales guardadas. Probando conexión...' : 'Credentials saved. Testing connection...');
    const result = await testConnection();
    setConnection({
      status: result.ok ? 'ok' : 'error',
      message: result.message,
    });
    setSupabaseNotice(
      result.ok
        ? (isEs ? 'Conexión verificada con Supabase' : 'Supabase connection verified')
        : (isEs ? 'Credenciales guardadas, pero la conexión falló' : 'Credentials saved, but the connection failed')
    );
    setTimeout(() => setSupabaseNotice(''), 4000);
  };

  const handleTestConnection = async () => {
    setConnection({ status: 'testing', message: '' });
    const result = await testConnection();
    setConnection({ status: result.ok ? 'ok' : 'error', message: result.message });
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPrice.trim()) {
      setFormError(isEs ? 'Ingresa el nombre y precio de la prenda' : 'Please provide product name and price');
      return;
    }
    setFormError('');

    const priceNum = parseFloat(newPrice) || 50;
    const sizeArray = newSizes.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const defaultImg = newImageUrl.trim() || newGallery[0] || 'https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=900&q=85';
    const galleryImgs = newGallery.length > 0 ? newGallery : [defaultImg];

    const newProd: ClothingProduct = {
      id: Date.now(),
      name: newName.trim(),
      series: newSeries.trim(),
      price: priceNum,
      size: sizeArray[0] || 'M',
      sizes: sizeArray.length > 0 ? sizeArray : ['S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Oatmeal / Natural', hex: '#E4DFD5' },
        { name: 'Sage Green', hex: '#8F9E8B' },
        { name: 'Black', hex: '#1C1C1C' },
      ],
      description: newDescription.trim() || (isEs ? 'Prenda confeccionada con textiles seleccionados de corte contemporáneo.' : 'Tailored contemporary garment crafted from premium textiles.'),
      imageUrl: defaultImg,
      gallery: galleryImgs,
      categories: newCategories.length > 0 ? newCategories : ['pijamas'],
      isFavorite: false,
      rating: 5.0,
      reviewCount: 1,
    };

    onSaveProducts([newProd, ...products]);
    setNewName('');
    setNewImageUrl('');
    setNewGallery([]);
    setNewDescription('');
    setNewCategories(['pijamas']);
    setActiveTab('products');
  };

  const handleUpdateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    onSaveProducts(products.map(p => p.id === editingProduct.id ? editingProduct : p));
    setEditingProduct(null);
  };

  const handleDeleteProduct = (id: number) => {
    if (confirm(isEs ? '¿Seguro que deseas eliminar esta prenda del catálogo?' : 'Are you sure you want to delete this piece?')) {
      onDeleteProduct(id);
      if (editingProduct?.id === id) setEditingProduct(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd.length < 8) {
      setSecurityNotice({ text: isEs ? 'La nueva clave debe tener al menos 8 caracteres' : 'New password must be at least 8 characters', error: true });
      return;
    }
    if (newPwd !== confirmPwd) {
      setSecurityNotice({ text: isEs ? 'Las contraseñas no coinciden' : 'Passwords do not match', error: true });
      return;
    }

    // Verify the current password by re-authenticating, then set the new one.
    const email = adminSession?.user.email ?? '';
    const check = await signInAdmin(email, oldPwd);
    if (!check.ok) {
      setSecurityNotice({ text: isEs ? 'La contraseña actual no es válida' : 'Current password incorrect', error: true });
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setSecurityNotice({ text: isEs ? 'Supabase no está configurado' : 'Supabase is not configured', error: true });
      return;
    }

    const { error } = await client.auth.updateUser({ password: newPwd });
    if (error) {
      setSecurityNotice({ text: error.message, error: true });
      return;
    }

    setSecurityNotice({ text: isEs ? 'Contraseña actualizada con éxito' : 'Password changed successfully' });
    setOldPwd('');
    setNewPwd('');
    setConfirmPwd('');
  };

  const filteredCatalog = products.filter(p =>
    p.name.toLowerCase().includes(searchCatalog.toLowerCase()) ||
    p.series.toLowerCase().includes(searchCatalog.toLowerCase())
  );

  const totalCatalogValue = products.reduce((acc, p) => acc + p.price, 0);

  // While the stored session is being checked, show a quiet loader instead of
  // flashing the login form at someone who is already signed in.
  if (authChecking) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--theme-bg)',
        color: 'var(--theme-muted)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 14,
      }}>
        <img
          src="/logo-transparent.png"
          alt="Monada Store"
          style={{ height: 40, objectFit: 'contain', filter: 'var(--logo-filter)', opacity: 0.6 }}
        />
        <span style={{ fontSize: 12, letterSpacing: 0.5 }}>
          {isEs ? 'Verificando acceso...' : 'Checking access...'}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--theme-bg)',
      color: 'var(--theme-ink)',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* 1. SECURITY LOGIN SCREEN */}
      {!isAuthenticated ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--theme-bg)',
        }}>
          <div style={{
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-line)',
            borderRadius: 24,
            width: '100%',
            maxWidth: 420,
            padding: '36px 32px',
            boxShadow: 'var(--theme-card-shadow-hover)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 26 }}>
              <img
                src="/logo-transparent.png"
                alt="Monada Store"
                style={{
                  height: 44,
                  objectFit: 'contain',
                  margin: '0 auto 16px',
                  display: 'block',
                  filter: 'var(--logo-filter)',
                }}
              />
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 20,
                background: 'var(--theme-surface-soft)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--monada-sage)',
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                <IconShield size={13} />
                <span>Supabase Backend Console</span>
              </div>
              <h3 style={{
                fontFamily: 'Playfair Display, serif',
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--theme-ink)',
              }}>
                {isEs ? 'Acceso al Panel' : 'Admin Portal'}
              </h3>
            </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--theme-ink)', display: 'block', marginBottom: 6 }}>
                  {isEs ? 'Correo del Administrador' : 'Admin Email'}
                </label>
                <input
                  type="email"
                  autoFocus
                  autoComplete="username"
                  required
                  placeholder="tu@correo.com"
                  value={emailInput}
                  onChange={e => { setEmailInput(e.target.value); setAuthError(''); }}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 12,
                    border: '1.5px solid var(--theme-line)',
                    background: 'var(--theme-bg)',
                    color: 'var(--theme-ink)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--theme-ink)', display: 'block', marginBottom: 6 }}>
                  {isEs ? 'Contraseña' : 'Password'}
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••••"
                  value={passwordInput}
                  onChange={e => { setPasswordInput(e.target.value); setAuthError(''); }}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 12,
                    border: '1.5px solid var(--theme-line)',
                    background: 'var(--theme-bg)',
                    color: 'var(--theme-ink)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>

              {authError && (
                <div style={{
                  fontSize: 12,
                  color: 'var(--monada-danger)',
                  padding: '8px 12px',
                  background: 'rgba(214, 69, 69, 0.1)',
                  borderRadius: 8,
                  lineHeight: 1.5,
                }}>
                  {authError}
                </div>
              )}

              {!authAvailable && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    fontSize: 12,
                    color: '#B45309',
                    padding: '10px 12px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    borderRadius: 8,
                    lineHeight: 1.5,
                  }}>
                    {isEs
                      ? 'Supabase no está conectado en este navegador. Pega tus credenciales aquí para activar el acceso. (En producción lo correcto es configurarlas en Vercel para que todos los visitantes las reciban.)'
                      : 'Supabase is not connected in this browser. Paste your credentials here to enable sign-in. (In production, set them in Vercel so every visitor gets them.)'}
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: 'var(--theme-muted)', display: 'block', marginBottom: 4 }}>
                      SUPABASE PROJECT URL
                    </label>
                    <input
                      type="url"
                      value={setupUrl}
                      onChange={e => setSetupUrl(e.target.value)}
                      placeholder="https://xxxx.supabase.co"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 9,
                        border: '1px solid var(--theme-line)',
                        background: 'var(--theme-bg)',
                        color: 'var(--theme-ink)',
                        fontSize: 12,
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: 'var(--theme-muted)', display: 'block', marginBottom: 4 }}>
                      SUPABASE ANON (PUBLIC) KEY
                    </label>
                    <input
                      type="password"
                      value={setupKey}
                      onChange={e => setSetupKey(e.target.value)}
                      placeholder="sb_publishable_... or eyJhbGci..."
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 9,
                        border: '1px solid var(--theme-line)',
                        background: 'var(--theme-bg)',
                        color: 'var(--theme-ink)',
                        fontSize: 12,
                      }}
                    />
                  </div>

                  {setupError && (
                    <div style={{ fontSize: 11, color: 'var(--monada-danger)', fontWeight: 600 }}>
                      {setupError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleConnectSupabase}
                    disabled={setupBusy}
                    style={{
                      height: 40,
                      borderRadius: 10,
                      background: 'var(--theme-surface-soft)',
                      color: 'var(--theme-ink)',
                      border: '1px solid var(--theme-line)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: setupBusy ? 'wait' : 'pointer',
                      opacity: setupBusy ? 0.6 : 1,
                    }}
                  >
                    {setupBusy
                      ? (isEs ? 'Conectando...' : 'Connecting...')
                      : (isEs ? 'Conectar Supabase' : 'Connect Supabase')}
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy || !authAvailable}
                style={{
                  height: 46,
                  borderRadius: 12,
                  background: 'var(--monada-sage)',
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: authBusy || !authAvailable ? 'not-allowed' : 'pointer',
                  border: 'none',
                  boxShadow: '0 6px 18px rgba(117,138,119,0.3)',
                  marginTop: 6,
                  opacity: authBusy || !authAvailable ? 0.6 : 1,
                }}
              >
                <IconLock size={16} />
                <span>
                  {authBusy
                    ? (isEs ? 'Verificando...' : 'Verifying...')
                    : (isEs ? 'Entrar' : 'Sign In')}
                </span>
              </button>

              <button
                type="button"
                onClick={onClose}
                style={{
                  height: 38,
                  background: 'transparent',
                  color: 'var(--theme-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <IconArrowLeft size={14} />
                <span>{isEs ? 'Volver a la Tienda' : 'Return to Store'}</span>
              </button>

              <div style={{
                textAlign: 'center',
                fontSize: 11,
                color: 'var(--theme-muted)',
                marginTop: 6,
                borderTop: '1px solid var(--theme-line)',
                paddingTop: 10,
                lineHeight: 1.6,
              }}>
                {isEs
                  ? 'Acceso protegido por Supabase Auth. Crea tu cuenta en Supabase → Authentication → Users.'
                  : 'Secured by Supabase Auth. Create your account in Supabase → Authentication → Users.'}
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* 2. FULL-SCREEN LUXURY SUPABASE DASHBOARD */
        <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
          {/* SIDEBAR NAVIGATION */}
          <aside style={{
            width: 260,
            background: 'var(--theme-surface)',
            borderRight: '1px solid var(--theme-line)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}>
            {/* Logo & Brand */}
            <div style={{
              padding: '24px 20px',
              borderBottom: '1px solid var(--theme-line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <img
                src="/logo-transparent.png"
                alt="Monada Store"
                style={{
                  height: 38,
                  objectFit: 'contain',
                  alignSelf: 'flex-start',
                  filter: 'var(--logo-filter)',
                }}
              />
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--theme-muted)',
                fontWeight: 500,
              }}>
                <span style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background:
                    connection.status === 'ok'
                      ? 'var(--monada-sage)'
                      : connection.status === 'error'
                        ? 'var(--monada-danger)'
                        : '#F59E0B',
                }} />
                <span>
                  {connection.status === 'ok'
                    ? 'Supabase Live'
                    : connection.status === 'error'
                      ? 'Supabase Error'
                      : supabaseUrl && supabaseKey
                        ? 'Supabase (sin verificar)'
                        : 'Local Fallback'}
                </span>
              </div>
            </div>

            {/* Nav Menu */}
            <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'auto' }}>
              <button
                onClick={() => { setActiveTab('overview'); setEditingProduct(null); }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: activeTab === 'overview' ? 'var(--monada-sage-soft)' : 'transparent',
                  color: activeTab === 'overview' ? 'var(--monada-sage)' : 'var(--theme-ink)',
                  fontSize: 13,
                  fontWeight: activeTab === 'overview' ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  border: 'none',
                  textAlign: 'left',
                }}
              >
                <IconChart size={17} />
                <span>{isEs ? 'Panel Principal' : 'Overview'}</span>
              </button>

              <button
                onClick={() => { setActiveTab('orders'); setEditingProduct(null); loadOrders(); }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: activeTab === 'orders' ? 'var(--monada-sage-soft)' : 'transparent',
                  color: activeTab === 'orders' ? 'var(--monada-sage)' : 'var(--theme-ink)',
                  fontSize: 13,
                  fontWeight: activeTab === 'orders' ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  border: 'none',
                  textAlign: 'left',
                }}
              >
                <IconReceipt size={17} />
                <span>{isEs ? 'Pedidos' : 'Orders'}</span>
              </button>

              <button
                onClick={() => { setActiveTab('products'); setEditingProduct(null); }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: activeTab === 'products' ? 'var(--monada-sage-soft)' : 'transparent',
                  color: activeTab === 'products' ? 'var(--monada-sage)' : 'var(--theme-ink)',
                  fontSize: 13,
                  fontWeight: activeTab === 'products' ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  border: 'none',
                  textAlign: 'left',
                }}
              >
                <IconPackage size={17} />
                <span>{isEs ? 'Inventario de Prendas' : 'Products Catalog'}</span>
              </button>

              <button
                onClick={() => { setActiveTab('add_product'); setEditingProduct(null); }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: activeTab === 'add_product' ? 'var(--monada-sage-soft)' : 'transparent',
                  color: activeTab === 'add_product' ? 'var(--monada-sage)' : 'var(--theme-ink)',
                  fontSize: 13,
                  fontWeight: activeTab === 'add_product' ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  border: 'none',
                  textAlign: 'left',
                }}
              >
                <IconPlus size={17} />
                <span>{isEs ? 'Nueva Prenda' : 'Add New Piece'}</span>
              </button>

              <button
                onClick={() => { setActiveTab('supabase'); setEditingProduct(null); }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: activeTab === 'supabase' ? 'var(--monada-sage-soft)' : 'transparent',
                  color: activeTab === 'supabase' ? 'var(--monada-sage)' : 'var(--theme-ink)',
                  fontSize: 13,
                  fontWeight: activeTab === 'supabase' ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  border: 'none',
                  textAlign: 'left',
                }}
              >
                <IconDatabase size={17} />
                <span>Supabase & SQL</span>
              </button>

              <button
                onClick={() => { setActiveTab('settings'); setEditingProduct(null); }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: activeTab === 'settings' ? 'var(--monada-sage-soft)' : 'transparent',
                  color: activeTab === 'settings' ? 'var(--monada-sage)' : 'var(--theme-ink)',
                  fontSize: 13,
                  fontWeight: activeTab === 'settings' ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  border: 'none',
                  textAlign: 'left',
                }}
              >
                <IconSliders size={17} />
                <span>{isEs ? 'Ajustes & WhatsApp' : 'Store & WhatsApp'}</span>
              </button>

              <button
                onClick={() => { setActiveTab('security'); setEditingProduct(null); }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: activeTab === 'security' ? 'var(--monada-sage-soft)' : 'transparent',
                  color: activeTab === 'security' ? 'var(--monada-sage)' : 'var(--theme-ink)',
                  fontSize: 13,
                  fontWeight: activeTab === 'security' ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  border: 'none',
                  textAlign: 'left',
                }}
              >
                <IconLock size={17} />
                <span>{isEs ? 'Seguridad' : 'Security'}</span>
              </button>
            </nav>

            {/* Sidebar Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--theme-line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'var(--theme-surface-soft)',
                  color: 'var(--theme-ink)',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  border: '1px solid var(--theme-line)',
                }}
              >
                <IconExternalLink size={14} />
                <span>{isEs ? 'Ver Tienda en Vivo' : 'View Live Boutique'}</span>
              </button>

              {/* Who is signed in — proof the session is real, not a flag */}
              {adminSession?.user.email && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'var(--theme-surface-soft)',
                  border: '1px solid var(--theme-line)',
                }}>
                  <span style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'var(--monada-sage)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {adminSession.user.email.charAt(0).toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--theme-muted)', lineHeight: 1.3 }}>
                      {isEs ? 'Sesión activa' : 'Signed in'}
                    </div>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--theme-ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {adminSession.user.email}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'transparent',
                  color: 'var(--theme-muted)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                <IconLogOut size={14} />
                <span>{isEs ? 'Cerrar Sesión' : 'Sign Out'}</span>
              </button>
            </div>
          </aside>

          {/* MAIN CONTENT WORKSPACE */}
          <main style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--theme-bg)',
          }}>
            {/* Top Bar */}
            <div style={{
              padding: '14px 28px',
              borderBottom: '1px solid var(--theme-line)',
              background: 'var(--theme-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--theme-muted)' }}>Console</span>
                <span style={{ color: 'var(--theme-line)' }}>/</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-ink)', textTransform: 'capitalize' }}>
                  {activeTab}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    background: 'var(--monada-sage)',
                    color: '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <IconArrowLeft size={14} />
                  <span>{isEs ? 'Volver a la Tienda' : 'Back to Store'}</span>
                </button>
              </div>
            </div>

            {/* Scrollable Work Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
              {/* TAB 1: OVERVIEW METRICS */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
                  <div>
                    <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 26, fontWeight: 600 }}>
                      {isEs ? 'Resumen General' : 'Executive Overview'}
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--theme-muted)', marginTop: 2 }}>
                      {isEs ? 'Estado actual de tu catálogo y canal de ventas por WhatsApp.' : 'Live status of your clothing catalog and WhatsApp sales channel.'}
                    </p>
                  </div>

                  {/* Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                    <div style={{
                      background: 'var(--theme-surface)',
                      borderRadius: 16,
                      padding: '20px',
                      border: '1px solid var(--theme-line)',
                    }}>
                      <div style={{ fontSize: 12, color: 'var(--theme-muted)', fontWeight: 500 }}>
                        {isEs ? 'Prendas en Catálogo' : 'Total Pieces'}
                      </div>
                      <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--theme-ink)', marginTop: 8 }}>
                        {products.length}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--monada-sage)', marginTop: 4, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconCheck size={12} /> {isEs ? 'Activas para compra' : 'Active in boutique'}
                      </div>
                    </div>

                    <div style={{
                      background: 'var(--theme-surface)',
                      borderRadius: 16,
                      padding: '20px',
                      border: '1px solid var(--theme-line)',
                    }}>
                      <div style={{ fontSize: 12, color: 'var(--theme-muted)', fontWeight: 500 }}>
                        {isEs ? 'Valor del Inventario' : 'Catalog Valuation'}
                      </div>
                      <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--monada-terracotta)', marginTop: 8 }}>
                        ${totalCatalogValue.toFixed(2)} USD
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--theme-muted)', marginTop: 4 }}>
                        {isEs ? 'Promedio por pieza' : 'Avg piece'}: ${(totalCatalogValue / (products.length || 1)).toFixed(2)}
                      </div>
                    </div>

                    <div style={{
                      background: 'var(--theme-surface)',
                      borderRadius: 16,
                      padding: '20px',
                      border: '1px solid var(--theme-line)',
                    }}>
                      <div style={{ fontSize: 12, color: 'var(--theme-muted)', fontWeight: 500 }}>
                        {isEs ? 'Canal de WhatsApp' : 'WhatsApp Channel'}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--theme-ink)', marginTop: 8 }}>
                        +{config.whatsappNumber}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--whatsapp-green)', marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconCheck size={12} /> {isEs ? 'Checkout directo por WhatsApp' : 'Direct WhatsApp Checkout'}
                      </div>
                    </div>
                  </div>

                  {/* Supabase Integration Banner */}
                  <div style={{
                    background: 'var(--theme-surface)',
                    borderRadius: 18,
                    padding: '22px 24px',
                    border: '1px solid var(--theme-line)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 20,
                    flexWrap: 'wrap',
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <IconDatabase size={18} style={{ color: 'var(--monada-sage)' }} />
                        <h4 style={{ fontSize: 16, fontWeight: 700 }}>
                          {connection.status === 'ok'
                            ? 'Supabase Backend Conectado'
                            : supabaseUrl && supabaseKey
                              ? 'Supabase Configurado (sin verificar)'
                              : 'Preparado para Supabase Backend'}
                        </h4>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--theme-muted)', maxWidth: 520 }}>
                        {connection.status === 'ok'
                          ? 'Catálogo, ajustes y pedidos se guardan en tu base de datos Supabase.'
                          : supabaseUrl && supabaseKey
                            ? 'Hay credenciales guardadas. Usa «Probar conexión» para verificar que la base responde.'
                            : 'Copia el esquema SQL predefinido y pégalo en el editor SQL de tu proyecto Supabase para habilitar sincronización en la nube.'}
                      </p>
                    </div>

                    <button
                      onClick={() => setActiveTab('supabase')}
                      style={{
                        padding: '10px 18px',
                        borderRadius: 10,
                        background: 'var(--monada-sage)',
                        color: '#FFFFFF',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: 'none',
                      }}
                    >
                      {supabaseUrl && supabaseKey ? 'Gestionar Conexión' : 'Configurar Supabase'}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: ORDER LEDGER */}
              {activeTab === 'orders' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1000 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, fontWeight: 600 }}>
                        {isEs ? 'Registro de Pedidos' : 'Order Ledger'}
                      </h2>
                      <span style={{ fontSize: 12, color: 'var(--theme-muted)' }}>
                        {isEs
                          ? 'Pedidos enviados por WhatsApp, guardados en tu base de datos.'
                          : 'Orders sent through WhatsApp, saved to your database.'}
                      </span>
                    </div>

                    <button
                      onClick={loadOrders}
                      disabled={ordersLoading}
                      style={{
                        padding: '9px 16px',
                        borderRadius: 10,
                        background: 'var(--theme-surface)',
                        color: 'var(--theme-ink)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: ordersLoading ? 'wait' : 'pointer',
                        border: '1px solid var(--theme-line)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        opacity: ordersLoading ? 0.6 : 1,
                      }}
                    >
                      <IconRefresh size={14} />
                      {ordersLoading
                        ? (isEs ? 'Cargando...' : 'Loading...')
                        : (isEs ? 'Actualizar' : 'Refresh')}
                    </button>
                  </div>

                  {ordersError && (
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      background: 'rgba(220, 38, 38, 0.08)',
                      color: 'var(--monada-danger)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {ordersError}
                    </div>
                  )}

                  {/* Status filter */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(['all', ...ORDER_STATUSES] as const).map(status => {
                      const count = status === 'all'
                        ? orders.length
                        : orders.filter(o => o.status === status).length;
                      return (
                        <button
                          key={status}
                          onClick={() => setOrderFilter(status)}
                          style={{
                            padding: '7px 13px',
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: orderFilter === status ? 600 : 500,
                            cursor: 'pointer',
                            border: `1px solid ${orderFilter === status ? 'var(--monada-sage)' : 'var(--theme-line)'}`,
                            background: orderFilter === status ? 'var(--monada-sage-soft)' : 'var(--theme-surface)',
                            color: orderFilter === status ? 'var(--monada-sage)' : 'var(--theme-muted)',
                          }}
                        >
                          {statusLabel(status, isEs)} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {orders.length === 0 && !ordersLoading && (
                    <div style={{
                      padding: '48px 24px',
                      textAlign: 'center',
                      background: 'var(--theme-surface)',
                      borderRadius: 18,
                      border: '1px dashed var(--theme-line)',
                    }}>
                      <IconReceipt size={32} style={{ color: 'var(--theme-muted)', marginBottom: 10 }} />
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                        {!isAuthenticated
                          ? (isEs ? 'Inicia sesión para ver los pedidos' : 'Sign in to see orders')
                          : (isEs ? 'Todavía no hay pedidos' : 'No orders yet')}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--theme-muted)' }}>
                        {!isAuthenticated
                          ? (isEs
                              ? 'Los pedidos solo los puede leer un administrador con sesión iniciada. Sin sesión, la base de datos devuelve una lista vacía.'
                              : 'Only a signed-in admin can read orders. Without a session the database returns an empty list.')
                          : (isEs
                              ? 'Cada pedido enviado por WhatsApp aparecerá aquí automáticamente.'
                              : 'Every order sent through WhatsApp will appear here automatically.')}
                      </div>
                    </div>
                  )}

                  {orders
                    .filter(o => orderFilter === 'all' || o.status === orderFilter)
                    .map(order => (
                      <div
                        key={order.id}
                        style={{
                          background: 'var(--theme-surface)',
                          borderRadius: 16,
                          border: '1px solid var(--theme-line)',
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{
                          padding: '14px 18px',
                          borderBottom: '1px solid var(--theme-line)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
                              {order.id}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--theme-muted)', marginTop: 2 }}>
                              {order.createdAt
                                ? new Date(order.createdAt).toLocaleString(isEs ? 'es-VE' : 'en-US')
                                : '—'}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--monada-terracotta)' }}>
                              ${order.total.toFixed(2)}
                            </span>
                            <select
                              value={order.status}
                              onChange={e => handleStatusChange(order.id, e.target.value as OrderStatus)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 600,
                                border: '1px solid var(--theme-line)',
                                background: 'var(--theme-bg)',
                                color: 'var(--theme-ink)',
                                cursor: 'pointer',
                              }}
                            >
                              {ORDER_STATUSES.map(s => (
                                <option key={s} value={s}>{statusLabel(s, isEs)}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleDeleteOrder(order.id)}
                              title={isEs ? 'Eliminar pedido' : 'Delete order'}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--theme-muted)',
                                cursor: 'pointer',
                                padding: 4,
                              }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--monada-danger)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--theme-muted)')}
                            >
                              <IconTrash size={15} />
                            </button>
                          </div>
                        </div>

                        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: 'var(--theme-muted)' }}>{isEs ? 'Cliente' : 'Customer'}:</span>
                              <strong>{order.customerName || '—'}</strong>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: 'var(--theme-muted)' }}>WhatsApp:</span>
                              <strong>{order.customerPhone || '—'}</strong>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <IconCard size={13} style={{ color: 'var(--theme-muted)' }} />
                              <span>{order.paymentMethod || '—'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <IconTruck size={13} style={{ color: 'var(--theme-muted)' }} />
                              <span>{order.courier || '—'}</span>
                            </div>
                            {order.assignedNumber && (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '2px 9px',
                                borderRadius: 20,
                                background: 'var(--monada-sage-soft)',
                                color: 'var(--monada-sage)',
                                fontSize: 11,
                                fontWeight: 600,
                              }}>
                                <IconWhatsApp size={11} />
                                {/*
                                  Show the number the order actually went to, not
                                  "Number 1 / Number 2". The positional label was
                                  computed against the *current* primary number, so
                                  swapping the numbers relabelled old orders: one
                                  that went to Number 1 started reading "Number 2",
                                  which would send the follow-up to the wrong phone.
                                */}
                                <span>{normalizeWhatsApp(order.assignedNumber).pretty}</span>
                              </div>
                            )}
                          </div>

                          {order.cityAddress && (
                            <div style={{ fontSize: 12, color: 'var(--theme-muted)' }}>
                              📍 {order.cityAddress}
                            </div>
                          )}

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {order.items.map((item, i) => (
                              <div
                                key={`${order.id}-${i}`}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  fontSize: 12,
                                  padding: '6px 10px',
                                  borderRadius: 8,
                                  background: 'var(--theme-bg)',
                                }}
                              >
                                <span>
                                  {item.quantity}× <strong>{item.name}</strong>
                                  <span style={{ color: 'var(--theme-muted)' }}>
                                    {' '}— {item.size}{item.color ? ` / ${item.color}` : ''}
                                  </span>
                                </span>
                                <span style={{ fontWeight: 600 }}>
                                  ${(item.price * item.quantity).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {order.notes && (
                            <div style={{ fontSize: 12, color: 'var(--theme-muted)', fontStyle: 'italic' }}>
                              {order.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* TAB 2: PRODUCTS INVENTORY */}
              {activeTab === 'products' && (                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1000 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, fontWeight: 600 }}>
                        {isEs ? 'Inventario de Prendas' : 'Products Inventory'}
                      </h2>
                      <span style={{ fontSize: 12, color: 'var(--theme-muted)' }}>
                        {products.length} {isEs ? 'prendas publicadas en el catálogo' : 'items published in catalog'}
                      </span>
                    </div>

                    <button
                      onClick={() => setActiveTab('add_product')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 10,
                        background: 'var(--monada-sage)',
                        color: '#FFFFFF',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <IconPlus size={16} />
                      <span>{isEs ? 'Añadir Prenda' : 'Add Piece'}</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder={isEs ? 'Buscar por nombre o serie...' : 'Search pieces...'}
                    value={searchCatalog}
                    onChange={e => setSearchCatalog(e.target.value)}
                    style={{
                      padding: '11px 16px',
                      borderRadius: 12,
                      border: '1px solid var(--theme-line)',
                      background: 'var(--theme-surface)',
                      color: 'var(--theme-ink)',
                      fontSize: 13,
                    }}
                  />

                  {/* Inline Edit Form */}
                  {editingProduct && (
                    <form onSubmit={handleUpdateProduct} style={{
                      background: 'var(--theme-surface)',
                      padding: '20px',
                      borderRadius: 16,
                      border: '1.5px solid var(--monada-sage)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <IconEdit size={16} />
                          {isEs ? 'Editando Prenda' : 'Editing Piece'}
                        </h4>
                        <button
                          type="button"
                          onClick={() => setEditingProduct(null)}
                          style={{ background: 'transparent', color: 'var(--theme-muted)', fontSize: 12, cursor: 'pointer', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        >
                          <IconClose size={13} /> {isEs ? 'Cancelar' : 'Cancel'}
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--theme-muted)' }}>{isEs ? 'Nombre' : 'Name'}</label>
                          <input
                            type="text"
                            required
                            value={editingProduct.name}
                            onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid var(--theme-line)',
                              background: 'var(--theme-bg)',
                              color: 'var(--theme-ink)',
                              fontSize: 13,
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, color: 'var(--theme-muted)' }}>{isEs ? 'Precio en USD ($)' : 'Price in USD ($)'}</label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={editingProduct.price}
                            onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid var(--theme-line)',
                              background: 'var(--theme-bg)',
                              color: 'var(--theme-ink)',
                              fontSize: 13,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <ImageUploader
                          value={editingProduct.imageUrl}
                          onChange={url => setEditingProduct({ ...editingProduct, imageUrl: url })}
                          lang={lang}
                          label={isEs ? 'Foto Principal' : 'Main Photo'}
                          gallery={editingProduct.gallery}
                          onGalleryChange={next =>
                            setEditingProduct({
                              ...editingProduct,
                              gallery: next,
                              imageUrl: next[0] ?? editingProduct.imageUrl,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, color: 'var(--theme-muted)', display: 'block', marginBottom: 6 }}>
                          {isEs ? 'Categorías' : 'Categories'}
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {CATEGORIES.map(cat => {
                            const on = editingProduct.categories.includes(cat.slug);
                            return (
                              <button
                                key={cat.slug}
                                type="button"
                                onClick={() =>
                                  setEditingProduct({
                                    ...editingProduct,
                                    categories: on
                                      ? editingProduct.categories.filter(s => s !== cat.slug)
                                      : [...editingProduct.categories, cat.slug],
                                  })
                                }
                                style={{
                                  padding: '6px 11px',
                                  borderRadius: 18,
                                  fontSize: 11,
                                  fontWeight: on ? 600 : 500,
                                  cursor: 'pointer',
                                  border: `1px solid ${on ? 'var(--monada-sage)' : 'var(--theme-line)'}`,
                                  background: on ? 'var(--monada-sage-soft)' : 'var(--theme-surface)',
                                  color: on ? 'var(--monada-sage)' : 'var(--theme-muted)',
                                }}
                              >
                                {isEs ? cat.es : cat.en}
                              </button>
                            );
                          })}
                        </div>
                        {editingProduct.categories.length === 0 && (
                          <div style={{ fontSize: 11, color: 'var(--monada-danger)', marginTop: 6, fontWeight: 600 }}>
                            {isEs ? 'Elige al menos una categoría.' : 'Pick at least one category.'}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button
                          type="submit"
                          style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: 10,
                            background: 'var(--monada-sage)',
                            color: '#FFFFFF',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            border: 'none',
                          }}
                        >
                          {isEs ? 'Guardar Cambios' : 'Save Changes'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(editingProduct.id)}
                          style={{
                            padding: '10px 16px',
                            borderRadius: 10,
                            background: 'rgba(214, 69, 69, 0.15)',
                            color: 'var(--monada-danger)',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            border: 'none',
                          }}
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Clean Inventory Table */}
                  <div style={{
                    background: 'var(--theme-surface)',
                    borderRadius: 16,
                    border: '1px solid var(--theme-line)',
                    overflow: 'hidden',
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--theme-line)', background: 'var(--theme-surface-soft)' }}>
                          <th style={{ padding: '12px 16px', color: 'var(--theme-muted)', fontWeight: 600 }}>Prenda</th>
                          <th style={{ padding: '12px 16px', color: 'var(--theme-muted)', fontWeight: 600 }}>Colección</th>
                          <th style={{ padding: '12px 16px', color: 'var(--theme-muted)', fontWeight: 600 }}>Tallas</th>
                          <th style={{ padding: '12px 16px', color: 'var(--theme-muted)', fontWeight: 600 }}>Precio</th>
                          <th style={{ padding: '12px 16px', color: 'var(--theme-muted)', fontWeight: 600, textAlign: 'right' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCatalog.map(p => (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--theme-line)' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <img src={p.imageUrl} alt="" style={{ width: 40, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                                <span style={{ fontWeight: 600, color: 'var(--theme-ink)' }}>{p.name}</span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--theme-muted)' }}>{p.series}</td>
                            <td style={{ padding: '12px 16px', color: 'var(--theme-muted)' }}>{p.sizes?.join(', ') || p.size}</td>
                            <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--monada-terracotta)' }}>
                              ${p.price.toFixed(2)} USD
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 8 }}>
                                <button
                                  onClick={() => setEditingProduct(p)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 8,
                                    background: 'var(--theme-surface-soft)',
                                    color: 'var(--theme-ink)',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    border: 'none',
                                  }}
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDeleteProduct(p.id)}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 8,
                                    background: 'transparent',
                                    color: 'var(--monada-danger)',
                                    cursor: 'pointer',
                                    border: 'none',
                                  }}
                                >
                                  <IconTrash size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: ADD NEW PRODUCT */}
              {activeTab === 'add_product' && (
                <form onSubmit={handleCreateProduct} style={{
                  maxWidth: 700,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  background: 'var(--theme-surface)',
                  padding: '24px',
                  borderRadius: 20,
                  border: '1px solid var(--theme-line)',
                }}>
                  <div>
                    <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 600 }}>
                      {isEs ? 'Publicar Nueva Prenda' : 'Add New Garment'}
                    </h2>
                    <span style={{ fontSize: 12, color: 'var(--theme-muted)' }}>
                      {isEs ? 'Se agregará inmediatamente a tu catálogo online.' : 'Will be immediately available to order.'}
                    </span>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      {isEs ? 'Nombre de la Prenda' : 'Piece Name'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="ej. Overshirt de Lino Francés"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--theme-line)',
                        background: 'var(--theme-bg)',
                        color: 'var(--theme-ink)',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        {isEs ? 'Precio en USD ($)' : 'Price in USD ($)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="85.00"
                        value={newPrice}
                        onChange={e => setNewPrice(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--theme-line)',
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 13,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        {isEs ? 'Colección / Serie' : 'Collection / Series'}
                      </label>
                      <input
                        type="text"
                        placeholder="ej. Minimalist Drop"
                        value={newSeries}
                        onChange={e => setNewSeries(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--theme-line)',
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 13,
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        {isEs ? 'Tallas (separadas por coma)' : 'Sizes (comma-separated)'}
                      </label>
                      <input
                        type="text"
                        placeholder="XS, S, M, L, XL"
                        value={newSizes}
                        onChange={e => setNewSizes(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--theme-line)',
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 13,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        {isEs ? 'Categorías' : 'Categories'}
                      </label>
                      <span style={{ fontSize: 11, color: 'var(--theme-muted)', display: 'block', marginBottom: 8, lineHeight: 1.5 }}>
                        {isEs
                          ? 'Elige todas las que apliquen. Una pijama de navidad puede ir en «Pijamas» y en «Pijamas de Navidad».'
                          : 'Pick every one that applies. A Christmas pyjama can sit in both “Pajamas” and “Christmas Pajamas”.'}
                      </span>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                        {CATEGORIES.map(cat => {
                          const on = newCategories.includes(cat.slug);
                          return (
                            <button
                              key={cat.slug}
                              type="button"
                              onClick={() =>
                                setNewCategories(prev =>
                                  prev.includes(cat.slug)
                                    ? prev.filter(s => s !== cat.slug)
                                    : [...prev, cat.slug]
                                )
                              }
                              style={{
                                padding: '7px 13px',
                                borderRadius: 20,
                                fontSize: 12,
                                fontWeight: on ? 600 : 500,
                                cursor: 'pointer',
                                border: `1px solid ${on ? 'var(--monada-sage)' : 'var(--theme-line)'}`,
                                background: on ? 'var(--monada-sage-soft)' : 'var(--theme-surface)',
                                color: on ? 'var(--monada-sage)' : 'var(--theme-muted)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                              }}
                            >
                              {on && <IconCheck size={11} />}
                              {isEs ? cat.es : cat.en}
                            </button>
                          );
                        })}
                      </div>

                      {newCategories.length === 0 && (
                        <div style={{ fontSize: 11, color: 'var(--monada-danger)', marginTop: 8, fontWeight: 600 }}>
                          {isEs
                            ? 'Elige al menos una categoría para que la prenda aparezca en el catálogo.'
                            : 'Pick at least one category so the piece shows up in the catalog.'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <ImageUploader
                      value={newImageUrl}
                      onChange={setNewImageUrl}
                      lang={lang}
                      label={isEs ? 'Fotos de la Prenda' : 'Product Photos'}
                      gallery={newGallery}
                      onGalleryChange={next => {
                        setNewGallery(next);
                        setNewImageUrl(next[0] ?? '');
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      {isEs ? 'Descripción y Textiles' : 'Description'}
                    </label>
                    <textarea
                      rows={3}
                      placeholder={isEs ? 'Textil premium con caída impecable...' : 'Premium fabric with tailored drape...'}
                      value={newDescription}
                      onChange={e => setNewDescription(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--theme-line)',
                        background: 'var(--theme-bg)',
                        color: 'var(--theme-ink)',
                        fontSize: 12,
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  {formError && (
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'rgba(220, 38, 38, 0.08)',
                      color: 'var(--monada-danger)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {formError}
                    </div>
                  )}

                  <button
                    type="submit"
                    style={{
                      height: 48,
                      borderRadius: 12,
                      background: 'var(--monada-sage)',
                      color: '#FFFFFF',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      border: 'none',
                    }}
                  >
                    <IconPlus size={18} />
                    <span>{isEs ? 'Publicar Prenda en el Catálogo' : 'Publish Piece to Catalog'}</span>
                  </button>
                </form>
              )}

              {/* TAB 4: SUPABASE & SQL SCHEMA CONFIGURATION */}
              {activeTab === 'supabase' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
                  <div>
                    <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, fontWeight: 600 }}>
                      Supabase Cloud Backend
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--theme-muted)', marginTop: 2 }}>
                      {isEs
                        ? 'Conecta tu proyecto de Supabase para almacenar el catálogo de prendas y los registros de pedidos en la nube.'
                        : 'Connect your Supabase project to persist products, orders, and configuration in the cloud.'}
                    </p>
                  </div>

                  {/* Connection Form */}
                  <form onSubmit={handleSaveSupabase} style={{
                    background: 'var(--theme-surface)',
                    padding: '24px',
                    borderRadius: 18,
                    border: '1px solid var(--theme-line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <IconDatabase size={16} />
                      <span>{isEs ? 'Credenciales de Conexión Supabase' : 'Supabase Project Credentials'}</span>
                    </h4>

                    <div>
                      <label style={{ fontSize: 11, color: 'var(--theme-muted)', display: 'block', marginBottom: 4 }}>
                        SUPABASE PROJECT URL (e.g. https://xyzcompany.supabase.co)
                      </label>
                      <input
                        type="url"
                        value={supabaseUrl}
                        onChange={e => setSupabaseUrl(e.target.value)}
                        placeholder="https://your-project.supabase.co"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--theme-line)',
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 13,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, color: 'var(--theme-muted)', display: 'block', marginBottom: 4 }}>
                        SUPABASE ANON KEY (public key)
                      </label>
                      <input
                        type="password"
                        value={supabaseKey}
                        onChange={e => setSupabaseKey(e.target.value)}
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--theme-line)',
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 13,
                        }}
                      />
                    </div>

                    {supabaseNotice && (
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'var(--monada-sage-soft)',
                        color: 'var(--monada-sage)',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                        <IconCheck size={16} />
                        {supabaseNotice}
                      </div>
                    )}

                    {connection.status !== 'idle' && (
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background:
                          connection.status === 'ok'
                            ? 'var(--monada-sage-soft)'
                            : connection.status === 'error'
                              ? 'rgba(220, 38, 38, 0.1)'
                              : 'var(--theme-surface-soft)',
                        color:
                          connection.status === 'ok'
                            ? 'var(--monada-sage)'
                            : connection.status === 'error'
                              ? 'var(--monada-danger)'
                              : 'var(--theme-muted)',
                      }}>
                        {connection.status === 'testing'
                          ? (isEs ? 'Probando conexión...' : 'Testing connection...')
                          : connection.message}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="submit"
                        style={{
                          padding: '11px 18px',
                          borderRadius: 10,
                          background: 'var(--monada-sage)',
                          color: '#FFFFFF',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                          border: 'none',
                        }}
                      >
                        {isEs ? 'Guardar y Verificar' : 'Save & Verify'}
                      </button>

                      <button
                        type="button"
                        onClick={handleTestConnection}
                        style={{
                          padding: '11px 18px',
                          borderRadius: 10,
                          background: 'var(--theme-surface-soft)',
                          color: 'var(--theme-ink)',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                          border: '1px solid var(--theme-line)',
                        }}
                      >
                        {isEs ? 'Probar Conexión' : 'Test Connection'}
                      </button>
                    </div>
                  </form>

                  {/* 1-Click SQL Schema Generator */}
                  <div style={{
                    background: 'var(--theme-surface)',
                    padding: '24px',
                    borderRadius: 18,
                    border: '1px solid var(--theme-line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <h4 style={{ fontSize: 14, fontWeight: 700 }}>
                          {isEs ? 'Esquema de Tablas SQL (Copiar y Pegar en Supabase)' : 'SQL Database Schema'}
                        </h4>
                        <span style={{ fontSize: 11, color: 'var(--theme-muted)' }}>
                          {isEs
                            ? 'Pega este código en el SQL Editor de tu panel de Supabase para crear las tablas automáticamente.'
                            : 'Paste this into your Supabase SQL Editor to automatically create your tables.'}
                        </span>
                      </div>

                      <button
                        onClick={handleCopySchema}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          background: copiedSchema ? 'var(--monada-sage)' : 'var(--theme-surface-soft)',
                          color: copiedSchema ? '#FFFFFF' : 'var(--theme-ink)',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          border: '1px solid var(--theme-line)',
                        }}
                      >
                        {copiedSchema ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        <span>{copiedSchema ? (isEs ? '¡Copiado!' : 'Copied!') : (isEs ? 'Copiar SQL' : 'Copy SQL')}</span>
                      </button>
                    </div>

                    <pre style={{
                      background: 'var(--theme-bg)',
                      border: '1px solid var(--theme-line)',
                      borderRadius: 12,
                      padding: '16px',
                      fontSize: 11,
                      fontFamily: 'monospace',
                      overflowX: 'auto',
                      maxHeight: 280,
                      color: 'var(--theme-ink)',
                    }}>
                      {SUPABASE_SQL_SCHEMA}
                    </pre>
                  </div>
                </div>
              )}

              {/* TAB 5: STORE & WHATSAPP SETTINGS */}
              {activeTab === 'settings' && (
                <form onSubmit={handleSaveSettings} style={{
                  maxWidth: 700,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  background: 'var(--theme-surface)',
                  padding: '24px',
                  borderRadius: 20,
                  border: '1px solid var(--theme-line)',
                }}>
                  <div>
                    <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 600 }}>
                      {isEs ? 'Ajustes de la Tienda' : 'Store Settings'}
                    </h2>
                    <span style={{ fontSize: 12, color: 'var(--theme-muted)' }}>
                      {isEs ? 'Configura el número de WhatsApp para recibir pedidos y redes sociales.' : 'Configure your business WhatsApp and social profiles.'}
                    </span>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      {isEs ? 'Nombre de la Tienda' : 'Store Name'}
                    </label>
                    <input
                      type="text"
                      value={storeName}
                      onChange={e => setStoreName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--theme-line)',
                        background: 'var(--theme-bg)',
                        color: 'var(--theme-ink)',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <IconWhatsApp size={16} style={{ color: 'var(--whatsapp-green)' }} />
                      <span>{isEs ? 'WhatsApp — número principal' : 'WhatsApp — primary number'}</span>
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={whatsapp}
                      onChange={e => setWhatsapp(e.target.value)}
                      placeholder="+58 412 123 4567"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: `1px solid ${waStatus.valid ? 'var(--theme-line)' : 'var(--monada-danger)'}`,
                        background: 'var(--theme-bg)',
                        color: 'var(--theme-ink)',
                        fontSize: 13,
                      }}
                    />
                    {waStatus.valid ? (
                      <div style={{
                        marginTop: 6,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--monada-sage-soft)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--monada-sage)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                        <IconCheck size={12} />
                        <span>
                          {isEs ? 'Los pedidos llegarán a ' : 'Orders will go to '}
                          <strong>{waStatus.pretty}</strong>
                        </span>
                      </div>
                    ) : (
                      <div style={{
                        marginTop: 6,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(220, 38, 38, 0.08)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--monada-danger)',
                      }}>
                        {waStatus.error}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <IconWhatsApp size={16} style={{ color: 'var(--whatsapp-green)' }} />
                      <span>{isEs ? 'WhatsApp — número secundario (opcional)' : 'WhatsApp — secondary number (optional)'}</span>
                    </label>

                    {missingTwoNumberColumns && (
                      <div style={{
                        marginBottom: 8,
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'rgba(220, 38, 38, 0.08)',
                        border: '1px solid rgba(220, 38, 38, 0.25)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--monada-danger)',
                        lineHeight: 1.5,
                      }}>
                        {isEs
                          ? 'La base de datos aún no tiene las columnas para este número, así que NO se guardará. Ve a la pestaña «Supabase & SQL», copia el SQL y ejecútalo en Supabase. Luego recarga esta página.'
                          : 'The database does not have the columns for this number yet, so it will NOT be saved. Open the "Supabase & SQL" tab, copy the SQL and run it in Supabase. Then reload this page.'}
                      </div>
                    )}
                    <input
                      type="tel"
                      inputMode="tel"
                      value={whatsapp2}
                      onChange={e => setWhatsapp2(e.target.value)}
                      disabled={missingTwoNumberColumns}
                      placeholder="+58 414 987 6543"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: `1px solid ${wa2Problem ? 'var(--monada-danger)' : 'var(--theme-line)'}`,
                        background: 'var(--theme-bg)',
                        color: 'var(--theme-ink)',
                        fontSize: 13,
                        opacity: missingTwoNumberColumns ? 0.5 : 1,
                        cursor: missingTwoNumberColumns ? 'not-allowed' : 'text',
                      }}
                    />
                    {wa2Problem ? (
                      <div style={{
                        marginTop: 6,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(220, 38, 38, 0.08)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--monada-danger)',
                      }}>
                        {wa2Status.error}
                      </div>
                    ) : wa2Active ? (
                      <div style={{
                        marginTop: 6,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--monada-sage-soft)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--monada-sage)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                        <IconCheck size={12} />
                        <span>
                          {isEs ? 'Los pedidos se repartirán también a ' : 'Orders will also be routed to '}
                          <strong>{wa2Status.pretty}</strong>
                        </span>
                      </div>
                    ) : (
                      <div style={{
                        marginTop: 6,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--theme-surface-soft)',
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--theme-muted)',
                      }}>
                        {isEs
                          ? 'Déjalo vacío si solo usas un número.'
                          : 'Leave empty if you only use one number.'}
                      </div>
                    )}
                  </div>

                  {wa2Active && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        {isEs ? 'Cómo se reparten los pedidos' : 'How orders are split'}
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {([
                          ['round_robin', isEs ? 'Turno alterno — cada pedido va a un número distinto' : 'Round robin — each order goes to a different number'],
                          ['alternate_daily', isEs ? 'Alternar por día — hoy un número, mañana el otro' : 'Alternate by day — one today, the other tomorrow'],
                          ['primary_only', isEs ? 'Solo el principal — el secundario no recibe pedidos' : 'Primary only — the secondary never receives orders'],
                        ] as const).map(([key, label]) => (
                          <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 12, color: 'var(--theme-ink)' }}>
                            <input
                              type="radio"
                              name="order-distribution"
                              checked={orderDistribution === key}
                              onChange={() => setOrderDistribution(key)}
                              style={{ marginTop: 2, accentColor: 'var(--monada-sage)' }}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <IconInstagram size={15} />
                        Instagram URL
                      </label>
                      <input
                        type="text"
                        value={instagram}
                        onChange={e => setInstagram(e.target.value)}
                        placeholder="@monadastore or full URL"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: `1px solid ${igStatus.valid ? 'var(--theme-line)' : 'var(--monada-danger)'}`,
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 12,
                        }}
                      />
                      <span style={{ fontSize: 10.5, marginTop: 4, display: 'block', color: igStatus.valid ? 'var(--theme-muted)' : 'var(--monada-danger)' }}>
                        {igStatus.valid
                          ? (igStatus.url
                              ? (isEs ? `Enlace: ${igStatus.url}` : `Link: ${igStatus.url}`)
                              : (isEs ? 'Déjalo vacío para ocultar el ícono.' : 'Leave empty to hide the icon.'))
                          : igStatus.error}
                      </span>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <IconTikTok size={15} />
                        TikTok URL
                      </label>
                      <input
                        type="text"
                        value={tiktok}
                        onChange={e => setTiktok(e.target.value)}
                        placeholder="@monadastore or full URL"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: `1px solid ${ttStatus.valid ? 'var(--theme-line)' : 'var(--monada-danger)'}`,
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 12,
                        }}
                      />
                      <span style={{ fontSize: 10.5, marginTop: 4, display: 'block', color: ttStatus.valid ? 'var(--theme-muted)' : 'var(--monada-danger)' }}>
                        {ttStatus.valid
                          ? (ttStatus.url
                              ? (isEs ? `Enlace: ${ttStatus.url}` : `Link: ${ttStatus.url}`)
                              : (isEs ? 'Déjalo vacío para ocultar el ícono.' : 'Leave empty to hide the icon.'))
                          : ttStatus.error}
                      </span>
                    </div>
                  </div>

                  {/* Currency & delivery pricing */}
                  <div style={{
                    paddingTop: 16,
                    borderTop: '1px solid var(--theme-line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}>
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
                        {isEs ? 'Precios y Tasa de Cambio' : 'Pricing & Exchange Rate'}
                      </h3>
                      <span style={{ fontSize: 11, color: 'var(--theme-muted)' }}>
                        {isEs
                          ? 'La tasa BCV convierte los precios en USD a bolívares en toda la tienda y en el mensaje de WhatsApp.'
                          : 'The BCV rate converts USD prices to bolívares across the storefront and in the WhatsApp message.'}
                      </span>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        {isEs ? 'Tasa BCV (Bs. por USD)' : 'BCV Rate (Bs. per USD)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={bcvRate}
                        onChange={e => setBcvRate(e.target.value)}
                        placeholder="911.62"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--theme-line)',
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 13,
                        }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--theme-muted)', marginTop: 4, display: 'block' }}>
                        {isEs
                          ? 'Se actualiza sola cada día con la tasa oficial del BCV, o puedes escribirla a mano.'
                          : 'Refreshes daily from the official BCV rate, or type your own.'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={handleRefreshBcv}
                          disabled={bcvBusy}
                          style={{
                            padding: '7px 14px',
                            borderRadius: 8,
                            border: '1px solid var(--theme-line)',
                            background: 'var(--theme-surface)',
                            color: 'var(--theme-ink)',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: bcvBusy ? 'wait' : 'pointer',
                            opacity: bcvBusy ? 0.6 : 1,
                          }}
                        >
                          {bcvBusy
                            ? (isEs ? 'Consultando…' : 'Fetching…')
                            : (isEs ? '↻ Usar tasa oficial de hoy' : '↻ Use today\'s official rate')}
                        </button>
                        {bcvNotice && (
                          <span style={{ fontSize: 11, color: 'var(--monada-sage)', fontWeight: 600 }}>
                            {bcvNotice}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--theme-muted)', marginTop: 6, display: 'block' }}>
                        {isEs ? 'Ejemplo: una prenda de $89 se muestra como Bs. ' : 'Example: an $89 piece shows as Bs. '}
                        {(89 * (parseFloat(bcvRate) || 0)).toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={showBsRate}
                        onChange={e => setShowBsRate(e.target.checked)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--monada-sage)' }}
                      />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        {isEs ? 'Mostrar precios en bolívares en la tienda' : 'Show bolívar prices on the storefront'}
                      </span>
                    </label>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        {isEs ? 'Umbral de envío gratis (USD)' : 'Free delivery threshold (USD)'}
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={freeDelivery}
                        onChange={e => setFreeDelivery(e.target.value)}
                        placeholder="100"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--theme-line)',
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 13,
                        }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--theme-muted)', marginTop: 4, display: 'block' }}>
                        {isEs
                          ? 'Los pedidos que superen este monto muestran envío gratis en la bolsa.'
                          : 'Orders above this amount show as free delivery in the bag.'}
                      </span>
                    </div>
                  </div>

                  {formError && (
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'rgba(220, 38, 38, 0.08)',
                      color: 'var(--monada-danger)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {formError}
                    </div>
                  )}

                  {settingsNotice && (
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'var(--monada-sage-soft)',
                      color: 'var(--monada-sage)',
                      fontSize: 12,
                      fontWeight: 600,
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}>
                      <IconCheck size={16} />
                      {settingsNotice}
                    </div>
                  )}

                  <button
                    type="submit"
                    style={{
                      height: 48,
                      borderRadius: 12,
                      background: 'var(--monada-sage)',
                      color: '#FFFFFF',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {isEs ? 'Guardar Cambios' : 'Save Settings'}
                  </button>
                </form>
              )}

              {/* TAB 6: SECURITY & PASSWORD */}
              {activeTab === 'security' && (
                <form onSubmit={handleChangePassword} style={{
                  maxWidth: 600,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  background: 'var(--theme-surface)',
                  padding: '24px',
                  borderRadius: 20,
                  border: '1px solid var(--theme-line)',
                }}>
                  <div>
                    <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 600 }}>
                      {isEs ? 'Seguridad y Clave Maestra' : 'Security & Master Key'}
                    </h2>
                    <span style={{ fontSize: 12, color: 'var(--theme-muted)' }}>
                      {isEs ? 'Cambia la clave requerida para ingresar a este panel de administración.' : 'Update your administrator master access key.'}
                    </span>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      {isEs ? 'Contraseña Actual' : 'Current Password'}
                    </label>
                    <input
                      type="password"
                      required
                      value={oldPwd}
                      onChange={e => setOldPwd(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--theme-line)',
                        background: 'var(--theme-bg)',
                        color: 'var(--theme-ink)',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        {isEs ? 'Nueva Contraseña' : 'New Password'}
                      </label>
                      <input
                        type="password"
                        required
                        value={newPwd}
                        onChange={e => setNewPwd(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--theme-line)',
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 13,
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        {isEs ? 'Confirmar Nueva Contraseña' : 'Confirm New Password'}
                      </label>
                      <input
                        type="password"
                        required
                        value={confirmPwd}
                        onChange={e => setConfirmPwd(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--theme-line)',
                          background: 'var(--theme-bg)',
                          color: 'var(--theme-ink)',
                          fontSize: 13,
                        }}
                      />
                    </div>
                  </div>

                  {securityNotice && (
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: securityNotice.error ? 'rgba(214, 69, 69, 0.15)' : 'var(--monada-sage-soft)',
                      color: securityNotice.error ? 'var(--monada-danger)' : 'var(--monada-sage)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {securityNotice.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    style={{
                      height: 46,
                      borderRadius: 12,
                      background: 'var(--monada-sage)',
                      color: '#FFFFFF',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {isEs ? 'Actualizar Clave' : 'Update Key'}
                  </button>
                </form>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
