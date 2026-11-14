import type { ClothingProduct } from '../types';

/**
 * A catalog change, either an explicit new list or a function of the current one.
 */
export type ProductsUpdate =
  | ((current: ClothingProduct[]) => ClothingProduct[])
  | ClothingProduct[];

/**
 * Resolves a catalog change against the latest known products.
 *
 * The admin form used to build the new list from its `products` prop, which is
 * only as fresh as the last render. Two saves close together (add a piece, then
 * edit another) therefore started from the same stale snapshot and the first
 * change was silently dropped. Resolving against the newest list fixes that.
 */
export function resolveProductsUpdate(
  current: ClothingProduct[],
  update: ProductsUpdate
): ClothingProduct[] {
  return typeof update === 'function' ? update(current) : update;
}

/**
 * Returns the catalog with `product` inserted or replaced by id.
 * Used by the admin add/edit flows instead of spreading a captured list.
 */
export function upsertProduct(
  current: ClothingProduct[],
  product: ClothingProduct
): ClothingProduct[] {
  const exists = current.some(p => p.id === product.id);
  if (!exists) return [product, ...current];
  return current.map(p => (p.id === product.id ? product : p));
}
