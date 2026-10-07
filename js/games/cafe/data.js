// Cozy Café content & balancing.

// The room: a back wall plus a floor grid of 8 x 6 tiles (16px each, front view).
export const COLS = 8;
export const ROWS = 6;
export const WALL_H = 40; // pixels of back wall above the floor
export const TILE = 16;
export const DOOR_COL = 0; // the door is on the back wall above this column

// machine: which appliance makes it. servings x price = what a full batch earns.
export const RECIPES = [
  {
    id: 'tea',
    name: 'Cup of Tea',
    sprite: 'teacup',
    machine: 'drinks',
    level: 1,
    cost: 3,
    secs: 20,
    servings: 5,
    price: 2,
    xp: 2,
  },
  {
    id: 'bun',
    name: 'Butter Bun',
    sprite: 'bun',
    machine: 'oven',
    level: 1,
    cost: 5,
    secs: 30,
    servings: 6,
    price: 2,
    xp: 3,
  },
  {
    id: 'toast',
    name: 'Toast',
    sprite: 'toast',
    machine: 'oven',
    level: 1,
    cost: 8,
    secs: 60,
    servings: 8,
    price: 2,
    xp: 4,
  },
  {
    id: 'latte',
    name: 'Latte',
    sprite: 'latte',
    machine: 'drinks',
    level: 2,
    cost: 10,
    secs: 120,
    servings: 6,
    price: 4,
    xp: 6,
  },
  {
    id: 'croissant',
    name: 'Croissant',
    sprite: 'croissant',
    machine: 'oven',
    level: 2,
    cost: 15,
    secs: 180,
    servings: 8,
    price: 4,
    xp: 8,
  },
  {
    id: 'strawmilk',
    name: 'Strawberry Milk',
    sprite: 'dish_strawmilk',
    machine: 'drinks',
    level: 3,
    cost: 18,
    secs: 300,
    servings: 8,
    price: 5,
    xp: 10,
  },
  {
    id: 'pie',
    name: 'Berry Pie',
    sprite: 'dish_berrypie',
    machine: 'oven',
    level: 3,
    cost: 25,
    secs: 600,
    servings: 10,
    price: 6,
    xp: 14,
  },
  {
    id: 'cheesetoast',
    name: 'Cheese Toast',
    sprite: 'dish_cheesetoast',
    machine: 'oven',
    level: 4,
    cost: 30,
    secs: 900,
    servings: 10,
    price: 7,
    xp: 18,
  },
  {
    id: 'milktea',
    name: 'Milk Tea',
    sprite: 'dish_milktea',
    machine: 'drinks',
    level: 4,
    cost: 30,
    secs: 900,
    servings: 10,
    price: 7,
    xp: 18,
  },
  {
    id: 'cake',
    name: 'Shortcake',
    sprite: 'cake',
    machine: 'oven',
    level: 5,
    cost: 60,
    secs: 1800,
    servings: 12,
    price: 11,
    xp: 30,
  },
  {
    id: 'boba',
    name: 'Boba Tea',
    sprite: 'boba',
    machine: 'drinks',
    level: 6,
    cost: 70,
    secs: 2700,
    servings: 12,
    price: 12,
    xp: 36,
  },
  {
    id: 'pancakes',
    name: 'Berry Pancakes',
    sprite: 'dish_berrypancakes',
    machine: 'oven',
    level: 7,
    cost: 90,
    secs: 3600,
    servings: 14,
    price: 13,
    xp: 45,
  },
  {
    id: 'teaset',
    name: 'Tea Party Set',
    sprite: 'dish_teaset',
    machine: 'drinks',
    level: 8,
    cost: 150,
    secs: 7200,
    servings: 16,
    price: 18,
    xp: 70,
  },
];
export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

