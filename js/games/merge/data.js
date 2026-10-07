// Merge Kitchen content & balancing. Tweak numbers here to change how the game feels.

export const COLS = 7;
export const ROWS = 9;

export const ENERGY_MAX = 100;
export const ENERGY_REGEN_MS = 2 * 60 * 1000; // +1 energy every 2 minutes
export const REFILL_COST = 100; // coins to refill energy
export const LEVELUP_ENERGY = 10; // small energy gift on level up (no more full refills)

// Each chain has a generator (tap it to make level-1 items) and items that merge upward.
// `unlock` is the kitchen level that unlocks the generator.
export const CHAINS = {
  bakery: {
    colors: ['#e7ae6e', '#ffe08a', '#fbefd9', '#fffaf3'],
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
      { id: 'cake', name: 'Shortcake' },
    ],
  },
  dairy: {
    colors: ['#d3ecf7', '#fffaf3', '#f19bb0', '#86bfe0'],
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
    colors: ['#e8606f', '#f19bb0', '#b3de95', '#fad0d8'],
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
    colors: ['#ffe08a', '#f5b94a', '#fffaf3', '#e8606f'],
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
    colors: ['#aee0d1', '#6fb5a3', '#fad0d8', '#efd3a8'],
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

// Appliances combine ingredients from different generators into dishes.
// Drag ingredients onto an appliance; when a recipe is complete it cooks for `secs`.
export const APPLIANCES = {
  oven: { name: 'Oven', sprite: 'app_oven', unlock: 2, verb: 'Baking' },
  blender: { name: 'Blender', sprite: 'app_blender', unlock: 3, verb: 'Blending' },
  stove: { name: 'Stove', sprite: 'app_stove', unlock: 4, verb: 'Cooking' },
  teabar: { name: 'Tea Bar', sprite: 'app_teabar', unlock: 5, verb: 'Brewing' },
};
export const APP_IDS = Object.keys(APPLIANCES);
export const APP_HOME = { oven: [0, 3], blender: [0, 1], stove: [0, 5], teabar: [1, 3] };

// needs: [chain, level] ingredients
export const RECIPES = {
  butterbun: {
    name: 'Butter Bun',
    sprite: 'dish_butterbun',
    app: 'oven',
    secs: 20,
    needs: [
      ['bakery', 4],
      ['dairy', 2],
    ],
  },
  berrypie: {
    name: 'Berry Pie',
    sprite: 'dish_berrypie',
    app: 'oven',
    secs: 45,
    needs: [
      ['bakery', 3],
      ['fruit', 2],
    ],
  },
  cheesetoast: {
    name: 'Cheese Toast',
    sprite: 'dish_cheesetoast',
    app: 'oven',
    secs: 60,
    needs: [
      ['bakery', 5],
      ['dairy', 3],
    ],
  },
  strawmilk: {
    name: 'Strawberry Milk',
    sprite: 'dish_strawmilk',
    app: 'blender',
    secs: 20,
    needs: [
      ['dairy', 1],
      ['fruit', 2],
    ],
  },
  custard: {
    name: 'Egg Custard',
    sprite: 'dish_custard',
    app: 'blender',
    secs: 35,
    needs: [
      ['eggs', 1],
      ['dairy', 1],
      ['bakery', 2],
    ],
  },
  smoothie: {
    name: 'Berry Smoothie',
    sprite: 'dish_smoothie',
    app: 'blender',
    secs: 45,
    needs: [
      ['fruit', 3],
      ['dairy', 1],
      ['fruit', 1],
    ],
  },
  eggsandwich: {
    name: 'Egg Sandwich',
    sprite: 'dish_eggsandwich',
    app: 'stove',
    secs: 30,
    needs: [
      ['eggs', 2],
      ['bakery', 4],
    ],
  },
  cheesyomelette: {
    name: 'Cheesy Omelette',
    sprite: 'dish_cheesyomelette',
    app: 'stove',
    secs: 45,
    needs: [
      ['eggs', 3],
      ['dairy', 3],
    ],
  },
  berrypancakes: {
    name: 'Berry Pancakes',
    sprite: 'dish_berrypancakes',
    app: 'stove',
    secs: 75,
    needs: [
      ['eggs', 4],
      ['fruit', 3],
    ],
  },
  milktea: {
    name: 'Milk Tea',
    sprite: 'dish_milktea',
    app: 'teabar',
    secs: 25,
    needs: [
      ['drinks', 2],
      ['dairy', 1],
    ],
  },
  bobafloat: {
    name: 'Boba Float',
    sprite: 'dish_bobafloat',
    app: 'teabar',
    secs: 60,
    needs: [
      ['drinks', 4],
      ['dairy', 4],
    ],
  },
  teaset: {
    name: 'Tea Party',
    sprite: 'dish_teaset',
    app: 'teabar',
    secs: 90,
    needs: [
      ['drinks', 2],
      ['bakery', 6],
      ['fruit', 2],
    ],
  },
};
export const RECIPE_IDS = Object.keys(RECIPES);

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

// Dishes are worth more than their ingredients put together
export const dishValue = (d) => Math.round(RECIPES[d].needs.reduce((a, [, l]) => a + orderValue(l), 0) * 1.6);
export const dishXP = (d) => Math.round(RECIPES[d].needs.reduce((a, [, l]) => a + l * 2, 0) * 1.5);
