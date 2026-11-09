import { Language } from '../i18n/translations';
import { buildWaLink } from '../lib/phone';

export default function FloatingWhatsApp({
  lang,
  whatsappNumber,
}: {
  lang: Language;
  whatsappNumber: string;
}) {
  const message = lang === 'es'
    ? '¡Hola Monada Store! 🛍️ Estoy viendo su catálogo web y quisiera hacerles una consulta.'
    : 'Hello Monada Store! 🛍️ I am browsing your web catalog and have a question.';

  const url = buildWaLink(whatsappNumber, message);

  // No usable number configured: hide the button rather than linking nowhere.
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 54,
        height: 54,
        borderRadius: '50%',
        background: '#25D366',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(37, 211, 102, 0.45)',
        zIndex: 999,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        textDecoration: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.1)';
        e.currentTarget.style.boxShadow = '0 12px 30px rgba(37, 211, 102, 0.6)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 211, 102, 0.45)';
      }}
      title={lang === 'es' ? 'Chatear por WhatsApp' : 'Chat on WhatsApp'}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm5.79 14.07c-.24.68-1.2 1.25-1.68 1.33-.46.07-1.04.1-1.68-.1-.4-.12-.92-.29-1.58-.58-2.77-1.2-4.58-4-4.72-4.19-.14-.19-1.13-1.5-1.13-2.86 0-1.36.71-2.03.96-2.31.25-.28.56-.35.74-.35.19 0 .37 0 .53.01.17.01.4.06.61.57.24.58.82 2 .89 2.15.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.32.38-.45.51-.15.15-.31.31-.13.62.18.31.79 1.3 1.7 2.11 1.17 1.04 2.15 1.36 2.46 1.51.31.15.49.13.67-.08.18-.21.78-.91.99-1.22.21-.31.42-.26.71-.15.29.11 1.84.87 2.15 1.03.31.16.52.24.59.37.07.12.07.72-.17 1.4z"/>
      </svg>
    </a>
  );
}
