# Cozy Arcade

A cozy pixel-art collection of mini games, made to be installed on an iPhone home screen.

## Games

| Game | Status |
| --- | --- |
| **Merge Kitchen**: merge ingredients into dishes and serve cute customers | Playable |
| **Fishy Tank**: collect fish and decorate your aquarium | Playable |
| **Cozy Café**: run and decorate your own café | Playable |
| **Beat Battle**: rhythm game, tap the arrows to the music | Playable |
| **Pixel Town**: make little people and watch them live together | Coming soon |

Coins are shared across all games.

### Merge Kitchen: how to play

- Tap a generator (the items with a ⚡ badge) to make ingredients. Each tap uses 1 energy, and energy refills over time.
- Drag two identical items together to merge them into the next item in the chain.
- Fill the customers' orders at the top for coins and XP. Items that a customer wants show a little heart.
- Level up to unlock new generators: Fruit Crate (Lv 2), Hen (Lv 3), Teapot (Lv 4).
- Tap an item to see its recipe chain or sell it.
- Appliances (Oven Lv 2, Blender Lv 3, Stove Lv 4, Tea Bar Lv 5) combine ingredients from different generators. Drag ingredients onto one; when a recipe is complete it cooks for a bit, then tap it to collect the dish. Customers pay extra for dishes. Tap an appliance and then **Recipes** to see what it makes.
- Energy: 100 max, +1 every 2 minutes. Leveling up gives +10 energy, and a full refill costs 100 coins.

### Fishy Tank: how to play

- **Feed**: tap Feed, then tap the water to sprinkle food. Uneaten food makes the tank dirty.
- **Clean**: tap Clean, then rub the glass with your finger to wipe off the gunk.
- **Pet**: tap a fish to give it some love. Happy fish make coin bubbles. Tap a bubble to pop them all.
- **Visitors**: new fish drop by over time, even while the app is closed. Tap a sparkly visitor to say hi (it leaves a gift), or adopt it into your tank.
- **Decor**: decorations make fish happier, and each fish species likes one. Rare fish only visit when their favourite decoration is in the tank. You can also upgrade the tank to hold more fish.
- **Fishdex**: tracks the 12 species you've discovered.

### Cozy Café: how to play

- Tap the **oven** or the **drinks bar** to make something (it costs a few coins for ingredients). It cooks on a real-time timer.
- When it's done, tap it to put the food in a **display case**. Customers walk in, buy it, and sometimes sit down to eat.
- Money goes into the **register**. Tap it (or **Collect**) to take the coins.
- **Decorate**: buy furniture in the Shop, then tap a free green tile to place it. Tap furniture to Move or Store it. **Styles** changes the wallpaper and floor. Decorations add **charm** (the heart), which brings more customers and tips.
- Level up to unlock new recipes, furniture and styles. Customers still come (a bit less often) while the app is closed.

### Beat Battle: how to play

- Pick a song and a difficulty. The opponent sings a phrase first (its notes show as faint ghost arrows), then it's **your turn** to copy it.
- Tap a lane when its arrow reaches the outlines at the bottom. Keep holding on long notes.
- Good timing fills the health bar and misses drain it. Finish a song to unlock the next one and earn coins.
- If your taps feel early or late, use **Tap timing** on the song list to calibrate. Bluetooth headphones add delay, so calibrate with the ones you use.
- All the music is original and generated in the app.

## Install on iPhone

1. Open the game's web address in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**.
3. Open it from the home screen icon. It runs full-screen, works offline, and keeps your save.

## Project layout

Plain HTML/CSS/JavaScript, with no build step and no dependencies.

```
index.html            app entry
css/style.css         all styles
js/main.js            menu + switching between games
js/state.js           save data & shared coins (localStorage)
js/pixel.js           pixel-art renderer (auto outlines)
js/sprites.js         all sprite art as text grids
js/audio.js           chiptune sound effects (Web Audio)
js/ui.js              toasts, dialogs, flying coins
js/games/merge/       Merge Kitchen (data.js holds the balancing numbers)
js/games/aquarium/    Fishy Tank (data.js holds species, decor and timings)
js/games/cafe/        Cozy Café (data.js holds recipes, furniture and styles)
js/games/rhythm/      Beat Battle (music.js generates the songs, charts and synth voices)
js/haptics.js         vibration ticks (Android + iOS 18 Safari)
sw.js                 offline support
tools/                sprite preview sheet + icon generator (node)
```

Run locally with any static server, e.g. `npx http-server .`, then open http://localhost:8080.

Preview all sprites: `node tools/sheet.mjs sheet.png`. Regenerate icons: `node tools/make-icons.mjs`.

Font: [Jersey 10](https://fonts.google.com/specimen/Jersey+10) (SIL Open Font License, see `assets/fonts/OFL.txt`).
