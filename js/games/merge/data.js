// Merge Kitchen content & balancing. Tweak numbers here to change how the game feels.

export const COLS = 7;
export const ROWS = 9;

export const ENERGY_MAX = 40;
export const ENERGY_REGEN_MS = 30 * 1000; // +1 energy every 30 seconds
export const REFILL_COST = 30; // coins to refill energy

// Each chain has a generator (tap it to make level-1 items) and items that merge upward.
// `unlock` is the kitchen level that unlocks the generator.
export const CHAINS = {
  bakery: {
    name: 'Bakery',
    gen: 'gen_bakery',
    genName: 'Bread Basket',
    unlock: 1,
    items: [
      { id: 'wheat', name: 'Wheat' },
      { id: 'flour', name: 'Flour' },
      { id: 'dough', name: 'Dough' },
      { id: 'bun', name: 'Bun' },
      { id: 'toast', name: 'Toast' },
      { id: 'croissant', name: 'Croissant' },
      { id: 'cake', name: 'Strawberry Cake' },
    ],
  },
  dairy: {
    name: 'Dairy',
    gen: 'gen_dairy',
    genName: 'Mini Fridge',
    unlock: 1,
    items: [
      { id: 'milk', name: 'Milk' },
      { id: 'butter', name: 'Butter' },
      { id: 'cheese', name: 'Cheese' },
      { id: 'pudding', name: 'Pudding' },
      { id: 'sundae', name: 'Sundae' },
    ],
  },
  fruit: {
    name: 'Fruit',
    gen: 'gen_fruit',
    genName: 'Fruit Crate',
    unlock: 2,
    items: [
      { id: 'cherry', name: 'Cherries' },
      { id: 'strawberry', name: 'Strawberry' },
      { id: 'berrybowl', name: 'Berry Bowl' },
      { id: 'jam', name: 'Berry Jam' },
      { id: 'tart', name: 'Fruit Tart' },
    ],
  },
  eggs: {
    name: 'Eggs',
    gen: 'gen_eggs',
    genName: 'Hen',
    unlock: 3,
    items: [
      { id: 'egg', name: 'Egg' },
      { id: 'friedegg', name: 'Fried Egg' },
      { id: 'omelette', name: 'Omelette' },
      { id: 'pancakes', name: 'Pancakes' },
      { id: 'omurice', name: 'Omurice' },
    ],
  },
  drinks: {
    name: 'Drinks',
    gen: 'gen_drinks',
    genName: 'Teapot',
    unlock: 4,
    items: [
      { id: 'tealeaf', name: 'Tea Leaf' },
      { id: 'teacup', name: 'Cup of Tea' },
      { id: 'latte', name: 'Latte' },
      { id: 'boba', name: 'Boba Tea' },
      { id: 'float', name: 'Cream Soda' },
    ],
  },
};

export const CHAIN_IDS = Object.keys(CHAINS);

// Where each generator likes to sit on the board: [row, col]
export const GEN_HOME = {
  bakery: [8, 1],
  dairy: [8, 5],
  fruit: [8, 3],
  eggs: [7, 2],
  drinks: [7, 4],
};

// A few items to start with: [cellIndex, chain, level]
export const STARTER = [
  [23, 'bakery', 1],
  [25, 'bakery', 1],
  [37, 'dairy', 1],
  [39, 'dairy', 1],
];

export const CUSTOMERS = [
  { sprite: 'cust_cat', name: 'Mochi' },
  { sprite: 'cust_bunny', name: 'Bun Bun' },
  { sprite: 'cust_bear', name: 'Honey' },
  { sprite: 'cust_frog', name: 'Pip' },
];

// XP needed to go from `level` to `level + 1`
export const xpForLevel = (level) => 20 + level * 15;

// Coins an order pays for one item of this level
export const orderValue = (level) => 3 * 2 ** (level - 1);

// Coins for selling an item
export const sellValue = (level) => Math.max(1, Math.round(orderValue(level) / 4));
