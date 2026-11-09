// Regression test for the cart line-keying bug.
// Run: npm test
import assert from 'node:assert/strict';
import { ClothingProduct } from '../src/types';
import {
  addLine,
  increaseLine,
  decreaseLine,
  removeLine,
  itemLineKey,
  cartCount,
  cartSubtotal,
} from '../src/lib/cart';

const shirt: ClothingProduct = {
  id: 1,
  name: 'Aesthetic Linen Overshirt',
  series: 'Vintage Minimal Capsule',
  price: 89,
  size: 'L',
  sizes: ['S', 'M', 'L', 'XL'],
  colors: [
    { name: 'Oatmeal', hex: '#E4DFD5' },
    { name: 'Sage', hex: '#8F9E8B' },
  ],
  description: '',
  imageUrl: 'x',
  gallery: [],
  categories: [],
  isFavorite: false,
};

let pass = 0;
const check = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ok  ${label}`);
};

console.log('\nCart line keying');

check('same product, different sizes are two lines', () => {
  let cart = addLine([], shirt, 'L', 'Oatmeal');
  cart = addLine(cart, shirt, 'M', 'Oatmeal');
  assert.equal(cart.length, 2);
  assert.deepEqual(cart.map(i => i.selectedSize), ['L', 'M']);
});

check('same product+size+colour increments instead of duplicating', () => {
  let cart = addLine([], shirt, 'L', 'Oatmeal');
  cart = addLine(cart, shirt, 'L', 'Oatmeal');
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 2);
});

check('same product+size, different colour is a separate line', () => {
  let cart = addLine([], shirt, 'L', 'Oatmeal');
  cart = addLine(cart, shirt, 'L', 'Sage');
  assert.equal(cart.length, 2);
});

check('increase hits only the targeted size (the original bug)', () => {
  let cart = addLine([], shirt, 'L', 'Oatmeal');
  cart = addLine(cart, shirt, 'M', 'Oatmeal');
  const mLine = cart.find(i => i.selectedSize === 'M')!;
  cart = increaseLine(cart, itemLineKey(mLine));
  assert.equal(cart.find(i => i.selectedSize === 'M')!.quantity, 2);
  assert.equal(cart.find(i => i.selectedSize === 'L')!.quantity, 1, 'L must stay at 1');
});

check('decrease hits only the targeted size', () => {
  let cart = addLine([], shirt, 'L', 'Oatmeal');
  cart = addLine(cart, shirt, 'M', 'Oatmeal');
  const mLine = cart.find(i => i.selectedSize === 'M')!;
  cart = decreaseLine(cart, itemLineKey(mLine));
  assert.equal(cart.length, 1, 'M line removed at quantity 1');
  assert.equal(cart[0].selectedSize, 'L');
  assert.equal(cart[0].quantity, 1);
});

check('decrease below zero drops only that line', () => {
  let cart = addLine([], shirt, 'L', 'Oatmeal');
  cart = addLine(cart, shirt, 'L', 'Oatmeal');
  cart = addLine(cart, shirt, 'M', 'Oatmeal');
  const lLine = cart.find(i => i.selectedSize === 'L')!;
  cart = decreaseLine(cart, itemLineKey(lLine));
  assert.equal(cart.find(i => i.selectedSize === 'L')!.quantity, 1);
  cart = decreaseLine(cart, itemLineKey(cart.find(i => i.selectedSize === 'L')!));
  assert.equal(cart.filter(i => i.selectedSize === 'L').length, 0);
  assert.equal(cart.filter(i => i.selectedSize === 'M').length, 1, 'M survives');
});

check('remove deletes one size, not every size of the product', () => {
  let cart = addLine([], shirt, 'L', 'Oatmeal');
  cart = addLine(cart, shirt, 'M', 'Oatmeal');
  cart = addLine(cart, shirt, 'S', 'Sage');
  const lLine = cart.find(i => i.selectedSize === 'L')!;
  cart = removeLine(cart, itemLineKey(lLine));
  assert.equal(cart.length, 2);
  assert.deepEqual(cart.map(i => i.selectedSize).sort(), ['M', 'S']);
});

check('counts and subtotal stay correct across lines', () => {
  let cart = addLine([], shirt, 'L', 'Oatmeal');
  cart = addLine(cart, shirt, 'L', 'Oatmeal');
  cart = addLine(cart, shirt, 'M', 'Oatmeal');
  assert.equal(cartCount(cart), 3);
  assert.equal(cartSubtotal(cart), 267);
});

console.log(`\n${pass} assertions passed\n`);
