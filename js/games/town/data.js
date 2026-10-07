// Pixel Town content: personalities, places, things residents say and do.

export const MAX_RESIDENTS = 8;
export const TICK_MS = 60 * 1000; // the town "thinks" once a minute
export const MAX_CATCHUP_TICKS = 40; // how much happens while the app is closed

export const PERSONALITIES = {
  cheerful: {
    name: 'Cheerful',
    social: 0.8,
    likes: ['park', 'cafe', 'beach'],
    lines: [
      'What a lovely day!',
      "Have you tried smiling? It's free!",
      'I made a friend today!',
      "Let's go on an adventure!",
      'Everything is sparkly today ✨',
    ],
  },
  calm: {
    name: 'Calm',
    social: 0.5,
    likes: ['cafe', 'home', 'beach'],
    lines: [
      'A cup of tea fixes most things.',
      'I like listening to the waves.',
      'No rush. No rush at all.',
      'I read three books this week.',
      'The clouds look like cats today.',
    ],
  },
  energetic: {
    name: 'Energetic',
    social: 0.7,
    likes: ['park', 'beach', 'shop'],
    lines: [
      'I ran around the town TWICE!',
      'Race you to the park!',
      'I could eat ten buns right now!',
      "Let's DANCE!",
      'I have SO much energy!!',
    ],
  },
  shy: {
    name: 'Shy',
    social: 0.3,
    likes: ['home', 'shop', 'cafe'],
    lines: [
      'Oh! H-hi...',
      "I'm happy you visited...",
      'I knitted a tiny hat.',
      'Is my hair okay?',
      'I like quiet places.',
    ],
  },
  quirky: {
    name: 'Quirky',
    social: 0.6,
    likes: ['beach', 'park', 'shop'],
    lines: [
      'Do fish have best friends?',
      'I named my sock Gerald.',
      'What if clouds are just sky sheep?',
      'I collect interesting pebbles.',
      'Today I will only walk sideways.',
    ],
  },
};
export const PERSONALITY_IDS = Object.keys(PERSONALITIES);

// Pairs that get along especially well (+) or tend to clash (-)
export function compatibility(a, b) {
  if (a === b) return 0.1;
  const k = [a, b].sort().join('+');
  return (
    {
      'calm+energetic': -0.08,
      'cheerful+shy': 0.05,
      'calm+shy': 0.06,
      'energetic+quirky': 0.05,
      'cheerful+quirky': 0.03,
      'energetic+shy': -0.05,
    }[k] || 0
  );
}

export const FOODS = [
  { id: 'cherry', name: 'Cherries', sprite: 'cherry', price: 4 },
  { id: 'bun', name: 'Bun', sprite: 'bun', price: 5 },
  { id: 'strawberry', name: 'Strawberry', sprite: 'strawberry', price: 6 },
  { id: 'croissant', name: 'Croissant', sprite: 'croissant', price: 8 },
  { id: 'latte', name: 'Latte', sprite: 'latte', price: 8 },
  { id: 'pudding', name: 'Pudding', sprite: 'pudding', price: 10 },
  { id: 'boba', name: 'Boba Tea', sprite: 'boba', price: 12 },
  { id: 'sundae', name: 'Sundae', sprite: 'sundae', price: 12 },
  { id: 'tart', name: 'Fruit Tart', sprite: 'tart', price: 14 },
  { id: 'omurice', name: 'Omurice', sprite: 'omurice', price: 15 },
  { id: 'pancakes', name: 'Pancakes', sprite: 'pancakes', price: 15 },
  { id: 'cake', name: 'Shortcake', sprite: 'cake', price: 20 },
];
export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));

// Where residents can be. x,y = the spot on the town map where they stand.
export const PLACES = {
  home: { name: 'home', x: 28, y: 66 },
  cafe: { name: 'the café', x: 98, y: 54 },
  park: { name: 'the park', x: 30, y: 100 },
  shop: { name: 'the shop', x: 98, y: 112 },
  beach: { name: 'the beach', x: 64, y: 136 },
};
export const CROSSROAD = { x: 64, y: 72 };

export const TOPICS = [
  'clouds',
  'their favourite snacks',
  'a funny dream',
  'the weather',
  'cute dogs',
  'a new song',
  'socks',
  'the stars',
  'bubble tea',
  'the best nap spots',
];
export const SILLY = [
  'whether a hot dog is a sandwich',
  'who ate the last bun',
  'the right way to fold socks',
  'pineapple on pizza',
  'which cloud looks like a cat',
];

export const RELATION_LABELS = [
  [-101, 'Rivals'],
  [-30, 'Not close'],
  [10, 'Friends'],
  [40, 'Good friends'],
  [70, 'Best friends'],
];
export function relationLabel(r) {
  if (!r || (!r.met && !r.status)) return 'Strangers';
  if (r.status === 'married') return 'Married 💍';
  if (r.status === 'dating') return 'Dating 💕';
  let label = 'Strangers';
  for (const [min, name] of RELATION_LABELS) if (r.a >= min) label = name;
  return label;
}

export const BORED_ACTIVITIES = [
  {
    label: 'Tell a joke',
    replies: ['Hahaha! Good one!', 'Pfft— that was so silly!', "I'm going to tell everyone that one!"],
  },
  { label: 'Play a game', replies: ['Yay! I won! ...I think?', 'Again! Again!', 'That was the best game ever!'] },
  { label: 'Sing a song', replies: ['La la la~ ♪', "You've got a lovely voice!", 'Let’s start a band!'] },
];

export const xpForLevel = (lv) => 40 + lv * 20;
