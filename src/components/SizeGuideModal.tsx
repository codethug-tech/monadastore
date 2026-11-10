import { useState } from 'react';
import { Language } from '../i18n/translations';
import { IconClose, IconInfo } from './Icons';

interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export default function SizeGuideModal({ isOpen, onClose, lang }: SizeGuideModalProps) {
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');

  if (!isOpen) return null;

  const isEs = lang === 'es';

  const sizesData = [
    { size: 'XS', chestCm: '86-91', chestIn: '34-36', lengthCm: '67', lengthIn: '26.4', waistCm: '71-76', waistIn: '28-30' },
    { size: 'S',  chestCm: '91-96', chestIn: '36-38', lengthCm: '69', lengthIn: '27.2', waistCm: '76-81', waistIn: '30-32' },
    { size: 'M',  chestCm: '96-101', chestIn: '38-40', lengthCm: '71', lengthIn: '28.0', waistCm: '81-86', waistIn: '32-34' },
    { size: 'L',  chestCm: '101-106', chestIn: '40-42', lengthCm: '73', lengthIn: '28.7', waistCm: '86-91', waistIn: '34-36' },
    { size: 'XL', chestCm: '106-112', chestIn: '42-44', lengthCm: '75', lengthIn: '29.5', waistCm: '91-97', waistIn: '36-38' },
  ];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(23, 23, 23, 0.7)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10001,
      padding: 16,
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        background: '#FAF8F5',
        borderRadius: 22,
        width: '100%',
        maxWidth: 520,
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        border: '1px solid #E7E3DC',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E7E3DC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 20,
              fontWeight: 600,
              color: '#171717',
            }}>
              {isEs ? 'Guía de Tallas Monada' : 'Monada Size Guide'}
            </h3>
            <span style={{ fontSize: 11, color: '#7E7E84' }}>
              {isEs ? 'Corte relajado y contemporáneo' : 'Relaxed contemporary silhouette'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Unit toggle */}
            <div style={{
              display: 'flex',
              background: '#FFFFFF',
              borderRadius: 14,
              padding: 2,
              border: '1px solid #E7E3DC',
            }}>
              <button
                onClick={() => setUnit('cm')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  background: unit === 'cm' ? 'var(--monada-sage)' : 'transparent',
                  color: unit === 'cm' ? '#FFFFFF' : '#7E7E84',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                CM
              </button>
              <button
                onClick={() => setUnit('in')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  background: unit === 'in' ? 'var(--monada-sage)' : 'transparent',
                  color: unit === 'in' ? '#FFFFFF' : '#7E7E84',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                IN
              </button>
            </div>

            <button
              onClick={onClose}
              style={{
                background: '#F1ECE5',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#171717',
              }}
            >
              <IconClose size={15} />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ padding: '20px 24px' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: 13,
          }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #E7E3DC' }}>
                <th style={{ padding: '10px 8px', color: '#171717', fontWeight: 600 }}>
                  {isEs ? 'Talla' : 'Size'}
                </th>
                <th style={{ padding: '10px 8px', color: '#7E7E84', fontWeight: 500 }}>
                  {isEs ? 'Pecho' : 'Chest'} ({unit})
                </th>
                <th style={{ padding: '10px 8px', color: '#7E7E84', fontWeight: 500 }}>
                  {isEs ? 'Largo' : 'Length'} ({unit})
                </th>
                <th style={{ padding: '10px 8px', color: '#7E7E84', fontWeight: 500 }}>
                  {isEs ? 'Cintura' : 'Waist'} ({unit})
                </th>
              </tr>
            </thead>
            <tbody>
              {sizesData.map((row, idx) => (
                <tr
                  key={row.size}
                  style={{
                    borderBottom: '1px solid #F1ECE5',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.6)',
                  }}
                >
                  <td style={{ padding: '12px 8px', fontWeight: 700, color: '#171717' }}>
                    {row.size}
                  </td>
                  <td style={{ padding: '12px 8px', color: '#52525B' }}>
                    {unit === 'cm' ? row.chestCm : row.chestIn}
                  </td>
                  <td style={{ padding: '12px 8px', color: '#52525B' }}>
                    {unit === 'cm' ? row.lengthCm : row.lengthIn}
                  </td>
                  <td style={{ padding: '12px 8px', color: '#52525B' }}>
                    {unit === 'cm' ? row.waistCm : row.waistIn}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{
            marginTop: 18,
            padding: '12px 16px',
            borderRadius: 12,
            background: '#FFFFFF',
            border: '1px solid #E7E3DC',
            fontSize: 12,
            color: '#7E7E84',
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}>
            <IconInfo size={14} style={{ color: 'var(--monada-sage)', flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong style={{ color: '#171717' }}>{isEs ? 'Consejo de ajuste:' : 'Fit tip:'}</strong>{' '}
              {isEs
                ? 'Nuestras piezas tienen un corte contemporáneo relajado. Si prefieres un ajuste más entallado, te sugerimos pedir una talla menor.'
                : 'Our pieces feature a relaxed contemporary drape. If you prefer a tailored fit, we recommend ordering one size down.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

