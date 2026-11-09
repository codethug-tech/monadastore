export interface ClothingProduct {
  id: number;
  name: string;
  series: string;
  price: number;
  size: string;
  sizes: string[];
  colors: { name: string; hex: string }[];
  description: string;
  imageUrl: string;
  gallery: string[];
  categories: string[];
  isFavorite: boolean;
  rating?: number;
  reviewCount?: number;
  reviews?: ProductReview[];
}

export interface ProductReview {
  id: string;
  author: string;
  rating: number;
  date: string;
  title: string;
  comment: string;
  verified: boolean;
  fit: 'True to size' | 'Runs small' | 'Runs large';
}

export interface ClothingCartItem {
  product: ClothingProduct;
  quantity: number;
  selectedSize: string;
  selectedColor?: string;
}