// kind: 'floor' items sit on a tile, 'wall' items hang on the back wall.
// role: what it does. charm makes more customers come and tip more.
export const ITEMS = [
  { id: 'oven', name: 'Oven', sprite: 'app_oven', kind: 'floor', role: 'oven', price: 120, charm: 0, level: 1 },
  {
    id: 'espresso',
    name: 'Drinks Bar',
    sprite: 'c_espresso',
    kind: 'floor',
    role: 'drinks',
    price: 120,
    charm: 0,
    level: 1,
  },
  {
    id: 'display',
    name: 'Display Case',
    sprite: 'c_display',
    kind: 'floor',
    role: 'display',
    price: 80,
    charm: 1,
    level: 1,
  },
  {
    id: 'register',
    name: 'Register',
    sprite: 'c_register',
    kind: 'floor',
    role: 'register',
    price: 0,
    charm: 0,
    level: 99,
  },
  { id: 'table', name: 'Table', sprite: 'c_table', kind: 'floor', role: 'decor', price: 30, charm: 3, level: 1 },
  { id: 'chair', name: 'Chair', sprite: 'c_chair', kind: 'floor', role: 'seat', price: 20, charm: 2, level: 1 },
  { id: 'plant', name: 'Potted Bush', sprite: 'c_plant', kind: 'floor', role: 'decor', price: 25, charm: 3, level: 1 },
  { id: 'fern', name: 'Fern', sprite: 'c_fern', kind: 'floor', role: 'decor', price: 25, charm: 3, level: 2 },
  { id: 'rug', name: 'Rug', sprite: 'c_rug', kind: 'floor', role: 'decor', price: 35, charm: 4, level: 2 },
  { id: 'lamp', name: 'Floor Lamp', sprite: 'c_lamp', kind: 'floor', role: 'decor', price: 45, charm: 5, level: 3 },
  {
    id: 'cakestand',
    name: 'Cake Stand',
    sprite: 'c_cakestand',
    kind: 'floor',
    role: 'decor',
    price: 60,
    charm: 6,
    level: 3,
  },
  { id: 'sofa', name: 'Sofa', sprite: 'c_sofa', kind: 'floor', role: 'seat', price: 90, charm: 8, level: 4 },
  {
    id: 'bookshelf',
    name: 'Bookshelf',
    sprite: 'c_bookshelf',
    kind: 'floor',
    role: 'decor',
    price: 110,
    charm: 10,
    level: 5,
  },
  { id: 'piano', name: 'Piano', sprite: 'c_piano', kind: 'floor', role: 'decor', price: 250, charm: 18, level: 7 },
  { id: 'window', name: 'Window', sprite: 'w_window', kind: 'wall', role: 'decor', price: 40, charm: 4, level: 1 },
  { id: 'frame', name: 'Painting', sprite: 'w_frame', kind: 'wall', role: 'decor', price: 30, charm: 3, level: 1 },
  { id: 'clock', name: 'Clock', sprite: 'w_clock', kind: 'wall', role: 'decor', price: 30, charm: 3, level: 2 },
  { id: 'shelf', name: 'Jar Shelf', sprite: 'w_shelf', kind: 'wall', role: 'decor', price: 45, charm: 5, level: 3 },
  {
    id: 'hangplant',
    name: 'Hanging Plant',
    sprite: 'w_hangplant',
    kind: 'wall',
    role: 'decor',
    price: 45,
    charm: 5,
    level: 3,
  },
  { id: 'garland', name: 'Garland', sprite: 'w_garland', kind: 'wall', role: 'decor', price: 60, charm: 6, level: 4 },
  { id: 'menuboard', name: 'Menu Board', sprite: 'w_menu', kind: 'wall', role: 'decor', price: 70, charm: 7, level: 5 },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// Wallpaper & floor styles: [base, pattern] colours
export const WALLS = [
  { id: 'pink', name: 'Rose', price: 0, level: 1, colors: ['#f7c9cf', '#fde8ea'] },
  { id: 'mint', name: 'Mint', price: 80, level: 2, colors: ['#c9ebdf', '#eaf8f2'] },
  { id: 'cream', name: 'Butter', price: 80, level: 3, colors: ['#f7e7c4', '#fdf6e6'] },
  { id: 'lav', name: 'Lilac', price: 120, level: 4, colors: ['#ddd0f2', '#f2ecfb'] },
  { id: 'sky', name: 'Sky', price: 120, level: 5, colors: ['#cfe6f5', '#eef7fc'] },
];
export const FLOORS = [
  { id: 'wood', name: 'Oak', price: 0, level: 1, colors: ['#c9a7a5', '#b99593'] },
  { id: 'honey', name: 'Honey', price: 80, level: 2, colors: ['#e2bc8c', '#d4a979'] },
  { id: 'check', name: 'Checker', price: 120, level: 3, colors: ['#fbefd9', '#e8b8c1'] },
  { id: 'mint', name: 'Mint Tile', price: 150, level: 5, colors: ['#d6efe6', '#b9e0d2'] },
];

// The café you start with. Positions are [col, row] on the floor grid; wall items use a column.
export const STARTER = {
  floor: [
    ['oven', 5, 0],
    ['espresso', 6, 0],
    ['display', 3, 1],
    ['display', 4, 1],
    ['register', 6, 1],
    ['table', 2, 4],
    ['chair', 1, 4],
    ['chair', 3, 4],
    ['plant', 7, 5],
  ],
  wall: [
    ['window', 2],
    ['frame', 5],
  ],
};

export const xpForLevel = (lv) => 20 + lv * 25;

// Customers: one arrives every `spawnSecs` (less with more charm), while there's food to buy.
export const spawnSecs = (charm) => Math.max(3.5, 10 - charm * 0.08);
export const OFFLINE_RATE = 0.4; // fraction of the usual customers while the app is closed
export const MAX_OFFLINE_HOURS = 8;
export const TIP_CHANCE = (charm) => Math.min(0.6, 0.1 + charm * 0.006);
