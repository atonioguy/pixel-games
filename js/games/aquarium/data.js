// Fishy Tank content & balancing. Tweak numbers here to change how the game feels.

// rarity: 1 common, 2 uncommon, 3 rare, 4 legendary
// likes: the decoration that attracts this fish. Rare (3+) fish only visit if it's in the tank.
// zone: where it likes to swim. income: coins per hour when perfectly happy.
export const SPECIES = [
  { id: 'goldfish', sprite: 'f_goldfish', name: 'Goldfish', rarity: 1, likes: 'seaweed', zone: 'mid', speed: 0.35 },
  { id: 'guppy', sprite: 'f_guppy', name: 'Guppy', rarity: 1, likes: 'coral', zone: 'top', speed: 0.45 },
  { id: 'tetra', sprite: 'f_tetra', name: 'Neon Tetra', rarity: 1, likes: 'rock', zone: 'mid', speed: 0.55 },
  { id: 'clown', sprite: 'f_clown', name: 'Clownfish', rarity: 2, likes: 'shell', zone: 'mid', speed: 0.4 },
  { id: 'angel', sprite: 'f_angel', name: 'Lemon Angel', rarity: 2, likes: 'castle', zone: 'mid', speed: 0.3 },
  { id: 'puffer', sprite: 'f_puffer', name: 'Pufferfish', rarity: 2, likes: 'chest', zone: 'mid', speed: 0.2 },
  { id: 'betta', sprite: 'f_betta', name: 'Ruby Betta', rarity: 2, likes: 'lantern', zone: 'top', speed: 0.3 },
  { id: 'seahorse', sprite: 'f_seahorse', name: 'Seahorse', rarity: 3, likes: 'seaweed', zone: 'mid', speed: 0.12 },
  { id: 'jelly', sprite: 'f_jelly', name: 'Moon Jelly', rarity: 3, likes: 'lantern', zone: 'drift', speed: 0.15 },
  { id: 'axolotl', sprite: 'f_axolotl', name: 'Axolotl', rarity: 3, likes: 'mushroom', zone: 'bottom', speed: 0.18 },
  { id: 'koi', sprite: 'f_koi', name: 'Royal Koi', rarity: 4, likes: 'castle', zone: 'mid', speed: 0.3 },
  { id: 'whale', sprite: 'f_whale', name: 'Lucky Whale', rarity: 4, likes: 'diver', zone: 'top', speed: 0.22 },
];
export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export const RARITY = {
  1: { name: 'Common', weight: 10, adopt: 20, gift: 4, income: 6 },
  2: { name: 'Uncommon', weight: 4, adopt: 60, gift: 8, income: 12 },
  3: { name: 'Rare', weight: 1.6, adopt: 150, gift: 15, income: 24 },
  4: { name: 'Legendary', weight: 0.6, adopt: 400, gift: 30, income: 50 },
};

export const DECOR = [
  { id: 'seaweed', sprite: 'd_seaweed', name: 'Seaweed', price: 0 },
  { id: 'coral', sprite: 'd_coral', name: 'Pink Coral', price: 40 },
  { id: 'rock', sprite: 'd_rock', name: 'Rock Arch', price: 60 },
  { id: 'shell', sprite: 'd_shell', name: 'Scallop', price: 60 },
  { id: 'chest', sprite: 'd_chest', name: 'Treasure Chest', price: 120 },
  { id: 'lantern', sprite: 'd_lantern', name: 'Stone Lantern', price: 150 },
  { id: 'mushroom', sprite: 'd_mushroom', name: 'Toadstool', price: 150 },
  { id: 'castle', sprite: 'd_castle', name: 'Castle', price: 200 },
  { id: 'diver', sprite: 'd_diver', name: 'Diver Helmet', price: 250 },
];
export const DECOR_BY_ID = Object.fromEntries(DECOR.map((d) => [d.id, d]));
export const DECOR_SLOTS = 5;

// Tank upgrades: capacity -> price to reach it
export const TANK_SIZES = [
  { cap: 6, price: 0 },
  { cap: 8, price: 200 },
  { cap: 10, price: 500 },
  { cap: 12, price: 1000 },
];

export const HUNGER_PER_HOUR = 10; // full -> empty in 10 hours
export const DIRT_PER_HOUR = 1 / 24; // fully dirty after a day
export const LOVE_DECAY_PER_HOUR = 5;
export const FLAKE_FOOD = 10;
export const FLAKE_DIRT = 0.012; // uneaten food makes the tank dirtier
export const MAX_SPOTS = 36; // dirt specks on the glass when fully dirty

export const VISIT_CHECK_MIN = 10; // roll for a visitor every 10 minutes
export const VISIT_CHANCE = 0.35;
export const MAX_VISITORS = 2;
export const VISIT_STAY_MIN = [60, 180]; // visitors stay 1-3 hours

export const COIN_BUBBLE = 5; // coins per bubble
export const MAX_BUBBLES = 8;

export const NAMES = [
  'Bubbles',
  'Mochi',
  'Pebble',
  'Sushi',
  'Biscuit',
  'Peach',
  'Noodle',
  'Tofu',
  'Sprout',
  'Pudding',
  'Waffles',
  'Bean',
  'Dumpling',
  'Kiwi',
  'Marble',
  'Pip',
  'Sunny',
  'Coco',
  'Jellybean',
  'Nori',
  'Miso',
  'Taro',
  'Boba',
  'Lulu',
  'Fig',
  'Clover',
  'Button',
  'Maple',
  'Puddle',
  'Wiggles',
];
