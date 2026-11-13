// Social profile URL handling.
//
// The owner types these by hand, and people write them every way imaginable:
// "@monada", "instagram.com/monada", "monada", or a full https URL. Storing
// whatever they typed produced broken links on the storefront, so normalise to
// one canonical https URL and reject anything that is not a real profile.
//
// An empty value is allowed: the storefront simply hides that icon.

export type SocialPlatform = 'instagram' | 'tiktok';

const HOSTS: Record<SocialPlatform, string> = {
  instagram: 'https://instagram.com',
  tiktok: 'https://tiktok.com',
};

export interface NormalizedSocial {
  /** Canonical https URL, or '' when the field was left blank. */
  url: string;
  /** True when the value is blank or a usable profile URL. */
  valid: boolean;
  /** Set when valid is false, explaining what is wrong. */
  error?: string;
}

/** Strip a leading @, any host the owner pasted, and stray slashes/queries. */
function extractHandle(raw: string): string {
  let value = raw.trim();
  if (!value) return '';

  const hadScheme = /^https?:\/\//i.test(value);
  value = value.replace(/^https?:\/\//i, '');
  value = value.replace(/^www\./i, '');

  // When the owner pasted a URL, the host must be the right one. Silently
  // dropping a foreign host produced a working link to the wrong place.
  const slash = value.indexOf('/');
  const possibleHost = (slash === -1 ? value : value.slice(0, slash)).toLowerCase();
  // Only a known profile host counts. A handle may legitimately contain dots
  // (`monada.store`), so a dot alone must not be mistaken for a hostname.
  const isKnownHost = /^(www\.)?(instagram\.com|instagr\.am|tiktok\.com)$/.test(
    possibleHost
  );
  const looksLikeForeignHost =
    !isKnownHost && /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(possibleHost);

  if (isKnownHost) {
    value = slash === -1 ? '' : value.slice(slash + 1);
  } else if (looksLikeForeignHost) {
    // A pasted link to some other site is not a profile link.
    return '';
  } else if (hadScheme) {
    return '';
  }

  value = value.replace(/^@+/, '');
  // Cut query strings, fragments and trailing slashes.
  value = value.split(/[?#]/)[0];
  value = value.replace(/\/+$/, '');
  return value.trim();
}

export function normalizeSocial(
  raw: string,
  platform: SocialPlatform
): NormalizedSocial {
  const input = (raw ?? '').trim();
  if (!input) return { url: '', valid: true };

  const handle = extractHandle(input);

  if (!handle) {
    return {
      url: '',
      valid: false,
      error: 'Enter your username or profile link.',
    };
  }

  // Instagram handles: letters, numbers, dot, underscore. TikTok allows the same.
  if (!/^[A-Za-z0-9._]{1,40}$/.test(handle)) {
    return {
      url: '',
      valid: false,
      error: 'That does not look like a username. Use letters, numbers, dots or underscores.',
    };
  }

  return { url: `${HOSTS[platform]}/${handle}`, valid: true };
}

/** True when a stored URL is a usable profile link (for the storefront). */
export function isUsableSocialUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  // No whitespace is allowed anywhere: a stored value like
  // "https://instagram.com/monada_store 1" is a paste accident that would
  // render a broken link on the storefront.
  return /^https:\/\/(www\.)?(instagram\.com|instagr\.am|tiktok\.com)\/[@A-Za-z0-9._-]{1,40}$/.test(
    url.trim()
  );
}
