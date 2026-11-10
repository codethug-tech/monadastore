import { useCallback, useRef, useState } from 'react';
import {
  processImageFile,
  ImageError,
  MAX_SOURCE_BYTES,
} from '../lib/image';
import { uploadProductImage, readSupabaseConfig } from '../services/supabase';
import { IconPlus, IconTrash, IconRefresh, IconCheck } from './Icons';

export interface ImageUploaderProps {
  /** Current image source: a stored URL, or a data URL when offline. */
  value: string;
  onChange: (next: string) => void;
  lang: 'es' | 'en';
  label?: string;
  /** Extra images (gallery). Omitted when the form only needs one photo. */
  gallery?: string[];
  onGalleryChange?: (next: string[]) => void;
  /** Called when a previously stored image is replaced, so it can be cleaned up. */
  onImageReplaced?: (previousUrl: string) => void;
}

type Status = 'idle' | 'processing' | 'uploading' | 'done' | 'error';

export default function ImageUploader({
  value,
  onChange,
  lang,
  label,
  gallery,
  onGalleryChange,
  onImageReplaced,
}: ImageUploaderProps) {
  const isEs = lang === 'es';
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [showUrlField, setShowUrlField] = useState(false);

  const storageReady = readSupabaseConfig().isConnected;

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      setError('');
      setNotice('');

      const targets = gallery && onGalleryChange ? list : list.slice(0, 1);
      const uploaded: string[] = [];

      for (const file of targets) {
        try {
          setStatus('processing');
          const processed = await processImageFile(file);

          let url = processed.dataUrl;
          if (storageReady) {
            setStatus('uploading');
            const publicUrl = await uploadProductImage(
              processed.blob,
              processed.fileName,
              processed.contentType
            );
            if (publicUrl) {
              url = publicUrl;
            } else {
              setNotice(
                isEs
                  ? 'Subida a Supabase falló. La foto se guardó localmente.'
                  : 'Supabase upload failed. The photo was saved locally.'
              );
            }
          }

          uploaded.push(url);
          setStatus('done');
        } catch (err) {
          setStatus('error');
          setError(
            err instanceof ImageError
              ? err.message
              : isEs
                ? 'No se pudo procesar esa imagen.'
                : 'That image could not be processed.'
          );
          break;
        }
      }

      if (uploaded.length > 0) {
        if (gallery && onGalleryChange) {
          // One upload sets both the gallery and the main photo, so the two can
          // never drift apart (imageUrl must always be gallery[0]).
          const nextGallery = [...gallery, ...uploaded];
          onGalleryChange(nextGallery);
          if (value !== nextGallery[0]) {
            if (value && onImageReplaced) onImageReplaced(value);
            onChange(nextGallery[0]);
          }
        } else {
          if (value && onImageReplaced) onImageReplaced(value);
          onChange(uploaded[0]);
        }
      }

      if (inputRef.current) inputRef.current.value = '';
    },
    [gallery, onGalleryChange, onChange, onImageReplaced, storageReady, value, isEs]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  const removeGalleryImage = (url: string) => {
    if (!gallery || !onGalleryChange) return;
    onGalleryChange(gallery.filter(g => g !== url));
    if (onImageReplaced) onImageReplaced(url);
  };

  /** Moves a photo one slot earlier or later, which changes the catalog cover. */
  const moveGalleryImage = (index: number, delta: number) => {
    if (!gallery || !onGalleryChange) return;
    const target = index + delta;
    if (target < 0 || target >= gallery.length) return;
    const next = [...gallery];
    [next[index], next[target]] = [next[target], next[index]];
    onGalleryChange(next);
    // Keep the main photo in step with the new cover.
    if (index === 0 || target === 0) onChange(next[0]);
  };

  const applyManualUrl = () => {
    const trimmed = manualUrl.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('data:image/')) {
      setError(isEs ? 'La URL debe empezar con http:// o https://' : 'The URL must start with http:// or https://');
      return;
    }
    setError('');
    if (value && onImageReplaced) onImageReplaced(value);
    onChange(trimmed);
    setManualUrl('');
    setShowUrlField(false);
    setStatus('done');
  };

  const busy = status === 'processing' || status === 'uploading';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
        {label ?? (isEs ? 'Foto de la Prenda' : 'Product Photo')}
      </label>

      {/* Drop zone / preview */}
      {value ? (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <img
              src={value}
              alt=""
              style={{
                width: 132,
                height: 160,
                objectFit: 'cover',
                borderRadius: 12,
                border: '1px solid var(--theme-line)',
                background: 'var(--theme-surface-soft)',
                display: 'block',
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (onImageReplaced) onImageReplaced(value);
                onChange('');
                setStatus('idle');
              }}
              title={isEs ? 'Quitar foto' : 'Remove photo'}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.62)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconTrash size={13} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 180 }}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              style={{
                padding: '9px 14px',
                borderRadius: 10,
                background: 'var(--theme-surface-soft)',
                color: 'var(--theme-ink)',
                border: '1px solid var(--theme-line)',
                fontSize: 12,
                fontWeight: 600,
                cursor: busy ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                width: 'fit-content',
              }}
            >
              <IconRefresh size={13} />
              {isEs ? 'Cambiar foto' : 'Change photo'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--theme-muted)', lineHeight: 1.5 }}>
              {isEs
                ? 'JPG, PNG, WebP o AVIF. Se optimiza automáticamente.'
                : 'JPG, PNG, WebP or AVIF. Optimised automatically.'}
            </span>
            {!storageReady && (
              <span style={{ fontSize: 11, color: 'var(--monada-terracotta)', lineHeight: 1.5 }}>
                {isEs
                  ? 'Sin Supabase: la foto se guarda en este navegador.'
                  : 'No Supabase: the photo is stored in this browser only.'}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div
          onDragOver={e => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--monada-sage)' : 'var(--theme-line)'}`,
            background: dragging ? 'var(--monada-sage-soft)' : 'var(--theme-bg)',
            borderRadius: 14,
            padding: '28px 20px',
            textAlign: 'center',
            cursor: busy ? 'wait' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <IconPlus size={22} style={{ color: 'var(--monada-sage)', marginBottom: 8 }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
            {busy
              ? status === 'processing'
                ? (isEs ? 'Optimizando imagen...' : 'Optimising image...')
                : (isEs ? 'Subiendo...' : 'Uploading...')
              : (isEs ? 'Arrastra tu foto aquí o haz clic' : 'Drag your photo here or click')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--theme-muted)' }}>
            {isEs
              ? `JPG, PNG, WebP o AVIF · máximo ${MAX_SOURCE_BYTES / 1024 / 1024} MB`
              : `JPG, PNG, WebP or AVIF · up to ${MAX_SOURCE_BYTES / 1024 / 1024} MB`}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple={Boolean(gallery && onGalleryChange)}
        onChange={e => {
          if (e.target.files?.length) void handleFiles(e.target.files);
        }}
        style={{ display: 'none' }}
      />

      {/* Status */}
      {status === 'done' && !error && (
        <div style={{ fontSize: 11, color: 'var(--monada-sage)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconCheck size={12} />
          {isEs ? 'Foto lista' : 'Photo ready'}
        </div>
      )}
      {notice && (
        <div style={{ fontSize: 11, color: 'var(--monada-terracotta)', fontWeight: 600 }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--monada-danger)', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Gallery strip */}
      {gallery && onGalleryChange && gallery.length > 0 && (
        <div style={{ marginTop: 2 }}>
          <div style={{ fontSize: 11, color: 'var(--theme-muted)', marginBottom: 6, lineHeight: 1.5 }}>
            {isEs
              ? 'La primera foto es la portada del catálogo. Usa ‹ › para reordenar.'
              : 'The first photo is the catalog cover. Use ‹ › to reorder.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {gallery.map((url, i) => (
              <div key={`${url}-${i}`} style={{ position: 'relative' }}>
                <img
                  src={url}
                  alt=""
                  style={{
                    width: 56,
                    height: 68,
                    objectFit: 'cover',
                    borderRadius: 8,
                    border: i === 0 ? '2px solid var(--monada-sage)' : '1px solid var(--theme-line)',
                    display: 'block',
                  }}
                />

                {/* Cover marker */}
                {i === 0 && (
                  <span style={{
                    position: 'absolute',
                    bottom: -4,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--monada-sage)',
                    color: '#fff',
                    fontSize: 8,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 10,
                    whiteSpace: 'nowrap',
                  }}>
                    {isEs ? 'PORTADA' : 'COVER'}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => removeGalleryImage(url)}
                  title={isEs ? 'Quitar' : 'Remove'}
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -5,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'var(--monada-danger)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 10,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ×
                </button>

                {/* Reorder controls */}
                {gallery.length > 1 && (
                  <div style={{
                    position: 'absolute',
                    bottom: -4,
                    right: -5,
                    display: 'flex',
                    gap: 2,
                  }}>
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => moveGalleryImage(i, -1)}
                      title={isEs ? 'Mover antes' : 'Move earlier'}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        border: '1px solid var(--theme-line)',
                        background: 'var(--theme-surface)',
                        color: 'var(--theme-ink)',
                        cursor: i === 0 ? 'not-allowed' : 'pointer',
                        opacity: i === 0 ? 0.35 : 1,
                        fontSize: 9,
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={i === gallery.length - 1}
                      onClick={() => moveGalleryImage(i, 1)}
                      title={isEs ? 'Mover después' : 'Move later'}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        border: '1px solid var(--theme-line)',
                        background: 'var(--theme-surface)',
                        color: 'var(--theme-ink)',
                        cursor: i === gallery.length - 1 ? 'not-allowed' : 'pointer',
                        opacity: i === gallery.length - 1 ? 0.35 : 1,
                        fontSize: 9,
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optional manual URL, for people who already host images elsewhere */}
      <div>
        {!showUrlField ? (
          <button
            type="button"
            onClick={() => setShowUrlField(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--theme-muted)',
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {isEs ? 'O pega una URL de imagen' : 'Or paste an image URL'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="url"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              placeholder="https://..."
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--theme-line)',
                background: 'var(--theme-bg)',
                color: 'var(--theme-ink)',
                fontSize: 12,
              }}
            />
            <button
              type="button"
              onClick={applyManualUrl}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background: 'var(--monada-sage)',
                color: '#fff',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isEs ? 'Usar' : 'Use'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
