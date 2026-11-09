/**
 * Product categories — the single source of truth.
 *
 * `slug` is what gets stored in the database (products.categories TEXT[]).
 * `es` / `en` are display labels. Storing slugs rather than display names
 * means switching language never breaks filtering, and renaming a label never
 * orphans existing products.
 *
 * Order here is the order shown on the storefront and in the admin panel.
 */

export interface Category {
  slug: string;
  es: string;
  en: string;
  /** Optional grouping, used to render the storefront filter row in sections. */
  group: 'clothing' | 'sleepwear' | 'kids' | 'home';
}

export const CATEGORIES: Category[] = [
  // --- Clothing ---
  { slug: 'camisas', es: 'Camisas', en: 'Shirts', group: 'clothing' },
  { slug: 'pantalones', es: 'Pantalones', en: 'Trousers', group: 'clothing' },
  { slug: 'faldas', es: 'Faldas', en: 'Skirts', group: 'clothing' },
  { slug: 'vestidos', es: 'Vestidos', en: 'Dresses', group: 'clothing' },
  {
    slug: 'pantaletas-medias',
    es: 'Pantaletas y Medias',
    en: 'Underwear & Socks',
    group: 'clothing',
  },

  // --- Sleepwear ---
  { slug: 'pijamas', es: 'Pijamas', en: 'Pajamas', group: 'sleepwear' },
  {
    slug: 'pijamas-navidad',
    es: 'Pijamas de Navidad',
    en: 'Christmas Pajamas',
    group: 'sleepwear',
  },

  // --- Kids & baby ---
  {
    slug: 'pijamas-ninos',
    es: 'Pijamas de Niños',
    en: 'Kids Pajamas',
    group: 'kids',
  },
  { slug: 'bebes', es: 'Sección de Bebés', en: 'Baby', group: 'kids' },

  // --- Home ---
  { slug: 'cobijas', es: 'Cobijas', en: 'Blankets', group: 'home' },
  { slug: 'sabanas', es: 'Sábanas', en: 'Bed Sheets', group: 'home' },
];

export const CATEGORY_SLUGS = CATEGORIES.map(c => c.slug);

const BY_SLUG = new Map(CATEGORIES.map(c => [c.slug, c]));

/** Display label for a stored slug, in the given language. */
export function categoryLabel(slug: string, lang: 'es' | 'en'): string {
  const found = BY_SLUG.get(slug);
  if (found) return lang === 'es' ? found.es : found.en;
  // Unknown slug (legacy data or a typo): show it rather than hiding the product.
  return slug;
}

export function isKnownCategory(slug: string): boolean {
  return BY_SLUG.has(slug);
}

/**
 * Legacy collection names from before categories existed. Products carrying
 * these still display, and the admin can re-tag them.
 */
export const LEGACY_CATEGORIES = ['Trending Now', 'Fresh Drops', 'Street Edit'];

/** Every slug a product carries that is not a real category. */
export function unknownCategories(categories: string[] | undefined): string[] {
  return (categories ?? []).filter(c => !isKnownCategory(c));
}

export const CATEGORY_GROUPS: { key: Category['group']; es: string; en: string }[] = [
  { key: 'clothing', es: 'Ropa', en: 'Clothing' },
  { key: 'sleepwear', es: 'Pijamas', en: 'Sleepwear' },
  { key: 'kids', es: 'Niños y Bebés', en: 'Kids & Baby' },
  { key: 'home', es: 'Hogar', en: 'Home' },
];
