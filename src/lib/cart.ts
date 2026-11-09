import { ClothingCartItem, ClothingProduct } from '../types';

/**
 * A cart line is identified by product + size + colour, not by product alone.
 * The same garment in two sizes (or two colours) is two separate lines.
 */
export const cartLineKey = (
  productId: number,
  size: string,
  color?: string
): string => `${productId}::${size}::${color ?? ''}`;

export const itemLineKey = (item: ClothingCartItem): string =>
  cartLineKey(item.product.id, item.selectedSize, item.selectedColor);

/** Adds one unit of a product/size/colour, or increments the existing line. */
export function addLine(
  items: ClothingCartItem[],
  product: ClothingProduct,
  size?: string,
  color?: string
): ClothingCartItem[] {
  const chosenSize = size || product.sizes?.[0] || product.size;
  const chosenColor = color || product.colors?.[0]?.name;
  const key = cartLineKey(product.id, chosenSize, chosenColor);

  if (!items.some(item => itemLineKey(item) === key)) {
    return [
      ...items,
      {
        product,
        quantity: 1,
        selectedSize: chosenSize,
        selectedColor: chosenColor,
      },
    ];
  }
  return items.map(item =>
    itemLineKey(item) === key ? { ...item, quantity: item.quantity + 1 } : item
  );
}

/** Increments exactly one line. Other sizes/colours of the same product are untouched. */
export function increaseLine(
  items: ClothingCartItem[],
  key: string
): ClothingCartItem[] {
  return items.map(item =>
    itemLineKey(item) === key ? { ...item, quantity: item.quantity + 1 } : item
  );
}

/** Decrements one line, dropping it when it reaches zero. */
export function decreaseLine(
  items: ClothingCartItem[],
  key: string
): ClothingCartItem[] {
  const target = items.find(item => itemLineKey(item) === key);
  if (!target) return items;
  if (target.quantity === 1) return items.filter(item => itemLineKey(item) !== key);
  return items.map(item =>
    itemLineKey(item) === key ? { ...item, quantity: item.quantity - 1 } : item
  );
}

/** Removes exactly one line. Other sizes/colours of the same product survive. */
export function removeLine(
  items: ClothingCartItem[],
  key: string
): ClothingCartItem[] {
  return items.filter(item => itemLineKey(item) !== key);
}

export const cartCount = (items: ClothingCartItem[]): number =>
  items.reduce((total, item) => total + item.quantity, 0);

export const cartSubtotal = (items: ClothingCartItem[]): number =>
  items.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
