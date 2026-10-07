# Cozy Arcade

A cozy pixel-art collection of mini games, made to be installed on an iPhone home screen.

## Games

| Game | Status |
| --- | --- |
| **Merge Kitchen**: merge ingredients into dishes and serve cute customers | Playable |
| **Fishy Tank**: collect fish and decorate your aquarium | Coming soon |
| **Cozy Café**: run and decorate your own café | Coming soon |
| **Beat Battle**: rhythm game, tap the arrows to the music | Coming soon |
| **Pixel Town**: make little people and watch them live together | Coming soon |

Coins are shared across all games.

### Merge Kitchen: how to play

- Tap a generator (the items with a ⚡ badge) to make ingredients. Each tap uses 1 energy, and energy refills over time.
- Drag two identical items together to merge them into the next item in the chain.
- Fill the customers' orders at the top for coins and XP. Items that a customer wants show a little heart.
- Level up to unlock new generators: Fruit Crate (Lv 2), Hen (Lv 3), Teapot (Lv 4).
- Tap an item to see its recipe chain or sell it.

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
sw.js                 offline support
tools/                sprite preview sheet + icon generator (node)
```

Run locally with any static server, e.g. `npx http-server .`, then open http://localhost:8080.

Preview all sprites: `node tools/sheet.mjs sheet.png`. Regenerate icons: `node tools/make-icons.mjs`.

Font: [Jersey 10](https://fonts.google.com/specimen/Jersey+10) (SIL Open Font License, see `assets/fonts/OFL.txt`).
