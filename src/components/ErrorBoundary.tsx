import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  lang?: 'es' | 'en';
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a single malformed product or a failed parse never
 * leaves the customer staring at a blank page. Offers a recovery path instead.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the console for debugging; never shown to the customer.
    console.error('[Monada] render error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    // Clearing the cached catalog is the usual fix for a corrupt local record.
    try {
      localStorage.removeItem('monada_custom_products');
      localStorage.removeItem('monada_store_config');
    } catch {
      /* storage may be unavailable; the reload below still helps */
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isEs = (this.props.lang ?? 'es') === 'es';

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#FAF8F5',
          color: '#171717',
          fontFamily: 'Poppins, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 460,
            width: '100%',
            background: '#FFFFFF',
            border: '1px solid #E7E3DC',
            borderRadius: 20,
            padding: '32px 28px',
            textAlign: 'center',
            boxShadow: '0 12px 40px rgba(0,0,0,0.06)',
          }}
        >
          <img
            src="/logo-transparent.png"
            alt="Monada Store"
            style={{ height: 40, objectFit: 'contain', margin: '0 auto 18px', display: 'block' }}
          />

          <h1
            style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 22,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {isEs ? 'Algo salió mal' : 'Something went wrong'}
          </h1>

          <p style={{ fontSize: 13, color: '#7E7E84', lineHeight: 1.6, marginBottom: 22 }}>
            {isEs
              ? 'La tienda encontró un problema al mostrar esta página. Puedes recargar o restablecer los datos guardados en este navegador.'
              : 'The store hit a problem showing this page. You can reload, or reset the data saved in this browser.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={this.handleReload}
              style={{
                height: 44,
                borderRadius: 12,
                background: '#758A77',
                color: '#FFFFFF',
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isEs ? 'Recargar la página' : 'Reload the page'}
            </button>

            <button
              onClick={this.handleReset}
              style={{
                height: 40,
                borderRadius: 12,
                background: 'transparent',
                color: '#7E7E84',
                border: '1px solid #E7E3DC',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {isEs ? 'Restablecer datos del navegador' : 'Reset browser data'}
            </button>
          </div>

          {import.meta.env.DEV && (
            <pre
              style={{
                marginTop: 20,
                padding: 12,
                background: '#FAF8F5',
                borderRadius: 10,
                fontSize: 10,
                textAlign: 'left',
                overflowX: 'auto',
                color: '#B45309',
              }}
            >
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
